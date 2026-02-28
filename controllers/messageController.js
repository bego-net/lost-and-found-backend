const Message = require("../models/Message");
const Notification = require("../models/Notification"); // ✅ ADD THIS
const mongoose = require("mongoose");

// ==========================================
// 🚀 SEND MESSAGE + CREATE NOTIFICATION
// POST /api/messages
// ==========================================
exports.sendMessage = async (req, res) => {
  try {
    const { itemId, receiverId, text } = req.body;

    const itemObjectId = new mongoose.Types.ObjectId(itemId);
    const receiverObjectId = new mongoose.Types.ObjectId(receiverId);
    const senderObjectId = new mongoose.Types.ObjectId(req.user._id);

    // 1️⃣ Save message
    const newMessage = await Message.create({
      item: itemObjectId,
      sender: senderObjectId,
      receiver: receiverObjectId,
      text,
      read: false,
    });

    // =====================================
    // ✅ STEP 2: CREATE NOTIFICATION
    // =====================================
    // =====================================
// ✅ CREATE NOTIFICATION
// =====================================
const notification = await Notification.create({
  recipient: receiverObjectId,
  sender: senderObjectId,
  item: itemObjectId,
  message: newMessage._id,
  isRead: false,
});

// 🔥 VERY IMPORTANT: Populate sender
const populatedNotification = await Notification.findById(notification._id)
  .populate("sender", "name avatar email")
  .populate("item", "title");

// =====================================
// ✅ EMIT REAL-TIME NOTIFICATION
// =====================================
if (req.io) {
  req.io.to(receiverId.toString()).emit(
    "newNotification",
    populatedNotification
  );
}

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
};


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

    const messages = await Message.find({
      item: itemObjectId,
      $or: [
        { sender: currentUserId, receiver: userObjectId },
        { sender: userObjectId, receiver: currentUserId },
      ],
    })
      .populate("sender", "name profileImage email")
      .populate("receiver", "name profileImage email")
      .sort({ createdAt: 1 });

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