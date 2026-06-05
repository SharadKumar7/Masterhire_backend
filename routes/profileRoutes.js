// routes/profileRoutes.js
import express from "express";

import { protect } from "../middleware/authMiddleware.js";
import {trackProfileView} from "../controllers/userController.js";
import {
  getSavedProfiles,
  saveProfile,
  unsaveProfile,
  getProfileById,
    getRecentlyHired,
  getMyProfile,
  updateMyProfile,
  getClientProfile,
  updateClientAbout,
  getClientPublicProfile
} from "../controllers/profileController.js";

const router = express.Router();

router.get("/profile/:id", protect, trackProfileView, getProfileById); // fetch profile details

router.get("/saved-profiles", protect, getSavedProfiles);

// POST   /api/saved-profiles/:profileId  → save a profile
router.post("/saved-profiles/:profileId", protect, saveProfile);

// DELETE /api/saved-profiles/:profileId  → unsave a profile
router.delete("/saved-profiles/:profileId", protect, unsaveProfile);

router.get("/recently-hired", protect, getRecentlyHired);

router.get("/my-profile", protect, getMyProfile);
router.put("/my-profile", protect, updateMyProfile);

router.get("/client/profile", protect, getClientProfile);
router.patch("/client/profile/about", protect, updateClientAbout);
router.get("/client/profile/:clientId", protect, getClientPublicProfile);


export default router;