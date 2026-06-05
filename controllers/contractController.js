// controllers/contractController.js
import mongoose from "mongoose";
import Job         from "../models/Jobs.js";
import Application from "../models/applicationJob.js";

// ─── Helper: duration string ──────────────────────────────────────────────────
const getDuration = (start, end) => {
  if (!start) return "—";
  const s    = new Date(start);
  const e    = end ? new Date(end) : new Date();
  const days = Math.floor((e - s) / (1000 * 60 * 60 * 24));
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  const rem    = days % 30;
  return rem > 0 ? `${months} month${months > 1 ? 's' : ''} ${rem} days` : `${months} month${months > 1 ? 's' : ''}`;
};

// ─── Helper: contract status ──────────────────────────────────────────────────
const getContractStatus = (jobStatus, appStatus) => {
  if (appStatus === "rejected")  return "Cancelled";
  if (jobStatus === "completed") return "Completed";
  if (jobStatus === "assigned")  return "Active";
  return "Ongoing";
};

// ─── Helper: thumbnail from skills/title ─────────────────────────────────────
const getThumbnail = (skills = [], title = "") => {
  const all = [...skills, title].join(" ").toLowerCase();
  if (all.includes("mobile") || all.includes("react native") || all.includes("flutter")) return "fitness";
  if (all.includes("design") || all.includes("figma") || all.includes("ui") || all.includes("brand")) return "brand";
  if (all.includes("dashboard") || all.includes("admin")) return "dashboard";
  if (all.includes("landing") || all.includes("portfolio")) return "landing";
  if (all.includes("ecommerce") || all.includes("shop") || all.includes("store")) return "ecommerce";
  return "ecommerce";
};


// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/client/contracts
// ═══════════════════════════════════════════════════════════════════════════════
export const getClientContracts = async (req, res) => {
  try {
    const clientId = req.user.userId;

    // Only assigned/completed jobs (active contracts)
    const jobs = await Job.find({
      clientId,
      status: { $in: ["assigned", "completed", "cancelled"] },
    })
      .populate("assignedFreelancer", "name profileImage")
      .sort({ updatedAt: -1 })
      .lean();

    const jobIds = jobs.map(j => j._id);

    // Get accepted/rejected applications for these jobs
    const applications = await Application.find({
      job:    { $in: jobIds },
      status: { $in: ["accepted", "rejected"] },
    }).lean();

    const appMap = {};
    applications.forEach(app => {
      appMap[app.job.toString()] = app;
    });

    const contracts = jobs.map(job => {
      const app    = appMap[job._id.toString()];
      const status = getContractStatus(job.status, app?.status);

      // Milestones from job.milestones
      const milestones      = job.milestones || [];
      const totalMilestones = milestones.length;
      const completedMilestones = milestones.filter(m =>
        ["approved", "submitted"].includes(m.status)
      ).length;

      // Next pending milestone
      const nextMilestone = milestones.find(m =>
        !["approved"].includes(m.status) && m.status !== "changes_requested"
      );

      // Activity: recent milestone events
      const recentActivity = milestones
        .filter(m => m.status === "approved")
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 3)
        .map(m => ({
          type:   "milestone",
          title:  "Milestone completed",
          sub:    m.title,
          time:   m.updatedAt,
          amount: m.budget,
        }));

      const freelancerName = job.assignedFreelancer?.name || app?.user || "Freelancer";

      return {
        id:            job._id,
        title:         job.title,
        status,
        category:      job.experienceLevel || "General",
        freelancer: {
          name:   typeof freelancerName === "string" ? freelancerName : "Freelancer",
          avatar: (typeof freelancerName === "string" ? freelancerName : "F")
            .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
          photo:  job.assignedFreelancer?.profileImage || null,
          rating: null,
        },
        startDate:         job.startedAt || job.createdAt,
        endDate:           status === "Completed" ? job.updatedAt : null,
        duration:          getDuration(job.startedAt || job.createdAt, status === "Completed" ? job.updatedAt : null),
        budget:            job.budget || 0,
        milestones:        { completed: completedMilestones, total: totalMilestones || 1 },
        progress:          totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : (status === "Completed" ? 100 : 50),
        nextMilestone:     nextMilestone ? {
          title:   nextMilestone.title,
          amount:  nextMilestone.budget,
          dueDate: nextMilestone.dueDate,
        } : null,
        completedOn:   status === "Completed" ? job.updatedAt : null,
        totalPaid:     status === "Completed" ? (app?.bidAmount || job.budget || 0) : 0,
        cancelReason:  status === "Cancelled" ? "Contract was cancelled" : null,
        thumbnail:     getThumbnail(job.skills, job.title),
        timestamp:     new Date(job.updatedAt).getTime(),
        recentActivity,
      };
    });

    // ── Metrics ──────────────────────────────────────────────────────────────
    const total     = contracts.length;
    const active    = contracts.filter(c => c.status === "Active").length;
    const completed = contracts.filter(c => c.status === "Completed").length;
    const cancelled = contracts.filter(c => c.status === "Cancelled").length;
    const totalSpent = contracts
      .filter(c => c.status === "Completed")
      .reduce((s, c) => s + c.totalPaid, 0);

    // ── Donut data ────────────────────────────────────────────────────────────
    const inProgress = contracts.filter(c => c.status === "Ongoing").length;
    const donutData = [
      { label: "Active",      count: active,    pct: total ? Math.round((active / total) * 100)    : 0, color: "#0d9488" },
      { label: "In Progress", count: inProgress, pct: total ? Math.round((inProgress / total) * 100) : 0, color: "#3b82f6" },
      { label: "Completed",   count: completed,  pct: total ? Math.round((completed / total) * 100)  : 0, color: "#10b981" },
      { label: "Cancelled",   count: cancelled,  pct: total ? Math.round((cancelled / total) * 100)  : 0, color: "#f43f5e" },
    ];

    // ── Recent activity (across all contracts) ────────────────────────────────
    const activity = contracts
      .flatMap(c => c.recentActivity)
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 5)
      .map(a => ({
        ...a,
        time: getTimeAgo(a.time),
      }));

    res.status(200).json({
      contracts,
      metrics: { total, active, completed, cancelled, totalSpent },
      donutData,
      activity,
    });
  } catch (error) {
    console.error("getClientContracts error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/freelancer/contracts
// ═══════════════════════════════════════════════════════════════════════════════
export const getFreelancerContracts = async (req, res) => {
  try {
    const freelancerId = req.user.userId;

    // Applications where freelancer was accepted
    const applications = await Application.find({
      user:   freelancerId,
      status: { $in: ["accepted", "rejected"] },
    })
      .populate({
        path:   "job",
        select: "title description budget skills experienceLevel status milestones startedAt createdAt updatedAt clientId",
        populate: { path: "clientId", select: "name profileImage" },
      })
      .sort({ updatedAt: -1 })
      .lean();

    const validApps = applications.filter(app => app.job);

    const contracts = validApps.map(app => {
      const job    = app.job;
      const status = getContractStatus(job.status, app.status);

      const milestones          = job.milestones || [];
      const totalMilestones     = milestones.length;
      const completedMilestones = milestones.filter(m =>
        ["approved", "submitted"].includes(m.status)
      ).length;

      return {
        id:            job._id,
        title:         job.title,
        client:        job.clientId?.name || "Client",
        clientPhoto:   job.clientId?.profileImage || null,
        isVerified:    true,
        type:          (job.skills || []).some(s =>
          ["figma", "design", "ui", "ux"].includes(s.toLowerCase())
        ) ? "design" : "development",
        techStack:         job.skills || [],
        startDate:         job.startedAt || job.createdAt,
        endDate:           status === "Completed" ? job.updatedAt : null,
        durationText:      getDuration(job.startedAt || job.createdAt, status === "Completed" ? job.updatedAt : null),
        completedMilestones,
        totalMilestones:   totalMilestones || 1,
        status,
        amount:            app.bidAmount || job.budget || 0,
        rating:            null,
        reviewsCount:      0,
        timestamp:         new Date(app.updatedAt).getTime(),
      };
    });

    // ── Metrics ──────────────────────────────────────────────────────────────
    const total     = contracts.length;
    const completed = contracts.filter(c => c.status === "Completed").length;
    const ongoing   = contracts.filter(c => ["Active", "Ongoing"].includes(c.status)).length;
    const cancelled = contracts.filter(c => c.status === "Cancelled").length;
    const earnings  = contracts
      .filter(c => c.status === "Completed")
      .reduce((s, c) => s + c.amount, 0);

    res.status(200).json({
      contracts,
      metrics: { total, completed, ongoing, cancelled, earnings },
    });
  } catch (error) {
    console.error("getFreelancerContracts error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ─── Helper: time ago string ──────────────────────────────────────────────────
function getTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days} day${days > 1 ? 's' : ''} ago`;
}