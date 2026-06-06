// models/Transaction.js
import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },
    role: {
      type:     String,
      enum:     ["client", "freelancer"],
      required: true,
    },
    type: {
      type: String,
      enum: [
        // Freelancer types
        "Milestone Payment",
        "Project Payment",
        "Withdrawal",
        "Platform Fee",
        "Refund",
        // Client types
        "Milestone Release",
        "Escrow Deposit",
        "Wallet Top-up",
        "Refund Received",
      ],
      required: true,
    },
    typeIcon: {
      type:    String,
      default: "arrowDown",
    },
    description: {
      type:    String,
      default: "",
    },
    project: {
      type:    String,
      default: "—",
    },
    jobId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Job",
      default: null,
    },
    amount: {
      type:     Number,
      required: true,
      min:      0,
    },
    isCredit: {
      type:    Boolean,
      default: true,   // true = money in, false = money out
    },
    status: {
      type: String,
      enum: [
        "Paid", "Completed", "Deducted", "Refunded",   // freelancer
        "Released", "Held", "Pending",                  // client
      ],
      default: "Completed",
    },

    // For chart grouping
    date:      { type: String, default: "" },      // "May 28, 2024"
    time:      { type: String, default: "" },      // "11:30 AM"
    dateValue: { type: Date,   default: Date.now },// for range queries

    // ✅ NEW: Razorpay tracking
    razorpayOrderId: {
      type:    String,
      default: null,
    },
    razorpayPaymentId: {
      type:    String,
      default: null,
    },
  },
  { timestamps: true }
);

transactionSchema.index({ user: 1, dateValue: -1 });
transactionSchema.index({ user: 1, role: 1, dateValue: -1 });

export default mongoose.model("Transaction", transactionSchema);