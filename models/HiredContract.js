// models/HiredContract.js
import mongoose from "mongoose";

const hiredContractSchema = new mongoose.Schema(
  {
    client:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    jobTitle:   { type: String, required: true, trim: true },
    finalAmount: { type: Number, default: 0 }, 
    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active",
    },
  },
  { timestamps: true }
);

// One client can hire same freelancer multiple times (different jobs) — no unique index
hiredContractSchema.index({ client: 1, freelancer: 1 });

export default mongoose.model("HiredContract", hiredContractSchema);