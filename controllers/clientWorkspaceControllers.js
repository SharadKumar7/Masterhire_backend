import Job from "../models/Jobs.js";
import User from "../models/User.js";
import HiredContract from "../models/HiredContract.js"; // 👈 NEW — source of the final/hired budget
import { getFileType, formatFileSize } from "../middleware/upload.js";
import { createNotification } from "./notificationController.js"; // ✅ ADD THIS

// ─── Helper: ensure arrays exist on old jobs ──────────────────────────────────
const ensureArrays = (job) => {
  if (!job.milestones)  job.milestones  = [];
  if (!job.activityLog) job.activityLog = [];
  if (!job.files)       job.files       = [];
};

// ─── Helper: milestone summary ────────────────────────────────────────────────
const getMilestoneSummary = (job) => {
  const milestones      = job.milestones || [];
  const totalBudget     = milestones.reduce((s, m) => s + (m.budget || 0), 0);
  const totalPaid       = milestones.filter(m => m.isPaid).reduce((s, m) => s + (m.paidAmount || 0), 0);
  const approvedCount   = milestones.filter(m => m.status === "approved").length;
  const overallProgress = milestones.length
    ? Math.round((approvedCount / milestones.length) * 100)
    : 0;
  return {
    totalBudget,
    totalPaid,
    totalRemaining:  totalBudget - totalPaid,
    overallProgress,
    startedOn: job.startedAt
      ? new Date(job.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "N/A",
    deadline: job.deadline || "N/A",
    duration: "N/A",
  };
};

// 👇 NEW — resolves the "final" budget from the HiredContract if one exists
// for this client + freelancer + job title (same matching key used when the
// contract is created in updateApplicationStatus). Falls back to job.budget
// when the job hasn't been hired yet (no contract found).
const resolveBudget = async (job, clientId, freelancerId) => {
  if (!clientId || !freelancerId) return job.budget;
  const contract = await HiredContract.findOne({
    client:     clientId,
    freelancer: freelancerId,
    jobTitle:   job.title,
  }).select("finalAmount");

  return contract?.finalAmount ?? job.budget;
};

// ─── GET /workspace/api/job-details/:id  (CLIENT) ────────────────────────────
export const getJobDetails = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate({ path: "assignedFreelancer", select: "firstName lastName photo title skills freelancer" })
      .populate("clientId", "firstName lastName photo");

    if (!job) return res.status(404).json({ message: "Job not found" });

    if (job.clientId._id.toString() !== req.user.userId?.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    ensureArrays(job);

    let assignedFreelancer = null;
    if (job.assignedFreelancer) {
      const f = job.assignedFreelancer;
      assignedFreelancer = {
        _id:             f._id,
        name:            `${f.firstName} ${f.lastName}`.trim(),
        photo:           f.photo || null,
        title:           f.title || "Freelancer",
        skills:          f.skills || [],
        rating:          f.freelancer?.rating || 0,
        reviewsCount:    f.freelancer?.totalReviews || 0,
        jobsCompleted:   f.freelancer?.completedProjects || 0,
        onTimeDelivery:  `${f.freelancer?.jobSuccess || 0}%`,
        experienceYears: f.freelancer?.experienceLevel || "N/A",
      };
    }

    // 👇 NEW — replaces job.budget with the hired final amount, when present
    const budget = await resolveBudget(job, job.clientId._id, job.assignedFreelancer?._id);

    return res.json({
      job: {
        _id:               job._id,
        title:             job.title,
        description:       job.description,
        budget,                                    // 👈 same field name, resolved value
        deadline:          job.deadline,
        skills:            job.skills,
        status:            job.status,
        assignedFreelancer,
        milestones:        job.milestones,
        files:             job.files,
        activityLog:       job.activityLog,
        summary:           getMilestoneSummary(job),
      },
    });
  } catch (err) {
    console.error("getJobDetails:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /workspace/api/freelancer/job-details/:id  (FREELANCER) ─────────────
export const getFreelancerJobDetails = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate({ path: "assignedFreelancer", select: "firstName lastName photo title skills freelancer" })
      .populate("clientId", "firstName lastName photo title client");

    if (!job) return res.status(404).json({ message: "Job not found" });

    if (!job.assignedFreelancer || job.assignedFreelancer._id.toString() !== req.user.userId?.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    ensureArrays(job);
    console.log("Job's clientId:", job.clientId);

    const c = job.clientId;
    const client = {
      _id:        c._id,
      name:       `${c.firstName} ${c.lastName}`.trim(),
      photo:      c.photo || null,
      title:      c.title || "Client",
      totalHires: c.client?.totalHires || 0,
      totalSpent: c.client?.totalSpent || 0,
      activeJobs: c.client?.activeJobs || 0,
      rating:     c.client?.rating    || 0,
    };

    // 👇 NEW — replaces job.budget with the hired final amount, when present
    const budget = await resolveBudget(job, c._id, job.assignedFreelancer._id);

    return res.json({
      job: {
        _id:         job._id,
        title:       job.title,
        description: job.description,
        budget,                                    // 👈 same field name, resolved value
        deadline:    job.deadline,
        skills:      job.skills,
        status:      job.status,
        client,
        milestones:  job.milestones,
        files:       job.files,
        activityLog: job.activityLog,
        summary:     getMilestoneSummary(job),
      },
    });
  } catch (err) {
    console.error("getFreelancerJobDetails:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /api/freelancer/:id/profile ─────────────────────────────────────────
export const getFreelancerProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "-password -otp -otpExpiry -deleteOtp -deleteOtpExpiry"
    );
    if (!user || user.role !== "freelancer") {
      return res.status(404).json({ message: "Freelancer not found" });
    }
    res.json({ freelancer: user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── POST /api/job/:id/milestones ─────────────────────────────────────────────
// ✅ FIX: this used to check job.clientId (only client could add). Milestone
// creation is now a FREELANCER action, so we check assignedFreelancer instead,
// and the notification now goes to the client (they need to know a milestone
// was proposed), not the freelancer.
export const addMilestone = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // ✅ FIX: only the freelancer assigned to this job can add milestones now.
    if (!job.assignedFreelancer || job.assignedFreelancer.toString() !== req.user.userId?.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    ensureArrays(job);

    const { title, description, budget, duration, dueDate, deliverables } = req.body;

    job.milestones.push({
      title,
      description,
      budget:       Number(budget),
      duration,
      dueDate:      new Date(dueDate),
      deliverables,
      status:       "pending",
    });

    job.activityLog.unshift({
      // ✅ FIX: wording now reflects that the freelancer proposed it
      label:   `Milestone "${title}" proposed by freelancer`,
      meta:    `Due: ${new Date(dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · ₹${Number(budget).toLocaleString("en-IN")}`,
      primary: false,
    });

    await job.save();

    // ✅ FIX: notify the CLIENT — freelancer added a new milestone, client should know
    await createNotification({
      userId:      job.clientId,
      type:        "JOB_APPLIED",
      title:       "New Milestone Proposed",
      message:     `Freelancer added a new milestone "${title}" (₹${Number(budget).toLocaleString("en-IN")}) to "${job.title}".`,
      referenceId: job._id,
    });

    const added = job.milestones[job.milestones.length - 1];
    res.status(201).json({ message: "Milestone added", milestone: added });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── PATCH /api/milestones/:jobId/:milestoneId/status ────────────────────────
export const updateMilestoneStatus = async (req, res) => {
  try {
    const { jobId, milestoneId } = req.params;
    const { action, reviewNote } = req.body;

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.clientId.toString() !== req.user.userId?.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    ensureArrays(job);

    const ms = job.milestones.id(milestoneId);
    if (!ms) return res.status(404).json({ message: "Milestone not found" });

    if (action === "approve") {
      ms.status     = "approved";
      ms.reviewNote = reviewNote || "";
      job.activityLog.unshift({
        label:   `Milestone "${ms.title}" approved`,
        meta:    `₹${ms.budget.toLocaleString("en-IN")} payment pending`,
        primary: true,
      });

      if (job.assignedFreelancer) {
        await createNotification({
          userId:      job.assignedFreelancer,
          type:        "JOB_COMPLETED",
          title:       "Milestone Approved! 🎉",
          message:     `Your milestone "${ms.title}" for "${job.title}" has been approved. Payment will be released shortly.`,
          referenceId: job._id,
        });
      }

    } else if (action === "request_changes") {
      ms.status     = "changes_requested";
      ms.reviewNote = reviewNote || "";
      job.activityLog.unshift({
        label: `Changes requested on "${ms.title}"`,
        meta:  reviewNote || "Client requested revisions",
      });

      if (job.assignedFreelancer) {
        await createNotification({
          userId:      job.assignedFreelancer,
          type:        "JOB_APPLIED",
          title:       "Changes Requested",
          message:     `Client requested changes on milestone "${ms.title}" for "${job.title}". ${reviewNote ? `Note: ${reviewNote}` : ""}`,
          referenceId: job._id,
        });
      }

    } else {
      return res.status(400).json({ message: "Invalid action" });
    }

    await job.save();
    res.json({ message: "Milestone updated", milestone: ms });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── POST /api/milestones/:jobId/:milestoneId/submit ─────────────────────────
export const submitMilestone = async (req, res) => {
  try {
    const { jobId, milestoneId } = req.params;

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (!job.assignedFreelancer || job.assignedFreelancer.toString() !== req.user.userId?.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    ensureArrays(job);

    const ms = job.milestones.id(milestoneId);
    if (!ms) return res.status(404).json({ message: "Milestone not found" });
    if (ms.status === "approved") {
      return res.status(400).json({ message: "Milestone already approved" });
    }

    const baseUrl       = `${req.protocol}://${req.get("host")}`;
    const uploadedFiles = (req.files || []).map((file) => ({
      name:       file.originalname,
      url:        `${baseUrl}/uploads/${file.filename}`,
      size:       formatFileSize(file.size),
      fileType:   getFileType(file.mimetype),
      uploadedAt: new Date(),
    }));

    ms.submittedFiles.push(...uploadedFiles);
    ms.status      = "submitted";
    ms.submittedOn = new Date();

    uploadedFiles.forEach((f) => {
      job.files.push({
        name:         f.name,
        url:          f.url,
        size:         f.size,
        fileType:     f.fileType,
        uploadedBy:   req.user.userId,
        uploaderRole: "freelancer",
        source:       "milestone",
        milestoneId:  ms._id,
        uploadedAt:   new Date(),
      });
    });

    job.activityLog.unshift({
      label:   `Milestone "${ms.title}" submitted`,
      meta:    "Freelancer submitted work for review",
      primary: false,
    });

    await job.save();

    await createNotification({
      userId:      job.clientId,
      type:        "JOB_APPLIED",
      title:       "Milestone Submitted for Review",
      message:     `Freelancer submitted milestone "${ms.title}" for "${job.title}". Please review and approve.`,
      referenceId: job._id,
    });

    res.json({ message: "Milestone submitted", milestone: ms });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /api/job/:id/files ───────────────────────────────────────────────────
export const getJobFiles = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).populate("files.uploadedBy", "firstName lastName");
    if (!job) return res.status(404).json({ message: "Job not found" });

    const isClient     = job.clientId.toString()            === req.user.userId?.toString();
    const isFreelancer = job.assignedFreelancer?.toString() === req.user.userId?.toString();
    if (!isClient && !isFreelancer) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json({ files: job.files || [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── POST /api/job/:id/files ──────────────────────────────────────────────────
export const uploadJobFile = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const isClient     = job.clientId.toString()            === req.user.userId?.toString();
    const isFreelancer = job.assignedFreelancer?.toString() === req.user.userId?.toString();
    if (!isClient && !isFreelancer) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    ensureArrays(job);

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const role    = req.user.role === "client" ? "client" : "freelancer";

    const newFiles = req.files.map((file) => ({
      name:         file.originalname,
      url:          `${baseUrl}/uploads/${file.filename}`,
      size:         formatFileSize(file.size),
      fileType:     getFileType(file.mimetype),
      uploadedBy:   req.user.userId,
      uploaderRole: role,
      source:       "client",
      uploadedAt:   new Date(),
    }));

    job.files.push(...newFiles);
    job.activityLog.unshift({
      label: `${newFiles.length} file(s) uploaded`,
      meta:  `Uploaded by ${role}`,
    });

    await job.save();

    if (role === "client" && job.assignedFreelancer) {
      await createNotification({
        userId:      job.assignedFreelancer,
        type:        "JOB_APPLIED",
        title:       "New File Uploaded",
        message:     `Client uploaded ${newFiles.length} file(s) to "${job.title}".`,
        referenceId: job._id,
      });
    } else if (role === "freelancer") {
      await createNotification({
        userId:      job.clientId,
        type:        "JOB_APPLIED",
        title:       "New File Uploaded",
        message:     `Freelancer uploaded ${newFiles.length} file(s) to "${job.title}".`,
        referenceId: job._id,
      });
    }

    res.status(201).json({ message: "Files uploaded", files: newFiles });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};