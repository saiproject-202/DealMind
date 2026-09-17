"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminSidebar from "@/components/layout/AdminSidebar";

interface Store { id: string; name: string; affiliateNetwork: string; baseUrl?: string; }
interface Category { id: string; name: string; icon: string | null; variantTypes: string[] }

const EMPTY = {
  name: "", brand: "", categoryId: "", storeId: "",
  currentPrice: "", originalPrice: "",
  storeUrl: "", affiliateUrl: "", couponCode: "",
  rating: "", reviewCount: "", description: "", imageUrl: "",
};

export default function AddProductPage() {
  const router = useRouter();
  const [stores, setStores]         = useState<Store[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm]             = useState(EMPTY);
  const [loading, setLoading]       = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [success, setSuccess]       = useState(false);
  const [error, setError]           = useState("");
  const [extractUrl, setExtractUrl] = useState("");
  const [extractMsg, setExtractMsg] = useState("");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkMsg, setLinkMsg] = useState("");
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  // Keyed by variant type (e.g. "Color") → comma-separated values the admin typed (e.g. "Black, Blue")
  const [variantInputs, setVariantInputs] = useState<Record<string, string>>({});
  // AI-generated Overview bullets + Specifications table — carried through
  // silently from Auto Extract to submission, not directly user-edited.
  const [extractedOverview, setExtractedOverview] = useState<string[]>([]);
  const [extractedSpecs, setExtractedSpecs] = useState<Record<string, string>>({});

  const discountPct =
    form.currentPrice && form.originalPrice
      ? Math.round(((Number(form.originalPrice) - Number(form.currentPrice)) / Number(form.originalPrice)) * 100)
      : 0;

  // Which variant fields to show is driven entirely by the selected
  // category's variantTypes — nothing hardcoded per-category here.
  const activeVariantTypes = categories.find((c) => c.id === form.categoryId)?.variantTypes || [];

  const buildVariantsPayload = () =>
    activeVariantTypes
      .map((type) => ({
        type,
        values: (variantInputs[type] || "").split(",").map((v) => v.trim()).filter(Boolean),
      }))
      .filter((v) => v.values.length > 0);

  useEffect(() => {
    const token = localStorage.getItem("dm_admin_token");
    if (!token) { router.push("/login"); return; }
    const hdrs = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch("http://localhost:4001/api/admin/stores",     { headers: hdrs }).then((r) => r.json()),
      fetch("http://localhost:4001/api/admin/categories", { headers: hdrs }).then((r) => r.json()),
    ]).then(([sd, cd]) => {
      if (sd.stores)     setStores(sd.stores);
      if (cd.categories) setCategories(cd.categories);
    });
  }, [router]);

  const set = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  // ── Auto-extract from URL ──────────────────────────────────────
  const handleExtract = async () => {
    if (!extractUrl.trim()) {
      setExtractMsg("Please paste a product URL first.");
      return;
    }
    setExtractMsg("");
    setExtracting(true);

    try {
      const token = localStorage.getItem("dm_admin_token");
      const res = await fetch("http://localhost:4001/api/admin/extract-product", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: extractUrl.trim() }),
      });
      const data = await res.json();

      if (!data.success) {
        setExtractMsg("❌ " + (data.error || "Extraction failed."));
        setExtracting(false);
        return;
      }

      const e = data.extracted;

      // Find matching category by name
      const matchedCat = categories.find(
        (c) => c.name.toLowerCase() === (e.suggestedCategory || "").toLowerCase()
      );

      // Auto-detect store from URL
      const urlLower = (data.finalUrl || extractUrl).toLowerCase();
      const matchedStore = stores.find((s) =>
        urlLower.includes(s.name.toLowerCase()) ||
        urlLower.includes(s.baseUrl?.replace("https://www.", "") || "")
      );

      // Fill form
      setForm((prev) => ({
        ...prev,
        name:          e.name         || prev.name,
        brand:         e.brand        || prev.brand,
        currentPrice:  e.currentPrice  ? String(e.currentPrice)  : prev.currentPrice,
        originalPrice: e.originalPrice ? String(e.originalPrice) : prev.originalPrice,
        rating:        e.rating        ? String(e.rating)        : prev.rating,
        reviewCount:   e.reviewCount   ? String(e.reviewCount)   : prev.reviewCount,
        description:   e.description  || prev.description,
        imageUrl:      e.imageUrl     || prev.imageUrl,
        storeUrl:      data.finalUrl  || extractUrl,
        categoryId:    matchedCat     ? matchedCat.id   : prev.categoryId,
        storeId:       matchedStore   ? matchedStore.id : prev.storeId,
      }));
      if (Array.isArray(e.overview)) setExtractedOverview(e.overview);
      if (e.specifications && typeof e.specifications === "object") setExtractedSpecs(e.specifications);
      if (Array.isArray(e.variants) && e.variants.length) {
        setVariantInputs((prev) => {
          const next = { ...prev };
          for (const v of e.variants as { type?: string; values?: string[] }[]) {
            if (!v.type || !Array.isArray(v.values) || !v.values.length) continue;
            // Match the AI's type name onto the category's actual casing
            // (e.g. "color" -> "Color") so it lands in the visible field.
            const knownType = matchedCat?.variantTypes.find(
              (t) => t.toLowerCase() === v.type!.toLowerCase()
            );
            next[knownType || v.type] = v.values.join(", ");
          }
          return next;
        });
      }

      setExtractMsg("✅ Details extracted! Review below and add your EarnKaro affiliate link.");
    } catch {
      setExtractMsg("❌ Could not connect to API.");
    }
    setExtracting(false);
  };

  // ── Generate EarnKaro affiliate link ─────────────────────────────
  const handleGenerateLink = async () => {
    if (!form.storeUrl.trim()) {
      setLinkMsg("❌ Fill in the Store URL first.");
      return;
    }
    setLinkMsg("");
    setGeneratingLink(true);
    try {
      const token = localStorage.getItem("dm_admin_token");
      const res = await fetch("http://localhost:4001/api/admin/generate-affiliate-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: form.storeUrl.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setLinkMsg("❌ " + (data.error || "Could not generate link."));
      } else {
        set("affiliateUrl", data.affiliateUrl);
        setLinkMsg("✅ Affiliate link generated.");
      }
    } catch {
      setLinkMsg("❌ Could not connect to API.");
    }
    setGeneratingLink(false);
  };

  // ── Submit product ─────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");
    if (!form.name)          return setError("Product name is required.");
    if (!form.categoryId)    return setError("Please select a category.");
    if (!form.storeId)       return setError("Please select a store.");
    if (!form.currentPrice)  return setError("Current price is required.");
    if (!form.originalPrice) return setError("Original price is required.");
    if (!form.storeUrl)      return setError("Store product URL is required.");
    if (Number(form.currentPrice) > Number(form.originalPrice)) {
      return setError("Current price cannot be more than original price.");
    }

    setLoading(true);
    const token = localStorage.getItem("dm_admin_token");
    try {
      const res = await fetch("http://localhost:4001/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name:          form.name,
          brand:         form.brand         || undefined,
          categoryId:    form.categoryId,
          storeId:       form.storeId,
          currentPrice:  Number(form.currentPrice),
          originalPrice: Number(form.originalPrice),
          storeUrl:      form.storeUrl,
          affiliateUrl:  form.affiliateUrl  || form.storeUrl,
          couponCode:    form.couponCode    || undefined,
          rating:        form.rating        ? Number(form.rating)      : undefined,
          reviewCount:   form.reviewCount   ? Number(form.reviewCount) : undefined,
          description:   form.description   || undefined,
          imageUrl:      form.imageUrl      || undefined,
          variants:      buildVariantsPayload(),
          overview:      extractedOverview.length ? extractedOverview : undefined,
          specs:         Object.keys(extractedSpecs).length ? extractedSpecs : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setForm(EMPTY);
        setExtractUrl("");
        setExtractMsg("");
        setVariantInputs({});
        setExtractedOverview([]);
        setExtractedSpecs({});
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error || "Failed to add product.");
      }
    } catch {
      setError("Cannot connect to API. Is the server running?");
    }
    setLoading(false);
  };

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

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />
      <main style={{ flex: 1, padding: "32px", overflowY: "auto", maxWidth: "900px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
          <Link href="/products" style={{ color: "#555", textDecoration: "none", fontSize: "13px" }}>
            ← Products
          </Link>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff" }}>Add New Product</h1>
            <p style={{ fontSize: "13px", color: "#555", marginTop: "2px" }}>
              Paste any product URL — AI will fill the details automatically
            </p>
          </div>
        </div>

        {/* ── AUTO EXTRACT SECTION (hero feature) ──────────────── */}
        <div style={{
          background: "linear-gradient(135deg, #00C89610, #00C89605)",
          border: "1px solid #00C89630",
          borderRadius: "20px", padding: "24px", marginBottom: "24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span style={{ fontSize: "22px" }}>🤖</span>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>
                AI Auto Extract
              </div>
              <div style={{ fontSize: "12px", color: "#00C896" }}>
                Paste any Amazon, Flipkart, or EarnKaro link — Claude fills everything
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <input
              placeholder="Paste product URL here... (Amazon / Flipkart / EarnKaro / Myntra)"
              value={extractUrl}
              onChange={(e) => setExtractUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleExtract()}
              style={{
                flex: 1, backgroundColor: "#0D0D0D",
                border: "1px solid #00C89640", borderRadius: "12px",
                padding: "13px 16px", fontSize: "13px", color: "#fff", outline: "none",
              }}
            />
            <button
              onClick={handleExtract}
              disabled={extracting}
              style={{
                backgroundColor: extracting ? "#1E1E1E" : "#00C896",
                color: extracting ? "#555" : "#000",
                border: "none", borderRadius: "12px",
                padding: "13px 22px", fontSize: "13px", fontWeight: 700,
                cursor: extracting ? "not-allowed" : "pointer",
                whiteSpace: "nowrap", flexShrink: 0,
                minWidth: "150px",
              }}
            >
              {extracting ? "⏳ Extracting..." : "✨ Auto Extract"}
            </button>
          </div>

          {/* Extraction message */}
          {extractMsg && (
            <div style={{
              marginTop: "12px", padding: "10px 14px", borderRadius: "10px",
              fontSize: "13px", fontWeight: 500,
              backgroundColor: extractMsg.startsWith("✅") ? "#00C89615" : "#EF444415",
              color: extractMsg.startsWith("✅") ? "#00C896" : "#F87171",
              border: `1px solid ${extractMsg.startsWith("✅") ? "#00C89630" : "#EF444430"}`,
            }}>
              {extractMsg}
            </div>
          )}

          {extracting && (
            <div style={{ marginTop: "12px", fontSize: "12px", color: "#555" }}>
              🔄 Fetching page → sending to Claude AI → extracting product data...
            </div>
          )}
        </div>

        {/* Success / Error banners */}
        {success && (
          <div style={{ backgroundColor:"#00C89615", border:"1px solid #00C89630", borderRadius:"12px", padding:"14px 18px", marginBottom:"20px", fontSize:"14px", color:"#00C896", fontWeight:600 }}>
            {"✅ Product added successfully! It's now live in the database."}
          </div>
        )}
        {error && (
          <div style={{ backgroundColor:"#EF444415", border:"1px solid #EF444430", borderRadius:"12px", padding:"14px 18px", marginBottom:"20px", fontSize:"13px", color:"#F87171" }}>
            ❌ {error}
          </div>
        )}

        {/* ── Section 1: Basic Info ──────────────────────────── */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:700, color:"#fff", marginBottom:"18px" }}>
            📋 Basic Information
          </h2>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div style={{ gridColumn:"1 / -1" }}>
              <label style={labelStyle}>PRODUCT NAME *</label>
              <input placeholder="e.g. OnePlus Nord 4 5G (16GB+256GB)" value={form.name} onChange={(e) => set("name", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>BRAND</label>
              <input placeholder="e.g. OnePlus" value={form.brand} onChange={(e) => set("brand", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="category" style={labelStyle}>
                CATEGORY *
              </label>

              <select
                id="category"
                aria-label="Category"
                value={form.categoryId}
                onChange={(e) => set("categoryId", e.target.value)}
                style={inputStyle}
              >
                <option value="" style={{ backgroundColor: "#1E1E1E", color: "#fff" }}>— Select category —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id} style={{ backgroundColor: "#1E1E1E", color: "#fff" }}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn:"1 / -1" }}>
              <label style={labelStyle}>DESCRIPTION</label>
              <textarea placeholder="Short product description..." value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} style={{ ...inputStyle, resize:"vertical" as const }} />
              {(extractedOverview.length > 0 || Object.keys(extractedSpecs).length > 0) && (
                <p style={{ fontSize:"11px", color:"#00C896", marginTop:"6px" }}>
                  ✓ AI Overview ({extractedOverview.length} points) · Specifications ({Object.keys(extractedSpecs).length} fields) captured — will show on the product page.
                </p>
              )}
            </div>
            <div style={{ gridColumn:"1 / -1", display:"flex", gap:"14px", alignItems:"flex-start" }}>
              <div style={{ flex:1 }}>
                <label style={labelStyle}>IMAGE URL (auto-filled from Auto Extract, or paste your own)</label>
                <input placeholder="https://...jpg" value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} style={inputStyle} />
              </div>
              {form.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.imageUrl}
                  alt="Preview"
                  title="Click to enlarge"
                  onClick={() => setImagePreviewOpen(true)}
                  style={{ width:"64px", height:"64px", borderRadius:"10px", objectFit:"cover", backgroundColor:"#1E1E1E", border:"1px solid #2A2A2A", flexShrink:0, cursor:"pointer" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Section: Variants (only shown when the selected category has any) ── */}
        {activeVariantTypes.length > 0 && (
          <div style={sectionStyle}>
            <h2 style={{ fontSize:"14px", fontWeight:700, color:"#fff", marginBottom:"4px" }}>🎨 Variants</h2>
            <p style={{ fontSize:"12px", color:"#555", marginBottom:"18px" }}>
              Comma-separated values for this category. Leave a field blank to skip it.
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
              {activeVariantTypes.map((type) => (
                <div key={type}>
                  <label style={labelStyle}>{type.toUpperCase()}</label>
                  <input
                    placeholder={`e.g. ${type === "Color" ? "Black, Blue, Red" : type === "Size" ? "S, M, L, XL" : "Value 1, Value 2"}`}
                    value={variantInputs[type] || ""}
                    onChange={(e) => setVariantInputs((p) => ({ ...p, [type]: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Image preview lightbox */}
        {imagePreviewOpen && form.imageUrl && (
          <div
            onClick={() => setImagePreviewOpen(false)}
            style={{
              position:"fixed", inset:0, backgroundColor:"rgba(0,0,0,0.85)",
              display:"flex", alignItems:"center", justifyContent:"center",
              zIndex:1000, cursor:"zoom-out", padding:"40px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={form.imageUrl}
              alt="Full preview"
              style={{ maxWidth:"90vw", maxHeight:"90vh", borderRadius:"12px", boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}
            />
            <button
              onClick={() => setImagePreviewOpen(false)}
              style={{
                position:"absolute", top:"24px", right:"24px",
                backgroundColor:"#161616", color:"#fff", border:"1px solid #2A2A2A",
                borderRadius:"10px", width:"36px", height:"36px", fontSize:"16px", cursor:"pointer",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Section 2: Pricing ────────────────────────────── */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:700, color:"#fff", marginBottom:"18px" }}>💰 Pricing</h2>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"14px" }}>
            <div>
              <label style={labelStyle}>CURRENT PRICE (₹) *</label>
              <input type="number" placeholder="24999" value={form.currentPrice} onChange={(e) => set("currentPrice", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>ORIGINAL / MRP (₹) *</label>
              <input type="number" placeholder="29999" value={form.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>DISCOUNT % (auto)</label>
              <div style={{ ...inputStyle, backgroundColor: discountPct > 0 ? "#00C89615" : "#1E1E1E", color: discountPct > 0 ? "#00C896" : "#555", fontWeight:700, display:"flex", alignItems:"center" }}>
                {discountPct > 0 ? `${discountPct}% OFF` : "Fill prices above"}
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 3: Store & Affiliate ──────────────────── */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:700, color:"#fff", marginBottom:"4px" }}>🔗 Store & Affiliate Link</h2>
          <p style={{ fontSize:"12px", color:"#555", marginBottom:"18px" }}>
            The EarnKaro link is what earns you commission. Get it from the EarnKaro app → Convert Link.
          </p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div>
              <label htmlFor="store" style={labelStyle}>
                STORE *
              </label>

              <select
                id="store"
                aria-label="Store"
                value={form.storeId}
                onChange={(e) => set("storeId", e.target.value)}
                style={inputStyle}
              >
                <option value="" style={{ backgroundColor: "#1E1E1E", color: "#fff" }}>— Select store —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id} style={{ backgroundColor: "#1E1E1E", color: "#fff" }}>{s.name} ({s.affiliateNetwork})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>COUPON CODE (optional)</label>
              <input placeholder="e.g. SAVE500" value={form.couponCode} onChange={(e) => set("couponCode", e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn:"1 / -1" }}>
              <label style={labelStyle}>STORE URL * (original product link)</label>
              <input placeholder="https://www.amazon.in/dp/B0XXXXXXXX" value={form.storeUrl} onChange={(e) => set("storeUrl", e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn:"1 / -1" }}>
              <label style={{ ...labelStyle, color:"#00C896" }}>EARNKARO AFFILIATE LINK 💰 (your commission link)</label>
              <div style={{ display:"flex", gap:"10px" }}>
                <input
                  placeholder="https://ekaro.in/enkr2025XXXXXXX"
                  value={form.affiliateUrl}
                  onChange={(e) => set("affiliateUrl", e.target.value)}
                  style={{ ...inputStyle, flex: 1, borderColor: form.affiliateUrl ? "#00C89650" : "#2A2A2A" }}
                />
                <button
                  type="button"
                  onClick={handleGenerateLink}
                  disabled={generatingLink}
                  style={{
                    backgroundColor: generatingLink ? "#1E1E1E" : "#00C89620",
                    color: generatingLink ? "#555" : "#00C896",
                    border: "1px solid #00C89650", borderRadius: "10px",
                    padding: "0 18px", fontSize: "13px", fontWeight: 700,
                    cursor: generatingLink ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >
                  {generatingLink ? "⏳ Generating..." : "⚡ Generate"}
                </button>
              </div>
              {linkMsg && (
                <p style={{ fontSize:"11px", marginTop:"6px", color: linkMsg.startsWith("✅") ? "#00C896" : "#F87171" }}>
                  {linkMsg}
                </p>
              )}
              <p style={{ fontSize:"11px", color:"#444", marginTop:"5px" }}>
                Click Generate to auto-convert the Store URL via EarnKaro, or paste your own link manually.
              </p>
            </div>
          </div>
        </div>

        {/* ── Section 4: Ratings ────────────────────────────── */}
        <div style={sectionStyle}>
          <h2 style={{ fontSize:"14px", fontWeight:700, color:"#fff", marginBottom:"18px" }}>⭐ Ratings</h2>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
            <div>
              <label style={labelStyle}>RATING (0 – 5)</label>
              <input type="number" min="0" max="5" step="0.1" placeholder="4.3" value={form.rating} onChange={(e) => set("rating", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>REVIEW COUNT</label>
              <input type="number" placeholder="12400" value={form.reviewCount} onChange={(e) => set("reviewCount", e.target.value)} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div style={{ display:"flex", gap:"12px" }}>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              flex: 1,
              backgroundColor: loading ? "#1E1E1E" : "#00C896",
              color: loading ? "#555" : "#000",
              border: "none", borderRadius: "14px",
              padding: "16px", fontSize: "15px", fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Adding product..." : "✅ Add Product to DealMind"}
          </button>
          <button
            onClick={() => { setForm(EMPTY); setExtractUrl(""); setExtractMsg(""); setLinkMsg(""); setVariantInputs({}); setExtractedOverview([]); setExtractedSpecs({}); }}
            style={{ backgroundColor:"#161616", color:"#666", border:"1px solid #2A2A2A", borderRadius:"14px", padding:"16px 24px", fontSize:"14px", cursor:"pointer" }}
          >
            Clear
          </button>
        </div>
      </main>
    </div>
  );
}