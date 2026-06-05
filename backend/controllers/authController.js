import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { verifyFirebaseIdToken } from "../services/firebaseAdmin.js";

/* =========================
   VERIFY FIREBASE TOKEN
========================= */
export async function verifyFirebase(req, res) {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "idToken required" });

    const decoded = await verifyFirebaseIdToken(idToken);
    const phone = decoded.phone_number;

    if (!phone)
      return res.status(400).json({ error: "No phone number in token" });

    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.create({ phone });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        id: user._id,
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
    const user = await User.findById(req.user.id).select(
      "phone username display_name"
    );
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user._id, phone: user.phone, username: user.username, display_name: user.display_name });
  } catch (err) {
    console.error("getMe error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
