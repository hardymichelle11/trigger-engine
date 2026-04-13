// =====================================================
// TIMING SCORER — component scores + classification
// =====================================================
// Computes individual component scores and combines
// them into the final timing_score. Classifies into
// timing states and suggested actions.
// =====================================================

import {
  TIMING_WEIGHTS, TIMING_THRESHOLDS, TIMING_STATES, TIMING_ACTIONS,
  PREMIUM_PERCENTILE, SOFT_2PM_WINDOWS,
} from "./timingConfig.js";

// --------------------------------------------------
// CURRENT QUOTE NORMALIZATION
// --------------------------------------------------

/**
 * Normalize raw option quote into scoring-ready format.
 * @param {object} setup — { symbol, price, ... }
 * @param {object} optionQuote — { bid, ask, strike, iv, ... }
 * @param {object} clockContext — from getClockContext()
 * @returns {object}
 */
export function normalizeCurrentQuote(setup, optionQuote, clockContext) {
  const bid = optionQuote.bid || 0;
  const ask = optionQuote.ask || 0;
  const midpoint = optionQuote.midpoint || (bid + ask) / 2 || optionQuote.last || 0;
  const spreadWidth = ask - bid;
  const spreadPct = midpoint > 0.01 ? spreadWidth / midpoint : 1;
  const strike = optionQuote.strike || 0;
  const underlying = setup.price || 0;

  return {
    symbol: setup.symbol,
    midpoint,
    bid, ask,
    spreadWidth,
    spreadPct,
    premiumPctStrike: strike > 0 ? midpoint / strike : 0,
    premiumPctUnderlying: underlying > 0 ? midpoint / underlying : 0,
    iv: optionQuote.iv || 0,
    delta: optionQuote.delta || 0,
    theta: optionQuote.theta || 0,
    dte: optionQuote.dte || 7,
    strike,
    underlying,
    minuteOfDay: clockContext.minuteOfDay,
    dayOfWeek: clockContext.dayOfWeek,
  };
}

// --------------------------------------------------
// COMPONENT SCORERS (0-100 each)
// --------------------------------------------------

/**
 * Score premium richness vs historical bucket.
 */
export function scorePremiumRichness(currentMid, historicalBucket) {
  if (!historicalBucket || historicalBucket.observations === 0) {
    // No history — use midpoint as proxy (higher = richer)
    return currentMid > 0 ? Math.min(65, currentMid * 100) : 30;
  }

  if (currentMid >= historicalBucket.p90Mid && historicalBucket.p90Mid > 0) return 95;
  if (currentMid >= historicalBucket.p75Mid && historicalBucket.p75Mid > 0) return 80;
  if (currentMid > historicalBucket.medianMid && historicalBucket.medianMid > 0) return 65;
  if (currentMid >= historicalBucket.medianMid * 0.9) return 45;
  return 20;
}

/**
 * Score spread quality vs historical norms.
 */
export function scoreSpreadQuality(currentSpreadPct, historicalBucket) {
  const avgSpread = historicalBucket?.avgSpreadPct || 0.05;

  if (currentSpreadPct <= avgSpread) return 90;
  if (currentSpreadPct <= avgSpread * 1.3) return 70;
  if (currentSpreadPct <= avgSpread * 2.0) return 40;
  return 10;
}

/**
 * Score current IV relative to symbol norms.
 */
export function scoreIVContext(currentIv, historicalBucket) {
  const avgIv = historicalBucket?.avgIv || 30;
  if (avgIv <= 0) return 50;

  const ratio = currentIv / avgIv;
  if (ratio >= 1.3) return 90;    // IV much richer than normal
  if (ratio >= 1.1) return 75;
  if (ratio >= 0.9) return 55;
  if (ratio >= 0.7) return 35;
  return 15;                       // IV compressed
}

/**
 * Score alignment with a time window.
 * Returns 100 if inside window, decreasing as distance increases.
 */
export function scoreWindowAlignment(minuteOfDay, window) {
  if (!window) return 50;

  if (minuteOfDay >= window.start && minuteOfDay <= window.end) return 100;

  // Distance from window edges
  const distBefore = window.start - minuteOfDay;
  const distAfter = minuteOfDay - window.end;
  const dist = Math.min(
    distBefore > 0 ? distBefore : Infinity,
    distAfter > 0 ? distAfter : Infinity
  );

  if (dist <= 15) return 80;   // within 15 min
  if (dist <= 30) return 60;
  if (dist <= 60) return 40;
  return 20;
}

/**
 * Score soft 2PM bias. Low weight — suggestion only.
 */
export function scoreSoft2pmBias(minuteOfDay) {
  const w = SOFT_2PM_WINDOWS;
  if (minuteOfDay >= w.prime.start && minuteOfDay <= w.prime.end) return 100;
  if (minuteOfDay >= w.prebias.start && minuteOfDay < w.prime.start) return 70;
  return 50;
}

// --------------------------------------------------
// PREMIUM PERCENTILE
// --------------------------------------------------

/**
 * Calculate what percentile the current midpoint falls at
 * relative to historical distribution.
 * @returns {number} 0-100 percentile
 */
export function calculatePremiumPercentile(currentMid, historicalBucket) {
  if (!historicalBucket || historicalBucket.observations === 0 || historicalBucket.p90Mid <= 0) return 50;

  if (currentMid >= historicalBucket.p90Mid) return 95;
  if (currentMid >= historicalBucket.p75Mid) return 82;
  if (currentMid >= historicalBucket.medianMid) return 60;
  if (currentMid >= historicalBucket.avgMid * 0.7) return 35;
  return 15;
}

// --------------------------------------------------
// COMBINED TIMING SCORE
// --------------------------------------------------

/**
 * Compute the weighted timing score from all components.
 * @param {object} components — individual scores
 * @returns {number} 0-100
 */
export function computeTimingScore(components) {
  const w = TIMING_WEIGHTS;
  const score =
    (components.premiumRichness || 0) * w.premiumRichness +
    (components.spreadQuality || 0) * w.spreadQuality +
    (components.ivContext || 0) * w.ivContext +
    (components.symbolWindowAlignment || 0) * w.symbolWindowAlignment +
    (components.setupWindowAlignment || 0) * w.setupWindowAlignment +
    (components.regimeWindowAlignment || 0) * w.regimeWindowAlignment +
    (components.soft2pmBias || 0) * w.soft2pmBias;

  return Math.round(Math.max(0, Math.min(100, score)));
}

// --------------------------------------------------
// TIMING STATE CLASSIFICATION
// --------------------------------------------------

/**
 * Classify timing state from score + premium context.
 */
export function classifyTimingState(timingScore, premiumPercentile) {
  const T = TIMING_THRESHOLDS;

  if (timingScore >= T.peakWindow && premiumPercentile >= 75) return TIMING_STATES.PEAK_WINDOW;
  if (timingScore >= T.favorable) return TIMING_STATES.FAVORABLE;
  if (timingScore >= T.early) return TIMING_STATES.EARLY;
  if (timingScore >= T.late) return TIMING_STATES.LATE;
  return TIMING_STATES.AVOID;
}

/**
 * Classify suggested action from state + context.
 */
export function classifySuggestedAction(timingState, premiumPercentile, setupType) {
  switch (timingState) {
    case TIMING_STATES.PEAK_WINDOW:
      return TIMING_ACTIONS.SELL_NOW;

    case TIMING_STATES.FAVORABLE:
      return premiumPercentile >= 70
        ? TIMING_ACTIONS.SELL_NOW
        : TIMING_ACTIONS.WATCH_FOR_2PM_WINDOW;

    case TIMING_STATES.EARLY:
      return TIMING_ACTIONS.WAIT_FOR_RICHER_PREMIUM;

    case TIMING_STATES.LATE:
      return setupType === "INCOME"
        ? TIMING_ACTIONS.AVOID_LOW_PREMIUM
        : TIMING_ACTIONS.WAIT_FOR_BETTER_STRUCTURE;

    case TIMING_STATES.AVOID:
    default:
      return TIMING_ACTIONS.AVOID_LOW_PREMIUM;
  }
}

// --------------------------------------------------
// CONFIDENCE ESTIMATION
// --------------------------------------------------

/**
 * Estimate confidence in the timing recommendation.
 */
export function estimateTimingConfidence(historicalBucket) {
  if (!historicalBucket) return "low";
  const n = historicalBucket.observations || 0;
  if (n >= 50) return "high";
  if (n >= 20) return "medium";
  if (n >= 5) return "low";
  return "seed";  // using seed data only
}

// --------------------------------------------------
// RATIONALE BUILDER
// --------------------------------------------------

/**
 * Build human-readable rationale for timing decision.
 */
export function buildTimingRationale(params) {
  const { timingScore, timingState, premiumPercentile, currentMid, historicalBucket, symbolBestWindow, clockContext } = params;
  const rationale = [];

  // Premium richness
  if (premiumPercentile >= 80) {
    rationale.push(`Premium is ${premiumPercentile}th percentile — richer than normal.`);
  } else if (premiumPercentile <= 40) {
    rationale.push(`Premium is only ${premiumPercentile}th percentile — below historical norms.`);
  } else {
    rationale.push(`Premium is ${premiumPercentile}th percentile — near normal range.`);
  }

  // Window alignment
  if (symbolBestWindow && clockContext) {
    const inWindow = clockContext.minuteOfDay >= symbolBestWindow.start && clockContext.minuteOfDay <= symbolBestWindow.end;
    if (inWindow) {
      rationale.push(`Current time aligns with historical premium peak (${symbolBestWindow.label}).`);
    } else if (clockContext.minuteOfDay < symbolBestWindow.start) {
      const minsUntil = symbolBestWindow.start - clockContext.minuteOfDay;
      rationale.push(`Historical premium peak starts in ~${minsUntil} min (${symbolBestWindow.label}).`);
    } else {
      rationale.push(`Historical premium peak was ${symbolBestWindow.label} — past window.`);
    }
  }

  // 2PM context
  if (clockContext) {
    const w = SOFT_2PM_WINDOWS;
    if (clockContext.minuteOfDay >= w.prime.start && clockContext.minuteOfDay <= w.prime.end) {
      rationale.push("Inside the 2:00-3:30 PM window (historically favorable for many symbols).");
    }
  }

  // Historical data quality
  if (historicalBucket?.source === "default") {
    rationale.push("No historical data yet — using default estimates.");
  } else if (historicalBucket?.source === "historical" && historicalBucket.observations < 20) {
    rationale.push(`Limited history (${historicalBucket.observations} observations).`);
  }

  return rationale;
}
