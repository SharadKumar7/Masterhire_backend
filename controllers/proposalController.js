import mongoose from "mongoose";
import Application from "../models/applicationJob.js";
import Job         from "../models/Jobs.js";
import User        from "../models/User.js";
import { createNotification } from "./notificationController.js"; // ✅ ADD THIS

// ─── Helper: time ago ─────────────────────────────────────────────────────────
const getTimeAgo = (date) => {
  const diff  = Date.now() - new Date(date).getTime();
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  if (days > 0)  return `${days} Day${days > 1 ? 's' : ''} Ago`;
  if (hours > 0) return `${hours} Hour${hours > 1 ? 's' : ''} Ago`;
  return "Just now";
};

// ─── Helper: format date ──────────────────────────────────────────────────────
const formatDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/client/proposals/:jobId
// ═══════════════════════════════════════════════════════════════════════════════
export const getClientProposals = async (req, res) => {
  try {
    const { jobId }  = req.params;
    const clientId   = req.user.userId;
    const { page = 1, limit = 6, status, sort = "newest" } = req.query;

    const job = await Job.findOne({ _id: jobId, clientId });
    if (!job) return res.status(404).json({ message: "Job not found or unauthorized" });

    const filter = { job: new mongoose.Types.ObjectId(jobId) };
    if (status && status !== "all") filter.status = status;

    const sortMap = {
      newest:  { createdAt: -1 },
      lowest:  { bidAmount:  1 },
      highest: { bidAmount: -1 },
      rating:  { createdAt: -1 },
    };
    const sortQuery = sortMap[sort] || sortMap.newest;
    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Application.countDocuments(filter);

    const applications = await Application.find(filter)
      .populate("user", "name profileImage skills bio jobSuccessRate")
      .sort(sortQuery)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const bids = applications.map(app => ({
      id:           app._id,
      name:         app.user?.name || "Freelancer",
      role:         (app.user?.skills || []).slice(0, 2).join(" & ") || "Freelancer",
      avatar:       app.user?.profileImage || null,
      rating:       app.user?.rating || null,
      reviews:      app.user?.reviewsCount || 0,
      projects:     app.user?.completedProjects || 0,
      jobSuccess:   app.user?.jobSuccessRate || 0,
      bidAmount:    app.bidAmount,
      deliveryDays: app.deliveryDays || (job.deadline ? Math.ceil((new Date(job.deadline) - new Date()) / 86400000) : 20),
      appliedAgo:   getTimeAgo(app.createdAt),
      proposal:     app.proposal || "",
      status:       app.status,
    }));

    const allApps = await Application.find({ job: jobId }).lean();
    const stats = {
      total:       allApps.length,
      new:         allApps.filter(a => a.status === "pending").length,
      shortlisted: allApps.filter(a => a.status === "negotiation").length,
      hired:       allApps.filter(a => a.status === "accepted").length,
      rejected:    allApps.filter(a => a.status === "rejected").length,
    };

    const project = {
      title:    job.title,
      status:   job.status === "published" ? "Active" : job.status,
      postedOn: formatDate(job.createdAt),
      budget:   job.budget,
      deadline: job.deadline,
    };

    res.status(200).json({
      bids, stats, project,
      pagination: {
        total,
        page:       Number(page),
        limit:      Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("getClientProposals error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/client/proposals/:applicationId/status
// ═══════════════════════════════════════════════════════════════════════════════
export const updateBidStatus = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { action }        = req.body; // "shortlist" | "reject" | "hire"
    const clientId          = req.user.userId;

    const application = await Application.findById(applicationId).populate("job");
    if (!application) return res.status(404).json({ message: "Application not found" });

    if (application.job.clientId.toString() !== clientId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const actionMap = {
      shortlist: "negotiation",
      reject:    "rejected",
      hire:      "accepted",
    };
    const newStatus = actionMap[action];
    if (!newStatus) return res.status(400).json({ message: "Invalid action" });

    const jobTitle     = application.job.title;
    const jobId        = application.job._id;
    const freelancerId = application.user;

    application.status = newStatus;
    await application.save();

    // ── HIRED → assign job + reject others ───────────────────────────────
    if (newStatus === "accepted") {
      await Job.findByIdAndUpdate(jobId, {
        status:             "assigned",
        assignedFreelancer: freelancerId,
        isPublic:           false,
      });

      await Application.updateMany(
        { job: jobId, _id: { $ne: applicationId }, status: { $in: ["pending", "negotiation"] } },
        { $set: { status: "rejected" } }
      );

      // ✅ Freelancer ko — hired notification
      await createNotification({
        userId:      freelancerId,
        type:        "JOB_ASSIGNED",
        title:       "🎉 You've been hired!",
        message:     `Congratulations! You have been selected for "${jobTitle}". Check your contracts to get started.`,
        referenceId: jobId,
      });
    }

    // ── SHORTLISTED ───────────────────────────────────────────────────────
    if (newStatus === "negotiation") {
      // ✅ Freelancer ko — shortlisted notification
      await createNotification({
        userId:      freelancerId,
        type:        "JOB_APPLIED",
        title:       "You've been Shortlisted! ⭐",
        message:     `Good news! Your proposal for "${jobTitle}" has been shortlisted by the client.`,
        referenceId: jobId,
      });
    }

    // ── REJECTED ──────────────────────────────────────────────────────────
    if (newStatus === "rejected") {
      // ✅ Freelancer ko — rejected notification
      await createNotification({
        userId:      freelancerId,
        type:        "JOB_APPLIED",
        title:       "Application Not Selected",
        message:     `Your proposal for "${jobTitle}" was not selected this time. Keep applying!`,
        referenceId: jobId,
      });
    }

    res.status(200).json({
      success: true,
      message: `Application ${newStatus} successfully`,
      application: { _id: application._id, status: application.status },
    });
  } catch (error) {
    console.error("updateBidStatus error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/freelancer/proposals
// ═══════════════════════════════════════════════════════════════════════════════
export const getFreelancerProposals = async (req, res) => {
  try {
    const freelancerId = req.user.userId;
    const { status, sort = "newest" } = req.query;

    const applications = await Application.find({ user: new mongoose.Types.ObjectId(freelancerId) })
      .populate("job", "title budget deadline skills createdAt clientId")
      .sort({ createdAt: -1 })
      .lean();

    const validApps = applications.filter(app => app.job);

    const clientIds = [...new Set(validApps.map(a => a.job?.clientId?.toString()).filter(Boolean))];
    const clients   = await User.find({ _id: { $in: clientIds } }).select("name profileImage").lean();
    const clientMap = {};
    clients.forEach(c => { clientMap[c._id.toString()] = c; });

    let proposals = validApps.map(app => {
      const client    = clientMap[app.job?.clientId?.toString()] || {};
      const statusMap = {
        pending:     "Pending",
        negotiation: "Shortlisted",
        accepted:    "Hired",
        rejected:    "Rejected",
      };
      return {
        id:          app._id,
        title:       app.job.title,
        client:      client.name || "Client",
        clientPhoto: client.profileImage || null,
        type:        "Public Job",
        appliedOn:   formatDate(app.createdAt),
        budget:      app.bidAmount,
        days:        app.deliveryDays || 20,
        proposal:    app.proposal || "",
        status:      statusMap[app.status] || "Pending",
        lastUpdated: formatDate(app.updatedAt),
        jobId:       app.job._id,
        timestamp:   new Date(app.createdAt).getTime(),
      };
    });

    if (status && status !== "All Status") {
      proposals = proposals.filter(p => p.status === status);
    }

    if (sort === "Oldest First")   proposals.sort((a, b) => a.timestamp - b.timestamp);
    if (sort === "Highest Budget") proposals.sort((a, b) => b.budget - a.budget);

    const allApps = await Application.find({ user: freelancerId }).lean();
    const stats = {
      sent:        allApps.length,
      shortlisted: allApps.filter(a => a.status === "negotiation").length,
      hired:       allApps.filter(a => a.status === "accepted").length,
      rejected:    allApps.filter(a => a.status === "rejected").length,
    };

    res.status(200).json({ proposals, stats });
  } catch (error) {
    console.error("getFreelancerProposals error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/freelancer/offers
// ═══════════════════════════════════════════════════════════════════════════════
export const getFreelancerOffers = async (req, res) => {
  try {
    const freelancerId = req.user.userId;

    const acceptedApps = await Application.find({ user: freelancerId, status: "accepted" })
      .populate("job", "title budget deadline clientId createdAt")
      .lean();

    const clientIds = [...new Set(acceptedApps.map(a => a.job?.clientId?.toString()).filter(Boolean))];
    const clients   = await User.find({ _id: { $in: clientIds } }).select("name profileImage").lean();
    const clientMap = {};
    clients.forEach(c => { clientMap[c._id.toString()] = c; });

    const offers = acceptedApps.filter(app => app.job).map(app => {
      const client = clientMap[app.job?.clientId?.toString()] || {};
      return {
        id:         app._id,
        title:      app.job.title,
        client:     client.name || "Client",
        initials:   (client.name || "CL").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
        color:      "bg-teal-600",
        tags:       ["Invite"],
        offeredOn:  formatDate(app.updatedAt),
        budget:     app.bidAmount,
        days:       app.deliveryDays || 20,
        message:    "",
        status:     "Accepted",
        acceptedOn: formatDate(app.updatedAt),
        jobId:      app.job._id,
        timestamp:  new Date(app.updatedAt).getTime(),
      };
    });

    res.status(200).json({ offers });
  } catch (error) {
    console.error("getFreelancerOffers error:", error);
    res.status(500).json({ message: "Server error" });
  }
};