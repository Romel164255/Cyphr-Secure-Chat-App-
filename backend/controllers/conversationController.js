import mongoose from "mongoose";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";

/* =========================
   CREATE PRIVATE CHAT
========================= */
export async function createConversation(req, res) {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id required" });

    const myId = new mongoose.Types.ObjectId(req.user.id);
    const otherId = new mongoose.Types.ObjectId(user_id);

    // Find existing 1:1 conversation
    const existing = await Conversation.findOne({
      is_group: false,
      "members.user_id": { $all: [myId, otherId] },
      $expr: { $eq: [{ $size: "$members" }, 2] },
    });

    if (existing) return res.json({ conversation_id: existing._id });

    const conversation = await Conversation.create({
      is_group: false,
      members: [
        { user_id: myId, role: "member" },
        { user_id: otherId, role: "member" },
      ],
    });

    res.json({ conversation_id: conversation._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

/* =========================
   GET USER CONVERSATIONS
========================= */
export async function getUserConversations(req, res) {
  try {
    const myId = new mongoose.Types.ObjectId(req.user.id);

    // Get all conversations where user is a member
    const conversations = await Conversation.find({
      "members.user_id": myId,
    }).lean();

    const results = await Promise.all(
      conversations.map(async (conv) => {
        // Get last message
        const lastMsg = await Message.findOne({ conversation_id: conv._id })
          .sort({ createdAt: -1 })
          .lean();

        // Get unread count (messages after last_read_message_id)
        const myMember = conv.members.find(
          (m) => m.user_id.toString() === req.user.id
        );
        const lastReadId = myMember?.last_read_message_id;

        const unreadCount = lastReadId
          ? await Message.countDocuments({
              conversation_id: conv._id,
              _id: { $gt: lastReadId },
              sender_id: { $ne: myId },
            })
          : await Message.countDocuments({
              conversation_id: conv._id,
              sender_id: { $ne: myId },
            });

        // For DMs, resolve the other user's name
        let title = conv.title;
        let other_user_id = null;
        if (!conv.is_group) {
          const otherMember = conv.members.find(
            (m) => m.user_id.toString() !== req.user.id
          );
          if (otherMember) {
            const otherUser = await User.findById(otherMember.user_id).select(
              "username display_name"
            );
            title = otherUser?.display_name || otherUser?.username || "Direct Chat";
            other_user_id = otherMember.user_id;
          }
        }

        return {
          id: conv._id,
          title,
          is_group: conv.is_group,
          other_user_id,
          last_message: lastMsg?.content ?? null,
          last_message_iv: lastMsg?.iv ?? null,
          last_message_time: lastMsg?.createdAt ?? null,
          unread_count: unreadCount,
        };
      })
    );

    // Sort by last message time descending
    results.sort((a, b) => {
      if (!a.last_message_time) return 1;
      if (!b.last_message_time) return -1;
      return new Date(b.last_message_time) - new Date(a.last_message_time);
    });

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}
