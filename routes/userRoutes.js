import { searchFreelancers } from "../controllers/userController.js";
import express from "express";
import { getTopFreelancers } from "../controllers/userController.js";
import { getRecentlyViewedProfiles } from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";
import { getCategoryCounts } from "../controllers/userController.js";
import { getPlatformStats } from "../controllers/userController.js";

const router = express.Router();

router.get("/search-freelancers",  searchFreelancers);

router.get("/top-freelancers", protect, getTopFreelancers);

router.get("/recent-freelancers", protect, getRecentlyViewedProfiles);

router.get("/category-counts", getCategoryCounts);

router.get("/stats", getPlatformStats);

export default router;
