import Message from "../models/message.js";
import Job from "../models/Jobs.js";
import { getFileType, formatFileSize } from "../middleware/upload.js";
import { createNotification } from "./notificationController.js"; // ✅ ADD THIS

// ─── GET /api/client/messages/:freelancerId ───────────────────────────────────
export const getMessages = async (req, res) => {
  try {
    const { freelancerId } = req.params;
    const { jobId }        = req.query;
    const myId             = req.user.userId?.toString();

    if (!jobId) return res.status(400).json({ message: "jobId is required" });

    const messages = await Message.find({
      jobId,
      $or: [
        { senderId: myId,         receiverId: freelancerId },
        { senderId: freelancerId, receiverId: myId },
      ],
    }).sort({ createdAt: 1 }).lean();

    await Message.updateMany(
      { jobId, senderId: freelancerId, receiverId: myId, isRead: false },
      { isRead: true }
    );

    const shaped = messages.map((m) => ({
      ...m,
      senderId:   m.senderId.toString() === myId ? "me" : m.senderId,
      senderRole: m.senderId.toString() === myId
        ? req.user.role
        : (req.user.role === "client" ? "freelancer" : "client"),
    }));

    res.json({ messages: shaped });
  } catch (err) {
    console.error("getMessages error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── POST /api/client/messages ───────────────────────────────────────────────
export const sendMessage = async (req, res) => {
  try {
    const { receiverId, jobId, text } = req.body;
    const senderId = req.user.userId?.toString();
    const role     = req.user.role;

    if (!receiverId || !jobId) {
      return res.status(400).json({ message: "receiverId and jobId are required" });
    }

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const isClient     = job.clientId.toString()            === senderId;
    const isFreelancer = job.assignedFreelancer?.toString() === senderId;
    if (!isClient && !isFreelancer) {
      return res.status(403).json({ message: "You are not part of this project" });
    }

    let fileUrl = null, fileName = null, fileSize = null, fileType = null;
    if (req.file) {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      fileUrl  = `${baseUrl}/uploads/${req.file.filename}`;
      fileName = req.file.originalname;
      fileSize = formatFileSize(req.file.size);
      fileType = getFileType(req.file.mimetype);
    }

    if (!text?.trim() && !fileUrl) {
      return res.status(400).json({ message: "Message must have text or a file" });
    }

    const message = await Message.create({
      jobId, senderId, receiverId, senderRole: role,
      text: text?.trim() || "",
      fileUrl, fileName, fileSize, fileType,
    });

    // ✅ Receiver ko — new message notification
    // Role ke hisaab se message label alag hoga
    const senderLabel = role === "client" ? "Client" : "Freelancer";
    const preview     = text?.trim()
      ? (text.trim().length > 50 ? text.trim().slice(0, 50) + "…" : text.trim())
      : `Sent a ${fileType || "file"}`;

    await createNotification({
      userId:      receiverId,
      type:        "NEW_MESSAGE",
      title:       `New Message from ${senderLabel}`,
      message:     `${preview} — regarding "${job.title}"`,
      referenceId: job._id,
    });

    res.status(201).json({
      message: { ...message.toObject(), senderId: "me", senderRole: role },
    });
  } catch (err) {
    console.error("sendMessage error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── POST /api/client/messages/call-log ──────────────────────────────────────
export const saveCallLog = async (req, res) => {
  try {
    const { receiverId, jobId, callType, callStatus, callDuration } = req.body;
    const senderId = req.user.userId?.toString();
    const role     = req.user.role;

    if (!receiverId || !jobId) {
      return res.status(400).json({ message: "receiverId and jobId are required" });
    }

    const message = await Message.create({
      jobId, senderId, receiverId, senderRole: role,
      text:         "",
      messageType:  "call_log",
      callType,
      callStatus,
      callDuration: callDuration || 0,
    });

    res.status(201).json({
      message: { ...message.toObject(), senderId: "me", senderRole: role },
    });
  } catch (err) {
    console.error("saveCallLog error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /api/messages/unread-count ──────────────────────────────────────────
export const getUnreadCount = async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiverId: req.user.userId,
      isRead:     false,
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── PATCH /api/messages/read ─────────────────────────────────────────────────
export const markAsRead = async (req, res) => {
  try {
    const { jobId, senderId } = req.body;
    await Message.updateMany(
      { jobId, senderId, receiverId: req.user.userId, isRead: false },
      { isRead: true }
    );
    res.json({ message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};