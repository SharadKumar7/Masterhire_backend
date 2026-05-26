import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },

  type: {
    type: String,
    required: true,
    // 👇 frontend isse decide karega UI
    enum: [
      "JOB_APPLIED",
      "JOB_ASSIGNED",
      "NEW_MESSAGE",
      "PAYMENT_RECEIVED",
      "JOB_COMPLETED",
    ],
  },

  title: String,
  message: String,

  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },

  isRead: {
    type: Boolean,
    default: false,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Notification", notificationSchema);