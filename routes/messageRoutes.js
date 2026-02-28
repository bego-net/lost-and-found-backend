import express from "express";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

/* =====================================================
   📩 SEND MESSAGE + CREATE NOTIFICATION
   POST /api/messages
===================================================== */
router.post("/", protect, async (req, res) => {
  try {
    const { receiverId, itemId, content } = req.body;

    if (!receiverId || !itemId || !content) {
      return res.status(400).json({
        message: "receiverId, itemId and content are required",
      });
    }

    // 1️⃣ Create message
    const message = await Message.create({
      sender: req.user._id,
      receiver: receiverId,
      item: itemId,
      content,
      read: false,
    });

    // 2️⃣ Create notification
    const notification = await Notification.create({
      recipient: receiverId,
      sender: req.user._id,
      item: itemId,
      message: message._id,
      isRead: false,
    });

    // 3️⃣ Populate notification properly
    const populatedNotification = await Notification.findById(
      notification._id
    )
      .populate("sender", "name email profileImage")
      .populate("item", "title");

    // 4️⃣ Emit via socket (if you attached io to app)
    const io = req.app.get("io");
    if (io) {
      io.to(receiverId.toString()).emit(
        "newNotification",
        populatedNotification
      );
    }

    // 5️⃣ Return populated message
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name email profileImage")
      .populate("receiver", "name email profileImage");

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
});

/* =====================================================
   📥 GET MESSAGES FOR ITEM
   GET /api/messages/item/:itemId
===================================================== */
router.get("/item/:itemId", protect, async (req, res) => {
  try {
    const messages = await Message.find({
      item: req.params.itemId,
      $or: [
        { sender: req.user._id },
        { receiver: req.user._id },
      ],
    })
      .populate("sender", "name email profileImage")
      .populate("receiver", "name email profileImage")
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error("Fetch item messages error:", error);
    res.status(500).json({ message: "Failed to load messages" });
  }
});

/* =====================================================
   💬 GET CONVERSATION BETWEEN 2 USERS FOR ITEM
   GET /api/messages/conversation/:itemId/:userId
===================================================== */
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
      .populate("sender", "name email profileImage")
      .populate("receiver", "name email profileImage")
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    console.error("Conversation error:", error);
    res.status(500).json({ message: "Failed to load conversation" });
  }
});

/* =====================================================
   📬 INBOX (LATEST MESSAGES RECEIVED)
   GET /api/messages/inbox
===================================================== */
router.get("/inbox", protect, async (req, res) => {
  try {
    const messages = await Message.find({
      receiver: req.user._id,
    })
      .populate("sender", "name email profileImage")
      .populate("item", "title")
      .sort({ createdAt: -1 });

    res.json(messages);
  } catch (error) {
    console.error("Inbox error:", error);
    res.status(500).json({ message: "Failed to load inbox" });
  }
});



/* =====================================================
   🔴 GET UNREAD COUNT FOR SPECIFIC USER & ITEM
===================================================== */
router.get("/unread/:itemId/:userId", protect, async (req, res) => {
  try {
    const { itemId, userId } = req.params;

    const unreadCount = await Message.countDocuments({
      item: itemId,
      sender: userId,
      receiver: req.user._id,
      read: false,
    });

    res.json({ unreadCount });
  } catch (error) {
    console.error("Unread per conversation error:", error);
    res.status(500).json({ message: "Failed to get unread count" });
  }
});


/* =====================================================
   🔴 GET TOTAL UNREAD COUNT
===================================================== */
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
/* =====================================================
   ✅ MARK MESSAGES AS READ
   PUT /api/messages/mark-read/:itemId/:senderId
===================================================== */
router.put(
  "/mark-read/:itemId/:senderId",
  protect,
  async (req, res) => {
    try {
      const { itemId, senderId } = req.params;

      await Message.updateMany(
        {
          item: itemId,
          sender: senderId,
          receiver: req.user._id,
          read: false,
        },
        { read: true }
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Mark read error:", error);
      res.status(500).json({ message: "Failed to mark as read" });
    }
  }
);

export default router;