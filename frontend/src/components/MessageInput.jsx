import { useState, useRef, useCallback, useEffect } from "react";
import EmojiPicker from "emoji-picker-react";
import api from "../services/api";
import { getSocket } from "../services/socket";
import { encryptMessage } from "../utils/crypto";
import { IoMic, IoStop } from "react-icons/io5";

const AUDIO_PAYLOAD_PREFIX = "audio-b64:";
const MAX_RECORD_SECONDS = 60;
const AUDIO_BITS_PER_SECOND = 24_000;

function pickAudioMimeType() {
  const mimeTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || "";
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function dispatch(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export default function MessageInput({ conversationId }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const textareaRef = useRef();
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const autoStopTimerRef = useRef(null);

  const clearTimers = useCallback(() => {
    clearInterval(recordTimerRef.current);
    clearTimeout(autoStopTimerRef.current);
    recordTimerRef.current = null;
    autoStopTimerRef.current = null;
  }, []);

  const cleanupRecorder = useCallback(() => {
    clearTimers();
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setRecording(false);
    setRecordSeconds(0);
  }, [clearTimers]);

  useEffect(() => () => cleanupRecorder(), [cleanupRecorder]);

  /* ── text send — optimistic first, encrypt+post after ── */
  const send = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || recording || !conversationId) return;

    // 1. Update UI instantly — before any async work
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setText("");
    setSending(true);
    dispatch("chatty:message_optimistic", { tempId, plaintext: trimmed, conversationId });

    try {
      // 2. Encrypt and post in background
      const encrypted = await encryptMessage(trimmed, conversationId);
      const res = await api.post("/messages", {
        conversation_id: conversationId,
        content: encrypted.ciphertext,
        iv: encrypted.iv,
      });

      // 3. Replace optimistic bubble with confirmed server message
      dispatch("chatty:message_confirmed", { tempId, data: { ...res.data, content: trimmed } });

      // 4. Broadcast to other participants via socket
      getSocket()?.emit("send_message", res.data);

      // 5. Refresh sidebar preview
      dispatch("chatty:message_sent", { plaintext: trimmed, data: res.data });

    } catch (err) {
      console.error("[send]", err);
      setText(trimmed); // restore on failure
      dispatch("chatty:message_failed", { tempId });
    } finally {
      setSending(false);
    }
  }, [text, sending, recording, conversationId]);

  /* ── audio send ── */
  const sendAudioBlob = useCallback(async (blob) => {
    if (!blob || blob.size === 0) return;
    const mimeType = blob.type || "audio/webm";
    const base64Audio = arrayBufferToBase64(await blob.arrayBuffer());
    const payload = `${AUDIO_PAYLOAD_PREFIX}${mimeType};base64,${base64Audio}`;
    const encrypted = await encryptMessage(payload, conversationId);
    const res = await api.post("/audio/upload", {
      conversation_id: conversationId,
      content: encrypted.ciphertext,
      iv: encrypted.iv,
    });
    getSocket()?.emit("send_message", res.data);
    dispatch("chatty:message_sent", { plaintext: payload, data: res.data });
  }, [conversationId]);

  const startRecording = useCallback(async () => {
    if (recording || sending) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mimeType = pickAudioMimeType();
      const options = { audioBitsPerSecond: AUDIO_BITS_PER_SECOND };
      if (mimeType) options.mimeType = mimeType;

      const recorder = new MediaRecorder(stream, options);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        try {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || mimeType || "audio/webm",
          });
          setSending(true);
          await sendAudioBlob(audioBlob);
        } catch (err) {
          console.error("[audio send]", err);
        } finally {
          setSending(false);
          cleanupRecorder();
        }
      };

      recorder.start(250);
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds(p => p + 1), 1000);
      autoStopTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      }, MAX_RECORD_SECONDS * 1000);
    } catch (err) {
      console.error("[recording]", err);
      cleanupRecorder();
    }
  }, [cleanupRecorder, recording, sendAudioBlob, sending]);

  const stopRecording = useCallback(() => {
    const r = mediaRecorderRef.current;
    if (r?.state === "recording") r.stop();
    else cleanupRecorder();
  }, [cleanupRecorder]);

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function addEmoji(e) {
    setText(prev => prev + e.emoji);
    textareaRef.current?.focus();
  }

  return (
    <>
      {showEmoji && (
        <div style={s.popup}>
          <EmojiPicker onEmojiClick={addEmoji} theme="dark" />
        </div>
      )}
      <div style={s.bar}>
        <button style={s.emojiBtn} onClick={() => setShowEmoji(v => !v)} title="Emoji">😀</button>

        <textarea
          ref={textareaRef}
          style={s.textarea}
          value={text}
          rows={1}
          placeholder={recording ? `Recording… ${recordSeconds}s` : "Message"}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          disabled={recording}
        />

        <button
          style={{ ...s.audioBtn, ...(recording ? s.audioBtnActive : {}), opacity: sending ? 0.45 : 1 }}
          onClick={recording ? stopRecording : startRecording}
          disabled={sending}
          title={recording ? "Stop recording" : "Record voice message"}
        >
          {recording ? <IoStop size={18} /> : <IoMic size={22} />}
        </button>

        <button
          style={{ ...s.sendBtn, opacity: sending || !text.trim() || recording ? 0.45 : 1 }}
          onClick={send}
          disabled={sending || !text.trim() || recording}
          title="Send"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </>
  );
}

const s = {
  bar: {
    display: "flex", alignItems: "flex-end", gap: 8,
    padding: "10px 14px",
    background: "var(--bg-header)",
    borderTop: "1px solid var(--border)",
    flexShrink: 0,
  },
  textarea: {
    flex: 1, resize: "none",
    background: "var(--bg-input)", color: "var(--text-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    padding: "10px 14px", fontSize: 14, lineHeight: 1.5,
    maxHeight: 120, overflowY: "auto",
    fontFamily: "var(--font)",
    transition: "border-color .15s, background .15s",
  },
  emojiBtn: {
    background: "none", fontSize: 20, padding: "6px",
    borderRadius: "50%", color: "var(--text-muted)",
    flexShrink: 0, transition: "background .15s", lineHeight: 1,
  },
  audioBtn: {
    width: 38, height: 38, borderRadius: "50%",
    background: "var(--bg-input)", color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "all .15s",
  },
  audioBtnActive: {
    background: "rgba(255,90,90,0.15)", color: "#ff7f7f",
    borderColor: "rgba(255,90,90,0.35)",
  },
  sendBtn: {
    background: "var(--accent)", color: "var(--bg-app)",
    width: 38, height: 38, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "opacity .15s, background .15s",
  },
  popup: { position: "absolute", bottom: 70, left: 14, zIndex: 100 },
};
