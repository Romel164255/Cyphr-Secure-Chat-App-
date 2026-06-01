import express from "express";
import {
  createGroup,
  addGroupMember,
  removeGroupMember,
  promoteToAdmin,
  getGroupMembers,
} from "../controllers/groupController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", authMiddleware, createGroup);
router.get("/:conversationId/members", authMiddleware, getGroupMembers);
router.post("/:conversationId/members", authMiddleware, addGroupMember);
router.delete("/:conversationId/members", authMiddleware, removeGroupMember);
router.post("/:conversationId/promote", authMiddleware, promoteToAdmin);

export default router;
