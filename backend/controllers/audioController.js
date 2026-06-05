import { Message } from "../models/Message.js";
import { Conversation } from "../models/Conversation.js";

const MAX_AUDIO_PAYLOAD_LENGTH = 1_800_000;

async function isMember(userId, conversationId) {
  const conv = await Conversation.findOne({
    _id: conversationId,
    "members.user_id": userId,
  });
  return !!conv;
}

/* ─────────────────────────────
   POST /audio/upload
───────────────────────────── */
export async function uploadAudio(req, res) {
  try {
    const { conversation_id, content, iv } = req.body;

    if (!conversation_id || !content || !iv)
      return res.status(400).json({ error: "conversation_id, content, iv required" });

    if (content.length > MAX_AUDIO_PAYLOAD_LENGTH)
      return res.status(400).json({ error: `Audio payload too large (max ${MAX_AUDIO_PAYLOAD_LENGTH} chars)` });

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
    console.error("Audio upload error:", err);
    return res.status(500).json({ error: "Audio upload failed" });
  }
}
