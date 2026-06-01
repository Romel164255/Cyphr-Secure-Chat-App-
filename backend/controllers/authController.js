import jwt from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "../db.js";
import { verifyFirebaseIdToken } from "../services/firebaseAdmin.js";

/* =========================
   VERIFY FIREBASE TOKEN
   Called after Firebase confirms the OTP on the frontend.
   Frontend sends the Firebase idToken, we verify it and issue our own JWT.
========================= */
export async function verifyFirebase(req, res) {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "idToken required" });

    // Verify with Google — no service account needed
    const decoded = await verifyFirebaseIdToken(idToken);
    const phone = decoded.phone_number;

    if (!phone)
      return res.status(400).json({ error: "No phone number in token" });

    // Find or create user
    let result = await pool.query("SELECT * FROM users WHERE phone = $1", [
      phone,
    ]);
    if (result.rows.length === 0) {
      const id = crypto.randomUUID();
      await pool.query("INSERT INTO users (id, phone) VALUES ($1, $2)", [
        id,
        phone,
      ]);
      result = await pool.query("SELECT * FROM users WHERE phone = $1", [
        phone,
      ]);
    }

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        username: user.username,
        display_name: user.display_name,
      },
    });
  } catch (err) {
    console.error("verifyFirebase error:", err.message);
    res.status(401).json({ error: "Invalid or expired Firebase token" });
  }
}

/* =========================
   CURRENT USER
========================= */
export async function getMe(req, res) {
  try {
    const result = await pool.query(
      "SELECT id, phone, username, display_name FROM users WHERE id = $1",
      [req.user.id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("getMe error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
