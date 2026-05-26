// controllers/profileController.js

import User from "../models/User.js";


// ─────────────────────────────────────────
// GET /api/profiles/:id
// ─────────────────────────────────────────
export const getProfileById = async (req, res) => {
  try {
    const { id } = req.params;

    // Use User model instead of undefined 'profiles' array
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

