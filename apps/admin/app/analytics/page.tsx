"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/layout/AdminSidebar";

interface Stats {
  totalClicks: number;
  todayClicks: number;
  topListings: { listingId: string; clicks: number; product: string; store: string }[];
}

const STORE_COLORS: Record<string, string> = {
  Amazon: "#FF9900", Flipkart: "#2874F0", Myntra: "#FF3F6C",
  Meesho: "#A020F0", AJIO: "#00A86B",
};

export default function AnalyticsPage() {
  const router = useRouter();
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("dm_admin_token");
    if (!t) { router.push("/login"); return; }

    fetch("http://localhost:4001/api/affiliate/stats", {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [router]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />
      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", marginBottom: "4px" }}>Revenue & Analytics</h1>
        <p style={{ fontSize: "13px", color: "#555", marginBottom: "28px" }}>
          Affiliate click tracking — actual commission is shown in your EarnKaro dashboard
        </p>

        {/* How commission works */}
        <div style={{ backgroundColor: "#161616", border: "1px solid #00C89630", borderRadius: "16px", padding: "20px", marginBottom: "28px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "12px" }}>💡 How you earn</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
            {[
              { step:"1", label:"User clicks View Deal",       note:"Logged here",              color:"#555"    },
              { step:"2", label:"User buys on Amazon/Flipkart",note:"via your EarnKaro link",   color:"#3B82F6" },
              { step:"3", label:"Return window passes (7–30d)",note:"Order confirmed",           color:"#F59E0B" },
              { step:"4", label:"Commission in EarnKaro wallet",note:"Withdraw via UPI",         color:"#00C896" },
            ].map(s => (
              <div key={s.step} style={{ backgroundColor: "#1E1E1E", borderRadius: "12px", padding: "14px", border: `1px solid ${s.color}30` }}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: s.color, marginBottom: "6px" }}>{s.step}</div>
                <div style={{ fontSize: "12px", color: "#fff", fontWeight: 600, marginBottom: "3px" }}>{s.label}</div>
                <div style={{ fontSize: "11px", color: "#555" }}>{s.note}</div>
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <p style={{ color: "#555", fontSize: "13px" }}>Loading stats...</p>
        ) : !stats ? (
          <p style={{ color: "#555", fontSize: "13px" }}>Could not load stats — check API connection.</p>
        ) : (
          <>
            {/* Click stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "28px" }}>
              {[
                { label:"Total clicks",  value: stats.totalClicks.toLocaleString("en-IN"), color:"#3B82F6", note:"All time"    },
                { label:"Today's clicks",value: stats.todayClicks.toLocaleString("en-IN"), color:"#00C896", note:"Since midnight" },
                { label:"Tracked stores",value: "—",                                        color:"#F59E0B", note:"Check EarnKaro for ₹₹₹" },
              ].map((card, i) => (
                <div key={i} style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "14px", padding: "20px" }}>
                  <div style={{ fontSize: "26px", fontWeight: 800, color: card.color, marginBottom: "4px" }}>{card.value}</div>
                  <div style={{ fontSize: "13px", color: "#fff", fontWeight: 600 }}>{card.label}</div>
                  <div style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}>{card.note}</div>
                </div>
              ))}
            </div>

            {/* EarnKaro link */}
            <div style={{ backgroundColor: "#161616", border: "1px solid #F59E0B30", borderRadius: "14px", padding: "18px 20px", marginBottom: "28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>💰 View your actual earnings</div>
                <div style={{ fontSize: "12px", color: "#666", marginTop: "3px" }}>Confirmed commissions, pending orders, and withdrawal options are on EarnKaro</div>
              </div>
              <a
                href="https://earnkaro.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                style={{ backgroundColor: "#F59E0B", color: "#000", padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
              >
                Open EarnKaro →
              </a>
            </div>

            {/* Top clicked products */}
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "14px" }}>
              Top clicked products
            </h2>
            {stats.topListings.length === 0 ? (
              <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "12px", padding: "32px", textAlign: "center" }}>
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>📊</div>
                <p style={{ color: "#555", fontSize: "13px" }}>No clicks yet — add real products and share your links to start tracking!</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {stats.topListings.map((item, i) => (
                  <div key={item.listingId} style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "12px", padding: "14px 18px", display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{ width: "28px", height: "28px", borderRadius: "8px", backgroundColor: "#1E1E1E", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: i === 0 ? "#FFD700" : "#555", flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.product}
                      </div>
                    </div>
                    <span style={{ backgroundColor: `${STORE_COLORS[item.store] || "#555"}15`, color: STORE_COLORS[item.store] || "#555", fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px", flexShrink: 0 }}>
                      {item.store}
                    </span>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#00C896", flexShrink: 0 }}>
                      {item.clicks} clicks
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Commission rates reference */}
            <div style={{ marginTop: "28px", backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "14px", padding: "20px" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "14px" }}>📋 Typical commission rates</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px" }}>
                {[
                  { store:"Amazon",   rate:"1–6%",  color:"#FF9900" },
                  { store:"Flipkart", rate:"2–8%",  color:"#2874F0" },
                  { store:"Myntra",   rate:"5–10%", color:"#FF3F6C" },
                  { store:"Meesho",   rate:"8–12%", color:"#A020F0" },
                  { store:"AJIO",     rate:"5–9%",  color:"#00A86B" },
                ].map(s => (
                  <div key={s.store} style={{ backgroundColor: "#1E1E1E", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: s.color }}>{s.store}</div>
                    <div style={{ fontSize: "14px", fontWeight: 800, color: "#fff", marginTop: "4px" }}>{s.rate}</div>
                    <div style={{ fontSize: "10px", color: "#555", marginTop: "2px" }}>commission</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "11px", color: "#444", marginTop: "12px" }}>
                Example: A ₹50,000 laptop on Amazon = ₹1,000–3,000 from a single click that converts. Rates vary by product category.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}