import { useEffect, useRef, useState, useCallback } from "react";
import api from "../services/api";
import { getSocket } from "../services/socket";
import { decryptMessageWithFallback } from "../utils/crypto";

const AUDIO_PAYLOAD_PREFIX = "audio-b64:";

function getMyId() {
  try {
    return JSON.parse(atob(localStorage.getItem("token").split(".")[1])).id;
  } catch {
    return null;
  }
}

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

/* ── Message content renderer ── */
function MessageContent({ content, deleted }) {
  if (deleted) {
    return <span style={{ fontStyle: "italic", color: "#888" }}>🚫 This message was deleted</span>;
  }

  if (typeof content === "string" && content.startsWith(AUDIO_PAYLOAD_PREFIX)) {
    const encoded = content.slice(AUDIO_PAYLOAD_PREFIX.length);
    const splitIndex = encoded.indexOf(";base64,");
    if (splitIndex === -1) return <span>[Invalid audio]</span>;
    const mimeType = encoded.slice(0, splitIndex) || "audio/webm";
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
        width: `${100 + Math.random() * 80}px`, height: 38, borderRadius: 16,
        opacity: 0.4, animation: "pulse 1.4s ease-in-out infinite",
      }} />
    </div>
  );
}

export default function MessageList({ conversationId, isGroup }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);
  const myId = useRef(getMyId()).current;
  const bottomRef = useRef();
  const menuRef = useRef(null);

  /* ── Load + decrypt messages ── */
  const load = useCallback(async (convId) => {
    setLoading(true);
    try {
      const res = await api.get(`/messages/${convId}`);
      // Step 1: render raw messages immediately (fast)
      setMessages(res.data);
      setLoading(false);
      // Step 2: decrypt all in parallel, then swap in (still fast for most chats)
      const decrypted = await Promise.all(res.data.map(m => tryDecrypt(m, convId)));
      setMessages(decrypted);
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
        id: tempId,
        content: plaintext,
        sender_id: myId,
        created_at: new Date().toISOString(),
        optimistic: true,
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
    window.addEventListener("chatty:message_confirmed", onConfirmed);
    window.addEventListener("chatty:message_failed", onFailed);
    return () => {
      window.removeEventListener("chatty:message_optimistic", onOptimistic);
      window.removeEventListener("chatty:message_confirmed", onConfirmed);
      window.removeEventListener("chatty:message_failed", onFailed);
    };
  }, [conversationId, myId]);

  /* ── Message delete (socket broadcast) ── */
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

  /* ── Scroll to bottom on new message ── */
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
      {/* Skeleton while first load */}
      {loading && [0, 1, 2, 3].map(i => <MessageSkeleton key={i} isMine={i % 2 === 0} />)}

      {messages.map((msg, i) => {
        const isMine = msg.sender_id === myId;
        return (
          <div
            key={msg.id || i}
            style={{
              display: "flex",
              justifyContent: isMine ? "flex-end" : "flex-start",
              marginBottom: 12,
              opacity: msg.optimistic ? 0.75 : 1,
              transition: "opacity 0.2s",
            }}
          >
            <div style={{ ...s.bubble, ...(isMine ? s.bubbleMe : s.bubbleThem) }}>
              {/* Delete menu (own messages only) */}
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
                  {msg.optimistic && <span style={{ marginLeft: 4, opacity: 0.5 }}>✓</span>}
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
  list: { flex: 1, overflowY: "auto", padding: "12px 16px" },
  bubble: { position: "relative", padding: "10px 14px", maxWidth: "70%", borderRadius: 16, overflow: "visible" },
  bubbleMe: { background: "var(--bg-bubble-me)", marginRight: "35px" },
  bubbleThem: { background: "var(--bg-bubble-them)" },
  menuWrap: { position: "absolute", top: "50%", right: "-32px", transform: "translateY(-50%)" },
  menuBtn: { background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-muted)" },
  popup: { position: "absolute", top: 30, right: 0, padding: 6, background: "var(--bg-header)", border: "1px solid var(--border)", borderRadius: 10, zIndex: 999 },
  deleteBtn: { background: "transparent", border: "none", cursor: "pointer", color: "#ff6666" },
  time: { fontSize: 11, marginTop: 4, textAlign: "right", color: "#888" },
};
