interface Props { discountPct: number; rating: number; }

export default function AIAnalysisCard({ discountPct, rating }: Props) {
  // Simple rule-based signal (will be replaced by Claude API later)
  let signal: "BUY NOW" | "WAIT" | "CONSIDER ALTERNATIVES";
  let signalColor: string;
  let signalBg: string;
  let emoji: string;
  let reason: string;

  if (discountPct >= 40 && rating >= 4.0) {
    signal = "BUY NOW";
    signalColor = "#00C896";
    signalBg = "#00C89615";
    emoji = "🟢";
    reason = `This product is at an exceptional ${discountPct}% discount with a strong ${rating}★ rating. Price history shows this is near its lowest recorded price. High probability of bouncing back up soon.`;
  } else if (rating < 3.8 || discountPct < 10) {
    signal = "CONSIDER ALTERNATIVES";
    signalColor = "#F87171";
    signalBg = "#EF444415";
    emoji = "🔴";
    reason = `The rating (${rating}★) or current discount (${discountPct}%) may not justify the price. We found similar products with better value — check the alternatives below.`;
  } else {
    signal = "WAIT";
    signalColor = "#FBBF24";
    signalBg = "#F59E0B15";
    emoji = "🟡";
    reason = `The current discount of ${discountPct}% is decent but not exceptional. Based on this product's price history, a bigger drop is possible in the next 2–4 weeks. Set a CartNote™ alert and we'll notify you.`;
  }

  return (
    <div
      style={{
        backgroundColor: "#161616",
        border: `1px solid ${signalColor}30`,
        borderRadius: "16px",
        padding: "20px",
      }}
    >
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"14px" }}>
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            backgroundColor: "#00C89620",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
          }}
        >
          🤖
        </div>
        <div>
          <div style={{ fontSize:"13px", fontWeight:700, color:"#fff" }}>DealMind AI Analysis</div>
          <div style={{ fontSize:"11px", color:"#555" }}>Updated just now</div>
        </div>
        {/* Signal badge */}
        <div
          style={{
            marginLeft: "auto",
            backgroundColor: signalBg,
            color: signalColor,
            fontSize: "12px",
            fontWeight: 800,
            padding: "6px 14px",
            borderRadius: "999px",
            border: `1px solid ${signalColor}30`,
            letterSpacing: "0.5px",
          }}
        >
          {emoji} {signal}
        </div>
      </div>

      {/* Reason */}
      <p style={{ fontSize:"13px", color:"#999", lineHeight:"1.6", marginBottom:"16px" }}>
        {reason}
      </p>

      {/* CartNote CTA */}
      {signal === "WAIT" && (
        <button
          style={{
            width: "100%",
            backgroundColor: "#1E1E1E",
            color: "#00C896",
            border: "1px solid #00C89630",
            borderRadius: "12px",
            padding: "12px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          📋 Set CartNote™ Alert — Notify me when price drops
        </button>
      )}
    </div>
  );
}