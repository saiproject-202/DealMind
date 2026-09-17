"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { getToken } from "@/lib/auth";

interface Props {
  listingId: string;
  initialState?: boolean; // pass from product page to skip the extra fetch
  size?: "sm" | "lg";
}

export default function WishlistButton({ listingId, initialState, size = "sm" }: Props) {
  const [saved, setSaved]     = useState(initialState ?? false);
  const [loading, setLoading] = useState(false);
  // getToken() reads localStorage, unavailable during server rendering —
  // doesn't currently branch the JSX (so no active hydration mismatch
  // today), but computing it at render time is the same unsafe pattern
  // that broke CartNoteBody; resolving it after mount closes that off
  // before some future edit makes it visible/rendered and breaks too.
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resolving real login state must wait until after mount (localStorage is unavailable during SSR)
    setIsLoggedIn(!!getToken());
  }, []);

  useEffect(() => {
    if (initialState !== undefined || !isLoggedIn) return;
    apiFetch(`/api/wishlist/${listingId}/status`)
      .then(r => r.json())
      .then(d => setSaved(!!d.wishlisted))
      .catch(() => {});
  }, [listingId, initialState, isLoggedIn]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) { window.location.href = "/login"; return; }

    setLoading(true);
    const method = saved ? "DELETE" : "POST";
    try {
      const res = await apiFetch(`/api/wishlist/${listingId}`, { method });
      const data = await res.json();
      setSaved(data.wishlisted);
    } catch {}
    setLoading(false);
  };

  const dim = size === "lg" ? "44px" : "32px";
  const fontSize = size === "lg" ? "18px" : "14px";

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={saved ? "Remove from wishlist" : "Save to wishlist"}
      style={{
        width: dim, height: dim, borderRadius: "50%",
        backgroundColor: saved ? "#EF444420" : "#1E1E1E",
        border: `1px solid ${saved ? "#EF444440" : "#2A2A2A"}`,
        color: saved ? "#EF4444" : "#888",
        fontSize, cursor: loading ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s", flexShrink: 0,
      }}
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}