import express from "express";
import { sendOtp } from "../controllers/authController.js";
import { verifyOtp } from "../controllers/authController.js";
import { resendOtp } from "../controllers/authController.js";
import { completeProfile } from "../controllers/authController.js";
import { loginUser } from "../controllers/authController.js";
import { getMe } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { googleAuth } from "../controllers/authController.js";
import { forgotPassword } from "../controllers/forgetPassword.js";



const router = express.Router();

router.post("/send-otp", sendOtp);

router.post("/verify-otp", verifyOtp);

router.post("/resend-otp", resendOtp);

router.post("/complete-profile", completeProfile);

router.post("/login", loginUser);

router.get("/me", protect, getMe);

router.post("/google-auth", googleAuth);

router.post("/forgot-password", forgotPassword);

export default router;