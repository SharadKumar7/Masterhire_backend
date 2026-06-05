import User from "../models/User.js";
import RecentlyViewedProfile from "../models/recentlyViewedProfile.js";
import SavedProfile from "../models/savedProfiles.js";
import Job from "../models/Jobs.js";

import { getDbCategoriesFromSearch ,CATEGORY_KEYWORD_MAP } from "../models/KeywordMap.js";


// import User from "../models/User.js"; // apna path use karo
// import User from "../models/User.js";  // apna path use karo
// import Job from "../models/Job.js";    // apna path use karo

export const getPlatformStats = async (req, res) => {
  try {
    const [totalUsers, totalJobs] = await Promise.all([
      User.countDocuments(),
      Job.countDocuments({ status: "published" }),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalJobs,
      },
    });
  } catch (error) {
    console.error("STATS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getCategoryCounts = async (req, res) => {
  try {
    // Ek baar mein saare freelancers ke domains fetch karo
    const freelancers = await User.find(
      { role: "freelancer" },
      { domains: 1 } // sirf domains field chahiye
    ).lean();

    const counts = {};

    for (const [categoryName, data] of Object.entries(CATEGORY_KEYWORD_MAP)) {
      const { dbCategories, dbSubCategories } = data;

      const count = freelancers.filter((user) => {
        if (!user.domains || user.domains.length === 0) return false;

        return user.domains.some((domain) => {
          // Main category match
          const mainMatch = dbCategories.some(
            (dbCat) =>
              domain.name?.toLowerCase().includes(dbCat.toLowerCase()) ||
              dbCat.toLowerCase().includes(domain.name?.toLowerCase())
          );

          if (mainMatch) return true;

          // Subcategory match
          if (!domain.subDomains || domain.subDomains.length === 0)
            return false;

          return domain.subDomains.some((sub) =>
            dbSubCategories.some(
              (dbSub) =>
                sub?.toLowerCase().includes(dbSub.toLowerCase()) ||
                dbSub.toLowerCase().includes(sub?.toLowerCase())
            )
          );
        });
      }).length;

      counts[categoryName] = count;
    }

    res.json({ success: true, counts });
  } catch (error) {
    console.error("CATEGORY COUNTS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};
// import User from "../models/User.js";         // apna path use karo
// import SavedProfile from "../models/SavedProfile.js"; // apna path use karo

// ─── Helper: single freelancer format karo ───────────────────────────────────
const formatFreelancer = (user, savedProfileIds) => ({
  id: user._id,
  image: user.photo,
  fullName: `${user.firstName} ${user.lastName}`,
  domain: user.domains.map((d) => d.name).join(", "),
  skills: user.skills,
  location: `${user.address?.city || ""}, ${user.address?.state || ""}`
    .trim()
    .replace(/^,|,$/g, ""),
  totalJobs: user.totalJobs || 0,
  jobSuccess: user.jobSuccess || 0,
  totalEarnings: user.totalEarnings || 0,
  rating: user.rating || 0,
  title: user.title || "Unknown Title",
  available: user.available || false,
  consultation: user.consultation || false,
  isSaved: savedProfileIds.has(user._id.toString()) || false,
});

// ─── Main Controller ──────────────────────────────────────────────────────────
export const searchFreelancers = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const {
      category, subcategory, skill, rating, jobSuccess,
      englishLevel, language, consultation, available,
      search,
      page = 1,       // ← pagination
      limit = 10,     // ← default 10
    } = req.query;
 
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit))); // max 50
    const skip     = (pageNum - 1) * limitNum;
 
    let query = { role: "freelancer" };
 
    // 🔍 SEARCH BAR
    if (search && search.trim()) {
      const s = search.trim();
 
      if (s.includes("@")) {
        const emailMatch = await User.findOne({
          role: "freelancer",
          email: { $regex: `^${s}$`, $options: "i" },
        });
        if (emailMatch) {
          return res.json({
            success: true,
            count: 1,
            totalCount: 1,
            hasMore: false,
            freelancers: [formatFreelancer(emailMatch)],
          });
        }
        return res.json({ success: true, count: 0, totalCount: 0, hasMore: false, freelancers: [] });
      }
 
      const { dbCategories, dbSubCategories } = getDbCategoriesFromSearch(s);
      const orConditions = [
        { title: { $regex: s, $options: "i" } },
        { skills: { $elemMatch: { $regex: s, $options: "i" } } },
      ];
      if (dbCategories.length > 0) {
        orConditions.push({ domains: { $elemMatch: { name: { $in: dbCategories } } } });
      }
      if (dbSubCategories.length > 0) {
        orConditions.push({ domains: { $elemMatch: { subDomains: { $elemMatch: { $in: dbSubCategories } } } } });
      }
      query.$or = orConditions;
    }
 
    // 📂 CATEGORY
    if (category && category !== "All") {
      query.domains = { $elemMatch: { name: { $regex: category, $options: "i" } } };
    }
 
    // 📂 SUBCATEGORY
    if (subcategory && subcategory !== "All") {
      if (query.domains?.$elemMatch) {
        query.domains.$elemMatch.subDomains = { $elemMatch: { $regex: subcategory, $options: "i" } };
      } else {
        query.domains = { $elemMatch: { subDomains: { $elemMatch: { $regex: subcategory, $options: "i" } } } };
      }
    }
 
    // 🧠 SKILLS
    if (skill && skill !== "All") {
      query.skills = { $elemMatch: { $regex: skill, $options: "i" } };
    }
 
    // ⭐ RATING
    if (rating && rating !== "All") {
      query.rating = { $gte: Number(rating) };
    }
 
    // 📊 JOB SUCCESS
    if (jobSuccess && jobSuccess !== "All") {
      const num = parseInt(jobSuccess);
      if (!isNaN(num)) query.jobSuccess = { $gte: num };
    }
 
    // 🌐 LANGUAGE
    let languageFilter = [];
    if (englishLevel && englishLevel !== "All") {
      languageFilter.push({ name: "English", level: englishLevel });
    }
    if (language && language !== "All") {
      languageFilter.push({ name: language });
    }
    if (languageFilter.length > 0) {
      query.languages = { $elemMatch: { $or: languageFilter } };
    }
 
    // 🤝 CONSULTATION
    if (consultation === "true") query.consultation = true;
 
    // 🟢 AVAILABLE
    if (available === "true") query.available = true;
 
    // ── Saved profiles (only if logged in) ───────────────────────────────────
    let savedProfileIds = new Set();
    if (userId) {
      const savedProfiles = await SavedProfile.find({ savedBy: userId }).select("profile");
      savedProfileIds = new Set(savedProfiles.map((item) => item.profile.toString()));
    }
 
    // ── Fetch with pagination ─────────────────────────────────────────────────
    const [freelancers, totalCount] = await Promise.all([
      User.find(query).sort({ rating: -1 }).skip(skip).limit(limitNum),
      User.countDocuments(query),
    ]);
 
    const formattedFreelancers = freelancers.map((user) =>
      formatFreelancer(user, savedProfileIds)
    );
 
    res.json({
      success: true,
      count: formattedFreelancers.length,
      totalCount,
      hasMore: skip + limitNum < totalCount, // ← infinite scroll ke liye
      page: pageNum,
      freelancers: formattedFreelancers,
    });
 
  } catch (error) {
    console.log("FREELANCER SEARCH ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getTopFreelancers = async (req, res) => {
  try {
    const userId = req.user?.userId;
    // 👉 Step 1: Fetch freelancers (limit for performance)
    const freelancers = await User.find({ role: "freelancer" }).limit(50);

    // 👉 Step 2: Calculate score
    const rankedFreelancers = freelancers.map((user) => {
      const rating = user.rating || 0;
      const jobSuccess = user.jobSuccess || 0;
      const totalJobs = user.totalJobs || 0;
      const earnings = user.totalEarnings || 0;

      const score =
        rating * 0.4 + jobSuccess * 0.3 + totalJobs * 0.2 + earnings * 0.1;

      return {
        user,
        score,
      };
    });

    const savedProfiles = await SavedProfile.find({
      savedBy: userId,
    }).select("profile");

    const savedProfileIds = new Set(
      savedProfiles.map((item) => item.profile.toString()),
    );

    // 👉 Step 3: Sort by score (highest first)
    rankedFreelancers.sort((a, b) => b.score - a.score);

    // 👉 Step 4: Take top 10
    const topFreelancers = rankedFreelancers.slice(0, 10);

    // 👉 Step 5: Format response
    const formatted = topFreelancers.map(({ user }) => ({
      id: user._id,
      photo: user.photo,
      fullName:
        `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User",

      title: user.title || "",
      bio: user.bio || "",

      rating: user.rating || 0,
      jobSuccess: user.jobSuccess || 0,
      totalJobs: user.totalJobs || 0,

      available: user.available || false,
      consultation: user.consultation || false,

      isSaved: savedProfileIds.has(user._id.toString()),
    }));

    res.json({
      success: true,
      count: formatted.length,
      freelancers: formatted,
    });
  } catch (error) {
    console.log("TOP FREELANCER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Track a viewed profile (Create/Update)
// @route   POST /api/profiles/:id/view
export const trackProfileView = async (req, res, next) => {
  try {
    const viewerId = req.user?.userId;
    const profileId = req.params.id;


    // ❌ avoid self tracking
    if (viewerId && viewerId !== profileId) {
      await RecentlyViewedProfile.findOneAndUpdate(
        { viewedBy: viewerId, profile: profileId },
        {},
        { upsert: true, new: true },
      );
    }

    next();
  } catch (error) {
    console.error("TRACK PROFILE ERROR:", error);
    next();
  }
};

// @desc    Get paginated recently viewed profiles
// @route   GET /api/profiles/recently-viewed
export const getRecentlyViewedProfiles = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await RecentlyViewedProfile.countDocuments({
      viewedBy: userId,
    });

    const savedProfiles = await SavedProfile.find({
      savedBy: userId,
    }).select("profile");

    const savedProfileIds = new Set(
      savedProfiles.map((item) => item.profile.toString()),
    );

    const recentEntries = await RecentlyViewedProfile.find({ viewedBy: userId })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "profile",
        select:
          "firstName lastName title photo rating jobSuccess totalJobs consultation available bio",
      });

    const validProfiles = recentEntries
      .filter((entry) => entry.profile)
      .map((entry) => ({
        ...entry.profile.toObject(),
        viewedAt: entry.updatedAt,
        isSaved: savedProfileIds.has(entry.profile._id.toString()),
      }));

    res.json({
      success: true,
      profiles: validProfiles,
      page,
      limit,
      total,
      hasMore: skip + limit < total,
    });
  } catch (error) {
    console.error("GET RECENT PROFILES ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};
