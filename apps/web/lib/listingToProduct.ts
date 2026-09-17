// Shared conversion from a raw DB listing (however it's shaped by different
// API endpoints) into the Product type ProductCard expects — kept in one
// place so the homepage and the product page's Similar Products section
// render cards identically.
import type { Product } from '@/lib/mockData'

export interface RawListing {
  id: string; name?: string; brand?: string; image?: string;
  currentPrice: number | string; originalPrice: number | string; discountPct?: number | string;
  rating?: number | string; reviewCount?: number; store?: string; category?: string;
  couponCode?: string; product?: { name?: string; brand?: string; images?: string[] };
}

export function getCategoryEmoji(cat?: string): string {
  const map: Record<string, string> = {
    Mobiles:'📱', Laptops:'💻', Electronics:'🔌', Audio:'🎧',
    'Smart Watches':'⌚', 'Home Appliances':'🏠', Kitchen:'🍳',
    Fashion:'👗', Beauty:'💄', Sports:'🏋️', Books:'📚', Toys:'🧸', Furniture:'🛋️',
  }
  return map[cat || ''] || '🛍️'
}

export function getCategoryGradient(cat?: string): string {
  const map: Record<string, string> = {
    Mobiles:'linear-gradient(135deg,#1a1a2e,#16213e)',
    Laptops:'linear-gradient(135deg,#1e3a5f,#2563eb)',
    Audio:'linear-gradient(135deg,#0f3460,#533483)',
    'Smart Watches':'linear-gradient(135deg,#1e3a5f,#0d2137)',
    Kitchen:'linear-gradient(135deg,#7c3aed,#5b21b6)',
    Fashion:'linear-gradient(135deg,#831843,#9d174d)',
    Beauty:'linear-gradient(135deg,#7c1d6f,#be185d)',
  }
  return map[cat || ''] || 'linear-gradient(135deg,#1a1a1a,#2d2d2d)'
}

export function listingToProduct(l: RawListing): Product {
  return {
    id:            l.id,
    name:          l.name || l.product?.name || 'Unknown',
    brand:         l.brand || l.product?.brand || '',
    image:         l.image || l.product?.images?.[0] || undefined,
    currentPrice:  Number(l.currentPrice),
    originalPrice: Number(l.originalPrice),
    discountPct:   Number(l.discountPct) || 0,
    rating:        l.rating ? Number(l.rating) : 4.0,
    reviewCount:   l.reviewCount || 0,
    store:         (l.store || 'Amazon') as Product['store'],
    category:      l.category || 'Electronics',
    emoji:         getCategoryEmoji(l.category),
    gradient:      getCategoryGradient(l.category),
    couponCode:    l.couponCode || undefined,
    isNew:         false,
    isTrending:    false,
    sourceLabel:   l.store + ' Verified',
  }
}
