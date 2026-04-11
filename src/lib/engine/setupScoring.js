// =====================================================
// SECTION 3: SETUP SCORING + TIMING + SENTIMENT + ACTION
// =====================================================

import { CONFIG, pctChange, clamp, safeNumber } from "./config.js";
import { getWatchlistEntry, isInScanUniverse } from "../../optionsWatchlist.js";

// --------------------------------------------------
// TIMING / DISTANCE CLASSIFICATION
// --------------------------------------------------

export function classifyTiming(distT1Pct) {
  const d = safeNumber(distT1Pct);

  if (d >= CONFIG.timingBands.earlyMin && d <= CONFIG.timingBands.earlyMax)
    return { stage: "EARLY", tradable: true, severity: "good" };

  if (d >= CONFIG.timingBands.midMin && d < CONFIG.timingBands.midMax)
    return { stage: "MID", tradable: true, severity: "okay" };

  if (d <= CONFIG.timingBands.lateMax && d > CONFIG.timingBands.exhaustedMax)
    return { stage: "LATE", tradable: false, severity: "caution" };

  if (d <= CONFIG.timingBands.exhaustedMax)
    return { stage: "EXHAUSTED", tradable: false, severity: "danger" };

  if (d > CONFIG.timingBands.earlyMax)
    return { stage: "PRE_BREAKOUT", tradable: true, severity: "good" };

  return { stage: "UNKNOWN", tradable: false, severity: "neutral" };
}

// --------------------------------------------------
// SETUP SCORE ENGINE
// --------------------------------------------------

export function scoreSetup(setup, market) {
  const timing = classifyTiming(setup.distT1Pct);
  let score = 0;

  const leaderTurningUp = setup.leaderMovePct > 0;
  const powerConfirm = setup.powerMovePct > 0;
  const followerLagging = setup.followerMovePct < setup.leaderMovePct;
  const bigMove = Math.abs(pctChange(setup.price, setup.prevClose)) >= CONFIG.setup.moveThresholdPct;
  const ivRich = setup.ivPercentile >= 60;
  const atrExpanded = setup.atrExpansionMultiple >= CONFIG.setup.atrExpansionMin;

  // IV data quality: real source data is worth more than ATR estimates
  const ivConfident = setup.ivConfidence === "high" || setup.ivConfidence === "medium";
  const ivFromRealSource = setup.ivSource && setup.ivSource !== "atr_estimate" && setup.ivSource !== "unknown";

  const wl = getWatchlistEntry(setup.symbol);
  const inUniverse = isInScanUniverse(setup.symbol);
  const spreadA = wl && (wl.spreadQuality === "A+" || wl.spreadQuality === "A");
  const wheelHigh = wl && wl.wheelSuit === "High";
  const wheelLow = wl && wl.wheelSuit === "Low";
  const tier1 = wl && wl.tier === 1;

  // Score trace: records each contribution for explainability
  const scoreTrace = [];
  function add(pts, reason) { if (pts !== 0) { score += pts; scoreTrace.push({ pts, reason }); } }

  // Market regime
  if (market.mode === "HIGH_PREMIUM_ENVIRONMENT") add(CONFIG.weights.marketRegime, `Regime: ${market.mode}`);
  else if (market.mode === "RISK_ON" || market.mode === "VOLATILE_BUT_CONTAINED") add(CONFIG.weights.marketRegime, `Regime: ${market.mode}`);
  else if (market.mode === "CREDIT_STRESS_HIGH_PREMIUM") add(10, "Regime: credit stress high premium");

  // Setup signals
  if (leaderTurningUp) add(CONFIG.weights.leader, "Leader turning up");
  if (powerConfirm) add(CONFIG.weights.power, "Power confirmed");
  if (followerLagging) add(CONFIG.weights.followerLag, "Follower lagging");

  // IV contribution: full weight for real data, reduced for estimates
  if (ivRich) {
    const ivPts = ivConfident ? CONFIG.weights.ivRich : Math.round(CONFIG.weights.ivRich * 0.6);
    add(ivPts, `IV rich (${setup.ivPercentile}%ile, ${setup.ivSource || "estimate"}, ${ivConfident ? "confident" : "low conf"})`);
  }

  if (atrExpanded) add(CONFIG.weights.atrExpansion, `ATR expanded (${setup.atrExpansionMultiple}x)`);
  if (setup.nearSupport) add(CONFIG.weights.supportLocation, "Near support");

  // Timing
  if (timing.stage === "EARLY") add(15, "Timing: EARLY");
  if (timing.stage === "MID") add(5, "Timing: MID");
  if (timing.stage === "LATE") add(-15, "Timing: LATE");
  if (timing.stage === "EXHAUSTED") add(-25, "Timing: EXHAUSTED");

  // Combo bonus
  if (bigMove && ivRich) add(5, "Big move + IV rich combo");

  // Watchlist quality
  if (spreadA) add(3, "Spread quality A+/A");
  if (tier1) add(2, "Tier 1 liquidity");
  if (wheelLow) add(-5, "Trap name penalty (Low wheel)");

  score = clamp(score, 0, 100);

  let signal = "NO_TRADE";
  if (score >= CONFIG.score.go) signal = "GO";
  else if (score >= CONFIG.score.watch) signal = "WATCH";

  return {
    score, signal, timing, scoreTrace,
    watchlist: {
      inUniverse,
      spreadQuality: wl?.spreadQuality || "—",
      wheelSuit: wl?.wheelSuit || "—",
      tier: wl?.tier || null,
      histRank: wl?.histRank || null,
    },
    diagnostics: {
      leaderTurningUp, powerConfirm, followerLagging, bigMove,
      ivRich, ivConfident: !!ivConfident, ivFromRealSource: !!ivFromRealSource,
      atrExpanded,
      nearSupport: !!setup.nearSupport,
      spreadA: !!spreadA,
      wheelHigh: !!wheelHigh,
    },
  };
}

// --------------------------------------------------
// SECTION 9: SENTIMENT INTERPRETATION
// --------------------------------------------------

export function interpretSentiment({ putCallRatio, ivPercentile, creditStress }) {
  const putsElevated = putCallRatio > 1.0;
  const ivHigh = ivPercentile >= 60;

  if (putsElevated && ivHigh) {
    return {
      interpretation: "Institutions buying protection — fear is high, premium is overpriced",
      action: "SELL_PUTS",
      note: "You sell fear, not follow it",
    };
  }

  if (putsElevated && creditStress) {
    return {
      interpretation: "Credit stress + elevated puts — genuine risk, move strikes lower",
      action: "SELL_PUTS_CONSERVATIVE",
      note: "Lower strikes for safety margin",
    };
  }

  return {
    interpretation: "Neutral sentiment — no clear edge from put/call skew",
    action: "WAIT",
    note: "Look for better setup",
  };
}

// --------------------------------------------------
// ACTION ENGINE
// --------------------------------------------------

export function chooseAction(setup, scored, market) {
  const { timing, signal, watchlist } = scored;
  const category = setup.category || "HIGH_IV";
  const wl = watchlist || {};

  if (market.creditStress && market.flags.hygWeak && market.flags.kreWeak) {
    return { action: "STOP_NEW_TRADES", reason: "HYG + KRE both collapsing — capital preservation mode" };
  }

  const trapWarning = wl.wheelSuit === "Low" ? " (TRAP NAME — pure premium play, not assignment candidate)" : "";

  if (category === "HIGH_IV") {
    if (signal === "GO" && timing.tradable && setup.nearSupport) {
      return { action: "SELL_PUTS", reason: `GO signal near support — sell puts${trapWarning}` };
    }
    if (signal === "GO" && timing.tradable && !setup.nearSupport) {
      return { action: "SELL_PUTS", reason: `GO signal, consider wider strikes (not at support)${trapWarning}` };
    }
    if (signal === "GO" && !timing.tradable) {
      return { action: "MANAGE_ONLY", reason: "Score is GO but timing is late — manage existing" };
    }
    if (signal === "WATCH") {
      return { action: "WAIT", reason: "Watching — not enough confirmation yet" };
    }
    return { action: "NO_TRADE", reason: "Score below threshold" };
  }

  if (category === "CREDIT") {
    if (market.creditStress && market.fearSpike) {
      return { action: "WAIT_FOR_STABILIZATION", reason: "Credit stress + fear spike — wait" };
    }
    if (signal === "GO" && setup.nearSupport) {
      return { action: "SELL_PUTS", reason: "Credit name at support — sell puts" };
    }
    if (signal === "WATCH") {
      return { action: "WATCH", reason: "Credit signal — monitoring for entry" };
    }
    return { action: "NO_TRADE", reason: "No edge in credit name" };
  }

  if (category === "ETF") {
    if (signal === "GO" && timing.stage === "EARLY") {
      return { action: "BUY_SHARES", reason: "ETF early stage — buy shares" };
    }
    if (signal === "WATCH") {
      return { action: "WAIT", reason: "ETF watching" };
    }
    return { action: "NO_TRADE", reason: "No ETF edge" };
  }

  return {
    action: signal === "GO" ? "SELL_PUTS" : "WAIT",
    reason: signal === "GO" ? "Default: sell puts" : "Default: wait",
  };
}
