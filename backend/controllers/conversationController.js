import crypto from "crypto";
import { pool } from "../db.js";

/* =========================
   CREATE PRIVATE CHAT
========================= */

export async function createConversation(req, res) {

  try {

    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({
        error: "user_id required"
      });
    }

    const existing = await pool.query(
      `
      SELECT c.id
      FROM conversations c
      JOIN conversation_members m1
      ON c.id = m1.conversation_id
      JOIN conversation_members m2
      ON c.id = m2.conversation_id
      WHERE m1.user_id = $1
      AND m2.user_id = $2
      AND c.is_group = false
      `,
      [req.user.id, user_id]
    );

    if (existing.rows.length > 0) {
      return res.json({
        conversation_id: existing.rows[0].id
      });
    }

    const conversationId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO conversations(id, is_group)
       VALUES ($1,false)`,
      [conversationId]
    );

    await pool.query(
      `INSERT INTO conversation_members(conversation_id,user_id)
       VALUES ($1,$2),($1,$3)`,
      [conversationId, req.user.id, user_id]
    );

    res.json({
      conversation_id: conversationId
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "Server error"
    });

  }

}


/* =========================
   GET USER CONVERSATIONS
========================= */

export async function getUserConversations(req, res) {

  try {

    const result = await pool.query(
      `
      SELECT
        c.id,
        CASE
          WHEN c.is_group
          THEN c.title
          ELSE COALESCE(other_user.display_name, other_user.username, 'Direct Chat')
        END AS title,
        c.is_group,
        m.content AS last_message,
        m.iv AS last_message_iv,
        m.created_at AS last_message_time,
        COUNT(msg.id) AS unread_count
      FROM conversations c
      JOIN conversation_members cm
      ON cm.conversation_id = c.id
      LEFT JOIN LATERAL (
        SELECT u.id, u.username, u.display_name
        FROM conversation_members cm2
        JOIN users u
        ON u.id = cm2.user_id
        WHERE cm2.conversation_id = c.id
        AND cm2.user_id <> $1
        LIMIT 1
      ) other_user
      ON c.is_group = false
      LEFT JOIN LATERAL (
        SELECT content, iv, created_at
        FROM messages
        WHERE conversation_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) m ON true
      LEFT JOIN messages msg
      ON msg.conversation_id = c.id
      AND msg.id > cm.last_read_message_id
      WHERE cm.user_id = $1
      GROUP BY
        c.id,
        c.is_group,
        c.title,
        other_user.display_name,
        other_user.username,
        m.content,
        m.iv,
        m.created_at
      ORDER BY m.created_at DESC NULLS LAST
      `,
      [req.user.id]
    );

    res.json(result.rows);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "Server error"
    });

  }

}
