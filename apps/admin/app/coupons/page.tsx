"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/layout/AdminSidebar";

interface Coupon {
  id: string;
  code: string;
  rawText: string;
  status: string;
  confidenceScore: number;
  successCount: number;
  failCount: number;
  revealCount: number;
  expiresAt: string | null;
  createdAt: string;
  creator: { displayName: string | null; phone: string; trustScore: number };
  reports: { type: string }[];
}

const TABS = [
  { key: 'flagged',              label: '⚠ Flagged',    color: '#EF4444' },
  { key: 'pending_verification', label: '⏳ Pending',    color: '#F59E0B' },
  { key: 'verified',             label: '✓ Verified',    color: '#00C896' },
  { key: 'trending',             label: '📈 Trending',   color: '#3B82F6' },
  { key: 'expired',              label: '○ Expired',    color: '#555' },
  { key: 'rejected',             label: '✕ Rejected',    color: '#888' },
];

export default function AdminCouponsPage() {
  const router = useRouter();
  const [tab, setTab]         = useState('flagged');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [counts, setCounts]   = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const token = () => localStorage.getItem("dm_admin_token") || "";

  const fetchCoupons = useCallback(async (status: string) => {
    const t = token();
    if (!t) { router.push("/login"); return; }
    setLoading(true);
    const res = await fetch(`http://localhost:4001/api/admin/coupons?status=${status}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    const data = await res.json();
    setCoupons(data.coupons || []);
    setCounts(data.counts || {});
    setLoading(false);
  }, [router]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchCoupons drives loading/data state on mount and tab change
  useEffect(() => { fetchCoupons(tab); }, [fetchCoupons, tab]);

  const handleOverride = async (id: string, status: string) => {
    await fetch(`http://localhost:4001/api/admin/coupons/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ status }),
    });
    fetchCoupons(tab);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this coupon?")) return;
    await fetch(`http://localhost:4001/api/admin/coupons/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    });
    fetchCoupons(tab);
  };

  const confColor = (score: number) => score >= 70 ? "#00C896" : score >= 40 ? "#F59E0B" : "#EF4444";

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />
      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", marginBottom: "4px" }}>Coupon Moderation</h1>
        <p style={{ fontSize: "13px", color: "#555", marginBottom: "24px" }}>Review flagged coupons and manage the lifecycle</p>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px", flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                backgroundColor: tab === t.key ? `${t.color}20` : "#161616",
                color: tab === t.key ? t.color : "#888",
                border: `1px solid ${tab === t.key ? t.color + '40' : '#2A2A2A'}`,
                borderRadius: "10px", padding: "8px 14px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
              }}
            >
              {t.label} {counts[t.key] ? `(${counts[t.key]})` : ''}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "#555", fontSize: "13px" }}>Loading...</p>
        ) : coupons.length === 0 ? (
          <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "12px", padding: "32px", textAlign: "center" }}>
            <p style={{ color: "#555", fontSize: "13px" }}>No coupons in this category.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {coupons.map(c => (
              <div key={c.id} style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "14px", padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 800, color: "#fff", letterSpacing: "1px" }}>{c.code}</span>
                      <span style={{ backgroundColor: `${confColor(c.confidenceScore)}15`, color: confColor(c.confidenceScore), fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px" }}>
                        {c.confidenceScore}%
                      </span>
                    </div>
                    <p style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>{c.rawText}</p>
                    <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "#555", flexWrap: "wrap" }}>
                      <span>👤 {c.creator.displayName || c.creator.phone}</span>
                      <span>✓ {c.successCount} worked</span>
                      <span>✗ {c.failCount} failed</span>
                      <span>👁 {c.revealCount} revealed</span>
                      {c.expiresAt && <span>⏱ Expires {new Date(c.expiresAt).toLocaleDateString("en-IN")}</span>}
                    </div>
                  </div>

                  {/* Moderator actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "120px" }}>
                    {tab === 'flagged' && (
                      <>
                        <button onClick={() => handleOverride(c.id, 'pending_verification')} style={{ backgroundColor: "#00C89620", color: "#00C896", border: "1px solid #00C89640", borderRadius: "8px", padding: "6px", fontSize: "12px", cursor: "pointer" }}>
                          Restore
                        </button>
                        <button onClick={() => handleOverride(c.id, 'rejected')} style={{ backgroundColor: "#EF444420", color: "#EF4444", border: "1px solid #EF444440", borderRadius: "8px", padding: "6px", fontSize: "12px", cursor: "pointer" }}>
                          Confirm Reject
                        </button>
                      </>
                    )}
                    {tab !== 'flagged' && tab !== 'rejected' && (
                      <button onClick={() => handleOverride(c.id, 'rejected')} style={{ backgroundColor: "#1E1E1E", color: "#888", border: "1px solid #2A2A2A", borderRadius: "8px", padding: "6px", fontSize: "12px", cursor: "pointer" }}>
                        Reject
                      </button>
                    )}
                    <button onClick={() => handleDelete(c.id)} style={{ backgroundColor: "transparent", color: "#555", border: "none", fontSize: "11px", cursor: "pointer" }}>
                      🗑 Delete permanently
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}