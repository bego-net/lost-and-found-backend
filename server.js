// server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import http from "http";
import { Server } from "socket.io";

// Routes
import authRoutes from "./routes/auth.js";
import itemRoutes from "./routes/itemRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";

// Model
import Message from "./models/Message.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

/* ===========================
   GLOBAL MIDDLEWARES
=========================== */

app.use(express.json());
app.use(cors());

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
app.use("/api/items", itemRoutes);
app.use("/api/messages", messageRoutes);

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
  },
});

// 🔹 Store online users
const onlineUsers = new Map(); 
// userId => socketId

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  /* ===========================
     USER ONLINE
  =========================== */
  socket.on("userOnline", (userId) => {
    onlineUsers.set(userId, socket.id);

    // Notify everyone user is online
    io.emit("updateOnlineUsers", Array.from(onlineUsers.keys()));
  });

  /* ===========================
     JOIN CONVERSATION ROOM
  =========================== */
  socket.on("joinConversation", (conversationId) => {
    socket.join(conversationId);
  });

  /* ===========================
     SEND MESSAGE
  =========================== */
  socket.on("sendMessage", async (data) => {
    try {
      // Save to DB first
      const message = await Message.create(data);

      // Send to room (real-time)
      io.to(data.conversation).emit("receiveMessage", message);

      // Optional: send directly to receiver if online
      const receiverSocket = onlineUsers.get(data.receiver);
      if (receiverSocket) {
        io.to(receiverSocket).emit("newMessageNotification", message);
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

    // Remove user from online list
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

server.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
