// models/Withdrawal.js
import mongoose from "mongoose";

const withdrawalSchema = new mongoose.Schema(
  {
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },
    amount: {
      type:     Number,
      required: true,
      min:      1,
    },
    status: {
      type:    String,
      enum:    ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    method: {
      type:    String,
      enum:    ["bank", "upi", "wallet"],
      default: "bank",
    },
    remarks: {
      type:    String,
      default: "",
    },
    processedAt: {
      type:    Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Withdrawal", withdrawalSchema);