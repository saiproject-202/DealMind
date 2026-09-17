"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";

interface Coupon {
  id: string;
  code: string;
  rawText: string;
  confidenceScore: number;
}

// Small convergence widget — shown inside each CartNote card.
// Lazily fetches coupons matching this note's tracked product.
export default function CartNoteCoupons({ cartnoteId }: { cartnoteId: string }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/cartnotes/${cartnoteId}/coupons`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => setCoupons(d.coupons || []))
      .catch(() => {/* transient failure — widget just stays hidden */})
      .finally(() => setLoading(false));
  }, [cartnoteId]);

  if (loading || coupons.length === 0) return null;

  const topConfidence = coupons[0]?.confidenceScore || 0;
  const color = topConfidence >= 70 ? "#00C896" : "#F59E0B";

  return (
    <div style={{
      marginTop: "6px", display: "flex", alignItems: "center", gap: "6px",
      backgroundColor: `${color}10`, border: `1px solid ${color}30`,
      borderRadius: "8px", padding: "5px 10px",
    }}>
      <span style={{ fontSize: "12px" }}>🎟</span>
      <span style={{ fontSize: "11px", color, fontWeight: 600 }}>
        {coupons.length} coupon{coupons.length > 1 ? 's' : ''} available
      </span>
      <span style={{ fontSize: "10px", color: "#555" }}>
        (up to {topConfidence}% confidence)
      </span>
    </div>
  );
}