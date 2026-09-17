"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { apiFetch } from "@/lib/apiFetch";

type Step = "input" | "preview" | "done";
type SubmitType = "link" | "coupon";

interface ExtractedData {
  name?: string;
  currentPrice?: number;
  category?: string;
}

const PLATFORMS = ["Amazon", "Flipkart", "Myntra", "AJIO", "Meesho"] as const;
type CouponType = "REUSABLE" | "SINGLE_USE";

// Lightweight client-side heuristic — same rule the backend AI review falls
// back to (coupon-ai.ts) — just gives an instant suggestion before the real
// AI review runs server-side. The contributor can always override it.
const SINGLE_USE_HINTS = /new user|first order|first purchase|one[- ]time|one use|once per account/i;
function suggestCouponType(text: string): CouponType {
  return SINGLE_USE_HINTS.test(text) ? "SINGLE_USE" : "REUSABLE";
}

export default function SubmitDealPage() {
  const router = useRouter();
  const [mounted, setMounted]             = useState(false);
  const [step, setStep]                   = useState<Step>("input");
  const [type, setType]                   = useState<SubmitType>("link");
  const [url, setUrl]                     = useState("");
  const [coupon, setCoupon]               = useState("");
  const [platform, setPlatform]           = useState<string>(PLATFORMS[0]);
  const [couponType, setCouponType]       = useState<CouponType>("REUSABLE");
  const [couponTypeTouched, setCouponTypeTouched] = useState(false);
  const [notes, setNotes]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const [extracting, setExtracting]       = useState(false);
  const [error, setError]                 = useState("");
  const [extracted, setExtracted]         = useState<ExtractedData | null>(null);
  const [submissionId, setSubmissionId]   = useState("");

  // KEY: prevents hydration mismatch — server always renders loading state first
  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.push("/login?redirect=/submit");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-mismatch guard, see comment above
    setMounted(true);
  }, [router]);

  // Auto-suggest couponType from the text as the contributor types — only
  // while they haven't manually picked one themselves.
  useEffect(() => {
    if (couponTypeTouched) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derives a suggestion from user input as they type
    setCouponType(suggestCouponType(`${notes} ${coupon}`));
  }, [notes, coupon, couponTypeTouched]);

  // Show blank dark page while mounting (matches server render)
  if (!mounted) {
    return <div style={{ minHeight: "100vh", backgroundColor: "#0D0D0D" }} />;
  }

  const handleExtractPreview = async () => {
    if (!url.trim()) { setError("Please paste a product URL."); return; }
    setError("");
    setExtracting(true);
    try {
      const res = await apiFetch("/api/admin/extract-product", {
        method: "POST",
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (data.success && data.extracted) {
        setExtracted(data.extracted);
      } else {
        setExtracted(null);
      }
    } catch {
      setExtracted(null);
    }
    setExtracting(false);
    setStep("preview");
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      if (type === "coupon") {
        // Coupons go into the real coupon marketplace (POST /api/coupons),
        // not the deal-approval queue — that's a separate system entirely,
        // with its own AI review + community verification, not admin approval.
        const rawText = notes.trim() || `${coupon.trim()} coupon code for ${platform}`;
        const res = await apiFetch("/api/coupons", {
          method: "POST",
          body: JSON.stringify({ code: coupon.trim(), merchant: platform, rawText, couponType }),
        });
        const data = await res.json();
        if (res.status === 409) {
          setError(data.error || "This coupon already exists.");
        } else if (data.success) {
          setSubmissionId(data.coupon.id);
          setStep("done");
        } else {
          // AI review rejected it (still a 201, just success:false) — real
          // rejection reason, not a generic "submission failed" message.
          setError(data.message || "This coupon was rejected by AI review.");
        }
        setLoading(false);
        return;
      }

      const res = await apiFetch("/api/deals/submit", {
        method: "POST",
        body: JSON.stringify({
          submissionType: type,
          rawContent: type === "link" ? url : coupon,
          notes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmissionId(data.submissionId);
        setStep("done");
      } else {
        setError(data.error || "Submission failed. Please try again.");
      }
    } catch {
      setError("Could not connect to server.");
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "40px 20px" }}>

      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <Link href="/" style={{ color: "#555", fontSize: "13px", textDecoration: "none" }}>
          ← Back to homepage
        </Link>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#fff", marginTop: "12px", marginBottom: "6px" }}>
          Submit a Deal
        </h1>
        <p style={{ fontSize: "14px", color: "#666" }}>
          Found a great deal? Share it and earn points when it gets approved!
        </p>
        <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
          {[
            { label:"Deal approved", pts:"+10 pts" },
            { label:"Deal trending", pts:"+25 pts" },
            { label:"Top deal of day", pts:"+50 pts" },
          ].map((item, i) => (
            <div key={i} style={{ backgroundColor:"#161616", border:"1px solid #2A2A2A", borderRadius:"10px", padding:"8px 14px", display:"flex", alignItems:"center", gap:"8px" }}>
              <span style={{ fontSize:"13px", color:"#00C896", fontWeight:700 }}>{item.pts}</span>
              <span style={{ fontSize:"12px", color:"#555" }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* STEP: INPUT */}
      {step === "input" && (
        <div>
          {/* Type selector */}
          <div style={{ display:"flex", gap:"8px", marginBottom:"24px", backgroundColor:"#161616", border:"1px solid #2A2A2A", borderRadius:"14px", padding:"6px" }}>
            {(["link", "coupon"] as SubmitType[]).map(t => (
              <button key={t} onClick={() => setType(t)} style={{ flex:1, padding:"10px", borderRadius:"10px", backgroundColor: type===t ? "#00C896" : "transparent", color: type===t ? "#000" : "#666", border:"none", fontSize:"13px", fontWeight:600, cursor:"pointer", transition:"all 0.15s" }}>
                {t === "link" ? "🔗 Product Link" : "🎟 Coupon Code"}
              </button>
            ))}
          </div>

          {type === "link" && (
            <div style={{ marginBottom:"20px" }}>
              <label style={{ display:"block", fontSize:"12px", color:"#666", marginBottom:"8px", fontWeight:600 }}>PRODUCT URL</label>
              <input
                placeholder="Paste Amazon, Flipkart, Myntra, or EarnKaro link..."
                value={url} onChange={e => setUrl(e.target.value)}
                style={{ width:"100%", backgroundColor:"#161616", border:"1px solid #2A2A2A", borderRadius:"12px", padding:"14px 16px", fontSize:"14px", color:"#fff", outline:"none" }}
              />
              <p style={{ fontSize:"11px", color:"#444", marginTop:"6px" }}>AI will automatically extract product details</p>
            </div>
          )}

          {type === "coupon" && (
            <div style={{ marginBottom:"20px" }}>
              <label style={{ display:"block", fontSize:"12px", color:"#666", marginBottom:"8px", fontWeight:600 }}>COUPON CODE</label>
              <input
                placeholder="e.g. SAVE500, FLAT30, SUMMER2025"
                value={coupon} onChange={e => setCoupon(e.target.value)}
                style={{ width:"100%", backgroundColor:"#161616", border:"1px solid #2A2A2A", borderRadius:"12px", padding:"14px 16px", fontSize:"16px", color:"#fff", outline:"none", letterSpacing:"1px", fontWeight:600, marginBottom:"14px" }}
              />
              <label style={{ display:"block", fontSize:"12px", color:"#666", marginBottom:"8px", fontWeight:600 }}>PLATFORM *</label>
              <select
                value={platform} onChange={e => setPlatform(e.target.value)}
                style={{ width:"100%", backgroundColor:"#161616", border:"1px solid #2A2A2A", borderRadius:"12px", padding:"14px 16px", fontSize:"14px", color:"#fff", outline:"none" }}
              >
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <p style={{ fontSize:"11px", color:"#444", marginTop:"6px", marginBottom:"14px" }}>Which store is this code for? Other users filter/browse coupons by platform.</p>

              <label style={{ display:"block", fontSize:"12px", color:"#666", marginBottom:"8px", fontWeight:600 }}>USAGE TYPE *</label>
              <select
                value={couponType}
                onChange={e => { setCouponType(e.target.value as CouponType); setCouponTypeTouched(true); }}
                style={{ width:"100%", backgroundColor:"#161616", border:"1px solid #2A2A2A", borderRadius:"12px", padding:"14px 16px", fontSize:"14px", color:"#fff", outline:"none" }}
              >
                <option value="REUSABLE">Reusable — works for multiple people</option>
                <option value="SINGLE_USE">Single-use — one confirmed use retires it (e.g. new-user codes)</option>
              </select>
              <p style={{ fontSize:"11px", color:"#444", marginTop:"6px" }}>
                {!couponTypeTouched && "🤖 Suggested from your description — change it if it's wrong. "}
                Single-use codes get marked as redeemed for everyone the moment a trusted user confirms it worked.
              </p>
            </div>
          )}

          <div style={{ marginBottom:"24px" }}>
            <label style={{ display:"block", fontSize:"12px", color:"#666", marginBottom:"8px", fontWeight:600 }}>NOTES (optional)</label>
            <textarea
              placeholder="Any extra info about this deal..."
              value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              style={{ width:"100%", backgroundColor:"#161616", border:"1px solid #2A2A2A", borderRadius:"12px", padding:"12px 16px", fontSize:"13px", color:"#fff", outline:"none", resize:"none" }}
            />
          </div>

          {error && (
            <div style={{ backgroundColor:"#EF444415", border:"1px solid #EF444430", borderRadius:"10px", padding:"12px 14px", marginBottom:"16px", fontSize:"13px", color:"#F87171" }}>
              {error}
            </div>
          )}

          <button
            onClick={type === "link" ? handleExtractPreview : handleSubmit}
            disabled={extracting || loading}
            style={{ width:"100%", backgroundColor:"#00C896", color:"#000", border:"none", borderRadius:"14px", padding:"16px", fontSize:"15px", fontWeight:700, cursor: extracting||loading ? "not-allowed" : "pointer" }}
          >
            {extracting ? "🤖 AI is extracting details..." : loading ? "Submitting..." : type==="link" ? "Preview Deal →" : "Submit Coupon →"}
          </button>
        </div>
      )}

      {/* STEP: PREVIEW */}
      {step === "preview" && (
        <div>
          <button onClick={() => setStep("input")} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:"13px", marginBottom:"20px" }}>
            ← Edit
          </button>

          {extracted ? (
            <div style={{ backgroundColor:"#161616", border:"1px solid #00C89630", borderRadius:"16px", padding:"20px", marginBottom:"20px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"14px" }}>
                <span style={{ fontSize:"14px" }}>🤖</span>
                <span style={{ fontSize:"12px", color:"#00C896", fontWeight:600 }}>AI extracted these details</span>
              </div>
              <div style={{ fontSize:"15px", fontWeight:700, color:"#fff", marginBottom:"8px" }}>{extracted.name}</div>
              <div style={{ display:"flex", gap:"12px", flexWrap:"wrap" }}>
                {extracted.currentPrice && (
                  <div style={{ backgroundColor:"#1E1E1E", borderRadius:"8px", padding:"5px 12px" }}>
                    <span style={{ fontSize:"13px", color:"#00C896", fontWeight:700 }}>₹{extracted.currentPrice.toLocaleString("en-IN")}</span>
                  </div>
                )}
                {extracted.category && (
                  <div style={{ backgroundColor:"#1E1E1E", borderRadius:"8px", padding:"5px 12px" }}>
                    <span style={{ fontSize:"12px", color:"#888" }}>{extracted.category}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ backgroundColor:"#161616", border:"1px solid #2A2A2A", borderRadius:"16px", padding:"20px", marginBottom:"20px" }}>
              <p style={{ fontSize:"13px", color:"#666" }}>Our team will review this and extract details manually.</p>
            </div>
          )}

          <div style={{ backgroundColor:"#161616", border:"1px solid #2A2A2A", borderRadius:"14px", padding:"16px", marginBottom:"20px", fontSize:"12px", color:"#555" }}>
            <div style={{ marginBottom:"6px" }}>🔗 {url.slice(0,70)}{url.length > 70 ? "..." : ""}</div>
            <div>⏳ Will be reviewed before going live</div>
          </div>

          {error && (
            <div style={{ backgroundColor:"#EF444415", border:"1px solid #EF444430", borderRadius:"10px", padding:"12px 14px", marginBottom:"16px", fontSize:"13px", color:"#F87171" }}>
              {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading} style={{ width:"100%", backgroundColor:"#00C896", color:"#000", border:"none", borderRadius:"14px", padding:"16px", fontSize:"15px", fontWeight:700, cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "Submitting..." : "✅ Submit Deal"}
          </button>
        </div>
      )}

      {/* STEP: DONE */}
      {step === "done" && (
        <div style={{ textAlign:"center", padding:"40px 20px" }}>
          <div style={{ fontSize:"64px", marginBottom:"20px" }}>🎉</div>
          <h2 style={{ fontSize:"22px", fontWeight:800, color:"#fff", marginBottom:"10px" }}>
            {type === "coupon" ? "Coupon Submitted!" : "Deal Submitted!"}
          </h2>
          <p style={{ fontSize:"14px", color:"#666", marginBottom:"8px", lineHeight:"1.6" }}>
            {type === "coupon" ? (
              <>It&apos;s live on the <Link href="/coupons" style={{ color:"#00C896", fontWeight:700 }}>Coupons page</Link> now, pending community verification. Points come once other users confirm it works.</>
            ) : (
              <>Our team will review it shortly. You&apos;ll earn <span style={{ color:"#00C896", fontWeight:700 }}>+10 points</span> when it goes live!</>
            )}
          </p>
          <p style={{ fontSize:"12px", color:"#444", marginBottom:"32px" }}>ID: {submissionId.slice(0,8)}...</p>
          <div style={{ display:"flex", gap:"10px", justifyContent:"center" }}>
            <button onClick={() => { setStep("input"); setUrl(""); setCoupon(""); setExtracted(null); setNotes(""); }} style={{ backgroundColor:"#00C896", color:"#000", border:"none", borderRadius:"12px", padding:"12px 24px", fontSize:"14px", fontWeight:700, cursor:"pointer" }}>
              Submit Another
            </button>
            <Link href="/" style={{ backgroundColor:"#161616", color:"#888", border:"1px solid #2A2A2A", borderRadius:"12px", padding:"12px 24px", fontSize:"14px", textDecoration:"none", display:"inline-block" }}>
              Back to Home
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}