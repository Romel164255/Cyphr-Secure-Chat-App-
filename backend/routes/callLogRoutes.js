import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { saveCallLog, getCallLogs } from "../controllers/callLogController.js";

const router = express.Router();

router.post("/", authMiddleware, saveCallLog);
router.get("/:conversationId", authMiddleware, getCallLogs);

export default router;
