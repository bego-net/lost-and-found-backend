import express from "express";
import Item from "../models/Item.js";
import { protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/cloudUpload.js";
import { findMatches } from "../controllers/aiController.js";
import Notification from "../models/Notification.js";
import { io, onlineUsers } from "../server.js";
import cloudinary from "../config/cloudinary.js";

const router = express.Router();

/* =====================================================
   HELPER: GET CLOUDINARY PUBLIC ID
===================================================== */
function getPublicId(url) {
  const parts = url.split("/");
  const file = parts.pop();
  const folder = parts.pop();
  const publicId = `${folder}/${file.split(".")[0]}`;
  return publicId;
}

/* =====================================================
   CREATE ITEM
===================================================== */
router.post("/", protect, upload.array("images", 5), async (req, res) => {
  try {
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

    if (!title || !description || !type || !category) {
      return res.status(400).json({ message: "Please fill all required fields" });
    }

    const imageUrls = req.files?.map((file) => file.path) || [];

    const newItem = await Item.create({
      title,
      description,
      type,
      category,
      location,
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      images: imageUrls,
      dateLostOrFound: dateLostOrFound || Date.now(),
      user: req.user._id,
    });

    /* MATCH OPPOSITE TYPE ITEMS */
    const oppositeType = newItem.type === "lost" ? "found" : "lost";

    const candidateItems = await Item.find({
      type: oppositeType,
      category: newItem.category,
    });

    let matches = [];
    let notifications = [];

    try {
      const result = await findMatches(newItem.toObject(), candidateItems);
      matches = result.matches || [];
      notifications = result.notifications || [];
    } catch (aiError) {
      console.error("AI Matching Error:", aiError);
    }

    /* SAVE NOTIFICATIONS */
    for (const n of notifications) {
      const notification = await Notification.create({
        receiver: n.receiver,
        sender: req.user._id,
        item: n.item,
        type: "match",
      });

      const populatedNotification = await Notification.findById(notification._id)
        .populate("sender", "name profileImage")
        .populate("item", "title");

      const receiverSocket = onlineUsers.get(n.receiver.toString());

      if (receiverSocket) {
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
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/* =====================================================
   SEARCH ITEMS
===================================================== */
router.get("/search", async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res.json({ items: [] });
    }

    const regex = new RegExp(query, "i");

    const items = await Item.find({
      $or: [
        { title: regex },
        { description: regex },
        { category: regex },
        { location: regex },
        { type: regex },
      ],
    }).sort({ createdAt: -1 });

    res.json({ items });

  } catch (error) {
    console.error("Search Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   GET ALL ITEMS
===================================================== */
router.get("/", async (req, res) => {
  try {
    const { search, type, category, page = 1, limit = 50 } = req.query;

    const queryObj = {};

    if (search) {
      const regex = new RegExp(search, "i");
      queryObj.$or = [
        { title: regex },
        { description: regex },
        { location: regex },
        { category: regex },
      ];
    }

    if (type === "lost" || type === "found") queryObj.type = type;
    if (category) queryObj.category = category;

    const skip = (page - 1) * limit;

    const items = await Item.find(queryObj)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Item.countDocuments(queryObj);

    res.json({
      page: Number(page),
      limit: Number(limit),
      total,
      items,
    });

  } catch (error) {
    console.error("Get All Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   GET SINGLE ITEM
===================================================== */
router.get("/:id", async (req, res) => {
  try {
    const item = await Item.findById(req.params.id).populate("user", "name email");

    if (!item) return res.status(404).json({ message: "Item not found" });

    res.json({ item });

  } catch (error) {
    console.error("Get Item Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   UPDATE ITEM
===================================================== */
router.put("/:id", protect, upload.array("images", 5), async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) return res.status(404).json({ message: "Item not found" });

    if (item.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    let images = item.images;

    if (req.files && req.files.length > 0) {
      images = req.files.map((file) => file.path);
    }

    const updatedItem = await Item.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        latitude: req.body.latitude ? Number(req.body.latitude) : item.latitude,
        longitude: req.body.longitude ? Number(req.body.longitude) : item.longitude,
        images,
      },
      { new: true, runValidators: true }
    );

    res.json({
      message: "Item updated successfully",
      item: updatedItem,
    });

  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

/* =====================================================
   DELETE SINGLE IMAGE
===================================================== */
router.delete("/:id/image", protect, async (req, res) => {
  try {
    const { image } = req.body;

    const item = await Item.findById(req.params.id);

    if (!item) return res.status(404).json({ message: "Item not found" });

    if (item.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const publicId = getPublicId(image);

    await cloudinary.uploader.destroy(publicId);

    item.images = item.images.filter((img) => img !== image);

    await item.save();

    res.json({
      message: "Image deleted successfully",
      images: item.images,
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* =====================================================
   DELETE ITEM
===================================================== */
router.delete("/:id", protect, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) return res.status(404).json({ message: "Item not found" });

    if (item.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    /* DELETE ALL CLOUDINARY IMAGES */
    await Promise.all(
      item.images.map((image) => {
        const publicId = getPublicId(image);
        return cloudinary.uploader.destroy(publicId);
      })
    );

    await item.deleteOne();

    res.json({ message: "Item and images deleted successfully" });

  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;