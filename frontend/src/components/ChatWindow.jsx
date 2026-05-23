import { useState, useEffect } from "react";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import { Avatar } from "./Sidebar";
import api from "../services/api";
import { getSocket } from "../services/socket";

import { useWebRTC } from "../hooks/useWebRTC";
import {
  IncomingCallModal,
  ActiveCallScreen
} from "./CallUI";

export default function ChatWindow({

  conversationId,
  title,
  isGroup,
  onBack,
  targetUserId

}) {

  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [members, setMembers] = useState([]);
  const [showInfo, setShowInfo] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  /* ─────────────────────────────
     WebRTC Hook
  ───────────────────────────── */

  const {

    callState,
    callType,
    remoteUserId,

    localStream,
    remoteStream,

    startCall,
    acceptCall,
    rejectCall,
    endCall,

    handleIncomingOffer,
    handleAnswer,
    handleIceCandidate,

  } = useWebRTC({

    onCallEnded: () => {
      setIsMuted(false);
    }

  });

  /* ─────────────────────────────
     Online users
  ───────────────────────────── */

  useEffect(() => {

    const s = getSocket();

    if (!s) return;

    const fn = (list) => {
      setOnlineUsers(list);
    };

    s.on(
      "online_users",
      fn
    );

    return () => {

      s.off(
        "online_users",
        fn
      );

    };

  }, []);

  /* ─────────────────────────────
     Typing users
  ───────────────────────────── */

  useEffect(() => {

    const s = getSocket();

    if (
      !s ||
      !conversationId
    ) return;

    const fn = ({

      conversationId: cid,
      userId,
      isTyping

    }) => {

      if (
        cid !== conversationId
      ) return;

      setTypingUsers(
        prev =>

          isTyping
            ? [...new Set([
              ...prev,
              userId
            ])]
            : prev.filter(
              x => x !== userId
            )
      );

    };

    s.on(
      "user_typing",
      fn
    );

    return () => {

      s.off(
        "user_typing",
        fn
      );

    };

  }, [conversationId]);

  /* ─────────────────────────────
     Group members
  ───────────────────────────── */

  useEffect(() => {

    if (
      showInfo &&
      isGroup
    ) {

      api
        .get(
          `/groups/${conversationId}/members`
        )
        .then(
          r => setMembers(
            r.data
          )
        )
        .catch(() => { });

    }

  }, [
    showInfo,
    conversationId,
    isGroup
  ]);

  /* ─────────────────────────────
     WebRTC Socket listeners
  ───────────────────────────── */

  useEffect(() => {

    const s = getSocket();

    if (!s) return;

    s.on(
      "webrtc_offer",
      handleIncomingOffer
    );

    s.on(
      "webrtc_answer",
      handleAnswer
    );

    s.on(
      "webrtc_ice_candidate",
      handleIceCandidate
    );

    s.on(
      "webrtc_rejected",
      endCall
    );

    s.on(
      "webrtc_ended",
      endCall
    );

    return () => {

      s.off(
        "webrtc_offer",
        handleIncomingOffer
      );

      s.off(
        "webrtc_answer",
        handleAnswer
      );

      s.off(
        "webrtc_ice_candidate",
        handleIceCandidate
      );

      s.off(
        "webrtc_rejected",
        endCall
      );

      s.off(
        "webrtc_ended",
        endCall
      );

    };

  }, [

    handleIncomingOffer,
    handleAnswer,
    handleIceCandidate,
    endCall

  ]);

  /* ─────────────────────────────
     Mute
  ───────────────────────────── */

  function toggleMute() {

    if (
      !localStream
    ) return;

    localStream
      .getAudioTracks()
      .forEach(track => {

        track.enabled =
          !track.enabled;

      });

    setIsMuted(
      m => !m
    );

  }

  /* Empty */

  if (!conversationId) {

    return (

      <div className="empty-chat">

        <div>

          <h2>
            Welcome to Cyphr
          </h2>

          <p>
            Select a conversation
          </p>

        </div>

      </div>

    );

  }

  return (

    <>

      <div className="chat-window">

        <div className="chat-header">

          <button
            className="mobile-back"
            onClick={onBack}
          >
            ←
          </button>

          <Avatar
            name={title}
            size={42}
            isGroup={isGroup}
          />

          <div
            className="chat-header-info"
          >

            <div>

              {title}

            </div>

            <div
              className="chat-status"
            >

              {

                typingUsers.length > 0

                  ? "typing..."

                  : onlineUsers.length > 0

                    ? "online"

                    : "last seen recently"

              }

            </div>

          </div>

          {/* Call Buttons */}

          {

            !isGroup && (

              <>

                <button
                  className="header-btn"
                  title="Voice Call"
                  onClick={() =>
                    startCall(
                      targetUserId,
                      "audio"
                    )
                  }
                >

                  🎙

                </button>

                <button
                  className="header-btn"
                  title="Video Call"
                  onClick={() =>
                    startCall(
                      targetUserId,
                      "video"
                    )
                  }
                >

                  📹

                </button>

              </>

            )

          }

          <button

            className="header-btn"

            onClick={() =>
              setShowInfo(
                v => !v
              )
            }

          >

            ⋮

          </button>

        </div>

        <div
          className="chat-content"
        >

          <div
            className="chat-main"
          >

            <MessageList
              conversationId={
                conversationId
              }
              isGroup={
                isGroup
              }
            />

            <MessageInput
              conversationId={
                conversationId
              }
            />

          </div>

          {

            showInfo &&
            isGroup &&

            <div
              className="info-panel"
            >

              <h4>
                Members
              </h4>

              {

                members.map(
                  m =>

                    <div
                      key={m.id}
                      className="member-row"
                    >

                      <Avatar
                        name={
                          m.username
                        }
                        size={32}
                      />

                      <span>

                        {
                          m.username
                        }

                      </span>

                    </div>

                )

              }

            </div>

          }

        </div>

      </div>

      {/* Incoming call */}

      {

        callState === "incoming" &&

        <IncomingCallModal

          callerName={title}
          callType={callType}

          onAccept={
            acceptCall
          }

          onReject={
            rejectCall
          }

        />

      }

      {/* Active call */}

      {

        (
          callState === "active" ||
          callState === "calling"
        ) &&

        <ActiveCallScreen

          callerName={title}
          callType={callType}

          localStream={
            localStream
          }

          remoteStream={
            remoteStream
          }

          onEnd={
            endCall
          }

          isMuted={
            isMuted
          }

          onToggleMute={
            toggleMute
          }

        />

      }

    </>

  );

}