import express from "express";
import {
  sendMessage,
  getMessages,
  updateMessageStatus,
  markConversationRead,
  deleteMessage,
} from "../controllers/messageController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Static routes MUST be declared before dynamic /:param routes
router.post("/status", authMiddleware, updateMessageStatus);

router.post("/", authMiddleware, sendMessage);
router.get("/:conversationId", authMiddleware, getMessages);
router.post("/:conversationId/read", authMiddleware, markConversationRead);
router.delete("/:messageId", authMiddleware, deleteMessage);

export default router;
