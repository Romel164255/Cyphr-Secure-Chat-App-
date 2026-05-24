import { useState, useEffect, useCallback } from "react";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import { Avatar } from "./Sidebar";
import api from "../services/api";
import { getSocket } from "../services/socket";
import { useWebRTC } from "../hooks/useWebRTC";
import { IncomingCallModal, ActiveCallScreen, CallingScreen } from "./CallUI";
import { IoCall, IoVideocam } from "react-icons/io5";

function dispatch(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export default function ChatWindow({ conversationId, title, isGroup, otherUserId, onBack }) {
  const [onlineUsers, setOnlineUsers]   = useState([]);
  const [typingUsers, setTypingUsers]   = useState([]);
  const [members, setMembers]           = useState([]);
  const [showInfo, setShowInfo]         = useState(false);
  const [isMuted, setIsMuted]           = useState(false);

  /* ── Call record: fires when a call ends (either side) ── */
  const handleCallRecord = useCallback((type, status, duration, isInitiator) => {
    // Show in local chat immediately
    dispatch("chatty:call_record", { type, status, duration, isMine: isInitiator, conversationId });

    // Tell the other person via socket so they see it too
    if (otherUserId) {
      getSocket()?.emit("webrtc_call_record", {
        targetUserId: otherUserId,
        type,
        status,
        duration,
        conversationId,
      });
    }
  }, [conversationId, otherUserId]);

  const {
    callState, callType, localStream, remoteStream,
    startCall, acceptCall, rejectCall, endCall,
    handleIncomingOffer, handleAnswer, handleIceCandidate,
    handleRemoteEnd, handleRemoteReject,
  } = useWebRTC({
    onCallEnded:  () => setIsMuted(false),
    onCallRecord: handleCallRecord,
  });

  /* ── Online users ── */
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const fn = (list) => setOnlineUsers(list);
    s.on("online_users", fn);
    return () => s.off("online_users", fn);
  }, []);

  /* ── Typing indicators ── */
  useEffect(() => {
    const s = getSocket();
    if (!s || !conversationId) return;
    const fn = ({ conversationId: cid, userId, isTyping }) => {
      if (cid !== conversationId) return;
      setTypingUsers(prev =>
        isTyping ? [...new Set([...prev, userId])] : prev.filter(x => x !== userId)
      );
    };
    s.on("user_typing", fn);
    return () => s.off("user_typing", fn);
  }, [conversationId]);

  /* ── WebRTC socket events ── */
  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    // When the other side sends us a call record (they hung up / missed etc.)
    function onRemoteCallRecord({ type, status, duration, conversationId: cid }) {
      dispatch("chatty:call_record", {
        type,
        status,
        duration,
        isMine: false,     // from their perspective they sent it; for us it's incoming
        conversationId: cid,
      });
    }

    s.on("webrtc_offer",        handleIncomingOffer);
    s.on("webrtc_answer",       handleAnswer);
    s.on("webrtc_ice_candidate",handleIceCandidate);
    s.on("webrtc_rejected",     handleRemoteReject);
    s.on("webrtc_ended",        handleRemoteEnd);
    s.on("webrtc_call_record",  onRemoteCallRecord);

    return () => {
      s.off("webrtc_offer",        handleIncomingOffer);
      s.off("webrtc_answer",       handleAnswer);
      s.off("webrtc_ice_candidate",handleIceCandidate);
      s.off("webrtc_rejected",     handleRemoteReject);
      s.off("webrtc_ended",        handleRemoteEnd);
      s.off("webrtc_call_record",  onRemoteCallRecord);
    };
  }, [handleIncomingOffer, handleAnswer, handleIceCandidate, handleRemoteEnd, handleRemoteReject]);

  /* ── Group member list ── */
  useEffect(() => {
    if (showInfo && isGroup) {
      api.get(`/groups/${conversationId}/members`)
        .then(r => setMembers(r.data))
        .catch(() => {});
    }
  }, [showInfo, conversationId, isGroup]);

  function toggleMute() {
    if (!localStream) return;
    localStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  }

  if (!conversationId) {
    return (
      <div className="empty-chat">
        <div>
          <h2>Welcome to Cyphr</h2>
          <p>Select a conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      {/* ── Header ── */}
      <div className="chat-header">
        <button className="mobile-back" onClick={onBack}>←</button>
        <Avatar name={title} size={42} isGroup={isGroup} />
        <div className="chat-header-info">
          <div>{title}</div>
          <div className="chat-status">
            {typingUsers.length > 0 ? "typing..."
              : onlineUsers.length > 0 ? "online"
              : "last seen recently"}
          </div>
        </div>

        {!isGroup && otherUserId && (
          <>
            <button className="header-btn" title="Voice call"
              onClick={() => startCall(otherUserId, "audio")}
              style={iconBtnStyle}>
              <IoCall size={20} />
            </button>
            <button className="header-btn" title="Video call"
              onClick={() => startCall(otherUserId, "video")}
              style={iconBtnStyle}>
              <IoVideocam size={21} />
            </button>
          </>
        )}

        <button className="header-btn" onClick={() => setShowInfo(v => !v)}>⋮</button>
      </div>

      {/* ── Messages + Input ── */}
      <div className="chat-content">
        <div className="chat-main">
          <MessageList conversationId={conversationId} isGroup={isGroup} />
          <MessageInput conversationId={conversationId} />
        </div>
        {showInfo && isGroup && (
          <div className="info-panel">
            <h4>Members</h4>
            {members.map(m => (
              <div key={m.id} className="member-row">
                <Avatar name={m.username} size={32} />
                <span>{m.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Call overlays ── */}
      {callState === "incoming" && (
        <IncomingCallModal callerName={title} callType={callType}
          onAccept={acceptCall} onReject={rejectCall} />
      )}
      {callState === "calling" && (
        <CallingScreen callerName={title} callType={callType} onCancel={endCall} />
      )}
      {callState === "active" && (
        <ActiveCallScreen callerName={title} callType={callType}
          localStream={localStream} remoteStream={remoteStream}
          onEnd={endCall} isMuted={isMuted} onToggleMute={toggleMute} />
      )}
    </div>
  );
}

const iconBtnStyle = {
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "var(--text-secondary)",
};
