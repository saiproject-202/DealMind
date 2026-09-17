"use client";
import { useState, useEffect, useRef } from "react";
import { getToken } from "@/lib/auth";
import { apiFetch } from "@/lib/apiFetch";

interface CartNote {
  id: string;
  rawNote: string;
  parsedRule: { description?: string; condition?: string; threshold?: number; parsedBy?: string } | null;
  status: string;
  matchCount: number;
  expiresAt: string | null;
  createdAt: string;
}

interface ChatMessage { role: "user" | "assistant"; content: string; }
interface Props { onCountChange?: (n: number) => void; }

const DURATIONS = [
  { value: 0,  label: "No expiry",  note: "Track indefinitely" },
  { value: 1,  label: "1 month",   note: "Short-term watch" },
  { value: 2,  label: "2 months",  note: "Good for fashion/beauty" },
  { value: 3,  label: "3 months",  note: "Good for electronics" },
  { value: 6,  label: "6 months",  note: "Good for phones/laptops" },
  { value: 12, label: "1 year",    note: "Long-term tracking" },
];

// The shared "Set Alert" / "Ask AI" tabs UI — rendered both inside the small
// popover (CartNoteModal) and on the full /cartnote page. All CartNote data
// fetching is scoped server-side to the authenticated user's own JWT (see
// GET/DELETE /api/cartnotes in cartnotes.routes.ts), so this component never
// needs to know or care whose alerts it's showing beyond "the logged-in user."
export default function CartNoteBody({ onCountChange }: Props) {
  // getToken() reads localStorage, which doesn't exist during server
  // rendering — starting from `false` (same on server and client's first
  // render) and only flipping to the real value after mount avoids a
  // hydration mismatch (server always renders logged-out, client would
  // otherwise render logged-in immediately if a token exists).
  const [isLoggedIn, setIsLoggedIn]     = useState(false);
  const [mounted, setMounted]           = useState(false);
  const [tab, setTab]                   = useState<"alerts" | "assistant">("alerts");
  const [notes, setNotes]               = useState<CartNote[]>([]);
  const [rawNote, setRawNote]           = useState("");
  const [durationMonths, setDuration]   = useState(0);
  const [submitting, setSubmitting]     = useState(false);
  const [submitMsg, setSubmitMsg]       = useState("");
  const [loading, setLoading]           = useState(true);
  const [chatMsg, setChatMsg]           = useState("");
  const [chatHistory, setChatHistory]   = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading]   = useState(false);
  const chatEndRef                      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading real login state must wait until after mount (see above)
    setIsLoggedIn(!!getToken());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- skip fetch and clear loading state when logged out
    if (!isLoggedIn) { setLoading(false); return; }
    apiFetch("/api/cartnotes")
      .then(r => r.json())
      .then(d => {
        if (d.cartnotes) {
          setNotes(d.cartnotes);
          onCountChange?.(d.cartnotes.filter((n: CartNote) => n.status === 'active').length);
        }
      })
      .finally(() => setLoading(false));
  }, [mounted, isLoggedIn, onCountChange]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  const handleCreateAlert = async () => {
    if (!rawNote.trim() || rawNote.trim().length < 5) {
      setSubmitMsg("❌ Please describe what you want to track (min 5 chars).");
      return;
    }
    setSubmitting(true);
    setSubmitMsg("🤖 Claude is parsing your alert...");
    try {
      const res = await apiFetch("/api/cartnotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawNote: rawNote.trim(),
          mode: "alert",
          durationMonths: durationMonths || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const updated = [data.cartnote, ...notes];
        setNotes(updated);
        onCountChange?.(updated.filter((n) => n.status === "active").length);
        setRawNote("");
        setDuration(0);
        setSubmitMsg(`✅ ${data.message}`);
      } else {
        setSubmitMsg("❌ " + (data.error || "Could not set alert."));
      }
    } catch {
      setSubmitMsg("❌ Could not connect to server.");
    }
    setSubmitting(false);
    setTimeout(() => setSubmitMsg(""), 6000);
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/cartnotes/${id}`, { method: "DELETE" });
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    onCountChange?.(updated.filter((n) => n.status === "active").length);
  };

  const handleChat = async () => {
    if (!chatMsg.trim() || chatLoading) return;
    const userMsg = chatMsg.trim();
    setChatMsg("");
    const newHistory: ChatMessage[] = [...chatHistory, { role: "user", content: userMsg }];
    setChatHistory(newHistory);
    setChatLoading(true);
    try {
      const res = await apiFetch("/api/cartnotes/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: newHistory }),
      });
      const data = await res.json();
      setChatHistory(prev => [...prev, {
        role: "assistant",
        content: data.response || data.error || "Sorry, couldn't process that. Try again."
      }]);
    } catch {
      setChatHistory(prev => [...prev, { role: "assistant", content: "Connection error. Please try again." }]);
    }
    setChatLoading(false);
  };

  const statusColor = (s: string) =>
    s === 'active' ? '#00C896' : s === 'triggered' ? '#F59E0B' : s === 'expired' ? '#EF4444' : '#555';
  const statusLabel = (s: string) =>
    s === 'active' ? '● Active' : s === 'triggered' ? '⚡ Triggered' : s === 'expired' ? '○ Expired' : '○ Unknown';

  const daysLeft = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    // eslint-disable-next-line react-hooks/purity -- relative time display is inherently time-dependent
    const diff = new Date(expiresAt).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0)  return 'Expired';
    if (days === 0) return 'Expires today';
    if (days < 30) return `${days}d left`;
    const months = Math.ceil(days / 30);
    return `${months}mo left`;
  };

  return (
    <>
      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid #2A2A2A", flexShrink:0 }}>
        {(["alerts", "assistant"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:"11px", fontSize:"13px", fontWeight:600, backgroundColor:"transparent", border:"none", borderBottom: tab===t ? "2px solid #00C896" : "2px solid transparent", color: tab===t ? "#00C896" : "#555", cursor:"pointer" }}>
            {t === "alerts" ? "🔔 Set Alert" : "🤖 Ask AI"}
          </button>
        ))}
      </div>

      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column" }}>

        {/* ── ALERTS TAB ────────────────────────────────── */}
        {tab === "alerts" && (
          <div style={{ padding:"16px" }}>
            {!isLoggedIn ? (
              <div style={{ textAlign:"center", padding:"24px 0" }}>
                <div style={{ fontSize:"32px", marginBottom:"12px" }}>🔒</div>
                <p style={{ fontSize:"13px", color:"#666", marginBottom:"14px" }}>Log in to set price alerts</p>
                <a href="/login" style={{ backgroundColor:"#00C896", color:"#000", padding:"10px 20px", borderRadius:"10px", fontSize:"13px", fontWeight:700, textDecoration:"none" }}>Login →</a>
              </div>
            ) : (
              <>
                {/* Text input */}
                <textarea
                  placeholder={`Write in plain English:\n"Notify me when OnePlus Nord 6 drops below ₹20,000"\n"Alert when boAt earphones drop 50%"\n"Tell me when a smartwatch with GPS launches under ₹5,000"`}
                  value={rawNote}
                  onChange={e => setRawNote(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) handleCreateAlert(); }}
                  rows={3}
                  style={{ width:"100%", backgroundColor:"#1E1E1E", border:"1px solid #2A2A2A", borderRadius:"12px", padding:"11px 13px", fontSize:"13px", color:"#fff", outline:"none", resize:"none", lineHeight:"1.5", marginBottom:"10px" }}
                />

                {/* Duration selector */}
                <div style={{ marginBottom:"12px" }}>
                  <div style={{ fontSize:"11px", color:"#666", fontWeight:600, marginBottom:"6px" }}>
                    TRACK FOR HOW LONG?
                    <span style={{ color:"#444", fontWeight:400, marginLeft:"6px" }}>
                      {"(AI will suggest alternatives if price doesn't drop in time)"}
                    </span>
                  </div>
                  <div style={{ display:"flex", gap:"6px", flexWrap:"wrap" }}>
                    {DURATIONS.map(d => (
                      <button
                        key={d.value}
                        onClick={() => setDuration(d.value)}
                        title={d.note}
                        style={{
                          backgroundColor: durationMonths === d.value ? "#00C89620" : "#1E1E1E",
                          color:           durationMonths === d.value ? "#00C896"   : "#666",
                          border:          `1px solid ${durationMonths === d.value ? "#00C89640" : "#2A2A2A"}`,
                          borderRadius:    "8px",
                          padding:         "5px 10px",
                          fontSize:        "12px",
                          fontWeight:      durationMonths === d.value ? 600 : 400,
                          cursor:          "pointer",
                        }}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  {durationMonths > 0 && (
                    <p style={{ fontSize:"11px", color:"#555", marginTop:"5px" }}>
                      💡 If no price drop found in {DURATIONS.find(d => d.value === durationMonths)?.label}, DealMind AI will analyze upcoming sale seasons and suggest alternatives.
                    </p>
                  )}
                </div>

                {/* Flash message */}
                {submitMsg && (
                  <div style={{ backgroundColor: submitMsg.startsWith("✅") ? "#00C89615" : submitMsg.startsWith("🤖") ? "#3B82F615" : "#EF444415", border:`1px solid ${submitMsg.startsWith("✅") ? "#00C89630" : submitMsg.startsWith("🤖") ? "#3B82F630" : "#EF444430"}`, borderRadius:"8px", padding:"8px 12px", marginBottom:"10px", fontSize:"12px", color: submitMsg.startsWith("✅") ? "#00C896" : submitMsg.startsWith("🤖") ? "#60A5FA" : "#F87171" }}>
                    {submitMsg}
                  </div>
                )}

                <button onClick={handleCreateAlert} disabled={submitting} style={{ width:"100%", backgroundColor: submitting ? "#1E1E1E" : "#00C896", color: submitting ? "#555" : "#000", border:"none", borderRadius:"10px", padding:"11px", fontSize:"13px", fontWeight:700, cursor: submitting ? "not-allowed" : "pointer", marginBottom:"16px" }}>
                  {submitting ? "Setting alert..." : "Set Alert →"}
                </button>

                {/* Notes list */}
                {loading ? (
                  <p style={{ fontSize:"12px", color:"#555", textAlign:"center" }}>Loading...</p>
                ) : notes.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"16px 0" }}>
                    <div style={{ fontSize:"28px", marginBottom:"8px" }}>🔔</div>
                    <p style={{ fontSize:"12px", color:"#555" }}>No alerts yet. Set your first one above!</p>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                    <div style={{ fontSize:"11px", color:"#555", fontWeight:600, marginBottom:"2px" }}>YOUR ALERTS ({notes.length})</div>
                    {notes.map(note => {
                      const timeLeft = daysLeft(note.expiresAt);
                      return (
                        <div key={note.id} style={{ backgroundColor:"#1E1E1E", borderRadius:"10px", padding:"10px 12px", border:`1px solid ${statusColor(note.status)}20` }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"8px" }}>
                            <div style={{ flex:1, minWidth:0 }}>
                              <p style={{ fontSize:"12px", color:"#E5E5E5", lineHeight:"1.4", marginBottom:"3px" }}>{note.rawNote}</p>
                              {note.parsedRule?.description && (
                                <p style={{ fontSize:"10px", color:"#555", lineHeight:"1.4", marginBottom:"4px" }}>{note.parsedRule.description}</p>
                              )}
                              <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", alignItems:"center" }}>
                                <span style={{ fontSize:"10px", color:statusColor(note.status), fontWeight:600 }}>{statusLabel(note.status)}</span>
                                {timeLeft && (
                                  <span style={{ fontSize:"10px", color: timeLeft === 'Expired' ? '#EF4444' : '#555', backgroundColor:"#2A2A2A", padding:"1px 6px", borderRadius:"4px" }}>
                                    ⏱ {timeLeft}
                                  </span>
                                )}
                                {note.matchCount > 0 && (
                                  <span style={{ fontSize:"10px", color:"#00C896" }}>{note.matchCount} match</span>
                                )}
                                {note.parsedRule?.parsedBy === 'fallback' && (
                                  <span style={{ fontSize:"9px", color:"#444", backgroundColor:"#1A1A1A", padding:"1px 5px", borderRadius:"4px" }}>basic parse</span>
                                )}
                              </div>
                            </div>
                            <button onClick={() => handleDelete(note.id)} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:"14px", flexShrink:0 }}>🗑</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ASSISTANT TAB ──────────────────────────── */}
        {tab === "assistant" && (
          <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
            <div style={{ flex:1, overflowY:"auto", padding:"14px 16px", display:"flex", flexDirection:"column", gap:"10px" }}>
              {chatHistory.length === 0 && (
                <div style={{ textAlign:"center", padding:"16px 0" }}>
                  <div style={{ fontSize:"28px", marginBottom:"10px" }}>🤖</div>
                  <p style={{ fontSize:"13px", color:"#666", marginBottom:"8px" }}>Ask me anything about shopping!</p>
                  {["Compare OnePlus Nord 4 vs Samsung A35", "Best earphones under ₹1,500", "Should I buy a phone now or wait?"].map((q, i) => (
                    <button key={i} onClick={() => setChatMsg(q)} style={{ display:"block", width:"100%", backgroundColor:"#1E1E1E", border:"1px solid #2A2A2A", borderRadius:"8px", padding:"7px 10px", fontSize:"11px", color:"#888", cursor:"pointer", textAlign:"left", marginBottom:"5px" }}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} style={{ display:"flex", justifyContent: msg.role==="user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth:"85%", backgroundColor: msg.role==="user" ? "#00C896" : "#1E1E1E", color: msg.role==="user" ? "#000" : "#E5E5E5", borderRadius: msg.role==="user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding:"9px 12px", fontSize:"13px", lineHeight:"1.5", border: msg.role==="assistant" ? "1px solid #2A2A2A" : "none" }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display:"flex", justifyContent:"flex-start" }}>
                  <div style={{ backgroundColor:"#1E1E1E", border:"1px solid #2A2A2A", borderRadius:"14px 14px 14px 4px", padding:"9px 14px", fontSize:"13px", color:"#555" }}>🤖 Thinking...</div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding:"12px 14px", borderTop:"1px solid #2A2A2A", display:"flex", gap:"8px", flexShrink:0 }}>
              <input
                placeholder="Ask about any product..."
                value={chatMsg}
                onChange={e => setChatMsg(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleChat()}
                style={{ flex:1, backgroundColor:"#1E1E1E", border:"1px solid #2A2A2A", borderRadius:"10px", padding:"9px 12px", fontSize:"13px", color:"#fff", outline:"none" }}
              />
              <button onClick={handleChat} disabled={chatLoading || !chatMsg.trim()} style={{ backgroundColor: chatLoading ? "#1E1E1E" : "#00C896", color: chatLoading ? "#555" : "#000", border:"none", borderRadius:"10px", padding:"9px 14px", fontSize:"13px", fontWeight:700, cursor: chatLoading ? "not-allowed" : "pointer" }}>→</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
