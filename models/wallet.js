// models/Wallet.js
import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      unique:   true,
    },
    role: {
      type:    String,
      enum:    ["client", "freelancer"],
      required: true,
    },
    balance: {
      type:    Number,
      default: 0,
      min:     0,
    },
    escrowHeld: {
      type:    Number,
      default: 0, // client only — funds locked in escrow
    },
    pendingRelease: {
      type:    Number,
      default: 0, // freelancer only — earned but not yet released
    },
    totalEarned: {
      type:    Number,
      default: 0, // freelancer only
    },
    totalSpent: {
      type:    Number,
      default: 0, // client only
    },
    totalWithdrawn: {
      type:    Number,
      default: 0, // freelancer only
    },
    totalReleased: {
      type:    Number,
      default: 0, // client only — total released to freelancers
    },
    platformFeesPaid: {
      type:    Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Wallet", walletSchema);