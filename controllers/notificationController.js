const Notification = require("../models/Notification");
const mongoose = require("mongoose");

// ==========================================
// 🔔 GET USER NOTIFICATIONS
// GET /api/notifications
// ==========================================
exports.getNotifications = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user._id);

    const notifications = await Notification.find({
      recipient: userId,
    })
      .populate("sender", "name profileImage email")
      .populate("item", "_id title")
      .sort({ createdAt: -1 });

    res.json(notifications);
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
};

// ==========================================
// ✅ MARK NOTIFICATION AS READ
// PUT /api/notifications/:id/read
// ==========================================
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );

    res.json(notification);
  } catch (error) {
    console.error("Mark notification read error:", error);
    res.status(500).json({ message: "Failed to mark as read" });
  }
};