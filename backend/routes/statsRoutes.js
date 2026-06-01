import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.get("/stats", async (req, res) => {
  try {
    const results = await Promise.allSettled([
      pool.query("SELECT COUNT(*) FROM users"),
      pool.query("SELECT COUNT(*) FROM messages"),
      pool.query("SELECT COUNT(*) FROM conversations"),
      pool.query("SELECT COUNT(*) FROM conversations WHERE is_group = true"),
    ]);

    const stats = {
      users:
        results[0].status === "fulfilled" ? results[0].value.rows[0].count : 0,
      messages:
        results[1].status === "fulfilled" ? results[1].value.rows[0].count : 0,
      conversations:
        results[2].status === "fulfilled" ? results[2].value.rows[0].count : 0,
      groups:
        results[3].status === "fulfilled" ? results[3].value.rows[0].count : 0,
    };

    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
