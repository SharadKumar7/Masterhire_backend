import User from "../models/User.js";
import RecentlyViewedProfile from "../models/recentlyViewedProfile.js";

export const searchFreelancers = async (req, res) => {
  try {
    const {
      category,
      subcategory,
      skill,
      rating,
      jobSuccess,
      englishLevel,
      language,
      consultation,
      available,
    } = req.query;

    let query = {
      role: "freelancer",
    };

    // 📂 CATEGORY (domain array)
    if (category && category !== "All") {
  query.domains = {
    $elemMatch: {
      name: { $regex: category, $options: "i" },
    },
  };
}

    // 📂 SUBCATEGORY (if stored separately)
    if (subcategory && subcategory !== "All") {
  query.domains = {
    $elemMatch: {
      subDomains: { $regex: subcategory, $options: "i" },
    },
  };
}

    // 🧠 SKILLS (array match)
    if (skill && skill !== "All") {
      query.skills = { $elemMatch: { $regex: skill, $options: "i" } };
    }

    // ⭐ RATING
    if (rating && rating !== "All") {
      query.rating = { $gte: Number(rating) };
    }

    // 📊 JOB SUCCESS
    if (jobSuccess && jobSuccess !== "All") {
      query.jobSuccess = { $gte: Number(jobSuccess) };
    }

    // 🌐 LANGUAGE FILTER
    let languageFilter = [];

    if (englishLevel && englishLevel !== "All") {
      languageFilter.push({
        name: "English",
        level: englishLevel,
      });
    }

    if (language && language !== "All") {
      languageFilter.push({
        name: language,
      });
    }

    if (languageFilter.length > 0) {
      query.languages = {
        $elemMatch: { $or: languageFilter },
      };
    }

    // 🤝 CONSULTATION
    if (consultation === "true") {
      query.consultation = true;
    }

    // 🟢 AVAILABLE
    if (available === "true") {
      query.available = true;
    }

    const freelancers = await User.find(query).sort({ rating: -1 });

    // 🎯 FORMAT RESPONSE
    const formattedFreelancers = freelancers.map((user) => ({
      id: user._id,

      image: user.photo,
      fullName: `${user.firstName} ${user.lastName}`,

      domain: user.domains.map((d) => d.name).join(", "),
      skills: user.skills,

      location: `${user.address?.city || ""}, ${user.address?.state || ""}`.trim().replace(/^,|,$/g, ""),


      totalJobs: user.totalJobs || 0,
      jobSuccess: user.jobSuccess || 0,
      totalEarnings: user.totalEarnings || 0,

      rating: user.rating || 0,

      title: user.title || "Unknown Title",

      available: user.available || false,
      consultation: user.consultation || false,
    }));

    res.json({
      success: true,
      count: formattedFreelancers.length,
      freelancers: formattedFreelancers,
    });
  } catch (error) {
    console.log("FREELANCER SEARCH ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


export const getTopFreelancers = async (req, res) => {
  try {
    // 👉 Step 1: Fetch freelancers (limit for performance)
    const freelancers = await User.find({ role: "freelancer" }).limit(50);

    // 👉 Step 2: Calculate score
    const rankedFreelancers = freelancers.map((user) => {
      const rating = user.rating || 0;
      const jobSuccess = user.jobSuccess || 0;
      const totalJobs = user.totalJobs || 0;
      const earnings = user.totalEarnings || 0;

      const score =
        rating * 0.4 +
        jobSuccess * 0.3 +
        totalJobs * 0.2 +
        earnings * 0.1;

      return {
        user,
        score,
      };
    });

    // 👉 Step 3: Sort by score (highest first)
    rankedFreelancers.sort((a, b) => b.score - a.score);

    // 👉 Step 4: Take top 10
    const topFreelancers = rankedFreelancers.slice(0, 10);

    // 👉 Step 5: Format response
    const formatted = topFreelancers.map(({ user }) => ({
      id: user._id,
      image: user.photo,
      fullName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User",

      domain: user.domains?.map((d) => d.name) || [],
      skills: user.skills || [],

      rating: user.rating || 0,
      jobSuccess: user.jobSuccess || 0,
      totalJobs: user.totalJobs || 0,

      available: user.available || false,
      consultation: user.consultation || false,
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

    console.log("TRACK CALLED", viewerId, profileId);

    // ❌ avoid self tracking
    if (viewerId && viewerId !== profileId) {
      await RecentlyViewedProfile.findOneAndUpdate(
        { viewedBy: viewerId, profile: profileId },
        {},
        { upsert: true, new: true }
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

    const total = await RecentlyViewedProfile.countDocuments({ viewedBy: userId });

    const recentEntries = await RecentlyViewedProfile.find({ viewedBy: userId })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "profile",
        select: "firstName lastName title avatar hourlyRate skills bio",
      });

      console.log("ENTRIES:", recentEntries);
    const validProfiles = recentEntries
      .filter((entry) => entry.profile)
      .map((entry) => ({
        ...entry.profile.toObject(),
        viewedAt: entry.updatedAt,
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