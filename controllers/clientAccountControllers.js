import User from "../models/User.js";
import Wallet from "../models/wallet.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { createNotification } from "./notificationController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Email transporter ──────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
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

// ─── Multer config for profile photo upload ───────────────────────────────
// ✅ NEW — used on PATCH /personal so both text fields and the photo file
// can be sent together via multipart/form-data.
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads/profile/")),
  filename:    (req, file, cb) => cb(null, `${req.user._id}-${Date.now()}${path.extname(file.originalname)}`),
});

export const uploadProfilePhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ext  = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  },
}).single("profilePhoto"); // field name — frontend FormData mein isi naam se append karna hoga

// ─────────────────────────────────────────────────────────────────────────────
// GET /me
// ─────────────────────────────────────────────────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password -deleteOtp -deleteOtpExpiry -tokenVersion -otp -otpExpiry"
    );

    // ✅ Wallet balance from Wallet model — single source of truth
    const wallet = await Wallet.findOne({ user: req.user._id });
    const walletBalance = wallet?.balance ?? 0;

    const data = {
      fullName:     `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      email:        user.email,
      phone:        user.mobile || "",
      location:     user.address?.location || user.address?.city
                      ? (user.address.location || `${user.address.city || ""}${user.address.state ? ", " + user.address.state : ""}`.trim())
                      : "",
      bio:          user.bio || "",
      profilePhoto: user.photo || "",
      lastSignIn:   user.lastSignIn || user.createdAt,

      companyName:             user.client?.companyName || "",
      freelancerLevel:         user.client?.freelancerLevel || "",
      budgetRange:             user.client?.budgetRange || "",
      communicationPreference: user.client?.communicationPreference || "",
      autoInviteFreelancers:   user.client?.autoInviteFreelancers ?? false,
      jobVisibility:           user.client?.jobVisibility || "Public",

      // ✅ walletBalance from Wallet model (not user.client.walletBalance)
      walletBalance,

      paymentMethod:  user.client?.paymentMethod || "",
      upi_id:         user.client?.upi_id || "",
      billingAddress: user.client?.billingAddress || "",
      paymentHistory: user.client?.paymentHistory || [],
      invoices:       user.client?.invoices || [],
      notifications:  user.client?.notifications || {},
    };

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /personal
// ✅ UPDATED — now accepts multipart/form-data too. If a file is uploaded
// (req.file, via uploadProfilePhoto middleware), it takes priority over any
// profilePhoto string sent in the body.
// ─────────────────────────────────────────────────────────────────────────────
export const updatePersonal = async (req, res) => {
  try {
    const { fullName, email, phone, companyName, location, bio } = req.body;

    // ✅ Resolve profilePhoto — uploaded file wins, else fall back to body string
    let profilePhoto;
    if (req.file) {
      profilePhoto = `/uploads/profile/${req.file.filename}`;
    } else if (req.body.profilePhoto !== undefined) {
      profilePhoto = req.body.profilePhoto;
    }

    if (email && email !== req.user.email) {
      const exists = await User.findOne({ email, _id: { $ne: req.user._id } });
      if (exists)
        return res.status(400).json({ success: false, message: "Email already in use" });
    }

    let firstName, lastName;
    if (fullName) {
      const parts = fullName.trim().split(" ");
      firstName = parts[0];
      lastName  = parts.slice(1).join(" ") || "";
    }

    const update = {
      ...(firstName    !== undefined && { firstName }),
      ...(lastName     !== undefined && { lastName }),
      ...(email        !== undefined && { email }),
      ...(phone        !== undefined && { mobile: phone }),
      ...(bio          !== undefined && { bio }),
      ...(profilePhoto !== undefined && { photo: profilePhoto }),
      ...(companyName  !== undefined && { "client.companyName": companyName }),
      ...(location     !== undefined && { "address.location": location }),
    };

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: update },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      data: {
        fullName:     `${updated.firstName || ""} ${updated.lastName || ""}`.trim(),
        email:        updated.email,
        phone:        updated.mobile,
        companyName:  updated.client?.companyName,
        location:     updated.address?.location || "",
        bio:          updated.bio,
        profilePhoto: updated.photo,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /hiring-preferences
// ─────────────────────────────────────────────────────────────────────────────
export const updateHiringPreferences = async (req, res) => {
  try {
    const {
      freelancerLevel, budgetRange,
      communicationPreference, autoInviteFreelancers, jobVisibility,
    } = req.body;

    const update = {
      ...(freelancerLevel         !== undefined && { "client.freelancerLevel": freelancerLevel }),
      ...(budgetRange             !== undefined && { "client.budgetRange": budgetRange }),
      ...(communicationPreference !== undefined && { "client.communicationPreference": communicationPreference }),
      ...(autoInviteFreelancers   !== undefined && { "client.autoInviteFreelancers": autoInviteFreelancers }),
      ...(jobVisibility           !== undefined && { "client.jobVisibility": jobVisibility }),
    };

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set: update },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      data: {
        freelancerLevel:         updated.client?.freelancerLevel,
        budgetRange:             updated.client?.budgetRange,
        communicationPreference: updated.client?.communicationPreference,
        autoInviteFreelancers:   updated.client?.autoInviteFreelancers,
        jobVisibility:           updated.client?.jobVisibility,
      },
    });
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

    await User.findByIdAndUpdate(req.user._id, { $set: { "client.upi_id": upi_id } });
    return res.status(200).json({ success: true, data: { upi_id } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /payment-method
// ─────────────────────────────────────────────────────────────────────────────
export const updatePaymentMethod = async (req, res) => {
  try {
    const { paymentMethod } = req.body;
    await User.findByIdAndUpdate(
      req.user._id,
      { $set: { "client.paymentMethod": paymentMethod } }
    );
    return res.status(200).json({ success: true, data: { paymentMethod } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /billing-address
// ─────────────────────────────────────────────────────────────────────────────
export const updateBillingAddress = async (req, res) => {
  try {
    const { billingAddress } = req.body;
    await User.findByIdAndUpdate(
      req.user._id,
      { $set: { "client.billingAddress": billingAddress } }
    );
    return res.status(200).json({ success: true, data: { billingAddress } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /add-funds — REMOVED (now handled by /api/payment/topup/*)
// Frontend uses /api/payment/topup/create-order and /api/payment/topup/verify
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /notifications
// ─────────────────────────────────────────────────────────────────────────────
export const updateNotifications = async (req, res) => {
  try {
    const { notifications } = req.body;
    if (!notifications || typeof notifications !== "object")
      return res.status(400).json({ success: false, message: "Invalid notifications data" });

    const allowed = [
      "proposalReceived", "hiringUpdates", "interviewReminders",
      "messageReceived", "paymentAlerts", "marketingEmails",
    ];
    const update = {};
    allowed.forEach((key) => {
      if (notifications[key] !== undefined)
        update[`client.notifications.${key}`] = Boolean(notifications[key]);
    });

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

    const user    = await User.findById(req.user._id).select("+password");
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
// POST /send-delete-otp
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
// ─────────────────────────────────────────────────────────────────────────────
export const deleteAccount = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp)
      return res.status(400).json({ success: false, message: "OTP is required" });

    const user = await User.findById(req.user._id).select("+deleteOtp +deleteOtpExpiry");
    if (!user.deleteOtp || user.deleteOtp !== otp)
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    if (new Date() > user.deleteOtpExpiry)
      return res.status(400).json({ success: false, message: "OTP has expired" });

    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        isVerified:      false,
        deleteOtp:       null,
        deleteOtpExpiry: null,
        email:           `deleted_${req.user._id}@removed.com`,
      },
      $inc: { tokenVersion: 1 },
    });

    return res.status(200).json({ success: true, message: "Account deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /invoices/:invoiceId/download
// ─────────────────────────────────────────────────────────────────────────────
export const downloadInvoice = async (req, res) => {
  try {
    const user    = await User.findById(req.user._id);
    const invoice = user.client.invoices.id(req.params.invoiceId);
    if (!invoice)
      return res.status(404).json({ success: false, message: "Invoice not found" });

    if (invoice.fileUrl) return res.redirect(invoice.fileUrl);

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoice.invoiceNumber}.txt"`);
    res.send(
      `Invoice #${invoice.invoiceNumber}\nAmount: ₹${invoice.amount}\nDate: ${invoice.date}\nStatus: ${invoice.status}`
    );
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};