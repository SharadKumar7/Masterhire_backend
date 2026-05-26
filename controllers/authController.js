import User from "../models/User.js";
import sendEmail from "../config/sendConfig.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Job from "../models/Jobs.js";

// ================= SEND OTP =================
export const sendOtp = async (req, res) => {
  try {
    const { firstName, lastName, country, email, role, password } = req.body;

    // 🔥 check required
    if (!email || !password) {
      return res.status(400).json({ message: "Email & Password required" });
    }

    // 🔥 hash password
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

    // ✅ SAVE HASHED PASSWORD
    await User.create({
      firstName,
      lastName,
      country,
      email,
      password: hashedPassword, // 🔥 FIXED
      role,
      otp,
      otpExpiry,
      isVerified: false,
    });

    await sendEmail(
      email,
      "Your OTP Code",
      `Your OTP is ${otp}. It is valid for 5 minutes.`
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

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified" });
    }

    if (!user.otpExpiry || user.otpExpiry < new Date()) {
      await User.deleteOne({ email });
      return res.status(400).json({ message: "OTP expired. Please signup again." });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

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

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    user.otp = otp;
    user.otpExpiry = otpExpiry;

    await user.save();

    await sendEmail(
      email,
      "Your New OTP",
      `Your new OTP is ${otp}. Valid for 5 minutes.`
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
      email,
      password,
      firstName,
      lastName,
      country,

      photo,
      dob,
      gender,
      mobile,

      streetAddress,
      city,
      state,
      zip,

      selectedCategory,
      selectedSpecialities,

      skills,
      title,
      bio,

      experiences,
      education,
      languages,
    } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (!user.isVerified) {
      return res.status(400).json({ message: "Please verify OTP first" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.firstName = firstName;
    user.lastName = lastName;
    user.country = country;
    user.password = hashedPassword;

    user.photo = photo;
    user.dob = dob;
    user.gender = gender;
    user.mobile = mobile;

    user.address = {
      streetAddress,
      city,
      state,
      zip,
    };

    user.domains = {
  name: selectedCategory,
  subDomains: selectedSpecialities,
   };

    user.skills = skills;
    user.title = title;
    user.bio = bio;

    user.experiences = experiences;
    user.education = education;
    user.languages = languages;

    user.isProfileComplete = true;

    await user.save();

    res.json({
      message: "Signup completed successfully",
      userId: user._id,
    });

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

    if (!user) {
      return res.status(400).json({ message: "Email not registered" });
    }

    if (!user.isVerified) {
      return res.status(400).json({ message: "Please verify your account first" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      userId: user._id,
      role: user.role,
      fullName: `${user.firstName} ${user.lastName}`,
      isProfileComplete: user.isProfileComplete, // optional
    });

  } catch (error) {
    console.log("LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password -otp -otpExpiry");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

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



export const filterJobs = async (req, res) => {
  try {
    const {
      category,
      subcategory,
      rating,
      language,
      success,
      skill,
      english,
    } = req.query;

    let query = { status: "open" };

    // 🔹 Category
    if (category && category !== "All") {
      query.category = category;
    }

    // 🔹 Subcategory
    if (subcategory && subcategory !== "All") {
      query.subcategory = subcategory;
    }

    // 🔹 Rating
    if (rating && rating !== "All") {
      query.rating = Number(rating);
    }

    // 🔹 Language
    if (language && language !== "All") {
      query.language = language;
    }

    // 🔹 Success
    if (success && success !== "Any job success") {
      query.success = success;
    }

    // 🔹 Skill
    if (skill && skill !== "All") {
      query.skills = { $in: [skill] };
    }

    // 🔹 English level
    if (english && english !== "Any level") {
      query.english = english;
    }

    const jobs = await Job.find(query).sort({ createdAt: -1 });

    res.json(jobs);

  } catch (error) {
    console.log("FILTER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};