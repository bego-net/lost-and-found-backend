import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import { getAdminStats } from "../controllers/adminController.js";
import { unbanUser } from "../controllers/adminController.js";
import {
  getAllUsers,
  deleteUser,
  banUser,
  getAllItems,
  deleteItem,
} from "../controllers/adminController.js";

const router = express.Router();

/* USER ROUTES */
router.get("/users", protect, adminOnly, getAllUsers);
router.delete("/users/:id", protect, adminOnly, deleteUser);
router.put("/users/ban/:id", protect, adminOnly, banUser);
router.put("/users/unban/:id", protect, adminOnly, unbanUser);

/* ITEM ROUTES */
router.get("/items", protect, adminOnly, getAllItems);
router.delete("/items/:id", protect, adminOnly, deleteItem);
router.get("/stats", protect, adminOnly, getAdminStats);

export default router;