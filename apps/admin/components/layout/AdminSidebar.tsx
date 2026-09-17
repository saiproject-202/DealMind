"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/dashboard",         icon: "📊", label: "Dashboard"         },
  { href: "/stores",            icon: "🏪", label: "Stores & Affiliate"},
  { href: "/products",          icon: "📦", label: "Products"          },
  { href: "/products/add",      icon: "➕", label: "Add Product"       },
  { href: "/queue",             icon: "⏳", label: "Approval Queue"    },
  { href: "/telegram",          icon: "📱", label: "Telegram Channels" },
  { href: "/users",             icon: "👥", label: "Users"             },
  { href: "/analytics",         icon: "💰", label: "Revenue"           },
  { href: "/conversions",       icon: "🔗", label: "Conversions"       },
  { href: "/coupons",           icon: "🎟",  label: "Coupons"           },
];

const STORAGE_KEY = "dm_admin_sidebar_collapsed";

export default function AdminSidebar() {
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing collapsed state from localStorage on mount
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  };

  const handleLogout = () => {
    localStorage.removeItem("dm_admin_token");
    localStorage.removeItem("dm_admin");
    router.push("/login");
  };

  return (
    <aside
      style={{
        width: collapsed ? "68px" : "220px",
        height: "100vh",
        position: "sticky",
        top: 0,
        backgroundColor: "#111111",
        borderRight: "1px solid #1E1E1E",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflowY: "hidden",
        transition: "width 0.15s",
      }}
    >
      {/* Logo — click the "D" icon to collapse/expand */}
      <div style={{ padding: collapsed ? "24px 12px" : "24px 20px", borderBottom: "1px solid #1E1E1E" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: "8px" }}>
          <button
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{ width:"32px", height:"32px", borderRadius:"8px", background:"#00C896", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"14px", color:"#000", flexShrink: 0, padding: 0 }}
          >
            D
          </button>
          {!collapsed && (
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize:"13px", fontWeight:700, color:"#fff", whiteSpace: "nowrap" }}>DealMind</div>
              <div style={{ fontSize:"10px", color:"#555", whiteSpace: "nowrap" }}>Admin Panel</div>
            </div>
          )}
        </div>
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: "12px 10px" }}>
        {NAV.map((item) => {
          const active = path === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: collapsed ? "center" : "flex-start",
                gap: "10px",
                padding: collapsed ? "10px" : "10px 12px",
                borderRadius: "10px",
                marginBottom: "2px",
                backgroundColor: active ? "#00C89615" : "transparent",
                color: active ? "#00C896" : "#666",
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: active ? 600 : 400,
                transition: "all 0.15s",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              <span style={{ fontSize: "15px", flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div style={{ padding: "12px 10px", borderTop: "1px solid #1E1E1E" }}>
        <button
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: "10px",
            padding: collapsed ? "10px" : "10px 12px",
            borderRadius: "10px",
            backgroundColor: "transparent",
            color: "#555",
            border: "none",
            fontSize: "13px",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span>🚪</span> {!collapsed && "Logout"}
        </button>
      </div>
    </aside>
  );
}
