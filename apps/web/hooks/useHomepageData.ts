// Fetches real product data from the homepage API. Each section is only
// ever populated with genuinely-qualifying products (see deals.routes.ts's
// /homepage handler) — an empty array from the API means no product
// currently qualifies for that section, and SectionRow hides it entirely.
// Mock data is intentionally NOT used as a silent fallback here: if the API
// has nothing to show, the homepage shows nothing rather than fake products.

import { useEffect, useState } from 'react'
import type { Product } from '@/lib/mockData'
import { apiFetch } from "@/lib/apiFetch";
import { listingToProduct } from "@/lib/listingToProduct";

export interface HomepageSections {
  priceDrops:    Product[]
  couponDeals:   Product[]
  trending:      Product[]
  mostSold:      Product[]
  bestValue:     Product[]
  hiddenGems:    Product[]
  aiRecommended: Product[]
  newLaunches:   Product[]
  seasonal:      Product[]
  isRealData:    boolean
}

const EMPTY_SECTIONS: HomepageSections = {
  priceDrops: [], couponDeals: [], trending: [], mostSold: [], bestValue: [],
  hiddenGems: [], aiRecommended: [], newLaunches: [], seasonal: [],
  isRealData: false,
}

export function useHomepageData(): { sections: HomepageSections; loading: boolean } {
  const [loading, setLoading] = useState(true)
  const [sections, setSections] = useState<HomepageSections>(EMPTY_SECTIONS)

  useEffect(() => {
    apiFetch("/api/deals/homepage", {
        auth: false,
        cache: "no-store",
    })
      .then(r => r.json())
      .then(data => {
        if (!data.sections) return
        const s = data.sections
        setSections({
          priceDrops:    (s.priceDrops    || []).map(listingToProduct),
          couponDeals:   (s.couponDeals   || []).map(listingToProduct),
          trending:      (s.trending      || []).map(listingToProduct),
          mostSold:      (s.mostSold      || []).map(listingToProduct),
          bestValue:     (s.bestValue     || []).map(listingToProduct),
          hiddenGems:    (s.hiddenGems    || []).map(listingToProduct),
          aiRecommended: (s.aiRecommended || []).map(listingToProduct),
          newLaunches:   (s.newLaunches   || []).map(listingToProduct),
          seasonal:      (s.seasonal      || []).map(listingToProduct),
          isRealData:    true,
        })
      })
      .catch(() => {/* leave sections empty — no mock fallback */})
      .finally(() => setLoading(false))
  }, [])

  return { sections, loading }
}
