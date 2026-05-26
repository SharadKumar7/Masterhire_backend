// models/RecentlyViewedJob.js
import mongoose from "mongoose";

const recentlyViewedJobSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    job:  { type: mongoose.Schema.Types.ObjectId, ref: "Job",  required: true },
  },
  { timestamps: true }
);

// ✅ One entry per user+job combo (enforced at DB level)
recentlyViewedJobSchema.index({ user: 1, job: 1 }, { unique: true });

export default mongoose.model("RecentlyViewedJob", recentlyViewedJobSchema);