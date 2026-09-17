"use client";
import { Product } from "@/lib/mockData";
import { useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";

const STORE_COLORS: Record<string, { bg: string; text: string }> = {
  Amazon:  { bg:"#FF990015", text:"#FF9900" },
  Flipkart:{ bg:"#2874F015", text:"#2874F0" },
  Myntra:  { bg:"#FF3F6C15", text:"#FF3F6C" },
  Meesho:  { bg:"#A020F015", text:"#A020F0" },
  AJIO:    { bg:"#00A86B15", text:"#00A86B" },
};

interface ProductCardProps {
  product: Product;
  // If real DB listing ID is available, use /go/ tracking
  listingId?: string;
}

export default function ProductCard({ product, listingId }: ProductCardProps) {
  const [hovered, setHovered] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!product.image && !imageFailed;
  const savings = product.originalPrice - product.currentPrice;
  const store = STORE_COLORS[product.store] ?? { bg:"#33333320", text:"#888" };

  // The "View Deal" button — goes through affiliate tracking if listingId available
  const handleViewDeal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (listingId) {
      // Real product — goes through /go/ for affiliate tracking
      window.open(`${API}/go/${listingId}`, '_blank', 'noopener,noreferrer');
    } else {
      // Mock product — open product detail page
      window.location.href = `/product/${product.id}`;
    }
  };

  return (
    <Link href={`/product/${product.id}`} style={{ textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          flexShrink: 0,
          width: "188px",
          backgroundColor: "#161616",
          border: `1px solid ${hovered ? "#00C89640" : "#2A2A2A"}`,
          borderRadius: "16px",
          overflow: "hidden",
          cursor: "pointer",
          transform: hovered ? "translateY(-4px)" : "translateY(0)",
          transition: "all 0.2s ease",
          boxShadow: hovered ? "0 12px 32px rgba(0,200,150,0.08)" : "none",
        }}
      >
        {/* Image area */}
        <div style={{ position:"relative", height:"148px", background:"#1A1A1A", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
          {product.discountPct >= 15 && (
            <div style={{ position:"absolute", top:"10px", left:"10px", backgroundColor:"#EF4444", color:"#fff", fontSize:"11px", fontWeight:700, padding:"2px 7px", borderRadius:"8px", zIndex:2 }}>
              -{product.discountPct}%
            </div>
          )}
          {product.isNew && (
            <div style={{ position:"absolute", top:"10px", right:"10px", backgroundColor:"#00C896", color:"#000", fontSize:"10px", fontWeight:700, padding:"2px 6px", borderRadius:"6px", zIndex:2 }}>
              NEW
            </div>
          )}
          {product.couponCode && (
            <div style={{ position:"absolute", bottom:"8px", left:"10px", backgroundColor:"#7C3AED20", color:"#A78BFA", fontSize:"10px", fontWeight:600, padding:"2px 7px", borderRadius:"6px", border:"1px solid #7C3AED30", zIndex:2 }}>
              🎟 {product.couponCode}
            </div>
          )}
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image}
              alt={product.name}
              onError={() => setImageFailed(true)}
              style={{ width:"100%", height:"100%", objectFit:"cover" }}
            />
          ) : (
            <>
              <div style={{ position:"absolute", width:"90px", height:"90px", borderRadius:"50%", background:product.gradient, opacity: hovered ? 1 : 0.7, transition:"opacity 0.2s" }} />
              <span style={{ fontSize:"36px", position:"relative", zIndex:1 }}>{product.emoji}</span>
            </>
          )}
        </div>

        {/* Card body */}
        <div style={{ padding:"12px" }}>
          <span style={{ display:"inline-block", backgroundColor:store.bg, color:store.text, fontSize:"10px", fontWeight:600, padding:"2px 7px", borderRadius:"6px", marginBottom:"7px" }}>
            {product.store}
          </span>
          <p className="line-clamp-2" style={{ fontSize:"12px", fontWeight:500, color:"#E5E5E5", lineHeight:"1.45", height:"35px", marginBottom:"10px" }}>
            {product.name}
          </p>
          <div style={{ display:"flex", alignItems:"baseline", gap:"6px", marginBottom:"4px" }}>
            <span style={{ fontSize:"15px", fontWeight:700, color:"#fff" }}>₹{product.currentPrice.toLocaleString("en-IN")}</span>
            <span style={{ fontSize:"11px", color:"#555", textDecoration:"line-through" }}>₹{product.originalPrice.toLocaleString("en-IN")}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
            <span style={{ fontSize:"11px", color:"#00C896", fontWeight:600 }}>Save ₹{savings.toLocaleString("en-IN")}</span>
            <div style={{ display:"flex", alignItems:"center", gap:"3px" }}>
              <span style={{ color:"#FBBF24", fontSize:"11px" }}>★</span>
              <span style={{ color:"#888", fontSize:"11px" }}>{product.rating}</span>
            </div>
          </div>

          {/* View Deal button — goes through /go/ tracking */}
          <button
            onClick={handleViewDeal}
            style={{
              width:"100%",
              backgroundColor: hovered ? "#00C896" : "#1E1E1E",
              color: hovered ? "#000" : "#888",
              border:`1px solid ${hovered ? "#00C896" : "#2A2A2A"}`,
              borderRadius:"10px",
              padding:"8px 0",
              fontSize:"12px",
              fontWeight:600,
              cursor:"pointer",
              transition:"all 0.2s",
            }}
          >
            View Deal →
          </button>
        </div>
      </div>
    </Link>
  );
}