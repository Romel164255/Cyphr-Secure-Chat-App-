import { useState } from "react";
import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";

export default function Chat({ onLogout }) {
  const [activeConversation, setActiveConversation] = useState(null);
  const [activeTitle, setActiveTitle] = useState("");
  const [isGroup, setIsGroup] = useState(false);
  const [otherUserId, setOtherUserId] = useState(null);
  const [showChat, setShowChat] = useState(false);

  function handleSelect(id, title, group = false, userId = null) {
    setActiveConversation(id);
    setActiveTitle(title);
    setIsGroup(group);
    setOtherUserId(userId);
    setShowChat(true);
  }

  return (
    <div style={s.app}>
      <div style={{ ...s.sidebar, ...(showChat ? s.hideMobile : {}) }}>
        <Sidebar
          activeConversationId={activeConversation}
          onSelect={handleSelect}
          onLogout={onLogout}
        />
      </div>
      <div style={{ ...s.main, ...(showChat ? {} : s.hideMobile) }}>
        <ChatWindow
          conversationId={activeConversation}
          title={activeTitle}
          isGroup={isGroup}
          otherUserId={otherUserId}
          onBack={() => setShowChat(false)}
        />
      </div>
    </div>
  );
}

const s = {
  app: { display: "flex", height: "100vh", overflow: "hidden", background: "var(--bg-app)" },
  sidebar: { display: "flex", flexShrink: 0 },
  main: { flex: 1, display: "flex", minWidth: 0 },
  hideMobile: {
    // only hides on narrow viewports
    "@media (max-width: 640px)": { display: "none" },
  },
};
