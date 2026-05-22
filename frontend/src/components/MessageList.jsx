import { useEffect, useRef, useState, useCallback } from "react";
import api from "../services/api";
import { getSocket } from "../services/socket";
import { decryptMessageWithFallback } from "../utils/crypto";

const AUDIO_PAYLOAD_PREFIX = "audio-b64:";

function getMyId() {
  try {
    return JSON.parse(
      atob(localStorage.getItem("token").split(".")[1])
    ).id;
  } catch {
    return null;
  }
}

function MessageContent({ content }) {

  if (
    typeof content === "string" &&
    content.startsWith(AUDIO_PAYLOAD_PREFIX)
  ) {

    const encoded = content.slice(
      AUDIO_PAYLOAD_PREFIX.length
    );

    const marker = ";base64,";
    const splitIndex = encoded.indexOf(marker);

    if (splitIndex === -1) {
      return <span>[Invalid audio]</span>;
    }

    const mimeType =
      encoded.slice(0, splitIndex) || "audio/webm";

    const base64Data =
      encoded.slice(splitIndex + marker.length);

    return (
      <audio
        controls
        src={`data:${mimeType};base64,${base64Data}`}
        style={{
          maxWidth: "100%",
          minWidth: 220,
          outline: "none"
        }}
      />
    );
  }

  if (
    typeof content === "string" &&
    content.startsWith("audio:")
  ) {
    return (
      <audio
        controls
        src={content.slice(6)}
        style={{
          maxWidth: "100%",
          minWidth: 220
        }}
      />
    );
  }

  return (
    <span
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word"
      }}
    >
      {content}
    </span>
  );
}

async function tryDecrypt(msg, conversationId) {

  if (!msg.iv) return msg;

  try {

    const decrypted =
      await decryptMessageWithFallback(
        msg.content,
        msg.iv,
        [
          msg.conversation_id,
          msg.conversationId,
          conversationId
        ]
      );

    return {
      ...msg,
      content: decrypted
    };

  } catch {

    return {
      ...msg,
      content: "[Failed to decrypt]"
    };

  }

}

export default function MessageList({
  conversationId
}) {

  const [messages, setMessages] = useState([]);
  const [menuOpen, setMenuOpen] = useState(null);
  const [menuBlur, setMenuBlur] = useState(false);

  const myId = getMyId();

  const bottomRef = useRef();
  const blurRef = useRef();
  const removeRef = useRef();

  async function deleteMessage(id) {

    try {

      await api.delete(
        `/messages/${id}`
      );

      setMessages(prev =>
        prev.filter(
          msg => msg.id !== id
        )
      );

      setMenuOpen(null);

    } catch (err) {

      console.error(
        "Delete failed",
        err
      );

    }

  }

  function toggleMenu(id) {

    clearTimeout(
      blurRef.current
    );

    clearTimeout(
      removeRef.current
    );

    setMenuOpen(id);
    setMenuBlur(false);

    blurRef.current =
      setTimeout(() => {

        setMenuBlur(true);

      }, 270000);

    removeRef.current =
      setTimeout(() => {

        setMenuOpen(null);
        setMenuBlur(false);

      }, 300000);

  }

  const load = useCallback(
    async (convId) => {

      try {

        const res =
          await api.get(
            `/messages/${convId}`
          );

        const decrypted =
          await Promise.all(
            res.data.map(
              msg =>
                tryDecrypt(
                  msg,
                  convId
                )
            )
          );

        setMessages(
          decrypted
        );

      } catch (err) {

        console.error(err);

      }

    },
    []
  );

  useEffect(() => {

    if (!conversationId) return;

    setMessages([]);

    load(
      conversationId
    );

  }, [
    conversationId,
    load
  ]);

  useEffect(() => {

    const socket =
      getSocket();

    if (!socket) return;

    socket.emit(
      "join_conversation",
      conversationId
    );

    async function onMessage(data) {

      if (
        String(
          data.conversation_id
        ) !==
        String(
          conversationId
        )
      ) return;

      const decrypted =
        await tryDecrypt(
          data,
          conversationId
        );

      setMessages(
        prev => [
          ...prev,
          decrypted
        ]
      );

    }

    socket.on(
      "receive_message",
      onMessage
    );

    return () => {

      socket.off(
        "receive_message",
        onMessage
      );

    };

  }, [conversationId]);

  useEffect(() => {

    bottomRef.current
      ?.scrollIntoView({
        behavior: "smooth"
      });

  }, [messages]);

  return (

    <div style={s.list}>

      {

        messages.map(
          (msg, i) => {

            const isMine =
              msg.sender_id === myId;

            return (

              <div
                key={
                  msg.id ||
                  `tmp-${i}`
                }
                style={{
                  display: "flex",
                  justifyContent:
                    isMine
                      ? "flex-end"
                      : "flex-start"
                }}
              >

                <div
                  style={{
                    position: "relative",
                    ...s.bubble,
                    ...(isMine
                      ? s.bubbleMe
                      : s.bubbleThem)
                  }}
                >

                  {isMine && (

                    <div style={s.menuWrap}>

                      <button
                        style={s.menuBtn}
                        onClick={() =>
                          toggleMenu(
                            msg.id
                          )
                        }
                      >
                        ⋮
                      </button>

                      {

                        menuOpen===msg.id && (

                        <div
                        style={{
                          ...s.popup,
                          ...(menuBlur
                          ? s.popupBlur
                          : {})
                        }}
                        >

                          <button
                          style={s.deleteBtn}
                          onClick={() =>
                            deleteMessage(
                              msg.id
                            )
                          }
                          >
                            Delete
                          </button>

                        </div>

                        )

                      }

                    </div>

                  )}

                  <MessageContent
                    content={
                      msg.content
                    }
                  />

                </div>

              </div>

            );

          }
        )

      }

      <div ref={bottomRef} />

    </div>

  );

}

const s = {

list:{
flex:1,
overflowY:"auto",
padding:"12px 16px"
},

bubble:{
padding:"10px",
maxWidth:"70%",
borderRadius:16
},

bubbleMe:{
background:"var(--bg-bubble-me)"
},

bubbleThem:{
background:"var(--bg-bubble-them)"
},

menuWrap:{
position:"absolute",
top:4,
right:4
},

menuBtn:{
background:"none",
fontSize:14,
color:"var(--text-muted)"
},

popup:{
position:"absolute",
top:18,
right:0,
padding:6,
background:"var(--bg-header)",
border:"1px solid var(--border)",
borderRadius:8
},

popupBlur:{
filter:"blur(3px)",
opacity:.3,
pointerEvents:"none",
transition:"all 1.5s"
},

deleteBtn:{
background:"none",
color:"#ff6666"
}

};