import path from "path";
import Item from "../models/Item.js";
import Notification from "../models/Notification.js";
import { findMatches } from "./aiController.js";

function toPublicPath(filePath) {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith("uploads/")) {
    return `/${normalized}`;
  }
  if (normalized.includes("/uploads/")) {
    return normalized.slice(normalized.indexOf("/uploads/"));
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export const createItem = async (req, res) => {
  try {
    console.log("==== CREATE ITEM REQUEST ====");
    console.log("BODY:", req.body);
    console.log("FILES:", Array.isArray(req.files) ? req.files.length : 0);
    console.log("USER:", req.user?._id);

    const {
      title,
      description,
      type,
      category,
      location,
      dateLostOrFound,
      latitude,
      longitude,
    } = req.body;

    if (!req.user?._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!title || !description || !type || !category || !location) {
      return res.status(400).json({
        message: "Please fill all required fields",
        received: { title, description, type, category, location },
      });
    }

    if (type !== "lost" && type !== "found") {
      return res.status(400).json({ message: "Invalid type value" });
    }

    let parsedDate = null;
    if (dateLostOrFound) {
      const candidate = new Date(dateLostOrFound);
      if (Number.isNaN(candidate.getTime())) {
        return res.status(400).json({ message: "Invalid dateLostOrFound" });
      }
      parsedDate = candidate;
    }

    const imageUrls = Array.isArray(req.files)
      ? req.files
          .map((file) => toPublicPath(file?.path))
          .filter((url) => typeof url === "string" && url.length > 0)
      : [];

    const newItem = await Item.create({
      title,
      description,
      type,
      category,
      location,
      latitude: parseNumber(latitude),
      longitude: parseNumber(longitude),
      images: imageUrls,
      dateLostOrFound: parsedDate || undefined,
      user: req.user._id,
    });

    let matches = [];
    let notifications = [];

    try {
      const oppositeType = newItem.type === "lost" ? "found" : "lost";

      const candidateItems = await Item.find({
        type: oppositeType,
        category: newItem.category,
      });

      const result = await findMatches(newItem.toObject(), candidateItems);

      matches = result?.matches || [];
      notifications = result?.notifications || [];
    } catch (aiError) {
      console.error("AI Matching Error:", aiError);
    }

    for (const n of notifications) {
      const notification = await Notification.create({
        receiver: n.receiver,
        sender: req.user._id,
        item: newItem._id,
        type: "match",
        isRead: false,
      });

      const populatedNotification = await Notification.findById(
        notification._id
      )
        .populate("sender", "name profileImage")
        .populate("item", "title images");

      const io = req.app.get("io");
      const onlineUsers = req.app.get("onlineUsers");

      const receiverSocket = onlineUsers?.get(n.receiver?.toString());

      if (io && receiverSocket) {
        io.to(receiverSocket).emit("newNotification", populatedNotification);
      }
    }

    res.status(201).json({
      message: "Item posted successfully",
      item: newItem,
      matches,
      showNotification: notifications.length > 0,
      notifications,
    });
  } catch (error) {
    console.error("Create Item Error:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

export const normalizeImagePath = (imagePath) => {
  if (!imagePath) return null;
  const sanitized = imagePath.replace(/\\/g, "/");
  if (sanitized.startsWith("/")) {
    return path.join(process.cwd(), sanitized.replace(/^\/+/, ""));
  }
  return path.join(process.cwd(), sanitized);
};
