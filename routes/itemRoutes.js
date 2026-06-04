import express from "express";
import fs from "fs";
import Item from "../models/Item.js";
import { protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/upload.js";
import cloudUpload from "../middleware/cloudUpload.js";
import { createItem, normalizeImagePath } from "../controllers/itemController.js";

const router = express.Router();

const hasCloudinaryConfig =
  Boolean(process.env.CLOUDINARY_CLOUD_NAME) &&
  Boolean(process.env.CLOUDINARY_API_KEY) &&
  Boolean(process.env.CLOUDINARY_API_SECRET);

const itemUpload = hasCloudinaryConfig ? cloudUpload : upload;

function toPublicImagePath(filePath) {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath)) return filePath;
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith("uploads/")) return `/${normalized}`;
  if (normalized.includes("/uploads/")) {
    return normalized.slice(normalized.indexOf("/uploads/"));
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

/* =====================================================
   CREATE ITEM
===================================================== */
router.post("/", protect, itemUpload.array("images", 5), createItem);

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
    })
      .populate("user", "name profileImage role email")
      .sort({ createdAt: -1 });

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
    const { search, type, category, status, page = 1, limit = 50 } = req.query;

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

    if (type === "lost" || type === "found") {
      queryObj.type = type;
    }

    if (category) {
      queryObj.category = category;
    }

    if (status) {
      queryObj.status = status;
    } else {
      queryObj.status = { $ne: "returned" };
    }

    const skip = (page - 1) * limit;

    const items = await Item.find(queryObj)
      .populate("user", "name profileImage role email")
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
    const item = await Item.findById(req.params.id)
      .populate("user", "name profileImage role email");

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json({ item });

  } catch (error) {
    console.error("Get Item Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   UPDATE ITEM
===================================================== */
router.put("/:id", protect, itemUpload.array("images", 5), async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (item.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const updateData = {
      ...req.body,
      latitude: req.body.latitude ? Number(req.body.latitude) : item.latitude,
      longitude: req.body.longitude ? Number(req.body.longitude) : item.longitude,
    };

    delete updateData.images;

    if (req.files && req.files.length > 0) {
      updateData.images = req.files
        .map((file) => toPublicImagePath(file?.path))
        .filter((url) => typeof url === "string" && url.length > 0);
    }

    const updatedItem = await Item.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    res.json({
      message: "Item updated successfully",
      item: updatedItem,
    });

  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

/* =====================================================
   DELETE SINGLE IMAGE
===================================================== */
router.delete("/:id/image", protect, async (req, res) => {
  try {
    const { image } = req.body;

    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (item.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const filePath = normalizeImagePath(image);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    item.images = item.images.filter((img) => img !== image);

    await item.save();

    res.json({
      message: "Image deleted successfully",
      images: item.images,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* =====================================================
   DELETE ITEM
===================================================== */
router.delete("/:id", protect, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (item.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    /* DELETE LOCAL IMAGES */
    await Promise.all(
      item.images.map((image) => {
        const filePath = normalizeImagePath(image);
        if (!filePath || !fs.existsSync(filePath)) return Promise.resolve();
        return fs.promises.unlink(filePath).catch(() => null);
      })
    );

    await item.deleteOne();

    res.json({ message: "Item and images deleted successfully" });

  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   CLAIM ITEM
===================================================== */
router.post("/:id/claim", protect, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    item.status = "claimed";
    await item.save();

    res.json({ message: "Item claimed successfully", item });
  } catch (error) {
    console.error("Claim Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   MARK AS RETURNED
===================================================== */
router.post("/:id/return", protect, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    // Only owner or admin can mark as returned
    if (item.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    item.status = "returned";
    await item.save();

    res.json({ message: "Item marked as returned", item });
  } catch (error) {
    console.error("Return Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   CONFIRM RECEIVED
===================================================== */
router.post("/:id/received", protect, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    // Only owner can confirm receipt
    if (item.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    item.status = "returned";
    await item.save();

    res.json({ message: "Item confirmed received", item });
  } catch (error) {
    console.error("Received Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
