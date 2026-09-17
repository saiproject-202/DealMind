"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/apiFetch";
import WishlistButton from "@/components/product/WishlistButton";

interface WishlistItem {
  listingId: string;
  name: string;
  brand: string | null;
  currentPrice: number;
  originalPrice: number;
  discountPct: number;
  store: string;
  isAvailable: boolean;
}

export default function WishlistPage() {
  const [items, setItems]     = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/wishlist")
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => setItems(d.items || []))
      .catch(() => {/* transient failure — keep empty/last state */})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 20px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#fff", marginBottom: "6px" }}>
        ♥ Your Wishlist
      </h1>
      <p style={{ fontSize: "14px", color: "#666", marginBottom: "28px" }}>
        {"Products you're keeping an eye on"}
      </p>

      {loading ? (
        <p style={{ color: "#555", fontSize: "13px" }}>Loading...</p>
      ) : items.length === 0 ? (
        <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "16px", padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "14px" }}>♡</div>
          <p style={{ color: "#555", fontSize: "14px", marginBottom: "16px" }}>Nothing saved yet.</p>
          <Link href="/" style={{ color: "#00C896", fontSize: "13px", textDecoration: "none" }}>Browse deals →</Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
          {items.map(item => (
            <div key={item.listingId} style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "14px", padding: "16px", position: "relative" }}>
              <div style={{ position: "absolute", top: "12px", right: "12px" }}>
                <WishlistButton listingId={item.listingId} initialState={true} />
              </div>
              <Link href={`/product/${item.listingId}`} style={{ textDecoration: "none" }}>
                <span style={{ fontSize: "10px", color: "#555" }}>{item.store}</span>
                <p style={{ fontSize: "13px", color: "#fff", fontWeight: 600, margin: "6px 0", paddingRight: "36px", lineHeight: "1.4" }}>
                  {item.name}
                </p>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#00C896" }}>
                    ₹{Number(item.currentPrice).toLocaleString("en-IN")}
                  </span>
                  {item.discountPct > 0 && (
                    <span style={{ fontSize: "11px", color: "#EF4444" }}>-{item.discountPct}%</span>
                  )}
                </div>
                {!item.isAvailable && (
                  <span style={{ fontSize: "10px", color: "#EF4444", marginTop: "4px", display: "block" }}>Out of stock</span>
                )}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}