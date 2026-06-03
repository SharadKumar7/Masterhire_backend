import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getClientProjectHistory,
  getFreelancerProjectHistory,
} from "../controllers/projectHistoryControllers.js";

const router = express.Router();

// Define your routes here
router.get("/client/project-history", protect, getClientProjectHistory);
router.get("/freelancer/project-history", protect, getFreelancerProjectHistory);

export default router;