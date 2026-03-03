import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Item from "../models/Item.js";
import { protect } from "../middleware/authMiddleware.js";
import profileUpload from "../middleware/profileUpload.js";

const router = express.Router();

/* =======================================================
   REGISTER USER
======================================================= */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      profileImage: "",
      role: "user", // default role
    });

    const token = jwt.sign(
      { id: newUser._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      profileImage: "",
      role: newUser.role,
      token,
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

/* =======================================================
   LOGIN USER
======================================================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found. Please register first." });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage,
      role: user.role,
      token,
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

/* =======================================================
   GET CURRENT USER PROFILE
======================================================= */
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const items = await Item.find({ user: req.user._id }).sort({
      createdAt: -1,
    });

    res.json({ user, items });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

/* =======================================================
   UPDATE NAME / EMAIL
======================================================= */
router.put("/update", protect, async (req, res) => {
  try {
    const { name, email } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;
    if (email) user.email = email;

    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

/* =======================================================
   UPDATE PROFILE IMAGE
======================================================= */
router.put(
  "/update-profile-image",
  protect,
  profileUpload.single("profileImage"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image uploaded" });
      }

      const imageUrl = `/uploads/profile/${req.file.filename}`;

      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { profileImage: imageUrl },
        { new: true }
      ).select("-password");

      res.json({
        message: "Profile picture updated successfully",
        user: updatedUser,
      });
    } catch (err) {
      res.status(500).json({ message: "Server Error", error: err.message });
    }
  }
);

export default router;