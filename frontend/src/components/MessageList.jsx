import { useEffect, useRef, useState, useCallback } from "react";
import api from "../services/api";
import { getSocket } from "../services/socket";
import { decryptMessageWithFallback } from "../utils/crypto";

const AUDIO_PAYLOAD_PREFIX = "audio-b64:";

function getMyId() {
  try {
    return JSON.parse(
      atob(
        localStorage
          .getItem("token")
          .split(".")[1]
      )
    ).id;
  } catch {
    return null;
  }
}

/* ---------- Message Content ---------- */

function MessageContent({ content }) {

  if (
    typeof content === "string" &&
    content.startsWith(AUDIO_PAYLOAD_PREFIX)
  ) {
    const encoded = content.slice(AUDIO_PAYLOAD_PREFIX.length);
    const marker = ";base64,";
    const splitIndex = encoded.indexOf(marker);

    if (splitIndex === -1) {
      return <span>[Invalid audio message]</span>;
    }

    const mimeType = encoded.slice(0, splitIndex) || "audio/webm";
    const base64Data = encoded.slice(splitIndex + marker.length);
    const src = `data:${mimeType};base64,${base64Data}`;

    return (
      <audio
        controls
        src={src}
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
          maxWidth:"100%",
          minWidth:220,
          outline:"none"
        }}
      />

    );

  }

  return (

    <span
      style={{
        whiteSpace:"pre-wrap",
        wordBreak:"break-word"
      }}
    >

      {content}

    </span>

  );

}

/* ---------- Decrypt helper ---------- */

async function tryDecrypt(
  msg,
  conversationId
){

  // legacy or audio messages
  if(!msg.iv){
    return msg;
  }

  try{

    const decrypted=

    await decryptMessageWithFallback(

      msg.content,
      msg.iv,
      [
        msg.conversation_id,
        msg.conversationId,
        conversationId
      ]

    );

    return{

      ...msg,

      content:decrypted

    };

  }
  catch(err){

    console.error(
      "decrypt error",
      err,
      msg
    );

    return{

      ...msg,

      content:
      "[Failed to decrypt]"

    };

  }

}

export default function MessageList({

conversationId

}){

const[
messages,
setMessages
]=useState([]);

const myId=
getMyId();

const bottomRef=
useRef();


/* ---------- Load history ---------- */

const load=

useCallback(

async(
convId
)=>{

try{

const res=

await api.get(
`/messages/${convId}`
);

const decrypted=

await Promise.all(

res.data.map(

msg=>

tryDecrypt(
msg,
convId
)

)

);

setMessages(
decrypted
);

}
catch(err){

console.error(
"load messages",
err
);

}

},
[]

);


/* ---------- Change conversation ---------- */

useEffect(()=>{

if(
!conversationId
)return;

setMessages([]);

load(
conversationId
);

},
[
conversationId,
load
]);


/* ---------- Own sent ---------- */

useEffect(()=>{

async function onSent(e){

const{
plaintext,
data
}=e.detail || {};

if(
!data
) return;

if(
String(
data.conversation_id ||
data.conversationId
)
!==
String(
conversationId
)
) return;

let nextMessage={
...data,
content:plaintext
};

if(
typeof plaintext
!=="string"
){
nextMessage=
await tryDecrypt(
data,
conversationId
);
}

setMessages(

prev=>

[

...prev,

{

...nextMessage

}

]

);

}

window.addEventListener(

"chatty:message_sent",

onSent

);

return()=>{

window.removeEventListener(

"chatty:message_sent",

onSent

);

};

},[
conversationId
]);


/* ---------- Socket messages ---------- */

useEffect(()=>{

const socket=
getSocket();

if(
!socket
)return;

socket.emit(
"join_conversation",
conversationId
);

async function onMessage(data){

if(

String(
data.conversation_id
)

!==

String(
conversationId
)

)

return;

const decrypted=

await tryDecrypt(

data,
conversationId

);

setMessages(

prev=>

[

...prev,

decrypted

]

);

}

socket.on(
"receive_message",
onMessage
);

return()=>{

socket.off(
"receive_message",
onMessage
);

};

},
[
conversationId
]);


/* ---------- Scroll ---------- */

useEffect(()=>{

bottomRef.current
?.scrollIntoView({

behavior:"smooth"

});

},
[
messages
]);


/* ---------- UI ---------- */

return(

<div style={s.list}>

{

messages.map(

(msg,i)=>{

const isMine=

msg.sender_id===myId;

return(

<div

key={
msg.id ??
`tmp-${i}`
}

style={{

display:"flex",

justifyContent:

isMine
?
"flex-end"
:
"flex-start",

marginBottom:4

}}

>

<div

style={{

...s.bubble,

...(isMine
?
s.bubbleMe
:
s.bubbleThem)

}}

>

{

!isMine &&
msg.sender_name &&

<div style={s.senderName}>

{msg.sender_name}

</div>

}

<MessageContent
content={
msg.content
}
/>

<div style={s.timestamp}>

{

new Date(
msg.created_at
)

.toLocaleTimeString(
[],
{
hour:"2-digit",
minute:"2-digit"
}
)

}

</div>

</div>

</div>

);

}

)

}

<div ref={bottomRef}/>

</div>

);

}

const s={

list:{
flex:1,
overflowY:"auto",
padding:"12px 16px",
display:"flex",
flexDirection:"column"
},

bubble:{
padding:"9px 13px",
margin:"3px 0",
borderRadius:
"var(--radius-bubble)",
maxWidth:"70%",
color:
"var(--text-primary)",
fontSize:14,
lineHeight:1.5
},

bubbleMe:{
background:
"var(--bg-bubble-me)",
borderBottomRightRadius:4
},

bubbleThem:{
background:
"var(--bg-bubble-them)",
borderBottomLeftRadius:4
},

senderName:{
fontSize:11.5,
fontWeight:600,
color:"var(--accent2)",
marginBottom:3
},

timestamp:{
fontSize:10,
opacity:.55,
textAlign:"right",
marginTop:4,
color:
"var(--text-primary)"
}

};
