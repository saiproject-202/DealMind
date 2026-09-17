"use client";
import { useRouter } from "next/navigation";
import CartNoteBody from "./CartNoteBody";

interface Props { onClose: () => void; onCountChange?: (n: number) => void; }

export default function CartNoteModal({ onClose, onCountChange }: Props) {
  const router = useRouter();

  return (
    <>
      <div onClick={onClose} style={{ position:"fixed", inset:0, backgroundColor:"rgba(0,0,0,0.7)", zIndex:998, backdropFilter:"blur(4px)" }} />
      <div style={{
        position:"fixed", bottom:"90px", right:"24px",
        width:"390px", maxHeight:"580px",
        backgroundColor:"#161616", border:"1px solid #2A2A2A",
        borderRadius:"20px", zIndex:999,
        display:"flex", flexDirection:"column", overflow:"hidden",
        boxShadow:"0 20px 60px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{ padding:"16px 18px", borderBottom:"1px solid #2A2A2A", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div>
            <div style={{ fontSize:"15px", fontWeight:800, color:"#fff" }}>CartNote™</div>
            <div style={{ fontSize:"11px", color:"#555" }}>AI price alert system — set once, track automatically</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <button
              onClick={() => { onClose(); router.push("/cartnote"); }}
              title="Open full page"
              style={{ background:"none", border:"1px solid #2A2A2A", borderRadius:"8px", width:"28px", height:"28px", color:"#888", fontSize:"13px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
            >
              ⤢
            </button>
            <button onClick={onClose} style={{ background:"none", border:"none", color:"#555", fontSize:"18px", cursor:"pointer" }}>✕</button>
          </div>
        </div>

        <CartNoteBody onCountChange={onCountChange} />
      </div>
    </>
  );
}
