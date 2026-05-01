// =====================================================
// CAPITAL-AWARE RANKER
// =====================================================
// Combines classification + bundles + capital state into
// a ranked list of opportunities. The headline output is
// `lethalScore` (0..100) plus an `action` decision and a
// single `bestUseOfCapital` flag.
//
// Hard rules (per spec):
//   - Only ONE candidate gets bestUseOfCapital = true.
//   - Unaffordable trades MUST NOT receive option_candidate
//     or stock_candidate (they may still be deep_scan/watch).
//   - Probability/premium fields stay null when unavailable;
//     no random or fabricated values.
// =====================================================

import {
  CAPITAL_FIT,
  ACTION,
  OPPORTUNITY_TYPE,
  PROBABILITY_STATUS,
  PREMIUM_SOURCE,
  SIZING_BIAS,
  CAPITAL_PRESSURE,
  safeNum,
  clamp,
  round2,
} from "./types.js";
import { classifyBundles } from "./bundleClassifier.js";

const SHORT_PUT_MULT = 100;
const STOCK_LOT = 100;
const OTM_PCT_FOR_PUT_ESTIMATE = 0.95;   // assume 5% OTM put when sizing collateral

// --------------------------------------------------
// CAPITAL FIT
// --------------------------------------------------

export function classifyCapitalFit(capitalRequired, capitalState) {
  const req = safeNum(capitalRequired);
  const remaining = safeNum(capitalState?.remainingDeployableCash);
  const available = safeNum(capitalState?.availableCash);
  if (req <= 0) return CAPITAL_FIT.NOT_AFFORDABLE;
  if (req > available) return CAPITAL_FIT.NOT_AFFORDABLE;
  if (req > remaining) return CAPITAL_FIT.POOR;
  if (remaining <= 0) return CAPITAL_FIT.POOR;
  const ratio = req / remaining;
  if (ratio <= 0.20) return CAPITAL_FIT.EXCELLENT;
  if (ratio <= 0.40) return CAPITAL_FIT.GOOD;
  if (ratio <= 0.70) return CAPITAL_FIT.ACCEPTABLE;
  return CAPITAL_FIT.POOR;
}

// --------------------------------------------------
// CAPITAL REQUIREMENT
// Estimates the smaller of (option short-put collateral, stock round-lot).
// Returned as the smaller value so we represent the smallest
// realistic deployment to "get on the board."
// --------------------------------------------------

export function estimateCapitalRequired(candidate) {
  const price = safeNum(candidate?.price);
  if (price <= 0) return { capitalRequired: 0, vehicle: "none" };

  const optionCollateral = price * OTM_PCT_FOR_PUT_ESTIMATE * SHORT_PUT_MULT;
  const stockCost = price * STOCK_LOT;

  if (stockCost <= optionCollateral) {
    return { capitalRequired: round2(stockCost), vehicle: "stock" };
  }
  return { capitalRequired: round2(optionCollateral), vehicle: "option" };
}

// --------------------------------------------------
// REGIME ALIGNMENT
// --------------------------------------------------

const RISK_ON_TYPES = new Set([
  OPPORTUNITY_TYPE.BREAKOUT,
  OPPORTUNITY_TYPE.AI_INFRA_SYMPATHY,
  OPPORTUNITY_TYPE.SEMICONDUCTOR_SYMPATHY,
  OPPORTUNITY_TYPE.CRYPTO_BETA,
  OPPORTUNITY_TYPE.VOLUME_EXPANSION,
]);
const DEFENSIVE_TYPES = new Set([
  OPPORTUNITY_TYPE.DEFENSIVE_ROTATION,
  OPPORTUNITY_TYPE.PULLBACK_TO_SUPPORT,
  OPPORTUNITY_TYPE.MEAN_REVERSION,
  OPPORTUNITY_TYPE.CREDIT_STRESS_PREMIUM,
]);

export function regimeAlignment(primaryType, detectedRegime, marketMode) {
  const r = String(detectedRegime || "").toUpperCase();
  const isStress = r.includes("CREDIT_STRESS") || r.includes("LOW_EDGE") || r.includes("RISK_OFF");
  const isRiskOn = r.includes("RISK_ON") || r.includes("HIGH_PREMIUM");
  const m = String(marketMode || "neutral").toLowerCase();

  if (m === "defensive" || isStress) {
    if (DEFENSIVE_TYPES.has(primaryType)) return "aligned";
    if (RISK_ON_TYPES.has(primaryType)) return "mismatch";
    return "neutral";
  }
  if (m === "opportunistic" || m === "risk_on" || isRiskOn) {
    if (RISK_ON_TYPES.has(primaryType)) return "aligned";
    if (DEFENSIVE_TYPES.has(primaryType)) return "neutral";
    return "neutral";
  }
  return "neutral";
}

// --------------------------------------------------
// SCORE COMPONENTS (deterministic, no random)
// --------------------------------------------------

function liquidityScoreFromDollarVol(dv) {
  const x = safeNum(dv);
  if (x <= 0) return 0;
  if (x >= 500_000_000) return 10;
  if (x >= 100_000_000) return 8;
  if (x >= 25_000_000) return 6;
  if (x >= 5_000_000) return 3;
  return 0;
}

function structureScoreFromSupport(distancePct) {
  if (distancePct == null || !Number.isFinite(Number(distancePct))) return 0;
  const d = Math.abs(Number(distancePct));
  if (d <= 1) return 10;
  if (d <= 2) return 8;
  if (d <= 3) return 5;
  if (d <= 5) return 2;
  return 0;
}

function capitalFitScore(fit) {
  switch (fit) {
    case CAPITAL_FIT.EXCELLENT: return 25;
    case CAPITAL_FIT.GOOD: return 20;
    case CAPITAL_FIT.ACCEPTABLE: return 12;
    case CAPITAL_FIT.POOR: return 5;
    case CAPITAL_FIT.NOT_AFFORDABLE: return 0;
    default: return 0;
  }
}

function regimeScoreFromAlignment(alignment) {
  if (alignment === "aligned") return 15;
  if (alignment === "neutral") return 7;
  return 0;
}

function bundleScoreFromBundles(bundles) {
  if (!Array.isArray(bundles) || bundles.length === 0) return 0;
  if (bundles.includes("unknown") && bundles.length === 1) return 0;
  if (bundles.length >= 2) return 10;
  return 6;
}

// --------------------------------------------------
// CONCENTRATION
// --------------------------------------------------

function buildOpenBundleSets(positions) {
  const primary = new Set();
  const concentration = new Set();
  for (const p of positions || []) {
    if (!p) continue;
    const sym = (p.symbol || "").toUpperCase();
    if (!sym) continue;
    let pb = p.primaryBundle;
    let cTags = p.concentrationTags;
    if (!pb || !Array.isArray(cTags)) {
      const result = classifyBundles(sym);
      pb = pb || result.primaryBundle;
      cTags = Array.isArray(cTags) ? cTags : result.concentrationTags;
    }
    if (pb) primary.add(pb);
    for (const tag of (cTags || [])) concentration.add(tag);
  }
  return { primary, concentration };
}

// --------------------------------------------------
// MAIN: rankCandidates
// --------------------------------------------------

/**
 * @param {object} args
 * @param {Array<object>} args.candidates   classified candidates with bundles attached
 * @param {import("./types.js").CapitalPolicyState} args.capitalState
 * @param {string} [args.detectedRegime]
 * @param {import("./types.js").MarketMode} [args.marketMode]
 * @param {Array<import("./types.js").OpenPosition>} [args.currentOpenPositions]
 * @returns {import("./types.js").RankedCandidate[]}
 */
export function rankCandidates(args) {
  const {
    candidates = [],
    capitalState,
    detectedRegime,
    marketMode,
    currentOpenPositions = [],
  } = args || {};

  if (!capitalState) {
    throw new Error("rankCandidates: capitalState is required");
  }

  const openBundles = buildOpenBundleSets(currentOpenPositions);
  const sizingBias = capitalState.sizingBias;
  const pressure = capitalState.capitalPressureLevel;

  // 1) Build raw ranked entries (unsorted, unranked)
  const enriched = (candidates || []).map((c) => {
    const symbol = String(c?.symbol || "").toUpperCase();
    const bundles = Array.isArray(c?.bundles) && c.bundles.length > 0
      ? c.bundles
      : classifyBundles(symbol).bundles;
    const primaryBundle = c?.primaryBundle || bundles[0] || "unknown";
    const concentrationTags = Array.isArray(c?.concentrationTags) && c.concentrationTags.length > 0
      ? c.concentrationTags
      : classifyBundles(symbol).concentrationTags;
    const classification = c?.classification || {
      symbol,
      primaryType: c?.primaryType || OPPORTUNITY_TYPE.WATCH_ONLY,
      opportunityTypes: c?.opportunityTypes || [OPPORTUNITY_TYPE.WATCH_ONLY],
      confidence: safeNum(c?.confidence, 0.3),
      reasons: c?.reasons || [],
      disqualifiers: c?.disqualifiers || [],
    };

    const { capitalRequired, vehicle } = estimateCapitalRequired(c);
    const fit = classifyCapitalFit(capitalRequired, capitalState);
    const remainingAfter = round2(Math.max(0, safeNum(capitalState.remainingDeployableCash) - capitalRequired));
    const alignment = regimeAlignment(classification.primaryType, detectedRegime, marketMode);

    const concentrationOverlapPrimary = openBundles.primary.has(primaryBundle);
    const concentrationOverlapTheme = (concentrationTags || []).some(t => openBundles.concentration.has(t));
    const concentrationWarning = concentrationOverlapPrimary
      ? `Open positions already exposed to ${primaryBundle} — concentration risk`
      : (concentrationOverlapTheme ? "Theme overlap with existing book" : null);

    // --- Score components ---
    const fitScore = capitalFitScore(fit);
    const oppScore = clamp(Math.round(safeNum(classification.confidence, 0) * 20), 0, 20);
    const regScore = regimeScoreFromAlignment(alignment);
    const liqScore = liquidityScoreFromDollarVol(c?.dollarVolume);
    const bndScore = bundleScoreFromBundles(bundles);
    const structScore = structureScoreFromSupport(c?.distanceToSupportPct);

    // Probability + premium are *not* synthesized — neutral when missing
    const probabilityStatus = c?.probabilityStatus === PROBABILITY_STATUS.AVAILABLE
      ? PROBABILITY_STATUS.AVAILABLE
      : PROBABILITY_STATUS.UNAVAILABLE;
    const probabilityScore = probabilityStatus === PROBABILITY_STATUS.AVAILABLE
      ? clamp(Math.round(safeNum(c?.probabilityScore, 0)), 0, 15)
      : 7;  // neutral placeholder, marked by status

    const premiumSource = c?.premiumSource || PREMIUM_SOURCE.UNAVAILABLE;
    const premiumScore = premiumSource === PREMIUM_SOURCE.LIVE
      ? clamp(Math.round(safeNum(c?.premiumScore, 0)), 0, 10)
      : (premiumSource === PREMIUM_SOURCE.ESTIMATED
        ? clamp(Math.round(safeNum(c?.premiumScore, 0) * 0.7), 0, 10)
        : 5);

    let concentrationPenalty = 0;
    if (concentrationOverlapPrimary) concentrationPenalty -= 10;
    else if (concentrationOverlapTheme) concentrationPenalty -= 5;

    let liquidityPenalty = 0;
    if (liqScore === 0) liquidityPenalty -= 10;

    let extraPenalty = 0;
    if (fit === CAPITAL_FIT.NOT_AFFORDABLE) extraPenalty -= 15;
    if (classification.primaryType === OPPORTUNITY_TYPE.NO_TRADE) extraPenalty -= 25;

    const scoreBreakdown = {
      capitalFitScore: fitScore,
      opportunityScore: oppScore,
      regimeScore: regScore,
      liquidityScore: liqScore,
      bundleScore: bndScore,
      probabilityScore,
      premiumScore,
      structureScore: structScore,
      concentrationPenalty,
      liquidityPenalty,
    };

    const lethalScore = clamp(
      Math.round(
        fitScore + oppScore + regScore + liqScore + bndScore
        + probabilityScore + premiumScore + structScore
        + concentrationPenalty + liquidityPenalty + extraPenalty
      ),
      0,
      100,
    );

    return {
      symbol,
      price: round2(safeNum(c?.price)),
      primaryType: classification.primaryType,
      opportunityTypes: classification.opportunityTypes,
      bundles,
      primaryBundle,
      concentrationTags,
      capitalRequired,
      vehicle,
      capitalFit: fit,
      remainingDeployableAfterTrade: remainingAfter,
      regimeAlignment: alignment,
      concentrationWarning,
      lethalScore,
      scoreBreakdown,
      probabilityStatus,
      premiumSource,
      reasons: classification.reasons || [],
      disqualifiers: classification.disqualifiers || [],
    };
  });

  // 2) Sort + assign rank
  enriched.sort((a, b) => b.lethalScore - a.lethalScore);
  enriched.forEach((e, i) => { e.rank = i + 1; });

  // 3) Pick the single bestUseOfCapital winner
  const winnerIdx = pickBestUseOfCapital(enriched, sizingBias, pressure);
  enriched.forEach((e, i) => { e.bestUseOfCapital = (i === winnerIdx); });

  const winnerSymbol = winnerIdx >= 0 ? enriched[winnerIdx].symbol : null;
  enriched.forEach((e, i) => {
    if (i === winnerIdx || winnerIdx < 0) {
      e.displacedBy = null;
      return;
    }
    const gap = enriched[winnerIdx].lethalScore - e.lethalScore;
    e.displacedBy = (gap >= 0 && gap <= 15) ? winnerSymbol : null;
  });

  // 4) Compute action + explanation per row
  return enriched.map((e) => {
    const action = pickAction(e, sizingBias, pressure);
    const explanation = buildExplanation(e, action);
    return {
      rank: e.rank,
      symbol: e.symbol,
      price: e.price,
      primaryType: e.primaryType,
      opportunityTypes: e.opportunityTypes,
      bundles: e.bundles,
      lethalScore: e.lethalScore,
      scoreBreakdown: e.scoreBreakdown,
      capitalRequired: e.capitalRequired,
      capitalFit: e.capitalFit,
      remainingDeployableAfterTrade: e.remainingDeployableAfterTrade,
      bestUseOfCapital: e.bestUseOfCapital,
      displacedBy: e.displacedBy,
      concentrationWarning: e.concentrationWarning,
      regimeAlignment: e.regimeAlignment,
      action,
      explanation,
      probabilityStatus: e.probabilityStatus,
      premiumSource: e.premiumSource,
    };
  });
}

// --------------------------------------------------
// ACTION SELECTION
// --------------------------------------------------

function pickAction(entry, sizingBias, pressure) {
  if (entry.disqualifiers && entry.disqualifiers.length > 0) {
    const reason = entry.disqualifiers.join(" / ");
    if (/dollar volume|spread/.test(reason)) return ACTION.SKIP_LIQUIDITY;
    return ACTION.SKIP_NO_EDGE;
  }
  if (entry.primaryType === OPPORTUNITY_TYPE.NO_TRADE) return ACTION.SKIP_NO_EDGE;

  // Capital-driven gates first — never recommend deployment we can't fund.
  if (entry.capitalFit === CAPITAL_FIT.NOT_AFFORDABLE) {
    if (entry.lethalScore >= 60) return ACTION.DEEP_SCAN;
    if (entry.lethalScore >= 45) return ACTION.WATCH;
    return ACTION.SKIP_CAPITAL_INEFFICIENT;
  }
  if (sizingBias === SIZING_BIAS.SKIP || pressure === CAPITAL_PRESSURE.MAXED) {
    if (entry.lethalScore >= 60) return ACTION.DEEP_SCAN;
    if (entry.lethalScore >= 45) return ACTION.WATCH;
    return ACTION.PAPER_TRACK;
  }

  if (entry.primaryType === OPPORTUNITY_TYPE.WATCH_ONLY) {
    return entry.lethalScore >= 50 ? ACTION.WATCH : ACTION.PAPER_TRACK;
  }

  // Affordable + enough conviction
  const fitOk = entry.capitalFit === CAPITAL_FIT.EXCELLENT
    || entry.capitalFit === CAPITAL_FIT.GOOD
    || entry.capitalFit === CAPITAL_FIT.ACCEPTABLE;

  if (entry.lethalScore >= 70 && fitOk) {
    // Prefer option vehicle when premium data exists or AI-theme high-IV bundle
    const optionFriendly = entry.premiumSource === PREMIUM_SOURCE.LIVE
      || entry.premiumSource === PREMIUM_SOURCE.ESTIMATED
      || entry.bundles.includes("ai_infrastructure")
      || entry.bundles.includes("semiconductors")
      || entry.bundles.includes("crypto_beta");
    return optionFriendly ? ACTION.OPTION_CANDIDATE : ACTION.STOCK_CANDIDATE;
  }
  if (entry.lethalScore >= 55) return ACTION.DEEP_SCAN;
  if (entry.lethalScore >= 40) return ACTION.WATCH;
  return ACTION.PAPER_TRACK;
}

// --------------------------------------------------
// BEST USE OF CAPITAL
// Single winner: highest lethalScore that is actually
// deployable (action option_candidate or stock_candidate).
// --------------------------------------------------

function pickBestUseOfCapital(entries, sizingBias, pressure) {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.capitalFit === CAPITAL_FIT.NOT_AFFORDABLE) continue;
    if (e.primaryType === OPPORTUNITY_TYPE.NO_TRADE) continue;
    if (sizingBias === SIZING_BIAS.SKIP) continue;
    if (pressure === CAPITAL_PRESSURE.MAXED) continue;
    const fitOk = e.capitalFit === CAPITAL_FIT.EXCELLENT
      || e.capitalFit === CAPITAL_FIT.GOOD
      || e.capitalFit === CAPITAL_FIT.ACCEPTABLE;
    if (!fitOk) continue;
    if (e.lethalScore < 60) continue;
    return i;
  }
  return -1;
}

// --------------------------------------------------
// EXPLANATION
// --------------------------------------------------

function buildExplanation(entry, action) {
  const parts = [];
  parts.push(`${entry.primaryType} (conf-driven score ${entry.lethalScore})`);
  parts.push(`fit=${entry.capitalFit}`);
  if (entry.regimeAlignment !== "neutral") parts.push(`regime=${entry.regimeAlignment}`);
  if (entry.concentrationWarning) parts.push(entry.concentrationWarning);
  if (entry.bestUseOfCapital) parts.push("best use of remaining capital");
  if (entry.displacedBy) parts.push(`displaced by ${entry.displacedBy}`);
  parts.push(`→ ${action}`);
  return parts.join(" · ");
}
