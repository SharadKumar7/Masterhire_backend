import User from "../models/User.js";
import sendEmail from "../config/sendConfig.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Job from "../models/Jobs.js";
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleAuth = async (req, res) => {
  try {
    const { credential, role } = req.body;

    if (!credential) {
      return res.status(400).json({ message: "Google credential required" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub, email, given_name, family_name, picture } = payload;

    let user = await User.findOne({ email });

    // ── NEW USER ──────────────────────────────────────────────────────────
    if (!user) {
      if (!role) {
        return res.status(400).json({ message: "Role is required for first-time Google signup" });
      }

      user = await User.create({
        firstName: given_name,
        lastName:  family_name,
        email,
        photo:     picture,
        role,
        googleId:  sub,
        isVerified: true,
        isProfileComplete: false,
        // ✅ paymentMethod string nahi — object daal do naye user ke liye
        client: role === "client"
          ? { paymentMethod: { type: "", last4: "", expiry: "" } }
          : undefined,
      });
    }

    // ── UPDATE — $set use karo, .save() nahi ─────────────────────────────
    // .save() existing string paymentMethod ko convert karne ki koshish karta hai → error
    const updateFields = { lastSignIn: new Date() };
    if (!user.googleId) {
      updateFields.googleId   = sub;
      updateFields.isVerified = true;
    }

    // ✅ Agar client hai aur paymentMethod string hai toh fix karo
    if (user.role === "client" && typeof user.client?.paymentMethod === "string") {
      updateFields["client.paymentMethod"] = { type: "", last4: "", expiry: "" };
    }

    await User.findByIdAndUpdate(user._id, { $set: updateFields });

    // Fresh user fetch karo updated data ke liye
    user = await User.findById(user._id);

    const token = jwt.sign(
      {
        userId:       user._id,
        role:         user.role,
        tokenVersion: user.tokenVersion,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      user: {
        userId:            user._id,
        role:              user.role,
        fullName:          `${user.firstName} ${user.lastName}`,
        email:             user.email,
        photo:             user.photo,
        isProfileComplete: user.isProfileComplete,
      },
    });
  } catch (error) {
    console.log("GOOGLE AUTH ERROR:", error);
    return res.status(500).json({ message: "Google authentication failed" });
  }
};


// ================= SEND OTP =================
export const sendOtp = async (req, res) => {
  try {
    const { firstName, lastName, country, email, role, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email & Password required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const existingUser = await User.findOne({ email });

    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({ message: "Email already registered" });
    }

    if (existingUser && !existingUser.isVerified) {
      await User.deleteOne({ email });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    await User.create({
      firstName, lastName, country, email,
      password: hashedPassword,
      role, otp, otpExpiry,
      isVerified: false,
    });

    await sendEmail(
      email,
      "Verify Your MasterHire Account",
      `Hi there,

Thank you for signing up with MasterHire — India's trusted freelance platform.

To complete your registration, please use the One-Time Password (OTP) below:

━━━━━━━━━━━━━━━━━━━━
        ${otp}
━━━━━━━━━━━━━━━━━━━━

This OTP is valid for 5 minutes. Do not share it with anyone.

If you did not request this, please ignore this email or contact our support team immediately.

Warm regards,
The MasterHire Team
support@masterhire.in | https://masterhire.netlify.app

─────────────────────────────────────────
© 2026 MasterHire. All rights reserved.
This is an automated message. Please do not reply to this email.`,
    );

    res.json({ message: "OTP sent to email" });
  } catch (error) {
    console.log("SEND OTP ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= VERIFY OTP =================
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: "User not found" });
    if (user.isVerified) return res.status(400).json({ message: "User already verified" });

    if (!user.otpExpiry || user.otpExpiry < new Date()) {
      await User.deleteOne({ email });
      return res.status(400).json({ message: "OTP expired. Please signup again." });
    }

    if (user.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    res.json({ message: "OTP verified successfully" });
  } catch (error) {
    console.log("VERIFY OTP ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= RESEND OTP =================
export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: "User not found" });
    if (user.isVerified) return res.status(400).json({ message: "User already verified" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    await sendEmail(
      email,
      "Your New OTP — MasterHire",
      `Hi there,

You requested a new OTP for your MasterHire account.

━━━━━━━━━━━━━━━━━━━━
        ${otp}
━━━━━━━━━━━━━━━━━━━━

This OTP is valid for 5 minutes. Do not share it with anyone.

If you did not request this, please secure your account immediately by contacting our support team.

Warm regards,
The MasterHire Team
support@masterhire.in | www.masterhire.in

─────────────────────────────────────────
© 2026 MasterHire. All rights reserved.
This is an automated message. Please do not reply to this email.`,
    );

    res.json({ message: "OTP resent successfully" });
  } catch (error) {
    console.log("RESEND OTP ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= COMPLETE PROFILE =================
export const completeProfile = async (req, res) => {
  try {
    const {
      email, password, firstName, lastName, country,
      photo, dob, gender, mobile,
      streetAddress, city, state, zip,
      selectedCategory, selectedSpecialities,
      skills, title, bio,
      experiences, education, languages,
    } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });
    if (!user.isVerified) return res.status(400).json({ message: "Please verify OTP first" });

    const hashedPassword = await bcrypt.hash(password, 10);

    user.firstName = firstName;
    user.lastName  = lastName;
    user.country   = country;
    user.password  = hashedPassword;
    user.photo     = photo;
    user.dob       = dob;
    user.gender    = gender;
    user.mobile    = mobile;
    user.address   = { streetAddress, city, state, zip };
    user.domains   = { name: selectedCategory, subDomains: selectedSpecialities };
    user.skills    = skills;
    user.title     = title;
    user.bio       = bio;
    user.experiences      = experiences;
    user.education        = education;
    user.languages        = languages;
    user.isProfileComplete = true;

    await user.save();

    res.json({ message: "Signup completed successfully", userId: user._id });
  } catch (error) {
    console.log("COMPLETE PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= LOGIN =================
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Email not registered" });
    if (!user.isVerified) return res.status(400).json({ message: "Please verify your account first" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign(
      {
        id: user._id,                    // FIX: userId → id
        role: user.role,
        tokenVersion: user.tokenVersion, // FIX: logout-all & delete ke liye
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await User.findByIdAndUpdate(user._id, { lastSignIn: new Date() });

    res.json({
      message: "Login successful",
      token,
      userId: user.userId, // FIX: user._id → userId (frontend ke liye consistency)
      role: user.role,
      fullName: `${user.firstName} ${user.lastName}`,
      isProfileComplete: user.isProfileComplete,
    });
  } catch (error) {
    console.log("LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= GET ME =================
export const getMe = async (req, res) => {
  try {
    // FIX: req.user.userId → req.user._id (protect middleware ab full user object deta hai)
    const user = await User.findById(req.user._id).select("-password -otp -otpExpiry");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      userId: user._id,
      role: user.role,
      fullName: `${user.firstName} ${user.lastName}`,
      email: user.email,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ================= FILTER JOBS =================
export const filterJobs = async (req, res) => {
  try {
    const { category, subcategory, rating, language, success, skill, english } = req.query;

    let query = { status: "open" };

    if (category && category !== "All") query.category = category;
    if (subcategory && subcategory !== "All") query.subcategory = subcategory;
    if (rating && rating !== "All") query.rating = Number(rating);
    if (language && language !== "All") query.language = language;
    if (success && success !== "Any job success") query.success = success;
    if (skill && skill !== "All") query.skills = { $in: [skill] };
    if (english && english !== "Any level") query.english = english;

    const jobs = await Job.find(query).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    console.log("FILTER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};