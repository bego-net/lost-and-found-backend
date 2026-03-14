import express from "express";
import fs from "fs";
import Item from "../models/Item.js";
import { protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/upload.js";
import { createItem, normalizeImagePath } from "../controllers/itemController.js";

const router = express.Router();

/* =====================================================
   CREATE ITEM
===================================================== */
router.post("/", protect, upload.array("images", 5), createItem);

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

    if (type === "lost" || type === "found") {
      queryObj.type = type;
    }

    if (category) {
      queryObj.category = category;
    }

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
    const item = await Item.findById(req.params.id)
      .populate("user", "name email");

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
router.put("/:id", protect, upload.array("images", 5), async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (item.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    let images = item.images;

    if (req.files && req.files.length > 0) {
      images = req.files
        .map((file) => file?.path?.replace(/\\/g, "/"))
        .map((filePath) =>
          filePath?.startsWith("uploads/") ? `/${filePath}` : filePath
        )
        .filter(Boolean);
    }

    const updatedItem = await Item.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        latitude: req.body.latitude
          ? Number(req.body.latitude)
          : item.latitude,
        longitude: req.body.longitude
          ? Number(req.body.longitude)
          : item.longitude,
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

export default router;
