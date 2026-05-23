import { useEffect, useRef } from "react";

export function IncomingCallModal({ callerName, callType, onAccept, onReject }) {
  return (
    <div style={overlay}>
      <div style={card}>
        <p style={{ margin: "0 0 8px", fontSize: 13, color: "#aaa" }}>
          Incoming {callType} call
        </p>
        <h3 style={{ margin: "0 0 20px" }}>{callerName}</h3>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={onReject} style={btnRed}>✕ Decline</button>
          <button onClick={onAccept} style={btnGreen}>✓ Accept</button>
        </div>
      </div>
    </div>
  );
}

export function ActiveCallScreen({ callerName, callType, localStream, remoteStream, onEnd, isMuted, onToggleMute }) {
  const remoteRef = useRef();
  const localRef = useRef();

  useEffect(() => {
    if (remoteRef.current && remoteStream) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (localRef.current && localStream) localRef.current.srcObject = localStream;
  }, [localStream]);

  return (
    <div style={overlay}>
      <div style={{ ...card, width: callType === "video" ? 480 : 280 }}>
        {callType === "video" && (
          <div style={{ position: "relative", background: "#000", borderRadius: 8, marginBottom: 12 }}>
            <video ref={remoteRef} autoPlay playsInline style={{ width: "100%", borderRadius: 8 }} />
            <video ref={localRef} autoPlay playsInline muted
              style={{ position: "absolute", bottom: 8, right: 8, width: 90, borderRadius: 6, border: "2px solid #333" }} />
          </div>
        )}
        {callType === "audio" && (
          <div style={{ fontSize: 48, marginBottom: 12 }}>📞</div>
        )}
        {/* hidden audio for voice calls */}
        <audio ref={remoteRef} autoPlay playsInline style={{ display: callType === "video" ? "none" : "none" }} />

        <p style={{ margin: "0 0 16px", fontWeight: 600 }}>{callerName}</p>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#aaa" }}>Call in progress…</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={onToggleMute} style={btnGray}>{isMuted ? "🔇 Muted" : "🎙 Mute"}</button>
          <button onClick={onEnd} style={btnRed}>✕ End</button>
        </div>
      </div>
    </div>
  );
}

// — Styles —
const overlay = { position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 };
const card = { background:"var(--bg-secondary, #1e1e2e)", borderRadius:16, padding:"28px 32px", textAlign:"center", color:"var(--text-primary, #fff)", minWidth:240 };
const btnRed = { padding:"10px 22px", borderRadius:50, border:"none", background:"#e53935", color:"#fff", cursor:"pointer", fontWeight:600 };
const btnGreen = { padding:"10px 22px", borderRadius:50, border:"none", background:"#43a047", color:"#fff", cursor:"pointer", fontWeight:600 };
const btnGray = { padding:"10px 22px", borderRadius:50, border:"none", background:"#444", color:"#fff", cursor:"pointer", fontWeight:600 };