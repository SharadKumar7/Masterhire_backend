import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    bidAmount: {
      type: Number,
      required: true,
    },
    proposal: {
      type: String,
    },
    status: {
      type: String,
      // ✅ Added "negotiation" to enum
      enum: ["pending", "accepted", "rejected", "negotiation"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// ❗ duplicate apply prevent
applicationSchema.index({ user: 1, job: 1 }, { unique: true });

export default mongoose.model("Application", applicationSchema);