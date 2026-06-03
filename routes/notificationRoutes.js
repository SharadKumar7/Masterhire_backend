import express from "express";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
} from "../controllers/notificationController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require login
router.use(protect);

// GET    /api/notifications           → get all notifications + unread count
router.get("/notifications", getNotifications);

// PATCH  /api/notifications/read-all  → mark all as read
// ⚠️ read-all MUST be before /:id/read — otherwise express matches "read-all" as an id
router.patch("/notifications/read-all", markAllAsRead);

// PATCH  /api/notifications/:id/read  → mark single as read
router.patch("/notifications/:id/read", markAsRead);

// DELETE /api/notifications           → clear all
router.delete("/notifications", clearAllNotifications);

// DELETE /api/notifications/:id       → delete single
router.delete("/notifications/:id", deleteNotification);

export default router;