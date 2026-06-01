import { useState, useEffect, useRef } from "react";
import api from "../services/api";

export default function VerifyOTP({ phone, confirmation, onLogin }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const refs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  useEffect(() => {
    refs[0].current?.focus();
  }, []);

  function handleKey(i, e) {
    if (e.key === "Backspace") {
      const d = [...digits];
      d[i] = "";
      setDigits(d);
      if (!digits[i] && i > 0) refs[i - 1].current.focus();
      return;
    }
    if (e.key === "Enter") verify();
  }

  function handleChange(i, val) {
    const clean = val.replace(/\D/g, "").slice(-1);
    const d = [...digits];
    d[i] = clean;
    setDigits(d);
    if (clean && i < 5) refs[i + 1].current.focus();
  }

  function handlePaste(e) {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;
    const d = pasted.split("").concat(Array(6 - pasted.length).fill(""));
    setDigits(d);
    refs[Math.min(pasted.length - 1, 5)].current?.focus();
  }

  const otp = digits.join("");

  async function verify() {
    if (otp.length !== 6) {
      setError("Enter all 6 digits");
      return;
    }
    setError("");
    setLoading(true);
    try {
      // Step 1: confirm OTP with Firebase
      const result = await confirmation.confirm(otp);
      // Step 2: get Firebase ID token
      const idToken = await result.user.getIdToken();
      // Step 3: exchange for your app's JWT
      const res = await api.post("/auth/verify-firebase", { idToken });
      onLogin(res.data.token);
    } catch (err) {
      console.error(err);
      if (err.code === "auth/invalid-verification-code")
        setError("Wrong code. Check your SMS and try again.");
      else if (err.code === "auth/code-expired")
        setError("Code expired. Go back and request a new one.");
      else setError("Verification failed. Please try again.");
      setDigits(["", "", "", "", "", ""]);
      refs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <span style={{ fontSize: 40, display: "block", marginBottom: 12 }}>
          📱
        </span>
        <h1 style={s.title}>Enter code</h1>
        <p style={s.subtitle}>
          Sent via SMS to{" "}
          <span style={{ color: "var(--accent)" }}>{phone}</span>
        </p>
        <div style={s.boxes} onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              style={{
                ...s.box,
                borderColor: d ? "var(--accent)" : "var(--border)",
                color: d ? "var(--accent)" : "var(--text-primary)",
              }}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKey(i, e)}
              maxLength={1}
              inputMode="numeric"
            />
          ))}
        </div>
        {error && <p style={s.error}>{error}</p>}
        <button
          style={{ ...s.btn, opacity: loading || otp.length < 6 ? 0.5 : 1 }}
          onClick={verify}
          disabled={loading || otp.length < 6}
        >
          {loading ? "Verifying…" : "Verify"}
        </button>
        <p style={s.resend}>
          Didn't get it?{" "}
          <span style={s.link} onClick={() => window.location.reload()}>
            Resend
          </span>
        </p>
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
    width: 380,
    padding: "44px 36px",
    background: "var(--bg-sidebar)",
    borderRadius: 20,
    border: "1px solid var(--border)",
    textAlign: "center",
  },
  title: { fontSize: 24, fontWeight: 700, marginBottom: 6 },
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginBottom: 28 },
  boxes: {
    display: "flex",
    gap: 10,
    justifyContent: "center",
    marginBottom: 20,
  },
  box: {
    width: 46,
    height: 54,
    textAlign: "center",
    fontSize: 22,
    fontWeight: 700,
    background: "var(--bg-input)",
    border: "2px solid",
    borderRadius: 10,
    transition: "all .15s",
    caretColor: "var(--accent)",
  },
  error: { color: "#f87171", fontSize: 13, marginBottom: 10 },
  btn: {
    width: "100%",
    padding: "13px",
    fontSize: 15,
    fontWeight: 600,
    background: "var(--accent)",
    color: "#fff",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
  },
  resend: { marginTop: 16, fontSize: 13, color: "var(--text-muted)" },
  link: { color: "var(--accent)", cursor: "pointer", fontWeight: 500 },
};
