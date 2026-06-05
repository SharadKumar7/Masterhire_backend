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
  sendDeleteOTP,
  withdrawMoney,
  changePassword,
  logoutAllDevices,
} from "../controllers/freelancerAccountController.js"; // ✅ add .js

// ✅ Apply auth middleware to all routes
router.use(protect);

// ================= ROUTES =================

// 🔹 Get current user profile
router.get("/me", protect, getProfile);

// 🔹 Update contact info (phone, email etc.)
router.patch("/contact", protect, updateContact);

// 🔹 Update profile settings (bio, title, skills etc.)
router.patch("/profile", protect, updateProfileSettings);

// 🔹 Update UPI / payment info
router.patch("/upi", protect, updateUPI);

// 🔹 Update notification preferences
router.patch("/notifications", protect, updateNotifications);

// 🔹 Send OTP before delete
router.post("/send-otp", protect, sendDeleteOTP);

// 🔹 Delete account (after OTP verification)
router.delete("/delete", protect, deleteAccount);

router.post("/withdraw", protect, withdrawMoney);
router.patch("/change-password", protect, changePassword);
router.post("/logout-all", protect, logoutAllDevices);

export default router;