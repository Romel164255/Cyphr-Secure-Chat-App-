import crypto from "crypto";
import { pool } from "../db.js";

const MAX_TITLE_LENGTH = 100;
const MAX_GROUP_MEMBERS = 256;

/* =========================
   HELPER — get caller's role in a group
========================= */

async function getRole(userId, conversationId) {
  const result = await pool.query(
    `SELECT role FROM conversation_members
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
  return result.rows[0]?.role ?? null; // null = not a member
}

/* =========================
   CREATE GROUP
========================= */

export async function createGroup(req, res) {
  try {
    const { title, members } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "title required" });
    }

    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ error: "members array required" });
    }

    if (title.trim().length > MAX_TITLE_LENGTH) {
      return res.status(400).json({
        error: `Title must be at most ${MAX_TITLE_LENGTH} characters`,
      });
    }

    // Deduplicate and exclude the creator (they're added separately)
    const uniqueMembers = [...new Set(members)].filter(
      (id) => id !== req.user.id,
    );

    if (uniqueMembers.length + 1 > MAX_GROUP_MEMBERS) {
      return res.status(400).json({
        error: `Group cannot have more than ${MAX_GROUP_MEMBERS} members`,
      });
    }

    // Verify all member user IDs exist
    if (uniqueMembers.length > 0) {
      const userCheck = await pool.query(
        `SELECT COUNT(*) AS cnt FROM users WHERE id = ANY($1::uuid[])`,
        [uniqueMembers],
      );
      if (parseInt(userCheck.rows[0].cnt) !== uniqueMembers.length) {
        return res
          .status(400)
          .json({ error: "One or more member user IDs not found" });
      }
    }

    const conversationId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO conversations (id, title, is_group, created_by) VALUES ($1, $2, true, $3)`,
      [conversationId, title.trim(), req.user.id],
    );

    // Creator is owner
    await pool.query(
      `INSERT INTO conversation_members (conversation_id, user_id, role)
       VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
      [conversationId, req.user.id],
    );

    // Add other members
    for (const userId of uniqueMembers) {
      await pool.query(
        `INSERT INTO conversation_members (conversation_id, user_id, role)
         VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
        [conversationId, userId],
      );
    }

    res
      .status(201)
      .json({ message: "Group created", conversation_id: conversationId });
  } catch (err) {
    console.error("createGroup error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/* =========================
   ADD MEMBER
========================= */

export async function addGroupMember(req, res) {
  try {
    const { conversationId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id required" });
    }

    const role = await getRole(req.user.id, conversationId);

    if (!role) return res.status(403).json({ error: "Not a group member" });
    if (role !== "owner" && role !== "admin") {
      return res.status(403).json({ error: "Only admins can add members" });
    }

    // Verify target user exists
    const target = await pool.query(`SELECT id FROM users WHERE id = $1`, [
      user_id,
    ]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check current member count
    const countResult = await pool.query(
      `SELECT COUNT(*) AS cnt FROM conversation_members WHERE conversation_id = $1`,
      [conversationId],
    );
    if (parseInt(countResult.rows[0].cnt) >= MAX_GROUP_MEMBERS) {
      return res.status(400).json({ error: "Group is full" });
    }

    await pool.query(
      `INSERT INTO conversation_members (conversation_id, user_id, role)
       VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [conversationId, user_id],
    );

    res.json({ message: "Member added" });
  } catch (err) {
    console.error("addGroupMember error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/* =========================
   REMOVE MEMBER
========================= */

export async function removeGroupMember(req, res) {
  try {
    const { conversationId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id required" });
    }

    const callerRole = await getRole(req.user.id, conversationId);

    if (!callerRole)
      return res.status(403).json({ error: "Not a group member" });
    if (callerRole !== "owner" && callerRole !== "admin") {
      return res.status(403).json({ error: "Only admins can remove members" });
    }

    // Nobody can remove the owner
    const targetRole = await getRole(user_id, conversationId);
    if (targetRole === "owner") {
      return res.status(403).json({ error: "Cannot remove the group owner" });
    }

    // Admins cannot remove other admins — only the owner can
    if (targetRole === "admin" && callerRole !== "owner") {
      return res
        .status(403)
        .json({ error: "Only the owner can remove admins" });
    }

    await pool.query(
      `DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, user_id],
    );

    res.json({ message: "Member removed" });
  } catch (err) {
    console.error("removeGroupMember error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/* =========================
   PROMOTE MEMBER TO ADMIN
========================= */

export async function promoteToAdmin(req, res) {
  try {
    const { conversationId } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id required" });
    }

    const callerRole = await getRole(req.user.id, conversationId);

    if (!callerRole)
      return res.status(403).json({ error: "Not a group member" });
    if (callerRole !== "owner") {
      return res
        .status(403)
        .json({ error: "Only the owner can promote admins" });
    }

    const targetRole = await getRole(user_id, conversationId);
    if (!targetRole) {
      return res
        .status(404)
        .json({ error: "Target user is not in this group" });
    }

    if (targetRole === "owner") {
      return res.status(400).json({ error: "User is already the owner" });
    }

    await pool.query(
      `UPDATE conversation_members SET role = 'admin'
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, user_id],
    );

    res.json({ message: "User promoted to admin" });
  } catch (err) {
    console.error("promoteToAdmin error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/* =========================
   GET GROUP MEMBERS
========================= */

export async function getGroupMembers(req, res) {
  try {
    const { conversationId } = req.params;

    // Only members can view the member list
    const role = await getRole(req.user.id, conversationId);
    if (!role) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const result = await pool.query(
      `SELECT u.id, u.username, u.display_name, cm.role
       FROM conversation_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.conversation_id = $1
       ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.username`,
      [conversationId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("getGroupMembers error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
