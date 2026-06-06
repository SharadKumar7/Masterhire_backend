// ─── routes/projectRoutes.js ──────────────────────────────────────────────────
// Mount in app.js:
//   import projectRoutes from "./routes/projectRoutes.js";
//   app.use("/api", projectRoutes);
//
// Also serve uploads:
//   app.use("/uploads", express.static(path.join(__dirname, "uploads")));
//
// Make sure uploads/messages/ folder exists:
//   mkdir -p uploads/messages

import express from "express";
import { protect } from "../middleware/authMiddleware.js"; // your existing auth middleware
import {
  upload,
  // ── Shared ──────────────────────────────────────────────────────────────────
  getProjectDetails,
  deleteJob,
  // ── Client ──────────────────────────────────────────────────────────────────
  getClientJobApplications,
  updateApplicationStatus,
  getNegotiationHistory,
  submitClientNegotiation,
  getConversations,
  getMessages,
  sendMessage,
  // ── Freelancer ───────────────────────────────────────────────────────────────
  getFreelancerApplication,
  negotiateApplication,
  getFreelancerMessages,
  sendFreelancerMessage,
  deleteFreelancerMessages,
  getFreelancerNegotiationHistory,
} from "../controllers//applicationController.js";

const router = express.Router();

// ── Shared ────────────────────────────────────────────────────────────────────
router.get("/job-details/:jobId",        protect, getProjectDetails);
router.delete("/jobs/:jobId",            protect, deleteJob);

// ── Client ────────────────────────────────────────────────────────────────────
router.get("/client/job-applications/:jobId",         protect, getClientJobApplications);
router.patch("/client/:applicationId/status",         protect, updateApplicationStatus);
router.get("/client/negotiation/:applicationId",      protect, getNegotiationHistory);
router.post("/client/negotiation",                    protect, submitClientNegotiation);
router.get("/client/messages/conversations",          protect, getConversations);        // ?jobId=
router.get("/client/messages/:freelancerId",          protect, getMessages);             // ?jobId=
router.post("/client/messages",                       protect, sendMessage);

// ── Freelancer ────────────────────────────────────────────────────────────────
router.get("/freelancer/application/:jobId",                        protect, getFreelancerApplication);
router.patch("/freelancer/application/:applicationId/negotiate",    protect, negotiateApplication);
router.get("/freelancer/messages/:jobId",                           protect, getFreelancerMessages);
router.post("/freelancer/messages",                                 protect, upload.single("file"), sendFreelancerMessage);
router.delete("/freelancer/messages/:jobId",                        protect, deleteFreelancerMessages);
router.get("/freelancer/negotiation/:applicationId", protect, getFreelancerNegotiationHistory);

export default router;