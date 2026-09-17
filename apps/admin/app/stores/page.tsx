"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/layout/AdminSidebar";

interface Store {
  id: string;
  name: string;
  baseUrl: string;
  affiliateNetwork: string;
  affiliateTag: string;
  isActive: boolean;
}

const DEFAULT_STORES = [
  { name:"Amazon",   baseUrl:"https://www.amazon.in",   affiliateNetwork:"earnkaro", affiliateTag:"", logoEmoji:"🟠" },
  { name:"Flipkart", baseUrl:"https://www.flipkart.com", affiliateNetwork:"earnkaro", affiliateTag:"", logoEmoji:"🔵" },
  { name:"Myntra",   baseUrl:"https://www.myntra.com",   affiliateNetwork:"earnkaro", affiliateTag:"", logoEmoji:"🔴" },
  { name:"AJIO",     baseUrl:"https://www.ajio.com",     affiliateNetwork:"earnkaro", affiliateTag:"", logoEmoji:"🟢" },
  { name:"Meesho",   baseUrl:"https://www.meesho.com",   affiliateNetwork:"earnkaro", affiliateTag:"", logoEmoji:"🟣" },
];

export default function StoresPage() {
  const router   = useRouter();
  const [stores, setStores]       = useState<Store[]>([]);
  const [earnKaroConfigured, setEarnKaroConfigured] = useState<boolean | null>(null);
  const [loading, setLoading]     = useState(true);
  const [msg, setMsg]             = useState("");
  const [newStore, setNewStore]   = useState({ name:"", baseUrl:"", affiliateNetwork:"earnkaro", affiliateTag:"" });
  const [editId, setEditId]       = useState<string | null>(null);
  const [editTag, setEditTag]     = useState("");

  const token = () => localStorage.getItem("dm_admin_token") || "";

  useEffect(() => {
    const t = token();
    if (!t) { router.push("/login"); return; }
    fetch("http://localhost:4001/api/admin/stores", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => { if (d.stores) setStores(d.stores); })
      .finally(() => setLoading(false));
    fetch("http://localhost:4001/api/admin/earnkaro-status", { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => setEarnKaroConfigured(!!d.configured))
      .catch(() => setEarnKaroConfigured(false));
  }, [router]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const handleAdd = async () => {
    if (!newStore.name || !newStore.baseUrl) return;

    // Prevent duplicate store names
    if (stores.some(s => s.name.toLowerCase() === newStore.name.toLowerCase())) {
      flash(`❌ "${newStore.name}" is already added.`);
      return;
    }

    const res = await fetch("http://localhost:4001/api/admin/stores", {
      method: "POST",
      headers: { "Content-Type":"application/json", Authorization:`Bearer ${token()}` },
      body: JSON.stringify(newStore),
    });
    const data = await res.json();
    if (data.store) {
      setStores(prev => [...prev, data.store]);
      setNewStore({ name:"", baseUrl:"", affiliateNetwork:"earnkaro", affiliateTag:"" });
      flash("✅ Store added!");
    } else {
      flash("❌ " + (data.error || "Failed to add."));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`http://localhost:4001/api/admin/stores/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    });
    const data = await res.json();
    if (data.success) {
      setStores(prev => prev.filter(s => s.id !== id));
      flash(`✅ "${name}" removed.`);
    } else {
      flash("❌ " + (data.error || "Failed to remove."));
    }
  };

  const handleUpdateTag = async (id: string) => {
    const res = await fetch(`http://localhost:4001/api/admin/stores/${id}`, {
      method: "PUT",
      headers: { "Content-Type":"application/json", Authorization:`Bearer ${token()}` },
      body: JSON.stringify({ affiliateTag: editTag }),
    });
    const data = await res.json();
    if (data.store) {
      setStores(prev => prev.map(s => s.id === id ? { ...s, affiliateTag: editTag } : s));
      setEditId(null);
      flash("✅ Affiliate tag saved!");
    }
  };

  const inp = { width:"100%", backgroundColor:"#1E1E1E", border:"1px solid #2A2A2A", borderRadius:"10px", padding:"11px 14px", fontSize:"13px", color:"#fff", outline:"none" };

  return (
    <div style={{ display:"flex", minHeight:"100vh" }}>
      <AdminSidebar />
      <main style={{ flex:1, padding:"32px", overflowY:"auto" }}>
        <h1 style={{ fontSize:"22px", fontWeight:800, color:"#fff", marginBottom:"4px" }}>Stores & Affiliate Setup</h1>
        <p style={{ fontSize:"13px", color:"#555", marginBottom:"28px" }}>Configure your EarnKaro API key and manage affiliate stores</p>

        {/* Flash message */}
        {msg && (
          <div style={{ backgroundColor: msg.startsWith("✅") ? "#00C89615" : "#EF444415", border:`1px solid ${msg.startsWith("✅") ? "#00C89630" : "#EF444430"}`, borderRadius:"10px", padding:"12px 16px", marginBottom:"16px", fontSize:"13px", color: msg.startsWith("✅") ? "#00C896" : "#F87171" }}>
            {msg}
          </div>
        )}

        {/* EarnKaro API key */}
        <div style={{ backgroundColor:"#161616", border:"1px solid #00C89630", borderRadius:"16px", padding:"24px", marginBottom:"24px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"16px" }}>
            <span style={{ fontSize:"20px" }}>🔑</span>
            <div>
              <div style={{ fontSize:"14px", fontWeight:700, color:"#fff" }}>EarnKaro API Key</div>
              <div style={{ fontSize:"12px", color:"#555" }}>Status only — not editable here</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
            <div style={{ width:"8px", height:"8px", borderRadius:"50%", backgroundColor: earnKaroConfigured ? "#00C896" : "#555" }} />
            <span style={{ fontSize:"13px", fontWeight:600, color: earnKaroConfigured === null ? "#555" : earnKaroConfigured ? "#00C896" : "#F87171" }}>
              {earnKaroConfigured === null ? "Checking..." : earnKaroConfigured ? "Configured on server" : "Not configured on server"}
            </span>
          </div>
        </div>

        {/* Existing stores */}
        <h2 style={{ fontSize:"15px", fontWeight:700, color:"#fff", marginBottom:"14px" }}>Configured Stores</h2>
        <div style={{ display:"flex", flexDirection:"column", gap:"8px", marginBottom:"28px" }}>
          {loading ? (
            <p style={{ color:"#555", fontSize:"13px" }}>Loading...</p>
          ) : stores.length === 0 ? (
            <div style={{ backgroundColor:"#161616", border:"1px solid #2A2A2A", borderRadius:"12px", padding:"24px", textAlign:"center" }}>
              <p style={{ color:"#555", fontSize:"13px" }}>No stores yet — add one below</p>
            </div>
          ) : stores.map(store => (
            <div key={store.id} style={{ backgroundColor:"#161616", border:"1px solid #2A2A2A", borderRadius:"12px", padding:"14px 18px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"14px" }}>
                {/* Store info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:"14px", fontWeight:600, color:"#fff" }}>{store.name}</div>
                  <div style={{ fontSize:"11px", color:"#555" }}>{store.baseUrl}</div>
                </div>

                {/* Affiliate tag */}
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  {editId === store.id ? (
                    <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
                      <input
                        value={editTag}
                        onChange={e => setEditTag(e.target.value)}
                        placeholder="Affiliate tag..."
                        style={{ ...inp, width:"160px", padding:"6px 10px", fontSize:"12px" }}
                      />
                      <button onClick={() => handleUpdateTag(store.id)} style={{ backgroundColor:"#00C896", color:"#000", border:"none", borderRadius:"8px", padding:"6px 10px", fontSize:"12px", fontWeight:600, cursor:"pointer" }}>Save</button>
                      <button onClick={() => setEditId(null)} style={{ backgroundColor:"#1E1E1E", color:"#555", border:"1px solid #2A2A2A", borderRadius:"8px", padding:"6px 8px", fontSize:"12px", cursor:"pointer" }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditId(store.id); setEditTag(store.affiliateTag || ""); }} style={{ backgroundColor:"#1E1E1E", color:"#888", border:"1px solid #2A2A2A", borderRadius:"8px", padding:"5px 10px", fontSize:"11px", cursor:"pointer" }}>
                      {store.affiliateTag ? `Tag: ${store.affiliateTag}` : "Set affiliate tag"}
                    </button>
                  )}
                </div>

                {/* Network badge */}
                <span style={{ backgroundColor:"#00C89615", color:"#00C896", fontSize:"10px", fontWeight:600, padding:"3px 8px", borderRadius:"6px", flexShrink:0 }}>
                  {store.affiliateNetwork}
                </span>

                {/* Active dot */}
                <div style={{ width:"8px", height:"8px", borderRadius:"50%", backgroundColor: store.isActive ? "#00C896" : "#555", flexShrink:0 }} />

                {/* DELETE button */}
                <button
                  onClick={() => handleDelete(store.id, store.name)}
                  title="Remove store"
                  style={{ backgroundColor:"transparent", color:"#555", border:"none", cursor:"pointer", fontSize:"16px", padding:"4px", flexShrink:0, lineHeight:1 }}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add new store */}
        <h2 style={{ fontSize:"15px", fontWeight:700, color:"#fff", marginBottom:"14px" }}>Add New Store</h2>
        <div style={{ backgroundColor:"#161616", border:"1px solid #2A2A2A", borderRadius:"16px", padding:"24px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"12px" }}>
            {[
              { label:"STORE NAME",        key:"name",             ph:"e.g. Amazon"           },
              { label:"BASE URL",          key:"baseUrl",          ph:"https://www.amazon.in" },
              { label:"AFFILIATE NETWORK", key:"affiliateNetwork", ph:"earnkaro"              },
              { label:"AFFILIATE TAG",     key:"affiliateTag",     ph:"Your EarnKaro tag"     },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display:"block", fontSize:"11px", color:"#666", marginBottom:"5px", fontWeight:600 }}>{f.label}</label>
                <input placeholder={f.ph} value={newStore[f.key as keyof typeof newStore]} onChange={e => setNewStore(p => ({ ...p, [f.key]: e.target.value }))} style={inp} />
              </div>
            ))}
          </div>

          {/* Quick add defaults */}
          <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", marginBottom:"16px", alignItems:"center" }}>
            <span style={{ fontSize:"12px", color:"#555" }}>Quick add:</span>
            {DEFAULT_STORES.map(s => (
              <button
                key={s.name}
                onClick={() => {
                  if (stores.some(existing => existing.name.toLowerCase() === s.name.toLowerCase())) {
                    flash(`❌ "${s.name}" already added.`);
                    return;
                  }
                  setNewStore({ name:s.name, baseUrl:s.baseUrl, affiliateNetwork:s.affiliateNetwork, affiliateTag:"" });
                }}
                style={{ backgroundColor:"#1E1E1E", color:"#888", border:"1px solid #2A2A2A", borderRadius:"8px", padding:"4px 10px", fontSize:"12px", cursor:"pointer" }}
              >
                {s.logoEmoji} {s.name}
              </button>
            ))}
          </div>

          <button onClick={handleAdd} style={{ backgroundColor:"#00C896", color:"#000", border:"none", borderRadius:"12px", padding:"12px 24px", fontSize:"14px", fontWeight:700, cursor:"pointer" }}>
            + Add Store
          </button>
        </div>
      </main>
    </div>
  );
}