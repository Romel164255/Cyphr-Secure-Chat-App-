import { useEffect, useState, useCallback, useRef } from "react";
import api from "../services/api";
import { getSocket } from "../services/socket";
import { decryptMessage } from "../utils/crypto";
import SearchUsers from "./SearchUsers";
import CreateGroup from "./CreateGroup";

/* ─── Avatar ─────────────────────────────────── */
export function Avatar({ name = "?", size = 40, isGroup = false }) {
  const initials = (name || "?").slice(0, 2).toUpperCase();
  const hue = [...(name || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: isGroup
          ? `linear-gradient(135deg, hsl(${hue},55%,25%) 0%, hsl(${(hue+40)%360},55%,20%) 100%)`
          : `linear-gradient(135deg, hsl(${hue},50%,22%) 0%, hsl(${hue},45%,16%) 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.35, fontWeight: 700,
        color: `hsl(${hue},70%,78%)`,
        border: `1px solid hsl(${hue},40%,28%)`,
        boxShadow: `0 0 0 1px rgba(0,0,0,0.4)`,
      }}>
        {initials}
      </div>
      {isGroup && (
        <div style={{
          position: "absolute", bottom: -1, right: -1,
          width: 16, height: 16, borderRadius: "50%",
          background: "var(--bg-app)", display: "flex",
          alignItems: "center", justifyContent: "center",
          fontSize: 9, border: "1px solid var(--border)",
        }}>👥</div>
      )}
    </div>
  );
}

/* ─── Time Formatter ─────────────────────────── */
function timeFmt(iso) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const diff = (now - d) / 86400000;
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

async function getConversationPreview(convo) {
  if (!convo?.last_message) return convo?.last_message;

  if (typeof convo.last_message === "string" && convo.last_message.startsWith("audio:")) {
    return "Voice message";
  }

  if (!convo.last_message_iv) return convo.last_message;

  try {
    return await decryptMessage(
      convo.last_message,
      convo.last_message_iv,
      String(convo.id)
    );
  } catch (err) {
    console.error("Failed to decrypt conversation preview:", err);
    return "[Encrypted message]";
  }
}

/* ─── Icons ──────────────────────────────────── */
const SearchIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const GroupIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const LogoutIcon = () => (
  <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

/* ─── Main Sidebar ──────────────────────────── */
const TABS = ["All", "Unread", "Groups"];

export default function Sidebar({ activeConversationId, onSelect, onLogout }) {
  const [convos, setConvos] = useState([]);
  const [mode, setMode] = useState("list"); // list | search | group
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState(0);
  const [searchFilter, setSearchFilter] = useState("");
  const filterRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/conversations");
      const decryptedConvos = await Promise.all(
        r.data.map(async (convo) => ({
          ...convo,
          last_message: await getConversationPreview(convo),
        }))
      );
      setConvos(decryptedConvos);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    api.get("/auth/me").then(r => setMe(r.data)).catch(() => {});
  }, [load]);

  // Socket: refresh on new message
  useEffect(() => {
    const s = getSocket(); if (!s) return;
    const fn = () => load();
    s.on("receive_message", fn);
    return () => s.off("receive_message", fn);
  }, [load]);

  // Local sender path: refresh previews on our own outgoing message too.
  useEffect(() => {
    const fn = () => load();
    window.addEventListener("chatty:message_sent", fn);
    return () => window.removeEventListener("chatty:message_sent", fn);
  }, [load]);

  // Filter conversations by tab
  const filtered = convos.filter(c => {
    const matchTab = tab === 0 ? true : tab === 1 ? c.unread_count > 0 : c.is_group;
    const q = searchFilter.trim().toLowerCase();
    const matchSearch = !q || (c.title || "Direct Chat").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const unreadTotal = convos.filter(c => c.unread_count > 0).length;

  return (
    <div style={s.sidebar}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={s.logoWrap}>
            <span style={s.logoText}>Cyphr</span>
            <div style={s.logoDot} />
          </div>
        </div>
        <div style={s.headerRight}>
          <Avatar name={me?.display_name || me?.username || "Me"} size={32} />
          <button style={s.iconBtn} title="New Group" onClick={() => setMode(m => m === "group" ? "list" : "group")}>
            <GroupIcon />
          </button>
          <button style={s.iconBtn} title="New Chat" onClick={() => setMode(m => m === "search" ? "list" : "search")}>
            <SearchIcon />
          </button>
          <button style={{ ...s.iconBtn, color: "var(--text-muted)" }} title="Logout" onClick={onLogout}>
            <LogoutIcon />
          </button>
        </div>
      </div>

      {/* ── Drawers ── */}
      {mode === "search" && (
        <SearchUsers
          reload={load}
          onSelect={(id, title) => { onSelect(id, title); setMode("list"); }}
          onClose={() => setMode("list")}
        />
      )}
      {mode === "group" && (
        <CreateGroup
          reload={load}
          onCreated={(id, title) => { onSelect(id, title); setMode("list"); }}
          onClose={() => setMode("list")}
        />
      )}

      {/* ── List Mode ── */}
      {mode === "list" && (
        <>
          {/* Filter input */}
          <div style={s.filterWrap}>
            <div style={s.filterIcon}><SearchIcon /></div>
            <input
              ref={filterRef}
              style={s.filterInput}
              placeholder="Search chats…"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
            />
            {searchFilter && (
              <button style={s.clearBtn} onClick={() => setSearchFilter("")}>✕</button>
            )}
          </div>

          {/* Tabs */}
          <div style={s.tabs}>
            {TABS.map((t, i) => (
              <button key={t} style={{ ...s.tab, ...(tab === i ? s.tabActive : {}) }} onClick={() => setTab(i)}>
                {t}
                {i === 1 && unreadTotal > 0 && <span style={s.tabBadge}>{unreadTotal}</span>}
              </button>
            ))}
          </div>

          {/* List */}
          <div style={s.list}>
            {filtered.length === 0 && (
              <div style={s.empty}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>
                  {tab === 1 ? "🎉" : tab === 2 ? "👥" : "💬"}
                </div>
                <div style={s.emptyText}>
                  {tab === 1 ? "All caught up!" : tab === 2 ? "No groups yet" : "No chats yet"}
                </div>
                <div style={s.emptyHint}>
                  {tab === 2 ? "Tap the group icon above" : "Tap 🔍 to find someone"}
                </div>
              </div>
            )}
            {filtered.map(c => {
              const active = c.id === activeConversationId;
              const title = c.title || "Direct Chat";
              return (
                <ConvoRow
                  key={c.id}
                  convo={c}
                  title={title}
                  active={active}
                  onClick={() => onSelect(c.id, title)}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Conversation Row ───────────────────────── */
function ConvoRow({ convo, title, active, onClick }) {
  return (
    <div
      style={{
        ...s.row,
        background: active ? "var(--bg-active)" : "transparent",
        position: "relative",
      }}
      className={active ? "row-active" : ""}
      onClick={onClick}
    >
      <Avatar name={title} size={46} isGroup={convo.is_group} />
      <div style={s.rowMid}>
        <div style={s.rowTop}>
          <span style={s.rowName}>{title}</span>
          <span style={s.rowTime}>{timeFmt(convo.last_message_time)}</span>
        </div>
        <div style={s.rowBot}>
          <span style={s.rowPreview}>
            {convo.last_message || <span style={{ fontStyle: "italic", opacity: 0.5 }}>No messages yet</span>}
          </span>
          {convo.unread_count > 0 && (
            <span style={s.badge} className="badge-pulse">{convo.unread_count}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────── */
const s = {
  sidebar: {
    width: 340, minWidth: 280, maxWidth: 340,
    background: "var(--bg-sidebar)",
    borderRight: "1px solid var(--border)",
    display: "flex", flexDirection: "column", overflow: "hidden",
    position: "relative",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 16px 12px",
    background: "var(--bg-header)",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  logoWrap: { display: "flex", alignItems: "center", gap: 6, position: "relative" },
  logoText: {
    fontFamily: "var(--font-display)",
    fontSize: 20, fontWeight: 800,
    background: "linear-gradient(135deg, #4dd8ff 0%, #a78bfa 100%)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
    letterSpacing: "-0.5px",
  },
  logoDot: {
    width: 6, height: 6, borderRadius: "50%",
    background: "var(--accent)", marginTop: -8,
    boxShadow: "0 0 6px var(--accent-glow)",
  },
  headerRight: { display: "flex", alignItems: "center", gap: 2 },
  iconBtn: {
    width: 34, height: 34, borderRadius: "50%", background: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--text-secondary)", transition: "background .15s, color .15s",
  },
  filterWrap: {
    display: "flex", alignItems: "center", gap: 8,
    margin: "10px 12px 8px",
    background: "var(--bg-input)", borderRadius: 12,
    padding: "0 12px",
    border: "1px solid var(--border)",
    flexShrink: 0,
  },
  filterIcon: { color: "var(--text-muted)", display: "flex", alignItems: "center", flexShrink: 0 },
  filterInput: {
    flex: 1, padding: "9px 0", fontSize: 13.5,
    color: "var(--text-primary)", background: "transparent",
  },
  clearBtn: {
    background: "none", color: "var(--text-muted)", fontSize: 12,
    padding: "2px 4px", borderRadius: 4, flexShrink: 0,
  },
  tabs: {
    display: "flex", gap: 4, padding: "0 12px 10px",
    flexShrink: 0,
  },
  tab: {
    padding: "5px 14px", borderRadius: 20, fontSize: 12.5,
    fontWeight: 500, background: "none", color: "var(--text-muted)",
    transition: "all .15s", display: "flex", alignItems: "center", gap: 5,
  },
  tabActive: {
    background: "rgba(77,216,255,0.1)", color: "var(--accent)",
  },
  tabBadge: {
    background: "var(--accent)", color: "var(--bg-app)",
    fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 5px",
  },
  list: { flex: 1, overflowY: "auto" },
  empty: {
    textAlign: "center", padding: "50px 20px",
    display: "flex", flexDirection: "column", alignItems: "center",
  },
  emptyText: { fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 },
  emptyHint: { fontSize: 12, color: "var(--text-muted)" },
  row: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "11px 14px", cursor: "pointer",
    transition: "background .1s",
    borderBottom: "1px solid var(--border-subtle)",
  },
  rowMid: { flex: 1, minWidth: 0 },
  rowTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  rowName: {
    fontSize: 14.5, fontWeight: 600, color: "var(--text-primary)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
  },
  rowTime: { fontSize: 11, color: "var(--text-muted)", flexShrink: 0, marginLeft: 8 },
  rowBot: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  rowPreview: {
    fontSize: 13, color: "var(--text-secondary)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 190,
  },
  badge: {
    background: "var(--accent)", color: "var(--bg-app)",
    borderRadius: 10, fontSize: 10, fontWeight: 700,
    padding: "2px 7px", flexShrink: 0, marginLeft: 8,
    boxShadow: "0 0 8px var(--accent-glow)",
  },
};
