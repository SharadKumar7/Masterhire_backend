// controllers/forgotPasswordController.js
import User from "../models/User.js";
import crypto from "crypto";
import sendEmail from "../config/sendConfig.js"; // your existing Brevo sendEmail

// ─── Helper: generate random password ────────────────────────────────────────
const generatePassword = () => {
  const chars   = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const special = "!@#$%^&*";

  // Guaranteed: 2 numbers + 1 special + rest letters = 10 chars total
  const getRandom = (str) => str[Math.floor(Math.random() * str.length)];

  const parts = [
    getRandom(special),
    getRandom(numbers),
    getRandom(numbers),
    ...Array.from({ length: 7 }, () => getRandom(chars)),
  ];

  // Shuffle
  return parts.sort(() => Math.random() - 0.5).join("");
};

// ─────────────────────────────────────────
// POST /api/auth/forgot-password
// ─────────────────────────────────────────
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if email exists — same response either way
      return res.status(200).json({
        success: true,
        message: "If this email is registered, a new password has been sent.",
      });
    }

    // ✅ Google user — no password set
    if (user.googleId && !user.password) {
      return res.status(400).json({
        error: "This account uses Google Sign-In. Please log in with Google.",
      });
    }

    // Generate new password
    const newPassword = generatePassword();

    // Hash and save
    const bcrypt = await import("bcryptjs");
    const hashed = await bcrypt.default.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    // Send email with new password
    await sendEmail(
      email,
      "Your New MasterHire Password",
      `Hi ${user.firstName || "there"},\n\nYour new password is: ${newPassword}\n\nPlease log in and change your password from your profile settings.\n\n— MasterHire Team`
    );

    res.status(200).json({
      success: true,
      message: "A new password has been sent to your email.",
    });
  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error);
    res.status(500).json({ error: "Server error. Please try again." });
  }
};