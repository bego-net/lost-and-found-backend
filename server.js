import dotenv from "dotenv";
dotenv.config();

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import http from "http";
import session from "express-session";
import passport from "passport";
import { Server } from "socket.io";
import path from "path";
import Notification from "./models/Notification.js";
import Message from "./models/Message.js";
import contactRoutes from "./routes/contactRoutes.js";

/* ===========================
   PASSPORT CONFIG
=========================== */
import "./config/passport.js";

/* ===========================
   ROUTES
=========================== */

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/userRoutes.js";
import itemRoutes from "./routes/itemRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

const app = express();
const server = http.createServer(app);

const corsOrigins = [
  "http://localhost:5173", // local frontend
  "https://lost-and-found-frontend-tau.vercel.app", // deployed frontend
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

/* ===========================
   GLOBAL MIDDLEWARES
=========================== */

app.use(express.json());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: true,
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

/* ===========================
   RATE LIMITING
=========================== */

app.set("trust proxy", 1);

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
app.use("/api/users", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/contact", contactRoutes);
/* ===========================
   TEST ENDPOINT
=========================== */

app.get("/", (req, res) => {
  res.send("Backend is running...");
});

/* ===========================
   SOCKET.IO SETUP
=========================== */

export const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.set("io", io);

/* ===========================
   STORE ONLINE USERS
=========================== */

export const onlineUsers = new Map();
app.set("onlineUsers", onlineUsers);

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  /* USER ONLINE */

  socket.on("userOnline", (userId) => {
    if (!userId) return;

    onlineUsers.set(userId.toString(), socket.id);
    socket.join(userId.toString());

    io.emit("updateOnlineUsers", Array.from(onlineUsers.keys()));
  });

  /* JOIN CONVERSATION */

  socket.on("joinConversation", (conversationId) => {
    if (conversationId) {
      socket.join(conversationId);
    }
  });

  /* SEND MESSAGE */

  socket.on("sendMessage", async (data) => {
    try {

      const message = await Message.create(data);

      const populatedMessage = await Message.findById(message._id)
        .populate("sender", "name email profileImage")
        .populate("receiver", "name email profileImage")
        .populate("item", "title images");

      io.to(data.conversation).emit("receiveMessage", populatedMessage);
      if (data.receiver) {
        io.to(data.receiver.toString()).emit("receiveMessage", populatedMessage);
      }
      if (data.sender) {
        io.to(data.sender.toString()).emit("receiveMessage", populatedMessage);
      }

      const notification = await Notification.create({
        receiver: data.receiver,
        sender: data.sender,
        item: data.item,
        message: message._id,
        type: "message",
        isRead: false,
      });

      const populatedNotification = await Notification.findById(
        notification._id
      )
        .populate("sender", "name profileImage")
        .populate("item", "title")
        .populate("message");

      const receiverSocket = onlineUsers.get(data.receiver?.toString());

      if (receiverSocket) {
        io.to(receiverSocket).emit("newNotification", populatedNotification);
      }

    } catch (error) {
      console.error("Error sending message:", error);
    }
  });

  /* MESSAGES SEEN */

  socket.on("messagesSeen", async ({ conversationId, userId }) => {
    try {
      const Message = mongoose.model("Message");
      await Message.updateMany(
        {
          conversation: conversationId,
          sender: { $ne: userId },
          read: false,
        },
        { $set: { read: true, seenAt: new Date() } }
      );

      io.to(conversationId).emit("messagesSeen", {
        conversationId,
        seenAt: new Date(),
      });
    } catch (err) {
      console.error("Error setting messages seen via socket:", err);
    }
  });

  /* DISCONNECT */

  socket.on("disconnect", async () => {
    console.log("User disconnected:", socket.id);

    let disconnectedUserId = null;
    for (let [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        onlineUsers.delete(userId);
        break;
      }
    }

    if (disconnectedUserId) {
      try {
        const User = mongoose.model("User");
        await User.findByIdAndUpdate(disconnectedUserId, { lastSeen: new Date() });
      } catch (err) {
        console.error("Error updating lastSeen:", err);
      }
    }

    io.emit("updateOnlineUsers", Array.from(onlineUsers.keys()));
  });
});

/* ===========================
   GLOBAL ERROR HANDLER
=========================== */

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);

  if (err?.name === "MulterError") {
    return res.status(400).json({ message: err.message });
  }

  return res.status(500).json({ message: "Server error", error: err?.message });
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
