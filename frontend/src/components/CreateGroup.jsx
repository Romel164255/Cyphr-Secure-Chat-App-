import { useState, useEffect } from "react";
import api from "../services/api";
import { Avatar } from "./Sidebar";

export default function CreateGroup({ reload, onCreated, onClose }) {
  const [step, setStep] = useState(1); // 1 = search members, 2 = name group
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]); // array of user objects
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get(
          `/users/search?username=${encodeURIComponent(query.trim())}`,
        );
        setResults(r.data);
      } catch {
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  function toggleUser(u) {
    setSelected((prev) =>
      prev.some((p) => p.id === u.id)
        ? prev.filter((p) => p.id !== u.id)
        : [...prev, u],
    );
  }

  async function create() {
    if (!groupName.trim() || selected.length === 0) return;
    setCreating(true);
    try {
      const r = await api.post("/groups", {
        title: groupName.trim(),
        members: selected.map((u) => u.id),
      });
      await reload();
      onCreated(r.data.conversation_id, groupName.trim());
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.back} onClick={onClose}>
          <svg
            width="17"
            height="17"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path d="M19 12H5" />
            <path d="M12 5l-7 7 7 7" />
          </svg>
        </button>
        <div>
          <div style={s.headerTitle}>
            {step === 1 ? "New Group" : "Group Name"}
          </div>
          <div style={s.headerSub}>
            {step === 1
              ? `${selected.length} selected`
              : `${selected.length} members`}
          </div>
        </div>
        {step === 1 && selected.length > 0 && (
          <button style={s.nextBtn} onClick={() => setStep(2)}>
            Next →
          </button>
        )}
        {step === 2 && (
          <button
            style={{
              ...s.nextBtn,
              background: groupName.trim()
                ? "var(--accent)"
                : "var(--bg-input)",
              color: groupName.trim() ? "var(--bg-app)" : "var(--text-muted)",
            }}
            onClick={create}
            disabled={!groupName.trim() || creating}
          >
            {creating ? "…" : "Create"}
          </button>
        )}
      </div>

      {step === 1 ? (
        <>
          {/* Selected chips */}
          {selected.length > 0 && (
            <div style={s.chips}>
              {selected.map((u) => (
                <div key={u.id} style={s.chip}>
                  <Avatar name={u.display_name || u.username} size={22} />
                  <span style={s.chipName}>{u.display_name || u.username}</span>
                  <button style={s.chipRemove} onClick={() => toggleUser(u)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Search */}
          <div style={s.searchBar}>
            <input
              style={s.searchInput}
              placeholder="Search users to add…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div style={s.results}>
            {loading && <div style={s.hint}>Searching…</div>}
            {!loading && query.length >= 2 && results.length === 0 && (
              <div style={s.hint}>No users found</div>
            )}
            {results.map((u) => {
              const sel = selected.some((p) => p.id === u.id);
              return (
                <div
                  key={u.id}
                  style={{
                    ...s.row,
                    background: sel ? "rgba(77,216,255,0.06)" : "transparent",
                  }}
                  onClick={() => toggleUser(u)}
                >
                  <Avatar name={u.display_name || u.username} size={40} />
                  <div style={{ flex: 1 }}>
                    <div style={s.name}>{u.display_name || u.username}</div>
                    <div style={s.handle}>@{u.username}</div>
                  </div>
                  <div
                    style={{
                      ...s.check,
                      background: sel ? "var(--accent)" : "var(--bg-input)",
                      borderColor: sel ? "var(--accent)" : "var(--border)",
                    }}
                  >
                    {sel && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path
                          d="M1 4l3 3L9 1"
                          stroke="var(--bg-app)"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={s.nameStep}>
          {/* Group avatar preview */}
          <div style={s.groupAvatarPreview}>
            <div style={s.avatarCircle}>
              <svg
                width="32"
                height="32"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>
          <input
            style={s.nameInput}
            placeholder="Group name…"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
            maxLength={100}
            autoFocus
          />
          <div style={s.nameHint}>You can always change this later</div>
          <div style={s.memberList}>
            {selected.map((u) => (
              <div key={u.id} style={s.memberRow}>
                <Avatar name={u.display_name || u.username} size={34} />
                <span style={s.memberName}>{u.display_name || u.username}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    background: "var(--bg-sidebar)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    background: "var(--bg-header)",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    background: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--accent)",
    flexShrink: 0,
  },
  headerTitle: { fontSize: 15, fontWeight: 700, color: "var(--text-primary)" },
  headerSub: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 },
  nextBtn: {
    marginLeft: "auto",
    padding: "6px 14px",
    borderRadius: 20,
    background: "rgba(77,216,255,0.1)",
    color: "var(--accent)",
    fontSize: 13,
    fontWeight: 600,
    transition: "all .2s",
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    padding: "10px 12px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  chip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(77,216,255,0.1)",
    border: "1px solid rgba(77,216,255,0.2)",
    borderRadius: 20,
    padding: "4px 10px 4px 6px",
  },
  chipName: { fontSize: 12.5, color: "var(--text-primary)", fontWeight: 500 },
  chipRemove: {
    background: "none",
    color: "var(--text-muted)",
    fontSize: 10,
    padding: "0 0 0 2px",
  },
  searchBar: {
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  searchInput: {
    width: "100%",
    padding: "9px 14px",
    background: "var(--bg-input)",
    borderRadius: 12,
    fontSize: 14,
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
  },
  results: { flex: 1, overflowY: "auto" },
  hint: { padding: "16px", fontSize: 13, color: "var(--text-muted)" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "11px 14px",
    cursor: "pointer",
    borderBottom: "1px solid var(--border-subtle)",
    transition: "background .1s",
  },
  name: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" },
  handle: { fontSize: 12, color: "var(--text-secondary)", marginTop: 1 },
  check: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    border: "2px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "all .15s",
  },
  nameStep: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "24px 20px",
    overflowY: "auto",
  },
  groupAvatarPreview: { marginBottom: 20 },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: "50%",
    background: "rgba(77,216,255,0.08)",
    border: "2px dashed rgba(77,216,255,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  nameInput: {
    width: "100%",
    padding: "14px 18px",
    background: "var(--bg-input)",
    borderRadius: 16,
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-primary)",
    border: "1px solid rgba(77,216,255,0.2)",
    textAlign: "center",
    marginBottom: 8,
  },
  nameHint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 20 },
  memberList: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  memberRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 10,
    background: "var(--bg-input)",
  },
  memberName: { fontSize: 13.5, color: "var(--text-primary)", fontWeight: 500 },
};
