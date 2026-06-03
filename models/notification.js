import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // fast query by userId
    },
    type: {
      type: String,
      required: true,
      enum: [
        "JOB_APPLIED",       // freelancer ne job pe apply kiya
        "JOB_ASSIGNED",      // client ne freelancer ko hire kiya
        "NEW_MESSAGE",       // naya message aaya
        "PAYMENT_RECEIVED",  // payment release hui
        "JOB_COMPLETED",     // job complete hui
      ],
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      trim: true,
      default: "",
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      // job._id / contract._id / message._id — frontend navigation ke liye
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true, // createdAt + updatedAt auto manage
  }
);

// Compound index — userId + isRead queries fast hongi
notificationSchema.index({ userId: 1, isRead: 1 });
// Auto delete notifications older than 60 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

export default mongoose.model("Notification", notificationSchema);