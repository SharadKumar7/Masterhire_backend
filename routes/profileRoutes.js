// routes/profileRoutes.js
import express from "express";

import { protect } from "../middleware/authMiddleware.js";
import { getProfileById } from "../controllers/profileController.js";
import {trackProfileView} from "../controllers/userController.js";

const router = express.Router();

router.get("/profile/:id", protect, trackProfileView, getProfileById); // fetch profile details


export default router;