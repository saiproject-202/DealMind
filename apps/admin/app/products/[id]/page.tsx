"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import AdminSidebar from "@/components/layout/AdminSidebar";

interface Category { id: string; name: string; icon: string | null; variantTypes: string[] }
interface Variant { type: string; value: string }
interface Listing {
  id: string; currentPrice: string; originalPrice: string | null; discountPct: string | null;
  storeUrl: string; affiliateUrl: string | null; rating: string | null; reviewCount: number | null;
  store: { name: string };
}
interface Product {
  id: string; name: string; brand: string | null; description: string | null;
  images: string[]; categoryId: string; category: Category;
  listings: Listing[]; variants: Variant[];
}

const inputStyle = {
  width: "100%", backgroundColor: "#1E1E1E",
  border: "1px solid #2A2A2A", borderRadius: "10px",
  padding: "11px 14px", fontSize: "13px", color: "#fff", outline: "none",
};
const labelStyle = {
  display: "block" as const, fontSize: "11px",
  color: "#666", marginBottom: "6px", fontWeight: 600 as const,
};
const sectionStyle = {
  backgroundColor: "#161616", border: "1px solid #2A2A2A",
  borderRadius: "16px", padding: "24px", marginBottom: "20px",
};

export default function ProductDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const token = () => localStorage.getItem("dm_admin_token") || "";

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [msg, setMsg]               = useState("");

  const [form, setForm] = useState({
    name: "", brand: "", categoryId: "", description: "", imageUrl: "",
    currentPrice: "", originalPrice: "", storeUrl: "", affiliateUrl: "",
    rating: "", reviewCount: "",
  });
  const [variantInputs, setVariantInputs] = useState<Record<string, string>>({});
  const [storeName, setStoreName] = useState("");

  const discountPct =
    form.currentPrice && form.originalPrice
      ? Math.round(((Number(form.originalPrice) - Number(form.currentPrice)) / Number(form.originalPrice)) * 100)
      : 0;
  // Original/MRP should never be lower than the current selling price — if
  // it is, the extraction pulled a stale or mismatched number and needs a
  // manual look, not a silently wrong "discount".
  const priceIsInverted = !!form.currentPrice && !!form.originalPrice && Number(form.originalPrice) < Number(form.currentPrice);
  // A ₹0 (or missing) current price means there's no real product behind
  // this listing yet — most often a category/search-page link that never
  // had one single price to extract. Left unflagged, this silently shows
  // as "100% OFF", which is worse than showing nothing.
  const priceIsZero = form.currentPrice !== "" && Number(form.currentPrice) <= 0;

  const activeVariantTypes = categories.find((c) => c.id === form.categoryId)?.variantTypes || [];

  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  const hydrate = (product: Product) => {
    const listing = product.listings[0];
    setForm({
      name: product.name, brand: product.brand || "",
      categoryId: product.categoryId, description: product.description || "",
      imageUrl: product.images[0] || "",
      currentPrice: listing ? String(listing.currentPrice) : "",
      originalPrice: listing?.originalPrice ? String(listing.originalPrice) : "",
      storeUrl: listing?.storeUrl || "", affiliateUrl: listing?.affiliateUrl || "",
      rating: listing?.rating ? String(listing.rating) : "",
      reviewCount: listing?.reviewCount ? String(listing.reviewCount) : "",
    });
    setStoreName(listing?.store.name || "");
    const grouped: Record<string, string[]> = {};
    for (const v of product.variants) {
      (grouped[v.type] ||= []).push(v.value);
    }
    setVariantInputs(Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.join(", ")])));
  };

  useEffect(() => {
    if (!token()) { router.push("/login"); return; }
    const hdrs = { Authorization: `Bearer ${token()}` };
    Promise.all([
      fetch(`http://localhost:4001/api/admin/products/${id}`, { headers: hdrs }).then((r) => r.json()),
      fetch("http://localhost:4001/api/admin/categories", { headers: hdrs }).then((r) => r.json()),
    ]).then(([pd, cd]) => {
      if (cd.categories) setCategories(cd.categories);
      if (pd.product) hydrate(pd.product);
      else setMsg("❌ Product not found.");
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const buildVariantsPayload = () =>
    activeVariantTypes
      .map((type) => ({
        type,
        values: (variantInputs[type] || "").split(",").map((v) => v.trim()).filter(Boolean),
      }))
      .filter((v) => v.values.length > 0);

  // ── Re-extract: re-run AI extraction against the current store URL,
  // fill the form with fresh data for review — nothing is saved until
  // the admin hits Save Changes below.
  const handleReExtract = async () => {
    if (!form.storeUrl.trim()) { setMsg("❌ No store URL to re-extract from."); return; }
    setMsg("");
    setExtracting(true);
    try {
      const res = await fetch("http://localhost:4001/api/admin/extract-product", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ url: form.storeUrl.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setMsg("❌ " + (data.error || "Re-extraction failed."));
        setExtracting(false);
        return;
      }
      const e = data.extracted;
      const matchedCat = categories.find((c) => c.name.toLowerCase() === (e.suggestedCategory || "").toLowerCase());
      let originalPriceMissing = false;
      setForm((prev) => {
        const nextCurrentPrice = e.currentPrice ? String(e.currentPrice) : prev.currentPrice;
        // Keeping the old originalPrice when only currentPrice was
        // re-fetched can silently produce an "MRP < current price" pair
        // that looks like real (wrong) data instead of missing data — if
        // the new extraction didn't return one, blank it out and let the
        // admin fill it in rather than pairing it with a stale number.
        const keepOldOriginal = Number(prev.originalPrice) >= Number(nextCurrentPrice);
        if (!e.originalPrice && !keepOldOriginal) originalPriceMissing = true;
        return {
          ...prev,
          name: e.name || prev.name,
          brand: e.brand || prev.brand,
          currentPrice: nextCurrentPrice,
          originalPrice: e.originalPrice ? String(e.originalPrice) : (keepOldOriginal ? prev.originalPrice : ""),
          rating: e.rating ? String(e.rating) : prev.rating,
          reviewCount: e.reviewCount ? String(e.reviewCount) : prev.reviewCount,
          description: e.description || prev.description,
          imageUrl: e.imageUrl || prev.imageUrl,
          storeUrl: data.finalUrl || prev.storeUrl,
          categoryId: matchedCat ? matchedCat.id : prev.categoryId,
        };
      });
      if (Array.isArray(e.variants) && e.variants.length) {
        setVariantInputs((prev) => {
          const next = { ...prev };
          for (const v of e.variants as { type?: string; values?: string[] }[]) {
            if (!v.type || !Array.isArray(v.values) || !v.values.length) continue;
            const knownType = matchedCat?.variantTypes.find((t) => t.toLowerCase() === v.type!.toLowerCase());
            next[knownType || v.type] = v.values.join(", ");
          }
          return next;
        });
      }
      setMsg(
        originalPriceMissing
          ? "⚠ Re-extracted, but the MRP/Original Price wasn't found on the store page — cleared instead of keeping the old value, please fill it in manually. Nothing was saved automatically."
          : "✅ Re-extracted from the store page. Review the fields below, then Save Changes — nothing was saved automatically. The EarnKaro affiliate link was left untouched."
      );
    } catch {
      setMsg("❌ Could not connect to API.");
    }
    setExtracting(false);
  };

  const handleGenerateLink = async () => {
    if (!form.storeUrl.trim()) { setMsg("❌ Fill in the Store URL first."); return; }
    setMsg("");
    try {
      const res = await fetch("http://localhost:4001/api/admin/generate-affiliate-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ url: form.storeUrl.trim() }),
      });
      const data = await res.json();
      if (!data.success) setMsg("❌ " + (data.error || "Could not generate link."));
      else { set("affiliateUrl", data.affiliateUrl); setMsg("✅ Affiliate link generated — review then Save Changes."); }
    } catch {
      setMsg("❌ Could not connect to API.");
    }
  };

  const handleSave = async () => {
    setMsg("");
    if (!form.name) { setMsg("❌ Product name is required."); return; }
    if (!form.currentPrice) { setMsg("❌ Current price is required."); return; }
    setSaving(true);
    try {
      const res = await fetch(`http://localhost:4001/api/admin/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          name: form.name, brand: form.brand || null,
          categoryId: form.categoryId || undefined, description: form.description || null,
          imageUrl: form.imageUrl || undefined,
          variants: buildVariantsPayload(),
          currentPrice: Number(form.currentPrice),
          originalPrice: form.originalPrice ? Number(form.originalPrice) : null,
          storeUrl: form.storeUrl || undefined,
          affiliateUrl: form.affiliateUrl || null,
          rating: form.rating ? Number(form.rating) : null,
          reviewCount: form.reviewCount ? Number(form.reviewCount) : null,
        }),
      });
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      if (data.success) {
        hydrate(data.product);
        setMsg("✅ Saved.");
      } else {
        setMsg("❌ " + (data.error || "Failed to save."));
      }
    } catch {
      setMsg("❌ Could not connect to API.");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <AdminSidebar />
        <main style={{ flex: 1, padding: "32px" }}>
          <p style={{ color: "#555", fontSize: "13px" }}>Loading product...</p>
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />
      <main style={{ flex: 1, padding: "32px", overflowY: "auto", maxWidth: "900px" }}>

        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
          <button
            onClick={() => router.back()}
            style={{ background: "none", border: "none", color: "#555", fontSize: "13px", cursor: "pointer", padding: 0 }}
          >
            ← Back
          </button>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff" }}>Product Details</h1>
            <p style={{ fontSize: "13px", color: "#555", marginTop: "2px" }}>
              Verify every field against the live store page — fix anything wrong, then save.
            </p>
          </div>
        </div>

        {/* Re-extract */}
        <div style={{
          background: "linear-gradient(135deg, #00C89610, #00C89605)",
          border: "1px solid #00C89630", borderRadius: "20px", padding: "20px", marginBottom: "24px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap",
        }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>🤖 Re-extract from store page</div>
            <div style={{ fontSize: "12px", color: "#00C896", marginTop: "2px" }}>
              Re-runs AI extraction against the store URL below and refills the fields for you to review.
            </div>
          </div>
          <button
            onClick={handleReExtract}
            disabled={extracting}
            style={{
              backgroundColor: extracting ? "#1E1E1E" : "#00C896",
              color: extracting ? "#555" : "#000",
              border: "none", borderRadius: "12px",
              padding: "12px 22px", fontSize: "13px", fontWeight: 700,
              cursor: extracting ? "not-allowed" : "pointer", whiteSpace: "nowrap",
            }}
          >
            {extracting ? "⏳ Re-extracting..." : "🔄 Refresh from store"}
          </button>
        </div>

        {msg && (
          <div style={{
            marginBottom: "20px", padding: "12px 16px", borderRadius: "10px",
            fontSize: "13px", fontWeight: 500,
            backgroundColor: msg.startsWith("✅") ? "#00C89615" : "#EF444415",
            color: msg.startsWith("✅") ? "#00C896" : "#F87171",
            border: `1px solid ${msg.startsWith("✅") ? "#00C89630" : "#EF444430"}`,
          }}>
            {msg}
          </div>
        )}

        {/* Basic info */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "18px" }}>📋 Basic Information</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>PRODUCT NAME *</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>BRAND</label>
              <input value={form.brand} onChange={(e) => set("brand", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="category" style={labelStyle}>CATEGORY</label>
              <select id="category" aria-label="Category" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} style={inputStyle}>
                <option value="" style={{ backgroundColor: "#1E1E1E", color: "#fff" }}>— Select category —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id} style={{ backgroundColor: "#1E1E1E", color: "#fff" }}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>DESCRIPTION (optional)</label>
              <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" as const }} />
            </div>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: "14px", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>IMAGE URL</label>
                <input value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} style={inputStyle} />
              </div>
              {form.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.imageUrl} alt="Preview"
                  style={{ width: "64px", height: "64px", borderRadius: "10px", objectFit: "cover", backgroundColor: "#1E1E1E", border: "1px solid #2A2A2A", flexShrink: 0 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Variants */}
        {activeVariantTypes.length > 0 && (
          <div style={sectionStyle}>
            <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>🎨 Variants</h2>
            <p style={{ fontSize: "12px", color: "#555", marginBottom: "18px" }}>Comma-separated values. Leave blank to skip.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              {activeVariantTypes.map((type) => (
                <div key={type}>
                  <label style={labelStyle}>{type.toUpperCase()}</label>
                  <input
                    value={variantInputs[type] || ""}
                    onChange={(e) => setVariantInputs((p) => ({ ...p, [type]: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pricing */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "18px" }}>💰 Pricing</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
            <div>
              <label style={labelStyle}>CURRENT PRICE (₹) *</label>
              <input type="number" value={form.currentPrice} onChange={(e) => set("currentPrice", e.target.value)} style={{ ...inputStyle, borderColor: priceIsInverted || priceIsZero ? "#EF4444" : "#2A2A2A" }} />
            </div>
            <div>
              <label style={labelStyle}>ORIGINAL / MRP (₹)</label>
              <input type="number" value={form.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} style={{ ...inputStyle, borderColor: priceIsInverted ? "#EF4444" : "#2A2A2A" }} />
            </div>
            <div>
              <label style={labelStyle}>DISCOUNT % (auto)</label>
              <div style={{ ...inputStyle, backgroundColor: priceIsInverted || priceIsZero ? "#EF444415" : discountPct > 0 ? "#00C89615" : "#1E1E1E", color: priceIsInverted || priceIsZero ? "#F87171" : discountPct > 0 ? "#00C896" : "#555", fontWeight: 700, display: "flex", alignItems: "center" }}>
                {priceIsInverted || priceIsZero ? "⚠ invalid" : discountPct > 0 ? `${discountPct}% OFF` : "—"}
              </div>
            </div>
          </div>
          {priceIsInverted && (
            <p style={{ fontSize: "12px", color: "#F87171", marginTop: "12px" }}>
              ⚠ Original/MRP (₹{form.originalPrice}) is lower than Current Price (₹{form.currentPrice}) — that&apos;s not possible for a real MRP. The extraction likely pulled a stale or mismatched number; check the store page and correct one of these before saving.
            </p>
          )}
          {priceIsZero && (
            <p style={{ fontSize: "12px", color: "#F87171", marginTop: "12px" }}>
              ⚠ Current Price is ₹0 — there&apos;s no real price behind this listing. This usually means the store link points to a category/search page rather than one specific product. Fix the store URL to a real product page and re-extract, or enter the correct price manually before saving.
            </p>
          )}
        </div>

        {/* Store & affiliate */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>🔗 Store & Affiliate Link</h2>
          <p style={{ fontSize: "12px", color: "#555", marginBottom: "18px" }}>Store: {storeName || "—"}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "14px" }}>
            <div>
              <label style={labelStyle}>STORE URL</label>
              <input value={form.storeUrl} onChange={(e) => set("storeUrl", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ ...labelStyle, color: "#00C896" }}>EARNKARO AFFILIATE LINK 💰 — verify this is your real commission link</label>
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  value={form.affiliateUrl}
                  onChange={(e) => set("affiliateUrl", e.target.value)}
                  style={{ ...inputStyle, flex: 1, borderColor: form.affiliateUrl ? "#00C89650" : "#2A2A2A" }}
                />
                <button
                  type="button" onClick={handleGenerateLink}
                  style={{ backgroundColor: "#00C89620", color: "#00C896", border: "1px solid #00C89650", borderRadius: "10px", padding: "0 18px", fontSize: "13px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  ⚡ Regenerate
                </button>
              </div>
              {form.affiliateUrl && (
                <a href={form.affiliateUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: "#3B82F6", marginTop: "6px", display: "inline-block" }}>
                  Open link in new tab to verify →
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Ratings */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "18px" }}>⭐ Ratings</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label style={labelStyle}>RATING (0 – 5)</label>
              <input type="number" min="0" max="5" step="0.1" value={form.rating} onChange={(e) => set("rating", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>REVIEW COUNT</label>
              <input type="number" value={form.reviewCount} onChange={(e) => set("reviewCount", e.target.value)} style={inputStyle} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "40px" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, backgroundColor: saving ? "#1E1E1E" : "#00C896",
              color: saving ? "#555" : "#000", border: "none", borderRadius: "14px",
              padding: "16px", fontSize: "15px", fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : "✅ Save Changes"}
          </button>
          <Link
            href="/products"
            style={{ backgroundColor: "#161616", color: "#666", border: "1px solid #2A2A2A", borderRadius: "14px", padding: "16px 24px", fontSize: "14px", cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center" }}
          >
            Cancel
          </Link>
        </div>
      </main>
    </div>
  );
}
