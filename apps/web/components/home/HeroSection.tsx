export default function HeroSection() {
  return (
    <section
      style={{
        padding: "48px 24px 36px",
        textAlign: "center",
        maxWidth: "680px",
        margin: "0 auto",
      }}
    >
      {/* Live badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          backgroundColor: "#00C89612",
          border: "1px solid #00C89625",
          borderRadius: "999px",
          padding: "6px 16px",
          marginBottom: "22px",
        }}
      >
        <span
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: "#00C896",
            display: "inline-block",
            animation: "pulse 1.5s infinite",
          }}
        />
        <span style={{ fontSize: "13px", color: "#00C896", fontWeight: 500 }}>
          AI scanning 50,000+ products right now
        </span>
      </div>

      {/* Heading */}
      <h1
        style={{
          fontSize: "clamp(28px, 5vw, 44px)",
          fontWeight: 800,
          color: "#fff",
          lineHeight: 1.2,
          marginBottom: "14px",
        }}
      >
        Never Miss the{" "}
        <span style={{ color: "#00C896" }}>Best Deal</span>{" "}
        Again
      </h1>

      <p style={{ fontSize: "15px", color: "#777", lineHeight: 1.6, marginBottom: "36px" }}>
        DealMind AI tracks prices across Amazon, Flipkart, Myntra and more —
        and alerts you the moment your dream product drops.
      </p>

      {/* Stats */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "0",
          backgroundColor: "#161616",
          border: "1px solid #2A2A2A",
          borderRadius: "16px",
          overflow: "hidden",
        }}
      >
        {[
          { value: "50K+",  label: "Products tracked" },
          { value: "₹2.4Cr", label: "Saved this month" },
          { value: "12K+",  label: "Happy users" },
        ].map((stat, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: "18px 12px",
              borderRight: i < 2 ? "1px solid #2A2A2A" : "none",
            }}
          >
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#fff" }}>
              {stat.value}
            </div>
            <div style={{ fontSize: "11px", color: "#666", marginTop: "3px" }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </section>
  );
}