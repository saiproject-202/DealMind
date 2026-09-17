"use client";
import Link from "next/link";
import CartNoteBody from "@/components/cartnote/CartNoteBody";

export default function CartNotePage() {
  return (
    <div style={{ maxWidth: "700px", margin: "0 auto", padding: "32px 24px 60px" }}>
      <Link href="/" style={{ color: "#666", fontSize: "13px", textDecoration: "none" }}>
        ← Back to home
      </Link>

      <div style={{ marginTop: "14px", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", marginBottom: "4px" }}>CartNote™</h1>
        <p style={{ fontSize: "13px", color: "#666" }}>AI price alert system — set once, track automatically</p>
      </div>

      <div style={{
        backgroundColor: "#161616", border: "1px solid #2A2A2A",
        borderRadius: "20px", overflow: "hidden",
        display: "flex", flexDirection: "column", minHeight: "70vh",
      }}>
        <CartNoteBody />
      </div>
    </div>
  );
}
