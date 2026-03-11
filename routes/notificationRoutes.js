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
      receiver: req.user._id,
    })
      .populate("sender", "name profileImage email")
      .populate("item", "title images")
      .populate("message")
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
      receiver: req.user._id,
      isRead: false,
    });

    res.json({ count });
  } catch (error) {
    console.error("Unread count error:", error);
    res.status(500).json({ message: "Failed to get unread count" });
  }
});

/* ==========================================
   🧠 GET ONLY AI MATCH NOTIFICATIONS
   GET /api/notifications/matches
========================================== */
router.get("/matches", protect, async (req, res) => {
  try {
    const matches = await Notification.find({
      receiver: req.user._id,
      type: "match",
    })
      .populate("sender", "name profileImage")
      .populate("item", "title images")
      .sort({ createdAt: -1 });

    res.json(matches);
  } catch (error) {
    console.error("Match notifications error:", error);
    res.status(500).json({ message: "Failed to fetch match notifications" });
  }
});

/* ==========================================
   ✅ MARK ALL AS READ
   PUT /api/notifications/mark-all-read
========================================== */
router.put("/mark-all-read", protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { receiver: req.user._id, isRead: false },
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
      { _id: req.params.id, receiver: req.user._id },
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

/* ==========================================
   🗑 DELETE A NOTIFICATION
   DELETE /api/notifications/:id
========================================== */
router.delete("/:id", protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      receiver: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ message: "Notification deleted" });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({ message: "Failed to delete notification" });
  }
});

export default router;