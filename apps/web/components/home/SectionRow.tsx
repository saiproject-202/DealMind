import Link from "next/link";
import ProductCard from "@/components/product/ProductCard";
import { Product } from "@/lib/mockData";

interface SectionRowProps {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeBg?: string;
  badgeColor?: string;
  products: Product[];
  /** Key matching the homepage API's sections object (e.g. "priceDrops") —
   *  drives the "View all" link to /deals?section=<sectionKey>. */
  sectionKey: string;
}

export default function SectionRow({
  title,
  subtitle,
  badge,
  badgeBg = "#00C89615",
  badgeColor = "#00C896",
  products,
  sectionKey,
}: SectionRowProps) {
  if (!products.length) return null;

  return (
    <section style={{ paddingBottom: "8px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          padding: "24px 24px 14px",
        }}
      >
        <div>
          {badge && (
            <span
              style={{
                display: "inline-block",
                backgroundColor: badgeBg,
                color: badgeColor,
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 9px",
                borderRadius: "8px",
                marginBottom: "6px",
                letterSpacing: "0.3px",
              }}
            >
              {badge}
            </span>
          )}
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", margin: 0 }}>
            {title}
          </h2>
          {subtitle && (
            <p style={{ fontSize: "13px", color: "#666", marginTop: "3px" }}>
              {subtitle}
            </p>
          )}
        </div>
        <Link
          href={`/deals?section=${sectionKey}`}
          style={{
            backgroundColor: "transparent",
            color: "#00C896",
            border: "none",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            marginTop: "4px",
            flexShrink: 0,
            textDecoration: "none",
          }}
        >
          View all →
        </Link>
      </div>

      {/* Horizontal scroll */}
      <div
        className="scroll-hide"
        style={{
          display: "flex",
          gap: "12px",
          overflowX: "auto",
          paddingLeft: "24px",
          paddingRight: "24px",
          paddingBottom: "8px",
        }}
      >
        {products.map((p) => (
          <ProductCard key={p.id} product={p} listingId={p.id} />
        ))}
      </div>
    </section>
  );
}