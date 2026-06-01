import { useState, useRef } from "react";
import { auth } from "../firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";

import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";

export default function Login({ onConfirmation }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const recaptchaRef = useRef(null);

  async function sendOTP() {
    if (!phone) {
      setError("Please enter phone number");

      return;
    }

    const fullPhone = `+${phone}`;

    setError("");
    setLoading(true);

    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(
          auth,
          recaptchaRef.current,
          {
            size: "normal",
          },
        );

        await window.recaptchaVerifier.render();
      }

      const confirmation = await signInWithPhoneNumber(
        auth,
        fullPhone,
        window.recaptchaVerifier,
      );

      onConfirmation(fullPhone, confirmation);
    } catch (err) {
      console.error(err);

      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();

        window.recaptchaVerifier = null;
      }

      setError(err.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>
          <h1 style={s.title}>Cyphr</h1>
        </div>

        <p style={s.subtitle}>Enter your phone number</p>

        <div style={s.phoneWrap}>
          <PhoneInput
            country={"in"}
            value={phone}
            onChange={setPhone}
            enableSearch={true}
            searchPlaceholder="Search country..."
            inputStyle={s.phoneInput}
            buttonStyle={s.countryBtn}
            dropdownStyle={s.dropdown}
            containerStyle={{
              width: "100%",
            }}
          />
        </div>

        {error && <p style={s.error}>{error}</p>}

        <div ref={recaptchaRef} />

        <button
          style={{
            ...s.btn,

            opacity: loading ? 0.7 : 1,
          }}
          onClick={sendOTP}
          disabled={loading}
        >
          {loading ? "Sending..." : "Continue"}
        </button>

        <p style={s.terms}>Verified by Firebase · Secure login</p>
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
    padding: "40px",
    background: "var(--bg-sidebar)",
    borderRadius: 20,
    border: "1px solid var(--border)",
    textAlign: "center",
  },

  logo: {
    marginBottom: 20,
  },

  title: {
    fontSize: 30,
    fontWeight: 700,
    color: "var(--text-primary)",
  },

  subtitle: {
    fontSize: 14,
    marginBottom: 24,
    color: "var(--text-secondary)",
  },

  phoneWrap: {
    marginBottom: 15,
  },

  phoneInput: {
    width: "100%",
    height: "48px",
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    color: "var(--text-primary)",
  },

  countryBtn: {
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
  },

  dropdown: {
    background: "var(--bg-sidebar)",
    color: "#000",
  },

  error: {
    color: "#f87171",
    fontSize: 13,
    marginBottom: 12,
  },

  btn: {
    width: "100%",
    padding: "14px",
    fontSize: 15,
    fontWeight: 600,
    background: "var(--accent)",
    color: "#fff",
    borderRadius: "12px",
    border: "none",
    cursor: "pointer",
  },

  terms: {
    marginTop: 20,
    fontSize: 12,
    color: "var(--text-muted)",
  },
};
