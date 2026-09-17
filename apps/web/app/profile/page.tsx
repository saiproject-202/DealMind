"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getUser, saveUser, clearTokens } from "@/lib/auth";
import { getTheme, toggleTheme, applyTheme, type Theme } from "@/lib/theme";
import { apiFetch } from "@/lib/apiFetch";

interface User {
  id: string;
  phone: string;
  displayName: string | null;
  isVerified: boolean;
  points: number;
  trustScore: number;
  level: { name: string; levelNumber: number } | null;
}

const LEVEL_COLORS: Record<number, string> = {
  1: "#888", 2: "#3B82F6", 3: "#8B5CF6",
  4: "#00C896", 5: "#F59E0B", 6: "#FFD700",
};

export default function ProfilePage() {
  const router = useRouter();
  const [mounted, setMounted]       = useState(false);
  const [user, setUser]             = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [editing, setEditing]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveMsg, setSaveMsg]       = useState("");
  const [theme, setThemeState]      = useState<Theme>("dark");

  useEffect(() => {
    const u = getUser();
    if (!u) { router.push("/login"); return; }

    // Apply stored theme
    const t = getTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing theme from localStorage on mount
    setThemeState(t);
    applyTheme(t);
    setMounted(true);

    // Fetch fresh profile from API
    apiFetch("/api/auth/me")
      .then(r => r.json())
      .then(data => {
        if (data.user) {
          setUser(data.user);
          setDisplayName(data.user.displayName || "");
          saveUser(data.user);
        }
      })
      .catch(() => {
        // Fallback to cached user
        setUser(u as User);
        setDisplayName((u as User).displayName || "");
      });
  }, [router]);

  const handleThemeToggle = () => {
    const next = toggleTheme();
    setThemeState(next);
  };

  const handleSaveName = async () => {
    if (!displayName.trim() || displayName.trim().length < 2) {
      setSaveMsg("❌ Name must be at least 2 characters.");
      return;
    }
    setSaving(true);
    try {
      const res = await 
      apiFetch("/api/auth/profile", {
          method:"PUT",
          body: JSON.stringify({
              displayName: displayName.trim(),
          }),
      })
      const data = await res.json();
      if (data.success) {
        setUser(prev => prev ? { ...prev, displayName: displayName.trim() } : null);
        saveUser({ ...getUser(), displayName: displayName.trim() });
        setEditing(false);
        setSaveMsg("✅ Name updated!");
      } else {
        setSaveMsg("❌ " + (data.error || "Failed to save."));
      }
    } catch {
      setSaveMsg("❌ Could not connect to server.");
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 3000);
  };

  const handleLogout = () => {
    clearTokens();
    router.push("/");
  };

  if (!mounted || !user) {
    return <div style={{ minHeight: "100vh", backgroundColor: "var(--bg)" }} />;
  }

  const levelNum   = user.level?.levelNumber || 1;
  const levelColor = LEVEL_COLORS[levelNum] || "#888";
  const maskPhone  = (p: string) => p.length > 6 ? `${p.slice(0, 3)} **** ${p.slice(-3)}` : p;

  const card = {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    padding: "24px",
    marginBottom: "16px",
  };

  const inp = {
    width: "100%",
    backgroundColor: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    padding: "11px 14px",
    fontSize: "14px",
    color: "var(--text)",
    outline: "none",
  };

  return (
    <div style={{ maxWidth: "520px", margin: "0 auto", padding: "40px 20px" }}>

      {/* Back */}
      <Link href="/" style={{ color: "var(--faint)", fontSize: "13px", textDecoration: "none" }}>
        ← Back to homepage
      </Link>

      {/* Avatar + Level */}
      <div style={{ textAlign: "center", margin: "28px 0 32px" }}>
        <div style={{
          width: "80px", height: "80px", borderRadius: "50%",
          backgroundColor: `${levelColor}20`, border: `3px solid ${levelColor}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "28px", fontWeight: 800, color: levelColor,
          margin: "0 auto 12px",
        }}>
          {(user.displayName || user.phone).slice(-2).toUpperCase()}
        </div>
        <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>
          {user.displayName || `User ${user.phone.slice(-4)}`}
        </div>
        <div style={{
          display: "inline-block",
          backgroundColor: `${levelColor}20`, color: levelColor,
          fontSize: "12px", fontWeight: 700, padding: "3px 12px", borderRadius: "20px",
          border: `1px solid ${levelColor}40`,
        }}>
          {user.level?.name || "Explorer"} · Level {levelNum}
        </div>
      </div>

      {/* Flash message */}
      {saveMsg && (
        <div style={{
          backgroundColor: saveMsg.startsWith("✅") ? "var(--brand-bg)" : "#EF444415",
          border: `1px solid ${saveMsg.startsWith("✅") ? "var(--brand)" : "var(--red)"}40`,
          borderRadius: "10px", padding: "10px 14px", marginBottom: "16px",
          fontSize: "13px", color: saveMsg.startsWith("✅") ? "var(--brand)" : "var(--red)",
        }}>
          {saveMsg}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
        <div style={{ ...card, marginBottom: 0, textAlign: "center" }}>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--brand)" }}>{user.points}</div>
          <div style={{ fontSize: "12px", color: "var(--faint)", marginTop: "3px" }}>Points earned</div>
        </div>
        <div style={{ ...card, marginBottom: 0, textAlign: "center" }}>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--text)" }}>
            {(Number(user.trustScore) * 100).toFixed(0)}%
          </div>
          <div style={{ fontSize: "12px", color: "var(--faint)", marginTop: "3px" }}>Trust score</div>
        </div>
      </div>

      {/* Display Name (editable) */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>Display Name</div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              style={{ backgroundColor: "transparent", color: "var(--brand)", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Enter your name..."
              maxLength={50}
              style={inp}
              autoFocus
            />
            <p style={{ fontSize: "11px", color: "var(--faint)", marginTop: "5px" }}>
              This name shows on the leaderboard and your deal submissions.
            </p>
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <button
                onClick={handleSaveName}
                disabled={saving}
                style={{ flex: 1, backgroundColor: "var(--brand)", color: "#000", border: "none", borderRadius: "10px", padding: "10px", fontSize: "13px", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}
              >
                {saving ? "Saving..." : "Save Name"}
              </button>
              <button
                onClick={() => { setEditing(false); setDisplayName(user.displayName || ""); }}
                style={{ backgroundColor: "transparent", color: "var(--faint)", border: "1px solid var(--border)", borderRadius: "10px", padding: "10px 16px", fontSize: "13px", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: "15px", color: "var(--text2)", fontWeight: 500 }}>
            {user.displayName || <span style={{ color: "var(--faint)", fontStyle: "italic" }}>No name set yet — tap Edit to add one</span>}
          </div>
        )}
      </div>

      {/* Phone (read-only) */}
      <div style={card}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginBottom: "12px" }}>
          Mobile Number
          <span style={{ marginLeft: "8px", backgroundColor: "var(--surface2)", color: "var(--faint)", fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "5px", border: "1px solid var(--border)" }}>
            READ ONLY
          </span>
        </div>
        <div style={{ fontSize: "15px", color: "var(--muted)", letterSpacing: "1px" }}>
          🇮🇳 +91 {maskPhone(user.phone)}
        </div>
        <p style={{ fontSize: "11px", color: "var(--faint)", marginTop: "6px" }}>
          {"Phone number cannot be changed. It's your permanent login identity."}
        </p>
      </div>

      {/* Theme toggle */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginBottom: "3px" }}>
              App Theme
            </div>
            <div style={{ fontSize: "12px", color: "var(--faint)" }}>
              Currently: {theme === "dark" ? "🌙 Dark mode" : "☀️ Light mode"}
            </div>
          </div>
          {/* Toggle switch */}
          <button
            onClick={handleThemeToggle}
            style={{
              width: "56px", height: "28px", borderRadius: "14px",
              backgroundColor: theme === "dark" ? "#2A2A2A" : "#E5E7EB",
              border: `2px solid ${theme === "dark" ? "#3A3A3A" : "#D1D5DB"}`,
              cursor: "pointer", position: "relative", transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            <div style={{
              width: "20px", height: "20px", borderRadius: "50%",
              backgroundColor: theme === "dark" ? "#888" : "var(--brand)",
              position: "absolute", top: "2px",
              left: theme === "dark" ? "2px" : "30px",
              transition: "left 0.2s",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px",
            }}>
              {theme === "dark" ? "🌙" : "☀️"}
            </div>
          </button>
        </div>
      </div>

      {/* Quick links */}
      <div style={card}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)", marginBottom: "14px" }}>Quick actions</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <Link href="/submit" style={{ padding: "10px 0", fontSize: "13px", color: "var(--text2)", textDecoration: "none", borderBottom: "1px solid var(--border)" }}>
            📋 Submit a Deal →
          </Link>
          <button
            onClick={() => router.push("/")}
            style={{ padding: "10px 0", fontSize: "13px", color: "var(--text2)", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: "1px solid var(--border)" }}
          >
            🏠 Browse Deals →
          </button>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        style={{
          width: "100%", backgroundColor: "transparent", color: "var(--red)",
          border: "1px solid var(--red)30", borderRadius: "14px",
          padding: "14px", fontSize: "14px", fontWeight: 600,
          cursor: "pointer", marginTop: "8px",
        }}
      >
        Logout
      </button>
    </div>
  );
}