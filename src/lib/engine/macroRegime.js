// =====================================================
// SECTION 1: MARKET REGIME ENGINE (GO / NO-GO)
// SECTION 7: TRADING WINDOW CHECK
// =====================================================
// V2: Uses creditVolRegimeV2 when history series are available.
// Falls back to V1 binary logic when only snapshot data exists.
// =====================================================

import { CONFIG, round2 } from "./config.js";
import { buildCreditVolRegime } from "./creditVolRegimeV2.js";

// --------------------------------------------------
// V2 REGIME (weighted composite, needs history series)
// --------------------------------------------------

/**
 * Evaluate market regime using V2 composite model.
 * Call this when you have price history arrays.
 *
 * @param {object} history — { HYG: number[], KRE: number[], XLF: number[], VIX: number[], QQQ: number[], TNX: number[] }
 * @returns {object} regime result (backward compatible with V1 shape)
 */
export function evaluateMarketRegimeV2(history) {
  return buildCreditVolRegime(history);
}

// --------------------------------------------------
// V1 REGIME (binary thresholds, snapshot only — legacy fallback)
// --------------------------------------------------

/**
 * Legacy V1 regime evaluation from snapshot values.
 * Used by App.jsx trigger engine (VIX + IWM) and as fallback
 * when history series are not available.
 *
 * @param {object} inputs — { hyg, kre, lqd, vix, vixPrev, atrExpansionMultiple }
 * @returns {object} regime result
 */
export function evaluateMarketRegime(inputs) {
  // If inputs look like history arrays, route to V2
  if (inputs.HYG && Array.isArray(inputs.HYG)) {
    return evaluateMarketRegimeV2(inputs);
  }

  // V1 binary logic (for trigger engine + backward compat)
  const { hyg, kre, lqd, vix, vixPrev, atrExpansionMultiple } = inputs;

  const hygWeak = hyg < CONFIG.macro.hygBreak;
  const kreWeak = kre < CONFIG.macro.kreBreak;
  const creditStress = hygWeak || kreWeak;

  const vixRising = vix > (vixPrev || 0);
  const atrExpanded = (atrExpansionMultiple || 1) >= CONFIG.macro.atrExpansionHigh;
  const volatilityActive = vixRising && atrExpanded;

  const fearBand = vix >= CONFIG.macro.vixFearLow && vix <= CONFIG.macro.vixFearHigh;
  const fearSpike = vix > CONFIG.macro.vixFearHigh;

  let mode, bias, score;

  if (creditStress && volatilityActive) {
    mode = "HIGH_PREMIUM_ENVIRONMENT";
    bias = "SELL_PREMIUM";
    score = 80;
  } else if (creditStress && fearSpike) {
    mode = "CREDIT_STRESS_HIGH_PREMIUM";
    bias = "SELL_PUTS_INTO_FEAR_ONLY";
    score = 35;
  } else if (creditStress && fearBand) {
    mode = "CREDIT_STRESS_WATCH";
    bias = "WAIT_FOR_PANIC_OR_STABILIZATION";
    score = 40;
  } else if (!creditStress && volatilityActive) {
    mode = "VOLATILE_BUT_CONTAINED";
    bias = "SELECTIVE_PREMIUM_SELLING";
    score = 65;
  } else if (!creditStress && fearBand) {
    mode = "VOLATILE_BUT_CONTAINED";
    bias = "SELECTIVE_PREMIUM_SELLING";
    score = 60;
  } else if (!creditStress && vix < CONFIG.macro.vixFearLow) {
    mode = "RISK_ON";
    bias = "NORMAL_OPERATIONS";
    score = 75;
  } else {
    mode = "LOW_EDGE";
    bias = "REDUCE_ACTIVITY";
    score = 45;
  }

  return {
    mode, bias, score, creditStress, volatilityActive,
    fearBand, fearSpike, vixRising,
    flags: { hygWeak, kreWeak, atrExpanded },
    indicators: { hyg, kre, lqd, vix, vixPrev },
    engineVersion: 1,
  };
}

// --------------------------------------------------
// TRADING WINDOW CHECK
// --------------------------------------------------

export function getTradingWindow() {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hours = et.getHours() + et.getMinutes() / 60;
  const marketOpen = 9.5;

  const minutesSinceOpen = (hours - marketOpen) * 60;
  const inNoTradeZone = minutesSinceOpen >= 0 && minutesSinceOpen < CONFIG.timing.noTradeOpenMinutes;
  const inBestWindow = hours >= CONFIG.timing.bestWindowStart && hours <= CONFIG.timing.bestWindowEnd;
  const afterHours = hours > 16 || hours < marketOpen;

  let window = "OPEN";
  if (afterHours) window = "CLOSED";
  else if (inNoTradeZone) window = "NO_TRADE_OPEN";
  else if (inBestWindow) window = "BEST_WINDOW";

  return { window, inBestWindow, inNoTradeZone, afterHours, etHours: round2(hours) };
}
