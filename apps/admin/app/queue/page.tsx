"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/layout/AdminSidebar";

interface Extracted {
  name?: string;
  brand?: string;
  currentPrice?: number;
  originalPrice?: number;
  rating?: number;
  reviewCount?: number;
  description?: string;
  category?: string;
  store?: string;
}

interface Submission {
  id: string;
  submissionType: string;
  rawContent: string | null;
  aiExtracted: Extracted | null;
  confidenceScore: number | null;
  createdAt: string;
  user: { phone: string; displayName: string | null; points: number; trustScore: number } | null;
}

interface TelegramPost {
  id: string;
  rawText: string | null;
  aiExtracted: Extracted | null;
  confidenceScore: number | null;
  postedAt: string | null;
  channel: { channelUsername: string; displayName: string | null } | null;
}

interface QueueItem {
  id: string;
  queueType: string;
  referenceId: string;
  priority: number;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  submission: Submission | null;
  telegramPost: TelegramPost | null;
  deal: { id: string; title: string; listing: { currentPrice: number; store: { name: string } } } | null;
}

export default function QueuePage() {
  const router = useRouter();
  const [items, setItems]       = useState<QueueItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [msg, setMsg]           = useState("");
  const [sourceTab, setSourceTab]     = useState<"all" | "telegram" | "users">("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const token = () => localStorage.getItem("dm_admin_token") || "";

  const fetchQueue = useCallback(async () => {
    const t = token();
    if (!t) { router.push("/login"); return; }
    setLoading(true);
    const res = await fetch("http://localhost:4001/api/admin/queue", {
      headers: { Authorization: `Bearer ${t}` },
    });
    const data = await res.json();
    if (data.queue) setItems(data.queue);
    setLoading(false);
  }, [router]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchQueue drives loading/data state on mount
  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const handleApprove = async (id: string) => {
    setActionId(id);
    const res = await fetch(`http://localhost:4001/api/admin/queue/${id}/approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.success) {
      setMsg("✅ " + data.message);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      setMsg("❌ " + (data.error || "Approval failed."));
    }
    setActionId(null);
    setTimeout(() => setMsg(""), 3000);
  };

  const handleReject = async (id: string) => {
    setActionId(id);
    const res = await fetch(`http://localhost:4001/api/admin/queue/${id}/reject`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ reason: rejectNote }),
    });
    const data = await res.json();
    if (data.success) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setMsg("Deal rejected.");
    }
    setRejectId(null);
    setRejectNote("");
    setActionId(null);
    setTimeout(() => setMsg(""), 2000);
  };

  const conf = (score: number | null) => {
    if (!score) return { pct: 0, color: "#555" };
    const pct = Math.round(score * 100);
    const color = pct >= 88 ? "#00C896" : pct >= 70 ? "#F59E0B" : "#EF4444";
    return { pct, color };
  };

  const isTelegram = (i: QueueItem) => i.queueType === "telegram";
  const isUser = (i: QueueItem) => i.queueType === "deal";

  // Channels present in the current pending queue — drives the Telegram
  // sub-tabs so admins can jump straight to one channel's backlog.
  const telegramChannels = Array.from(
    new Set(items.filter(isTelegram).map((i) => i.telegramPost?.channel?.channelUsername).filter((c): c is string => !!c))
  ).sort();

  // The actual moment the deal happened — a Telegram post's postedAt (when
  // the channel published it) or a user submission's createdAt — not the
  // queue row's own createdAt, which only says when our worker processed
  // it and can lag the real event by hours to days.
  const eventTime = (item: QueueItem): string =>
    item.telegramPost?.postedAt || item.submission?.createdAt || item.createdAt;

  const extracted = (item: QueueItem): Extracted | null =>
    item.submission?.aiExtracted || item.telegramPost?.aiExtracted || null;

  // Store name for search: prefer the AI-extracted store field; if that's
  // missing, fall back to matching the raw URL's domain against the same
  // store list the extraction prompt itself uses.
  const DOMAIN_STORE_MAP: [RegExp, string][] = [
    [/amazon\.|amzn\./i, "Amazon"], [/flipkart\.|fkrt\./i, "Flipkart"],
    [/myntra\.|myntr\./i, "Myntra"], [/ajio\.|ajiio\./i, "AJIO"], [/meesho\./i, "Meesho"],
  ];
  const itemStore = (item: QueueItem): string => {
    const fromExtraction = extracted(item)?.store;
    if (fromExtraction) return fromExtraction;
    const url = item.submission?.rawContent || item.telegramPost?.rawText || "";
    const match = DOMAIN_STORE_MAP.find(([re]) => re.test(url));
    return match?.[1] || "";
  };

  const filtered = items.filter((item) => {
    if (sourceTab === "telegram") {
      if (!isTelegram(item)) return false;
      if (channelFilter !== "all" && item.telegramPost?.channel?.channelUsername !== channelFilter) return false;
    } else if (sourceTab === "users") {
      if (!isUser(item)) return false;
      if (phoneSearch.trim() && !(item.submission?.user?.phone || "").includes(phoneSearch.trim())) return false;
    }
    if (dateFrom || dateTo) {
      const t = new Date(eventTime(item)).getTime();
      if (dateFrom && t < new Date(dateFrom + "T00:00:00").getTime()) return false;
      if (dateTo && t > new Date(dateTo + "T23:59:59").getTime()) return false;
    }
    if (productSearch.trim()) {
      const q = productSearch.trim().toLowerCase();
      const name = (extracted(item)?.name || "").toLowerCase();
      const store = itemStore(item).toLowerCase();
      if (!name.includes(q) && !store.includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />
      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", marginBottom: "4px" }}>
              Approval Queue
            </h1>
            <p style={{ fontSize: "13px", color: "#555" }}>
              {items.length} pending — review and approve deals before they go live
            </p>
          </div>
          <button
            onClick={fetchQueue}
            style={{ backgroundColor: "#1E1E1E", color: "#888", border: "1px solid #2A2A2A", borderRadius: "10px", padding: "8px 16px", fontSize: "13px", cursor: "pointer" }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Flash message */}
        {msg && (
          <div style={{
            backgroundColor: msg.startsWith("✅") ? "#00C89615" : "#EF444415",
            border: `1px solid ${msg.startsWith("✅") ? "#00C89630" : "#EF444430"}`,
            borderRadius: "10px", padding: "12px 16px", marginBottom: "20px",
            fontSize: "13px", color: msg.startsWith("✅") ? "#00C896" : "#F87171",
          }}>
            {msg}
          </div>
        )}

        {/* Source tabs */}
        {!loading && items.length > 0 && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            {([
              { key: "all", label: "All", icon: "📋", count: items.length },
              { key: "telegram", label: "Telegram", icon: "📱", count: items.filter(isTelegram).length },
              { key: "users", label: "Users", icon: "👤", count: items.filter(isUser).length },
            ] as const).map((tab) => {
              const active = sourceTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => { setSourceTab(tab.key); setChannelFilter("all"); }}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    backgroundColor: active ? "#00C89620" : "#161616",
                    border: `1px solid ${active ? "#00C89660" : "#2A2A2A"}`,
                    borderRadius: "10px", padding: "8px 14px",
                    fontSize: "13px", fontWeight: 600,
                    color: active ? "#00C896" : "#888",
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  <span>{tab.icon}</span><span>{tab.label}</span>
                  <span style={{ fontSize: "11px", color: active ? "#00C89690" : "#555" }}>{tab.count}</span>
                </button>
              );
            })}

            {/* Search through date — filters by the real posted/submitted
                time (eventTime), not queue-processing time */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
              <input
                type="date"
                aria-label="From date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "10px",
                  padding: "7px 10px", fontSize: "12px", color: "#ccc", outline: "none",
                }}
              />
              <span style={{ fontSize: "12px", color: "#555" }}>to</span>
              <input
                type="date"
                aria-label="To date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "10px",
                  padding: "7px 10px", fontSize: "12px", color: "#ccc", outline: "none",
                }}
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  title="Clear date filter"
                  style={{ backgroundColor: "transparent", border: "1px solid #2A2A2A", borderRadius: "8px", color: "#666", fontSize: "12px", padding: "7px 10px", cursor: "pointer" }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* Search by product name or store — Amazon/Flipkart/Myntra/AJIO/Meesho */}
        {!loading && items.length > 0 && (
          <div style={{ marginBottom: "16px", maxWidth: "360px" }}>
            <input
              placeholder="Search by product name or store (Amazon, Flipkart, Myntra...)"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              style={{
                width: "100%", backgroundColor: "#161616",
                border: "1px solid #2A2A2A", borderRadius: "10px",
                padding: "9px 14px", fontSize: "13px", color: "#fff", outline: "none",
              }}
            />
          </div>
        )}

        {/* Telegram sub-tabs — per channel */}
        {!loading && sourceTab === "telegram" && telegramChannels.length > 0 && (
          <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
            <button
              onClick={() => setChannelFilter("all")}
              style={{
                backgroundColor: channelFilter === "all" ? "#3B82F620" : "#161616",
                border: `1px solid ${channelFilter === "all" ? "#3B82F660" : "#2A2A2A"}`,
                borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600,
                color: channelFilter === "all" ? "#60A5FA" : "#666", cursor: "pointer",
              }}
            >
              All channels
            </button>
            {telegramChannels.map((ch) => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                style={{
                  backgroundColor: channelFilter === ch ? "#3B82F620" : "#161616",
                  border: `1px solid ${channelFilter === ch ? "#3B82F660" : "#2A2A2A"}`,
                  borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 600,
                  color: channelFilter === ch ? "#60A5FA" : "#666", cursor: "pointer",
                }}
              >
                @{ch}
              </button>
            ))}
          </div>
        )}

        {/* Users tab: search by mobile number */}
        {!loading && sourceTab === "users" && (
          <div style={{ marginBottom: "16px", maxWidth: "320px" }}>
            <input
              placeholder="Search by mobile number..."
              value={phoneSearch}
              onChange={(e) => setPhoneSearch(e.target.value)}
              style={{
                width: "100%", backgroundColor: "#161616",
                border: "1px solid #2A2A2A", borderRadius: "10px",
                padding: "9px 14px", fontSize: "13px", color: "#fff", outline: "none",
              }}
            />
          </div>
        )}

        {loading ? (
          <p style={{ color: "#555", fontSize: "13px" }}>Loading queue...</p>
        ) : items.length === 0 ? (
          <div style={{
            backgroundColor: "#161616", border: "1px solid #2A2A2A",
            borderRadius: "16px", padding: "48px", textAlign: "center",
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>✅</div>
            <p style={{ color: "#555", fontSize: "15px" }}>Queue is empty — all caught up!</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            backgroundColor: "#161616", border: "1px solid #2A2A2A",
            borderRadius: "16px", padding: "40px", textAlign: "center",
          }}>
            <p style={{ color: "#555", fontSize: "14px" }}>No queue items match this filter.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {filtered.map((item) => {
              const extracted = item.submission?.aiExtracted || item.telegramPost?.aiExtracted;
              const confidence = conf(item.submission?.confidenceScore ?? item.telegramPost?.confidenceScore ?? null);
              const isFastTrack = item.priority === 1;
              const isProcessing = actionId === item.id;

              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: "#161616",
                    border: `1px solid ${isFastTrack ? "#00C89640" : "#2A2A2A"}`,
                    borderRadius: "16px", overflow: "hidden",
                  }}
                >
                  {/* Top bar */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "12px 18px",
                    backgroundColor: isFastTrack ? "#00C89608" : "transparent",
                    borderBottom: "1px solid #2A2A2A",
                  }}>
                    {isFastTrack && (
                      <span style={{ backgroundColor: "#00C89620", color: "#00C896", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px" }}>
                        ⚡ FAST TRACK
                      </span>
                    )}
                    <span style={{
                      backgroundColor: "#3B82F615", color: "#60A5FA",
                      fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "6px",
                    }}>
                      {item.submission?.submissionType?.toUpperCase() || item.queueType.toUpperCase()}
                    </span>
                    {item.telegramPost?.channel?.channelUsername && (
                      <span style={{ fontSize: "11px", color: "#888" }}>
                        📱 @{item.telegramPost.channel.channelUsername}
                      </span>
                    )}
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <div style={{ fontSize: "12px", color: "#888" }}>
                        {new Date(eventTime(item)).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div style={{ fontSize: "10px", color: "#444" }}>
                        {item.telegramPost ? "posted" : item.submission ? "submitted" : "queued"}
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "1fr auto", gap: "16px" }}>
                    {/* Left: extracted content */}
                    <div>
                      {extracted ? (
                        <>
                          <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
                            {extracted.name || "Unknown product"}
                          </div>
                          {extracted.brand && (
                            <div style={{ fontSize: "12px", color: "#666", marginBottom: "10px" }}>{extracted.brand}</div>
                          )}
                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
                            {extracted.currentPrice && (
                              <div style={{ backgroundColor: "#1E1E1E", borderRadius: "8px", padding: "5px 12px" }}>
                                <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                                  ₹{extracted.currentPrice.toLocaleString("en-IN")}
                                </span>
                                {extracted.originalPrice && extracted.originalPrice > extracted.currentPrice && (
                                  <span style={{ fontSize: "11px", color: "#555", textDecoration: "line-through", marginLeft: "6px" }}>
                                    ₹{extracted.originalPrice.toLocaleString("en-IN")}
                                  </span>
                                )}
                              </div>
                            )}
                            {extracted.category && (
                              <div style={{ backgroundColor: "#1E1E1E", borderRadius: "8px", padding: "5px 12px", fontSize: "12px", color: "#888" }}>
                                {extracted.category}
                              </div>
                            )}
                            {extracted.rating && (
                              <div style={{ backgroundColor: "#1E1E1E", borderRadius: "8px", padding: "5px 12px", fontSize: "12px", color: "#FBBF24" }}>
                                ★ {extracted.rating}
                              </div>
                            )}
                          </div>
                          {extracted.description && (
                            <p style={{ fontSize: "12px", color: "#666", lineHeight: "1.5", marginBottom: "10px" }}>
                              {extracted.description}
                            </p>
                          )}
                        </>
                      ) : (
                        <p style={{ fontSize: "13px", color: "#666", marginBottom: "10px" }}>No AI extraction available — manual review needed</p>
                      )}

                      {/* Source URL / original Telegram post text */}
                      {item.submission?.rawContent && (
                        <div style={{ fontSize: "11px", color: "#444", backgroundColor: "#1E1E1E", borderRadius: "8px", padding: "6px 10px", wordBreak: "break-all" }}>
                          🔗 {item.submission.rawContent.slice(0, 80)}{item.submission.rawContent.length > 80 ? "..." : ""}
                        </div>
                      )}
                      {item.telegramPost?.rawText && (
                        <div style={{ fontSize: "11px", color: "#444", backgroundColor: "#1E1E1E", borderRadius: "8px", padding: "6px 10px", wordBreak: "break-all" }}>
                          💬 {item.telegramPost.rawText.slice(0, 100)}{item.telegramPost.rawText.length > 100 ? "..." : ""}
                        </div>
                      )}

                      {/* Submitter info */}
                      {item.submission?.user && (
                        <div style={{ display: "flex", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "11px", color: "#555" }}>
                            👤 {item.submission.user.displayName || item.submission.user.phone}
                          </span>
                          <span style={{ fontSize: "11px", color: "#555" }}>
                            · {item.submission.user.points} pts
                          </span>
                          <span style={{ fontSize: "11px", color: "#555" }}>
                            · Trust: {(Number(item.submission.user.trustScore) * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}

                      {/* Admin notes */}
                      {item.adminNotes && (
                        <div style={{ marginTop: "8px", fontSize: "11px", color: "#00C896", backgroundColor: "#00C89608", borderRadius: "6px", padding: "5px 10px" }}>
                          {item.adminNotes}
                        </div>
                      )}
                    </div>

                    {/* Right: confidence + actions */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "10px", minWidth: "140px" }}>
                      {/* Confidence score */}
                      {confidence.pct > 0 && (
                        <div style={{ textAlign: "center", width: "100%" }}>
                          <div style={{ fontSize: "11px", color: "#555", marginBottom: "4px" }}>AI Confidence</div>
                          <div style={{ width: "100%", height: "6px", backgroundColor: "#2A2A2A", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ width: `${confidence.pct}%`, height: "100%", backgroundColor: confidence.color, borderRadius: "3px" }} />
                          </div>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: confidence.color, marginTop: "3px" }}>
                            {confidence.pct}%
                          </div>
                        </div>
                      )}

                      {/* Approve button */}
                      <button
                        onClick={() => handleApprove(item.id)}
                        disabled={isProcessing}
                        style={{
                          width: "100%", backgroundColor: isProcessing ? "#1E1E1E" : "#00C896",
                          color: isProcessing ? "#555" : "#000", border: "none",
                          borderRadius: "10px", padding: "10px",
                          fontSize: "13px", fontWeight: 700, cursor: isProcessing ? "not-allowed" : "pointer",
                        }}
                      >
                        {isProcessing ? "..." : "✓ Approve"}
                      </button>

                      {/* Reject button */}
                      {rejectId === item.id ? (
                        <div style={{ width: "100%" }}>
                          <input
                            placeholder="Reason..."
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            style={{
                              width: "100%", backgroundColor: "#1E1E1E", border: "1px solid #EF444440",
                              borderRadius: "8px", padding: "7px 10px",
                              fontSize: "12px", color: "#fff", outline: "none", marginBottom: "6px",
                            }}
                          />
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              onClick={() => handleReject(item.id)}
                              style={{ flex: 1, backgroundColor: "#EF444420", color: "#F87171", border: "1px solid #EF444430", borderRadius: "8px", padding: "6px", fontSize: "12px", cursor: "pointer" }}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setRejectId(null)}
                              style={{ backgroundColor: "#1E1E1E", color: "#555", border: "1px solid #2A2A2A", borderRadius: "8px", padding: "6px 8px", fontSize: "12px", cursor: "pointer" }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRejectId(item.id)}
                          style={{
                            width: "100%", backgroundColor: "transparent",
                            color: "#EF4444", border: "1px solid #EF444430",
                            borderRadius: "10px", padding: "8px",
                            fontSize: "13px", cursor: "pointer",
                          }}
                        >
                          ✕ Reject
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}