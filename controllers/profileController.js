// controllers/savedProfileController.js
import SavedProfile from "../models/savedProfiles.js";
import User from "../models/User.js";
import HiredContract from "../models/HiredContract.js";

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
