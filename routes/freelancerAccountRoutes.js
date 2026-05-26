// accountSettings.routes.js
// Mount: app.use("/api/account", accountSettingsRouter)

import express from "express";
const router = express.Router();

import { protect } from "../middleware/authMiddleware.js"; // ✅ add .js if using ES modules

import {
  getProfile,
  updateContact,
  updateProfileSettings,
  updateUPI,
  updateNotifications,
  deleteAccount,
  sendDeleteOTP
} from "../controllers/freelancerAccountController.js"; // ✅ add .js

// ✅ Apply auth middleware to all routes
router.use(protect);

// ================= ROUTES =================

// 🔹 Get current user profile
router.get("/me", getProfile);

// 🔹 Update contact info (phone, email etc.)
router.patch("/contact", updateContact);

// 🔹 Update profile settings (bio, title, skills etc.)
router.patch("/profile", updateProfileSettings);

// 🔹 Update UPI / payment info
router.patch("/upi", updateUPI);

// 🔹 Update notification preferences
router.patch("/notifications", updateNotifications);

// 🔹 Send OTP before delete
router.post("/send-otp", sendDeleteOTP);

// 🔹 Delete account (after OTP verification)
router.delete("/delete", deleteAccount);

export default router;