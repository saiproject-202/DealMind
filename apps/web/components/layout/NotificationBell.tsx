"use client";
import { useState, useEffect, useRef } from "react";
import { getToken } from "@/lib/auth";
import { apiFetch } from "@/lib/apiFetch";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const [open, setOpen]   = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard mounted-check to avoid SSR/CSR hydration mismatch
  useEffect(() => { setMounted(true); }, []);

  const fetchNotifications = () => {
    const token = getToken();
    if (!token) return;
    apiFetch("/api/notifications")
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { setItems(d.notifications || []); setUnread(d.unreadCount || 0); })
      .catch(() => {/* transient failure — keep last known state, try again next poll */})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // poll every 60s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    await apiFetch("/api/notifications/read-all", {
        method:"PUT",
    });
    setItems(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnread(0);
  };

  const handleClick = async (n: Notification) => {
    if (!n.isRead) {
      await apiFetch(`/api/notifications/${n.id}/read`, {
          method:"PUT",
      });
      setItems(prev => prev.map(i => i.id === n.id ? { ...i, isRead: true } : i));
      setUnread(prev => Math.max(0, prev - 1));
    }
  }; 

  const typeIcon = (type: string) =>
    type === 'cartnote_match' ? '🎯' : type === 'cartnote_expired' ? '📋' : '🔔';

  const timeAgo = (date: string) => {
    // eslint-disable-next-line react-hooks/purity -- relative time display is inherently time-dependent
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  if (!mounted || !getToken()) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        title="Notifications"
        style={{
          width: "36px", height: "36px", borderRadius: "10px",
          backgroundColor: "#1E1E1E", border: "1px solid #2A2A2A",
          color: "#888", fontSize: "16px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}
      >
        🔔
        {unread > 0 && (
          <div style={{
            position: "absolute", top: "-3px", right: "-3px",
            width: "16px", height: "16px", borderRadius: "50%",
            backgroundColor: "#EF4444", color: "#fff", fontSize: "9px",
            fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid #0D0D0D",
          }}>
            {unread > 9 ? "9+" : unread}
          </div>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: "44px", width: "340px", maxHeight: "440px",
          backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "14px",
          overflow: "hidden", zIndex: 200, boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #2A2A2A", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Notifications</span>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} style={{ background: "none", border: "none", color: "#00C896", fontSize: "11px", cursor: "pointer" }}>
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading ? (
              <p style={{ padding: "20px", fontSize: "12px", color: "#555", textAlign: "center" }}>Loading...</p>
            ) : items.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center" }}>
                <div style={{ fontSize: "28px", marginBottom: "8px" }}>🔔</div>
                <p style={{ fontSize: "12px", color: "#555" }}>No notifications yet</p>
              </div>
            ) : (
              items.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #1E1E1E",
                    backgroundColor: n.isRead ? "transparent" : "#00C89608",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", gap: "10px" }}>
                    <span style={{ fontSize: "16px", flexShrink: 0 }}>{typeIcon(n.type)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: n.isRead ? 500 : 700, color: "#fff", marginBottom: "3px" }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: "11px", color: "#888", lineHeight: "1.4" }}>
                        {n.body}
                      </div>
                      <div style={{ fontSize: "10px", color: "#444", marginTop: "4px" }}>
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>
                    {!n.isRead && (
                      <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#00C896", flexShrink: 0, marginTop: "4px" }} />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}