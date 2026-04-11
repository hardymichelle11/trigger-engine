// =====================================================
// SECTION 1: MARKET REGIME ENGINE (GO / NO-GO)
// SECTION 7: TRADING WINDOW CHECK
// =====================================================

import { CONFIG, round2 } from "./config.js";

export function evaluateMarketRegime({ hyg, kre, lqd, vix, vixPrev, atrExpansionMultiple }) {
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
  };
}

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
