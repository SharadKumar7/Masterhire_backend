import mongoose from "mongoose";
import Application from "../models/applicationJob.js";
import Negotiation from "../models/negotiation.js";
import Job from "../models/Jobs.js";
import Message from "../models/message.js"; // make sure this model exists


// ─── GET /api/job-details/:jobId ──────────────────────────────────────────────
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

    if (!job) {
      return res.status(404).json({ message: "Job not found or unauthorized" });
    }

    res.status(200).json({ job });
  } catch (error) {
    console.error("getProjectDetails error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ─── DELETE /api/client/job/:jobId ────────────────────────────────────────────
// Only allowed when totalApplications === 0
export const deleteJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const clientId = req.user.userId;

    // Ownership check
    const job = await Job.findOne({ _id: jobId, clientId });
    if (!job) {
      return res.status(404).json({ message: "Job not found or unauthorized" });
    }

    // Block delete if any application exists
    const appCount = await Application.countDocuments({ job: new mongoose.Types.ObjectId(jobId) });
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


// ─── GET /api/client/job-applications/:jobId ─────────────────────────────────
export const getClientJobApplications = async (req, res) => {
  try {
    const { jobId } = req.params;
    const clientId = req.user.userId;

    const job = await Job.findOne({ _id: jobId, clientId });
    if (!job) {
      return res.status(404).json({ message: "Job not found or unauthorized" });
    }

    const result = await Application.aggregate([
      { $match: { job: new mongoose.Types.ObjectId(jobId) } },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
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
                name:         "$user.name",
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


// ─── PATCH /api/client/:applicationId/status ─────────────────────────────────
// When accepted:
//   1. Set application status = "accepted"
//   2. Set job.status = "assigned", job.assignedFreelancer = freelancerId
//   3. Reject ALL other pending/negotiation applications for same job
export const updateApplicationStatus = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status, bidAmount } = req.body;
    const clientId = req.user.userId;

    const validStatuses = ["accepted", "rejected", "negotiation"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    // Verify ownership
    const application = await Application.findById(applicationId).populate("job");
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.job.clientId.toString() !== clientId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const jobId = application.job._id;

    // ── ACCEPTED: hire freelancer ─────────────────────────────────────────────
    if (status === "accepted") {
      const freelancerId = application.user;

      // 1. Mark this application as accepted
      application.status = "accepted";
      await application.save();

      // 2. Update job → assigned
      await Job.findByIdAndUpdate(jobId, {
        status:             "assigned",
        assignedFreelancer: freelancerId,
        isPublic:           false,
      });

      // 3. Auto-reject all OTHER pending/negotiation applications for this job
      await Application.updateMany(
        {
          job:    jobId,
          _id:    { $ne: applicationId },          // not this one
          status: { $in: ["pending", "negotiation"] },
        },
        { $set: { status: "rejected" } }
      );

      return res.status(200).json({
        message: "Freelancer hired. Job assigned and other applications rejected.",
        application: {
          _id:      application._id,
          status:   application.status,
          bidAmount: application.bidAmount,
        },
      });
    }

    // ── REJECTED / NEGOTIATION ────────────────────────────────────────────────
    application.status = status;

    if (status === "negotiation" && bidAmount) {
      application.bidAmount = bidAmount;
    }

    await application.save();

    res.status(200).json({
      message: `Application ${status} successfully`,
      application: {
        _id:      application._id,
        status:   application.status,
        bidAmount: application.bidAmount,
      },
    });
  } catch (error) {
    console.error("updateApplicationStatus error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ─── GET /api/client/negotiation/:applicationId ──────────────────────────────
export const getNegotiationHistory = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const clientId = req.user.userId;

    const application = await Application.findById(applicationId).populate("job");
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.job.clientId.toString() !== clientId) {
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


// ─── POST /api/client/negotiation ────────────────────────────────────────────
export const submitClientNegotiation = async (req, res) => {
  try {
    const { applicationId, proposedAmount, message } = req.body;
    const clientId = req.user.userId;

    if (!proposedAmount || isNaN(Number(proposedAmount))) {
      return res.status(400).json({ message: "Valid proposedAmount is required" });
    }

    const application = await Application.findById(applicationId).populate("job");
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.job.clientId.toString() !== clientId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await Negotiation.create({
      application: applicationId,
      job:         application.job._id,
      client:      clientId,
      freelancer:  application.user,
      proposedAmount: Number(proposedAmount),
      proposedBy:  "client",
      message:     message || "",
    });

    // Keep application in negotiation status
    application.status = "negotiation";
    await application.save();

    res.status(201).json({ message: "Counter offer sent successfully" });
  } catch (error) {
    console.error("submitClientNegotiation error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ─── GET /api/client/messages/conversations?jobId= ───────────────────────────
// Returns ALL applicants for this job as potential conversations,
// merged with any existing message threads.
export const getConversations = async (req, res) => {
  try {
    const { jobId } = req.query;
    const clientId  = req.user.userId;

    if (!jobId) {
      return res.status(400).json({ message: "jobId is required" });
    }

    // Verify ownership
    const job = await Job.findOne({ _id: jobId, clientId });
    if (!job) {
      return res.status(404).json({ message: "Job not found or unauthorized" });
    }

    // All applicants for this job
    const applications = await Application.find({ job: jobId })
      .populate("user", "name email profileImage")
      .select("user status bidAmount");

    // Latest message per freelancer for this job
    const threads = await Message.aggregate([
      {
        $match: {
          jobId: new mongoose.Types.ObjectId(jobId),
          $or: [
            { senderId: new mongoose.Types.ObjectId(clientId) },
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
                    { $eq: ["$read", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    // Map threads by freelancer id for quick lookup
    const threadMap = {};
    threads.forEach((t) => {
      threadMap[t._id.toString()] = t;
    });

    // Build conversation list from all applicants
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

    // Sort: threads with messages first (by lastMessageAt desc), then rest
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


// ─── GET /api/client/messages/:freelancerId?jobId= ───────────────────────────
export const getMessages = async (req, res) => {
  try {
    const { freelancerId } = req.params;
    const { jobId }        = req.query;
    const clientId         = req.user.userId;

    if (!jobId) {
      return res.status(400).json({ message: "jobId is required" });
    }

    // Verify client owns this job
    const job = await Job.findOne({ _id: jobId, clientId });
    if (!job) {
      return res.status(404).json({ message: "Job not found or unauthorized" });
    }

    // Verify freelancer applied to this job
    const application = await Application.findOne({
      job:  jobId,
      user: freelancerId,
    });
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
      .select("text senderId receiverId createdAt read");

    // Mark unread messages as read
    await Message.updateMany(
      { jobId, senderId: freelancerId, receiverId: clientId, read: false },
      { $set: { read: true } }
    );

    // Normalize senderId so frontend knows "me" vs "them"
    const normalized = messages.map((m) => ({
      _id:        m._id,
      text:       m.text,
      senderId:   m.senderId.toString() === clientId ? "me" : m.senderId,
      senderRole: m.senderId.toString() === clientId ? "client" : "freelancer",
      createdAt:  m.createdAt,
      read:       m.read,
    }));

    res.status(200).json({ messages: normalized });
  } catch (error) {
    console.error("getMessages error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ─── POST /api/client/messages ────────────────────────────────────────────────
export const sendMessage = async (req, res) => {
  try {
    const { receiverId, jobId, text } = req.body;
    const clientId = req.user.userId;

    if (!receiverId || !jobId || !text?.trim()) {
      return res.status(400).json({ message: "receiverId, jobId and text are required" });
    }

    // Verify client owns this job
    const job = await Job.findOne({ _id: jobId, clientId });
    if (!job) {
      return res.status(404).json({ message: "Job not found or unauthorized" });
    }

    // Verify freelancer applied to this job
    const application = await Application.findOne({ job: jobId, user: receiverId });
    if (!application) {
      return res.status(403).json({ message: "Freelancer did not apply to this job" });
    }

    const message = await Message.create({
      jobId,
      senderId:   clientId,
      receiverId,
      text:       text.trim(),
      read:       false,
    });

    res.status(201).json({
      message: "Message sent",
      data: {
        _id:       message._id,
        text:      message.text,
        senderId:  "me",
        senderRole: "client",
        createdAt: message.createdAt,
        read:      false,
      },
    });
  } catch (error) {
    console.error("sendMessage error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ─── GET /api/freelancer/application/:jobId ───────────────────────────────────
export const getFreelancerApplication = async (req, res) => {
  try {
    const { jobId }      = req.params;
    const freelancerId   = req.user.userId;

    const application = await Application.findOne({
      job:  new mongoose.Types.ObjectId(jobId),
      user: new mongoose.Types.ObjectId(freelancerId),
    }).select("_id status bidAmount proposal updatedAt");

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    res.status(200).json({ application });
  } catch (error) {
    console.error("getFreelancerApplication error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ─── PATCH /api/application/:applicationId/negotiate ─────────────────────────
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
    });

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (["accepted", "rejected"].includes(application.status)) {
      return res.status(403).json({
        message: `Cannot negotiate — application is already ${application.status}`,
      });
    }

    application.bidAmount = Number(bidAmount);
    application.status    = "negotiation";
    await application.save();

    await Negotiation.create({
      application:   applicationId,
      job:           application.job,
      client:        null,
      freelancer:    freelancerId,
      proposedAmount: Number(bidAmount),
      proposedBy:    "freelancer",
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