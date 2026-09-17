"use client";
import Link from "next/link";

// NOTE: Since DealMind doesn't have an email/SMTP service configured yet,
// admin password resets are done via a secure CLI script instead of email.
// This page explains that to anyone who lands here.

export default function ForgotPasswordPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ maxWidth: "420px", width: "100%", backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "20px", padding: "32px" }}>
        <div style={{ fontSize: "32px", marginBottom: "16px", textAlign: "center" }}>🔑</div>
        <h1 style={{ fontSize: "18px", fontWeight: 800, color: "#fff", marginBottom: "12px", textAlign: "center" }}>
          Admin Password Reset
        </h1>
        <p style={{ fontSize: "13px", color: "#888", lineHeight: "1.6", marginBottom: "20px", textAlign: "center" }}>
          {"Email-based reset isn't configured yet. To reset your password, run this command in your terminal:"}
        </p>
        <div style={{ backgroundColor: "#0D0D0D", border: "1px solid #2A2A2A", borderRadius: "10px", padding: "14px", marginBottom: "20px" }}>
          <code style={{ fontSize: "12px", color: "#00C896", fontFamily: "monospace" }}>
            cd services/api<br />
            npx tsx prisma/reset-admin-password.ts
          </code>
        </div>
        <p style={{ fontSize: "11px", color: "#555", lineHeight: "1.6", marginBottom: "20px" }}>
          {"This script will ask for your admin email and a new password, then update it directly in the database. Only someone with terminal access to the server can run this — it's secure by design."}
        </p>
        <Link href="/login" style={{ display: "block", textAlign: "center", backgroundColor: "#00C896", color: "#000", padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>
          ← Back to Login
        </Link>
      </div>
    </div>
  );
}