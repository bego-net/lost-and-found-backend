// server.js

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import http from "http";
import { Server } from "socket.io";

import Notification from "./models/Notification.js";
import Message from "./models/Message.js";

// Routes
import authRoutes from "./routes/auth.js";
import itemRoutes from "./routes/itemRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

/* ===========================
   GLOBAL MIDDLEWARES
=========================== */

app.use(express.json());

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

/* ===========================
   RATE LIMITING
=========================== */

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

/* ===========================
   STATIC FILES
=========================== */

app.use("/uploads", express.static("uploads"));
app.use("/uploads/profile", express.static("uploads/profile"));

/* ===========================
   API ROUTES
=========================== */

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);

/* ===========================
   TEST ENDPOINT
=========================== */

app.get("/", (req, res) => {
  res.send("Backend is running...");
});

/* ===========================
   SOCKET.IO SETUP
=========================== */

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});
app.set("io", io); // Make io accessible in routes/controllers via req.app.get("io")

// 🔹 Store online users
// Map<userId, socketId>
const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  /* ===========================
     USER ONLINE
  =========================== */

  socket.on("userOnline", (userId) => {
    if (!userId) return;

    onlineUsers.set(userId.toString(), socket.id);

    io.emit("updateOnlineUsers", Array.from(onlineUsers.keys()));
  });

  /* ===========================
     JOIN CONVERSATION
  =========================== */

  socket.on("joinConversation", (conversationId) => {
    if (conversationId) {
      socket.join(conversationId);
    }
  });

  /* ===========================
     SEND MESSAGE
  =========================== */

  socket.on("sendMessage", async (data) => {
    try {
      /*
        data should contain:
        - sender
        - receiver
        - conversation
        - item
        - text
      */

      // 1️⃣ Save message
      const message = await Message.create(data);

      // 2️⃣ Emit message to conversation room
      io.to(data.conversation).emit("receiveMessage", message);

      // 3️⃣ Create Notification in DB
      const notification = await Notification.create({
        recipient: data.receiver,
        sender: data.sender,
        item: data.item,
        message: message._id,
        isRead: false,
      });

      // 4️⃣ Populate notification BEFORE sending
      const populatedNotification = await Notification.findById(
        notification._id
      )
        .populate("sender", "name profileImage")
        .populate("item", "title")
        .populate("message");

      // 5️⃣ Send real-time notification
      const receiverSocket = onlineUsers.get(data.receiver.toString());

      if (receiverSocket) {
        io.to(receiverSocket).emit(
          "newNotification",
          populatedNotification
        );
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  });

  /* ===========================
     DISCONNECT
  =========================== */

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    for (let [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }

    io.emit("updateOnlineUsers", Array.from(onlineUsers.keys()));
  });
});

/* ===========================
   DATABASE CONNECTION
=========================== */

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("DB connection error:", err));

/* ===========================
   SERVER START
=========================== */

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});