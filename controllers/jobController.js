import Job from "../models/Jobs.js";
import User from "../models/User.js";
import SavedJob from "../models/SavedJob.js";
import Application from "../models/applicationJob.js";
import RecentlyViewedJob from "../models/recentlyViewJob.js";
import mongoose from "mongoose";
import { getKeywordsForCategory } from "../models/JobKeyMap.js";
import { createNotification } from "./notificationController.js";
import HiredContract from "../models/HiredContract.js"; // ✅ ADD THIS

export const searchJobs = async (req, res) => {
  try {
    const {
      search, category, experience, experienceLevel,
      clientHistory, minBudget, maxBudget,
      consultation, projectLength,
      page = 1,
      limit = 10,
    } = req.query;
 
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip     = (pageNum - 1) * limitNum;
 
    let query = { status: "published" };
 
    // 🔍 SEARCH
    if (search && search.trim()) {
      const s = search.trim();
      if (s.toUpperCase().startsWith("JOB-")) {
        query.jobId = { $regex: `^${s}$`, $options: "i" };
      } else {
        query.$or = [
          { title:       { $regex: s, $options: "i" } },
          { skills:      { $elemMatch: { $regex: s, $options: "i" } } },
          { description: { $regex: s, $options: "i" } },
        ];
      }
    }
 
    // 📂 CATEGORY
    if (category && category !== "All") {
      const keywords = getKeywordsForCategory(category);
      if (keywords.length > 0) {
        const categoryConditions = [
          ...keywords.map((kw) => ({ title: { $regex: kw, $options: "i" } })),
          ...keywords.map((kw) => ({ skills: { $elemMatch: { $regex: kw, $options: "i" } } })),
        ];
        if (query.$or) {
          query.$and = [{ $or: query.$or }, { $or: categoryConditions }];
          delete query.$or;
        } else {
          query.$or = categoryConditions;
        }
      }
    }
 
    // 💼 EXPERIENCE
    const expLevel = experience || experienceLevel;
    if (expLevel && expLevel !== "All") {
      query.experienceLevel = { $regex: expLevel, $options: "i" };
    }
 
    // 👤 CLIENT HISTORY
    if (clientHistory && clientHistory !== "All") {
      let hiresCondition = {};
      if (clientHistory === "No hires")      hiresCondition = { $or: [{ totalJobs: 0 }, { totalJobs: { $exists: false } }] };
      if (clientHistory === "1 to 9 hires")  hiresCondition = { totalJobs: { $gte: 1, $lte: 9 } };
      if (clientHistory === "10+ hires")     hiresCondition = { totalJobs: { $gte: 10 } };
 
      const matchingClients = await mongoose.model("User").find(
        { role: "client", ...hiresCondition }, { _id: 1 }
      ).lean();
      query.clientId = { $in: matchingClients.map((c) => c._id) };
    }
 
    // 💰 BUDGET
    if (minBudget || maxBudget) {
      query.budget = {};
      if (minBudget) query.budget.$gte = Number(minBudget);
      if (maxBudget) query.budget.$lte = Number(maxBudget);
    }
 
    // 🤝 CONSULTATION
    if (consultation === "true") query.allowNegotiation = true;
 
    // ── Fetch with pagination ─────────────────────────────────────────────────
    let [jobs, totalCount] = await Promise.all([
      Job.find(query)
        .populate("clientId", "firstName lastName totalJobs photo")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Job.countDocuments(query),
    ]);
 
    // ⏳ PROJECT LENGTH (deadline filter — post DB)
    if (projectLength && projectLength !== "All") {
      const now = new Date();
      jobs = jobs.filter((job) => {
        if (!job.deadline) return false;
        const diffDays = (new Date(job.deadline) - now) / (1000 * 60 * 60 * 24);
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
      totalCount,
      hasMore: skip + limitNum < totalCount,
      page: pageNum,
      jobs,
    });
 
  } catch (error) {
    console.log("SEARCH JOB ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getMyJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ clientId: req.user.userId }).sort({ createdAt: -1 });
    res.json({ success: true, jobs });
  } catch (error) {
    console.log("GET MY JOBS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const postJob = async (req, res) => {
  try {
    const {
      title, description, budget, skills, experienceLevel,
      deadline, visibility, allowNegotiation, status,
    } = req.body;

    const job = await Job.create({
      title, description, budget, skills, experienceLevel,
      deadline, visibility, allowNegotiation,
      clientId:   req.user.userId,
      status:     status || "draft",
      jobId:      "JOB-" + Math.floor(Math.random() * 1000000),
      proposals:  0,
      postedTime: new Date(),
    });

    res.status(201).json({
      success: true,
      message: status === "draft" ? "Job saved as draft" : "Job posted successfully",
      job,
    });
  } catch (error) {
    console.log("POST JOB ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};



export const getFreelancerCurrentJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ assignedFreelancer: req.user.userId });

    // ✅ Sabhi related HiredContracts ek saath fetch kar lo (N+1 query avoid karne ke liye)
    const contracts = await HiredContract.find({ freelancer: req.user.userId });

    const formattedJobs = jobs.map(job => {
      // ✅ Matching contract dhoondo (client + jobTitle se match)
      const contract = contracts.find(
        (c) => c.client.toString() === job.clientId.toString() && c.jobTitle === job.title
      );

      return {
        _id:             job._id,
        jobId:           job.jobId,
        title:           job.title,
        description:     job.description,
        skills:          job.skills,
        budget:          job.budget,                              // ✅ original — untouched
        finalBudget:     contract ? contract.finalAmount : job.budget, // ✅ NEW — negotiated/locked amount
        deadline:        job.deadline,
        proposal:        job.proposals || null,
        paymentVerified: job.paymentVerified,
        postedTime:      job.createdAt,
      };
    });

    res.json({ success: true, count: formattedJobs.length, data: formattedJobs });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching current jobs" });
  }
};

export const getJobById = async (req, res) => {
  try {
    const userId    = req.user?.userId;
    const { jobId } = req.params;

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });

    let isSaved = false, isApplied = false, isRejected = false;
    if (userId) {
      isSaved    = !!(await SavedJob.findOne({ user: userId, job: jobId }));
      const app  = await Application.findOne({ user: userId, job: jobId });
      isApplied  = !!app;
      isRejected = app?.status === "rejected";
    }

    res.json({ success: true, data: { ...job.toObject(), isSaved, isApplied, isRejected } });
  } catch (error) {
    console.log("GET JOB ERROR:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const applyJob = async (req, res) => {
  try {
    const freelancerId       = req.user.userId;
    const { jobId }          = req.params;
    const { proposal, bidAmount } = req.body;

    if (!freelancerId) return res.status(401).json({ message: "Unauthorized" });

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const existingApplication = await Application.findOne({ user: freelancerId, job: jobId });

    if (existingApplication) {
      // ── UNAPPLY ──────────────────────────────────────────────────────────
      await Application.deleteOne({ user: freelancerId, job: jobId });
      job.proposals = Math.max((job.proposals || 1) - 1, 0);
      await job.save();

      return res.json({ success: true, applied: false, message: "Application cancelled successfully" });
    }

    // ── APPLY ────────────────────────────────────────────────────────────
    await Application.create({ user: freelancerId, job: jobId, proposal, bidAmount });
    job.proposals = (job.proposals || 0) + 1;
    await job.save();

    // ✅ Client ko — freelancer ne job pe apply kiya
    const freelancer = await User.findById(freelancerId).select("firstName lastName");
    const name       = freelancer ? `${freelancer.firstName} ${freelancer.lastName}`.trim() : "A freelancer";

    await createNotification({
      userId:      job.clientId,
      type:        "JOB_APPLIED",
      title:       "New Proposal Received",
      message:     `${name} submitted a proposal for "${job.title}".${bidAmount ? ` Bid: ₹${Number(bidAmount).toLocaleString("en-IN")}` : ""}`,
      referenceId: job._id,
    });

    return res.json({ success: true, applied: true, message: "Applied successfully" });
  } catch (error) {
    console.log("APPLY JOB ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getAppliedJobs = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const applications = await Application.find({ 
      user: userId, 
      status: { $ne: "accepted" }   // ✅ accepted wale exclude — wo Current Jobs mein already hain
    })
      .populate({ path: "job", select: "title description budget skills experienceLevel proposals postedTime jobId" })
      .sort({ createdAt: -1 });

    const validApplications = applications
      .filter((a) => a.job !== null)
      .map((a) => ({
        ...a.job.toObject(),
        isApplied: true,
        status:    a.status,        // ✅ ye bhi add kar do — taaki frontend "rejected" tag dikha sake
        bidAmount: a.bidAmount,
        proposal:  a.proposal,
        appliedAt: a.createdAt,
      }));

    res.json({ success: true, count: validApplications.length, data: validApplications });
  } catch (error) {
    console.log("GET APPLIED JOBS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const toggleSaveJob = async (req, res) => {
  try {
    const userId    = req.user?.userId;
    const { jobId } = req.params;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const existing = await SavedJob.findOne({ user: userId, job: jobId });
    if (existing) {
      await SavedJob.deleteOne({ user: userId, job: jobId });
      return res.json({ success: true, saved: false, message: "Job removed from saved" });
    }

    await SavedJob.create({ user: userId, job: jobId });
    return res.json({ success: true, saved: true, message: "Job saved successfully" });
  } catch (error) {
    console.log("SAVE JOB ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getSavedJobs = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const savedJobs = await SavedJob.find({ user: userId })
      .populate({ path: "job", select: "title description budget skills experienceLevel proposals postedTime" })
      .sort({ createdAt: -1 });

    const validJobs = savedJobs
      .filter((s) => s.job !== null)
      .map((s) => ({ ...s.job.toObject(), isSaved: true, savedAt: s.createdAt }));

    res.json({ success: true, count: validJobs.length, data: validJobs });
  } catch (error) {
    console.log("GET SAVED JOBS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const trackJobView = async (req, res) => {
  try {
    const userId    = req.user?.userId;
    const { jobId } = req.params;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    await RecentlyViewedJob.deleteOne({ user: userId, job: jobId });
    await RecentlyViewedJob.create({ user: userId, job: jobId });

    const allViews = await RecentlyViewedJob.find({ user: userId })
      .sort({ createdAt: -1 }).select("_id").skip(100);
    if (allViews.length > 0) {
      await RecentlyViewedJob.deleteMany({ _id: { $in: allViews.map((v) => v._id) } });
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
      .sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate({ path: "job", select: "title description budget skills experienceLevel proposals postedTime jobId" });

    const validJobs = recentJobs
      .filter((r) => r.job !== null)
      .map((r) => ({ ...r.job.toObject(), viewedAt: r.createdAt }));

    res.json({ success: true, data: validJobs, page, limit, total, hasMore: skip + limit < total });
  } catch (error) {
    console.log("GET RECENT VIEWED ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getSingleJob = async (req, res) => {
  try {
    const { id } = req.params;

    const job = await Job.findById(id);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    return res.status(200).json({
      success: true,
      job,
    });
  } catch (error) {
    console.error("Get Job Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

export const updateJob = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedJob = await Job.findOneAndUpdate(
      {
        _id: id,
        clientId: req.user.id,
      },
      {
        title: req.body.title,
        description: req.body.description,
        experienceLevel: req.body.experienceLevel,
        skills: req.body.skills,
        budget: req.body.budget,
        deadline: req.body.deadline,
        allowNegotiation: req.body.allowNegotiation,
        visibility: req.body.visibility,
        status: req.body.status,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedJob) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Job updated successfully",
      job: updatedJob,
    });
  } catch (error) {
    console.error("Update Job Error:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};