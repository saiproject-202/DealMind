"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminSidebar from "@/components/layout/AdminSidebar";

interface Listing {
  id: string;
  currentPrice: number;
  originalPrice: number;
  discountPct: number;
  isAvailable: boolean;
  storeUrl: string;
  affiliateUrl: string | null;
  store: { name: string };
}
interface Product {
  id: string;
  name: string;
  brand: string | null;
  status: string;
  sourceType: string;
  createdAt: string;
  images: string[];
  category: { name: string; icon: string | null };
  listings: Listing[];
}

// Matches Product.sourceType values set at creation time: 'admin' (Add
// Product form), 'community' (approved user submission), 'telegram'
// (approved or auto-approved Telegram post).
const SOURCE_META: Record<string, { label: string; icon: string; color: string }> = {
  admin:     { label: "Admin",    icon: "🛠",  color: "#00C896" },
  community: { label: "User",     icon: "👤", color: "#3B82F6" },
  telegram:  { label: "Telegram", icon: "📱", color: "#A78BFA" },
};

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fixListing, setFixListing] = useState<Listing | null>(null);
  const [fixUrl, setFixUrl] = useState("");
  const [fixMsg, setFixMsg] = useState("");
  const [fixing, setFixing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "admin" | "telegram" | "community">("all");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0 });
  const [refreshSummary, setRefreshSummary] = useState<{ updated: number; unchanged: number; failed: number } | null>(null);
  // The list view only ever fetches the 50 most recent — totalCount is the
  // real catalog size, shown separately so the header can't imply only 50
  // products exist when there are actually more.
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const loadProducts = () => {
    const token = localStorage.getItem("dm_admin_token");
    if (!token) { router.push("/login"); return; }
    return fetch("http://localhost:4001/api/admin/products", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.products) setProducts(data.products);
        if (typeof data.total === "number") setTotalCount(data.total);
      });
  };

  useEffect(() => {
    const token = localStorage.getItem("dm_admin_token");
    if (!token) { router.push("/login"); return; }

    Promise.all([
      loadProducts(),
      fetch("http://localhost:4001/api/admin/categories", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => { if (data.categories) setCategories(data.categories); }),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Re-runs AI extraction against every product's store URL, one at a time,
  // and saves whatever comes back through the same PATCH used by the manual
  // "Refresh from store" button — never touches the affiliate link, and
  // skips fields the extraction didn't return rather than blanking them.
  const handleBulkRefresh = async () => {
    const token = localStorage.getItem("dm_admin_token");
    if (!token) { router.push("/login"); return; }

    const targets = products.filter((p) => p.listings[0]?.storeUrl);
    setRefreshing(true);
    setRefreshSummary(null);
    setRefreshProgress({ current: 0, total: targets.length });

    let updated = 0, unchanged = 0, failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const product = targets[i];
      setRefreshProgress({ current: i + 1, total: targets.length });
      const listing = product.listings[0];
      try {
        const exRes = await fetch("http://localhost:4001/api/admin/extract-product", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url: listing.storeUrl }),
        });
        const exData = await exRes.json();
        if (!exData.success) { failed++; continue; }

        const e = exData.extracted;
        const matchedCat = categories.find((c) => c.name.toLowerCase() === (e.suggestedCategory || "").toLowerCase());
        const payload: Record<string, unknown> = {};
        if (e.name) payload.name = e.name;
        if (e.brand) payload.brand = e.brand;
        if (matchedCat) payload.categoryId = matchedCat.id;
        if (e.description) payload.description = e.description;
        if (e.imageUrl) payload.imageUrl = e.imageUrl;
        if (e.currentPrice) payload.currentPrice = e.currentPrice;
        if (e.originalPrice) payload.originalPrice = e.originalPrice;
        if (exData.finalUrl) payload.storeUrl = exData.finalUrl;
        if (e.rating) payload.rating = e.rating;
        if (e.reviewCount) payload.reviewCount = e.reviewCount;
        if (Array.isArray(e.variants) && e.variants.length) {
          payload.variants = e.variants.map((v: { type: string; values: string[] }) => ({ type: v.type, values: v.values }));
        }

        if (Object.keys(payload).length === 0) { unchanged++; continue; }

        const patchRes = await fetch(`http://localhost:4001/api/admin/products/${product.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
        const patchData = await patchRes.json();
        if (patchData.success) updated++; else failed++;
      } catch {
        failed++;
      }
    }

    setRefreshing(false);
    setRefreshSummary({ updated, unchanged, failed });
    loadProducts();
  };

  const filtered = products
    .filter((p) => sourceFilter === "all" || p.sourceType === sourceFilter)
    .filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.brand || "").toLowerCase().includes(search.toLowerCase())
    );

  const TABS: { key: typeof sourceFilter; label: string; icon: string }[] = [
    { key: "all",       label: "All",            icon: "📋" },
    { key: "admin",     label: "Admin Products",  icon: "🛠" },
    { key: "telegram",  label: "Telegram",        icon: "📱" },
    { key: "community", label: "Users",           icon: "👤" },
  ];

  // Readiness is judged off each product's primary listing — same listing
  // the rest of this page already treats as "the" listing to display.
  const readyCount   = products.filter((p) => p.listings[0]?.affiliateUrl).length;
  const missingCount = products.filter((p) => p.listings[0] && !p.listings[0].affiliateUrl).length;

  const openFix = (listing: Listing) => {
    setFixListing(listing);
    setFixUrl("");
    setFixMsg("");
  };

  const handleGenerateInModal = async () => {
    if (!fixListing) return;
    setFixMsg("");
    setFixing(true);
    try {
      const token = localStorage.getItem("dm_admin_token");
      const res = await fetch("http://localhost:4001/api/admin/generate-affiliate-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: fixListing.storeUrl }),
      });
      const data = await res.json();
      if (!data.success) {
        setFixMsg("❌ " + (data.error || "Could not generate link."));
      } else {
        setFixUrl(data.affiliateUrl);
        setFixMsg("✅ Link generated — click Save to apply.");
      }
    } catch {
      setFixMsg("❌ Could not connect to API.");
    }
    setFixing(false);
  };

  const handleSaveFix = async () => {
    if (!fixListing || !fixUrl.trim()) {
      setFixMsg("❌ Generate or paste a link first.");
      return;
    }
    setFixing(true);
    try {
      const token = localStorage.getItem("dm_admin_token");
      const res = await fetch(`http://localhost:4001/api/admin/listings/${fixListing.id}/affiliate-url`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ affiliateUrl: fixUrl.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setFixMsg("❌ " + (data.error || "Could not save link."));
      } else {
        setProducts((prev) => prev.map((p) => ({
          ...p,
          listings: p.listings.map((l) => l.id === fixListing.id ? { ...l, affiliateUrl: fixUrl.trim() } : l),
        })));
        setFixListing(null);
      }
    } catch {
      setFixMsg("❌ Could not connect to API.");
    }
    setFixing(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    setDeleteError("");
    try {
      const token = localStorage.getItem("dm_admin_token");
      const res = await fetch(`http://localhost:4001/api/admin/products/${confirmDelete.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setProducts((prev) => prev.filter((p) => p.id !== confirmDelete.id));
        setConfirmDelete(null);
      } else {
        setDeleteError(data.error || "Could not remove product.");
      }
    } catch {
      setDeleteError("Could not connect to API.");
    }
    setDeletingId(null);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />
      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", marginBottom: "4px" }}>Products</h1>
            <p style={{ fontSize: "13px", color: "#555" }}>
              {totalCount !== null && totalCount > products.length
                ? `Showing ${products.length} most recent of ${totalCount} products in database`
                : `${totalCount ?? products.length} products in database`}
            </p>
          </div>
          <Link
            href="/products/add"
            style={{
              backgroundColor: "#00C896", color: "#000",
              padding: "10px 20px", borderRadius: "12px",
              fontSize: "14px", fontWeight: 700, textDecoration: "none",
            }}
          >
            + Add Product
          </Link>
        </div>

        {/* Affiliate readiness summary */}
        {!loading && products.length > 0 && (
          <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
            <div style={{
              flex: 1, backgroundColor: "#00C89610", border: "1px solid #00C89630",
              borderRadius: "14px", padding: "14px 18px",
            }}>
              <div style={{ fontSize: "12px", color: "#00C896", fontWeight: 600, marginBottom: "4px" }}>
                🟢 Ready for Commission
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff" }}>{readyCount}</div>
            </div>
            <div style={{
              flex: 1, backgroundColor: missingCount > 0 ? "#F59E0B10" : "#161616",
              border: `1px solid ${missingCount > 0 ? "#F59E0B30" : "#2A2A2A"}`,
              borderRadius: "14px", padding: "14px 18px",
            }}>
              <div style={{ fontSize: "12px", color: missingCount > 0 ? "#F59E0B" : "#555", fontWeight: 600, marginBottom: "4px" }}>
                🟡 Missing Affiliate Links
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff" }}>{missingCount}</div>
            </div>
          </div>
        )}

        {/* Source tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
          {TABS.map((tab) => {
            const count = tab.key === "all" ? (totalCount ?? products.length) : products.filter((p) => p.sourceType === tab.key).length;
            const active = sourceFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setSourceFilter(tab.key)}
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
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span style={{ fontSize: "11px", color: active ? "#00C89690" : "#555" }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Search + bulk refresh */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 280px", maxWidth: "400px" }}>
            <input
              placeholder="Search by name or brand..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%", backgroundColor: "#161616",
                border: "1px solid #2A2A2A", borderRadius: "12px",
                padding: "10px 16px", fontSize: "13px", color: "#fff", outline: "none",
              }}
            />
          </div>
          <button
            onClick={handleBulkRefresh}
            disabled={refreshing || products.length === 0}
            title="Re-run AI extraction against every product's store URL, one at a time, and save whatever comes back — affiliate links are never touched"
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              backgroundColor: refreshing ? "#1E1E1E" : "#161616",
              border: `1px solid ${refreshing ? "#2A2A2A" : "#3B82F650"}`,
              borderRadius: "12px", padding: "10px 16px",
              fontSize: "13px", fontWeight: 600,
              color: refreshing ? "#555" : "#60A5FA",
              cursor: refreshing || products.length === 0 ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {refreshing
              ? `🔄 Checking ${refreshProgress.current}/${refreshProgress.total}...`
              : "🔄 Refresh all from store"}
          </button>
        </div>

        {refreshSummary && !refreshing && (
          <div style={{
            marginBottom: "20px", padding: "10px 16px", borderRadius: "10px",
            fontSize: "13px", backgroundColor: "#00C89610", border: "1px solid #00C89630", color: "#00C896",
          }}>
            ✅ Refresh complete — {refreshSummary.updated} updated, {refreshSummary.unchanged} unchanged, {refreshSummary.failed} failed.
          </div>
        )}

        {/* Table */}
        {loading ? (
          <p style={{ color: "#555", fontSize: "13px" }}>Loading products...</p>
        ) : filtered.length === 0 ? (
          <div style={{
            backgroundColor: "#161616", border: "1px solid #2A2A2A",
            borderRadius: "16px", padding: "48px", textAlign: "center",
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>📦</div>
            <p style={{ color: "#555", fontSize: "15px", marginBottom: "8px" }}>No products yet</p>
            <p style={{ color: "#444", fontSize: "13px", marginBottom: "20px" }}>
              Add your first product to start earning from affiliate links
            </p>
            <Link
              href="/products/add"
              style={{
                backgroundColor: "#00C896", color: "#000",
                padding: "10px 20px", borderRadius: "10px",
                fontSize: "13px", fontWeight: 700, textDecoration: "none",
              }}
            >
              + Add First Product
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filtered.map((product, index) => {
              const listing = product.listings[0];
              const isReady = !!listing?.affiliateUrl;
              return (
                <div
                  key={product.id}
                  onClick={() => router.push(`/products/${product.id}`)}
                  style={{
                    backgroundColor: "#161616", border: "1px solid #2A2A2A",
                    borderRadius: "14px", padding: "16px 20px",
                    display: "flex", alignItems: "center", gap: "16px",
                    cursor: "pointer",
                  }}
                >
                  {/* Serial number */}
                  <div style={{
                    width: "24px", flexShrink: 0, textAlign: "right",
                    fontSize: "12px", color: "#555", fontWeight: 600,
                  }}>
                    {index + 1}
                  </div>

                  {/* Product thumbnail — the real deal image, so a wrong/mismatched
                      photo is obvious at a glance without opening the product */}
                  {product.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      style={{ width: "42px", height: "42px", borderRadius: "10px", objectFit: "cover", backgroundColor: "#1E1E1E", flexShrink: 0 }}
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.style.display = "none";
                        const fallback = img.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                  ) : null}
                  <div style={{
                    width: "42px", height: "42px", borderRadius: "10px",
                    backgroundColor: "#1E1E1E", display: product.images?.[0] ? "none" : "flex",
                    alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0,
                  }}>
                    {product.category?.icon || "📦"}
                  </div>

                  {/* Product info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "#fff", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {product.name}
                    </div>
                    <div style={{ fontSize: "12px", color: "#555" }}>
                      {product.brand && <span>{product.brand} · </span>}
                      <span>{product.category?.name}</span>
                    </div>
                  </div>

                  {/* Source badge — where this product came from */}
                  {(() => {
                    const src = SOURCE_META[product.sourceType] || SOURCE_META.admin;
                    return (
                      <div style={{
                        backgroundColor: `${src.color}15`, border: `1px solid ${src.color}40`,
                        borderRadius: "8px", padding: "4px 10px",
                        fontSize: "11px", color: src.color, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap",
                      }}>
                        {src.icon} {src.label}
                      </div>
                    );
                  })()}

                  {/* Price */}
                  {listing && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>
                        ₹{listing.currentPrice.toLocaleString("en-IN")}
                      </div>
                      <div style={{ fontSize: "11px", color: "#EF4444" }}>
                        -{listing.discountPct}% off
                      </div>
                    </div>
                  )}

                  {/* Store badge */}
                  {listing && (
                    <div style={{
                      backgroundColor: "#1E1E1E", border: "1px solid #2A2A2A",
                      borderRadius: "8px", padding: "4px 10px",
                      fontSize: "11px", color: "#888", flexShrink: 0,
                    }}>
                      {listing.store.name}
                    </div>
                  )}

                  {/* Affiliate status */}
                  {listing && (
                    isReady ? (
                      <div style={{
                        backgroundColor: "#00C89615", border: "1px solid #00C89630",
                        borderRadius: "8px", padding: "4px 10px",
                        fontSize: "11px", color: "#00C896", fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap",
                      }}>
                        🟢 Ready
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); openFix(listing); }}
                        style={{
                          backgroundColor: "#F59E0B15", border: "1px solid #F59E0B40",
                          borderRadius: "8px", padding: "4px 10px",
                          fontSize: "11px", color: "#F59E0B", fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap",
                          cursor: "pointer",
                        }}
                      >
                        🟡 Missing Affiliate Link
                      </button>
                    )
                  )}

                  {/* Status */}
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                    backgroundColor: product.status === "active" ? "#00C896" : "#EF4444",
                  }} />

                  {/* Delete */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(product); setDeleteError(""); }}
                    title="Remove product"
                    style={{
                      background: "none", border: "1px solid #2A2A2A", borderRadius: "8px",
                      width: "32px", height: "32px", flexShrink: 0, cursor: "pointer",
                      color: "#666", fontSize: "14px", display: "flex",
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    🗑
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Quick-fix modal for missing affiliate links */}
      {fixListing && (
        <div
          onClick={() => setFixListing(null)}
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "16px",
              padding: "24px", width: "480px", maxWidth: "90vw",
            }}
          >
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
              💰 Generate Affiliate Link
            </h3>
            <p style={{ fontSize: "12px", color: "#555", marginBottom: "16px" }}>
              {fixListing.store.name} · without this, this listing earns no commission.
            </p>

            <label style={{ display: "block", fontSize: "11px", color: "#666", marginBottom: "6px", fontWeight: 600 }}>
              STORE URL
            </label>
            <div style={{
              backgroundColor: "#1E1E1E", border: "1px solid #2A2A2A", borderRadius: "10px",
              padding: "10px 14px", fontSize: "12px", color: "#888", marginBottom: "14px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {fixListing.storeUrl}
            </div>

            <label style={{ display: "block", fontSize: "11px", color: "#00C896", marginBottom: "6px", fontWeight: 600 }}>
              EARNKARO AFFILIATE LINK
            </label>
            <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
              <input
                placeholder="https://ekaro.in/enkr2025XXXXXXX"
                value={fixUrl}
                onChange={(e) => setFixUrl(e.target.value)}
                style={{
                  flex: 1, backgroundColor: "#1E1E1E", border: "1px solid #2A2A2A", borderRadius: "10px",
                  padding: "10px 14px", fontSize: "13px", color: "#fff", outline: "none",
                }}
              />
              <button
                onClick={handleGenerateInModal}
                disabled={fixing}
                style={{
                  backgroundColor: fixing ? "#1E1E1E" : "#00C89620",
                  color: fixing ? "#555" : "#00C896",
                  border: "1px solid #00C89650", borderRadius: "10px",
                  padding: "0 16px", fontSize: "13px", fontWeight: 700,
                  cursor: fixing ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                }}
              >
                {fixing ? "⏳..." : "⚡ Generate"}
              </button>
            </div>

            {fixMsg && (
              <p style={{ fontSize: "11px", marginBottom: "14px", color: fixMsg.startsWith("✅") ? "#00C896" : "#F87171" }}>
                {fixMsg}
              </p>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={handleSaveFix}
                disabled={fixing}
                style={{
                  flex: 1, backgroundColor: fixing ? "#1E1E1E" : "#00C896",
                  color: fixing ? "#555" : "#000",
                  border: "none", borderRadius: "10px",
                  padding: "12px", fontSize: "13px", fontWeight: 700,
                  cursor: fixing ? "not-allowed" : "pointer",
                }}
              >
                Save
              </button>
              <button
                onClick={() => setFixListing(null)}
                style={{
                  backgroundColor: "#1E1E1E", color: "#666", border: "1px solid #2A2A2A",
                  borderRadius: "10px", padding: "12px 20px", fontSize: "13px", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div
          onClick={() => !deletingId && setConfirmDelete(null)}
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "16px",
              padding: "24px", width: "420px", maxWidth: "90vw",
            }}
          >
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>
              🗑 Remove Product?
            </h3>
            <p style={{ fontSize: "13px", color: "#888", marginBottom: "18px", lineHeight: 1.5 }}>
              <strong style={{ color: "#fff" }}>{confirmDelete.name}</strong> will be removed from the DealMind homepage and product pages immediately. Past click and purchase history is kept for accounting — nothing is permanently deleted.
            </p>

            {deleteError && (
              <p style={{ fontSize: "12px", color: "#F87171", marginBottom: "14px" }}>❌ {deleteError}</p>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={handleDelete}
                disabled={!!deletingId}
                style={{
                  flex: 1, backgroundColor: deletingId ? "#3a1414" : "#EF444420",
                  color: deletingId ? "#764" : "#F87171",
                  border: "1px solid #EF444450", borderRadius: "10px",
                  padding: "12px", fontSize: "13px", fontWeight: 700,
                  cursor: deletingId ? "not-allowed" : "pointer",
                }}
              >
                {deletingId ? "Removing..." : "Remove Product"}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={!!deletingId}
                style={{
                  backgroundColor: "#1E1E1E", color: "#666", border: "1px solid #2A2A2A",
                  borderRadius: "10px", padding: "12px 20px", fontSize: "13px", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
