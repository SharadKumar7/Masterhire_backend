// controllers/savedProfileController.js
import SavedProfile from "../models/savedProfiles.js";
import User from "../models/User.js";
import HiredContract from "../models/HiredContract.js";
import Job from "../models/Jobs.js";

// ─────────────────────────────────────────
// GET /api/saved-profiles
// ─────────────────────────────────────────
export const getSavedProfiles = async (req, res) => {
  try {
    const userId = req.user.userId;

    const saved = await SavedProfile.find({ savedBy: userId })
      .populate(
        "profile",
        "firstName lastName bio photo title jobSuccess totalJobs rating",
      )
      .sort({ createdAt: -1 });

    const profiles = saved
      .filter((entry) => entry.profile)
      .map((entry) => ({
        ...entry.profile.toObject(),
        isSaved: true,
        savedAt: entry.createdAt,
      }));

    res.status(200).json({
      success: true,
      savedProfiles: profiles,
    });
  } catch (error) {
    console.error("GET SAVED PROFILES ERROR:", error);
    res.status(500).json({
      error: "Server error while fetching saved profiles",
    });
  }
};

// ─────────────────────────────────────────
// POST /api/saved-profiles/:profileId
// ─────────────────────────────────────────
export const saveProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { profileId } = req.params;

    if (userId.toString() === profileId) {
      return res
        .status(400)
        .json({ error: "You cannot save your own profile" });
    }

    await SavedProfile.findOneAndUpdate(
      { savedBy: userId, profile: profileId },
      { savedBy: userId, profile: profileId },
      { upsert: true, returnDocument: "after" }, // ✅ fix
    );

    res
      .status(200)
      .json({ success: true, message: "Profile saved", profileId });
  } catch (error) {
    console.error("SAVE PROFILE ERROR:", error);
    res.status(500).json({ error: "Server error while saving profile" });
  }
};

// ─────────────────────────────────────────
// DELETE /api/saved-profiles/:profileId
// ─────────────────────────────────────────
export const unsaveProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { profileId } = req.params;

    const deleted = await SavedProfile.findOneAndDelete({
      savedBy: userId,
      profile: profileId,
    });

    if (!deleted) {
      return res.status(404).json({ error: "Saved profile not found" });
    }

    res
      .status(200)
      .json({
        success: true,
        message: "Profile removed from saved list",
        profileId,
      });
  } catch (error) {
    console.error("UNSAVE PROFILE ERROR:", error);
    res
      .status(500)
      .json({ error: "Server error while removing saved profile" });
  }
};

// ─────────────────────────────────────────
// GET /api/profiles/:id
// ─────────────────────────────────────────
export const getProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await User.findById(id);

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json(profile);
  } catch (error) {
    console.error("GET PROFILE BY ID ERROR:", error);
    res.status(500).json({ error: "Invalid ID format or server error" });
  }
};

export const getRecentlyHired = async (req, res) => {
  try {
    const userId = req.user.userId;

    const contracts = await HiredContract.find({ client: userId })
      .populate("freelancer", "firstName lastName title address photo")
      .sort({ createdAt: -1 });

    // Unique freelancers — latest job title dikhao
    const seen = new Set();
    const talents = [];

    for (const contract of contracts) {
      const f = contract.freelancer;
      if (!f) continue;

      const fId = f._id.toString();
      if (seen.has(fId)) continue;
      seen.add(fId);

      talents.push({
        _id: f._id,
        name: `${f.firstName} ${f.lastName}`,
        expertise: f.title || "Freelancer",
        location: [f.address?.city, f.address?.state]
          .filter(Boolean)
          .join(", "),
        photo: f.photo || "",
        jobTitle: contract.jobTitle,
      });
    }

    res.status(200).json({ success: true, talents });
  } catch (error) {
    console.error("GET RECENTLY HIRED ERROR:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// import User from "../models/User.js"; // apna path use karo

// ─── GET /api/profile ─────────────────────────────────────────────────────────
// Logged in freelancer ka apna profile fetch karo
export const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).select("-password -otp -otpExpiry -deleteOtp -deleteOtpExpiry -tokenVersion");

    if (!user) return res.status(404).json({ message: "User not found" });

    // Frontend ke format mein map karo
    const profile = {
      id: user._id,
      avatar: user.photo || null,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      verified: user.isVerified,
      location: [user.address?.city, user.address?.state].filter(Boolean).join(", "),
      title: user.title || "",
      bio: user.bio || "",

      // Stats
      totalJobs:      user.freelancer?.completedProjects || 0,
      totalEarnings:  user.freelancer?.isEarningsPrivate
                        ? "Private"
                        : `₹${(user.freelancer?.earnings || 0).toLocaleString("en-IN")}`,
      jobSuccess:     `${user.freelancer?.jobSuccess || 0}%`,

      // Languages — schema: { language, proficiency } → frontend: { lang, level }
      languages: (user.languages || []).map((l) => ({
        lang:  l.language,
        level: l.proficiency,
      })),

      // Skills
      skills: user.skills || [],

      // Education — schema: { institution, degree, passingYear, fieldOfStudy, description }
      //           → frontend: { institution, degree, field, year, description }
      education: (user.education || []).map((e) => ({
        institution: e.institution,
        degree:      e.degree,
        field:       e.fieldOfStudy,
        year:        e.passingYear,
        description: e.description,
      })),

      // Work History (from jobs — read only, empty for now)
      workHistory: {
        completed:  [],
        inProgress: [],
      },

      // Work Experience — schema: { title, company, startDate, endDate, current, description }
      //                 → frontend: { title, company, startDate, endDate, current, description }
      workExperience: (user.experiences || []).map((e) => ({
        title:       e.title,
        company:     e.company,
        startDate:   e.startDate,
        endDate:     e.endDate,
        current:     e.current || false,
        description: e.description,
      })),

      // Certifications
      certifications: (user.certifications || []).map((c) => ({
        name:          c.name,
        issuer:        c.issuer,
        issueDate:     c.issueDate,
        expiryDate:    c.expiryDate,
        noExpiry:      c.noExpiry,
        credentialUrl: c.credentialUrl,
      })),

      // Other Experiences
      otherExperiences: (user.otherExperiences || []).map((o) => ({
        title:        o.title,
        type:         o.type,
        organization: o.organization,
        year:         o.year,
        description:  o.description,
      })),
    };

    res.json(profile);
  } catch (error) {
    console.error("GET PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── PUT /api/profile ─────────────────────────────────────────────────────────
// Profile update — sirf allowed fields update honge
export const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      title,
      bio,
      avatar,           // base64 photo
      languages,        // [{ lang, level }]
      skills,           // [String]
      education,        // [{ institution, degree, field, year, description }]
      workExperience,   // [{ title, company, startDate, endDate, current, description }]
      certifications,   // [{ name, issuer, issueDate, expiryDate, noExpiry, credentialUrl }]
      otherExperiences, // [{ title, type, organization, year, description }]
    } = req.body;

    // Build update object — sirf jo bheja hai wahi update hoga
    const updateFields = {};

    if (title              !== undefined) updateFields.title = title;
    if (bio                !== undefined) updateFields.bio   = bio;
    if (avatar             !== undefined) updateFields.photo = avatar;
    if (skills             !== undefined) updateFields.skills = skills;

    // Languages — frontend { lang, level } → schema { language, proficiency }
    if (languages !== undefined) {
      updateFields.languages = languages.map((l) => ({
        language:    l.lang,
        proficiency: l.level,
      }));
    }

    // Education — frontend { institution, degree, field, year, description }
    //           → schema  { institution, degree, fieldOfStudy, passingYear, description }
    if (education !== undefined) {
      updateFields.education = education.map((e) => ({
        institution:  e.institution,
        degree:       e.degree,
        fieldOfStudy: e.field,
        passingYear:  e.year,
        description:  e.description,
      }));
    }

    // Work Experience → experiences
    if (workExperience !== undefined) {
      updateFields.experiences = workExperience.map((e) => ({
        title:       e.title,
        company:     e.company,
        startDate:   e.startDate,
        endDate:     e.endDate,
        current:     e.current || false,
        description: e.description,
      }));
    }

    // Certifications
    if (certifications !== undefined) {
      updateFields.certifications = certifications.map((c) => ({
        name:          c.name,
        issuer:        c.issuer,
        issueDate:     c.issueDate,
        expiryDate:    c.expiryDate,
        noExpiry:      c.noExpiry || false,
        credentialUrl: c.credentialUrl || "",
      }));
    }

    // Other Experiences
    if (otherExperiences !== undefined) {
      updateFields.otherExperiences = otherExperiences.map((o) => ({
        title:        o.title,
        type:         o.type,
        organization: o.organization,
        year:         o.year,
        description:  o.description,
      }));
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select("-password -otp -otpExpiry -deleteOtp -deleteOtpExpiry -tokenVersion");

    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// import User from "../models/User.js";   // apna path use karo
// import Job from "../models/Job.js";    // apna path use karo

// ─── GET /api/client/profile ─────────────────────────────────────────────────
// import User from "../models/User.js";   // apna path use karo
// import Job from "../models/Job.js";    // apna path use karo

// ─── GET /api/client/profile ─────────────────────────────────────────────────
export const getClientProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId)
      .select("-password -otp -otpExpiry -deleteOtp -deleteOtpExpiry -tokenVersion")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "client") return res.status(403).json({ message: "Not a client account" });

    const c = user.client || {};

    // ── Real stats from Job model ──────────────────────────────────────────
    const [projectsPosted, projectsCompleted, activeJobs] = await Promise.all([
      Job.countDocuments({ clientId: userId }),
      Job.countDocuments({ clientId: userId, status: "assigned" }),
      Job.countDocuments({ clientId: userId, status: "published" }),
    ]);

    // ── Recent Activity — last 5 jobs ─────────────────────────────────────
    const recentJobs = await Job.find({ clientId: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("title status createdAt assignedFreelancer")
      .populate("assignedFreelancer", "firstName lastName")
      .lean();

    const recentActivity = recentJobs.map((job) => {
      if (job.assignedFreelancer) {
        return {
          id:   job._id,
          text: `Hired ${job.assignedFreelancer.firstName} ${job.assignedFreelancer.lastName} for "${job.title}"`,
          time: formatTimeAgo(job.createdAt),
          type: "hire",
        };
      }
      return {
        id:   job._id,
        text: `Posted a new project "${job.title}"`,
        time: formatTimeAgo(job.createdAt),
        type: "post",
      };
    });

    const profile = {
      // Basic info
      companyName:       c.companyName  || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      industry:          c.industry     || "",
      location:          [user.address?.city, user.address?.state].filter(Boolean).join(", "),
      about:             c.about        || "",
      companySize:       c.companySize  || "",
      website:           c.website      || "",
      avatar:            user.photo     || "",
      memberSince:       formatMemberSince(user.createdAt),

      // Verification
      isEmailVerified:   user.isVerified         || false,
      isPaymentVerified: c.isPaymentVerified      || false,

      // Stats
      stats: {
        projectsPosted,
        freelancersHired: c.totalHires          || 0,
        totalSpent:       c.totalSpent          || 0,
        projectsCompleted,
        repeatHires:      c.repeatHires         || 0,
      },

      // Reviews — empty array for now (Review model bana ke fill karna)
      reviews: [],

      // Recent Activity from jobs
      recentActivity,

      // Payment method
      paymentMethod: c.paymentMethod?.last4
        ? {
            type:   c.paymentMethod.type,
            last4:  c.paymentMethod.last4,
            expiry: c.paymentMethod.expiry,
          }
        : null,
    };

    res.json({ success: true, data: profile });
  } catch (error) {
    console.error("GET CLIENT PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── PATCH /api/client/profile/about ─────────────────────────────────────────
export const updateClientAbout = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { about, industry, companySize, website } = req.body;

    const updateFields = {};
    if (about       !== undefined) updateFields["client.about"]       = about;
    if (industry    !== undefined) updateFields["client.industry"]    = industry;
    if (companySize !== undefined) updateFields["client.companySize"] = companySize;
    if (website     !== undefined) updateFields["client.website"]     = website;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true }
    ).lean();

    if (!updatedUser) return res.status(404).json({ message: "User not found" });

    const c = updatedUser.client;

    res.json({
      success: true,
      data: {
        about:       c.about,
        industry:    c.industry,
        companySize: c.companySize,
        website:     c.website,
      },
    });
  } catch (error) {
    console.error("UPDATE CLIENT ABOUT ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatMemberSince = (date) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

const formatTimeAgo = (date) => {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (mins  < 60)  return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  if (hours < 24)  return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  if (days  < 7)   return `${days} day${days !== 1 ? "s" : ""} ago`;
  if (weeks < 4)   return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
  return `${months} month${months !== 1 ? "s" : ""} ago`;
};

// ─── GET /api/client/profile/:clientId (Freelancer view — read only) ─────────
export const getClientPublicProfile = async (req, res) => {
  try {
    const { clientId } = req.params;

    const user = await User.findById(clientId)
      .select("-password -otp -otpExpiry -deleteOtp -deleteOtpExpiry -tokenVersion")
      .lean();

    if (!user) return res.status(404).json({ message: "Client not found" });
    if (user.role !== "client") return res.status(404).json({ message: "Not a client account" });

    const c = user.client || {};

    // ── Real stats ────────────────────────────────────────────────────────
    const [projectsPosted, projectsCompleted] = await Promise.all([
      Job.countDocuments({ clientId }),
      Job.countDocuments({ clientId, status: "assigned" }),
    ]);

    const profile = {
      companyName:       c.companyName || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      industry:          c.industry    || "",
      location:          [user.address?.city, user.address?.state].filter(Boolean).join(", "),
      about:             c.about       || "",
      companySize:       c.companySize || "",
      website:           c.website     || "",
      avatar:            user.photo    || "",
      memberSince:       formatMemberSince(user.createdAt),
      isEmailVerified:   user.isVerified          || false,
      isPaymentVerified: c.isPaymentVerified       || false,

      stats: {
        projectsPosted,
        freelancersHired:  c.totalHires       || 0,
        totalSpent:        null,               // hidden — private
        projectsCompleted,
        repeatHires:       c.repeatHires      || 0,
      },

      reviews: [],  // Review model banne ke baad fill hoga
    };

    res.json({ success: true, data: profile });
  } catch (error) {
    console.error("GET CLIENT PUBLIC PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};