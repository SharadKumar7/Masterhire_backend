// models/RecentlyViewedProfile.js
import mongoose from "mongoose";

const recentlyViewedProfileSchema = new mongoose.Schema(
  {
    viewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // client
    profile:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // freelancer
  },
  { timestamps: true }
);

// ✅ One entry per client+freelancer combo (DB level)
recentlyViewedProfileSchema.index({ viewedBy: 1, profile: 1 }, { unique: true });

export default mongoose.model("RecentlyViewedProfile", recentlyViewedProfileSchema);