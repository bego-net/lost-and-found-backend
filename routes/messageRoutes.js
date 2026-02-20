import express from "express";
import Message from "../models/Message.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();


// ==========================================
// 📩 SEND MESSAGE
// POST /api/messages
// ==========================================
router.post("/", protect, async (req, res) => {
  try {
    const { receiverId, itemId, content } = req.body;

    if (!receiverId || !itemId || !content) {
      return res.status(400).json({
        message: "receiverId, itemId and content are required",
      });
    }

    const message = await Message.create({
      sender: req.user._id,
      receiver: receiverId,
      item: itemId,
      content,
      read: false, // 🔥 important for unread system
    });

    const populatedMessage = await message.populate([
      { path: "sender", select: "name email avatar" },
      { path: "receiver", select: "name email avatar" },
    ]);

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
});


// ==========================================
// 📥 GET MESSAGES FOR SPECIFIC ITEM
// GET /api/messages/item/:itemId
// ==========================================
router.get("/item/:itemId", protect, async (req, res) => {
  try {
    const { itemId } = req.params;

    const messages = await Message.find({
      item: itemId,
      $or: [
        { sender: req.user._id },
        { receiver: req.user._id },
      ],
    })
      .populate("sender", "name email avatar")
      .populate("receiver", "name email avatar")
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error("Fetch messages error:", error);
    res.status(500).json({ message: "Failed to load messages" });
  }
});


// ==========================================
// 💬 GET CONVERSATION BETWEEN 2 USERS FOR ITEM
// GET /api/messages/conversation/:itemId/:userId
// ==========================================
router.get("/conversation/:itemId/:userId", protect, async (req, res) => {
  try {
    const { itemId, userId } = req.params;

    const messages = await Message.find({
      item: itemId,
      $or: [
        { sender: req.user._id, receiver: userId },
        { sender: userId, receiver: req.user._id },
      ],
    })
      .populate("sender", "name email avatar")
      .populate("receiver", "name email avatar")
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error("Conversation fetch error:", error);
    res.status(500).json({ message: "Failed to load conversation" });
  }
});


// ==========================================
// 📬 GET ALL MESSAGES FOR LOGGED USER (Inbox)
// GET /api/messages/inbox
// ==========================================
router.get("/inbox", protect, async (req, res) => {
  try {
    const messages = await Message.find({
      receiver: req.user._id,
    })
      .populate("sender", "name email avatar")
      .populate("item", "title")
      .sort({ createdAt: -1 });

    res.json(messages);
  } catch (error) {
    console.error("Inbox error:", error);
    res.status(500).json({ message: "Failed to load inbox" });
  }
});


// ==========================================
// 🔴 GET TOTAL UNREAD COUNT
// GET /api/messages/unread/count
// ==========================================
router.get("/unread/count", protect, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiver: req.user._id,
      read: false,
    });

    res.json({ count });
  } catch (error) {
    console.error("Unread count error:", error);
    res.status(500).json({ message: "Failed to get unread count" });
  }
});


// ==========================================
// ✅ MARK MESSAGES AS READ
// PUT /api/messages/mark-read/:itemId/:userId
// ==========================================
router.put("/mark-read/:itemId/:senderId", async (req, res) => {
  try {
    const { itemId, senderId } = req.params;

    await Message.updateMany(
      {
        item: itemId,
        sender: senderId,
        receiver: req.user._id,  // current logged in user
        read: false,
      },
      { read: true }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


export default router;
