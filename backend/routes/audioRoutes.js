import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { uploadAudio } from "../controllers/audioController.js";

const router = express.Router();

/* ─────────────────────────────
   POST /audio/upload
   Body: JSON
     - conversation_id
     - content (encrypted audio payload)
     - iv
───────────────────────────── */
router.post("/upload", authMiddleware, uploadAudio);

export default router;
