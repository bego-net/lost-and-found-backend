import express from "express";
import mongoose from "mongoose";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import Conversation from "../models/conversation.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* =====================================================
   🔄 ON-BOOT DATABASE AUTO-MIGRATION
   Convert old item-based messages to user-to-user conversations
===================================================== */
const runMigration = async () => {
  try {
    const messagesWithoutConvo = await Message.find({ conversation: { $exists: false } });
    if (messagesWithoutConvo.length > 0) {
      console.log(`[Migration] Found ${messagesWithoutConvo.length} messages without a conversation. Starting migration...`);
      for (const msg of messagesWithoutConvo) {
        if (!msg.sender || !msg.receiver) continue;
        const participants = [msg.sender.toString(), msg.receiver.toString()].sort();
        let convo = await Conversation.findOne({
          participants: { $all: participants, $size: 2 }
        });
        if (!convo) {
          convo = await Conversation.create({ participants });
        }
        msg.conversation = convo._id;
        await msg.save();
      }
      console.log(`[Migration] Successfully migrated ${messagesWithoutConvo.length} messages.`);
    }
  } catch (err) {
    console.error("[Migration] Error migrating messages:", err);
  }
};
runMigration();

/* =====================================================
   📩 SEND MESSAGE + CREATE NOTIFICATION
   POST /api/messages
===================================================== */
router.post("/", protect, async (req, res) => {
  try {
    const { receiverId, itemId, content } = req.body;

    if (!receiverId || !content) {
      return res.status(400).json({
        message: "receiverId and content are required",
      });
    }

    // 1️⃣ Find or create a unique conversation between these 2 users
    const participants = [req.user._id.toString(), receiverId.toString()].sort();
    let convo = await Conversation.findOne({
      participants: { $all: participants, $size: 2 }
    });
    if (!convo) {
      convo = await Conversation.create({ participants });
    }

    // 2️⃣ Create message linked to conversation and optional itemId
    const message = await Message.create({
      conversation: convo._id,
      sender: req.user._id,
      receiver: receiverId,
      item: itemId || undefined,
      content,
      read: false,
    });

    // 3️⃣ Create notification
    const notification = await Notification.create({
      receiver: receiverId,
      sender: req.user._id,
      item: itemId || undefined,
      message: message._id,
      isRead: false,
    });

    // 4️⃣ Populate notification
    const populatedNotification = await Notification.findById(notification._id)
      .populate("sender", "name email profileImage")
      .populate("item", "title");

    // 5️⃣ Emit socket notification to receiver
    const io = req.app.get("io");
    if (io) {
      io.to(receiverId.toString()).emit(
        "newNotification",
        populatedNotification
      );
    }

    // 6️⃣ Return populated message
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name email profileImage")
      .populate("receiver", "name email profileImage")
      .populate("item", "title images");

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
});

/* =====================================================
   📥 GET MESSAGES FOR A USER'S ITEM CHATS (Global Chat List)
   GET /api/messages/item/:itemId
===================================================== */
router.get("/item/:itemId", protect, async (req, res) => {
  try {
    // Return all messages in all conversations the current user is a part of.
    // The frontend groups them by user automatically.
    const convos = await Conversation.find({ participants: req.user._id });
    const convoIds = convos.map(c => c._id);

    const messages = await Message.find({
      conversation: { $in: convoIds }
    })
      .populate("sender", "name email profileImage")
      .populate("receiver", "name email profileImage")
      .populate("item", "title images")
      .sort({ createdAt: -1 });

    res.json(messages);
  } catch (error) {
    console.error("Fetch item messages error:", error);
    res.status(500).json({ message: "Failed to load messages" });
  }
});

/* =====================================================
   💬 GET CONVERSATION BETWEEN 2 USERS (Returns conversationId & messages)
   GET /api/messages/conversation/:itemId/:userId
===================================================== */
router.get("/conversation/:itemId/:userId", protect, async (req, res) => {
  try {
    const { userId } = req.params;

    // Find or create conversation
    const participants = [req.user._id.toString(), userId.toString()].sort();
    let convo = await Conversation.findOne({
      participants: { $all: participants, $size: 2 }
    });
    if (!convo) {
      convo = await Conversation.create({ participants });
    }

    const messages = await Message.find({
      conversation: convo._id
    })
      .populate("sender", "name email profileImage")
      .populate("receiver", "name email profileImage")
      .populate("item", "title images")
      .sort({ createdAt: 1 });

    // Mark incoming messages in this conversation as read
    await Message.updateMany(
      {
        conversation: convo._id,
        sender: userId,
        receiver: req.user._id,
        read: false,
      },
      { read: true }
    );

    res.json({
      conversationId: convo._id,
      messages
    });
  } catch (error) {
    console.error("Conversation error:", error);
    res.status(500).json({ message: "Failed to load conversation" });
  }
});

/* =====================================================
   📬 INBOX
===================================================== */
router.get("/inbox", protect, async (req, res) => {
  try {
    const convos = await Conversation.find({ participants: req.user._id });
    const convoIds = convos.map(c => c._id);

    const messages = await Message.find({
      conversation: { $in: convoIds }
    })
      .populate("sender", "name email profileImage")
      .populate("receiver", "name email profileImage")
      .populate("item", "title")
      .sort({ createdAt: -1 });

    res.json(messages);
  } catch (error) {
    console.error("Inbox error:", error);
    res.status(500).json({ message: "Failed to load inbox" });
  }
});

/* =====================================================
   🔴 UNREAD COUNT PER CONVERSATION (Between 2 Users)
===================================================== */
router.get("/unread/:itemId/:userId", protect, async (req, res) => {
  try {
    const { userId } = req.params;
    const participants = [req.user._id.toString(), userId.toString()].sort();
    const convo = await Conversation.findOne({
      participants: { $all: participants, $size: 2 }
    });
    if (!convo) return res.json({ unreadCount: 0 });

    const unreadCount = await Message.countDocuments({
      conversation: convo._id,
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
   🔴 TOTAL UNREAD COUNT
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
   ✅ MARK AS READ (Mark all in conversation as read)
===================================================== */
router.put("/mark-read/:itemId/:senderId", protect, async (req, res) => {
  try {
    const { senderId } = req.params;
    const participants = [req.user._id.toString(), senderId.toString()].sort();
    const convo = await Conversation.findOne({
      participants: { $all: participants, $size: 2 }
    });

    if (convo) {
      await Message.updateMany(
        {
          conversation: convo._id,
          sender: senderId,
          receiver: req.user._id,
          read: false,
        },
        { read: true }
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).json({ message: "Failed to mark as read" });
  }
});

export default router;
