import { CallLog } from "../models/CallLog.js";
import { Conversation } from "../models/Conversation.js";

async function isMember(userId, conversationId) {
  const conv = await Conversation.findOne({
    _id: conversationId,
    "members.user_id": userId,
  });
  return !!conv;
}

/* =========================
   SAVE CALL LOG
========================= */
export async function saveCallLog(req, res) {
  try {
    const { conversation_id, call_type, status, duration_seconds } = req.body;

    if (!conversation_id || !call_type || !status)
      return res.status(400).json({ error: "conversation_id, call_type, status required" });

    const member = await isMember(req.user.id, conversation_id);
    if (!member) return res.status(403).json({ error: "Not a member" });

    const log = await CallLog.create({
      conversation_id,
      initiator_id: req.user.id,
      call_type,
      status,
      duration_seconds: duration_seconds || 0,
    });

    return res.status(201).json({
      id: log._id,
      conversation_id: log.conversation_id,
      initiator_id: log.initiator_id,
      call_type: log.call_type,
      status: log.status,
      duration_seconds: log.duration_seconds,
      created_at: log.createdAt,
    });
  } catch (err) {
    console.error("saveCallLog:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

/* =========================
   GET CALL LOGS FOR CONVERSATION
========================= */
export async function getCallLogs(req, res) {
  try {
    const { conversationId } = req.params;

    const member = await isMember(req.user.id, conversationId);
    if (!member) return res.status(403).json({ error: "Not a member" });

    const logs = await CallLog.find({ conversation_id: conversationId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const formatted = logs.reverse().map((l) => ({
      id: l._id,
      conversation_id: l.conversation_id,
      initiator_id: l.initiator_id,
      call_type: l.call_type,
      status: l.status,
      duration_seconds: l.duration_seconds,
      created_at: l.createdAt,
    }));

    return res.json(formatted);
  } catch (err) {
    console.error("getCallLogs:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
