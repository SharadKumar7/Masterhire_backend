import User from "../models/User.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createNotification } from "./notificationController.js";

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /me
// ─────────────────────────────────────────────────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "-password -deleteOtp -deleteOtpExpiry -tokenVersion -otp -otpExpiry"
    );

    const data = {
      fullName:     `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      email:        user.email,
      phone:        user.mobile || "",
      // FIX: location now stored as full string to avoid city/state mismatch on save
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
      walletBalance:           user.client?.walletBalance ?? 0,
      paymentMethod:           user.client?.paymentMethod || "",
      upi_id:                  user.client?.upi_id || "",
      billingAddress:          user.client?.billingAddress || "",
      paymentHistory:          user.client?.paymentHistory || [],
      invoices:                user.client?.invoices || [],
      notifications:           user.client?.notifications || {},
    };

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /personal
// ─────────────────────────────────────────────────────────────────────────────
export const updatePersonal = async (req, res) => {
  try {
    const { fullName, email, phone, companyName, location, bio, profilePhoto } = req.body;

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
      // FIX: save location as a single string field to avoid city/state mismatch
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
// POST /add-funds
// ─────────────────────────────────────────────────────────────────────────────
export const addFunds = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || Number(amount) <= 0)
      return res.status(400).json({ success: false, message: "Invalid amount" });
    if (Number(amount) < 100)
      return res.status(400).json({ success: false, message: "Minimum amount is ₹100" });

    /*
      TODO: Payment Gateway Integration
      Before incrementing walletBalance, verify payment with Razorpay/Stripe:

      import Razorpay from "razorpay";
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });

      Step 1 — Create order endpoint (POST /create-payment-order):
        const order = await razorpay.orders.create({ amount: amount * 100, currency: "INR", receipt: `wallet_${Date.now()}` });
        return res.json({ success: true, data: { order_id: order.id, key: process.env.RAZORPAY_KEY_ID, amount } });

      Step 2 — Verify payment endpoint (POST /verify-payment):
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const expectedSig = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
          .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
        if (expectedSig !== razorpay_signature)
          return res.status(400).json({ success: false, message: "Payment verification failed" });
        // Then do the wallet update below ↓
    */

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $inc:  { "client.walletBalance": Number(amount) },
        $push: {
          "client.paymentHistory": {
            amount:      Number(amount),
            date:        new Date(),
            status:      "Success",
            description: "Wallet top-up",
          },
        },
      },
      { new: true }
    );

    await createNotification({
      userId:  req.user._id,
      type:    "PAYMENT_RECEIVED",
      title:   "Wallet Topped Up",
      message: `₹${Number(amount).toLocaleString("en-IN")} has been added to your wallet. New balance: ₹${user.client.walletBalance.toLocaleString("en-IN")}.`,
    });

    return res.status(200).json({
      success: true,
      data: { walletBalance: user.client.walletBalance },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

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
// FIX: tokenVersion increment karta hai — auth middleware mein check hona chahiye
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
// FIX: tokenVersion bump on delete so existing tokens are invalidated immediately
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

    // FIX: tokenVersion bump ensures all active JWTs are immediately rejected
    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        isVerified:      false,
        deleteOtp:       null,
        deleteOtpExpiry: null,
        email:           `deleted_${req.user._id}@removed.com`,
      },
      $inc: { tokenVersion: 1 }, // ← invalidates all active sessions immediately
    });

    return res.status(200).json({ success: true, message: "Account deleted successfully" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /invoices/:invoiceId/download
// TODO: Replace plain-text fallback with PDF generation using pdfkit:
//   import PDFDocument from "pdfkit";
//   const doc = new PDFDocument();
//   res.setHeader("Content-Type", "application/pdf");
//   res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
//   doc.pipe(res);
//   doc.fontSize(20).text(`Invoice #${invoice.invoiceNumber}`, { align: "center" });
//   doc.moveDown().fontSize(12).text(`Amount: ₹${invoice.amount}`);
//   doc.text(`Date: ${new Date(invoice.date).toLocaleDateString()}`);
//   doc.text(`Status: ${invoice.status}`);
//   doc.end();
// ─────────────────────────────────────────────────────────────────────────────
export const downloadInvoice = async (req, res) => {
  try {
    const user    = await User.findById(req.user._id);
    const invoice = user.client.invoices.id(req.params.invoiceId);
    if (!invoice)
      return res.status(404).json({ success: false, message: "Invoice not found" });

    if (invoice.fileUrl) return res.redirect(invoice.fileUrl);

    // Plain text fallback — replace with pdfkit (see TODO above)
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="invoice-${invoice.invoiceNumber}.txt"`);
    res.send(
      `Invoice #${invoice.invoiceNumber}\nAmount: ₹${invoice.amount}\nDate: ${invoice.date}\nStatus: ${invoice.status}`
    );
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};