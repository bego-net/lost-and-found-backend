import path from "path";
import Item from "../models/Item.js";
import Notification from "../models/Notification.js";
import { findMatches } from "./aiController.js";
import { processItemImages } from "../services/visionService.js";

function toPublicPath(filePath) {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }
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

    // 1. Create Item in DB immediately for fast API response
    const newItem = await Item.create({
      title,
      description,
      type,
      category,
      location,
      latitude: parseNumber(latitude),
      longitude: parseNumber(longitude),
      images: imageUrls,
      imageEmbeddings: [],
      dateLostOrFound: parsedDate || undefined,
      user: req.user._id,
    });

    // 2. Return HTTP 201 Created immediately to the user
    res.status(201).json({
      message: "Item posted successfully",
      item: newItem,
    });

    // 3. Asynchronously generate embeddings, run hybrid matching, & send socket notifications in background
    setImmediate(async () => {
      try {
        // Step A: Generate CLIP embeddings for uploaded images
        if (imageUrls.length > 0) {
          console.log(`[ItemController] Generating embeddings for ${imageUrls.length} images...`);
          const imageEmbeddings = await processItemImages(imageUrls);
          if (imageEmbeddings.length > 0) {
            newItem.imageEmbeddings = imageEmbeddings;
            await newItem.save();
            console.log(`[ItemController] Stored ${imageEmbeddings.length} embeddings for item ${newItem._id}`);
          } else {
            console.warn(`[ItemController] No embeddings generated for item ${newItem._id} — vision service may be offline`);
          }
        }

        // Step B: Reload item from DB to ensure fresh state with embeddings
        const freshItem = await Item.findById(newItem._id).lean();
        if (!freshItem) {
          console.error(`[ItemController] Item ${newItem._id} not found after save`);
          return;
        }

        // Step C: Run hybrid matching
        console.log(`[ItemController] Running hybrid matching for "${freshItem.title}"...`);
        const result = await findMatches(freshItem);
        const notifications = result?.notifications || [];
        console.log(`[ItemController] Matching complete: ${result?.matches?.length || 0} matches, ${notifications.length} notifications`);

        const io = req.app.get("io");
        const onlineUsers = req.app.get("onlineUsers");

        for (const n of notifications) {
          const notification = await Notification.create({
            receiver: n.receiver,
            sender: req.user._id,
            item: newItem._id,
            type: "match",
            isRead: false,
          });

          const populatedNotification = await Notification.findById(notification._id)
            .populate("sender", "name profileImage")
            .populate("item", "title images");

          const receiverSocket = onlineUsers?.get(n.receiver?.toString());
          if (io && receiverSocket) {
            io.to(receiverSocket).emit("newNotification", populatedNotification);
          }
        }
      } catch (bgError) {
        console.error("[ItemController] Background AI processing error:", bgError);
      }
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
