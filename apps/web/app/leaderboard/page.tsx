"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";

interface LeaderboardEntry {
  rank: number;
  displayName: string;
  level: string;
  levelNumber: number;
  accuracyPct: number;
  savingsGenerated: number;
  couponsSubmitted: number;
  badges: { icon: string; name: string }[];
}

const LEVEL_COLORS: Record<number, string> = {
  1: "#888", 2: "#3B82F6", 3: "#8B5CF6", 4: "#00C896", 5: "#FFD700",
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/leaderboard", { auth: false })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => setEntries(d.leaderboard || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  const medal = (rank: number) => rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 20px" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#fff", marginBottom: "6px" }}>
        🏆 Community Leaderboard
      </h1>
      <p style={{ fontSize: "14px", color: "#666", marginBottom: "28px" }}>
        Ranked by total savings generated for the community through verified coupons
      </p>

      {loading ? (
        <p style={{ color: "#555", fontSize: "13px" }}>Loading leaderboard...</p>
      ) : entries.length === 0 ? (
        <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "16px", padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "14px" }}>🏆</div>
          <p style={{ color: "#555", fontSize: "14px" }}>No rankings yet — be the first to submit a verified coupon!</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {entries.map(e => {
            const color = LEVEL_COLORS[e.levelNumber] || "#888";
            return (
              <div key={e.rank} style={{ backgroundColor: "#161616", border: `1px solid ${e.rank <= 3 ? color + '40' : '#2A2A2A'}`, borderRadius: "14px", padding: "16px 18px", display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ fontSize: e.rank <= 3 ? "24px" : "16px", fontWeight: 800, color: e.rank <= 3 ? "#FFD700" : "#555", minWidth: "40px" }}>
                  {medal(e.rank)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{e.displayName}</span>
                    <span style={{ backgroundColor: `${color}20`, color, fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px" }}>
                      {e.level}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "10px", fontSize: "11px", color: "#555", flexWrap: "wrap" }}>
                    <span>{e.couponsSubmitted} coupons</span>
                    <span>{e.accuracyPct}% accuracy</span>
                    {e.badges.slice(0, 3).map((b, i) => <span key={i} title={b.name}>{b.icon}</span>)}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: "#00C896" }}>
                    ₹{e.savingsGenerated.toLocaleString("en-IN")}
                  </div>
                  <div style={{ fontSize: "10px", color: "#555" }}>saved for community</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
