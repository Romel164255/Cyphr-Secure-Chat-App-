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
          <button onClick={onReject} style={btnRed} title="Decline">
            ✕ Decline
          </button>
          <button onClick={onAccept} style={btnGreen} title="Accept">
            ✓ Accept
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Active call screen ── */
export function ActiveCallScreen({ callerName, callType, localStream, remoteStream, onEnd, isMuted, onToggleMute }) {
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  return (
    <div style={overlay}>
      <div style={{ ...card, width: callType === "video" ? 500 : 300 }}>
        {callType === "video" ? (
          <div style={{ position: "relative", background: "#000", borderRadius: 10, marginBottom: 16, overflow: "hidden", minHeight: 240 }}>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{ width: "100%", display: "block", borderRadius: 10 }}
            />
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                position: "absolute", bottom: 10, right: 10,
                width: 100, borderRadius: 8,
                border: "2px solid rgba(255,255,255,0.2)",
              }}
            />
          </div>
        ) : (
          <>
            <div style={{ fontSize: 56, marginBottom: 12 }}>📞</div>
            {/* hidden audio element for voice calls */}
            <audio ref={remoteAudioRef} autoPlay playsInline />
          </>
        )}

        <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 17 }}>{callerName}</p>
        <p style={{ margin: "0 0 20px", fontSize: 12, color: "#aaa" }}>
          {callType === "video" ? "Video call" : "Voice call"} in progress…
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={onToggleMute} style={btnGray}>
            {isMuted ? "🔇 Unmute" : "🎙 Mute"}
          </button>
          <button onClick={onEnd} style={btnRed}>
            ✕ End call
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Calling… screen (outgoing, waiting for answer) ── */
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
  background: "rgba(0,0,0,0.75)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 9999,
  backdropFilter: "blur(4px)",
};

const card = {
  background: "var(--bg-secondary, #1e1e2e)",
  borderRadius: 18,
  padding: "28px 32px",
  textAlign: "center",
  color: "var(--text-primary, #fff)",
  minWidth: 260,
  boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
  border: "1px solid var(--border, rgba(255,255,255,0.08))",
};

const btnRed = {
  padding: "10px 24px", borderRadius: 50, border: "none",
  background: "#e53935", color: "#fff", cursor: "pointer",
  fontWeight: 600, fontSize: 14,
};
const btnGreen = {
  padding: "10px 24px", borderRadius: 50, border: "none",
  background: "#43a047", color: "#fff", cursor: "pointer",
  fontWeight: 600, fontSize: 14,
};
const btnGray = {
  padding: "10px 24px", borderRadius: 50, border: "none",
  background: "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer",
  fontWeight: 600, fontSize: 14,
};
