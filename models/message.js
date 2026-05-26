import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    jobId:      { type: mongoose.Schema.Types.ObjectId, ref: "Job",  required: true },
    senderId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    senderRole: {
      type:     String,
      enum:     ["client", "freelancer"],
      required: true,
    },

    text:     { type: String, trim: true, default: "" },
    fileUrl:  { type: String, default: null },
    fileName: { type: String, default: null },
    fileSize: { type: String, default: null },
    fileType: {
      type:    String,
      enum:    ["image", "video", "document", "audio", null],
      default: null,
    },

    // ── Call log ──────────────────────────────────────────────────────────────
    messageType: {
      type:    String,
      enum:    ["text", "call_log"],
      default: "text",
    },
    callType:     { type: String, enum: ["audio", "video", null], default: null },
    callStatus:   { type: String, enum: ["missed", "ended", "rejected", null], default: null },
    callDuration: { type: Number, default: 0 }, // seconds

    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ jobId: 1, createdAt: 1 });
messageSchema.index({ jobId: 1, senderId: 1, receiverId: 1 });
messageSchema.index({ jobId: 1, receiverId: 1, isRead: 1 });

export default mongoose.model("Message", messageSchema);