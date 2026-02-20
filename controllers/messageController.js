const Message = require("../models/Message");
const mongoose = require("mongoose");

// ==========================================
// 💬 GET CONVERSATION BETWEEN 2 USERS
// GET /api/messages/conversation/:itemId/:userId
// ==========================================
exports.getConversation = async (req, res) => {
  try {
    const { itemId, userId } = req.params;

    const itemObjectId = new mongoose.Types.ObjectId(itemId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const currentUserId = new mongoose.Types.ObjectId(req.user._id);

    // 1️⃣ Get messages
    const messages = await Message.find({
      item: itemObjectId,
      $or: [
        { sender: currentUserId, receiver: userObjectId },
        { sender: userObjectId, receiver: currentUserId },
      ],
    })
      .populate("sender", "name avatar email")
      .populate("receiver", "name avatar email")
      .sort({ createdAt: 1 });

    // 2️⃣ Automatically mark unread messages as read
    const result = await Message.updateMany(
      {
        item: itemObjectId,
        sender: userObjectId,
        receiver: currentUserId,
        read: false,
      },
      { $set: { read: true } }
    );

    console.log("Auto marked as read:", result.modifiedCount);

    res.json(messages);
  } catch (error) {
    console.error("Conversation error:", error);
    res.status(500).json({ message: "Failed to load conversation" });
  }
};


// ==========================================
// 🔴 GET TOTAL UNREAD COUNT (All Messages)
// GET /api/messages/unread/count
// ==========================================
exports.getUnreadCount = async (req, res) => {
  try {
    const currentUserId = new mongoose.Types.ObjectId(req.user._id);

    const count = await Message.countDocuments({
      receiver: currentUserId,
      read: false,
    });

    res.json({ count });
  } catch (err) {
    console.error("Unread count error:", err);
    res.status(500).json({ message: "Failed to get unread count" });
  }
};


// ==========================================
// 🔴 GET UNREAD COUNT FOR SPECIFIC ITEM
// GET /api/messages/unread/:itemId/:userId
// ==========================================
exports.getItemUnreadCount = async (req, res) => {
  try {
    const { itemId, userId } = req.params;

    const itemObjectId = new mongoose.Types.ObjectId(itemId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const currentUserId = new mongoose.Types.ObjectId(req.user._id);

    const unreadCount = await Message.countDocuments({
      item: itemObjectId,
      sender: userObjectId,
      receiver: currentUserId,
      read: false,
    });

    res.json({ unreadCount });
  } catch (err) {
    console.error("Item unread error:", err);
    res.status(500).json({ message: "Failed to get item unread count" });
  }
};


// ==========================================
// ✅ MARK MESSAGES AS READ (Manual)
// PUT /api/messages/mark-read/:itemId/:userId
// ==========================================
exports.markMessagesAsRead = async (req, res) => {
  try {
    const { itemId, userId } = req.params;

    const itemObjectId = new mongoose.Types.ObjectId(itemId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const currentUserId = new mongoose.Types.ObjectId(req.user._id);

    const result = await Message.updateMany(
      {
        item: itemObjectId,
        sender: userObjectId,
        receiver: currentUserId,
        read: false,
      },
      { $set: { read: true } }
    );

    console.log("Manually marked as read:", result.modifiedCount);

    res.json({ message: "Messages marked as read" });
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).json({ message: "Failed to mark messages as read" });
  }
};
