import Job from "../models/Jobs.js";
import User from "../models/User.js";
import SavedJob from "../models/SavedJob.js"; // ✅ NEW
import Application from "../models/applicationJob.js";
import RecentlyViewedJob from "../models/recentlyViewJob.js";
import mongoose from "mongoose"; // ✅ NEW

import { getKeywordsForCategory } from "../models/JobKeyMap.js";
// import Job from "../models/Job.js";      // apna path use karo

export const searchJobs = async (req, res) => {
  try {
    const {
      search,
      category,
      experience,        // frontend "experience" bhejta hai
      experienceLevel,   // fallback
      clientHistory,
      minBudget,
      maxBudget,
      consultation,
      projectLength,
    } = req.query;

    let query = {
      status: "published",
    };

    // ─── 🔍 SEARCH BAR ────────────────────────────────────────────────────────
    // JobId exact match, title, skills, description fuzzy match
    if (search && search.trim()) {
      const s = search.trim();

      // JobId exact match (JOB-345 format)
      if (s.toUpperCase().startsWith("JOB-")) {
        query.jobId = { $regex: `^${s}$`, $options: "i" };
      } else {
        // Title + Skills + Description mein search
        query.$or = [
          { title:       { $regex: s, $options: "i" } },
          { skills:      { $elemMatch: { $regex: s, $options: "i" } } },
          { description: { $regex: s, $options: "i" } },
        ];
      }
    }

    // ─── 📂 CATEGORY ─────────────────────────────────────────────────────────
    // Category field nahi hai schema mein — title + skills se match karo
    if (category && category !== "All") {
      const keywords = getKeywordsForCategory(category);

      if (keywords.length > 0) {
        const categoryConditions = [
          // Title mein koi bhi keyword match ho
          ...keywords.map((kw) => ({
            title: { $regex: kw, $options: "i" },
          })),
          // Skills mein koi bhi keyword match ho
          ...keywords.map((kw) => ({
            skills: { $elemMatch: { $regex: kw, $options: "i" } },
          })),
        ];

        // Agar search $or already hai toh category ko $and se add karo
        if (query.$or) {
          query.$and = [
            { $or: query.$or },
            { $or: categoryConditions },
          ];
          delete query.$or;
        } else {
          query.$or = categoryConditions;
        }
      }
    }

    // ─── 💼 EXPERIENCE LEVEL ─────────────────────────────────────────────────
    const expLevel = experience || experienceLevel;
    if (expLevel && expLevel !== "All") {
      query.experienceLevel = { $regex: expLevel, $options: "i" };
    }

    // ─── 👤 CLIENT HISTORY ────────────────────────────────────────────────────
    // clientId ke through client ka totalJobs check karo
    if (clientHistory && clientHistory !== "All") {
      let hiresCondition = {};

      if (clientHistory === "No hires") {
        hiresCondition = { $or: [{ totalJobs: 0 }, { totalJobs: { $exists: false } }] };
      } else if (clientHistory === "1 to 9 hires") {
        hiresCondition = { totalJobs: { $gte: 1, $lte: 9 } };
      } else if (clientHistory === "10+ hires") {
        hiresCondition = { totalJobs: { $gte: 10 } };
      }

      // Client users nikalo jo condition match kare
      const matchingClients = await mongoose.model("User").find(
        { role: "client", ...hiresCondition },
        { _id: 1 }
      ).lean();

      const clientIds = matchingClients.map((c) => c._id);
      query.clientId = { $in: clientIds };
    }

    // ─── 💰 BUDGET RANGE ──────────────────────────────────────────────────────
    if (minBudget || maxBudget) {
      query.budget = {};
      if (minBudget) query.budget.$gte = Number(minBudget);
      if (maxBudget) query.budget.$lte = Number(maxBudget);
    }

    // ─── 🤝 CONSULTATION / NEGOTIATION ───────────────────────────────────────
    if (consultation === "true") {
      query.allowNegotiation = true;
    }

    // ─── 📦 FETCH ─────────────────────────────────────────────────────────────
    let jobs = await Job.find(query)
      .populate("clientId", "firstName lastName totalJobs photo")
      .sort({ createdAt: -1 })
      .lean();

    // ─── ⏳ PROJECT LENGTH (deadline based filter) ────────────────────────────
    if (projectLength && projectLength !== "All") {
      const now = new Date();

      jobs = jobs.filter((job) => {
        if (!job.deadline) return false;
        const deadline = new Date(job.deadline);
        const diffDays = (deadline - now) / (1000 * 60 * 60 * 24);

        if (projectLength === "Less than 1 week")   return diffDays < 7;
        if (projectLength === "Less than 1 month")  return diffDays < 30;
        if (projectLength === "1 to 3 months")      return diffDays >= 30 && diffDays <= 90;
        if (projectLength === "3 to 6 months")      return diffDays > 90  && diffDays <= 180;
        if (projectLength === "More than 6 months") return diffDays > 180;
        return true;
      });
    }

    res.json({
      success: true,
      count: jobs.length,
      jobs,
    });

  } catch (error) {
    console.log("SEARCH JOB ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getMyJobs = async (req, res) => {
  try {
    const userId = req.user.userId; // 🔥 from token

    const jobs = await Job.find({ clientId: userId }).sort({ createdAt: -1 });

    res.json({
      success: true,
      jobs,
    });

  } catch (error) {
    console.log("GET MY JOBS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const postJob = async (req, res) => {
  try {
    const {
      title,
      description,
      budget,
      skills,
      experienceLevel,
      deadline,
      visibility,
      allowNegotiation,
      status,
    } = req.body;

    // 🔥 USER FROM TOKEN
    const clientId = req.user.userId;

    // 🔥 AUTO GENERATE JOB ID
    const jobId = "JOB-" + Math.floor(Math.random() * 1000000);

    // 🔥 CREATE JOB
    const job = await Job.create({
      title,
      description,
      budget,
      skills,
      experienceLevel,
      deadline,
      visibility,
      allowNegotiation,
      clientId,

      status: status || "draft",

      // ✅ NEW FIELDS
      jobId,
      proposals: 0,
      postedTime: new Date(),
    });

    res.status(201).json({
      success: true,
      message:
        status === "draft"
          ? "Job saved as draft"
          : "Job posted successfully",
      job,
    });

  } catch (error) {
    console.log("POST JOB ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const getFreelancerCurrentJobs = async (req, res) => {
  try {
    const freelancerId = req.user.userId; // ✅ FIXED

    const jobs = await Job.find({
      assignedFreelancer: freelancerId
    });

    const formattedJobs = jobs.map(job => ({
      _id: job._id, // ✅ ADD THIS
      title: job.title,
      description: job.description,
      skills: job.skills,
      budget: job.budget,
      deadline: job.deadline,
      proposal: job.proposals || null,
      paymentVerified: job.paymentVerified,
      postedTime: job.createdAt
    }));

    res.json({
      success: true,
      count: formattedJobs.length,
      data: formattedJobs
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching current jobs"
    });
  }
};


// ─── ONLY THIS FUNCTION CHANGED in jobController.js ─────────────────────────
// Replace your existing getJobById with this one.
// Everything else in the file stays exactly the same.

export const getJobById = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { jobId } = req.params;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    let isSaved    = false;
    let isApplied  = false;
    let isRejected = false; // ✅ NEW

    if (userId) {
      const savedJob = await SavedJob.findOne({ user: userId, job: jobId });
      isSaved = !!savedJob;

      const applied = await Application.findOne({ user: userId, job: jobId });
      isApplied  = !!applied;
      // ✅ isRejected: applied but status is rejected
      isRejected = applied?.status === "rejected";
    }

    res.json({
      success: true,
      data: {
        ...job.toObject(),
        isSaved,
        isApplied,
        isRejected, // ✅ NEW
      },
    });
  } catch (error) {
    console.log("GET JOB ERROR:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};



// Apply button api when user clicks apply on job details page. If already applied, it will unapply. So toggle logic in one API.
// ✅ FIXED: Toggle Apply / Unapply (one API)
export const applyJob = async (req, res) => {
  try {
    const freelancerId = req.user.userId;
    const { jobId } = req.params;
    const { proposal, bidAmount } = req.body;

    if (!freelancerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    // Check if already applied
    const existingApplication = await Application.findOne({
      user: freelancerId,
      job: jobId,
    });

    if (existingApplication) {
      // ✅ UNAPPLY — delete application and decrement proposals
      await Application.deleteOne({ user: freelancerId, job: jobId });

      job.proposals = Math.max((job.proposals || 1) - 1, 0); // never go below 0
      await job.save();

      return res.json({
        success: true,
        applied: false,
        message: "Application cancelled successfully",
      });
    }

    // ✅ APPLY — create application and increment proposals
    await Application.create({
      user: freelancerId,
      job: jobId,
      proposal,
      bidAmount,
    });

    job.proposals = (job.proposals || 0) + 1;
    await job.save();

    return res.json({
      success: true,
      applied: true,
      message: "Applied successfully",
    });

  } catch (error) {
    console.log("APPLY JOB ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getAppliedJobs = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const applications = await Application.find({ user: userId })
      .populate({
        path:   "job",
        select: "title description budget skills experienceLevel proposals postedTime",
      })
      .sort({ createdAt: -1 });

    // filter out any whose job was deleted
    const validApplications = applications
      .filter((a) => a.job !== null)
      .map((a) => ({
        ...a.job.toObject(),
        isApplied:  true,
        bidAmount:  a.bidAmount,
        proposal:   a.proposal,
        appliedAt:  a.createdAt,
      }));

    res.json({
      success: true,
      count:   validApplications.length,
      data:    validApplications,
    });

  } catch (error) {
    console.log("GET APPLIED JOBS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const toggleSaveJob = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { jobId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ✅ Check if already saved in SavedJob collection
    const existing = await SavedJob.findOne({
      user: userId,
      job: jobId,
    });

    if (existing) {
      // ❌ UNSAVE — delete the document
      await SavedJob.deleteOne({ user: userId, job: jobId });

      return res.json({
        success: true,
        saved: false,
        message: "Job removed from saved",
      });
    }

    // ✅ SAVE — create new document
    await SavedJob.create({
      user: userId,
      job: jobId,
    });

    return res.json({
      success: true,
      saved: true,
      message: "Job saved successfully",
    });

  } catch (error) {
    console.log("SAVE JOB ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getSavedJobs = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const savedJobs = await SavedJob.find({ user: userId })
      .populate({
        path:   "job",
        select: "title description budget skills experienceLevel proposals postedTime",
      })
      .sort({ createdAt: -1 });

    // filter out any whose job was deleted
    const validJobs = savedJobs
      .filter((s) => s.job !== null)
      .map((s) => ({
        ...s.job.toObject(),
        isSaved:   true,
        savedAt:   s.createdAt,
      }));

    res.json({
      success: true,
      count:   validJobs.length,
      data:    validJobs,
    });

  } catch (error) {
    console.log("GET SAVED JOBS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const trackJobView = async (req, res) => {
  try {
    const userId  = req.user?.userId;
    const { jobId } = req.params;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // ✅ Remove if already exists (to re-add at top as most recent)
    await RecentlyViewedJob.deleteOne({ user: userId, job: jobId });

    // ✅ Add fresh entry
    await RecentlyViewedJob.create({ user: userId, job: jobId });

    // ✅ Keep only latest 100 views per user (cleanup old)
    const allViews = await RecentlyViewedJob.find({ user: userId })
      .sort({ createdAt: -1 })
      .select("_id")
      .skip(100);

    if (allViews.length > 0) {
      const idsToDelete = allViews.map((v) => v._id);
      await RecentlyViewedJob.deleteMany({ _id: { $in: idsToDelete } });
    }

    res.json({ success: true, message: "View tracked" });

  } catch (error) {
    console.log("TRACK VIEW ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getRecentlyViewedJobs = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip  = (page - 1) * limit;

    const total = await RecentlyViewedJob.countDocuments({ user: userId });

    const recentJobs = await RecentlyViewedJob.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path:   "job",
        select: "title description budget skills experienceLevel proposals postedTime",
      });

    const validJobs = recentJobs
      .filter((r) => r.job !== null)
      .map((r) => ({
        ...r.job.toObject(),
        viewedAt: r.createdAt,
      }));

    res.json({
      success:  true,
      data:     validJobs,
      page,
      limit,
      total,
      hasMore:  skip + limit < total, // ✅ frontend uses this to stop fetching
    });

  } catch (error) {
    console.log("GET RECENT VIEWED ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};