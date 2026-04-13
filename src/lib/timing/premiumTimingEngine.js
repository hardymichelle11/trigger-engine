// =====================================================
// PREMIUM TIMING ENGINE — adaptive entry timing
// =====================================================
// Main orchestrator. Evaluates whether NOW is the right
// time to sell premium for a given setup.
//
// 2PM is a soft prior, not a rule.
// Historical evidence beats assumptions.
// Symbol-aware, setup-aware, regime-aware.
// =====================================================

import { bucketDTE, bucketMoneyness, classifySetupType, getClockContext } from "./timingConfig.js";
import { findHistoricalBucket, getBestWindowBySymbol, getBestWindowBySetupType, getBestWindowByRegime } from "./premiumProfiles.js";
import {
  normalizeCurrentQuote,
  scorePremiumRichness, scoreSpreadQuality, scoreIVContext,
  scoreWindowAlignment, scoreSoft2pmBias,
  calculatePremiumPercentile, computeTimingScore,
  classifyTimingState, classifySuggestedAction,
  estimateTimingConfidence, buildTimingRationale,
} from "./timingScorer.js";

// --------------------------------------------------
// MAIN ENTRY POINT
// --------------------------------------------------

/**
 * Evaluate premium timing for a setup + option quote.
 *
 * @param {object} setup — scanner card or setup object
 *   { symbol, price, category, ivPercentile, atrExpansionMultiple, regime }
 * @param {object} optionQuote — option pricing data
 *   { bid, ask, midpoint, strike, iv, delta, theta, dte, optionType }
 * @param {object} [clockOverride] — override clock context for testing
 * @returns {object} timing evaluation result
 */
export function evaluatePremiumTiming(setup, optionQuote, clockOverride) {
  const clockContext = clockOverride || getClockContext();
  const setupType = setup.setupType || classifySetupType(setup.category);
  const regime = setup.regime || "RISK_ON";
  const optionType = optionQuote.optionType || "put";

  // Step 1: Normalize current quote
  const current = normalizeCurrentQuote(setup, optionQuote, clockContext);

  // Step 2: Find historical comparison bucket
  const historicalBucket = findHistoricalBucket({
    symbol: setup.symbol,
    setupType,
    regime,
    dteBucket: bucketDTE(optionQuote.dte || 7),
    moneynessBucket: bucketMoneyness(setup.price, optionQuote.strike, optionType),
    minuteOfDay: clockContext.minuteOfDay,
    dayOfWeek: clockContext.dayOfWeek,
  });

  // Step 3: Get best historical windows
  const symbolBestWindow = getBestWindowBySymbol(setup.symbol);
  const setupBestWindow = getBestWindowBySetupType(setupType);
  const regimeBestWindow = getBestWindowByRegime(regime);

  // Step 4: Compute component scores
  const components = {
    premiumRichness: scorePremiumRichness(current.midpoint, historicalBucket),
    spreadQuality: scoreSpreadQuality(current.spreadPct, historicalBucket),
    ivContext: scoreIVContext(current.iv || setup.ivPercentile || 50, historicalBucket),
    symbolWindowAlignment: scoreWindowAlignment(clockContext.minuteOfDay, symbolBestWindow),
    setupWindowAlignment: scoreWindowAlignment(clockContext.minuteOfDay, setupBestWindow),
    regimeWindowAlignment: scoreWindowAlignment(clockContext.minuteOfDay, regimeBestWindow),
    soft2pmBias: scoreSoft2pmBias(clockContext.minuteOfDay),
  };

  // Step 5: Compute combined timing score
  const timingScore = computeTimingScore(components);

  // Step 6: Calculate premium percentile
  const premiumPercentile = calculatePremiumPercentile(current.midpoint, historicalBucket);

  // Step 7: Classify timing state and action
  const timingState = classifyTimingState(timingScore, premiumPercentile);
  const suggestedAction = classifySuggestedAction(timingState, premiumPercentile, setupType);

  // Step 8: Confidence and rationale
  const confidence = estimateTimingConfidence(historicalBucket);
  const rationale = buildTimingRationale({
    timingScore, timingState, premiumPercentile,
    currentMid: current.midpoint, historicalBucket,
    symbolBestWindow, clockContext,
  });

  return {
    // Primary outputs
    timingState,
    timingScore,
    suggestedAction,
    confidence,
    rationale,

    // Premium context
    premiumContext: {
      currentVsHistoricalPercentile: premiumPercentile,
      currentSpreadVsNormal: historicalBucket.avgSpreadPct > 0
        ? Math.round((current.spreadPct / historicalBucket.avgSpreadPct) * 100) / 100
        : null,
      currentIvVsNormal: historicalBucket.avgIv > 0
        ? Math.round(((current.iv || setup.ivPercentile || 50) / historicalBucket.avgIv) * 100) / 100
        : null,
      symbolBestWindow,
      setupBestWindow,
      regimeBestWindow,
    },

    // Component breakdown (for diagnostics)
    components,

    // Metadata
    clockContext: {
      timeET: clockContext.timeET,
      minuteOfDay: clockContext.minuteOfDay,
      marketOpen: clockContext.marketOpen,
    },
    historicalObservations: historicalBucket.observations,
    historicalSource: historicalBucket.source,
  };
}

/**
 * Quick timing evaluation for a scanner card (no real option quote).
 * Uses estimated premium from card metrics.
 *
 * @param {object} card — scanner card from buildUiCard
 * @param {object} [clockOverride]
 * @returns {object} timing evaluation
 */
export function evaluateCardTiming(card, clockOverride) {
  // Synthesize option quote from card data
  const optionQuote = {
    bid: card.ladder?.primary ? card.price * 0.02 : 0,
    ask: card.ladder?.primary ? card.price * 0.025 : 0,
    midpoint: card.ladder?.primary ? card.price * 0.0225 : 0,
    strike: card.ladder?.primary || card.price * 0.95,
    iv: card.metrics?.ivPercentile || 50,
    dte: 7,
    optionType: "put",
  };

  return evaluatePremiumTiming(card, optionQuote, clockOverride);
}
