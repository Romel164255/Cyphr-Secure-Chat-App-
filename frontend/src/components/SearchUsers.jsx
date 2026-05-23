import { useState, useRef, useEffect } from "react";
import api from "../services/api";
import { Avatar } from "./Sidebar";

export default function SearchUsers({ reload, onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setUsers([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get(`/users/search?username=${encodeURIComponent(query.trim())}`);
        setUsers(r.data);
      } catch {} finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function startChat(u) {
    try {
      const r = await api.post("/conversations", { user_id: u.id });
      await reload();
      onSelect(r.data.conversation_id, u.display_name || u.username, false, u.id);
    } catch {}
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <button style={s.back} onClick={onClose}>
          <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div style={s.inputWrap}>
          <input
            ref={inputRef}
            style={s.input}
            placeholder="Search by username…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {loading && <div style={s.spinner} />}
        </div>
      </div>

      <div style={s.results}>
        {!loading && query.length >= 2 && users.length === 0 && (
          <div style={s.empty}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
            <div style={s.emptyText}>No users found for "{query}"</div>
          </div>
        )}
        {query.length < 2 && (
          <div style={s.empty}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>👤</div>
            <div style={s.emptyText}>Type at least 2 characters</div>
          </div>
        )}
        {users.map(u => (
          <div key={u.id} style={s.row} onClick={() => startChat(u)}>
            <Avatar name={u.display_name || u.username} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.name}>{u.display_name || u.username}</div>
              <div style={s.handle}>@{u.username}</div>
            </div>
            <button style={s.chatBtn}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  wrap: { display: "flex", flexDirection: "column", flex: 1, background: "var(--bg-sidebar)", overflow: "hidden" },
  header: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 14px", background: "var(--bg-header)",
    borderBottom: "1px solid var(--border)", flexShrink: 0,
  },
  back: {
    width: 34, height: 34, borderRadius: "50%", background: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--accent)", flexShrink: 0,
  },
  inputWrap: {
    flex: 1, background: "var(--bg-input)", borderRadius: 12,
    padding: "0 12px", display: "flex", alignItems: "center",
    border: "1px solid rgba(77,216,255,0.2)",
  },
  input: {
    flex: 1, padding: "9px 0", fontSize: 14, color: "var(--text-primary)", background: "transparent",
  },
  spinner: {
    width: 14, height: 14, borderRadius: "50%",
    border: "2px solid var(--border)",
    borderTopColor: "var(--accent)",
    animation: "spin .7s linear infinite", flexShrink: 0,
  },
  results: { flex: 1, overflowY: "auto" },
  empty: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "40px 20px", color: "var(--text-muted)",
  },
  emptyText: { fontSize: 13.5, color: "var(--text-muted)" },
  row: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "12px 16px", cursor: "pointer",
    borderBottom: "1px solid var(--border-subtle)",
    transition: "background .1s",
  },
  name: { fontSize: 14.5, fontWeight: 600, color: "var(--text-primary)" },
  handle: { fontSize: 12, color: "var(--text-secondary)", marginTop: 2 },
  chatBtn: {
    width: 36, height: 36, borderRadius: "50%",
    background: "rgba(77,216,255,0.1)", color: "var(--accent)",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
};
