import express from "express";
import { verifyFirebase, getMe } from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/verify-firebase", verifyFirebase); // called after Firebase confirms OTP
router.get("/me", authMiddleware, getMe);

export default router;
