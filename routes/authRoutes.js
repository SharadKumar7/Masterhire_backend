import express from "express";
import { sendOtp } from "../controllers/authController.js";
import { verifyOtp } from "../controllers/authController.js";
import { resendOtp } from "../controllers/authController.js";
import { completeProfile } from "../controllers/authController.js";
import { loginUser } from "../controllers/authController.js";
import { getMe } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";



const router = express.Router();

router.post("/send-otp", sendOtp);

router.post("/verify-otp", verifyOtp);

router.post("/resend-otp", resendOtp);

router.post("/complete-profile", completeProfile);

router.post("/login", loginUser);

router.get("/me", protect, getMe);

export default router;