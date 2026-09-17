"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/layout/AdminSidebar";

interface Conversion {
  id: string;
  orderId: string | null;
  orderValue: number;
  commissionAmount: number;
  status: string;
  source: string;
  createdAt: string;
  user: { phone: string; displayName: string | null } | null;
}

export default function ConversionsPage() {
  const router = useRouter();
  const [file, setFile]           = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resultMsg, setResultMsg] = useState("");
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [totalCommission, setTotalCommission] = useState(0);
  const [loading, setLoading]     = useState(true);

  const token = () => localStorage.getItem("dm_admin_token") || "";

  const fetchConversions = useCallback(() => {
    fetch("http://localhost:4001/api/admin/conversions", {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(r => r.json())
      .then(d => {
        setConversions(d.conversions || []);
        setTotalCommission(d.totalCommission || 0);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = token();
    if (!t) { router.push("/login"); return; }
    fetchConversions();
  }, [router, fetchConversions]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResultMsg("");

    const csvText = await file.text();

    const res = await fetch("http://localhost:4001/api/admin/conversions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ csvText }),
    });
    const data = await res.json();

    if (data.success) {
      setResultMsg(`✅ ${data.message} (${data.summary.skipped} duplicate/empty rows skipped)`);
      setFile(null);
      fetchConversions();
    } else {
      setResultMsg("❌ " + (data.error || "Import failed."));
    }
    setUploading(false);
  };

  const statusColor = (s: string) =>
    s === 'confirmed' ? '#00C896' : s === 'rejected' ? '#EF4444' : '#F59E0B';

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />
      <main style={{ flex: 1, padding: "32px", overflowY: "auto" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", marginBottom: "4px" }}>
          Conversions Import
        </h1>
        <p style={{ fontSize: "13px", color: "#555", marginBottom: "28px" }}>
          Upload your EarnKaro earnings CSV export to record real confirmed purchases
        </p>

        {/* How-to card */}
        <div style={{ backgroundColor: "#161616", border: "1px solid #3B82F630", borderRadius: "16px", padding: "20px", marginBottom: "24px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "10px" }}>How to get the CSV</div>
          <ol style={{ fontSize: "12px", color: "#888", lineHeight: "1.8", paddingLeft: "18px" }}>
            <li>Log in to your EarnKaro dashboard</li>
            <li>Go to Reports / Earnings section</li>
            <li>{'Export as CSV (usually a "Download Report" button)'}</li>
            <li>Upload the file below — DealMind matches orders to your clicks automatically</li>
          </ol>
        </div>

        {/* Upload box */}
        <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "16px", padding: "24px", marginBottom: "28px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <input
              type="file"
              accept=".csv"
              onChange={e => setFile(e.target.files?.[0] || null)}
              style={{ flex: 1, fontSize: "13px", color: "#888" }}
            />
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              style={{
                backgroundColor: !file || uploading ? "#1E1E1E" : "#00C896",
                color: !file || uploading ? "#555" : "#000",
                border: "none", borderRadius: "10px", padding: "10px 24px",
                fontSize: "13px", fontWeight: 700,
                cursor: !file || uploading ? "not-allowed" : "pointer",
              }}
            >
              {uploading ? "Importing..." : "Import CSV"}
            </button>
          </div>
          {resultMsg && (
            <div style={{
              marginTop: "14px",
              backgroundColor: resultMsg.startsWith("✅") ? "#00C89615" : "#EF444415",
              border: `1px solid ${resultMsg.startsWith("✅") ? "#00C89630" : "#EF444430"}`,
              borderRadius: "10px", padding: "10px 14px",
              fontSize: "13px", color: resultMsg.startsWith("✅") ? "#00C896" : "#F87171",
            }}>
              {resultMsg}
            </div>
          )}
        </div>

        {/* Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "28px" }}>
          <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "14px", padding: "20px" }}>
            <div style={{ fontSize: "26px", fontWeight: 800, color: "#00C896" }}>
              ₹{Number(totalCommission).toLocaleString("en-IN")}
            </div>
            <div style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>Total confirmed commission</div>
          </div>
          <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "14px", padding: "20px" }}>
            <div style={{ fontSize: "26px", fontWeight: 800, color: "#fff" }}>{conversions.length}</div>
            <div style={{ fontSize: "13px", color: "#888", marginTop: "4px" }}>Total conversions recorded</div>
          </div>
        </div>

        {/* List */}
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "14px" }}>Recent conversions</h2>
        {loading ? (
          <p style={{ color: "#555", fontSize: "13px" }}>Loading...</p>
        ) : conversions.length === 0 ? (
          <div style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "12px", padding: "32px", textAlign: "center" }}>
            <p style={{ color: "#555", fontSize: "13px" }}>No conversions imported yet.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {conversions.map(c => (
              <div key={c.id} style={{ backgroundColor: "#161616", border: "1px solid #2A2A2A", borderRadius: "12px", padding: "14px 18px", display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", color: "#fff", fontWeight: 600 }}>
                    {c.orderId || "No order ID"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#555" }}>
                    {c.user ? (c.user.displayName || c.user.phone) : "Unmatched user"} · {new Date(c.createdAt).toLocaleDateString("en-IN")}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#00C896" }}>
                    ₹{Number(c.commissionAmount).toLocaleString("en-IN")}
                  </div>
                  <div style={{ fontSize: "11px", color: "#555" }}>
                    Order: ₹{Number(c.orderValue).toLocaleString("en-IN")}
                  </div>
                </div>
                <span style={{ backgroundColor: `${statusColor(c.status)}15`, color: statusColor(c.status), fontSize: "10px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px" }}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}