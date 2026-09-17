// Coupon Confidence Engine — weighted community trust score.
//
// Core principle: confidence is a LIVING score, recomputed on every
// report, never a one-time gate. A single "worked" report can never
// push confidence near 100% — Bayesian smoothing acts as a prior that
// assumes some uncertainty until enough signal accumulates.
//
// NO FIXED THRESHOLDS ("3 reports", "2 confirmations") anywhere in this
// file — every decision is a continuous function of weighted signals,
// by design, so a future model can replace computeConfidenceFromSignals()
// below without anything else (schema, routes, callers) changing.

import prisma from './prisma'

const VERIFIED_THRESHOLD = 70

/**
 * Weight a single report by the reporter's trustworthiness.
 * New accounts (<48h) get near-zero weight — the core sybil defense.
 * Reports tied to a confirmed affiliate conversion get a strong boost
 * (conversionId presence) — that's the "Level 2/3" signal from the
 * architecture doc, far stronger than a bare self-report.
 */
async function getReportWeight(userId: string, hasConversionProof: boolean): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, trustScore: true },
  })
  if (!user) return 0

  const accountAgeHours = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60)
  if (accountAgeHours < 48) return 0.1 // brand new account — near-zero influence

  const trust = Number(user.trustScore) || 0.5 // default mid-trust if unset
  let weight = 0.5 + trust * 1.5 // scales roughly 0.5 (trust=0) to 2.0 (trust=1)

  if (hasConversionProof) weight *= 5 // affiliate-confirmed usage is the strongest signal

  return weight
}

/**
 * A reporter is "trusted enough" to trigger irreversible/high-stakes effects
 * (single-use redemption, contributor rewards) when their weight clears the
 * near-zero band reserved for brand-new/untrusted accounts. Continuous, not
 * a report-count threshold — a single report from a highly-trusted, aged
 * account can qualify; ten reports from throwaway accounts cannot.
 */
function isTrustedWeight(weight: number): boolean {
  return weight >= 0.5
}

export interface ConfidenceSignals {
  successWeight:  number  // sum of report.weight where type === 'worked'
  failWeight:     number  // sum of report.weight where type in (failed, expired)
  fakeWeight:     number  // sum of report.weight where type === 'fake'
  reportCount:    number  // distinct active reports — "maturity"
  couponAgeHours: number  // time since the coupon was submitted
  hoursSinceLastSignal: number // time since most recent report (or since creation)
  aiReviewScore:  number  // 0-1, (1 - fakeScore) * (1 - spamScore) from AI review
}

/**
 * Pure scoring function — the one piece a future ML model would replace.
 * Everything else (schema, routes, the report-locking flow) stays put.
 */
export function computeConfidenceFromSignals(s: ConfidenceSignals): { confidence: number; fakeFlagRatio: number } {
  // Bayesian prior — neutral 3-of-6 "virtual" reports, same as before AI
  // signals existed. This is what keeps a coupon with ZERO community
  // reports at ~50%, never near the verified threshold on AI review alone
  // — AI review only ever modulates real community evidence, it never
  // substitutes for it (see aiModifier below).
  const priorTotal   = 6
  const priorSuccess = 3

  const totalWeight = s.successWeight + s.failWeight
  let confidence = ((s.successWeight + priorSuccess) / (totalWeight + priorTotal)) * 100

  // AI review score is a bounded modifier (±15%), not a second vote — a
  // coupon the AI is fully confident about can nudge confidence up at
  // most 15%; one it flagged as likely fake/spam pulls it down at most
  // 15%. Either way it can never single-handedly cross VERIFIED_THRESHOLD
  // from zero community weight.
  const aiModifier = 0.85 + 0.3 * s.aiReviewScore
  confidence *= aiModifier

  // Freshness — continuous decay based on time since the last signal, not
  // a hard cutoff. A coupon nobody has confirmed in months trends down;
  // one with a report yesterday stays near full strength. The floor (how
  // low decay alone can push confidence) and the decay window itself both
  // widen with reportCount — "previous confirmations" (maturity): a
  // coupon with a long corroborated history is more resistant to going
  // stale than one resting on a single report.
  const maturity   = Math.min(s.reportCount, 20)
  const floor      = Math.min(0.7 + maturity * 0.01, 0.9)
  const decayHours = (45 + maturity * 3) * 24
  const freshness  = floor + (1 - floor) / (1 + s.hoursSinceLastSignal / decayHours)
  confidence *= freshness

  const fakeFlagRatio = totalWeight + s.fakeWeight > 0
    ? s.fakeWeight / (totalWeight + s.fakeWeight)
    : 0

  return { confidence: Math.round(Math.max(0, Math.min(100, confidence))), fakeFlagRatio }
}

/**
 * Recomputes and persists a coupon's confidence score from scratch,
 * based on all its ACTIVE reports (admin-reset votes are excluded but
 * never deleted). Called after every new report or admin reset.
 */
export async function recomputeConfidence(couponId: string): Promise<{
  confidence: number
  status: string
}> {
  const coupon = await prisma.coupon.findUnique({ where: { id: couponId } })
  if (!coupon) return { confidence: 0, status: 'unknown' }

  const reports = await prisma.couponReport.findMany({ where: { couponId, isActive: true } })

  let successWeight = 0
  let failWeight     = 0
  let fakeWeight      = 0
  let lastReportAt: Date | null = null

  for (const r of reports) {
    if (r.type === 'worked') successWeight += r.weight
    else if (r.type === 'failed' || r.type === 'expired') failWeight += r.weight
    else if (r.type === 'fake') fakeWeight += r.weight

    if (!lastReportAt || r.createdAt > lastReportAt) lastReportAt = r.createdAt
  }

  const ai = (coupon.aiExtracted as { spamScore?: number; fakeScore?: number } | null) || {}
  const aiReviewScore = (1 - (ai.fakeScore ?? 0.1)) * (1 - (ai.spamScore ?? 0.1))

  const now = Date.now()
  const couponAgeHours = (now - coupon.createdAt.getTime()) / (1000 * 60 * 60)
  const hoursSinceLastSignal = (now - (lastReportAt ?? coupon.createdAt).getTime()) / (1000 * 60 * 60)

  const { confidence, fakeFlagRatio } = computeConfidenceFromSignals({
    successWeight, failWeight, fakeWeight,
    reportCount: reports.length,
    couponAgeHours, hoursSinceLastSignal, aiReviewScore,
  })

  let newStatus = coupon.status

  // Weighted ratio replaces the old fixed "3 trusted fake reports" rule —
  // a minimum absolute weight floor (0.9, roughly one trusted account's
  // worth) stops a single borderline-weight report from flagging alone.
  if (fakeWeight >= 0.9 && fakeFlagRatio >= 0.4) {
    newStatus = 'flagged'
  } else if (confidence >= VERIFIED_THRESHOLD && coupon.status === 'pending_verification') {
    newStatus = 'verified'
  } else if (confidence < VERIFIED_THRESHOLD && coupon.status === 'verified') {
    // Demotion — confidence dropped after being verified (failure reports spiked)
    newStatus = 'pending_verification'
  }

  await prisma.coupon.update({
    where: { id: couponId },
    data:  { confidenceScore: confidence, status: newStatus },
  })

  return { confidence, status: newStatus }
}

/** Exposed for the report route to compute weight before saving. */
export { getReportWeight, isTrustedWeight }