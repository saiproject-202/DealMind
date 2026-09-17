"use client";
import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { getToken } from "@/lib/auth";

interface Coupon {
  id: string;
  code: string;
  rawText: string;
  status: string;
  confidenceScore: number;
  aiExplanations: string[] | null;
  expiresAt: string | null;
  couponType: string;
  redeemedAt: string | null;
  revealCount: number;
  successCount: number;
  failCount: number;
  creator: { displayName: string | null; phone: string };
  store: { name: string } | null;
}

// Configurable, not hardcoded — override via env if a faster/slower cadence
// is ever needed without a code change. Polling only runs while a card is
// revealed, so this doesn't add background load for cards nobody opened.
const POLL_MS = Number(process.env.NEXT_PUBLIC_COUPON_POLL_MS) || 30000;

const STORE_COLORS: Record<string, { bg: string; text: string }> = {
  Amazon:   { bg: "#FF990015", text: "#FF9900" },
  Flipkart: { bg: "#2874F015", text: "#2874F0" },
  Myntra:   { bg: "#FF3F6C15", text: "#FF3F6C" },
  Meesho:   { bg: "#A020F015", text: "#A020F0" },
  AJIO:     { bg: "#00A86B15", text: "#00A86B" },
};

export default function CouponCard({ coupon }: { coupon: Coupon }) {
  const [revealed, setRevealed]   = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [reported, setReported]   = useState<string | null>(null);
  const [reportError, setReportError] = useState("");
  const [confidence, setConfidence] = useState(coupon.confidenceScore);
  const [status, setStatus] = useState(coupon.status);
  const [msg, setMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards against out-of-order responses: a slow initial/poll GET can
  // resolve AFTER a report POST's own fresher state update and silently
  // stomp it with stale data. Every write to confidence/status bumps this;
  // a GET response only applies if nothing newer landed while it was in flight.
  const versionRef = useRef(0);

  const confColor = confidence >= 70 ? "#00C896" : confidence >= 40 ? "#F59E0B" : "#EF4444";
  const isLocked = status === 'expired' || status === 'archived' || status === 'flagged';

  // Once revealed, poll for confidence/status changes from other users'
  // reports — gives the "real-time" feel without WebSockets. Also checks
  // whether the current user already has an active vote, so the buttons
  // reflect a lock made in a previous session/tab.
  useEffect(() => {
    if (!revealed) return;

    const refresh = () => {
      const v = ++versionRef.current;
      apiFetch(`/api/coupons/${coupon.id}`, { auth: false })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(d => {
          if (versionRef.current !== v) return; // a newer update already landed — this response is stale
          if (d.coupon) { setConfidence(d.coupon.confidenceScore); setStatus(d.coupon.status); }
        })
        .catch(() => {/* transient failure — keep last known state */});
    };

    if (getToken()) {
      apiFetch(`/api/coupons/${coupon.id}/my-report`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(d => { if (d.report) setReported(d.report.type); })
        .catch(() => {/* transient failure — buttons just stay unlocked until next check */});
    }

    refresh();
    pollRef.current = setInterval(refresh, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [revealed, coupon.id]);

  const handleReveal = async () => {
    setRevealing(true);
    try {
      const res = await apiFetch(`/api/coupons/${coupon.id}/reveal`, { method: "POST" });
      const data = await res.json();
      if (data.success) setRevealed(true);
    } catch {}
    setRevealing(false);
  };

  const handleReport = async (type: "worked" | "failed" | "expired" | "fake") => {
    if (reported || isLocked) return;
    setReportError("");
    setReported(type);
    try {
      const res = await apiFetch(`/api/coupons/${coupon.id}/report`, {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setReportError(data.error || "You've already voted on this coupon.");
      } else if (data.success) {
        versionRef.current++; // this write is authoritative — invalidate any in-flight GET from before it
        setConfidence(data.confidence);
        setStatus(data.status);
        setMsg(data.message);
      } else {
        setReported(null);
      }
    } catch {
      setReported(null);
    }
    setTimeout(() => setMsg(""), 4000);
  };

  return (
    <div style={{ backgroundColor: "#161616", border: `1px solid ${confColor}30`, borderRadius: "16px", padding: "18px", display: "flex", flexDirection: "column", gap: "10px", opacity: isLocked ? 0.55 : 1 }}>

      {/* Confidence + platform badges */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ backgroundColor: `${confColor}15`, color: confColor, fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "8px" }}>
            {confidence}% confidence
          </span>
          {coupon.couponType === 'SINGLE_USE' && (
            <span style={{ backgroundColor: "#8B5CF615", color: "#8B5CF6", fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "8px" }}>
              Single-use
            </span>
          )}
          {coupon.store && (
            <span style={{
              backgroundColor: (STORE_COLORS[coupon.store.name] ?? { bg: "#33333320", text: "#888" }).bg,
              color: (STORE_COLORS[coupon.store.name] ?? { bg: "#33333320", text: "#888" }).text,
              fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "8px",
            }}>
              {coupon.store.name}
            </span>
          )}
        </div>
        <span style={{ fontSize: "11px", color: "#555" }}>{coupon.revealCount} revealed</span>
      </div>

      {/* Description */}
      <p style={{ fontSize: "13px", color: "#ccc", lineHeight: "1.5" }}>{coupon.rawText}</p>

      {/* AI explanations */}
      {coupon.aiExplanations && coupon.aiExplanations.length > 0 && (
        <div style={{ fontSize: "11px", color: "#555", display: "flex", flexDirection: "column", gap: "3px" }}>
          {coupon.aiExplanations.slice(0, 2).map((e, i) => (
            <div key={i}>• {e}</div>
          ))}
        </div>
      )}

      {/* Reveal / Code */}
      {!revealed ? (
        <button
          onClick={handleReveal}
          disabled={revealing}
          style={{ backgroundColor: "#00C896", color: "#000", border: "none", borderRadius: "10px", padding: "12px", fontSize: "13px", fontWeight: 700, cursor: revealing ? "not-allowed" : "pointer" }}
        >
          {revealing ? "Revealing..." : "🔒 Reveal Coupon"}
        </button>
      ) : (
        <div style={{ backgroundColor: "#1E1E1E", border: "1px dashed #00C896", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
          <span style={{ fontSize: "16px", fontWeight: 800, color: "#00C896", letterSpacing: "1px" }}>
            {coupon.code}
          </span>
        </div>
      )}

      {/* Report buttons — only after reveal */}
      {revealed && isLocked && (
        <div style={{ fontSize: "11px", color: "#888", textAlign: "center", padding: "8px" }}>
          {coupon.couponType === 'SINGLE_USE' && status === 'expired'
            ? "🔒 Fully redeemed — a trusted user already confirmed this worked."
            : status === 'flagged'
            ? "⚠ Flagged for review based on community reports."
            : "This coupon has expired."}
        </div>
      )}

      {revealed && !isLocked && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[
            { type: "worked" as const,  label: "✓ Worked",     color: "#00C896" },
            { type: "failed" as const,  label: "✗ Didn't work", color: "#EF4444" },
            { type: "expired" as const, label: "⚠ Expired",     color: "#F59E0B" },
            { type: "fake" as const,    label: "⚠ Fake",        color: "#EF4444" },
          ].map(btn => (
            <button
              key={btn.type}
              onClick={() => handleReport(btn.type)}
              disabled={!!reported}
              style={{
                flex: "1 1 auto", minWidth: "80px",
                backgroundColor: reported === btn.type ? `${btn.color}20` : "#1E1E1E",
                color: btn.color, border: `1px solid ${btn.color}30`,
                borderRadius: "8px", padding: "6px 8px", fontSize: "11px",
                cursor: reported ? "not-allowed" : "pointer",
                opacity: reported && reported !== btn.type ? 0.4 : 1,
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}

      {reportError && <div style={{ fontSize: "11px", color: "#EF4444" }}>{reportError}</div>}
      {msg && <div style={{ fontSize: "11px", color: "#888" }}>{msg}</div>}
    </div>
  );
}