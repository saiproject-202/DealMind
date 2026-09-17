"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, API_URL } from "@/lib/apiFetch";
import WishlistButton from "@/components/product/WishlistButton";
import ProductCard from "@/components/product/ProductCard";
import { listingToProduct, type RawListing } from "@/lib/listingToProduct";

interface ListingDetail {
  id: string; name: string; brand: string | null; description: string | null;
  category: string | null; currentPrice: number; originalPrice: number;
  discountPct: number; couponCode: string | null; rating: number | null;
  reviewCount: number | null; isAvailable: boolean; store: string; storeUrl: string;
  image: string | null; variants: Record<string, string[]>;
  overview: string[]; specs: Record<string, string>;
}
interface PricePoint { price: number; recordedAt: string }
interface Verdict { score: number; recommendation: "BUY_NOW" | "WAIT" | "CONSIDER_ALTERNATIVES"; signals: string[] }

const RANGES = [
  { key: "7d",  label: "7 Days",  days: 7 },
  { key: "30d", label: "30 Days", days: 30 },
  { key: "90d", label: "90 Days", days: 90 },
  { key: "all", label: "All Time", days: Infinity },
] as const;

export default function ProductDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [listing, setListing]           = useState<ListingDetail | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [couponCount, setCouponCount]   = useState(0);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [previousSavings, setPreviousSavings] = useState<number | null>(null);
  const [loading, setLoading]           = useState(true);
  const [notFound, setNotFound]         = useState(false);
  const [imageFailed, setImageFailed]   = useState(false);
  // Purely informational selection for now — doesn't change price/URL yet.
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [similar, setSimilar] = useState<RawListing[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [range, setRange] = useState<typeof RANGES[number]["key"]>("30d");

  useEffect(() => {
    apiFetch(`/api/listings/${id}`, { auth: !!localStorage.getItem('dm_token') })
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then(d => {
        if (!d) return;
        setListing(d.listing);
        setPriceHistory(d.priceHistory || []);
        setCouponCount(d.couponCount || 0);
        setIsWishlisted(d.isWishlisted || false);
        setPreviousSavings(d.previousSavings);
        setSimilar(d.similar || []);
        setVerdict(d.verdict || null);
        const defaults: Record<string, string> = {};
        for (const [type, values] of Object.entries(d.listing?.variants || {})) {
          if (values[0]) defaults[type] = values[0];
        }
        setSelectedVariants(defaults);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: "60px", textAlign: "center", color: "#555" }}>Loading...</div>;
  if (notFound || !listing) return (
    <div style={{ padding: "60px", textAlign: "center" }}>
      <p style={{ color: "#555", fontSize: "14px" }}>Product not found.</p>
      <Link href="/" style={{ color: "#00C896", fontSize: "13px" }}>← Back to homepage</Link>
    </div>
  );

  const savings = listing.originalPrice - listing.currentPrice;

  // Prefer the AI-generated Overview; fall back to splitting the plain
  // description into sentences so there's still something scannable, and
  // skip rendering the raw description separately to avoid showing the
  // same text twice.
  const overviewBullets = listing.overview?.length
    ? listing.overview
    : (listing.description || "").split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);

  const specEntries = Object.entries(listing.specs || {}).filter(([, v]) => v && v.trim());

  // Filter to the selected range client-side — the full history is already
  // fetched once, and the daily refresh worker keeps growing it, so this
  // view improves automatically with no further backend changes needed.
  const activeRangeDays = RANGES.find(r => r.key === range)!.days;
  const rangedHistory = activeRangeDays === Infinity
    ? priceHistory
    : priceHistory.filter(p => {
        // eslint-disable-next-line react-hooks/purity -- range filtering is inherently time-dependent
        const ageDays = (Date.now() - new Date(p.recordedAt).getTime()) / 86400000;
        return ageDays <= activeRangeDays;
      });

  const rangedPrices = rangedHistory.map(p => Number(p.price));
  const stats = rangedPrices.length > 0 ? {
    low:     Math.min(...rangedPrices),
    high:    Math.max(...rangedPrices),
    avg:     rangedPrices.reduce((a, b) => a + b, 0) / rangedPrices.length,
    current: Number(listing.currentPrice),
  } : null;

  const chartPoints = rangedHistory.length >= 2 && stats
    ? rangedHistory.map((p, i) => {
        const range2 = stats.high - stats.low || 1;
        const x = (i / (rangedHistory.length - 1)) * 100;
        const y = 100 - ((Number(p.price) - stats.low) / range2) * 100;
        return { x, y };
      })
    : [];

  const verdictMeta = {
    BUY_NOW:               { label: "BUY NOW",               color: "#00C896" },
    WAIT:                  { label: "WAIT",                  color: "#F59E0B" },
    CONSIDER_ALTERNATIVES: { label: "CONSIDER ALTERNATIVES",  color: "#F87171" },
  } as const;

  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "40px 20px" }}>
      <Link href="/" style={{ color: "#555", fontSize: "13px", textDecoration: "none" }}>← Back</Link>

      <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "20px", padding: "28px", marginTop: "16px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
          <span style={{ backgroundColor: "#1E1E1E", color: "#888", fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "8px" }}>
            {listing.store}
          </span>
          <WishlistButton listingId={listing.id} initialState={isWishlisted} size="lg" />
        </div>

        {/* Product image — real photo when available, no placeholder if not */}
        {listing.image && !imageFailed && (
          <div style={{ width: "100%", height: "220px", borderRadius: "14px", overflow: "hidden", backgroundColor: "#1A1A1A", marginBottom: "16px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={listing.image}
              alt={listing.name}
              onError={() => setImageFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          </div>
        )}

        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginBottom: "8px", lineHeight: "1.4" }}>
          {listing.name}
        </h1>
        {listing.brand && <p style={{ fontSize: "13px", color: "#666", marginBottom: "16px" }}>{listing.brand}</p>}

        {/* Previous purchase banner */}
        {previousSavings !== null && (
          <div style={{ backgroundColor: "#00C89615", border: "1px solid #00C89630", borderRadius: "10px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: "#00C896" }}>
            ✓ You bought this before and saved ₹{previousSavings.toLocaleString("en-IN")}
          </div>
        )}

        {/* Price */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px" }}>
          <span style={{ fontSize: "28px", fontWeight: 800, color: "#00C896" }}>
            ₹{Number(listing.currentPrice).toLocaleString("en-IN")}
          </span>
          <span style={{ fontSize: "15px", color: "#555", textDecoration: "line-through" }}>
            ₹{Number(listing.originalPrice).toLocaleString("en-IN")}
          </span>
          {listing.discountPct > 0 && (
            <span style={{ backgroundColor: "#EF444420", color: "#EF4444", fontSize: "12px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px" }}>
              -{listing.discountPct}%
            </span>
          )}
        </div>
        <p style={{ fontSize: "13px", color: "#00C896", marginBottom: "20px" }}>
          You save ₹{savings.toLocaleString("en-IN")}
        </p>

        {/* Price History */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontSize: "11px", color: "#666", fontWeight: 600, letterSpacing: "0.3px" }}>
              PRICE HISTORY
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  style={{
                    backgroundColor: range === r.key ? "#00C89620" : "transparent",
                    color: range === r.key ? "#00C896" : "#666",
                    border: "none", borderRadius: "6px", padding: "4px 8px",
                    fontSize: "11px", fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {rangedHistory.length >= 2 && stats ? (
            <>
              <svg viewBox="0 0 100 40" style={{ width: "100%", height: "70px" }} preserveAspectRatio="none">
                <polyline
                  points={chartPoints.map(p => `${p.x},${p.y * 0.4 + 2}`).join(' ')}
                  fill="none" stroke="#00C896" strokeWidth="1.5" vectorEffect="non-scaling-stroke"
                />
                {/* Highlight today's (most recent) price */}
                <circle
                  cx={chartPoints[chartPoints.length - 1].x}
                  cy={chartPoints[chartPoints.length - 1].y * 0.4 + 2}
                  r="2" fill="#00C896"
                />
              </svg>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginTop: "12px" }}>
                {[
                  { label: "Lowest",  value: stats.low },
                  { label: "Current", value: stats.current, highlight: true },
                  { label: "Highest", value: stats.high },
                  { label: "Average", value: Math.round(stats.avg) },
                ].map((s) => (
                  <div key={s.label} style={{ backgroundColor: "#1A1A1A", borderRadius: "8px", padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: "10px", color: "#666", marginBottom: "3px" }}>{s.label}</div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: s.highlight ? "#00C896" : "#ccc" }}>
                      ₹{s.value.toLocaleString("en-IN")}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ fontSize: "11px", color: "#444" }}>
              {priceHistory.length === 0
                ? "Price history building — check back in a few days for the full chart."
                : `Not enough data in this range yet — try a wider range, or check back soon.`}
            </p>
          )}
        </div>

        {/* DealMind AI Verdict */}
        {verdict && (
          <div style={{
            marginBottom: "24px", backgroundColor: "#1A1A1A",
            border: `1px solid ${verdictMeta[verdict.recommendation].color}30`,
            borderRadius: "14px", padding: "18px",
          }}>
            <div style={{ fontSize: "11px", color: "#666", fontWeight: 600, marginBottom: "10px", letterSpacing: "0.3px" }}>
              🧠 DEALMIND AI VERDICT
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px" }}>
              <span style={{ fontSize: "16px", color: "#FBBF24" }}>
                {"★".repeat(Math.round(verdict.score / 2)) + "☆".repeat(5 - Math.round(verdict.score / 2))}
              </span>
              <span style={{ fontSize: "15px", fontWeight: 800, color: "#fff" }}>{verdict.score} / 10</span>
            </div>
            <ul style={{ margin: 0, marginBottom: "16px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
              {verdict.signals.map((s, i) => (
                <li key={i} style={{ fontSize: "12px", color: "#aaa", display: "flex", gap: "6px" }}>
                  <span style={{ color: "#00C896" }}>✓</span> {s}
                </li>
              ))}
            </ul>
            <div style={{
              backgroundColor: `${verdictMeta[verdict.recommendation].color}15`,
              color: verdictMeta[verdict.recommendation].color,
              borderRadius: "8px", padding: "8px", textAlign: "center",
              fontSize: "13px", fontWeight: 800, letterSpacing: "0.5px",
            }}>
              {verdictMeta[verdict.recommendation].label}
            </div>
          </div>
        )}

        {/* Coupons badge */}
        {couponCount > 0 && (
          <Link href="/coupons" style={{ display: "block", backgroundColor: "#7C3AED15", border: "1px solid #7C3AED30", borderRadius: "10px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: "#A78BFA", textDecoration: "none" }}>
            🎟 {couponCount} coupon{couponCount > 1 ? 's' : ''} available for this product →
          </Link>
        )}

        {/* Rating */}
        {listing.rating && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "20px", fontSize: "13px", color: "#888" }}>
            <span style={{ color: "#FBBF24" }}>★</span> {listing.rating} ({listing.reviewCount || 0} reviews)
          </div>
        )}

        {/* Variants — dynamic per category, e.g. Color/Size for Fashion, Storage/RAM for Mobiles */}
        {Object.entries(listing.variants || {}).map(([type, values]) => (
          <div key={type} style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "11px", color: "#666", fontWeight: 600, marginBottom: "8px", letterSpacing: "0.3px" }}>
              {type.toUpperCase()}{selectedVariants[type] ? `: ${selectedVariants[type]}` : ""}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {values.map((value) => (
                <button
                  key={value}
                  onClick={() => setSelectedVariants((p) => ({ ...p, [type]: value }))}
                  style={{
                    backgroundColor: selectedVariants[type] === value ? "#00C89620" : "#1E1E1E",
                    border: `1px solid ${selectedVariants[type] === value ? "#00C896" : "#2A2A2A"}`,
                    color: selectedVariants[type] === value ? "#00C896" : "#ccc",
                    borderRadius: "8px", padding: "7px 14px", fontSize: "12px", fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Overview — AI-generated bullets, or a sentence-split fallback of the description */}
        {overviewBullets.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "11px", color: "#666", fontWeight: 600, marginBottom: "10px", letterSpacing: "0.3px" }}>
              OVERVIEW
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {overviewBullets.map((point, i) => (
                <li key={i} style={{ fontSize: "13px", color: "#aaa", lineHeight: "1.5" }}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Specifications */}
        {specEntries.length > 0 && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "11px", color: "#666", fontWeight: 600, marginBottom: "10px", letterSpacing: "0.3px" }}>
              SPECIFICATIONS
            </div>
            <div style={{ border: "1px solid #2A2A2A", borderRadius: "12px", overflow: "hidden" }}>
              {specEntries.map(([key, value], i) => (
                <div
                  key={key}
                  style={{
                    display: "flex", justifyContent: "space-between", gap: "12px",
                    padding: "10px 14px", fontSize: "12px",
                    backgroundColor: i % 2 === 0 ? "#161616" : "#1a1a1a",
                    borderTop: i > 0 ? "1px solid #2A2A2A" : "none",
                  }}
                >
                  <span style={{ color: "#666", flexShrink: 0 }}>{key}</span>
                  <span style={{ color: "#ccc", textAlign: "right" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Buy button — goes through /go/ affiliate tracking */}
        <a
          href={`${API_URL}/go/${listing.id}`}
          target="_blank" rel="noopener noreferrer"
          style={{ display: "block", textAlign: "center", backgroundColor: listing.isAvailable ? "#00C896" : "#2A2A2A", color: listing.isAvailable ? "#000" : "#666", padding: "14px", borderRadius: "14px", fontSize: "15px", fontWeight: 700, textDecoration: "none" }}
        >
          {listing.isAvailable ? `View Deal on ${listing.store} →` : "Currently Unavailable"}
        </a>
      </div>

      {/* Similar Products — ranked by brand/price/discount/rating match, same category */}
      {similar.length > 0 && (
        <div style={{ marginTop: "32px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginBottom: "14px" }}>
            Similar Products
          </h2>
          <div className="scroll-hide" style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "8px" }}>
            {similar.map((s) => (
              <ProductCard key={s.id} product={listingToProduct(s)} listingId={s.id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}