import User from "../models/User.js";
import Item from "../models/Item.js";

/* ==============================
   USERS MANAGEMENT
============================== */

// GET all users
export const getAllUsers = async (req, res) => {
  const users = await User.find().select("-password");
  res.json(users);
};

// DELETE user
export const deleteUser = async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "User deleted successfully" });
};

// BAN user
export const banUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  user.isBanned = true;
  await user.save();
  res.json({ message: "User banned successfully" });
};

// UNBAN user
export const unbanUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isBanned = false;
    await user.save();

    res.json({ message: "User unbanned successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error unbanning user" });
  }
};

/* ==============================
   ITEMS MANAGEMENT
============================== */

// GET all items
export const getAllItems = async (req, res) => {
  const items = await Item.find().populate("user", "name email");
  res.json(items);
};

// DELETE item
export const deleteItem = async (req, res) => {
  await Item.findByIdAndDelete(req.params.id);
  res.json({ message: "Item deleted successfully" });
};

export const getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();

    const totalLostItems = await Item.countDocuments({ type: "lost" });
    const totalFoundItems = await Item.countDocuments({ type: "found" });

    res.json({
      totalUsers,
      totalLostItems,
      totalFoundItems,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching stats" });
  }
};