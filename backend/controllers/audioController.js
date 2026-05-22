import crypto from "crypto";
import { pool } from "../db.js";

const MAX_AUDIO_PAYLOAD_LENGTH = 1_800_000;

async function isMember(userId, conversationId) {
  const result = await pool.query(
    `
    SELECT 1
    FROM conversation_members
    WHERE user_id = $1
    AND conversation_id = $2
    `,
    [userId, conversationId]
  );

  return result.rows.length > 0;
}

/* ─────────────────────────────
   POST /audio/upload
   Body JSON:
     conversation_id, content (ciphertext), iv
   — Stores encrypted audio payload directly in DB (no Cloudinary)
───────────────────────────── */
export async function uploadAudio(req, res) {
  try {
    const { conversation_id, content, iv } = req.body;

    if (!conversation_id || !content || !iv) {
      return res.status(400).json({ error: "conversation_id, content, iv required" });
    }

    if (content.length > MAX_AUDIO_PAYLOAD_LENGTH) {
      return res.status(400).json({
        error: `Audio payload too large (max ${MAX_AUDIO_PAYLOAD_LENGTH} chars)`,
      });
    }

    const member = await isMember(req.user.id, conversation_id);
    if (!member) {
      return res.status(403).json({ error: "Not a member" });
    }

    const messageId = crypto.randomUUID();

    await pool.query(
      `
      INSERT INTO messages
      (
        id,
        conversation_id,
        sender_id,
        content,
        iv,
        status
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        'sent'
      )
      `,
      [messageId, conversation_id, req.user.id, content, iv]
    );

    const result = await pool.query(
      `
      SELECT
        m.id,
        m.conversation_id,
        m.sender_id,
        m.content,
        m.iv,
        m.status,
        m.created_at,
        COALESCE(u.display_name, u.username) AS sender_name
      FROM messages m
      JOIN users u
      ON u.id = m.sender_id
      WHERE m.id = $1
      `,
      [messageId]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Audio upload error:", err);
    return res.status(500).json({ error: "Audio upload failed" });
  }
}
