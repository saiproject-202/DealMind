"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/layout/AdminSidebar";

interface ChannelStats {
  totalPosts: number;
  validUrlPct: number | null;
  invalidUrlPct: number | null;
  affiliateConversionPct: number | null;
  approvalPct: number | null;
  rejectionPct: number | null;
  productsCreated: number;
}
interface Channel {
  id: string;
  channelUsername: string;
  displayName: string | null;
  isTrusted: boolean;
  isActive: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  autoApproveDisabledReason: string | null;
  stats: ChannelStats;
}

export default function TelegramPage() {
  const router = useRouter();
  const [channels, setChannels]     = useState<Channel[]>([]);
  const [loading, setLoading]       = useState(true);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplay, setNewDisplay]  = useState("");
  const [historyLimit, setHistoryLimit] = useState(500);
  const [adding, setAdding]         = useState(false);
  const [msg, setMsg]               = useState("");
  const [syncingId, setSyncingId]   = useState<string | null>(null);

  const token = () => localStorage.getItem("dm_admin_token") || "";

  useEffect(() => {
    const t = token();
    if (!t) { router.push("/login"); return; }
    fetch("http://localhost:4001/api/admin/telegram/channels", {
      headers: { Authorization: `Bearer ${t}` },
    })
      .then((r) => r.json())
      .then((d) => { if (d.channels) setChannels(d.channels); })
      .finally(() => setLoading(false));
  }, [router]);

  const handleAdd = async () => {
    if (!newUsername.trim()) return;
    setAdding(true);
    const res = await fetch("http://localhost:4001/api/admin/telegram/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({
        channelUsername: newUsername.replace("@", "").trim(),
        displayName: newDisplay.trim() || undefined,
        historyLimit,
      }),
    });
    const data = await res.json();
    if (data.success) {
      const DEFAULT_STATS: ChannelStats = {
        totalPosts: 0, validUrlPct: null, invalidUrlPct: null,
        affiliateConversionPct: null, approvalPct: null, rejectionPct: null, productsCreated: 0,
      };
      setChannels((prev) => [...prev, { ...data.channel, stats: data.channel.stats ?? DEFAULT_STATS }]);
      setNewUsername("");
      setNewDisplay("");
      setMsg(
        data.joinWarning
          ? `⚠️ ${data.joinWarning}`
          : `✅ Channel added and joined! Importing up to ${historyLimit} past messages in the background — check back shortly.`
      );
    } else {
      setMsg("❌ " + (data.error || "Failed to add."));
    }
    setAdding(false);
    setTimeout(() => setMsg(""), 3000);
  };

  // Every mutating call below used to check `data.success` with no fallback —
  // an expired session (or any other failure) returns { error: "..." } with
  // no `success` field, so the check silently failed and nothing visibly
  // happened: no error, no redirect, just a button that looked broken.
  const showError = (data: { error?: string } | null | undefined, fallback: string) => {
    setMsg(`❌ ${data?.error || fallback}`);
    setTimeout(() => setMsg(""), 5000);
  };
  const isSessionExpired = (res: Response) => {
    if (res.status === 401) { router.push("/login"); return true; }
    return false;
  };

  const handleToggle = async (id: string, field: "isActive" | "isTrusted", current: boolean) => {
    const res = await fetch(`http://localhost:4001/api/admin/telegram/channels/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ [field]: !current }),
    });
    if (isSessionExpired(res)) return;
    const data = await res.json();
    if (data.success) {
      setChannels((prev) => prev.map((c) => c.id === id ? { ...c, [field]: !current } : c));
    } else {
      showError(data, "Failed to update channel.");
    }
  };

  const handleSyncHistory = async (id: string, limit: number) => {
    setSyncingId(id);
    const res = await fetch(`http://localhost:4001/api/admin/telegram/channels/${id}/sync-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ limit }),
    });
    if (isSessionExpired(res)) { setSyncingId(null); return; }
    const data = await res.json();
    setMsg(data.success ? `✅ ${data.message}` : `❌ ${data.error || "Failed to start sync."}`);
    setSyncingId(null);
    setTimeout(() => setMsg(""), 5000);
  };

  const handleToggleAutoApproval = async (id: string, enabled: boolean) => {
    const res = await fetch(`http://localhost:4001/api/admin/telegram/channels/${id}/auto-approval`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ enabled }),
    });
    if (isSessionExpired(res)) return;
    const data = await res.json();
    if (data.success) {
      setChannels((prev) => prev.map((c) => c.id === id ? { ...c, autoApproveDisabledReason: data.channel.autoApproveDisabledReason } : c));
    } else {
      showError(data, "Failed to update auto-approval.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this channel?")) return;
    const res = await fetch(`http://localhost:4001/api/admin/telegram/channels/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (isSessionExpired(res)) return;
    const data = await res.json();
    if (data.success) {
      setChannels((prev) => prev.filter((c) => c.id !== id));
    } else {
      showError(data, "Failed to delete channel.");
    }
  };

  const pill = (active: boolean, label: string, color: string) => (
    <span style={{
      backgroundColor: active ? `${color}20` : "#1E1E1E",
      color: active ? color : "#555",
      border: `1px solid ${active ? `${color}40` : "#2A2A2A"}`,
      fontSize: "11px", fontWeight: 600, padding: "3px 9px", borderRadius: "6px",
    }}>
      {label}
    </span>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />
      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>

        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", marginBottom: "4px" }}>Telegram Channels</h1>
        <p style={{ fontSize: "13px", color: "#555", marginBottom: "28px" }}>
          Add trusted deal channels — DealMind AI will monitor them and extract deals automatically
        </p>

        {/* Info card */}
        <div style={{
          background: "linear-gradient(135deg, #3B82F610, #3B82F605)",
          border: "1px solid #3B82F630", borderRadius: "16px", padding: "20px", marginBottom: "28px",
        }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <span style={{ fontSize: "24px" }}>📱</span>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>How it works</div>
              <div style={{ fontSize: "12px", color: "#666", lineHeight: "1.6" }}>
                Add any public Telegram deal channel. When a new post appears, our AI reads it, extracts the product details, generates an affiliate link, and sends it to the approval queue. Trusted channels with high confidence scores can be auto-approved.
              </div>
              <div style={{ marginTop: "10px", fontSize: "12px", color: "#3B82F6" }}>
                Good channels to start: @deals_india, @flipkart_deals, @amazon_india_deals
              </div>
            </div>
          </div>
        </div>

        {/* Add new channel */}
        <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "16px", padding: "24px", marginBottom: "28px" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "16px" }}>Add Channel</h2>

          {msg && (
            <div style={{
              backgroundColor: msg.startsWith("✅") ? "#00C89615" : "#EF444415",
              border: `1px solid ${msg.startsWith("✅") ? "#00C89630" : "#EF444430"}`,
              borderRadius: "8px", padding: "8px 12px", marginBottom: "14px",
              fontSize: "12px", color: msg.startsWith("✅") ? "#00C896" : "#F87171",
            }}>
              {msg}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px", alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#666", marginBottom: "5px", fontWeight: 600 }}>
                CHANNEL USERNAME *
              </label>
              <input
                placeholder="@deals_india or deals_india"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                style={{ width: "100%", backgroundColor: "#1E1E1E", border: "1px solid #2A2A2A", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: "#fff", outline: "none" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#666", marginBottom: "5px", fontWeight: 600 }}>
                DISPLAY NAME
              </label>
              <input
                placeholder="e.g. Flipkart Deals India"
                value={newDisplay}
                onChange={(e) => setNewDisplay(e.target.value)}
                style={{ width: "100%", backgroundColor: "#1E1E1E", border: "1px solid #2A2A2A", borderRadius: "10px", padding: "10px 12px", fontSize: "13px", color: "#fff", outline: "none" }}
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={adding}
              style={{
                backgroundColor: adding ? "#1E1E1E" : "#00C896",
                color: adding ? "#555" : "#000",
                border: "none", borderRadius: "10px",
                padding: "10px 20px", fontSize: "13px", fontWeight: 700,
                cursor: adding ? "not-allowed" : "pointer", whiteSpace: "nowrap",
              }}
            >
              {adding ? "Adding..." : "+ Add"}
            </button>
          </div>

          <div style={{ marginTop: "14px" }}>
            <label style={{ display: "block", fontSize: "11px", color: "#666", marginBottom: "6px", fontWeight: 600 }}>
              HISTORICAL SYNC — import past messages on add
            </label>
            <div style={{ display: "flex", gap: "6px" }}>
              {[100, 500, 1000, 5000].map((n) => (
                <button
                  key={n}
                  onClick={() => setHistoryLimit(n)}
                  style={{
                    backgroundColor: historyLimit === n ? "#00C89620" : "#1E1E1E",
                    color: historyLimit === n ? "#00C896" : "#666",
                    border: `1px solid ${historyLimit === n ? "#00C89650" : "#2A2A2A"}`,
                    borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {n === 5000 ? "Entire channel" : `Last ${n}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Channels list */}
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "14px" }}>
          {channels.length} channel{channels.length !== 1 ? "s" : ""} configured
        </h2>

        {loading ? (
          <p style={{ color: "#555", fontSize: "13px" }}>Loading channels...</p>
        ) : channels.length === 0 ? (
          <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "12px", padding: "32px", textAlign: "center" }}>
            <p style={{ color: "#555", fontSize: "13px" }}>No channels added yet. Add your first Telegram deal channel above.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {channels.map((ch) => (
              <div
                key={ch.id}
                style={{
                  backgroundColor: "#161616",
                  border: `1px solid ${ch.isActive ? "#2A2A2A" : "#1E1E1E"}`,
                  borderRadius: "12px", padding: "16px 20px",
                  opacity: ch.isActive ? 1 : 0.5,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", rowGap: "10px" }}>
                  {/* Channel icon */}
                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "#3B82F620", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>
                    📢
                  </div>

                  {/* Info */}
                  <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ch.displayName || `@${ch.channelUsername}`}
                    </div>
                    {ch.displayName && (
                      <div style={{ fontSize: "12px", color: "#555", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>@{ch.channelUsername}</div>
                    )}
                  </div>

                  {/* Actions — own flex line so it never squeezes the name above; badges live here too */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, marginLeft: "auto", flexBasis: "100%", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    {pill(ch.isActive, ch.isActive ? "Active" : "Inactive", "#00C896")}
                    {pill(ch.isTrusted, ch.isTrusted ? "Trusted" : "Not trusted", "#F59E0B")}
                    <button
                      onClick={() => handleSyncHistory(ch.id, 500)}
                      disabled={syncingId === ch.id}
                      title={`Import the last 500 messages from this channel through the same AI pipeline as live posts${ch.lastSyncedAt ? ` — last synced ${new Date(ch.lastSyncedAt).toLocaleDateString("en-IN")}` : ""}`}
                      style={{ backgroundColor: "#1E1E1E", color: syncingId === ch.id ? "#555" : "#3B82F6", border: `1px solid ${syncingId === ch.id ? "#2A2A2A" : "#3B82F630"}`, borderRadius: "8px", padding: "5px 10px", fontSize: "11px", cursor: syncingId === ch.id ? "not-allowed" : "pointer" }}
                    >
                      {syncingId === ch.id ? "Starting..." : "📜 Sync History"}
                    </button>
                    <button
                      onClick={() => handleToggle(ch.id, "isActive", ch.isActive)}
                      style={{ backgroundColor: "#1E1E1E", color: ch.isActive ? "#EF4444" : "#00C896", border: `1px solid ${ch.isActive ? "#EF444430" : "#00C89630"}`, borderRadius: "8px", padding: "5px 10px", fontSize: "11px", cursor: "pointer" }}
                    >
                      {ch.isActive ? "Pause" : "Activate"}
                    </button>
                    <button
                      onClick={() => handleToggle(ch.id, "isTrusted", ch.isTrusted)}
                      style={{ backgroundColor: "#1E1E1E", color: ch.isTrusted ? "#555" : "#F59E0B", border: `1px solid ${ch.isTrusted ? "#2A2A2A" : "#F59E0B30"}`, borderRadius: "8px", padding: "5px 10px", fontSize: "11px", cursor: "pointer" }}
                    >
                      {ch.isTrusted ? "Untrust" : "Trust"}
                    </button>
                    <button
                      onClick={() => handleDelete(ch.id)}
                      style={{ backgroundColor: "transparent", color: "#555", border: "none", fontSize: "14px", cursor: "pointer", padding: "5px" }}
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {/* Quality metrics — computed live from real post/deal data */}
                {(ch.stats?.totalPosts ?? 0) > 0 && (
                  <div style={{ display: "flex", gap: "16px", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #1E1E1E", fontSize: "11px", color: "#666", flexWrap: "wrap" }}>
                    <span>{ch.stats.totalPosts} posts</span>
                    {ch.stats.validUrlPct !== null && (
                      <span style={{ color: ch.stats.validUrlPct >= 50 ? "#00C896" : "#F87171" }}>
                        {ch.stats.validUrlPct}% valid URLs
                      </span>
                    )}
                    {ch.stats.approvalPct !== null && <span>{ch.stats.approvalPct}% approved</span>}
                    {ch.stats.rejectionPct !== null && <span>{ch.stats.rejectionPct}% rejected</span>}
                    {ch.stats.affiliateConversionPct !== null && (
                      <span>{ch.stats.affiliateConversionPct}% affiliate-converted</span>
                    )}
                    <span>{ch.stats.productsCreated} products created</span>
                  </div>
                )}

                {/* Auto-approval pause status */}
                {ch.autoApproveDisabledReason && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
                    marginTop: "10px", backgroundColor: "#F59E0B10", border: "1px solid #F59E0B30",
                    borderRadius: "8px", padding: "8px 12px",
                  }}>
                    <span style={{ fontSize: "11px", color: "#F59E0B" }}>
                      ⛔ Auto-approval paused: {ch.autoApproveDisabledReason} — posts still import and queue for manual review.
                    </span>
                    <button
                      onClick={() => handleToggleAutoApproval(ch.id, true)}
                      style={{ backgroundColor: "#F59E0B20", color: "#F59E0B", border: "1px solid #F59E0B40", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
                    >
                      Re-enable
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}