"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/layout/AdminSidebar";

interface User {
  id: string;
  phone: string;
  displayName: string | null;
  points: number;
  trustScore: number;
  isVerified: boolean;
  createdAt: string;
  level: { name: string; levelNumber: number } | null;
  _count: { deals: number; cartnotes: number };
}

export default function UsersPage() {
  const router   = useRouter();
  const [users, setUsers]   = useState<User[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const token = () => localStorage.getItem("dm_admin_token") || "";

  const fetchUsers = useCallback(async (p = 1) => {
    const t = token();
    if (!t) { router.push("/login"); return; }
    setLoading(true);
    const res = await fetch(`http://localhost:4001/api/admin/users?page=${p}&limit=20`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    const data = await res.json();
    if (data.users) { setUsers(data.users); setTotal(data.total); }
    setLoading(false);
  }, [router]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchUsers drives loading/data state on mount and page change
  useEffect(() => { fetchUsers(page); }, [fetchUsers, page]);

  const filtered = users.filter(u =>
    u.phone.includes(search) || (u.displayName || "").toLowerCase().includes(search.toLowerCase())
  );

  const maskPhone = (p: string) => p.length > 4 ? `${p.slice(0, 3)}****${p.slice(-3)}` : p;

  const levelColor = (n: number) =>
    n >= 6 ? "#FFD700" : n >= 4 ? "#00C896" : n >= 2 ? "#3B82F6" : "#555";

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />
      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", marginBottom: "4px" }}>Users</h1>
        <p style={{ fontSize: "13px", color: "#555", marginBottom: "24px" }}>
          {total.toLocaleString("en-IN")} registered users
        </p>

        {/* Search */}
        <div style={{ marginBottom: "20px", maxWidth: "360px" }}>
          <input
            placeholder="Search by phone or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", color: "#fff", outline: "none" }}
          />
        </div>

        {/* Table */}
        {loading ? (
          <p style={{ color: "#555", fontSize: "13px" }}>Loading users...</p>
        ) : (
          <>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr", gap: "8px", padding: "8px 14px", marginBottom: "6px" }}>
              {["User", "Joined", "Points", "Trust", "Level", "Deals", "CartNotes"].map(h => (
                <div key={h} style={{ fontSize: "11px", color: "#555", fontWeight: 600 }}>{h.toUpperCase()}</div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {filtered.map(user => (
                <div
                  key={user.id}
                  style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr", gap: "8px", backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "10px", padding: "12px 14px", alignItems: "center" }}
                >
                  {/* User */}
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                      {user.displayName || maskPhone(user.phone)}
                    </div>
                    {user.displayName && (
                      <div style={{ fontSize: "11px", color: "#555" }}>{maskPhone(user.phone)}</div>
                    )}
                  </div>
                  {/* Joined */}
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    {new Date(user.createdAt).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"2-digit" })}
                  </div>
                  {/* Points */}
                  <div style={{ fontSize: "13px", color: "#00C896", fontWeight: 600 }}>{user.points}</div>
                  {/* Trust */}
                  <div>
                    <div style={{ width: "100%", height: "5px", backgroundColor: "#2A2A2A", borderRadius: "3px" }}>
                      <div style={{ width: `${Number(user.trustScore) * 100}%`, height: "100%", backgroundColor: "#00C896", borderRadius: "3px" }} />
                    </div>
                    <div style={{ fontSize: "10px", color: "#555", marginTop: "2px" }}>
                      {(isNaN(Number(user.trustScore)) ? 0 : Number(user.trustScore) * 100).toFixed(0)}%
                    </div>
                  </div>
                  {/* Level */}
                  <div style={{ fontSize: "11px", fontWeight: 700, color: levelColor(user.level?.levelNumber || 1) }}>
                    {user.level?.name || "Explorer"}
                  </div>
                  {/* Deals */}
                  <div style={{ fontSize: "12px", color: "#888" }}>{user._count.deals}</div>
                  {/* CartNotes */}
                  <div style={{ fontSize: "12px", color: "#888" }}>{user._count.cartnotes}</div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {total > 20 && (
              <div style={{ display: "flex", gap: "8px", marginTop: "20px", alignItems: "center" }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{ backgroundColor: "#161616", color: page === 1 ? "#444" : "#888", border: "1px solid #2A2A2A", borderRadius: "8px", padding: "7px 14px", fontSize: "12px", cursor: page === 1 ? "not-allowed" : "pointer" }}
                >
                  ← Prev
                </button>
                <span style={{ fontSize: "12px", color: "#555" }}>
                  Page {page} of {Math.ceil(total / 20)}
                </span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= Math.ceil(total / 20)}
                  style={{ backgroundColor: "#161616", color: "#888", border: "1px solid #2A2A2A", borderRadius: "8px", padding: "7px 14px", fontSize: "12px", cursor: "pointer" }}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}