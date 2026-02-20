import express from "express";
import Item from "../models/Item.js";
import authMiddleware from "../middleware/authMiddleware.js";
import upload from "../middleware/upload.js";

const router = express.Router();

/* =====================================================
   CREATE ITEM (POST) – multiple images + GPS
===================================================== */
router.post(
  "/",
  authMiddleware,
  upload.array("images", 5),
  async (req, res) => {
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
        return res
          .status(400)
          .json({ message: "Please fill all required fields" });
      }

      const imageUrls = req.files?.map(
        (file) => `/uploads/${file.filename}`
      ) || [];

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
        user: req.user.id,
      });

      res.status(201).json({
        message: "Item posted successfully",
        item: newItem,
      });
    } catch (error) {
      console.error("Create Item Error:", error);
      res.status(500).json({
        message: "Server error",
        error: error.message,
      });
    }
  }
);

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
   GET ALL ITEMS (filters + pagination)
===================================================== */
router.get("/", async (req, res) => {
  try {
    const { search, type, category, page = 1, limit = 50 } = req.query;
    const query = {};

    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [
        { title: regex },
        { description: regex },
        { location: regex },
        { category: regex },
      ];
    }

    if (type === "lost" || type === "found") {
      query.type = type;
    }

    if (category) query.category = category;

    const skip = (page - 1) * limit;

    const items = await Item.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Item.countDocuments(query);

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
    const item = await Item.findById(req.params.id).populate(
      "user",
      "name email"
    );

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
   UPDATE ITEM – multiple images + safe update
===================================================== */
router.put(
  "/:id",
  authMiddleware,
  upload.array("images", 5),
  async (req, res) => {
    try {
      const item = await Item.findById(req.params.id);

      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }

      if (item.user.toString() !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      let images = item.images;

      if (req.files && req.files.length > 0) {
        images = req.files.map(
          (file) => `/uploads/${file.filename}`
        );
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
  }
);


/* =====================================================
   DELETE SINGLE IMAGE
===================================================== */
router.delete("/:id/image", authMiddleware, async (req, res) => {
  try {
    const { image } = req.body;

    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ message: "Item not found" });

    if (item.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    item.images = item.images.filter((img) => img !== image);
    await item.save();

    res.json({ message: "Image removed", images: item.images });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* =====================================================
   DELETE ITEM
===================================================== */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (item.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await item.deleteOne();

    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
