import { useEffect, useRef, useState } from "react";

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
  const localVideoRef  = useRef(null);
  const remoteAudioRef = useRef(null);

  // Controls overlay visibility — auto-hides after 3 s of no pointer movement
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef(null);

  const showControls = () => {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  };

  useEffect(() => {
    // Start the auto-hide timer once the call goes active
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    return () => clearTimeout(hideTimerRef.current);
  }, []);

  /* Attach remote stream → full-screen video */
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || !remoteStream) return;
    el.srcObject = remoteStream;
    el.play().catch(() => {});
    return () => { if (el) el.srcObject = null; };
  }, [remoteStream]);

  /* Attach local stream → PiP thumbnail */
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localStream) return;
    el.srcObject = localStream;
    el.play().catch(() => {});
    return () => { if (el) el.srcObject = null; };
  }, [localStream]);

  /* Audio-only calls: attach remote stream to hidden <audio> element.
     For video calls the <video> element already plays audio, but having
     a separate <audio> attached to the same stream causes echo — so we
     only attach remoteAudioRef when it is NOT a video call. */
  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el || callType === "video") return;
    if (remoteStream) {
      el.srcObject = remoteStream;
      el.play().catch(() => {});
    }
    return () => { if (el) el.srcObject = null; };
  }, [remoteStream, callType]);

  const isVideo = callType === "video";

  return (
    <div
      style={{ ...overlay, alignItems: isVideo ? "stretch" : "center" }}
      onMouseMove={isVideo ? showControls : undefined}
      onTouchStart={isVideo ? showControls : undefined}
    >
      <div
        style={{
          ...card,
          width:        isVideo ? "100vw" : 300,
          maxWidth:     isVideo ? "100vw" : 300,
          height:       isVideo ? "100vh" : "auto",
          borderRadius: isVideo ? 0 : 20,
          padding:      isVideo ? 0 : "28px 32px",
          overflow:     "hidden",
          display:      "flex",
          flexDirection: "column",
        }}
      >
        {/* ── VIDEO LAYOUT ── */}
        {isVideo && (
          <div style={{ position: "relative", flex: 1, minHeight: 0, background: "#000", display: "flex", alignItems: "stretch" }}>

            {/* ── REMOTE: full-screen background ── */}
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                // NOT muted — this is the person you're talking to, you need to hear them
                style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000", display: "block" }}
              />
            ) : (
              /* Waiting for remote video — show a placeholder */
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                <div style={{ fontSize: 64, marginBottom: 12 }}>👤</div>
                <p style={{ margin: 0, fontSize: 15, color: "#aaa" }}>Connecting…</p>
              </div>
            )}

            {/* ── LOCAL: PiP in bottom-right corner ── */}
            <div style={{
              position: "absolute",
              bottom: 90,   // sits above the controls bar
              right: 14,
              width: 130,
              height: 88,
              borderRadius: 12,
              overflow: "hidden",
              border: "2px solid rgba(255,255,255,0.25)",
              background: "#111",
              boxShadow: "0 4px 18px rgba(0,0,0,0.55)",
            }}>
              {localStream ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted  // always muted — local preview, never echo your own voice
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 28 }}>
                  👤
                </div>
              )}
            </div>

            {/* ── CONTROLS OVERLAY — auto-hides after 3 s ── */}
            <div style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "12px 24px 18px",
              background: "linear-gradient(transparent, rgba(0,0,0,0.80))",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              transition: "opacity 0.3s",
              opacity: controlsVisible ? 1 : 0,
              pointerEvents: controlsVisible ? "auto" : "none",
            }}>
              <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 16, color: "#fff" }}>{callerName}</p>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#bbb" }}>Video call in progress…</p>
              <div style={{ display: "flex", gap: 14 }}>
                <button onClick={onToggleMute} style={btnGray}>
                  {isMuted ? "🔇 Unmute" : "🎙 Mute"}
                </button>
                <button onClick={onEnd} style={btnRed}>✕ End</button>
              </div>
            </div>

          </div>
        )}

        {/* ── AUDIO LAYOUT ── */}
        {!isVideo && (
          <>
            <div style={{ fontSize: 60, marginBottom: 16 }}>📞</div>
            {/* Hidden audio element for voice calls */}
            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />
            <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 17 }}>{callerName}</p>
            <p style={{ margin: "0 0 20px", fontSize: 12, color: "#aaa" }}>Voice call in progress…</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={onToggleMute} style={btnGray}>
                {isMuted ? "🔇 Unmute" : "🎙 Mute"}
              </button>
              <button onClick={onEnd} style={btnRed}>✕ End</button>
            </div>
          </>
        )}
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
  padding: "10px 24px", borderRadius: 50, border: "none",
  background: "#e53935", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14,
};
const btnGreen = {
  padding: "10px 24px", borderRadius: 50, border: "none",
  background: "#43a047", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14,
};
const btnGray = {
  padding: "10px 24px", borderRadius: 50, border: "none",
  background: "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14,
};
