"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("http://localhost:4001/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("dm_admin_token", data.token);
        localStorage.setItem("dm_admin", JSON.stringify(data.admin));
        router.push("/dashboard");
      } else {
        setError(data.error || "Login failed.");
      }
    } catch {
      setError("Cannot connect to server. Is the API running?");
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0D0D0D",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "400px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width:"42px", height:"42px", borderRadius:"12px", background:"#00C896", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"20px", color:"#000" }}>
              D
            </div>
            <span style={{ fontWeight:700, fontSize:"20px", color:"#fff" }}>
              DealMind <span style={{ color:"#666", fontWeight:500 }}>Admin</span>
            </span>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#161616",
            border: "1px solid #2A2A2A",
            borderRadius: "20px",
            padding: "32px",
          }}
        >
          <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
            Admin Sign In
          </h1>
          <p style={{ fontSize: "13px", color: "#666", marginBottom: "24px" }}>
            Restricted access — authorized personnel only
          </p>

          {/* Email */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display:"block", fontSize:"12px", color:"#666", marginBottom:"6px", fontWeight:600 }}>
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@dealmind.in"
              style={{
                width: "100%",
                backgroundColor: "#1E1E1E",
                border: "1px solid #2A2A2A",
                borderRadius: "10px",
                padding: "12px 14px",
                fontSize: "14px",
                color: "#fff",
                outline: "none",
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display:"block", fontSize:"12px", color:"#666", marginBottom:"6px", fontWeight:600 }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="••••••••"
              style={{
                width: "100%",
                backgroundColor: "#1E1E1E",
                border: "1px solid #2A2A2A",
                borderRadius: "10px",
                padding: "12px 14px",
                fontSize: "14px",
                color: "#fff",
                outline: "none",
              }}
            />
          </div>

          {error && (
            <div style={{ backgroundColor:"#EF444415", border:"1px solid #EF444430", borderRadius:"10px", padding:"10px 14px", marginBottom:"16px", fontSize:"13px", color:"#F87171" }}>
              {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: "100%",
              backgroundColor: "#00C896",
              color: "#000",
              border: "none",
              borderRadius: "12px",
              padding: "14px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign In →"}
          </button>
        </div>
      </div>
    </div>
  );
}