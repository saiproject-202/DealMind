"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getUser, clearTokens } from "@/lib/auth";
import { applyTheme, getTheme } from "@/lib/theme";
import SearchBar from "./SearchBar";
import NotificationBell from "./NotificationBell";

export default function Navbar() {
  const [user, setUser]         = useState<{ phone: string; displayName?: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted]   = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
      queueMicrotask(() => {
          setUser(getUser());
          applyTheme(getTheme());
          setMounted(true);
      });
  }, []);

  const handleLogout = () => {
    clearTokens();
    setUser(null);
    setMenuOpen(false);
  };

  // Open CartNote modal via custom event (handled by CartNoteButton component)
  const openCartNote = () => {
    window.dispatchEvent(new CustomEvent('open-cartnote'));
  };

  return (
    <>
    <nav style={{
      position:"fixed", top:0, left:0, right:0, zIndex:50,
      backgroundColor:"rgba(13,13,13,0.95)", backdropFilter:"blur(12px)",
      borderBottom:"1px solid #1E1E1E", height:"64px",
      display:"flex", alignItems:"center", padding:"0 24px", gap:"16px",
    }}>
      <style jsx global>{`
        @media (max-width: 900px) {
          .dm-nav-secondary { display: none; }
          .dm-nav-search-full { display: none; }
          .dm-nav-search-icon-btn { display: flex !important; }
        }
        @media (min-width: 901px) {
          .dm-nav-search-overlay { display: none !important; }
        }
        @media (max-width: 700px) {
          .dm-nav-btn-label { display: none; }
          .dm-nav-logo-text { display: none; }
          .dm-nav-btn { padding: 9px 10px !important; }
        }
      `}</style>

      {/* Logo — text hides on very narrow screens, "D" mark always stays */}
      <Link href="/" style={{ display:"flex", alignItems:"center", gap:"8px", textDecoration:"none", flexShrink:0 }}>
        <div style={{ width:"34px", height:"34px", borderRadius:"10px", background:"#00C896", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:"16px", color:"#000", flexShrink:0 }}>D</div>
        <span className="dm-nav-logo-text" style={{ fontWeight:700, fontSize:"18px", color:"#fff", whiteSpace:"nowrap" }}>Deal<span style={{ color:"#00C896" }}>Mind</span></span>
      </Link>

      {/* Secondary nav — browse destinations. Hidden below 900px since they're
          also reachable from the profile dropdown — this is what was overflowing. */}
      <Link href="/coupons" className="dm-nav-secondary" style={{ fontSize:"13px", color:"#999", textDecoration:"none", whiteSpace:"nowrap", flexShrink:0 }}>
        🎟 Coupons
      </Link>
      <Link href="/leaderboard" className="dm-nav-secondary" style={{ fontSize:"13px", color:"#999", textDecoration:"none", whiteSpace:"nowrap", flexShrink:0 }}>
        🏆 Leaderboard
      </Link>
      <Link href="/wishlist" className="dm-nav-secondary" style={{ fontSize:"13px", color:"#999", textDecoration:"none", whiteSpace:"nowrap", flexShrink:0 }}>
        ♡ Wishlist
      </Link>

      {/* Search — full bar on wide screens; collapses to just an icon below 900px (tap to expand) */}
      <div className="dm-nav-search-full" style={{ flex:1, minWidth:"40px" }}>
        <SearchBar />
      </div>
      <button
        className="dm-nav-search-icon-btn"
        onClick={() => setMobileSearchOpen(true)}
        title="Search"
        style={{ display:"none", width:"36px", height:"36px", borderRadius:"10px", backgroundColor:"#1A1A1A", border:"1px solid #2A2A2A", color:"#888", fontSize:"16px", cursor:"pointer", alignItems:"center", justifyContent:"center", flexShrink:0, marginLeft:"auto" }}
      >
        🔍
      </button>

      {/* Right */}
      <div style={{ display:"flex", alignItems:"center", gap:"10px", flexShrink:0 }}>
        <Link href="/submit" className="dm-nav-btn" style={{ backgroundColor:"#1E1E1E", color:"#00C896", border:"1px solid #00C89630", borderRadius:"12px", padding:"9px 14px", fontSize:"13px", fontWeight:600, textDecoration:"none", whiteSpace:"nowrap" }}>
          +<span className="dm-nav-btn-label"> Submit Deal</span>
        </Link>

        {/* CartNote™ button — opens the modal via custom event */}
        <button
          onClick={openCartNote}
          className="dm-nav-btn"
          style={{ display:"flex", alignItems:"center", gap:"6px", backgroundColor:"#00C896", color:"#000", border:"none", borderRadius:"12px", padding:"9px 16px", fontWeight:700, fontSize:"13px", cursor:"pointer", whiteSpace:"nowrap" }}
        >
          📋<span className="dm-nav-btn-label"> CartNote™</span>
        </button>

        <NotificationBell />

        {/* Login / User */}
        {!mounted ? (
          <Link href="/login" style={{ backgroundColor:"transparent", color:"#999", border:"1px solid #2A2A2A", borderRadius:"12px", padding:"9px 16px", fontSize:"13px", textDecoration:"none" }}>Login</Link>
        ) : user ? (
          <div style={{ position:"relative" }}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ width:"36px", height:"36px", borderRadius:"50%", backgroundColor:"#00C89620", border:"1px solid #00C89640", color:"#00C896", fontWeight:700, fontSize:"14px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
            >
              {(user.displayName || user.phone).slice(-2).toUpperCase()}
            </button>
            {menuOpen && (
              <div style={{ position:"absolute", right:0, top:"44px", width:"190px", backgroundColor:"#161616", border:"1px solid #2A2A2A", borderRadius:"12px", overflow:"hidden", zIndex:100 }}>
                <div style={{ padding:"12px 16px", borderBottom:"1px solid #2A2A2A" }}>
                  <div style={{ fontSize:"12px", color:"#555" }}>Logged in as</div>
                  <div style={{ fontSize:"13px", color:"#fff", fontWeight:600 }}>{user.displayName || user.phone}</div>
                </div>
                <Link href="/profile" onClick={() => setMenuOpen(false)} style={{ display:"block", padding:"12px 16px", fontSize:"13px", color:"#888", textDecoration:"none", borderBottom:"1px solid #2A2A2A" }}>
                  👤 My Profile
                </Link>
                <Link href="/coupons" onClick={() => setMenuOpen(false)} style={{ display:"block", padding:"12px 16px", fontSize:"13px", color:"#888", textDecoration:"none", borderBottom:"1px solid #2A2A2A" }}>
                  🎟 Coupons
                </Link>
                <Link href="/leaderboard" onClick={() => setMenuOpen(false)} style={{ display:"block", padding:"12px 16px", fontSize:"13px", color:"#888", textDecoration:"none", borderBottom:"1px solid #2A2A2A" }}>
                  🏆 Leaderboard
                </Link>
                <Link href="/wishlist" onClick={() => setMenuOpen(false)} style={{ display:"block", padding:"12px 16px", fontSize:"13px", color:"#888", textDecoration:"none", borderBottom:"1px solid #2A2A2A" }}>
                  ♡ Wishlist
                </Link>
                <button onClick={openCartNote} style={{ width:"100%", textAlign:"left", padding:"12px 16px", fontSize:"13px", color:"#888", background:"none", border:"none", cursor:"pointer", borderBottom:"1px solid #2A2A2A" }}>
                  📋 CartNote™
                </button>
                <Link href="/submit" onClick={() => setMenuOpen(false)} style={{ display:"block", padding:"12px 16px", fontSize:"13px", color:"#888", textDecoration:"none", borderBottom:"1px solid #2A2A2A" }}>
                  + Submit Deal
                </Link>
                <button onClick={handleLogout} style={{ width:"100%", textAlign:"left", padding:"12px 16px", fontSize:"13px", color:"#EF4444", background:"none", border:"none", cursor:"pointer" }}>
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link href="/login" style={{ backgroundColor:"transparent", color:"#999", border:"1px solid #2A2A2A", borderRadius:"12px", padding:"9px 16px", fontSize:"13px", textDecoration:"none" }}>Login</Link>
        )}
      </div>
    </nav>

    {/* Mobile search overlay — shown when the collapsed search icon is tapped below 900px */}
    {mobileSearchOpen && (
      <div className="dm-nav-search-overlay" style={{
        position:"fixed", top:"64px", left:0, right:0, zIndex:49,
        backgroundColor:"#0D0D0D", borderBottom:"1px solid #1E1E1E",
        padding:"12px 16px", display:"flex", alignItems:"center", gap:"10px",
      }}>
        <div style={{ flex:1 }}>
          <SearchBar />
        </div>
        <button
          onClick={() => setMobileSearchOpen(false)}
          title="Close search"
          style={{ background:"none", border:"none", color:"#888", fontSize:"18px", cursor:"pointer", padding:"4px 8px", flexShrink:0 }}
        >
          ✕
        </button>
      </div>
    )}
    </>
  );
}