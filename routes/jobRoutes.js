import express from "express";
import { searchJobs } from "../controllers/jobController.js";
import { getMyJobs } from "../controllers/jobController.js";
import { protect } from "../middleware/authMiddleware.js";
import { postJob } from "../controllers/jobController.js";
import { getFreelancerCurrentJobs } from "../controllers/jobController.js";
import { getJobById } from "../controllers/jobController.js";
import { applyJob } from "../controllers/jobController.js";
import { toggleSaveJob } from "../controllers/jobController.js";
import { getSavedJobs } from "../controllers/jobController.js";
import { getAppliedJobs } from "../controllers/jobController.js";
import { trackJobView, getRecentlyViewedJobs } from "../controllers/jobController.js";
import { getSingleJob, updateJob } from "../controllers/jobController.js";

const router = express.Router();

// 🔥 SEARCH API
router.get("/search", searchJobs);
 
// 🔥 POST JOB API
router.post("/post-job", protect, postJob);

router.get("/my-jobs", protect, getMyJobs);

router.get("/:jobId", protect, getJobById);

router.post("/:jobId/apply", protect, applyJob);

router.post("/:jobId/save", protect, toggleSaveJob);

router.get("/freelancer/saved-jobs", protect, getSavedJobs);

router.get("/freelancer/applied-jobs", protect, getAppliedJobs);

router.post("/:jobId/view",   protect, trackJobView);
router.get("/recent/viewed",  protect, getRecentlyViewedJobs);

router.get("/freelancer/current-job", protect, getFreelancerCurrentJobs);

router.get("/edit-job/:id", protect, getSingleJob);
router.put("/update/:id", protect, updateJob);

export default router;