// accountSettings.controller.js
// Handles all freelancer account settings API logic

import User from "../models/User.js"; // adjust path to your existing User model

// ─────────────────────────────────────────
// GET /api/account/me
// Returns current user profile (no password)
// ─────────────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const formattedUser = {
      id: user._id,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      mobile: user.mobile,
      category: user.domains?.[0]?.name,
      subCategories: user.domains?.[0]?.subDomains,
      experienceLevel: user.freelancer.experienceLevel,
      visibility: user.freelancer.visibility,
      isEarningsPrivate: user.freelancer.isEarningsPrivate,
      upi_id: user.freelancer.upi_id,
      notifications: user.freelancer.notifications,
      lastSignIn: user.lastSignIn,
      currentBalance: user.freelancer.currentBalance,
    };
    return res
      .status(200)
      .json({ success: true, message: "Profile fetched", data: formattedUser });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Server error: " + err.message });
  }
};

// ─────────────────────────────────────────
// PATCH /api/account/contact
// Updates: name (firstName+lastName), email, phone
// ─────────────────────────────────────────
export const updateContact = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const updateFields = {};

    // =========================
    // Name
    // =========================
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Name must be a non-empty string",
        });
      }

      const parts = name.trim().split(" ");

      updateFields.firstName = parts[0];
      updateFields.lastName = parts.slice(1).join(" ") || "";
    }

    // =========================
    // Email
    // =========================
    if (email !== undefined) {
      const cleanEmail = email.toLowerCase().trim();

      if (typeof email !== "string" || !cleanEmail.includes("@")) {
        return res.status(400).json({
          success: false,
          message: "Valid email is required",
        });
      }

      // Current user
      const currentUser = await User.findById(req.user.userId);

      if (!currentUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Only check duplicate if email changed
      if (currentUser.email !== cleanEmail) {
        const existing = await User.findOne({
          email: cleanEmail,
        });

        if (existing) {
          return res.status(400).json({
            success: false,
            message: "Email is already in use by another account",
          });
        }
      }

      updateFields.email = cleanEmail;
    }

    // =========================
    // Phone
    // =========================
    if (phone !== undefined) {
      if (typeof phone !== "string") {
        return res.status(400).json({
          success: false,
          message: "Phone must be a string",
        });
      }

      updateFields.phone = phone.trim();
    }

    // =========================
    // No fields
    // =========================
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided",
      });
    }

    // =========================
    // Update User
    // =========================
    const updated = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updateFields },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    return res.status(200).json({
      success: true,
      message: "Contact info updated successfully",
      data: updated,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
};

// ─────────────────────────────────────────
// PATCH /api/account/profile
// Updates: category, subCategories, experienceLevel, visibility, isEarningsPrivate
// ─────────────────────────────────────────
export const updateProfileSettings = async (req, res) => {
  try {
    const {
      category,
      subCategories,
      experienceLevel,
      visibility,
      isEarningsPrivate,
    } = req.body;
    const updateFields = {};

    const VALID_EXPERIENCE = ["Entry level", "Intermediate", "Expert"];
    const VALID_VISIBILITY = ["Public", "Private"];

    if (category !== undefined) {
      if (typeof category !== "string" || category.trim() === "") {
        return res
          .status(400)
          .json({
            success: false,
            message: "category must be a non-empty string",
          });
      }
      updateFields.category = category.trim();
    }

    if (subCategories !== undefined) {
      if (
        !Array.isArray(subCategories) ||
        subCategories.some((s) => typeof s !== "string")
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message: "subCategories must be an array of strings",
          });
      }
      updateFields.subCategories = subCategories.map((s) => s.trim());
    }

    if (experienceLevel !== undefined) {
      if (!VALID_EXPERIENCE.includes(experienceLevel)) {
        return res.status(400).json({
          success: false,
          message: `experienceLevel must be one of: ${VALID_EXPERIENCE.join(", ")}`,
        });
      }
      updateFields.experienceLevel = experienceLevel;
    }

    if (visibility !== undefined) {
      if (!VALID_VISIBILITY.includes(visibility)) {
        return res
          .status(400)
          .json({
            success: false,
            message: "visibility must be 'Public' or 'Private'",
          });
      }
      updateFields.visibility = visibility;
    }

    if (isEarningsPrivate !== undefined) {
      if (typeof isEarningsPrivate !== "boolean") {
        return res
          .status(400)
          .json({
            success: false,
            message: "isEarningsPrivate must be a boolean",
          });
      }
      updateFields.isEarningsPrivate = isEarningsPrivate;
    }

    if (Object.keys(updateFields).length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No valid fields provided" });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateFields },
      { new: true, runValidators: true },
    ).select("-password");

    return res
      .status(200)
      .json({
        success: true,
        message: "Profile settings updated",
        data: updated,
      });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Server error: " + err.message });
  }
};

// ─────────────────────────────────────────
// PATCH /api/account/upi
// Updates: upi_id
// ─────────────────────────────────────────
export const updateUPI = async (req, res) => {
  try {
    const { upi_id } = req.body;

    if (!upi_id || typeof upi_id !== "string" || upi_id.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "upi_id must be a non-empty string" });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { upi_id: upi_id.trim() } },
      { new: true },
    ).select("-password");

    return res
      .status(200)
      .json({ success: true, message: "UPI ID updated", data: updated });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Server error: " + err.message });
  }
};

// ─────────────────────────────────────────
// PATCH /api/account/notifications
// Updates: notifications object (all toggle fields)
// ─────────────────────────────────────────
export const updateNotifications = async (req, res) => {
  try {
    const VALID_KEYS = [
      "jobRecommendations",
      "applicationUpdates",
      "interviewReminders",
      "paymentReceived",
      "withdrawalStatus",
      "invoiceGenerated",
      "messageReceived",
      "unreadReminders",
      "newDeviceLogin",
      "passwordChange",
    ];

    const { notifications } = req.body;

    if (
      !notifications ||
      typeof notifications !== "object" ||
      Array.isArray(notifications)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "notifications must be an object" });
    }

    const updateFields = {};
    for (const key of Object.keys(notifications)) {
      if (!VALID_KEYS.includes(key)) {
        return res
          .status(400)
          .json({
            success: false,
            message: `Invalid notification key: ${key}`,
          });
      }
      if (typeof notifications[key] !== "boolean") {
        return res
          .status(400)
          .json({ success: false, message: `${key} must be a boolean` });
      }
      updateFields[`notifications.${key}`] = notifications[key];
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateFields },
      { new: true },
    ).select("-password");

    return res
      .status(200)
      .json({
        success: true,
        message: "Notification settings updated",
        data: updated,
      });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Server error: " + err.message });
  }
};

// ─────────────────────────────────────────
// DELETE /api/account/delete
// Verifies OTP then deletes the account
// ─────────────────────────────────────────
export const deleteAccount = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp || typeof otp !== "string" || otp.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "OTP is required" });
    }

    // ── Replace this block with your real OTP verification logic ──
    // Example: check OTP from Redis/DB where you stored it on send-OTP step
    const isValidOTP = otp.trim() === req.user.pendingOtp; // placeholder
    if (!isValidOTP) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }
    // ──────────────────────────────────────────────────────────────

    await User.findByIdAndDelete(req.user._id);

    return res
      .status(200)
      .json({ success: true, message: "Account deleted successfully" });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Server error: " + err.message });
  }
};

// ─────────────────────────────────────────
// POST /api/account/send-otp
// Sends OTP to user email for account deletion
// ─────────────────────────────────────────
export const sendDeleteOTP = async (req, res) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // ── Store OTP with expiry in your DB/Redis here ──
    // Example: await redis.setex(`otp:${req.user._id}`, 300, otp);
    // Or: await User.findByIdAndUpdate(req.user._id, { pendingOtp: otp, otpExpiry: Date.now() + 300000 });
    // ─────────────────────────────────────────────────

    // ── Send email using your mail service ──
    // Example: await sendEmail({ to: req.user.email, subject: "Delete OTP", text: `Your OTP: ${otp}` });
    // ─────────────────────────────────────────

    console.log(`[DEV] OTP for ${req.user.email}: ${otp}`); // remove in production

    return res
      .status(200)
      .json({ success: true, message: "OTP sent to your registered email" });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Server error: " + err.message });
  }
};
