"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminSidebar from "@/components/layout/AdminSidebar";

interface HomepageCard {
  id: string;
  productId: string;
  name: string;
  brand: string | null;
  image: string | null;
  category: string;
  currentPrice: number;
  originalPrice: number;
  discountPct: number;
  rating: number | null;
  store: string;
}

// Matches the section keys deals.routes.ts's /homepage returns — used to
// show which section(s) each product currently qualifies for, since the
// same listing can legitimately appear in more than one.
const SECTION_LABELS: Record<string, string> = {
  priceDrops: "🔥 Price Drops", trending: "📈 Trending", mostSold: "🏆 Most Sold",
  bestValue: "💎 Best Value", hiddenGems: "💡 Hidden Gems", aiRecommended: "🤖 AI Recommended",
  newLaunches: "🆕 New Launches", seasonal: "🌟 Seasonal", couponDeals: "🎟 Coupon Deals",
};

export default function LiveDealsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<(HomepageCard & { sections: string[] })[]>([]);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<(HomepageCard & { sections: string[] }) | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = () => {
    const token = localStorage.getItem("dm_admin_token");
    if (!token) { router.push("/login"); return; }
    setLoading(true);

    // The homepage endpoint itself is public (no admin auth needed) — same
    // data a customer sees right now, just fetched with a high limit so
    // this page shows the full live set, not each row's 10-item cap.
    // cache: "no-store" so "Refresh" always re-runs the real eligibility
    // logic against current data instead of returning a stale response.
    fetch("http://localhost:4001/api/deals/homepage?limit=100", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const sections: Record<string, HomepageCard[]> = data.sections || {};
        const byId = new Map<string, HomepageCard & { sections: string[] }>();
        for (const key of Object.keys(sections)) {
          for (const card of sections[key]) {
            const existing = byId.get(card.id);
            if (existing) existing.sections.push(key);
            else byId.set(card.id, { ...card, sections: [key] });
          }
        }
        setItems([...byId.values()]);
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- load reads router/localStorage (not reactive state, only run on mount) and its setState calls are the "Refresh" button's own re-entry into loading state, not a synchronous render-loop
  useEffect(() => { load(); }, []);

  const filtered = items.filter((item) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return item.name.toLowerCase().includes(q) || item.store.toLowerCase().includes(q);
  });

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const token = localStorage.getItem("dm_admin_token");
    if (!token) { router.push("/login"); return; }
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`http://localhost:4001/api/admin/products/${confirmDelete.productId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      if (data.success) {
        setItems((prev) => prev.filter((i) => i.id !== confirmDelete.id));
        setConfirmDelete(null);
      } else {
        setDeleteError(data.error || "Could not remove product.");
      }
    } catch {
      setDeleteError("Could not connect to API.");
    }
    setDeleting(false);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />
      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px" }}>
          <Link href="/dashboard" style={{ color: "#555", textDecoration: "none", fontSize: "13px" }}>
            ← Dashboard
          </Link>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff" }}>Live Deals</h1>
          <button
            onClick={load}
            disabled={loading}
            style={{
              backgroundColor: "#1E1E1E", color: loading ? "#555" : "#888",
              border: "1px solid #2A2A2A", borderRadius: "10px",
              padding: "8px 16px", fontSize: "13px", cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "⏳ Refreshing..." : "↻ Refresh"}
          </button>
        </div>
        <p style={{ fontSize: "13px", color: "#555", marginBottom: "20px" }}>
          {loading ? "Loading..." : `${items.length} products currently showing on the DealMind homepage right now`} —
          the exact same eligibility logic customers see, not a separate count.
        </p>

        {!loading && items.length > 0 && (
          <div style={{ marginBottom: "20px", maxWidth: "360px" }}>
            <input
              placeholder="Search by deal name or store (Amazon, Flipkart, Myntra...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%", backgroundColor: "#161616",
                border: "1px solid #2A2A2A", borderRadius: "10px",
                padding: "9px 14px", fontSize: "13px", color: "#fff", outline: "none",
              }}
            />
          </div>
        )}

        {loading ? (
          <p style={{ color: "#555", fontSize: "13px" }}>Loading...</p>
        ) : items.length === 0 ? (
          <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "16px", padding: "48px", textAlign: "center" }}>
            <p style={{ color: "#666", fontSize: "14px" }}>Nothing currently qualifies for any homepage section.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "16px", padding: "40px", textAlign: "center" }}>
            <p style={{ color: "#666", fontSize: "14px" }}>No live deals match this search.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filtered.map((item, index) => (
              <div
                key={item.id}
                onClick={() => router.push(`/products/${item.productId}`)}
                style={{
                  backgroundColor: "#161616", border: "1px solid #2A2A2A",
                  borderRadius: "14px", padding: "14px 20px",
                  display: "flex", alignItems: "center", gap: "16px", cursor: "pointer",
                }}
              >
                <div style={{ width: "24px", flexShrink: 0, textAlign: "right", fontSize: "12px", color: "#555", fontWeight: 600 }}>
                  {index + 1}
                </div>
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt={item.name} style={{ width: "42px", height: "42px", borderRadius: "10px", objectFit: "cover", backgroundColor: "#1E1E1E", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: "42px", height: "42px", borderRadius: "10px", backgroundColor: "#1E1E1E", flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: "12px", color: "#555" }}>{item.store} · {item.category}</div>
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", maxWidth: "320px", justifyContent: "flex-end" }}>
                  {item.sections.map((s) => (
                    <span key={s} style={{ backgroundColor: "#00C89615", color: "#00C896", fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px", whiteSpace: "nowrap" }}>
                      {SECTION_LABELS[s] || s}
                    </span>
                  ))}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, minWidth: "80px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>₹{item.currentPrice.toLocaleString("en-IN")}</div>
                  {item.discountPct > 0 && <div style={{ fontSize: "11px", color: "#EF4444" }}>-{item.discountPct}%</div>}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(item); setDeleteError(""); }}
                  title="Remove product"
                  style={{
                    background: "none", border: "1px solid #2A2A2A", borderRadius: "8px",
                    width: "32px", height: "32px", flexShrink: 0, cursor: "pointer",
                    color: "#666", fontSize: "14px", display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Delete confirmation */}
        {confirmDelete && (
          <div
            onClick={() => !deleting && setConfirmDelete(null)}
            style={{
              position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "16px",
                padding: "24px", width: "420px", maxWidth: "90vw",
              }}
            >
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>
                🗑 Remove Product?
              </h3>
              <p style={{ fontSize: "13px", color: "#888", marginBottom: "18px", lineHeight: 1.5 }}>
                <strong style={{ color: "#fff" }}>{confirmDelete.name}</strong> will be removed from the DealMind homepage and product pages immediately. Past click and purchase history is kept for accounting — nothing is permanently deleted.
              </p>

              {deleteError && (
                <p style={{ fontSize: "12px", color: "#F87171", marginBottom: "14px" }}>❌ {deleteError}</p>
              )}

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    flex: 1, backgroundColor: deleting ? "#3a1414" : "#EF444420",
                    color: deleting ? "#764" : "#F87171",
                    border: "1px solid #EF444450", borderRadius: "10px",
                    padding: "12px", fontSize: "13px", fontWeight: 700,
                    cursor: deleting ? "not-allowed" : "pointer",
                  }}
                >
                  {deleting ? "Removing..." : "Remove Product"}
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  disabled={deleting}
                  style={{
                    backgroundColor: "#1E1E1E", color: "#666", border: "1px solid #2A2A2A",
                    borderRadius: "10px", padding: "12px 20px", fontSize: "13px", cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
