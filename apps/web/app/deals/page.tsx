"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ProductCard from "@/components/product/ProductCard";
import { apiFetch } from "@/lib/apiFetch";
import { listingToProduct } from "@/lib/listingToProduct";
import type { Product } from "@/lib/mockData";

// Keep titles/subtitles in sync with app/page.tsx's SectionRow copy — this
// page is just the "View all" destination for one of those same sections.
const SECTION_META: Record<string, { title: string; subtitle: string }> = {
  priceDrops:    { title: "Biggest Price Drops Today", subtitle: "Genuine price decreases recorded in the last 7 days" },
  couponDeals:   { title: "Best Coupon Deals",          subtitle: "Verified, high-confidence coupons only" },
  trending:      { title: "Trending Right Now",         subtitle: "Real DealMind clicks & saves in the last 7 days" },
  mostSold:      { title: "Most Sold Products",         subtitle: "Based on confirmed purchases" },
  bestValue:     { title: "Best Value Products",        subtitle: "Discount, rating, price history & store trust — combined" },
  hiddenGems:    { title: "Hidden Gems",                subtitle: "Genuinely good value with little engagement so far" },
  aiRecommended: { title: "AI Recommended For You",     subtitle: "Hand-picked by DealMind AI based on trends" },
  newLaunches:   { title: "New Launches",                subtitle: "Added to DealMind in the last 48 hours" },
  seasonal:      { title: "Seasonal Deals",              subtitle: "Best offers this season — limited time only" },
};

function DealsPageInner() {
  const params = useSearchParams();
  const section = params.get("section") || "priceDrops";
  const meta = SECTION_META[section] || SECTION_META.priceDrops;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-entering loading state when `section` changes (not just on initial mount, where it's already true)
    setLoading(true);
    apiFetch(`/api/deals/homepage?limit=50`, { auth: false, cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const raw = data?.sections?.[section] || [];
        setProducts(raw.map(listingToProduct));
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [section]);

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "32px 24px 60px" }}>
      <Link href="/" style={{ color: "#666", fontSize: "13px", textDecoration: "none" }}>
        ← Back to home
      </Link>

      <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#fff", marginTop: "14px", marginBottom: "4px" }}>
        {meta.title}
      </h1>
      <p style={{ fontSize: "14px", color: "#666", marginBottom: "28px" }}>
        {meta.subtitle}
      </p>

      {loading ? (
        <p style={{ color: "#555", fontSize: "13px" }}>Loading...</p>
      ) : products.length === 0 ? (
        <div style={{
          backgroundColor: "#161616", border: "1px solid #2A2A2A",
          borderRadius: "16px", padding: "48px", textAlign: "center",
        }}>
          <p style={{ color: "#666", fontSize: "14px" }}>
            No products currently qualify for this section.
          </p>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "14px",
        }}>
          {products.map((p) => (
            <ProductCard key={p.id} product={p} listingId={p.id} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DealsPage() {
  return (
    <Suspense fallback={<div style={{ padding: "32px 24px", color: "#555", fontSize: "13px" }}>Loading...</div>}>
      <DealsPageInner />
    </Suspense>
  );
}
