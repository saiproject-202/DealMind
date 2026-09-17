"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminSidebar from "@/components/layout/AdminSidebar";

interface Stats {
  totalUsers: number;
  totalProducts: number;
  totalDeals: number;
  pendingQueue: number;
  totalClicks: number;
  totalRevenue: number;
  liveOnHomepage: number;
}

const STAT_CARDS = (s: Stats) => [
  {
    label: "Total Users",
    value: s.totalUsers.toLocaleString("en-IN"),
    icon: "👥",
    color: "#3B82F6",
  },
  {
    label: "Total Products",
    value: s.totalProducts.toLocaleString("en-IN"),
    icon: "📦",
    color: "#8B5CF6",
  },
  {
    label: "Live Deals",
    value: s.liveOnHomepage.toLocaleString("en-IN"),
    icon: "🔥",
    color: "#EF4444",
    // What a customer sees on the homepage right now — click through to
    // see exactly which products those are and why each one qualifies.
    href: "/live-deals",
  },
  {
    label: "Pending Approval",
    value: s.pendingQueue.toLocaleString("en-IN"),
    icon: "⏳",
    color: "#F59E0B",
  },
  {
    label: "Affiliate Clicks",
    value: s.totalClicks.toLocaleString("en-IN"),
    icon: "👆",
    color: "#10B981",
  },
  {
    label: "Revenue (₹)",
    value: `₹${s.totalRevenue.toLocaleString("en-IN")}`,
    icon: "💰",
    color: "#00C896",
  },
];

export default function DashboardPage() {
  const router = useRouter();

  const admin =
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("dm_admin") || "null")
      : null;

  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalProducts: 0,
    totalDeals: 0,
    pendingQueue: 0,
    totalClicks: 0,
    totalRevenue: 0,
    liveOnHomepage: 0,
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("dm_admin_token");

    if (!token) {
      router.push("/login");
      return;
    }

    fetch("http://localhost:4001/api/admin/stats", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.stats) {
          setStats(data.stats);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <div style={{ color: "#555", fontSize: "14px" }}>
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />

      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>
        <div style={{ marginBottom: "32px" }}>
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 800,
              color: "#fff",
              marginBottom: "4px",
            }}
          >
            Dashboard
          </h1>

          <p style={{ fontSize: "13px", color: "#555" }}>
            Welcome back,{" "}
            <span style={{ color: "#00C896" }}>{admin?.email}</span>

            <span
              style={{
                marginLeft: "8px",
                backgroundColor: "#00C89615",
                color: "#00C896",
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "6px",
              }}
            >
              {admin?.role?.toUpperCase()}
            </span>
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "40px",
          }}
        >
          {STAT_CARDS(stats).map((card, i) => {
            const cardStyle: React.CSSProperties = {
              backgroundColor: "#161616",
              border: "1px solid #2A2A2A",
              borderRadius: "16px",
              padding: "20px",
              display: "block",
              textDecoration: "none",
              cursor: card.href ? "pointer" : "default",
            };
            const content = (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "12px",
                  }}
                >
                  <span style={{ fontSize: "22px" }}>{card.icon}</span>

                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: card.color,
                    }}
                  />
                </div>

                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 800,
                    color: "#fff",
                    marginBottom: "4px",
                  }}
                >
                  {card.value}
                </div>

                <div style={{ fontSize: "12px", color: "#555" }}>
                  {card.label}
                </div>
              </>
            );
            return card.href ? (
              <Link key={i} href={card.href} style={cardStyle}>{content}</Link>
            ) : (
              <div key={i} style={cardStyle}>{content}</div>
            );
          })}
        </div>
      </main>
    </div>
  );
}