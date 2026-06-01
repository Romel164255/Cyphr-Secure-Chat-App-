import { useState } from "react";
import api from "../services/api";

export default function SetUsername({ onDone }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const u = username.trim().toLowerCase();
    if (!u) {
      setError("Username is required");
      return;
    }
    if (u.length < 3) {
      setError("At least 3 characters");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(u)) {
      setError("Letters, numbers and underscores only");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api.post("/users/username", {
        username: u,
        display_name: displayName.trim() || null,
      });
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.avatar}>
          {displayName.trim() ? displayName.trim()[0].toUpperCase() : "?"}
        </div>
        <h1 style={s.title}>Set up your profile</h1>
        <p style={s.subtitle}>Choose a username so people can find you</p>

        <div style={s.field}>
          <label style={s.label}>Username</label>
          <div style={s.inputWrap}>
            <span style={s.prefix}>@</span>
            <input
              style={s.input}
              placeholder="your_username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              autoFocus
            />
          </div>
        </div>

        <div style={s.field}>
          <label style={s.label}>
            Display name{" "}
            <span style={{ color: "var(--text-muted)" }}>— optional</span>
          </label>
          <input
            style={s.inputPlain}
            placeholder="Your Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>

        {error && <p style={s.error}>{error}</p>}

        <button
          style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}
          onClick={save}
          disabled={loading}
        >
          {loading ? "Saving…" : "Continue →"}
        </button>
      </div>
    </div>
  );
}

const s = {
  page: {
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg-app)",
  },
  card: {
    width: 400,
    padding: "48px 40px",
    background: "var(--bg-sidebar)",
    borderRadius: 20,
    border: "1px solid var(--border)",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: "linear-gradient(135deg,#25d366,#128c7e)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 28,
    fontWeight: 700,
    color: "#fff",
    marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: 700, marginBottom: 6 },
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginBottom: 28 },
  field: { marginBottom: 18 },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: ".05em",
  },
  inputWrap: {
    display: "flex",
    alignItems: "center",
    background: "var(--bg-search)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "0 14px",
  },
  prefix: {
    color: "var(--accent)",
    fontWeight: 700,
    fontSize: 16,
    marginRight: 4,
  },
  input: {
    flex: 1,
    padding: "13px 0",
    fontSize: 15,
    color: "var(--text-primary)",
    background: "transparent",
  },
  inputPlain: {
    width: "100%",
    padding: "13px 14px",
    fontSize: 15,
    color: "var(--text-primary)",
    background: "var(--bg-search)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
  },
  error: { color: "#f87171", fontSize: 13, marginBottom: 12 },
  btn: {
    width: "100%",
    padding: "14px",
    fontSize: 15,
    fontWeight: 600,
    background: "var(--accent)",
    color: "#fff",
    borderRadius: "var(--radius-md)",
    marginTop: 8,
  },
};
