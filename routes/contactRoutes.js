import express from "express";
import {
  sendContactMessage,
  getMessages,
  replyMessage
} from "../controllers/contactController.js";

const router = express.Router();

/* USER SEND MESSAGE */
router.post("/contact", sendContactMessage);

/* ADMIN VIEW MESSAGES */
router.get("/admin/messages", getMessages);

/* ADMIN REPLY */
router.post("/admin/reply", replyMessage);

export default router;