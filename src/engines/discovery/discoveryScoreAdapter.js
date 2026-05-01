// =====================================================
// DISCOVERY SCORE ADAPTER
// =====================================================
// Normalizes outputs from EXISTING engines (setupScoring,
// signalEngine UI cards, probabilityLayer, chartContext,
// liveStateEngine) into discovery-friendly fields.
//
// Hard rules (per spec):
//   - DOES NOT MUTATE the source object.
//   - Tolerates any missing field.
//   - Does not pick the final ranking — only normalizes.
//   - Does not invent values when data is absent.
// =====================================================

import { safeNum, clamp } from "./types.js";

/**
 * @typedef {object} AdapterOutput
 * @property {boolean} hasExistingSignal
 * @property {number} normalizedScore     0..30 contribution (setup score normalized)
 * @property {number} probabilityScore    0..15 contribution
 * @property {number} riskPenalty         negative
 * @property {number} freshnessPenalty    negative
 * @property {"strong"|"moderate"|"weak"|"stale"|"none"} signalQuality
 * @property {boolean} usableForDiscovery
 * @property {string[]} reasons
 */

const SOURCE_FRESHNESS_LIMITS = Object.freeze({
  maxAgeSec: 15 * 60,           // 15 min default age tolerance
  maxAnchorDriftPct: 0.04,      // 4% drift on anchor price
});

// --------------------------------------------------
// FIELD EXTRACTORS — defensive, tolerate missing/typed fields
// --------------------------------------------------

function readSetupScore(source) {
  if (!source || typeof source !== "object") return null;
  if (Number.isFinite(Number(source.score))) return Number(source.score);
  if (Number.isFinite(Number(source.baselineScore))) return Number(source.baselineScore);
  if (Number.isFinite(Number(source.setupScore))) return Number(source.setupScore);
  return null;
}

function readProbability(source) {
  if (!source || typeof source !== "object") return {};
  const p = source.probability && typeof source.probability === "object" ? source.probability : source;
  const probAbove = Number.isFinite(Number(p?.probAboveStrike)) ? Number(p.probAboveStrike)
    : Number.isFinite(Number(source.probabilityAboveStrike)) ? Number(source.probabilityAboveStrike)
    : null;
  const probTouch = Number.isFinite(Number(p?.probTouch)) ? Number(p.probTouch)
    : Number.isFinite(Number(source.touchProbability)) ? Number(source.touchProbability)
    : null;
  const drawdown = Number.isFinite(Number(p?.avgMaxDrawdown)) ? Number(p.avgMaxDrawdown)
    : Number.isFinite(Number(source.avgMaxDrawdown)) ? Number(source.avgMaxDrawdown)
    : null;
  return { probAbove, probTouch, drawdown };
}

function readIvPercentile(source) {
  if (!source) return null;
  if (Number.isFinite(Number(source?.ivPercentile))) return Number(source.ivPercentile);
  if (Number.isFinite(Number(source?.metrics?.ivPercentile))) return Number(source.metrics.ivPercentile);
  return null;
}

function readSpreadQuality(source) {
  if (!source) return null;
  if (typeof source.spreadQuality === "string") return source.spreadQuality;
  if (typeof source.watchlist?.spreadQuality === "string") return source.watchlist.spreadQuality;
  return null;
}

function readChartScore(source) {
  if (!source) return 0;
  if (Number.isFinite(Number(source?.chartContextScore))) return Number(source.chartContextScore);
  if (Number.isFinite(Number(source?.chartContext?.adjustments))) return Number(source.chartContext.adjustments);
  return 0;
}

function readRegimeAlignment(source) {
  if (!source) return null;
  if (typeof source.regimeAlignment === "string") return source.regimeAlignment;
  if (typeof source.regime === "string") return source.regime;
  if (typeof source.regimeContext?.regime === "string") return source.regimeContext.regime;
  return null;
}

function readFreshness(source) {
  if (!source) return { stale: false, reason: null, ageSec: null, drift: null };

  // Direct booleans/strings
  if (source.stale === true) return { stale: true, reason: "stale flag set", ageSec: null, drift: null };
  if (source.freshnessState === "stale" || source.freshnessState === "INVALID") {
    return { stale: true, reason: `freshnessState=${source.freshnessState}`, ageSec: null, drift: null };
  }

  // liveState block from existing engine
  const live = source.liveState || source.freshness || null;
  if (live && typeof live === "object") {
    const ageSec = Number.isFinite(Number(live.ageSec)) ? Number(live.ageSec)
      : Number.isFinite(Number(live.age)) ? Number(live.age) : null;
    const drift = Number.isFinite(Number(live.anchorDriftPct)) ? Number(live.anchorDriftPct)
      : Number.isFinite(Number(live.anchorDrift)) ? Number(live.anchorDrift) : null;
    if (drift != null && Math.abs(drift) > SOURCE_FRESHNESS_LIMITS.maxAnchorDriftPct) {
      return { stale: true, reason: `anchor drift ${(drift * 100).toFixed(1)}%`, ageSec, drift };
    }
    if (ageSec != null && ageSec > SOURCE_FRESHNESS_LIMITS.maxAgeSec) {
      return { stale: true, reason: `age ${Math.round(ageSec)}s exceeds ${SOURCE_FRESHNESS_LIMITS.maxAgeSec}s`, ageSec, drift };
    }
    return { stale: false, reason: null, ageSec, drift };
  }

  return { stale: false, reason: null, ageSec: null, drift: null };
}

// --------------------------------------------------
// SCORERS
// --------------------------------------------------

function scoreSetup(setupScore) {
  if (setupScore == null) return 0;
  if (setupScore >= 75) return 25;
  if (setupScore >= 55) return 15;
  if (setupScore >= 40) return 8;
  return 0;
}

function scoreProbability(probAbove, probTouch) {
  let s = 0;
  if (Number.isFinite(probAbove)) {
    if (probAbove >= 0.75) s += 15;
    else if (probAbove >= 0.65) s += 12;
    else if (probAbove >= 0.55) s += 6;
  }
  if (Number.isFinite(probTouch) && probTouch <= 0.30 && s > 0) s += 1; // small bonus for low touch
  return clamp(s, 0, 15);
}

function scoreSpread(quality) {
  if (!quality) return 0;
  if (quality === "A+") return 3;
  if (quality === "A") return 2;
  if (quality === "B+") return 1;
  return 0;
}

function scoreRegimeAlignment(alignment) {
  if (!alignment) return 0;
  const a = String(alignment).toUpperCase();
  if (a === "ALIGNED" || a === "RISK_ON" || a === "HIGH_PREMIUM_ENVIRONMENT") return 3;
  if (a === "MISMATCH" || a === "RISK_OFF" || a === "LOW_EDGE") return 0;
  return 1;
}

function penaltyRisk(probTouch, drawdown) {
  let p = 0;
  if (Number.isFinite(probTouch) && probTouch > 0.45) p -= 8;
  if (Number.isFinite(drawdown) && drawdown > 0.08) p -= 10;
  return p;
}

function penaltyFreshness(freshness) {
  return freshness.stale ? -15 : 0;
}

// --------------------------------------------------
// PUBLIC: adaptExistingSignal
// --------------------------------------------------

/**
 * Normalize a single existing setup card / analysis object into
 * discovery-friendly contributions. Pure function — does not mutate.
 *
 * @param {object|null|undefined} source        existing engine output (e.g. buildUiCard result)
 * @returns {AdapterOutput}
 */
export function adaptExistingSignal(source) {
  // No source at all? Safe empty result.
  if (!source || typeof source !== "object") {
    return {
      hasExistingSignal: false,
      normalizedScore: 0,
      probabilityScore: 0,
      riskPenalty: 0,
      freshnessPenalty: 0,
      signalQuality: "none",
      usableForDiscovery: false,
      reasons: [],
    };
  }

  const setupScore = readSetupScore(source);
  const { probAbove, probTouch, drawdown } = readProbability(source);
  const ivPct = readIvPercentile(source);
  const spreadQuality = readSpreadQuality(source);
  const chartAdj = readChartScore(source);
  const regimeAlign = readRegimeAlignment(source);
  const freshness = readFreshness(source);

  const reasons = [];

  // Build score contributions (all bounded so they can't dominate)
  const setupContribution = scoreSetup(setupScore);
  if (setupScore != null) {
    if (setupScore >= 75) reasons.push(`setup score ${setupScore} (strong)`);
    else if (setupScore >= 55) reasons.push(`setup score ${setupScore} (moderate)`);
    else if (setupScore >= 40) reasons.push(`setup score ${setupScore} (weak)`);
  }

  const probContribution = scoreProbability(probAbove, probTouch);
  if (Number.isFinite(probAbove)) {
    reasons.push(`probAbove ${(probAbove * 100).toFixed(0)}%`);
  }

  const spreadBonus = scoreSpread(spreadQuality);
  if (spreadBonus > 0) reasons.push(`spread quality ${spreadQuality}`);

  const regimeBonus = scoreRegimeAlignment(regimeAlign);
  if (regimeBonus > 0) reasons.push(`regime alignment ${regimeAlign}`);

  // chart adjustments are a soft tilt only — clamp narrow band
  let chartTilt = 0;
  if (Number.isFinite(chartAdj) && chartAdj !== 0) {
    chartTilt = clamp(chartAdj, -5, 5);
    if (chartTilt !== 0) reasons.push(`chart context ${chartTilt > 0 ? "+" : ""}${chartTilt}`);
  }

  const normalizedScore = clamp(setupContribution + spreadBonus + regimeBonus + chartTilt, 0, 30);

  const riskPenalty = penaltyRisk(probTouch, drawdown);
  if (riskPenalty < 0) {
    if (Number.isFinite(probTouch) && probTouch > 0.45) reasons.push(`touch ${(probTouch * 100).toFixed(0)}%`);
    if (Number.isFinite(drawdown) && drawdown > 0.08) reasons.push(`avg DD ${(drawdown * 100).toFixed(1)}%`);
  }

  const freshnessPenalty = penaltyFreshness(freshness);
  if (freshnessPenalty < 0 && freshness.reason) {
    reasons.push(`freshness: ${freshness.reason}`);
  }

  const hasExistingSignal = setupScore != null || probAbove != null || ivPct != null
    || spreadQuality != null || regimeAlign != null;

  // Quality label + usability
  let signalQuality = "none";
  if (!hasExistingSignal) {
    signalQuality = "none";
  } else if (freshness.stale) {
    signalQuality = "stale";
  } else if (setupScore != null && setupScore >= 75 && Number.isFinite(probAbove) && probAbove >= 0.65) {
    signalQuality = "strong";
  } else if ((setupScore != null && setupScore >= 55) || (Number.isFinite(probAbove) && probAbove >= 0.55)) {
    signalQuality = "moderate";
  } else {
    signalQuality = "weak";
  }

  const usableForDiscovery = hasExistingSignal && signalQuality !== "stale";

  return {
    hasExistingSignal,
    normalizedScore,
    probabilityScore: probContribution,
    riskPenalty,
    freshnessPenalty,
    signalQuality,
    usableForDiscovery,
    reasons,
  };
}

/**
 * Convenience: adapt a map of existing setup outputs keyed by symbol.
 * Does not mutate sources.
 *
 * @param {Record<string, object>} bySymbol
 * @returns {Record<string, AdapterOutput>}
 */
export function adaptAll(bySymbol) {
  const out = {};
  if (!bySymbol || typeof bySymbol !== "object") return out;
  for (const [sym, src] of Object.entries(bySymbol)) {
    out[String(sym).toUpperCase()] = adaptExistingSignal(src);
  }
  return out;
}

export const SCORE_ADAPTER_FRESHNESS_LIMITS = SOURCE_FRESHNESS_LIMITS;
