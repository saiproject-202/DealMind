// Coupon AI Review — extracts structured data from a raw coupon
// submission and scores it for spam/fake probability.
// Reuses the same askClaude/parseJsonFromClaude pattern as deal
// extraction — no new AI infrastructure, same lib/claude.ts.

import { askClaude, parseJsonFromClaude } from './claude'
import { createHash } from 'crypto'

export interface CouponAiResult {
  merchant?:            string
  expiryDate?:           string | null
  minPurchase?:          number | null
  applicableCategories?: string[]
  regionRestriction?:    string | null
  newUserOnly?:          boolean
  paymentRestriction?:   string | null
  spamScore:             number   // 0-1, higher = more likely spam
  fakeScore:             number   // 0-1, higher = more likely fake
  explanations:          string[]
  // A suggestion only — the contributor makes the final call on couponType.
  // Stored in aiExtracted for admin/audit comparison, never overrides the
  // user's own selection.
  suggestedCouponType:   'REUSABLE' | 'SINGLE_USE'
}

export function normalizeHash(code: string, merchant: string): string {
  const normalized = `${code.trim().toUpperCase()}::${merchant.trim().toLowerCase()}`
  return createHash('sha256').update(normalized).digest('hex')
}

export async function reviewCoupon(rawText: string, merchantHint?: string): Promise<CouponAiResult> {
  try {
    const raw = await askClaude(`
You are a coupon verification AI for an Indian e-commerce platform.
Analyze this coupon submission and return ONLY valid JSON:

{
  "merchant": "store name (Amazon/Flipkart/Myntra/etc) or null",
  "expiryDate": "ISO date string if mentioned, or null",
  "minPurchase": minimum order value in INR as number, or null,
  "applicableCategories": ["array of categories this applies to, or empty"],
  "regionRestriction": "region if restricted (e.g. 'Mumbai only'), or null",
  "newUserOnly": true or false,
  "paymentRestriction": "payment method if restricted (e.g. 'ICICI cards only'), or null",
  "spamScore": number 0 to 1 — how likely this is spam/gibberish/unrelated text,
  "fakeScore": number 0 to 1 — how likely this coupon code is fake or non-functional,
  "explanations": ["2-4 short factual bullet points explaining the extraction, e.g. 'Expiry date found: 31 Dec 2026', 'No minimum purchase mentioned'"],
  "suggestedCouponType": "REUSABLE" or "SINGLE_USE" — SINGLE_USE if the text implies it only works once per account (e.g. "new users only", "first order only", "one use per account"), otherwise REUSABLE
}

${merchantHint ? `Hint: likely merchant is ${merchantHint}` : ''}

Coupon submission text: "${rawText}"`, 700)

    const parsed = parseJsonFromClaude(raw) as Partial<{
      merchant: string
      expiryDate: string
      minPurchase: number
      applicableCategories: string[]
      regionRestriction: string
      newUserOnly: boolean
      paymentRestriction: string
      spamScore: number
      fakeScore: number
      explanations: string[]
      suggestedCouponType: 'REUSABLE' | 'SINGLE_USE'
    }>

    const newUserOnly = !!parsed.newUserOnly
    return {
      merchant:             parsed.merchant || merchantHint,
      expiryDate:           parsed.expiryDate || null,
      minPurchase:          parsed.minPurchase || null,
      applicableCategories: parsed.applicableCategories || [],
      regionRestriction:    parsed.regionRestriction || null,
      newUserOnly,
      paymentRestriction:   parsed.paymentRestriction || null,
      spamScore:            typeof parsed.spamScore === 'number' ? parsed.spamScore : 0.1,
      fakeScore:            typeof parsed.fakeScore === 'number' ? parsed.fakeScore : 0.1,
      explanations:         parsed.explanations || [],
      // Fallback mirrors the same rule the prompt asks Claude to apply —
      // used only if Claude's response omits the field.
      suggestedCouponType:  parsed.suggestedCouponType === 'SINGLE_USE' || parsed.suggestedCouponType === 'REUSABLE'
        ? parsed.suggestedCouponType
        : (newUserOnly ? 'SINGLE_USE' : 'REUSABLE'),
    }
  } catch (err) {
    // Claude failed — fall back to a permissive default so submission
    // doesn't hard-fail. Low confidence, goes to manual review naturally
    // (confidenceScore stays 0 until community signals arrive in M7).
    console.error('Coupon AI review failed, using fallback:', err)
    return {
      merchant: merchantHint,
      expiryDate: null,
      minPurchase: null,
      applicableCategories: [],
      regionRestriction: null,
      newUserOnly: false,
      paymentRestriction: null,
      spamScore: 0.2,
      fakeScore: 0.2,
      explanations: ['AI review unavailable — pending manual/community verification'],
      suggestedCouponType: 'REUSABLE',
    }
  }
}