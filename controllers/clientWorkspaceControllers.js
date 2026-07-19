import Job from "../models/Jobs.js";
import User from "../models/User.js";
import HiredContract from "../models/HiredContract.js";
import { getFileType, formatFileSize } from "../middleware/upload.js";
import { createNotification } from "./notificationController.js";

// ─── Helper: ensure arrays exist on old jobs ──────────────────────────────────
const ensureArrays = (job) => {
  if (!job.milestones)  job.milestones  = [];
  if (!job.activityLog) job.activityLog = [];
  if (!job.files)       job.files       = [];
};

// ─── Helper: resolve the real contract ceiling ────────────────────────────────
// ✅ FIX: now reads the directly-linked HiredContract (job.hiredContract),
// not a fragile client+freelancer+jobTitle lookup that could match the wrong
// contract if the same client hired the same freelancer more than once.
// Requires the caller to have populated "hiredContract" with "finalAmount".
const resolveBudget = (job) => {
  return job.hiredContract?.finalAmount ?? job.budget;
};

// ─── Helper: milestone summary ────────────────────────────────────────────────
// ✅ FIX: totalBudget now comes from the resolved contract amount instead of
// summing milestone budgets (which made the cap unenforceable — it could
// never be "exceeded" since it was calculated from itself). totalAllocated /
// remainingToAllocate are new — used to validate new/edited milestones.
const getMilestoneSummary = (job, contractBudget) => {
  const milestones = job.milestones || [];

  // rejected milestones don't count against the allocation cap
  const activeMilestones = milestones.filter((m) => m.status !== "rejected");

  const totalAllocated  = activeMilestones.reduce((s, m) => s + (m.budget || 0), 0);
  const totalPaidGross  = milestones.filter((m) => m.isPaid).reduce((s, m) => s + (m.budget || 0), 0);
  const totalPaidNet    = milestones.filter((m) => m.isPaid).reduce((s, m) => s + (m.paidAmount || 0), 0);
  const approvedCount   = milestones.filter((m) => m.status === "approved").length;
  const overallProgress = milestones.length
    ? Math.round((approvedCount / milestones.length) * 100)
    : 0;

  return {
    totalBudget:          contractBudget,
    totalAllocated,
    remainingToAllocate:  contractBudget - totalAllocated,
    totalPaid:            totalPaidGross,
    totalPaidNet,
    totalRemaining:       contractBudget - totalPaidGross,
    overallProgress,
    startedOn: job.startedAt
      ? new Date(job.startedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "N/A",
    deadline: job.deadline || "N/A",
    duration: "N/A",
  };
};

// ─── GET /workspace/api/job-details/:id  (CLIENT) ────────────────────────────
export const getJobDetails = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate({ path: "assignedFreelancer", select: "firstName lastName photo title skills freelancer" })
      .populate("clientId", "firstName lastName photo")
      .populate("hiredContract", "finalAmount"); // ✅ NEW

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

    const budget = resolveBudget(job); // ✅ FIX: sync now, uses populated hiredContract

    return res.json({
      job: {
        _id:               job._id,
        title:             job.title,
        description:       job.description,
        budget,
        deadline:          job.deadline,
        skills:            job.skills,
        status:            job.status,
        assignedFreelancer,
        milestones:        job.milestones,
        files:             job.files,
        activityLog:       job.activityLog,
        summary:           getMilestoneSummary(job, budget), // ✅ FIX: pass resolved budget
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
      .populate("clientId", "firstName lastName photo title client")
      .populate("hiredContract", "finalAmount"); // ✅ NEW

    if (!job) return res.status(404).json({ message: "Job not found" });

    if (!job.assignedFreelancer || job.assignedFreelancer._id.toString() !== req.user.userId?.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    ensureArrays(job);

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

    const budget = resolveBudget(job); // ✅ FIX

    return res.json({
      job: {
        _id:         job._id,
        title:       job.title,
        description: job.description,
        budget,
        deadline:    job.deadline,
        skills:      job.skills,
        status:      job.status,
        client,
        milestones:  job.milestones,
        files:       job.files,
        activityLog: job.activityLog,
        summary:     getMilestoneSummary(job, budget), // ✅ FIX
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
// Freelancer proposes a milestone. Requires client approval (status
// "pending_approval") before work can be submitted, and is capped so the sum
// of active milestone budgets never exceeds the hired contract amount.
export const addMilestone = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).populate("hiredContract", "finalAmount");
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (!job.assignedFreelancer || job.assignedFreelancer.toString() !== req.user.userId?.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    ensureArrays(job);

    const { title, description, budget, duration, dueDate, deliverables } = req.body;
    const milestoneBudget = Number(budget);

    if (!milestoneBudget || milestoneBudget <= 0) {
      return res.status(400).json({ message: "Milestone budget must be greater than 0" });
    }

    // ✅ Budget cap enforcement — the source of truth is the hired contract
    const contractBudget = resolveBudget(job);
    const totalAllocated = job.milestones
      .filter((m) => m.status !== "rejected")
      .reduce((s, m) => s + (m.budget || 0), 0);

    if (totalAllocated + milestoneBudget > contractBudget) {
      const remaining = contractBudget - totalAllocated;
      return res.status(400).json({
        message: `Milestone budget exceeds remaining contract amount. Remaining budget: ₹${remaining.toLocaleString("en-IN")}`,
      });
    }

    job.milestones.push({
      title,
      description,
      budget:       milestoneBudget,
      duration,
      dueDate:      new Date(dueDate),
      deliverables,
      status:       "pending_approval", // ✅ FIX: was "pending" — waits for client approval
    });

    job.activityLog.unshift({
      label:   `Milestone "${title}" proposed by freelancer`,
      meta:    `Due: ${new Date(dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · ₹${milestoneBudget.toLocaleString("en-IN")}`,
      primary: false,
    });

    await job.save();

    await createNotification({
      userId:      job.clientId,
      type:        "JOB_APPLIED",
      title:       "New Milestone Proposed",
      message:     `Freelancer added a new milestone "${title}" (₹${milestoneBudget.toLocaleString("en-IN")}) to "${job.title}". Please review and approve.`,
      referenceId: job._id,
    });

    const added = job.milestones[job.milestones.length - 1];
    res.status(201).json({ message: "Milestone added", milestone: added });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── PATCH /api/job/:jobId/milestones/:milestoneId ────────────────────────────
// ✅ NEW — freelancer edits a milestone. Only allowed while status is
// "pending_approval" (before the client has approved it).
export const editMilestone = async (req, res) => {
  try {
    const { jobId, milestoneId } = req.params;
    const job = await Job.findById(jobId).populate("hiredContract", "finalAmount");
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (!job.assignedFreelancer || job.assignedFreelancer.toString() !== req.user.userId?.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    const ms = job.milestones.id(milestoneId);
    if (!ms) return res.status(404).json({ message: "Milestone not found" });

    if (ms.status !== "pending_approval") {
      return res.status(400).json({ message: "Cannot edit a milestone after it has been approved" });
    }

    const { title, description, budget, duration, dueDate, deliverables } = req.body;
    const newBudget = Number(budget);

    if (!newBudget || newBudget <= 0) {
      return res.status(400).json({ message: "Milestone budget must be greater than 0" });
    }

    // Re-validate the cap, excluding this milestone's OLD amount from the sum
    const contractBudget = resolveBudget(job);
    const totalOthers = job.milestones
      .filter((m) => m.status !== "rejected" && m._id.toString() !== milestoneId)
      .reduce((s, m) => s + (m.budget || 0), 0);

    if (totalOthers + newBudget > contractBudget) {
      const remaining = contractBudget - totalOthers;
      return res.status(400).json({
        message: `Milestone budget exceeds remaining contract amount. Remaining budget: ₹${remaining.toLocaleString("en-IN")}`,
      });
    }

    ms.title        = title;
    ms.description  = description;
    ms.budget        = newBudget;
    ms.duration      = duration;
    ms.dueDate       = new Date(dueDate);
    ms.deliverables  = deliverables;

    job.activityLog.unshift({
      label: `Milestone "${title}" edited by freelancer`,
      meta:  `₹${newBudget.toLocaleString("en-IN")}`,
    });

    await job.save();
    res.json({ message: "Milestone updated", milestone: ms });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── DELETE /api/job/:jobId/milestones/:milestoneId ───────────────────────────
// ✅ NEW — freelancer deletes a milestone. Only allowed before client approval.
export const deleteMilestone = async (req, res) => {
  try {
    const { jobId, milestoneId } = req.params;
    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (!job.assignedFreelancer || job.assignedFreelancer.toString() !== req.user.userId?.toString()) {
      return res.status(403).json({ message: "Access denied" });
    }

    const ms = job.milestones.id(milestoneId);
    if (!ms) return res.status(404).json({ message: "Milestone not found" });

    if (ms.status !== "pending_approval") {
      return res.status(400).json({ message: "Cannot delete a milestone after it has been approved" });
    }

    ms.deleteOne();
    job.activityLog.unshift({ label: "Milestone deleted by freelancer", meta: "" });

    await job.save();
    res.json({ message: "Milestone deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── PATCH /api/milestones/:jobId/:milestoneId/status ────────────────────────
// Client-only. Two distinct stages:
//  - approve_milestone / reject_milestone  → the PROPOSAL (before work starts)
//  - approve / request_changes             → the SUBMITTED WORK
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

    // ✅ NEW — client approves the milestone PROPOSAL, freelancer can now start work
    if (action === "approve_milestone") {
      if (ms.status !== "pending_approval") {
        return res.status(400).json({ message: "Only milestones pending approval can be approved" });
      }
      ms.status = "in progress";
      job.activityLog.unshift({
        label:   `Milestone "${ms.title}" approved by client`,
        meta:    "Freelancer can now start work",
        primary: false,
      });

      if (job.assignedFreelancer) {
        await createNotification({
          userId:      job.assignedFreelancer,
          type:        "JOB_APPLIED",
          title:       "Milestone Approved",
          message:     `Client approved your milestone "${ms.title}" for "${job.title}". You can start work now.`,
          referenceId: job._id,
        });
      }

    // ✅ NEW — client rejects the milestone PROPOSAL
    } else if (action === "reject_milestone") {
      if (ms.status !== "pending_approval") {
        return res.status(400).json({ message: "Only milestones pending approval can be rejected" });
      }
      ms.status     = "rejected";
      ms.reviewNote = reviewNote || "";
      job.activityLog.unshift({
        label: `Milestone "${ms.title}" rejected by client`,
        meta:  reviewNote || "Client rejected this milestone proposal",
      });

      if (job.assignedFreelancer) {
        await createNotification({
          userId:      job.assignedFreelancer,
          type:        "JOB_APPLIED",
          title:       "Milestone Rejected",
          message:     `Client rejected your milestone "${ms.title}" for "${job.title}". ${reviewNote ? `Reason: ${reviewNote}` : ""}`,
          referenceId: job._id,
        });
      }

    } else if (action === "approve") {
      // ✅ FIX: guard — this approves SUBMITTED WORK only, not proposals
      if (ms.status !== "submitted") {
        return res.status(400).json({ message: "Only submitted work can be approved" });
      }
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
      if (ms.status !== "submitted") {
        return res.status(400).json({ message: "Changes can only be requested on submitted work" });
      }
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

    // ✅ FIX: can only submit work once the client has approved the proposal
    if (!["in progress", "changes_requested"].includes(ms.status)) {
      return res.status(400).json({ message: "This milestone is not ready for submission" });
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