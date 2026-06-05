import User from "../models/User.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";

// ── Email transporter ──────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const sendOTPEmail = async (toEmail, otp) => {
  await transporter.sendMail({
    from: `"Support" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Account Deletion OTP",
    html: `
      <h2>Account Deletion Request</h2>
      <p>Your OTP is: <h1 style="letter-spacing:8px;color:#e53e3e">${otp}</h1></p>
      <p>Expires in <strong>10 minutes</strong>. Ignore if not requested.</p>
    `,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /me
// FIX: req.user.userId → req.user._id (protect middleware ab full user deta hai)
// ─────────────────────────────────────────────────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password -deleteOtp -deleteOtpExpiry -tokenVersion");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    return res.status(200).json({
      success: true,
      data: {
        fullName:          `${user.firstName || ""} ${user.lastName || ""}`.trim(),
        email:             user.email,
        mobile:            user.mobile || "",
        category:          user.domains?.[0]?.name || "",
        subCategories:     user.domains?.[0]?.subDomains || [],
        experienceLevel:   user.freelancer?.experienceLevel || "Entry level",
        visibility:        user.freelancer?.visibility || "Public",
        isEarningsPrivate: user.freelancer?.isEarningsPrivate ?? true,
        upi_id:            user.freelancer?.upi_id || "",
        currentBalance:    user.freelancer?.currentBalance ?? 0,
        notifications:     user.freelancer?.notifications || {},
        lastSignIn:        user.lastSignIn || user.createdAt,
        // FIX: withdrawalHistory from DB, not hardcoded
        withdrawalHistory: user.freelancer?.withdrawalHistory || [],
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /contact
// FIX: req.user.userId → req.user._id
// ─────────────────────────────────────────────────────────────────────────────
export const updateContact = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const updateFields = {};

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ success: false, message: "Name cannot be empty" });
      const parts = name.trim().split(" ");
      updateFields.firstName = parts[0];
      updateFields.lastName  = parts.slice(1).join(" ") || "";
    }

    if (email !== undefined) {
      const cleanEmail = email.toLowerCase().trim();
      if (!cleanEmail.includes("@")) return res.status(400).json({ success: false, message: "Valid email is required" });

      if (cleanEmail !== req.user.email) {
        const existing = await User.findOne({ email: cleanEmail });
        if (existing) return res.status(400).json({ success: false, message: "Email already in use" });
      }
      updateFields.email = cleanEmail;
    }

    if (phone !== undefined) updateFields.mobile = phone.trim();

    if (Object.keys(updateFields).length === 0)
      return res.status(400).json({ success: false, message: "No valid fields provided" });

    const updated = await User.findByIdAndUpdate(
      req.user._id, // FIX: was req.user.userId
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select("-password");

    return res.status(200).json({
      success: true,
      message: "Contact info updated",
      data: {
        firstName: updated.firstName,
        lastName:  updated.lastName,
        email:     updated.email,
        phone:     updated.mobile,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /profile
// ─────────────────────────────────────────────────────────────────────────────
export const updateProfileSettings = async (req, res) => {
  try {
    const { category, subCategories, experienceLevel, visibility, isEarningsPrivate } = req.body;

    const VALID_EXPERIENCE = ["Entry level", "Intermediate", "Expert"];
    const VALID_VISIBILITY = ["Public", "Private"];
    const update = {};

    if (experienceLevel !== undefined) {
      if (!VALID_EXPERIENCE.includes(experienceLevel))
        return res.status(400).json({ success: false, message: `experienceLevel must be one of: ${VALID_EXPERIENCE.join(", ")}` });
      update["freelancer.experienceLevel"] = experienceLevel;
    }

    if (visibility !== undefined) {
      if (!VALID_VISIBILITY.includes(visibility))
        return res.status(400).json({ success: false, message: "visibility must be 'Public' or 'Private'" });
      update["freelancer.visibility"] = visibility;
    }

    if (isEarningsPrivate !== undefined) {
      if (typeof isEarningsPrivate !== "boolean")
        return res.status(400).json({ success: false, message: "isEarningsPrivate must be a boolean" });
      update["freelancer.isEarningsPrivate"] = isEarningsPrivate;
    }

    // Category & subCategories stored in domains array
    if (category !== undefined || subCategories !== undefined) {
      const user = await User.findById(req.user._id);
      const existing = user.domains?.[0] || {};
      const newDomain = {
        name:       category       !== undefined ? category.trim()        : existing.name,
        subDomains: subCategories  !== undefined ? subCategories.map(s => s.trim()) : existing.subDomains,
      };
      update["domains"] = [newDomain];
    }

    if (Object.keys(update).length === 0)
      return res.status(400).json({ success: false, message: "No valid fields provided" });

    const updated = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true }).select("-password");

    return res.status(200).json({ success: true, message: "Profile settings updated", data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /upi
// ─────────────────────────────────────────────────────────────────────────────
export const updateUPI = async (req, res) => {
  try {
    const { upi_id } = req.body;
    if (!upi_id || !upi_id.includes("@"))
      return res.status(400).json({ success: false, message: "Invalid UPI ID format" });

    await User.findByIdAndUpdate(req.user._id, { $set: { "freelancer.upi_id": upi_id.trim() } });
    return res.status(200).json({ success: true, data: { upi_id } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /notifications
// ─────────────────────────────────────────────────────────────────────────────
export const updateNotifications = async (req, res) => {
  try {
    const VALID_KEYS = [
      "jobRecommendations", "applicationUpdates", "interviewReminders",
      "paymentReceived", "withdrawalStatus", "invoiceGenerated",
      "messageReceived", "unreadReminders", "newDeviceLogin", "passwordChange",
    ];

    const { notifications } = req.body;
    if (!notifications || typeof notifications !== "object")
      return res.status(400).json({ success: false, message: "notifications must be an object" });

    const update = {};
    for (const key of Object.keys(notifications)) {
      if (!VALID_KEYS.includes(key))
        return res.status(400).json({ success: false, message: `Invalid key: ${key}` });
      if (typeof notifications[key] !== "boolean")
        return res.status(400).json({ success: false, message: `${key} must be a boolean` });
      update[`freelancer.notifications.${key}`] = notifications[key];
    }

    await User.findByIdAndUpdate(req.user._id, { $set: update });
    return res.status(200).json({ success: true, message: "Notifications updated" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /change-password
// ─────────────────────────────────────────────────────────────────────────────
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: "Both passwords are required" });
    if (newPassword.length < 8)
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });

    const user = await User.findById(req.user._id).select("+password");
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch)
      return res.status(400).json({ success: false, message: "Current password is incorrect" });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    return res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /logout-all
// FIX: tokenVersion bump so all existing JWTs are rejected
// ─────────────────────────────────────────────────────────────────────────────
export const logoutAllDevices = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 } });
    return res.status(200).json({ success: true, message: "Logged out from all devices" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /withdraw
// FIX: actual withdrawal logic with balance deduction & history record
// TODO: Replace with Razorpay Payouts API when payment gateway is added
// ─────────────────────────────────────────────────────────────────────────────
export const withdrawMoney = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || Number(amount) <= 0)
      return res.status(400).json({ success: false, message: "Invalid amount" });
    if (Number(amount) < 100)
      return res.status(400).json({ success: false, message: "Minimum withdrawal is ₹100" });

    const user = await User.findById(req.user._id);
    if (!user.freelancer?.upi_id)
      return res.status(400).json({ success: false, message: "Please set your UPI ID first" });
    if ((user.freelancer?.currentBalance ?? 0) < Number(amount))
      return res.status(400).json({ success: false, message: "Insufficient balance" });

    /*
      TODO: Razorpay Payouts Integration
      1. import Razorpay from "razorpay"
      2. const razorpay = new Razorpay({ key_id: ..., key_secret: ... })
      3. Create payout:
         const payout = await razorpay.payouts.create({
           account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
           fund_account_id: user.freelancer.razorpayFundAccountId, // saved when UPI is added
           amount: amount * 100,
           currency: "INR",
           mode: "UPI",
           purpose: "payout",
         });
      4. Only deduct balance after payout is confirmed
    */

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      {
        $inc:  { "freelancer.currentBalance": -Number(amount) },
        $push: {
          "freelancer.withdrawalHistory": {
            amount: Number(amount),
            date:   new Date(),
            status: "Pending", // changes to "Success" after payout confirmed
            upi_id: user.freelancer.upi_id,
          },
        },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      data: {
        balance:          updated.freelancer.currentBalance,
        withdrawalHistory: updated.freelancer.withdrawalHistory,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /send-otp
// FIX: actually saves OTP to DB + sends email (was just console.log before)
// ─────────────────────────────────────────────────────────────────────────────
export const sendDeleteOTP = async (req, res) => {
  try {
    const otp    = crypto.randomInt(100000, 999999).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    await User.findByIdAndUpdate(req.user._id, {
      $set: { deleteOtp: otp, deleteOtpExpiry: expiry },
    });
    await sendOTPEmail(req.user.email, otp);

    return res.status(200).json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to send OTP: " + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /delete
// FIX: proper OTP verification from DB + tokenVersion bump
// ─────────────────────────────────────────────────────────────────────────────
export const deleteAccount = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ success: false, message: "OTP is required" });

    const user = await User.findById(req.user._id).select("+deleteOtp +deleteOtpExpiry");
    if (!user.deleteOtp || user.deleteOtp !== otp)
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    if (new Date() > user.deleteOtpExpiry)
      return res.status(400).json({ success: false, message: "OTP has expired" });

    // Soft delete + invalidate all sessions
    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        isVerified:      false,
        deleteOtp:       null,
        deleteOtpExpiry: null,
        email:           `deleted_${req.user._id}@removed.com`,
      },
      $inc: { tokenVersion: 1 }, // FIX: invalidates all active tokens immediately
    });

    return res.status(200).json({ success: true, message: "Account deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};