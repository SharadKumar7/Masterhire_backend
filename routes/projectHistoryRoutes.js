import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getClientProjectHistory,
  getFreelancerProjectHistory,
} from "../controllers/projectHistoryControllers.js";

import {
  getClientContracts,
  getFreelancerContracts,
} from "../controllers/contractController.js";

import {
  getClientProposals,
  updateBidStatus,
  getFreelancerProposals,
  getFreelancerOffers,
} from "../controllers/proposalController.js";

const router = express.Router();

// Define your routes here
router.get("/client/project-history", protect, getClientProjectHistory);
router.get("/freelancer/project-history", protect, getFreelancerProjectHistory);

router.get("/client/contracts",               protect, getClientContracts);
router.get("/freelancer/contracts",           protect, getFreelancerContracts);

router.get("/client/proposals/:jobId",               protect, getClientProposals);
router.patch("/client/proposals/:applicationId/status", protect, updateBidStatus);

router.get("/freelancer/proposals",                   protect, getFreelancerProposals);
router.get("/freelancer/offers",                      protect, getFreelancerOffers);
export default router;