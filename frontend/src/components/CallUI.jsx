import { useEffect, useRef } from "react";

/* ── Incoming call modal ── */
export function IncomingCallModal({ callerName, callType, onAccept, onReject }) {
  return (
    <div style={overlay}>
      <div style={card}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>
          {callType === "video" ? "📹" : "📞"}
        </div>
        <p style={{ margin: "0 0 4px", fontSize: 12, color: "#aaa", textTransform: "uppercase", letterSpacing: 1 }}>
          Incoming {callType} call
        </p>
        <h3 style={{ margin: "0 0 24px", fontSize: 18 }}>{callerName}</h3>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <button onClick={onReject} style={btnRed}>✕ Decline</button>
          <button onClick={onAccept} style={btnGreen}>✓ Accept</button>
        </div>
      </div>
    </div>
  );
}

/* ── Active call screen ── */
export function ActiveCallScreen({ callerName, callType, localStream, remoteStream, onEnd, isMuted, onToggleMute }) {
  const remoteVideoRef = useRef(null);
  const localVideoRef  = useRef(null);
  // Audio element is ALWAYS in the DOM — voice calls need it; video calls also have audio tracks
  const remoteAudioRef = useRef(null);

  /* Attach remote stream to video element (video calls) */
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el) return;
    if (remoteStream) {
      el.srcObject = remoteStream;
      el.play().catch(() => {}); // autoplay policy
    }
  }, [remoteStream]);

  /* Attach local stream to small preview (video calls) */
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    if (localStream) {
      el.srcObject = localStream;
      el.play().catch(() => {});
    }
  }, [localStream]);

  /* Attach remote stream to audio element — covers voice calls AND the audio
     track of video calls when the browser doesn't auto-play video audio */
  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el) return;
    if (remoteStream) {
      el.srcObject = remoteStream;
      el.play().catch(() => {});
    }
  }, [remoteStream]);

  const isVideo = callType === "video";

  return (
    <div style={overlay}>
      <div style={{ ...card, width: isVideo ? 520 : 300 }}>

        {/* ── Video layout ── */}
        {isVideo && (
          <div style={{ position: "relative", background: "#000", borderRadius: 12, marginBottom: 16, overflow: "hidden", minHeight: 260 }}>
            {/* Remote video (full) */}
            <video ref={remoteVideoRef} autoPlay playsInline
              style={{ width: "100%", display: "block", borderRadius: 12 }} />
            {/* Local video (pip) */}
            <video ref={localVideoRef} autoPlay playsInline muted
              style={{ position: "absolute", bottom: 10, right: 10, width: 110,
                borderRadius: 8, border: "2px solid rgba(255,255,255,0.2)" }} />
          </div>
        )}

        {/* ── Audio layout ── */}
        {!isVideo && (
          <div style={{ fontSize: 60, marginBottom: 16 }}>📞</div>
        )}

        {/* Hidden audio element — always present so ref is ready when stream arrives */}
        <audio ref={remoteAudioRef} autoPlay playsInline
          style={{ display: "none" }} />

        <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 17 }}>{callerName}</p>
        <p style={{ margin: "0 0 20px", fontSize: 12, color: "#aaa" }}>
          {isVideo ? "Video call" : "Voice call"} in progress…
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={onToggleMute} style={btnGray}>
            {isMuted ? "🔇 Unmute" : "🎙 Mute"}
          </button>
          <button onClick={onEnd} style={btnRed}>✕ End</button>
        </div>
      </div>
    </div>
  );
}

/* ── Outgoing / calling screen ── */
export function CallingScreen({ callerName, callType, onCancel }) {
  return (
    <div style={overlay}>
      <div style={card}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>
          {callType === "video" ? "📹" : "📞"}
        </div>
        <p style={{ margin: "0 0 4px", fontSize: 12, color: "#aaa", textTransform: "uppercase", letterSpacing: 1 }}>
          Calling…
        </p>
        <h3 style={{ margin: "0 0 24px", fontSize: 18 }}>{callerName}</h3>
        <button onClick={onCancel} style={btnRed}>✕ Cancel</button>
      </div>
    </div>
  );
}

/* ── Styles ── */
const overlay = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.78)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 9999,
  backdropFilter: "blur(6px)",
};
const card = {
  background: "var(--bg-secondary, #1e1e2e)",
  borderRadius: 20,
  padding: "28px 32px",
  textAlign: "center",
  color: "var(--text-primary, #fff)",
  minWidth: 260,
  boxShadow: "0 24px 64px rgba(0,0,0,0.65)",
  border: "1px solid var(--border, rgba(255,255,255,0.08))",
};
const btnRed   = { padding: "10px 24px", borderRadius: 50, border: "none", background: "#e53935", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 };
const btnGreen = { padding: "10px 24px", borderRadius: 50, border: "none", background: "#43a047", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 };
const btnGray  = { padding: "10px 24px", borderRadius: 50, border: "none", background: "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 };
