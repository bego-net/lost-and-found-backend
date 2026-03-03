// routes/notificationRoutes.js

import express from "express";
import Notification from "../models/Notification.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ==========================================
   🔔 GET ALL NOTIFICATIONS (Current User)
   GET /api/notifications
========================================== */
router.get("/", protect, async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user._id,
    })
      .populate("sender", "name profileImage email") // ✅ FIXED
      .populate("item", "title images")
      .populate("message") // ✅ IMPORTANT
      .sort({ createdAt: -1 });

    res.json(notifications);
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

/* ==========================================
   🔴 GET UNREAD COUNT
   GET /api/notifications/unread/count
========================================== */
router.get("/unread/count", protect, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    res.json({ count });
  } catch (error) {
    console.error("Unread count error:", error);
    res.status(500).json({ message: "Failed to get unread count" });
  }
});

/* ==========================================
   ✅ MARK ALL AS READ
   PUT /api/notifications/mark-all-read
   ⚠️ MUST COME BEFORE :id ROUTE
========================================== */
router.put("/mark-all-read", protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Mark all read error:", error);
    res.status(500).json({ message: "Failed to mark all as read" });
  }
});

/* ==========================================
   ✅ MARK ONE NOTIFICATION AS READ
   PUT /api/notifications/:id/read
========================================== */
router.put("/:id/read", protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true },
      { new: true }
    )
      .populate("sender", "name profileImage email")
      .populate("item", "title images")
      .populate("message");

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json(notification);
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).json({ message: "Failed to mark as read" });
  }
});

export default router;