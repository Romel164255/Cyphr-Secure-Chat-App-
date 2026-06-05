import mongoose from "mongoose";
import { Conversation } from "../models/Conversation.js";
import { User } from "../models/User.js";

const MAX_TITLE_LENGTH = 100;
const MAX_GROUP_MEMBERS = 256;

/* =========================
   HELPER — get caller's role
========================= */
async function getRole(userId, conversationId) {
  const conv = await Conversation.findOne(
    { _id: conversationId },
    { members: 1 }
  );
  if (!conv) return null;
  const member = conv.members.find((m) => m.user_id.toString() === userId);
  return member?.role ?? null;
}

/* =========================
   CREATE GROUP
========================= */
export async function createGroup(req, res) {
  try {
    const { title, members } = req.body;

    if (!title || !title.trim())
      return res.status(400).json({ error: "title required" });

    if (!members || !Array.isArray(members) || members.length === 0)
      return res.status(400).json({ error: "members array required" });

    if (title.trim().length > MAX_TITLE_LENGTH)
      return res.status(400).json({ error: `Title must be at most ${MAX_TITLE_LENGTH} characters` });

    const uniqueMembers = [...new Set(members)].filter(
      (id) => id !== req.user.id
    );

    if (uniqueMembers.length + 1 > MAX_GROUP_MEMBERS)
      return res.status(400).json({ error: `Group cannot have more than ${MAX_GROUP_MEMBERS} members` });

    // Verify all member IDs exist
    if (uniqueMembers.length > 0) {
      const count = await User.countDocuments({
        _id: { $in: uniqueMembers },
      });
      if (count !== uniqueMembers.length)
        return res.status(400).json({ error: "One or more member user IDs not found" });
    }

    const memberDocs = [
      { user_id: req.user.id, role: "owner" },
      ...uniqueMembers.map((id) => ({ user_id: id, role: "member" })),
    ];

    const conversation = await Conversation.create({
      is_group: true,
      title: title.trim(),
      created_by: req.user.id,
      members: memberDocs,
    });

    res.status(201).json({ message: "Group created", conversation_id: conversation._id });
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

    if (!user_id) return res.status(400).json({ error: "user_id required" });

    const role = await getRole(req.user.id, conversationId);
    if (!role) return res.status(403).json({ error: "Not a group member" });
    if (role !== "owner" && role !== "admin")
      return res.status(403).json({ error: "Only admins can add members" });

    const target = await User.findById(user_id);
    if (!target) return res.status(404).json({ error: "User not found" });

    const conv = await Conversation.findById(conversationId);
    if (conv.members.length >= MAX_GROUP_MEMBERS)
      return res.status(400).json({ error: "Group is full" });

    const alreadyMember = conv.members.some(
      (m) => m.user_id.toString() === user_id
    );
    if (!alreadyMember) {
      conv.members.push({ user_id, role: "member" });
      await conv.save();
    }

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

    if (!user_id) return res.status(400).json({ error: "user_id required" });

    const callerRole = await getRole(req.user.id, conversationId);
    if (!callerRole) return res.status(403).json({ error: "Not a group member" });
    if (callerRole !== "owner" && callerRole !== "admin")
      return res.status(403).json({ error: "Only admins can remove members" });

    const targetRole = await getRole(user_id, conversationId);
    if (targetRole === "owner")
      return res.status(403).json({ error: "Cannot remove the group owner" });

    if (targetRole === "admin" && callerRole !== "owner")
      return res.status(403).json({ error: "Only the owner can remove admins" });

    await Conversation.findByIdAndUpdate(conversationId, {
      $pull: { members: { user_id: new mongoose.Types.ObjectId(user_id) } },
    });

    res.json({ message: "Member removed" });
  } catch (err) {
    console.error("removeGroupMember error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

/* =========================
   PROMOTE TO ADMIN
========================= */
export async function promoteToAdmin(req, res) {
  try {
    const { conversationId } = req.params;
    const { user_id } = req.body;

    if (!user_id) return res.status(400).json({ error: "user_id required" });

    const callerRole = await getRole(req.user.id, conversationId);
    if (!callerRole) return res.status(403).json({ error: "Not a group member" });
    if (callerRole !== "owner")
      return res.status(403).json({ error: "Only the owner can promote admins" });

    const targetRole = await getRole(user_id, conversationId);
    if (!targetRole) return res.status(404).json({ error: "Target user is not in this group" });
    if (targetRole === "owner") return res.status(400).json({ error: "User is already the owner" });

    await Conversation.findOneAndUpdate(
      { _id: conversationId, "members.user_id": user_id },
      { $set: { "members.$.role": "admin" } }
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

    const role = await getRole(req.user.id, conversationId);
    if (!role) return res.status(403).json({ error: "Not a member of this group" });

    const conv = await Conversation.findById(conversationId).populate(
      "members.user_id",
      "username display_name"
    );

    const members = conv.members
      .map((m) => ({
        id: m.user_id._id,
        username: m.user_id.username,
        display_name: m.user_id.display_name,
        role: m.role,
      }))
      .sort((a, b) => {
        const order = { owner: 0, admin: 1, member: 2 };
        return (order[a.role] - order[b.role]) || (a.username || "").localeCompare(b.username || "");
      });

    res.json(members);
  } catch (err) {
    console.error("getGroupMembers error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
