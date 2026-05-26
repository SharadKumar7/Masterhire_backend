import Notification from "../models/notification.js";

export const createNotification = async ({
  userId,
  type,
  title,
  message,
  referenceId,
}) => {
  try {
    await Notification.create({
      userId,
      type,
      title,
      message,
      referenceId,
    });
  } catch (error) {
    console.log("Notification Error:", error);
  }
};

export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: notifications,
    });

  } catch (error) {
    res.status(500).json({ message: "Error fetching notifications" });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    await Notification.findByIdAndUpdate(id, { isRead: true });

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ message: "Error updating notification" });
  }
};