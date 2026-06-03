import Notification from "../models/notification.js";

// ─── GET /api/notifications ───────────────────────────────────────────────────
// Get all notifications for logged-in user
export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false,
    });

    res.status(200).json({ notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch notifications", error: err.message });
  }
};

// ─── PATCH /api/notifications/:id/read ───────────────────────────────────────
// Mark single notification as read
export const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification)
      return res.status(404).json({ message: "Notification not found" });

    res.status(200).json({ message: "Marked as read", notification });
  } catch (err) {
    res.status(500).json({ message: "Failed to update", error: err.message });
  }
};

// ─── PATCH /api/notifications/read-all ───────────────────────────────────────
// Mark all notifications as read
export const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true }
    );

    res.status(200).json({ message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ message: "Failed to update", error: err.message });
  }
};

// ─── DELETE /api/notifications/:id ───────────────────────────────────────────
// Delete single notification
export const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!notification)
      return res.status(404).json({ message: "Notification not found" });

    res.status(200).json({ message: "Notification deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete", error: err.message });
  }
};

// ─── DELETE /api/notifications ────────────────────────────────────────────────
// Clear all notifications for user
export const clearAllNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.user._id });
    res.status(200).json({ message: "All notifications cleared" });
  } catch (err) {
    res.status(500).json({ message: "Failed to clear", error: err.message });
  }
};

// ─── INTERNAL HELPER — use this in other controllers ─────────────────────────
// Do NOT expose this as a route
// Usage: await createNotification({ userId, type, title, message, referenceId })
export const createNotification = async ({
  userId,
  type,
  title,
  message = "",
  referenceId = null,
}) => {
  try {
    await Notification.create({ userId, type, title, message, referenceId });
  } catch (err) {
    // Never crash the main flow if notification fails
    console.error("Notification create failed:", err.message);
  }
};