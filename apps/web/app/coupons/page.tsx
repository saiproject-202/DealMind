"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";
import CouponCard from "@/components/coupon/CouponCard";

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

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/coupons", { auth: false })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => setCoupons(d.coupons || []))
      .catch(() => {/* transient failure — keep empty/last state */})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 20px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#fff", marginBottom: "6px" }}>
        🎟 Coupons
      </h1>
      <p style={{ fontSize: "14px", color: "#666", marginBottom: "28px" }}>
        Community-verified coupons — confidence score shows how likely each one is to work
      </p>

      {loading ? (
        <p style={{ color: "#555", fontSize: "13px" }}>Loading coupons...</p>
      ) : coupons.length === 0 ? (
        <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "16px", padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "14px" }}>🎟</div>
          <p style={{ color: "#555", fontSize: "14px" }}>No coupons yet. Be the first to submit one!</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {coupons.map(c => (
            <CouponCard key={c.id} coupon={c} />
          ))}
        </div>
      )}
    </div>
  );
}