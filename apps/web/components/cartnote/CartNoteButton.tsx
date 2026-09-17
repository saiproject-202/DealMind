"use client";
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/apiFetch";
import CartNoteModal from "./CartNoteModal";

export default function CartNoteButton() {
  const [open, setOpen]       = useState(false);
  const [count, setCount]     = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
      const id = requestAnimationFrame(() => {
          setHydrated(true);
      });

      return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
      const handleOpen = () => setOpen(true);

      window.addEventListener("open-cartnote", handleOpen);

      return () => {
          window.removeEventListener("open-cartnote", handleOpen);
      };
  }, []);

  useEffect(() => {
      if (!hydrated) return;

      apiFetch("/api/cartnotes")
      .then(r => r.json())
      .then(d =>
        setCount(
          (d.cartnotes || []).filter(
            (n: { status: string }) => n.status === "active").length))
          .catch(() => {});
  }, [hydrated]);


  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setOpen(true)}
        title="CartNote™ — Set price alerts"
        style={{
          position: "fixed", bottom: "24px", right: "24px",
          width: "56px", height: "56px", borderRadius: "50%",
          backgroundColor: "#00C896", color: "#000",
          border: "none", fontSize: "22px", cursor: "pointer",
          zIndex: 997, display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(0,200,150,0.4)",
          transition: "transform 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.1)")}
        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
      >
        📋
        {count > 0 && (
          <div style={{
            position: "absolute", top: "-2px", right: "-2px",
            width: "18px", height: "18px", borderRadius: "50%",
            backgroundColor: "#EF4444", color: "#fff", fontSize: "10px",
            fontWeight: 700, display: "flex", alignItems: "center",
            justifyContent: "center", border: "2px solid #0D0D0D",
          }}>
            {count > 9 ? "9+" : count}
          </div>
        )}
      </button>

      {open && (
        <CartNoteModal onClose={() => setOpen(false)} onCountChange={setCount} />
      )}
    </>
  );
}