import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { upload } from "../middleware/upload.js";

import {
  getJobDetails,
  getFreelancerJobDetails,
  getFreelancerProfile,
  addMilestone,
  editMilestone,      // ✅ NEW
  deleteMilestone,    // ✅ NEW
  updateMilestoneStatus,
  submitMilestone,
  getJobFiles,
  uploadJobFile,
} from "../controllers/clientWorkspaceControllers.js";

import {
  getMessages,
  sendMessage,
  saveCallLog,
  getUnreadCount,
  markAsRead,
} from "../controllers/messageControllers.js";

const router = express.Router();

// ─── Client Workspace ─────────────────────────────────────────────────────────
router.get("/job-details/:id",                          protect, getJobDetails);

// ─── Freelancer Workspace ─────────────────────────────────────────────────────
router.get("/freelancer/job-details/:id",               protect, getFreelancerJobDetails);

// ─── Shared ───────────────────────────────────────────────────────────────────
router.get("/freelancer/:id/profile",                   protect, getFreelancerProfile);

// Milestones
router.post  ("/job/:id/milestones",                    protect, addMilestone);
router.patch ("/job/:jobId/milestones/:milestoneId",    protect, editMilestone);    // ✅ NEW — freelancer edits before approval
router.delete("/job/:jobId/milestones/:milestoneId",    protect, deleteMilestone);  // ✅ NEW — freelancer deletes before approval
router.patch ("/milestones/:jobId/:milestoneId/status", protect, updateMilestoneStatus);
router.post  ("/milestones/:jobId/:milestoneId/submit", protect, upload.array("files", 10), submitMilestone);

// Files
router.get  ("/job/:id/files",                          protect, getJobFiles);
router.post ("/job/:id/files",                          protect, upload.array("files", 10), uploadJobFile);

// Messages
router.get  ("/client/messages/:freelancerId",          protect, getMessages);
router.post ("/client/messages",                        protect, upload.single("file"), sendMessage);
router.post ("/client/messages/call-log",               protect, saveCallLog);
router.get  ("/messages/unread-count",                  protect, getUnreadCount);
router.patch("/messages/read",                          protect, markAsRead);

export default router;