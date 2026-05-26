import { searchFreelancers } from "../controllers/userController.js";
import express from "express";
import { getTopFreelancers } from "../controllers/userController.js";
import { getRecentlyViewedProfiles } from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/search-freelancers",  searchFreelancers);

router.get("/top-freelancers", protect, getTopFreelancers);

router.get("/recent-freelancers", protect, getRecentlyViewedProfiles);


export default router;
