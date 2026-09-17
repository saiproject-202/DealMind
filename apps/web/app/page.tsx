"use client";
import HeroSection from "@/components/home/HeroSection";
import SectionRow  from "@/components/home/SectionRow";
import { useHomepageData } from "@/hooks/useHomepageData";

export default function HomePage() {
  const { sections } = useHomepageData();

  return (
    <div style={{ maxWidth: "1600px", margin: "0 auto" }}>
      <HeroSection />

      {/* Real data badge — only show when using real products */}
      {sections.isRealData && (
        <div style={{ textAlign: "center", marginBottom: "-8px" }}>
          <span style={{ backgroundColor: "#00C89615", color: "#00C896", fontSize: "11px", fontWeight: 600, padding: "4px 12px", borderRadius: "20px", border: "1px solid #00C89630" }}>
            ● Showing live deals from your product database
          </span>
        </div>
      )}

      <div style={{ height: "1px", backgroundColor: "#1A1A1A", margin: "0 24px 8px" }} />

      <SectionRow
        sectionKey="priceDrops"
        title="Biggest Price Drops Today"
        subtitle="Genuine price decreases recorded in the last 7 days"
        badge="🔥 HOT DEALS" badgeBg="#EF444415" badgeColor="#F87171"
        products={sections.priceDrops}
      />
      <SectionRow
        sectionKey="couponDeals"
        title="Best Coupon Deals"
        subtitle="Verified, high-confidence coupons only"
        badge="🎟 COUPONS" badgeBg="#7C3AED15" badgeColor="#A78BFA"
        products={sections.couponDeals}
      />
      <SectionRow
        sectionKey="trending"
        title="Trending Right Now"
        subtitle="Real DealMind clicks & saves in the last 7 days"
        badge="📈 TRENDING" badgeBg="#F9731615" badgeColor="#FB923C"
        products={sections.trending}
      />
      <SectionRow
        sectionKey="mostSold"
        title="Most Sold Products"
        subtitle="Based on confirmed purchases"
        badge="🏆 BESTSELLERS" badgeBg="#EAB30815" badgeColor="#FCD34D"
        products={sections.mostSold}
      />
      <SectionRow
        sectionKey="bestValue"
        title="Best Value Products"
        subtitle="Discount, rating, price history & store trust — combined"
        badge="💎 BEST VALUE" badgeBg="#00C89615" badgeColor="#00C896"
        products={sections.bestValue}
      />
      <SectionRow
        sectionKey="hiddenGems"
        title="Hidden Gems"
        subtitle="Genuinely good value with little engagement so far"
        badge="💡 HIDDEN GEMS" badgeBg="#3B82F615" badgeColor="#60A5FA"
        products={sections.hiddenGems}
      />
      <SectionRow
        sectionKey="aiRecommended"
        title="AI Recommended For You"
        subtitle="Hand-picked by DealMind AI based on trends"
        badge="🤖 AI PICKS" badgeBg="#00C89615" badgeColor="#00C896"
        products={sections.aiRecommended}
      />
      <SectionRow
        sectionKey="newLaunches"
        title="New Launches"
        subtitle="Added to DealMind in the last 48 hours"
        badge="🆕 NEW" badgeBg="#22C55E15" badgeColor="#4ADE80"
        products={sections.newLaunches}
      />
      <SectionRow
        sectionKey="seasonal"
        title="Seasonal Deals"
        subtitle="Best offers this season — limited time only"
        badge="🌟 SEASONAL" badgeBg="#EC489915" badgeColor="#F472B6"
        products={sections.seasonal}
      />

      <div style={{ height: "60px" }} />
    </div>
  );
}