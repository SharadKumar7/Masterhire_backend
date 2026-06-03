// controllers/projectHistoryController.js
import mongoose from "mongoose";
import Job         from "../models/Jobs.js";
import Application from "../models/applicationJob.js";
import Wallet      from "../models/wallet.js";

// ─── Helper: duration string ──────────────────────────────────────────────────
const getDuration = (start, end) => {
  if (!start) return "—";
  const s   = new Date(start);
  const e   = end ? new Date(end) : new Date();
  const days = Math.floor((e - s) / (1000 * 60 * 60 * 24));
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  const rem    = days % 30;
  return rem > 0 ? `${months}m ${rem}d` : `${months} month${months > 1 ? 's' : ''}`;
};

// ─── Helper: map job status → project status ──────────────────────────────────
const getProjectStatus = (jobStatus, appStatus) => {
  if (appStatus === "rejected") return "Cancelled";
  if (jobStatus === "assigned")  return "In Progress";
  if (jobStatus === "completed") return "Completed";
  if (jobStatus === "cancelled") return "Cancelled";
  return "In Progress";
};

// ─── Helper: thumbnail type from category/skills ──────────────────────────────
const getThumbnail = (skills = [], title = "") => {
  const all = [...skills, title].join(" ").toLowerCase();
  if (all.includes("mobile") || all.includes("react native") || all.includes("flutter") || all.includes("android") || all.includes("ios")) return "fitness";
  if (all.includes("design") || all.includes("figma") || all.includes("ui") || all.includes("ux")) return "portfolio";
  if (all.includes("dashboard") || all.includes("admin") || all.includes("analytics")) return "dashboard";
  if (all.includes("restaurant") || all.includes("food") || all.includes("delivery")) return "restaurant";
  return "grocery";
};


// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/client/project-history
// ═══════════════════════════════════════════════════════════════════════════════
export const getClientProjectHistory = async (req, res) => {
  try {
    const clientId = req.user.userId;

    // All jobs posted by this client
    const jobs = await Job.findOne
      ? await Job.find({ clientId })
          .populate("assignedFreelancer", "name profileImage")
          .sort({ createdAt: -1 })
          .lean()
      : [];

    // Get all applications for these jobs (to get freelancer + amount + status)
    const jobIds = jobs.map(j => j._id);
    const applications = await Application.find({ job: { $in: jobIds } })
      .populate("user", "name profileImage")
      .lean();

    // Map jobId → application
    const appMap = {};
    applications.forEach(app => {
      const jid = app.job.toString();
      // prefer accepted application
      if (!appMap[jid] || app.status === "accepted") {
        appMap[jid] = app;
      }
    });

    const projects = jobs.map(job => {
      const app    = appMap[job._id.toString()];
      const status = getProjectStatus(job.status, app?.status);

      return {
        id:              job._id,
        title:           job.title,
        freelancer:      app?.user?.name || job.assignedFreelancer?.name || "Not Assigned",
        freelancerAvatar: (app?.user?.name || "NA").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
        freelancerPhoto: app?.user?.profileImage || null,
        category:        job.experienceLevel || "General",
        startDate:       job.startedAt || job.createdAt,
        endDate:         status === "Completed" ? job.updatedAt : null,
        duration:        getDuration(job.startedAt || job.createdAt, status === "Completed" ? job.updatedAt : null),
        techStack:       job.skills || [],
        status,
        progress:        status === "Completed" ? 100 : status === "Cancelled" ? 40 : 60,
        amount:          job.budget || 0,
        amountPaid:      app?.bidAmount || 0,
        rating:          null, // add review model later
        reviewsCount:    0,
        description:     job.description || "",
        deliverables:    [],
        cancelReason:    status === "Cancelled" ? "Project was cancelled" : null,
        timestamp:       new Date(job.createdAt).getTime(),
        thumbnail:       getThumbnail(job.skills, job.title),
      };
    });

    // ── Metrics ──────────────────────────────────────────────────────────────
    const total      = projects.length;
    const completed  = projects.filter(p => p.status === "Completed").length;
    const inProgress = projects.filter(p => p.status === "In Progress").length;
    const cancelled  = projects.filter(p => p.status === "Cancelled").length;
    const totalSpent = projects
      .filter(p => p.status === "Completed")
      .reduce((s, p) => s + p.amountPaid, 0);
    const ratedProjects = projects.filter(p => p.rating);
    const avgRating = ratedProjects.length
      ? (ratedProjects.reduce((s, p) => s + p.rating, 0) / ratedProjects.length).toFixed(1)
      : "—";
    const totalReviews = projects.reduce((s, p) => s + p.reviewsCount, 0);

    res.status(200).json({
      projects,
      metrics: { total, completed, inProgress, cancelled, totalSpent, avgRating, totalReviews },
    });
  } catch (error) {
    console.error("getClientProjectHistory error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/freelancer/project-history
// ═══════════════════════════════════════════════════════════════════════════════
export const getFreelancerProjectHistory = async (req, res) => {
  try {
    const freelancerId = req.user.userId;

    // All applications by this freelancer
    const applications = await Application.find({ user: freelancerId })
      .populate({
        path:   "job",
        select: "title description budget skills experienceLevel status assignedFreelancer startedAt createdAt updatedAt clientId",
        populate: { path: "clientId", select: "name profileImage" },
      })
      .sort({ createdAt: -1 })
      .lean();

    // Filter out deleted jobs
    const validApps = applications.filter(app => app.job);

    const projects = validApps.map(app => {
      const job    = app.job;
      const status = getProjectStatus(job.status, app.status);

      return {
        id:           job._id,
        title:        job.title,
        client:       job.clientId?.name || "Client",
        clientPhoto:  job.clientId?.profileImage || null,
        category:     job.experienceLevel || "General",
        startDate:    job.startedAt || job.createdAt,
        endDate:      status === "Completed" ? job.updatedAt : null,
        duration:     getDuration(job.startedAt || job.createdAt, status === "Completed" ? job.updatedAt : null),
        techStack:    job.skills || [],
        status,
        progress:     status === "Completed" ? 100 : status === "Cancelled" ? 40 : 60,
        amount:       app.bidAmount || job.budget || 0,
        rating:       null, // add review model later
        reviewsCount: 0,
        description:  job.description || "",
        highlights:   job.skills?.slice(0, 4) || [],
        cancelReason: status === "Cancelled" ? "Project was cancelled" : null,
        timestamp:    new Date(app.createdAt).getTime(),
        thumbnail:    getThumbnail(job.skills, job.title),
      };
    });

    // ── Metrics ──────────────────────────────────────────────────────────────
    const total      = projects.length;
    const completed  = projects.filter(p => p.status === "Completed").length;
    const inProgress = projects.filter(p => p.status === "In Progress").length;
    const cancelled  = projects.filter(p => p.status === "Cancelled").length;
    const ratedProjects = projects.filter(p => p.rating);
    const avgRating = ratedProjects.length
      ? (ratedProjects.reduce((s, p) => s + p.rating, 0) / ratedProjects.length).toFixed(1)
      : "—";
    const totalReviews = projects.reduce((s, p) => s + p.reviewsCount, 0);

    res.status(200).json({
      projects,
      metrics: { total, completed, inProgress, cancelled, avgRating, totalReviews },
    });
  } catch (error) {
    console.error("getFreelancerProjectHistory error:", error);
    res.status(500).json({ message: "Server error" });
  }
};