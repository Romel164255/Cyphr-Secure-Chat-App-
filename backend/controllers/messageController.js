import mongoose from "mongoose";
import { Message } from "../models/Message.js";
import { Conversation } from "../models/Conversation.js";

const MAX_MESSAGE_LENGTH = 12000;
const VALID_STATUSES = ["sent", "delivered", "read"];

/* =========================
   HELPER
========================= */
async function isMember(userId, conversationId) {
  const conv = await Conversation.findOne({
    _id: conversationId,
    "members.user_id": userId,
  });
  return !!conv;
}

/* =========================
   SEND MESSAGE
========================= */
export async function sendMessage(req, res) {
  try {
    const { conversation_id, content, iv } = req.body;

    if (!conversation_id || !content || !iv)
      return res.status(400).json({ error: "conversation_id content iv required" });

    if (content.length > MAX_MESSAGE_LENGTH)
      return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH})` });

    const member = await isMember(req.user.id, conversation_id);
    if (!member) return res.status(403).json({ error: "Not a member" });

    const message = await Message.create({
      conversation_id,
      sender_id: req.user.id,
      content,
      iv,
      status: "sent",
    });

    await message.populate("sender_id", "username display_name");

    const sender = message.sender_id;
    return res.status(201).json({
      id: message._id,
      conversation_id: message.conversation_id,
      sender_id: sender._id,
      content: message.content,
      iv: message.iv,
      status: message.status,
      created_at: message.createdAt,
      sender_name: sender.display_name || sender.username,
    });
  } catch (err) {
    console.error("sendMessage:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

/* =========================
   GET MESSAGES
========================= */
export async function getMessages(req, res) {
  try {
    const { conversationId } = req.params;

    const member = await isMember(req.user.id, conversationId);
    if (!member) return res.status(403).json({ error: "Not a member" });

    const limit = Math.min(parseInt(req.query.limit) || 40, 100);
    const before = req.query.before;

    const query = { conversation_id: conversationId };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sender_id", "username display_name")
      .lean();

    const formatted = messages.reverse().map((m) => ({
      id: m._id,
      sender_id: m.sender_id._id,
      content: m.content,
      iv: m.iv,
      status: m.status,
      created_at: m.createdAt,
      sender_name: m.sender_id.display_name || m.sender_id.username,
    }));

    return res.json(formatted);
  } catch (err) {
    console.error("getMessages:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

/* =========================
   UPDATE MESSAGE STATUS
========================= */
export async function updateMessageStatus(req, res) {
  try {
    const { message_id, status } = req.body;

    if (!VALID_STATUSES.includes(status))
      return res.status(400).json({ error: "Invalid status" });

    await Message.findByIdAndUpdate(message_id, { status });

    return res.json({ message: "updated" });
  } catch (err) {
    console.error("updateMessageStatus:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

/* =========================
   MARK CONVERSATION READ
========================= */
export async function markConversationRead(req, res) {
  try {
    const { conversationId } = req.params;

    const member = await isMember(req.user.id, conversationId);
    if (!member) return res.status(403).json({ error: "Not a member" });

    await Message.updateMany(
      {
        conversation_id: conversationId,
        sender_id: { $ne: req.user.id },
      },
      { status: "read" }
    );

    return res.json({ message: "Conversation marked as read" });
  } catch (err) {
    console.error("markConversationRead:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

/* =========================
   DELETE MESSAGE
========================= */
export async function deleteMessage(req, res) {
  try {
    const { messageId } = req.params;

    const result = await Message.findOneAndDelete({
      _id: messageId,
      sender_id: req.user.id,
    });

    if (!result)
      return res.status(404).json({ error: "Message not found or unauthorized" });

    return res.json({ message: "Message deleted" });
  } catch (err) {
    console.error("deleteMessage:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
