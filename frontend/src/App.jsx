import { useEffect, useState } from "react";
import Login from "./pages/Login";
import VerifyOTP from "./pages/VerifyOTP";
import SetUsername from "./pages/SetUsername";
import Chat from "./pages/Chat";
import api from "./services/api";
import { connectSocket, disconnectSocket } from "./services/socket";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [phone, setPhone] = useState(null);
  const [confirmation, setConfirmation] = useState(null); // Firebase confirmation object
  const [loading, setLoading] = useState(true);
  const [hasUsername, setHasUsername] = useState(false);

  useEffect(() => {
    async function checkUser() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get("/auth/me");
        if (res.data.username) setHasUsername(true);
      } catch {
        localStorage.removeItem("token");
        setToken(null);
      } finally {
        setLoading(false);
      }
    }
    checkUser();
  }, [token]);

  useEffect(() => {
    if (token && hasUsername) connectSocket();
  }, [token, hasUsername]);

  function handleConfirmation(phoneValue, confirmationResult) {
    setPhone(phoneValue);
    setConfirmation(confirmationResult);
  }

  function handleLogin(newToken) {
    localStorage.setItem("token", newToken);
    setToken(newToken);
  }

  function handleLogout() {
    disconnectSocket();
    localStorage.removeItem("token");
    setToken(null);
    setHasUsername(false);
    setPhone(null);
    setConfirmation(null);
  }

  if (loading)
    return (
      <div style={{ padding: 40, color: "var(--text-secondary)" }}>
        Loading…
      </div>
    );

  if (!token && !phone) return <Login onConfirmation={handleConfirmation} />;

  if (!token && phone)
    return (
      <VerifyOTP
        phone={phone}
        confirmation={confirmation}
        onLogin={handleLogin}
      />
    );

  if (!hasUsername) return <SetUsername onDone={() => setHasUsername(true)} />;

  return <Chat onLogout={handleLogout} />;
}
