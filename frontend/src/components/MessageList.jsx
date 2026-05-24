import { useEffect, useRef, useState, useCallback } from "react";
import api from "../services/api";
import { getSocket } from "../services/socket";
import { decryptMessageWithFallback } from "../utils/crypto";

const AUDIO_PAYLOAD_PREFIX = "audio-b64:";

function getMyId() {
  try { return JSON.parse(atob(localStorage.getItem("token").split(".")[1])).id; }
  catch { return null; }
}

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(secs) {
  if (!secs || secs < 1) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return ` · ${m}:${String(s).padStart(2, "0")}`;
}

/* ── Decrypt a single message ── */
async function tryDecrypt(msg, conversationId) {
  if (!msg.iv) return msg;
  try {
    const decrypted = await decryptMessageWithFallback(
      msg.content, msg.iv,
      [msg.conversation_id, msg.conversationId, conversationId]
    );
    return { ...msg, content: decrypted };
  } catch {
    return { ...msg, content: "[Failed to decrypt]" };
  }
}

/* ── Call record bubble (WhatsApp-style) ── */
function CallRecordBubble({ type, status, duration, isMine }) {
  const isVideo    = type === "video";
  const isMissed   = status === "missed";
  const isDeclined = status === "declined";
  const failed     = isMissed || isDeclined;

  let label;
  if (isMissed)        label = "Missed call";
  else if (isDeclined) label = "Declined";
  else                 label = isVideo ? "Video call" : "Voice call";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "9px 14px",
      background: isMine ? "var(--bg-bubble-me)" : "var(--bg-bubble-them)",
      borderRadius: 16, maxWidth: 230,
      border: `1px solid ${failed ? "#e5737322" : "var(--border, rgba(255,255,255,0.08))"}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
        background: failed ? "rgba(229,115,115,0.12)" : "rgba(77,216,255,0.1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: failed ? "#e57373" : "var(--accent, #4dd8ff)",
        fontSize: 18,
      }}>
        {isVideo ? "📹" : "📞"}
      </div>
      <div>
        <div style={{
          fontSize: 13.5, fontWeight: 600,
          color: failed ? "#e57373" : "var(--text-primary)",
        }}>
          {label}
        </div>
        {!failed && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            {isVideo ? "Video" : "Voice"}{fmtDuration(duration)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Message content renderer ── */
function MessageContent({ content, deleted }) {
  if (deleted) {
    return <span style={{ fontStyle: "italic", color: "#888" }}>🚫 This message was deleted</span>;
  }
  if (typeof content === "string" && content.startsWith(AUDIO_PAYLOAD_PREFIX)) {
    const encoded    = content.slice(AUDIO_PAYLOAD_PREFIX.length);
    const splitIndex = encoded.indexOf(";base64,");
    if (splitIndex === -1) return <span>[Invalid audio]</span>;
    const mimeType   = encoded.slice(0, splitIndex) || "audio/webm";
    const base64Data = encoded.slice(splitIndex + ";base64,".length);
    return <audio controls src={`data:${mimeType};base64,${base64Data}`} style={{ maxWidth: "100%", minWidth: 220 }} />;
  }
  if (typeof content === "string" && content.startsWith("audio:")) {
    return <audio controls src={content.slice(6)} style={{ maxWidth: "100%", minWidth: 220 }} />;
  }
  return <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{content}</span>;
}

/* ── Loading skeleton ── */
function MessageSkeleton({ isMine }) {
  return (
    <div style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginBottom: 12 }}>
      <div style={{
        ...s.bubble,
        background: "var(--bg-bubble-them, rgba(255,255,255,0.06))",
        width: `${110 + Math.random() * 80}px`, height: 38,
        opacity: 0.35, animation: "pulse 1.4s ease-in-out infinite",
      }} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */

export default function MessageList({ conversationId }) {
  const [messages, setMessages] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);

  const myId    = useRef(getMyId()).current;
  const bottomRef = useRef();
  const menuRef   = useRef(null);

  /* ── Load + decrypt messages ── */
  const load = useCallback(async (convId) => {
    setLoading(true);
    try {
      const res = await api.get(`/messages/${convId}`);
      setMessages(res.data);          // render immediately (fast)
      setLoading(false);
      const decrypted = await Promise.all(res.data.map(m => tryDecrypt(m, convId)));
      setMessages(decrypted);         // swap in decrypted text
    } catch (err) {
      console.error("[MessageList load]", err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    setMessages([]);
    load(conversationId);
  }, [conversationId, load]);

  /* ── Socket: incoming messages from others ── */
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit("join_conversation", conversationId);

    async function onMessage(data) {
      if (String(data.conversation_id) !== String(conversationId)) return;
      const decrypted = await tryDecrypt(data, conversationId);
      setMessages(prev => [...prev, decrypted]);
    }

    socket.on("receive_message", onMessage);
    return () => socket.off("receive_message", onMessage);
  }, [conversationId]);

  /* ── Optimistic: own message shown instantly ── */
  useEffect(() => {
    function onOptimistic(e) {
      const { tempId, plaintext, conversationId: cid } = e.detail;
      if (cid !== conversationId) return;
      setMessages(prev => [...prev, {
        id: tempId, content: plaintext, sender_id: myId,
        created_at: new Date().toISOString(), optimistic: true,
      }]);
    }
    function onConfirmed(e) {
      const { tempId, data } = e.detail;
      setMessages(prev => prev.map(m => m.id === tempId ? { ...data } : m));
    }
    function onFailed(e) {
      const { tempId } = e.detail;
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
    window.addEventListener("chatty:message_optimistic", onOptimistic);
    window.addEventListener("chatty:message_confirmed",  onConfirmed);
    window.addEventListener("chatty:message_failed",     onFailed);
    return () => {
      window.removeEventListener("chatty:message_optimistic", onOptimistic);
      window.removeEventListener("chatty:message_confirmed",  onConfirmed);
      window.removeEventListener("chatty:message_failed",     onFailed);
    };
  }, [conversationId, myId]);

  /* ── Call record: appear in chat when a call ends ── */
  useEffect(() => {
    function onCallRecord(e) {
      const { type, status, duration, isMine, conversationId: cid } = e.detail;
      if (cid !== conversationId) return;
      setMessages(prev => [...prev, {
        id:         `call_${Date.now()}`,
        _callRecord: true,
        callType:   type,
        callStatus: status,
        callDuration: duration,
        isMine,
        created_at: new Date().toISOString(),
      }]);
    }
    window.addEventListener("chatty:call_record", onCallRecord);
    return () => window.removeEventListener("chatty:call_record", onCallRecord);
  }, [conversationId]);

  /* ── Socket: message deleted by someone else ── */
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    function onDeleted({ message_id }) {
      setMessages(prev => prev.map(m =>
        m.id === message_id ? { ...m, deleted: true, content: "This message was deleted" } : m
      ));
    }
    socket.on("message_deleted", onDeleted);
    return () => socket.off("message_deleted", onDeleted);
  }, []);

  /* ── Scroll to bottom ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── Close context menu on outside click ── */
  useEffect(() => {
    function onOutside(e) {
      if (menuOpen !== null && menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(null);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [menuOpen]);

  async function deleteMessage(id) {
    try {
      await api.delete(`/messages/${id}`);
      setMessages(prev => prev.map(m =>
        m.id === id ? { ...m, deleted: true, content: "This message was deleted" } : m
      ));
      setMenuOpen(null);
      getSocket()?.emit("delete_message", { message_id: id, conversation_id: conversationId });
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div style={s.list}>
      {loading && [0, 1, 2, 3].map(i => <MessageSkeleton key={i} isMine={i % 2 === 0} />)}

      {messages.map((msg, i) => {
        const isMine = msg.sender_id === myId;

        /* ── Call record entry ── */
        if (msg._callRecord) {
          return (
            <div key={msg.id} style={{
              display: "flex",
              justifyContent: msg.isMine ? "flex-end" : "flex-start",
              marginBottom: 12,
            }}>
              <div>
                <CallRecordBubble
                  type={msg.callType}
                  status={msg.callStatus}
                  duration={msg.callDuration}
                  isMine={msg.isMine}
                />
                <div style={{ ...s.time, textAlign: msg.isMine ? "right" : "left", marginTop: 4 }}>
                  {formatTime(msg.created_at)}
                </div>
              </div>
            </div>
          );
        }

        /* ── Regular message ── */
        return (
          <div key={msg.id || i} style={{
            display: "flex",
            justifyContent: isMine ? "flex-end" : "flex-start",
            marginBottom: 12,
            opacity: msg.optimistic ? 0.72 : 1,
            transition: "opacity 0.2s",
          }}>
            <div style={{ ...s.bubble, ...(isMine ? s.bubbleMe : s.bubbleThem) }}>
              {isMine && !msg.optimistic && (
                <div ref={menuOpen === msg.id ? menuRef : null} style={s.menuWrap}>
                  <button style={s.menuBtn} onClick={() => setMenuOpen(p => p === msg.id ? null : msg.id)}>⋮</button>
                  {menuOpen === msg.id && (
                    <div style={s.popup}>
                      <button style={s.deleteBtn} onClick={() => deleteMessage(msg.id)}>Delete</button>
                    </div>
                  )}
                </div>
              )}
              <div>
                <MessageContent content={msg.content} deleted={msg.deleted} />
                <div style={s.time}>
                  {formatTime(msg.created_at || msg.createdAt)}
                  {msg.optimistic && <span style={{ marginLeft: 4, opacity: 0.4 }}>✓</span>}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}

const s = {
  list:      { flex: 1, overflowY: "auto", padding: "12px 16px" },
  bubble:    { position: "relative", padding: "10px 14px", maxWidth: "70%", borderRadius: 16, overflow: "visible" },
  bubbleMe:  { background: "var(--bg-bubble-me)",   marginRight: "35px" },
  bubbleThem:{ background: "var(--bg-bubble-them)" },
  menuWrap:  { position: "absolute", top: "50%", right: "-32px", transform: "translateY(-50%)" },
  menuBtn:   { background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-muted)" },
  popup:     { position: "absolute", top: 30, right: 0, padding: 6, background: "var(--bg-header)", border: "1px solid var(--border)", borderRadius: 10, zIndex: 999 },
  deleteBtn: { background: "transparent", border: "none", cursor: "pointer", color: "#ff6666" },
  time:      { fontSize: 11, marginTop: 4, textAlign: "right", color: "#888" },
};
