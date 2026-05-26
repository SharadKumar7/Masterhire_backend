import express from "express";
import { getNotifications, markAsRead } from "../controllers/notificationController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();



router.get("/notifications", protect, getNotifications);
router.put("/notifications/:id/read", protect, markAsRead);

export default router;