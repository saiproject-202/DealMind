export interface Product {
  id: string;
  name: string;
  currentPrice: number;
  originalPrice: number;
  discountPct: number;
  rating: number;
  reviewCount: number;
  store: "Amazon" | "Flipkart" | "Myntra" | "AJIO" | "Meesho";
  category: string;
  emoji: string;
  gradient: string;
  image?: string;
  brand?: string;
  isNew?: boolean;
  isTrending?: boolean;
  couponCode?: string;
  sourceLabel?: string;
}

export const ALL_PRODUCTS: Product[] = [
  { id:"1",  name:"OnePlus Nord 4 5G (16GB+256GB)",            currentPrice:24999, originalPrice:29999, discountPct:17, rating:4.4, reviewCount:12400, store:"Amazon",  category:"Mobiles",       emoji:"📱", gradient:"linear-gradient(135deg,#1a1a2e,#16213e)", isTrending:true },
  { id:"2",  name:"boAt Rockerz 450 Bluetooth Headphones",     currentPrice:999,   originalPrice:2990,  discountPct:67, rating:4.2, reviewCount:89000, store:"Flipkart", category:"Audio",         emoji:"🎧", gradient:"linear-gradient(135deg,#0f3460,#533483)" },
  { id:"3",  name:"Samsung Galaxy A35 5G (8GB+128GB)",         currentPrice:22999, originalPrice:26999, discountPct:15, rating:4.3, reviewCount:5600,  store:"Amazon",  category:"Mobiles",       emoji:"📱", gradient:"linear-gradient(135deg,#1b4332,#2d6a4f)", isTrending:true },
  { id:"4",  name:"Apple AirPods Pro (2nd Generation)",        currentPrice:19999, originalPrice:24900, discountPct:20, rating:4.7, reviewCount:22100, store:"Amazon",  category:"Audio",         emoji:"🎵", gradient:"linear-gradient(135deg,#2c2c2e,#1c1c1e)" },
  { id:"5",  name:"Noise ColorFit Pro 5 AMOLED Smartwatch",   currentPrice:1999,  originalPrice:5999,  discountPct:67, rating:4.1, reviewCount:34000, store:"Myntra",  category:"Smartwatches",  emoji:"⌚", gradient:"linear-gradient(135deg,#1e3a5f,#0d2137)", couponCode:"NOISE200" },
  { id:"6",  name:"JBL Flip 6 Portable Bluetooth Speaker",    currentPrice:7499,  originalPrice:11999, discountPct:38, rating:4.5, reviewCount:18900, store:"Amazon",  category:"Audio",         emoji:"🔊", gradient:"linear-gradient(135deg,#7f1d1d,#991b1b)" },
  { id:"7",  name:"Xiaomi Redmi Note 13 5G (8GB+256GB)",      currentPrice:14999, originalPrice:17999, discountPct:17, rating:4.3, reviewCount:67000, store:"Flipkart", category:"Mobiles",       emoji:"📱", gradient:"linear-gradient(135deg,#312e81,#1e1b4b)" },
  { id:"8",  name:"Prestige Iris 750W Mixer Grinder 3 Jars",  currentPrice:1799,  originalPrice:3499,  discountPct:49, rating:4.4, reviewCount:42000, store:"Amazon",  category:"Kitchen",       emoji:"🍳", gradient:"linear-gradient(135deg,#7c3aed,#5b21b6)" },
  { id:"9",  name:"Mi Smart Band 8 Activity Tracker",         currentPrice:2499,  originalPrice:3499,  discountPct:29, rating:4.3, reviewCount:28000, store:"Flipkart", category:"Smartwatches",  emoji:"⌚", gradient:"linear-gradient(135deg,#065f46,#047857)", isNew:true },
  { id:"10", name:"Fire-Boltt Phoenix Ultra AMOLED Smartwatch",currentPrice:1499,  originalPrice:6999,  discountPct:79, rating:4.0, reviewCount:55000, store:"Amazon",  category:"Smartwatches",  emoji:"⌚", gradient:"linear-gradient(135deg,#1a1a1a,#2d2d2d)" },
  { id:"11", name:"Realme Narzo 70 Pro 5G (12GB+256GB)",      currentPrice:18999, originalPrice:23999, discountPct:21, rating:4.2, reviewCount:9800,  store:"Flipkart", category:"Mobiles",       emoji:"📱", gradient:"linear-gradient(135deg,#134e4a,#0f766e)" },
  { id:"12", name:"Zebronics Zeb-Thunder Wireless Headphones", currentPrice:699,   originalPrice:2999,  discountPct:77, rating:3.9, reviewCount:21000, store:"Flipkart", category:"Audio",         emoji:"🎧", gradient:"linear-gradient(135deg,#1e293b,#0f172a)", couponCode:"ZEB50" },
  { id:"13", name:"Bosch 7kg Fully Automatic Washing Machine", currentPrice:32999, originalPrice:44990, discountPct:27, rating:4.4, reviewCount:8100,  store:"Amazon",  category:"Appliances",    emoji:"🫧", gradient:"linear-gradient(135deg,#1e3a5f,#1e40af)" },
  { id:"14", name:"Lakme Absolute Matte Melt Mousse Lipstick", currentPrice:349,   originalPrice:699,   discountPct:50, rating:4.2, reviewCount:31000, store:"Myntra",  category:"Beauty",        emoji:"💄", gradient:"linear-gradient(135deg,#831843,#9d174d)", couponCode:"BEAUTY30" },
  { id:"15", name:"Instant Pot Duo 5.7L Pressure Cooker",     currentPrice:6999,  originalPrice:12995, discountPct:46, rating:4.5, reviewCount:14000, store:"Amazon",  category:"Kitchen",       emoji:"🍲", gradient:"linear-gradient(135deg,#78350f,#92400e)" },
  { id:"16", name:'Redmi 32" Full HD Smart Android LED TV',   currentPrice:12999, originalPrice:18999, discountPct:32, rating:4.2, reviewCount:19500, store:"Flipkart", category:"Electronics",   emoji:"📺", gradient:"linear-gradient(135deg,#0c1445,#1a237e)", isNew:true },
  { id:"17", name:"Campus Oxyfit Pro Running Shoes for Men",  currentPrice:799,   originalPrice:2499,  discountPct:68, rating:4.1, reviewCount:62000, store:"Meesho",  category:"Fashion",       emoji:"👟", gradient:"linear-gradient(135deg,#166534,#15803d)" },
  { id:"18", name:"Himalaya Purifying Neem Face Wash 200ml",  currentPrice:149,   originalPrice:280,   discountPct:47, rating:4.5, reviewCount:91000, store:"Amazon",  category:"Beauty",        emoji:"🧴", gradient:"linear-gradient(135deg,#14532d,#166534)", couponCode:"HIMALAYA20" },
  { id:"19", name:"Sony WH-1000XM5 Noise Cancelling Headphones", currentPrice:24990, originalPrice:34990, discountPct:29, rating:4.7, reviewCount:8200, store:"Amazon",  category:"Audio",       emoji:"🎧", gradient:"linear-gradient(135deg,#1c1c1c,#2a2a2a)", isTrending:true },
  { id:"20", name:"ASUS VivoBook 15 Core i5 (8GB+512GB SSD)", currentPrice:44999, originalPrice:64999, discountPct:31, rating:4.3, reviewCount:5400,  store:"Flipkart", category:"Laptops",       emoji:"💻", gradient:"linear-gradient(135deg,#1e3a5f,#2563eb)", isNew:true },
];

// ── Section generators ──────────────────────────────────────────
export const getPriceDrops    = () => [...ALL_PRODUCTS].sort((a,b)=>b.discountPct-a.discountPct).slice(0,12);
export const getCouponDeals   = () => ALL_PRODUCTS.filter(p=>p.couponCode);
export const getTrending      = () => ALL_PRODUCTS.filter(p=>p.isTrending||p.rating>=4.3).slice(0,12);
export const getMostSold      = () => [...ALL_PRODUCTS].sort((a,b)=>b.reviewCount-a.reviewCount).slice(0,12);
export const getBestValue     = () => [...ALL_PRODUCTS].sort((a,b)=>{
  const score=(p:Product)=>(p.rating*p.discountPct)/(p.currentPrice/10000);
  return score(b)-score(a);
}).slice(0,12);
export const getHiddenGems    = () => ALL_PRODUCTS.filter(p=>p.rating>=4.0&&p.discountPct>=40&&p.currentPrice<10000).slice(0,12);
export const getNewLaunches   = () => ALL_PRODUCTS.filter(p=>p.isNew);
export const getAiRecommended = () => [...ALL_PRODUCTS].sort((a,b)=>(b.rating * b.discountPct) - (a.rating * a.discountPct)).slice(0,12);
export const getSeasonalDeals = () => [...ALL_PRODUCTS].sort((a,b)=>b.discountPct-a.discountPct).slice(2,14);