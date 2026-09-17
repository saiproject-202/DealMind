"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";

interface SearchResult {
  id: string; name: string; brand: string | null;
  currentPrice: number; originalPrice: number; discountPct: number;
  store: string; category: string | null;
}


export default function SearchBar() {
  const router = useRouter();
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale results when the query is cleared
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiFetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          {
            auth: false,
          }
        );
        const data = await res.json();
        setResults(data.results || []);
        setOpen(true);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 350);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const goToProduct = (id: string) => {
    setOpen(false);
    router.push(`/product/${id}`);
  };

  return (
    <div ref={ref} style={{ flex: 1, maxWidth: "680px", margin: "0 auto", position: "relative" }}>
      <input
        type="text"
        placeholder="Search products, brands, deals..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        style={{ width: "100%", backgroundColor: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: "12px", padding: "10px 44px 10px 16px", fontSize: "14px", color: "#fff", outline: "none" }}
      />
      <span style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "#555", fontSize: "16px" }}>
        {loading ? "⏳" : "🔍"}
      </span>

      {open && (
        <div style={{
          position: "absolute", top: "48px", left: 0, right: 0,
          backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "14px",
          maxHeight: "400px", overflowY: "auto", zIndex: 100,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}>
          {results.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", fontSize: "12px", color: "#555" }}>
              {'No products found for "{query}"'}
            </div>
          ) : (
            results.map(r => (
              <div
                key={r.id}
                onClick={() => goToProduct(r.id)}
                style={{ padding: "12px 16px", borderBottom: "1px solid #1E1E1E", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", color: "#fff", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
                    {r.store} {r.category ? `· ${r.category}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: "13px", color: "#00C896", fontWeight: 700 }}>
                    ₹{Number(r.currentPrice).toLocaleString("en-IN")}
                  </div>
                  {r.discountPct > 0 && (
                    <div style={{ fontSize: "10px", color: "#EF4444" }}>-{r.discountPct}%</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}