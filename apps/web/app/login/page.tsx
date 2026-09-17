"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { sendOtp, verifyOtp } from "@/lib/api";
import { saveTokens, saveUser } from "@/lib/auth";

type Step = "phone" | "otp" | "success";

export default function LoginPage() {
  const router = useRouter();

  const [step, setStep]       = useState<Step>("phone");
  const [phone, setPhone]     = useState("");
  const [otp, setOtp]         = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [devOtp, setDevOtp]   = useState("");

  // ── Step 1: Send OTP ──────────────────────────────────────────
  const handleSendOtp = async () => {
    setError("");
    if (phone.length < 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    try {
      const data = await sendOtp(phone);
      if (data.success) {
        setStep("otp");
        if (data.dev_otp) setDevOtp(data.dev_otp); // Show OTP in dev mode
      } else {
        setError(data.error || "Failed to send OTP. Please try again.");
      }
    } catch {
      setError("Cannot connect to server. Is the API running?");
    }
    setLoading(false);
  };

  // ── Step 2: Verify OTP ────────────────────────────────────────
  const handleVerifyOtp = async () => {
    setError("");
    const code = otp.join("");
    if (code.length < 6) {
      setError("Please enter the complete 6-digit OTP.");
      return;
    }
    setLoading(true);
    try {
      const data = await verifyOtp(phone, code);
      if (data.success) {
        saveTokens(data.token, data.refreshToken);
        saveUser(data.user);
        setStep("success");
        setTimeout(() => router.push("/"), 1500);
      } else {
        setError(data.error || "Invalid OTP. Please try again.");
      }
    } catch {
      setError("Cannot connect to server. Is the API running?");
    }
    setLoading(false);
  };

  // ── OTP input handler ─────────────────────────────────────────
  const handleOtpInput = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return; // digits only
    const updated = [...otp];
    updated[index] = value.slice(-1);
    setOtp(updated);
    // Auto-focus next box
    if (value && index < 5) {
      const next = document.getElementById(`otp-${index + 1}`);
      next?.focus();
    }
    // Auto-submit when all 6 filled
    if (updated.every(d => d !== "") && updated.join("").length === 6) {
      setTimeout(() => handleVerifyWithCode(updated.join("")), 100);
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      const prev = document.getElementById(`otp-${index - 1}`);
      prev?.focus();
    }
  };

  const handleVerifyWithCode = async (code: string) => {
    setError("");
    setLoading(true);
    try {
      const data = await verifyOtp(phone, code);
      if (data.success) {
        saveTokens(data.token, data.refreshToken);
        saveUser(data.user);
        setStep("success");
        setTimeout(() => router.push("/"), 1500);
      } else {
        setError(data.error || "Invalid OTP. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Cannot connect to server.");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        backgroundColor: "#0D0D0D",
      }}
    >
      <div style={{ width: "100%", maxWidth: "420px" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Link href="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width:"42px", height:"42px", borderRadius:"12px", background:"#00C896", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"20px", color:"#000" }}>
              D
            </div>
            <span style={{ fontWeight:700, fontSize:"22px", color:"#fff" }}>
              Deal<span style={{ color:"#00C896" }}>Mind</span>
            </span>
          </Link>
        </div>

        {/* Card */}
        <div
          style={{
            backgroundColor: "#161616",
            border: "1px solid #2A2A2A",
            borderRadius: "24px",
            padding: "36px 32px",
          }}
        >

          {/* ── STEP: PHONE ──────────────────────────────────── */}
          {step === "phone" && (
            <>
              <h1 style={{ fontSize:"22px", fontWeight:800, color:"#fff", marginBottom:"6px" }}>
                Welcome to DealMind
              </h1>
              <p style={{ fontSize:"14px", color:"#666", marginBottom:"28px" }}>
                Enter your mobile number to continue
              </p>

              {/* Phone input */}
              <div style={{ marginBottom:"20px" }}>
                <label style={{ display:"block", fontSize:"12px", color:"#666", marginBottom:"8px", fontWeight:600 }}>
                  MOBILE NUMBER
                </label>
                <div style={{ display:"flex", alignItems:"center", backgroundColor:"#1E1E1E", border:"1px solid #2A2A2A", borderRadius:"14px", overflow:"hidden" }}>
                  <div style={{ padding:"14px 14px 14px 16px", borderRight:"1px solid #2A2A2A", color:"#666", fontSize:"14px", fontWeight:600, flexShrink:0 }}>
                    🇮🇳 +91
                  </div>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="9876543210"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={e => e.key === "Enter" && handleSendOtp()}
                    style={{
                      flex: 1,
                      backgroundColor: "transparent",
                      border: "none",
                      outline: "none",
                      padding: "14px 16px",
                      fontSize: "16px",
                      color: "#fff",
                      letterSpacing: "1px",
                    }}
                    autoFocus
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{ backgroundColor:"#EF444415", border:"1px solid #EF444430", borderRadius:"10px", padding:"10px 14px", marginBottom:"16px", fontSize:"13px", color:"#F87171" }}>
                  {error}
                </div>
              )}

              {/* Send OTP button */}
              <button
                onClick={handleSendOtp}
                disabled={loading || phone.length < 10}
                style={{
                  width: "100%",
                  backgroundColor: phone.length >= 10 ? "#00C896" : "#1E1E1E",
                  color: phone.length >= 10 ? "#000" : "#444",
                  border: "none",
                  borderRadius: "14px",
                  padding: "16px",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: phone.length >= 10 ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                }}
              >
                {loading ? "Sending..." : "Send OTP →"}
              </button>

              <p style={{ fontSize:"12px", color:"#444", textAlign:"center", marginTop:"20px", lineHeight:1.6 }}>
                By continuing, you agree to DealMind&apos;s Terms of Service and Privacy Policy
              </p>
            </>
          )}

          {/* ── STEP: OTP ────────────────────────────────────── */}
          {step === "otp" && (
            <>
              <button
                onClick={() => { setStep("phone"); setOtp(["","","","","",""]); setError(""); }}
                style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:"13px", marginBottom:"20px", padding:0, display:"flex", alignItems:"center", gap:"4px" }}
              >
                ← Back
              </button>

              <h1 style={{ fontSize:"22px", fontWeight:800, color:"#fff", marginBottom:"6px" }}>
                Verify your number
              </h1>
              <p style={{ fontSize:"14px", color:"#666", marginBottom:"28px" }}>
                We sent a 6-digit OTP to{" "}
                <span style={{ color:"#fff", fontWeight:600 }}>+91 {phone}</span>
              </p>

              {/* Dev OTP hint */}
              {devOtp && (
                <div style={{ backgroundColor:"#00C89615", border:"1px solid #00C89630", borderRadius:"10px", padding:"10px 14px", marginBottom:"20px", fontSize:"13px", color:"#00C896" }}>
                  🛠 Dev mode — your OTP is: <strong>{devOtp}</strong>
                </div>
              )}

              {/* OTP boxes */}
              <div style={{ display:"flex", gap:"10px", justifyContent:"center", marginBottom:"20px" }}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    aria-label={`OTP digit ${i + 1}`}
                    type="tel"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpInput(e.target.value, i)}
                    onKeyDown={e => handleOtpKeyDown(e, i)}
                    style={{
                      width: "48px",
                      height: "56px",
                      textAlign: "center",
                      fontSize: "22px",
                      fontWeight: 700,
                      color: "#fff",
                      backgroundColor: digit ? "#00C89615" : "#1E1E1E",
                      border: `2px solid ${digit ? "#00C896" : "#2A2A2A"}`,
                      borderRadius: "12px",
                      outline: "none",
                      transition: "all 0.15s",
                    }}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {/* Error */}
              {error && (
                <div style={{ backgroundColor:"#EF444415", border:"1px solid #EF444430", borderRadius:"10px", padding:"10px 14px", marginBottom:"16px", fontSize:"13px", color:"#F87171" }}>
                  {error}
                </div>
              )}

              {/* Verify button */}
              <button
                onClick={handleVerifyOtp}
                disabled={loading}
                style={{
                  width: "100%",
                  backgroundColor: "#00C896",
                  color: "#000",
                  border: "none",
                  borderRadius: "14px",
                  padding: "16px",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                  marginBottom: "16px",
                }}
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>

              {/* Resend */}
              <div style={{ textAlign:"center" }}>
                <button
                  onClick={() => { setOtp(["","","","","",""]); handleSendOtp(); }}
                  style={{ background:"none", border:"none", color:"#00C896", fontSize:"13px", cursor:"pointer", fontWeight:600 }}
                >
                  Resend OTP
                </button>
              </div>
            </>
          )}

          {/* ── STEP: SUCCESS ─────────────────────────────────── */}
          {step === "success" && (
            <div style={{ textAlign:"center", padding:"20px 0" }}>
              <div style={{ fontSize:"64px", marginBottom:"20px" }}>🎉</div>
              <h2 style={{ fontSize:"22px", fontWeight:800, color:"#fff", marginBottom:"8px" }}>
                You&apos;re in!
              </h2>
              <p style={{ fontSize:"14px", color:"#666" }}>
                Redirecting to DealMind...
              </p>
            </div>
          )}

        </div>

        {/* Back to home */}
        <div style={{ textAlign:"center", marginTop:"24px" }}>
          <Link href="/" style={{ fontSize:"13px", color:"#555", textDecoration:"none" }}>
            ← Back to homepage
          </Link>
        </div>

      </div>
    </div>
  );
}