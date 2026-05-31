// models/SavedProfile.js
import mongoose from "mongoose";

const savedProfileSchema = new mongoose.Schema(
  {
    savedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // client
    profile: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // freelancer
  },
  { timestamps: true }
);

// ✅ One entry per client+freelancer combo (DB level) — no duplicates
savedProfileSchema.index({ savedBy: 1, profile: 1 }, { unique: true });

export default mongoose.model("SavedProfile", savedProfileSchema);