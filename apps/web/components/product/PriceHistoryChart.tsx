"use client";

interface PricePoint { day: string; price: number; }

function generateHistory(currentPrice: number, originalPrice: number): PricePoint[] {
  const points: PricePoint[] = [];
  const days = 30;
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const label = date.toLocaleDateString("en-IN", { day:"numeric", month:"short" });
    // Simulate price fluctuation between current and original
    const noise = (Math.random() - 0.5) * (originalPrice - currentPrice) * 0.4;
    const base = i > 20 ? originalPrice : i > 10 ? originalPrice - (originalPrice - currentPrice) * 0.4 : currentPrice;
    const price = Math.round(Math.max(currentPrice, Math.min(originalPrice, base + noise)));
    points.push({ day: label, price });
  }
  // Make sure last point is current price
  points[points.length - 1].price = currentPrice;
  return points;
}

export default function PriceHistoryChart({ currentPrice, originalPrice }: { currentPrice: number; originalPrice: number }) {
  const points = generateHistory(currentPrice, originalPrice);
  const prices = points.map(p => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const W = 600;
  const H = 120;
  const PAD = { top: 16, bottom: 28, left: 8, right: 8 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const toX = (i: number) => PAD.left + (i / (points.length - 1)) * chartW;
  const toY = (p: number) => PAD.top + chartH - ((p - minP) / range) * chartH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(p.price)}`).join(" ");
  const areaPath = `${linePath} L ${toX(points.length - 1)} ${H - PAD.bottom} L ${toX(0)} ${H - PAD.bottom} Z`;

  // Show only every 6th label to avoid crowding
  const labelPoints = points.filter((_, i) => i % 6 === 0 || i === points.length - 1);

  return (
    <div style={{ width:"100%", overflowX:"auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:"auto", minWidth:"300px" }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00C896" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#00C896" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Area fill */}
        <path d={areaPath} fill="url(#areaGrad)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="#00C896" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Current price dot */}
        <circle cx={toX(points.length - 1)} cy={toY(currentPrice)} r="5" fill="#00C896" />
        <circle cx={toX(points.length - 1)} cy={toY(currentPrice)} r="9" fill="#00C89620" />

        {/* X-axis labels */}
        {labelPoints.map((p, i) => {
          const origIndex = points.indexOf(p);
          return (
            <text key={i} x={toX(origIndex)} y={H - 4} textAnchor="middle" fontSize="9" fill="#555">
              {p.day}
            </text>
          );
        })}
      </svg>

      {/* Price summary row */}
      <div style={{ display:"flex", gap:"0", marginTop:"4px" }}>
        {[
          { label:"Lowest",  value:`₹${minP.toLocaleString("en-IN")}`,  color:"#00C896" },
          { label:"Current", value:`₹${currentPrice.toLocaleString("en-IN")}`, color:"#fff" },
          { label:"Highest", value:`₹${maxP.toLocaleString("en-IN")}`,  color:"#F87171" },
        ].map((item, i) => (
          <div key={i} style={{ flex:1, textAlign:"center", padding:"10px 8px", borderRight: i < 2 ? "1px solid #2A2A2A" : "none" }}>
            <div style={{ fontSize:"13px", fontWeight:700, color:item.color }}>{item.value}</div>
            <div style={{ fontSize:"11px", color:"#555", marginTop:"2px" }}>{item.label} (30d)</div>
          </div>
        ))}
      </div>
    </div>
  );
}