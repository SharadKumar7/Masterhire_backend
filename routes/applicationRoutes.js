// ─── projectRoutes.js ─────────────────────────────────────────────────────────
import express from "express";
import { protect } from "../middleware/authMiddleware.js"; // apna auth middleware

import {
  getProjectDetails,
  deleteJob,
  getClientJobApplications,
  updateApplicationStatus,
  getNegotiationHistory,
  submitClientNegotiation,
  getConversations,
  getMessages,
  sendMessage,
  getFreelancerApplication,
  negotiateApplication,
} from "../controllers/applicationController.js";

const router = express.Router();

// ── Job ───────────────────────────────────────────────────────────────────────
router.get( "/job-details/:jobId",              protect, getProjectDetails);
router.delete("/client/job/:jobId",             protect, deleteJob);          // ← NEW

// ── Applications (client) ─────────────────────────────────────────────────────
router.get(  "/client/job-applications/:jobId", protect, getClientJobApplications);
router.patch("/client/:applicationId/status",   protect, updateApplicationStatus);

// ── Negotiation ───────────────────────────────────────────────────────────────
router.get( "/client/negotiation/:applicationId", protect, getNegotiationHistory);
router.post("/client/negotiation",                protect, submitClientNegotiation);

// ── Messages (client) ─────────────────────────────────────────────────────────
router.get( "/client/messages/conversations",   protect, getConversations);   // ?jobId=
router.get( "/client/messages/:freelancerId",   protect, getMessages);        // ?jobId=
router.post("/client/messages",                 protect, sendMessage);

// ── Freelancer ────────────────────────────────────────────────────────────────
router.get(  "/freelancer/application/:jobId",              protect, getFreelancerApplication);
router.patch("/application/:applicationId/negotiate",       protect, negotiateApplication);

export default router;