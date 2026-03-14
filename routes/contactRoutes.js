import express from "express";
import { sendContactMessage } from "../controllers/contactController.js";

const router = express.Router();

/* USER SEND MESSAGE */
router.post("/", sendContactMessage);

export default router;
