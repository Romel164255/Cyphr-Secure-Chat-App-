import express from "express";
import {
  createConversation,
  getUserConversations,
} from "../controllers/conversationController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", authMiddleware, createConversation);
router.get("/", authMiddleware, getUserConversations);

export default router;
