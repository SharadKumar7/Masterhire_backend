import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import Application from "../models/applicationJob.js";
import Negotiation from "../models/negotiation.js";
import Job from "../models/Jobs.js";
import Message from "../models/message.js";
import HiredContract from "../models/HiredContract.js";
import { createNotification } from "./notificationController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Multer config ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads/messages/")),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|pdf|doc|docx|zip|txt/;
    const ext  = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext || mime);
  },
});

// ─── Helper ───────────────────────────────────────────────────────────────────
const getFileInfo = (file) => {
  if (!file) return {};
  const mime = file.mimetype;
  const fileType = mime.startsWith("image/") ? "image"
    : mime.startsWith("video/") ? "video"
    : "document";
  return {
    fileUrl:  `/uploads/messages/${file.filename}`,
    fileName: file.originalname,
    fileType,
    fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
  };
};


// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/job-details/:jobId
// ═══════════════════════════════════════════════════════════════════════════════
export const getProjectDetails = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { userId, role } = req.user;

    let job;
    if (role === "client") {
      job = await Job.findOne({ _id: jobId, clientId: userId })
        .select("_id title description budget deadline skills status assignedFreelancer")
        .populate("assignedFreelancer", "name email profileImage");
    } else if (role === "freelancer") {
      job = await Job.findOne({ _id: jobId })
        .select("_id title description budget deadline skills status");
    }

    if (!job) return res.status(404).json({ message: "Job not found or unauthorized" });
    res.status(200).json({ job });
  } catch (error) {
    console.error("getProjectDetails error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/jobs/:jobId
// ═══════════════════════════════════════════════════════════════════════════════
export const deleteJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const clientId  = req.user.userId;

    const job = await Job.findOne({ _id: jobId, clientId });
    if (!job) return res.status(404).json({ message: "Job not found or unauthorized" });

    const appCount = await Application.countDocuments({
      job: new mongoose.Types.ObjectId(jobId),
    });
    if (appCount > 0) {
      return res.status(400).json({
        message: "Cannot delete job — applications already received.",
        totalApplications: appCount,
      });
    }

    await Job.findByIdAndDelete(jobId);
    res.status(200).json({ message: "Job deleted successfully" });
  } catch (error) {
    console.error("deleteJob error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/client/job-applications/:jobId
// ═══════════════════════════════════════════════════════════════════════════════
export const getClientJobApplications = async (req, res) => {
  try {
    const { jobId }  = req.params;
    const clientId   = req.user.userId;

    const job = await Job.findOne({ _id: jobId, clientId });
    if (!job) return res.status(404).json({ message: "Job not found or unauthorized" });

    const result = await Application.aggregate([
      { $match: { job: new mongoose.Types.ObjectId(jobId) } },
      {
        $lookup: {
          from: "users", localField: "user", foreignField: "_id", as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $group: {
          _id: null,
          totalApplications: { $sum: 1 },
          pending:     { $sum: { $cond: [{ $eq: ["$status", "pending"] },     1, 0] } },
          accepted:    { $sum: { $cond: [{ $eq: ["$status", "accepted"] },    1, 0] } },
          rejected:    { $sum: { $cond: [{ $eq: ["$status", "rejected"] },    1, 0] } },
          negotiation: { $sum: { $cond: [{ $eq: ["$status", "negotiation"] }, 1, 0] } },
          applications: {
            $push: {
              _id:       "$_id",
              proposal:  "$proposal",
              bidAmount: "$bidAmount",
              status:    "$status",
              createdAt: "$createdAt",
              user: {
                _id:          "$user._id",
                name: {
                  $trim: {
                    input: {
                      $concat: [
                        { $ifNull: ["$user.firstName", ""] },
                        " ",
                        { $ifNull: ["$user.lastName", ""] },
                      ],
                    },
                  },
                },
                email:        "$user.email",
                profileImage: "$user.profileImage",
                skills:       "$user.skills",
              },
            },
          },
        },
      },
    ]);

    const data = result[0] || {
      totalApplications: 0,
      pending: 0, accepted: 0, rejected: 0, negotiation: 0,
      applications: [],
    };

    res.status(200).json({
      totalApplications: data.totalApplications,
      jobStatus: job.status,
      statusCounts: {
        pending:     data.pending,
        accepted:    data.accepted,
        rejected:    data.rejected,
        negotiation: data.negotiation,
      },
      applications: data.applications,
    });
  } catch (error) {
    console.error("getClientJobApplications error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/client/:applicationId/status
// Usable by BOTH the client (owner of the job) and the freelancer (owner of
// the application). Freelancer is restricted to status: "accepted" only;
// reject/negotiate stay client-only.
// ═══════════════════════════════════════════════════════════════════════════════
export const updateApplicationStatus = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status, bidAmount } = req.body;
    const { userId, role } = req.user;
    console.log("updateApplicationStatus called with:", { applicationId, status, bidAmount, userId, role });

    const validStatuses = ["accepted", "rejected", "negotiation"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const application = await Application.findById(applicationId).populate("job");
    if (!application) return res.status(404).json({ message: "Application not found" });

    // ── Authorization: client (job owner) OR freelancer (applicant) ──────────
    const isClient     = role === "client" && application.job.clientId.toString() === userId.toString();
    const isFreelancer = role === "freelancer" && application.user.toString() === userId.toString();

    if (!isClient && !isFreelancer) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Freelancer can only ACCEPT via this route — reject/negotiate stay client-only
    if (isFreelancer && status !== "accepted") {
      return res.status(403).json({ message: "Only the client can reject or negotiate an application" });
    }

    const jobId        = application.job._id;
    const freelancerId = application.user;
    const clientId      = application.job.clientId;
    const jobTitle      = application.job.title;

    // ── ACCEPTED → Hire freelancer (either side can trigger it now) ──────────
    if (status === "accepted") {
      application.status = "accepted";
      await application.save();

      // ✅ FIX: `returnDocument: "after"` is not a valid Mongoose option (it's
      // the raw MongoDB driver's option name) and the result was previously
      // discarded entirely. Now uses the correct `new: true` and captures the
      // contract so its _id can be linked onto the Job.
      const contract = await HiredContract.findOneAndUpdate(
        { client: clientId, freelancer: freelancerId, jobTitle },
        { client: clientId, freelancer: freelancerId, jobTitle, status: "active", finalAmount: application.bidAmount },
        { upsert: true, new: true }
      );

      await Job.findByIdAndUpdate(jobId, {
        status:             "assigned",
        assignedFreelancer: freelancerId,
        isPublic:           false,
        hiredContract:      contract._id, // ✅ NEW — direct link, replaces fragile title-matching lookups
      });

      await Application.updateMany(
        { job: jobId, _id: { $ne: applicationId }, status: { $in: ["pending", "negotiation"] } },
        { $set: { status: "rejected" } }
      );

      // Notify whichever side did NOT trigger the accept
      if (isFreelancer) {
        await createNotification({
          userId:      clientId,
          type:        "JOB_ASSIGNED",
          title:       "Freelancer Accepted Your Offer",
          message:     `The freelancer accepted your offer for "${jobTitle}". The job is now assigned.`,
          referenceId: jobId,
        });
      } else {
        await createNotification({
          userId:      freelancerId,
          type:        "JOB_ASSIGNED",
          title:       "🎉 You've been hired!",
          message:     `Congratulations! You have been selected for "${jobTitle}".`,
          referenceId: jobId,
        });
      }

      return res.status(200).json({
        message: "Application accepted. Job assigned and other applications rejected.",
        application: {
          _id:       application._id,
          status:    application.status,
          bidAmount: application.bidAmount,
        },
      });
    }

    // ── REJECTED — client only (unchanged) ────────────────────────────────────
    if (status === "rejected") {
      application.status = "rejected";
      await application.save();

      await createNotification({
        userId:      freelancerId,
        type:        "JOB_APPLIED",
        title:       "Application Not Selected",
        message:     `Your application for "${jobTitle}" was not selected this time.`,
        referenceId: jobId,
      });

      return res.status(200).json({
        message: "Application rejected successfully",
        application: {
          _id:       application._id,
          status:    application.status,
          bidAmount: application.bidAmount,
        },
      });
    }

    // ── NEGOTIATION — client only (unchanged) ─────────────────────────────────
    application.status = status;
    if (status === "negotiation" && bidAmount) {
      application.bidAmount = bidAmount;

      await createNotification({
        userId:      freelancerId,
        type:        "JOB_APPLIED",
        title:       "Counter Offer Received",
        message:     `Client sent a counter offer of ₹${bidAmount} for "${jobTitle}".`,
        referenceId: jobId,
      });
    }
    await application.save();

    res.status(200).json({
      message: `Application ${status} successfully`,
      application: {
        _id:       application._id,
        status:    application.status,
        bidAmount: application.bidAmount,
      },
    });
  } catch (error) {
    console.error("updateApplicationStatus error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/client/negotiation/:applicationId
// ═══════════════════════════════════════════════════════════════════════════════
export const getNegotiationHistory = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const clientId = req.user.userId;

    const application = await Application.findById(applicationId).populate("job");
    if (!application) return res.status(404).json({ message: "Application not found" });


    if (application.job.clientId.toString() !== clientId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const history = await Negotiation.find({ application: applicationId })
      .sort({ createdAt: 1 })
      .select("proposedAmount proposedBy message createdAt");

    res.status(200).json({ history });
  } catch (error) {
    console.error("getNegotiationHistory error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/client/negotiation
// ═══════════════════════════════════════════════════════════════════════════════
export const submitClientNegotiation = async (req, res) => {
  try {
    const { applicationId, proposedAmount, message } = req.body;
    const clientId = req.user.userId;

    if (!proposedAmount || isNaN(Number(proposedAmount))) {
      return res.status(400).json({ message: "Valid proposedAmount is required" });
    }

    const application = await Application.findById(applicationId).populate("job");
    if (!application) return res.status(404).json({ message: "Application not found" });

    if (application.job.clientId.toString() !== clientId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await Negotiation.create({
      application:    applicationId,
      job:            application.job._id,
      client:         clientId,
      freelancer:     application.user,
      proposedAmount: Number(proposedAmount),
      proposedBy:     "client",
      message:        message || "",
    });

    application.status    = "negotiation";
    application.bidAmount = Number(proposedAmount);
    await application.save();

    await createNotification({
      userId:      application.user,
      type:        "JOB_APPLIED",
      title:       "New Counter Offer",
      message:     `Client proposed ₹${proposedAmount} for "${application.job.title}". Review and respond.`,
      referenceId: application.job._id,
    });

    res.status(201).json({ message: "Counter offer sent successfully" });
  } catch (error) {
    console.error("submitClientNegotiation error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/client/messages/conversations?jobId=
// ═══════════════════════════════════════════════════════════════════════════════
export const getConversations = async (req, res) => {
  try {
    const { jobId } = req.query;
    const clientId  = req.user.userId;

    if (!jobId) return res.status(400).json({ message: "jobId is required" });

    const job = await Job.findOne({ _id: jobId, clientId });
    if (!job) return res.status(404).json({ message: "Job not found or unauthorized" });

    const applications = await Application.find({ job: jobId })
      .populate("user", "name email profileImage")
      .select("user status bidAmount");

    const threads = await Message.aggregate([
      {
        $match: {
          jobId: new mongoose.Types.ObjectId(jobId),
          $or: [
            { senderId:   new mongoose.Types.ObjectId(clientId) },
            { receiverId: new mongoose.Types.ObjectId(clientId) },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$senderId", new mongoose.Types.ObjectId(clientId)] },
              "$receiverId",
              "$senderId",
            ],
          },
          lastMessage:   { $first: "$text" },
          lastMessageAt: { $first: "$createdAt" },
          unread: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiverId", new mongoose.Types.ObjectId(clientId)] },
                    { $eq: ["$isRead", false] },
                  ],
                },
                1, 0,
              ],
            },
          },
        },
      },
    ]);

    const threadMap = {};
    threads.forEach((t) => { threadMap[t._id.toString()] = t; });

    const conversations = applications.map((app) => {
      const uid    = app.user._id.toString();
      const thread = threadMap[uid] || {};
      return {
        userId:        uid,
        name:          app.user.name,
        email:         app.user.email,
        photo:         app.user.profileImage || "",
        status:        app.status,
        lastMessage:   thread.lastMessage   || null,
        lastMessageAt: thread.lastMessageAt || null,
        unread:        thread.unread        || 0,
      };
    });

    conversations.sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt)
        return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return 0;
    });

    res.status(200).json({ conversations });
  } catch (error) {
    console.error("getConversations error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/client/messages/:freelancerId?jobId=
// ═══════════════════════════════════════════════════════════════════════════════
export const getMessages = async (req, res) => {
  try {
    const { freelancerId } = req.params;
    const { jobId }        = req.query;
    const clientId         = req.user.userId;

    if (!jobId) return res.status(400).json({ message: "jobId is required" });

    const job = await Job.findOne({ _id: jobId, clientId });
    if (!job) return res.status(404).json({ message: "Job not found or unauthorized" });

    const application = await Application.findOne({ job: jobId, user: freelancerId });
    if (!application) {
      return res.status(403).json({ message: "This freelancer did not apply to this job" });
    }

    const messages = await Message.find({
      jobId,
      $or: [
        { senderId: clientId,     receiverId: freelancerId },
        { senderId: freelancerId, receiverId: clientId },
      ],
    })
      .sort({ createdAt: 1 })
      .select("text senderId receiverId senderRole createdAt isRead fileUrl fileName fileType fileSize");

    await Message.updateMany(
      { jobId, senderId: freelancerId, receiverId: clientId, isRead: false },
      { $set: { isRead: true } }
    );

    const normalized = messages.map((m) => ({
      _id:        m._id,
      text:       m.text,
      senderId:   m.senderId.toString() === clientId.toString() ? "me" : m.senderId,
      senderRole: m.senderId.toString() === clientId.toString() ? "client" : "freelancer",
      createdAt:  m.createdAt,
      isRead:     m.isRead,
      fileUrl:    m.fileUrl  || null,
      fileName:   m.fileName || null,
      fileType:   m.fileType || null,
      fileSize:   m.fileSize || null,
    }));

    res.status(200).json({ messages: normalized });
  } catch (error) {
    console.error("getMessages error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/client/messages
// ═══════════════════════════════════════════════════════════════════════════════
export const sendMessage = async (req, res) => {
  try {
    const { receiverId, jobId, text } = req.body;
    const clientId = req.user.userId;

    if (!receiverId || !jobId || !text?.trim()) {
      return res.status(400).json({ message: "receiverId, jobId and text are required" });
    }

    const job = await Job.findOne({ _id: jobId, clientId });
    if (!job) return res.status(404).json({ message: "Job not found or unauthorized" });

    const application = await Application.findOne({ job: jobId, user: receiverId });
    if (!application) {
      return res.status(403).json({ message: "Freelancer did not apply to this job" });
    }

    if (application.status === "rejected") {
      return res.status(403).json({ message: "Cannot message a rejected applicant" });
    }

    const message = await Message.create({
      jobId,
      senderId:   clientId,
      receiverId,
      senderRole: "client",
      text:       text.trim(),
      isRead:     false,
    });

    await createNotification({
      userId:      receiverId,
      type:        "NEW_MESSAGE",
      title:       "New Message",
      message:     `Client sent you a message regarding "${job.title}".`,
      referenceId: new mongoose.Types.ObjectId(jobId),
    });

    res.status(201).json({
      message: "Message sent",
      data: {
        _id:        message._id,
        text:       message.text,
        senderId:   "me",
        senderRole: "client",
        createdAt:  message.createdAt,
        isRead:     false,
      },
    });
  } catch (error) {
    console.error("sendMessage error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/freelancer/application/:jobId
// ═══════════════════════════════════════════════════════════════════════════════
export const getFreelancerApplication = async (req, res) => {
  try {
    const { jobId }    = req.params;
    const freelancerId = req.user.userId;
    console.log("getFreelancerApplication called with:", { jobId, freelancerId });

    const application = await Application.findOne({
      job:  new mongoose.Types.ObjectId(jobId),
      user: new mongoose.Types.ObjectId(freelancerId),
    }).select("_id status bidAmount proposal updatedAt");

    if (!application) return res.status(404).json({ message: "Application not found" });

    res.status(200).json({ application });
  } catch (error) {
    console.error("getFreelancerApplication error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/freelancer/application/:applicationId/negotiate
// ═══════════════════════════════════════════════════════════════════════════════
export const negotiateApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { bidAmount }     = req.body;
    const freelancerId      = req.user.userId;

    if (!bidAmount || isNaN(Number(bidAmount))) {
      return res.status(400).json({ message: "Valid bidAmount is required" });
    }

    const application = await Application.findOne({
      _id:  applicationId,
      user: new mongoose.Types.ObjectId(freelancerId),
    }).populate("job", "title clientId");

    if (!application) return res.status(404).json({ message: "Application not found" });

    if (["accepted", "rejected"].includes(application.status)) {
      return res.status(403).json({
        message: `Cannot negotiate — application is already ${application.status}`,
      });
    }

    application.bidAmount = Number(bidAmount);
    application.status    = "negotiation";
    await application.save();

    await Negotiation.create({
      application:    applicationId,
      job:            application.job._id,
      client:         application.job.clientId,
      freelancer:     freelancerId,
      proposedAmount: Number(bidAmount),
      proposedBy:     "freelancer",
    });

    await createNotification({
      userId:      application.job.clientId,
      type:        "JOB_APPLIED",
      title:       "Counter Offer from Freelancer",
      message:     `A freelancer proposed ₹${bidAmount} for "${application.job.title}". Review the offer.`,
      referenceId: application.job._id,
    });

    res.status(200).json({
      message: "Negotiation submitted successfully",
      application: {
        _id:       application._id,
        status:    application.status,
        bidAmount: application.bidAmount,
        updatedAt: application.updatedAt,
      },
    });
  } catch (error) {
    console.error("negotiateApplication error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/freelancer/messages/:jobId
// ═══════════════════════════════════════════════════════════════════════════════
export const getFreelancerMessages = async (req, res) => {
  try {
    const { jobId }    = req.params;
    const freelancerId = req.user.userId;

    const application = await Application.findOne({
      job:  new mongoose.Types.ObjectId(jobId),
      user: new mongoose.Types.ObjectId(freelancerId),
    });
    if (!application) return res.status(403).json({ message: "You have not applied to this job" });

    const job = await Job.findById(jobId).select("clientId");
    if (!job) return res.status(404).json({ message: "Job not found" });

    const clientId = job.clientId;

    const messages = await Message.find({
      jobId,
      $or: [
        { senderId: freelancerId, receiverId: clientId },
        { senderId: clientId,     receiverId: freelancerId },
      ],
    })
      .sort({ createdAt: 1 })
      .select("text senderId receiverId senderRole createdAt isRead fileUrl fileName fileType fileSize");

    await Message.updateMany(
      { jobId, senderId: clientId, receiverId: freelancerId, isRead: false },
      { $set: { isRead: true } }
    );

    const normalized = messages.map((m) => ({
      _id:        m._id,
      text:       m.text,
      senderId:   m.senderId.toString() === freelancerId.toString() ? "me" : m.senderId,
      senderRole: m.senderId.toString() === freelancerId.toString() ? "freelancer" : "client",
      createdAt:  m.createdAt,
      isRead:     m.isRead,
      fileUrl:    m.fileUrl  || null,
      fileName:   m.fileName || null,
      fileType:   m.fileType || null,
      fileSize:   m.fileSize || null,
    }));

    res.status(200).json({ messages: normalized });
  } catch (error) {
    console.error("getFreelancerMessages error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/freelancer/messages
// ═══════════════════════════════════════════════════════════════════════════════
export const sendFreelancerMessage = async (req, res) => {
  try {
    const { jobId, text } = req.body;
    const freelancerId    = req.user.userId;

    if (!jobId) return res.status(400).json({ message: "jobId is required" });
    if (!text?.trim() && !req.file) {
      return res.status(400).json({ message: "Message or file required" });
    }

    const application = await Application.findOne({
      job:  new mongoose.Types.ObjectId(jobId),
      user: new mongoose.Types.ObjectId(freelancerId),
    });
    if (!application) return res.status(403).json({ message: "You have not applied to this job" });

    if (application.status === "rejected") {
      return res.status(403).json({ message: "Cannot send message — your application was rejected" });
    }

    const job = await Job.findById(jobId).select("clientId title");
    if (!job) return res.status(404).json({ message: "Job not found" });

    const message = await Message.create({
      jobId,
      senderId:   freelancerId,
      receiverId: job.clientId,
      senderRole: "freelancer",
      text:       text?.trim() || "",
      isRead:     false,
      ...getFileInfo(req.file),
    });

    await createNotification({
      userId:      job.clientId,
      type:        "NEW_MESSAGE",
      title:       "New Message from Freelancer",
      message:     `You have a new message regarding "${job.title}".`,
      referenceId: new mongoose.Types.ObjectId(jobId),
    });

    const io = req.app.get("io");
    if (io) {
      io.to(jobId.toString()).emit("receive_message", {
        ...message.toObject(),
        senderId: "me",
      });
    }

    res.status(201).json({
      success: true,
      message: {
        ...message.toObject(),
        senderId: "me",
      },
    });
  } catch (error) {
    console.error("sendFreelancerMessage error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/freelancer/messages/:jobId
// ═══════════════════════════════════════════════════════════════════════════════
export const deleteFreelancerMessages = async (req, res) => {
  try {
    const { jobId }    = req.params;
    const freelancerId = req.user.userId;

    const application = await Application.findOne({
      job:  new mongoose.Types.ObjectId(jobId),
      user: new mongoose.Types.ObjectId(freelancerId),
    });
    if (!application) return res.status(403).json({ message: "Unauthorized" });

    await Message.deleteMany({ jobId });

    res.status(200).json({ success: true, message: "Messages deleted successfully" });
  } catch (error) {
    console.error("deleteFreelancerMessages error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getFreelancerNegotiationHistory = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const freelancerId = req.user.userId;

    const application = await Application.findById(applicationId);
    if (!application) return res.status(404).json({ message: "Application not found" });

    if (application.user.toString() !== freelancerId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const history = await Negotiation.find({ application: applicationId })
      .sort({ createdAt: 1 })
      .select("proposedAmount proposedBy message createdAt");

    res.status(200).json({ history });
  } catch (error) {
    console.error("getFreelancerNegotiationHistory error:", error);
    res.status(500).json({ message: "Server error" });
  }
};