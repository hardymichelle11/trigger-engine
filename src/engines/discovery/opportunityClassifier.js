// =====================================================
// OPPORTUNITY CLASSIFIER
// =====================================================
// Deterministic, pure-function classifier. No randomness,
// no fabrication of missing data. Each candidate gets:
//   - opportunityTypes: array of all matching types
//   - primaryType: highest-priority type
//   - confidence: 0..1 from signal density
//   - reasons: human-readable evidence per match
//   - disqualifiers: hard reasons to skip
//
// If no rule fires the candidate is "watch_only" with low
// confidence — it remains visible to the ranker for paper
// tracking instead of being dropped.
// =====================================================

import { OPPORTUNITY_TYPE, BUNDLE, safeNum } from "./types.js";

// --------------------------------------------------
// THRESHOLDS — kept here so they are reviewable in one place
// --------------------------------------------------

export const CLASSIFIER_THRESHOLDS = Object.freeze({
  minDollarVolume: 5_000_000,
  minPrice: 1.0,
  relVolumeExpansion: 1.5,
  relVolumeAccumulation: 1.2,
  relVolumeBreakoutConfirm: 1.2,
  atrExpansion: 1.5,
  ivExpansionPercentile: 70,
  pullbackSupportPct: 2.0,
  meanReversionDropPct: -3.0,
  accumulationMaxChangePct: 1.5,
});

// --------------------------------------------------
// PRIORITY ORDERING — when a candidate matches several
// types, the primary is picked by this priority list.
// Higher index = higher priority.
// --------------------------------------------------

const TYPE_PRIORITY = [
  OPPORTUNITY_TYPE.WATCH_ONLY,
  OPPORTUNITY_TYPE.ACCUMULATION,
  OPPORTUNITY_TYPE.MEAN_REVERSION,
  OPPORTUNITY_TYPE.PULLBACK_TO_SUPPORT,
  OPPORTUNITY_TYPE.DEFENSIVE_ROTATION,
  OPPORTUNITY_TYPE.AI_INFRA_SYMPATHY,
  OPPORTUNITY_TYPE.SEMICONDUCTOR_SYMPATHY,
  OPPORTUNITY_TYPE.DATACENTER_POWER,
  OPPORTUNITY_TYPE.CRYPTO_BETA,
  OPPORTUNITY_TYPE.CREDIT_STRESS_PREMIUM,
  OPPORTUNITY_TYPE.VOLUME_EXPANSION,
  OPPORTUNITY_TYPE.VOLATILITY_EXPANSION,
  OPPORTUNITY_TYPE.BREAKOUT,
];

function pickPrimary(types) {
  if (!types || types.length === 0) return OPPORTUNITY_TYPE.WATCH_ONLY;
  let best = types[0];
  let bestRank = TYPE_PRIORITY.indexOf(best);
  for (const t of types) {
    const r = TYPE_PRIORITY.indexOf(t);
    if (r > bestRank) { best = t; bestRank = r; }
  }
  return best;
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function relVolume(volume, avgVolume) {
  const v = safeNum(volume);
  const a = safeNum(avgVolume);
  if (v <= 0 || a <= 0) return null;
  return v / a;
}

function inferPercentChange(c) {
  if (Number.isFinite(Number(c.percentChange))) return Number(c.percentChange);
  const p = safeNum(c.price);
  const prev = safeNum(c.previousClose);
  if (p > 0 && prev > 0) return ((p - prev) / prev) * 100;
  return null;
}

function isCreditStressRegime(regime) {
  if (!regime) return false;
  const r = String(regime).toUpperCase();
  return r.includes("CREDIT_STRESS") || r.includes("HIGH_PREMIUM");
}

function isStressedOrDefensiveRegime(regime) {
  if (!regime) return false;
  const r = String(regime).toUpperCase();
  return r.includes("CREDIT_STRESS") || r.includes("LOW_EDGE") || r.includes("RISK_OFF");
}

// --------------------------------------------------
// PUBLIC: classifyOpportunity
// --------------------------------------------------

/**
 * Classify a single market candidate into opportunity types.
 *
 * @param {import("./types.js").RawCandidate & { bundles?: string[] }} cand
 * @param {object} [opts]
 * @param {object} [opts.thresholds]    override CLASSIFIER_THRESHOLDS
 * @returns {import("./types.js").ClassificationResult}
 */
export function classifyOpportunity(cand, opts = {}) {
  const t = { ...CLASSIFIER_THRESHOLDS, ...(opts.thresholds || {}) };
  const symbol = String(cand?.symbol || "").toUpperCase();
  const reasons = [];
  const disqualifiers = [];
  const types = [];

  const price = safeNum(cand?.price);
  const change = inferPercentChange(cand || {});
  const rv = relVolume(cand?.volume, cand?.avgVolume);
  const dollarVol = safeNum(cand?.dollarVolume);
  const atrExp = safeNum(cand?.atrExpansion);
  const ivPct = Number.isFinite(Number(cand?.ivPercentile)) ? Number(cand.ivPercentile) : null;
  const trend = (cand?.trend || "").toLowerCase();
  const distSupport = Number.isFinite(Number(cand?.distanceToSupportPct))
    ? Number(cand.distanceToSupportPct)
    : null;
  const near20High = !!cand?.near20DayHigh;
  const breakoutFlag = !!cand?.recentRangeBreakout;
  const regime = cand?.detectedRegime;
  const bundles = Array.isArray(cand?.bundles) ? cand.bundles : [];

  // --- Hard disqualifiers ---
  if (price > 0 && price < t.minPrice) {
    disqualifiers.push(`price ${price} below ${t.minPrice}`);
  }
  if (dollarVol > 0 && dollarVol < t.minDollarVolume) {
    disqualifiers.push(`dollar volume ${Math.round(dollarVol)} below ${t.minDollarVolume}`);
  }

  if (disqualifiers.length > 0) {
    return {
      symbol,
      opportunityTypes: [OPPORTUNITY_TYPE.NO_TRADE],
      primaryType: OPPORTUNITY_TYPE.NO_TRADE,
      confidence: 0,
      reasons,
      disqualifiers,
    };
  }

  // --- Volume expansion ---
  if (rv != null && rv >= t.relVolumeExpansion && (dollarVol === 0 || dollarVol >= t.minDollarVolume)) {
    types.push(OPPORTUNITY_TYPE.VOLUME_EXPANSION);
    reasons.push(`relVolume ${rv.toFixed(2)}x avg`);
  }

  // --- Volatility expansion ---
  const atrHit = atrExp >= t.atrExpansion;
  const ivHit = ivPct != null && ivPct >= t.ivExpansionPercentile;
  if (atrHit || ivHit) {
    types.push(OPPORTUNITY_TYPE.VOLATILITY_EXPANSION);
    if (atrHit) reasons.push(`ATR expansion ${atrExp.toFixed(2)}x`);
    if (ivHit) reasons.push(`IV ${ivPct}%ile`);
  }

  // --- Breakout ---
  if (breakoutFlag || near20High) {
    const volOk = rv == null || rv >= t.relVolumeBreakoutConfirm;
    if (volOk) {
      types.push(OPPORTUNITY_TYPE.BREAKOUT);
      reasons.push(near20High ? "near 20d high" : "recent range breakout");
    }
  }

  // --- Pullback to support ---
  if (
    distSupport != null
    && Math.abs(distSupport) <= t.pullbackSupportPct
    && (trend === "up" || trend === "sideways" || !trend)
    && (change === null || change > -3)
  ) {
    types.push(OPPORTUNITY_TYPE.PULLBACK_TO_SUPPORT);
    reasons.push(`within ${t.pullbackSupportPct}% of support`);
  }

  // --- Mean reversion ---
  if (
    change != null
    && change <= t.meanReversionDropPct
    && rv != null && rv >= t.relVolumeExpansion
    && trend !== "down"
  ) {
    types.push(OPPORTUNITY_TYPE.MEAN_REVERSION);
    reasons.push(`drop ${change.toFixed(2)}% on relVolume ${rv.toFixed(2)}x`);
  }

  // --- Accumulation ---
  if (
    change != null
    && change >= 0
    && change <= t.accumulationMaxChangePct
    && rv != null && rv >= t.relVolumeAccumulation
  ) {
    types.push(OPPORTUNITY_TYPE.ACCUMULATION);
    reasons.push(`flat-positive close on rising volume`);
  }

  // --- Bundle-driven theme classifications ---
  if (bundles.includes(BUNDLE.AI_INFRASTRUCTURE) && change != null && change > 0 && (rv == null || rv >= 1.0)) {
    types.push(OPPORTUNITY_TYPE.AI_INFRA_SYMPATHY);
    reasons.push("AI infra bundle moving with broader theme");
  }
  if (bundles.includes(BUNDLE.SEMICONDUCTORS) && change != null && change > 0) {
    types.push(OPPORTUNITY_TYPE.SEMICONDUCTOR_SYMPATHY);
    reasons.push("semi bundle constructive");
  }
  if (bundles.includes(BUNDLE.DATACENTER_POWER)) {
    types.push(OPPORTUNITY_TYPE.DATACENTER_POWER);
    reasons.push("datacenter/power exposure");
  }
  if (bundles.includes(BUNDLE.CRYPTO_BETA) && rv != null && rv >= 1.2) {
    types.push(OPPORTUNITY_TYPE.CRYPTO_BETA);
    reasons.push("crypto beta active");
  }

  // --- Defensive rotation ---
  if (bundles.includes(BUNDLE.DEFENSIVE_DIVIDEND) && isStressedOrDefensiveRegime(regime)) {
    types.push(OPPORTUNITY_TYPE.DEFENSIVE_ROTATION);
    reasons.push(`defensive bundle into ${regime}`);
  }

  // --- Credit-stress premium ---
  if (bundles.includes(BUNDLE.FINANCIALS_CREDIT) && isCreditStressRegime(regime)) {
    types.push(OPPORTUNITY_TYPE.CREDIT_STRESS_PREMIUM);
    reasons.push("credit-sensitive into stress regime");
  }

  // --- Resolve final ---
  if (types.length === 0) {
    return {
      symbol,
      opportunityTypes: [OPPORTUNITY_TYPE.WATCH_ONLY],
      primaryType: OPPORTUNITY_TYPE.WATCH_ONLY,
      confidence: 0.3,
      reasons: ["no decisive signal — track only"],
      disqualifiers: [],
    };
  }

  const dedupedTypes = Array.from(new Set(types));
  const primaryType = pickPrimary(dedupedTypes);
  const confidence = computeConfidence(dedupedTypes, reasons.length);

  return {
    symbol,
    opportunityTypes: dedupedTypes,
    primaryType,
    confidence,
    reasons,
    disqualifiers,
  };
}

/**
 * @param {string[]} types
 * @param {number} reasonCount
 */
function computeConfidence(types, reasonCount) {
  // Confidence climbs with both type breadth and reason density,
  // saturating at 0.95 so nothing is reported as certain.
  const base = Math.min(0.6, 0.2 + types.length * 0.1);
  const reasonBoost = Math.min(0.35, reasonCount * 0.05);
  return Math.min(0.95, Math.round((base + reasonBoost) * 100) / 100);
}

/**
 * Convenience: classify a list of candidates.
 * @param {Array<import("./types.js").RawCandidate & { bundles?: string[] }>} cands
 * @param {object} [opts]
 * @returns {import("./types.js").ClassificationResult[]}
 */
export function classifyAll(cands, opts) {
  return (cands || []).map(c => classifyOpportunity(c, opts));
}
