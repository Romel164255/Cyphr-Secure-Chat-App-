import { useEffect, useRef } from "react";

/* ── Incoming call modal ── */
export function IncomingCallModal({
  callerName,
  callType,
  onAccept,
  onReject,
}) {
  return (
    <div style={overlay}>
      <div style={card}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>
          {callType === "video" ? "📹" : "📞"}
        </div>
        <p
          style={{
            margin: "0 0 4px",
            fontSize: 12,
            color: "#aaa",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Incoming {callType} call
        </p>
        <h3 style={{ margin: "0 0 24px", fontSize: 18 }}>{callerName}</h3>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <button onClick={onReject} style={btnRed}>
            ✕ Decline
          </button>
          <button onClick={onAccept} style={btnGreen}>
            ✓ Accept
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Active call screen ── */
export function ActiveCallScreen({
  callerName,
  callType,
  localStream,
  remoteStream,
  onEnd,
  isMuted,
  onToggleMute,
}) {
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
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
    return () => {
      if (el) el.srcObject = null;
    };
  }, [remoteStream]);

  /* Attach local stream to small preview (video calls) */
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    if (localStream) {
      el.srcObject = localStream;
      el.play().catch(() => {});
    }
    return () => {
      if (el) el.srcObject = null;
    };
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
    return () => {
      if (el) el.srcObject = null;
    };
  }, [remoteStream]);

  const isVideo = callType === "video";

  return (
    <div style={overlay}>
      <div
        style={{
          ...card,
          width: isVideo ? "100vw" : 300,
          maxWidth: isVideo ? "100vw" : 300,
          height: isVideo ? "100vh" : "auto",
          maxHeight: isVideo ? "100vh" : undefined,
          borderRadius: isVideo ? 0 : 20,
          padding: isVideo ? 0 : "28px 32px",
          overflow: isVideo ? "hidden" : undefined,
        }}
      >
        {/* ── Video layout ── */}
        {isVideo && (
          <div
            style={{
              position: "relative",
              background: "#000",
              overflow: "hidden",
              flex: 1,
              display: "flex",
              minHeight: 0,
              justifyContent: "stretch",
              alignItems: "stretch",
            }}
          >
            {/* Remote video (full) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                objectFit: "cover",
                background: "#000",
              }}
            />
            {/* Local video (pip) */}
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                position: "absolute",
                bottom: 14,
                right: 14,
                width: 140,
                height: 96,
                borderRadius: 10,
                border: "2px solid rgba(255,255,255,0.22)",
                objectFit: "cover",
                background: "#111",
              }}
            />
          </div>
        )}

        {/* ── Audio layout ── */}
        {!isVideo && <div style={{ fontSize: 60, marginBottom: 16 }}>📞</div>}

        {/* Hidden audio element — always present so ref is ready when stream arrives */}
        <audio
          ref={remoteAudioRef}
          autoPlay
          playsInline
          style={{ display: "none" }}
        />

        <div style={{ padding: isVideo ? "22px 24px" : undefined }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 17 }}>
            {callerName}
          </p>
          <p style={{ margin: "0 0 20px", fontSize: 12, color: "#aaa" }}>
            {isVideo ? "Video call" : "Voice call"} in progress…
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button onClick={onToggleMute} style={btnGray}>
              {isMuted ? "🔇 Unmute" : "🎙 Mute"}
            </button>
            <button onClick={onEnd} style={btnRed}>
              ✕ End
            </button>
          </div>
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
        <p
          style={{
            margin: "0 0 4px",
            fontSize: 12,
            color: "#aaa",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Calling…
        </p>
        <h3 style={{ margin: "0 0 24px", fontSize: 18 }}>{callerName}</h3>
        <button onClick={onCancel} style={btnRed}>
          ✕ Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Styles ── */
const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.78)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
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
const btnRed = {
  padding: "10px 24px",
  borderRadius: 50,
  border: "none",
  background: "#e53935",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
};
const btnGreen = {
  padding: "10px 24px",
  borderRadius: 50,
  border: "none",
  background: "#43a047",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
};
const btnGray = {
  padding: "10px 24px",
  borderRadius: 50,
  border: "none",
  background: "rgba(255,255,255,0.1)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
};
