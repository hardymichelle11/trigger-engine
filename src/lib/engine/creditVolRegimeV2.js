// =====================================================
// CREDIT-VOL REGIME V2 — weighted composite model
// =====================================================
// Replaces binary credit regime with per-component stress
// scoring, rolling z-scores, slope, and weighted composite.
// Preserves all existing downstream regime labels.
//
// Inputs: price history arrays (oldest → newest, min 6 bars)
// Outputs: regime, bias, regimeScore, confidence, componentScores,
//          flags, explanation — same shape as V1 plus new fields.
// =====================================================

// --------------------------------------------------
// CONFIG
// --------------------------------------------------

export const REGIME_V2_CONFIG = {
  lookbackZ: 20,
  lookbackSlope: 5,

  weights: {
    HYG: 0.24,
    KRE: 0.22,
    XLF: 0.18,
    VIX: 0.24,
    QQQ: 0.07,
    TNX: 0.05,
  },

  vixBands: {
    calm: 18,
    watch: 21,
    panic: 25,
    crisis: 30,
  },

  earlyStress: {
    hygMin: 35,
    kreMin: 35,
  },

  compositeBands: {
    riskOn: 20,
    lowEdge: 35,
    volatileButContained: 50,
    creditStressWatch: 65,
    creditStressHighPremium: 80,
  },

  scoreCaps: {
    z: 2.5,
    slopePct: 0.03,
    pct1: 0.025,
    pct5: 0.06,
  },
};

// --------------------------------------------------
// UTILITY FUNCTIONS
// --------------------------------------------------

// --------------------------------------------------
// ENHANCEMENT 4: REGIME PERSISTENCE STATE
// Requires 2 consecutive defensive readings before flipping
// --------------------------------------------------

let _prevRegimeRaw = null;  // previous raw regime before persistence filter
let _confirmedRegime = null; // current confirmed regime

function applyRegimePersistence(rawMode) {
  const defensiveModes = ["CREDIT_STRESS_WATCH", "CREDIT_STRESS_HIGH_PREMIUM", "HIGH_PREMIUM_ENVIRONMENT"];
  const isDefensive = defensiveModes.includes(rawMode);
  const wasDefensive = _confirmedRegime ? defensiveModes.includes(_confirmedRegime) : false;

  // No prior state — accept first reading as-is
  if (_confirmedRegime === null) {
    _confirmedRegime = rawMode;
    _prevRegimeRaw = rawMode;
    return { mode: rawMode, pending: null, confirmed: true };
  }

  if (isDefensive && !wasDefensive) {
    // Trying to flip into defensive — require 2 consecutive bars
    if (_prevRegimeRaw === rawMode || defensiveModes.includes(_prevRegimeRaw)) {
      // Second consecutive defensive reading — confirm the flip
      _confirmedRegime = rawMode;
    } else {
      // First defensive reading — hold current regime, note pending
      _prevRegimeRaw = rawMode;
      return { mode: _confirmedRegime, pending: rawMode, confirmed: false };
    }
  } else {
    // Non-defensive or already defensive — apply immediately
    _confirmedRegime = rawMode;
  }

  _prevRegimeRaw = rawMode;
  return { mode: _confirmedRegime, pending: null, confirmed: true };
}

/** Reset persistence state (for testing). */
export function resetRegimePersistence() {
  _prevRegimeRaw = null;
  _confirmedRegime = null;
}

// --------------------------------------------------
// UTILITY FUNCTIONS
// --------------------------------------------------

function last(arr) { return arr[arr.length - 1]; }

function safeSliceTail(arr, n) { return arr.slice(Math.max(0, arr.length - n)); }

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(x => (x - m) ** 2)));
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function pctChange(current, prior) {
  if (prior === 0 || prior == null || current == null) return 0;
  return (current - prior) / prior;
}

function linearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += values[i]; sumXY += i * values[i]; sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

function slopeAsPctPerBar(values) {
  if (values.length < 2) return 0;
  const anchor = mean(values);
  return anchor === 0 ? 0 : linearSlope(values) / anchor;
}

function rollingZScore(arr, lookback) {
  const window = safeSliceTail(arr, lookback);
  if (window.length < 2) return 0;
  const m = mean(window);
  const sd = stdDev(window);
  return sd === 0 ? 0 : (last(window) - m) / sd;
}

function normalizeAbs(value, cap) { return clamp(Math.abs(value) / cap, 0, 1); }
function scaleTo100(x) { return Math.round(clamp(x, 0, 1) * 100); }
function r2(n) { return Math.round(n * 100) / 100; }

// --------------------------------------------------
// ENHANCEMENT 5: ROLLING PERCENTILE RANK
// --------------------------------------------------

/**
 * Compute percentile rank of current value within a rolling window.
 * 0 = lowest in window, 100 = highest in window.
 * @param {number[]} series — price history (oldest → newest)
 * @param {number} lookback — window size (default 20)
 * @returns {number} percentile 0-100
 */
function rollingPercentile(series, lookback = 20) {
  const window = safeSliceTail(series, lookback);
  if (window.length < 2) return 50;
  const current = last(window);
  const below = window.filter(v => v < current).length;
  return Math.round((below / (window.length - 1)) * 100);
}

// --------------------------------------------------
// ENHANCEMENT 3: EXPLICIT ACTION MAPPING
// --------------------------------------------------

const ACTION_MAP = {
  "RISK_ON": "SELL_PUTS_NORMAL",
  "LOW_EDGE": "SELL_PUTS_NORMAL",
  "VOLATILE_BUT_CONTAINED": "WAIT_OR_SMALL_FAR_OTM",
  "CREDIT_STRESS_WATCH": "WAIT_OR_SMALL_FAR_OTM",
  "CREDIT_STRESS_HIGH_PREMIUM": "SELL_PUTS_INTO_FEAR",
  "HIGH_PREMIUM_ENVIRONMENT": "DEFEND_NO_NEW_PUTS",
};

function getExplicitAction(mode) {
  return ACTION_MAP[mode] || "WAIT_OR_SMALL_FAR_OTM";
}

// --------------------------------------------------
// FEATURE EXTRACTION
// --------------------------------------------------

function extractFeatures(series, cfg) {
  const current = last(series);
  const prev1 = series.length >= 2 ? series[series.length - 2] : null;
  const prev5 = series.length >= 6 ? series[series.length - 6] : null;

  return {
    current,
    z20: rollingZScore(series, cfg.lookbackZ),
    slope5: slopeAsPctPerBar(safeSliceTail(series, cfg.lookbackSlope)),
    pct1: prev1 != null ? pctChange(current, prev1) : 0,
    pct5: prev5 != null ? pctChange(current, prev5) : 0,
    percentile: rollingPercentile(series, cfg.lookbackZ),  // Enhancement 5
  };
}

// --------------------------------------------------
// COMPONENT SCORING
// --------------------------------------------------

// HYG, KRE, XLF, QQQ: falling = stress
function scoreDownRisk(features, cfg) {
  const z = scaleTo100(normalizeAbs(Math.min(features.z20, 0), cfg.scoreCaps.z));
  const slope = scaleTo100(normalizeAbs(Math.min(features.slope5, 0), cfg.scoreCaps.slopePct));
  const p1 = scaleTo100(normalizeAbs(Math.min(features.pct1, 0), cfg.scoreCaps.pct1));
  const p5 = scaleTo100(normalizeAbs(Math.min(features.pct5, 0), cfg.scoreCaps.pct5));
  return Math.round(z * 0.40 + slope * 0.25 + p1 * 0.15 + p5 * 0.20);
}

// VIX, TNX: rising = stress
function scoreUpRisk(features, cfg) {
  const z = scaleTo100(normalizeAbs(Math.max(features.z20, 0), cfg.scoreCaps.z));
  const slope = scaleTo100(normalizeAbs(Math.max(features.slope5, 0), cfg.scoreCaps.slopePct));
  const p1 = scaleTo100(normalizeAbs(Math.max(features.pct1, 0), cfg.scoreCaps.pct1));
  const p5 = scaleTo100(normalizeAbs(Math.max(features.pct5, 0), cfg.scoreCaps.pct5));
  return Math.round(z * 0.40 + slope * 0.25 + p1 * 0.15 + p5 * 0.20);
}

// --------------------------------------------------
// COMPOSITE + CONFIDENCE + EARLY STRESS
// --------------------------------------------------

function computeComposite(scores, cfg) {
  return Math.round(
    (scores.HYG || 0) * cfg.weights.HYG +
    (scores.KRE || 0) * cfg.weights.KRE +
    (scores.XLF || 0) * cfg.weights.XLF +
    (scores.VIX || 0) * cfg.weights.VIX +
    (scores.QQQ || 0) * cfg.weights.QQQ +
    (scores.TNX || 0) * cfg.weights.TNX
  );
}

function getVixState(vixValue, cfg) {
  if (vixValue >= cfg.vixBands.crisis) return "crisis";
  if (vixValue >= cfg.vixBands.panic) return "panic";
  if (vixValue >= cfg.vixBands.watch) return "watch";
  return "calm";
}

function computeConfidence(scores) {
  const vals = Object.values(scores);
  const above35 = vals.filter(s => s >= 35).length;
  const above60 = vals.filter(s => s >= 60).length;
  const above75 = vals.filter(s => s >= 75).length;

  let label = "low", numeric = 30;
  if (above75 >= 2 || above60 >= 3) { label = "high"; numeric = 80; }
  else if (above35 >= 3 || above60 >= 2) { label = "medium"; numeric = 60; }

  return { label, score: numeric, agreement: { above35, above60, above75 } };
}

function detectEarlyStress(scores, vixState, cfg) {
  return scores.HYG >= cfg.earlyStress.hygMin &&
         scores.KRE >= cfg.earlyStress.kreMin &&
         (vixState === "calm" || vixState === "watch");
}

// --------------------------------------------------
// REGIME MAPPING (preserves existing labels)
// --------------------------------------------------

function mapRegime(compositeScore, scores, vixState, earlyStress, cfg) {
  // Early stress guard: credit weakening before VIX confirms
  if (earlyStress && compositeScore < cfg.compositeBands.creditStressWatch) {
    return { mode: "CREDIT_STRESS_WATCH", bias: "WAIT_FOR_PANIC_OR_STABILIZATION" };
  }

  if (compositeScore < cfg.compositeBands.riskOn && vixState === "calm") {
    return { mode: "RISK_ON", bias: "NORMAL_OPERATIONS" };
  }
  if (compositeScore < cfg.compositeBands.lowEdge) {
    return { mode: "LOW_EDGE", bias: "REDUCE_ACTIVITY" };
  }
  if (compositeScore < cfg.compositeBands.volatileButContained) {
    return { mode: "VOLATILE_BUT_CONTAINED", bias: "SELECTIVE_PREMIUM_SELLING" };
  }
  if (compositeScore < cfg.compositeBands.creditStressWatch) {
    return { mode: "CREDIT_STRESS_WATCH", bias: "WAIT_FOR_PANIC_OR_STABILIZATION" };
  }
  if (compositeScore < cfg.compositeBands.creditStressHighPremium) {
    return { mode: "CREDIT_STRESS_HIGH_PREMIUM", bias: "SELL_PUTS_INTO_FEAR_ONLY" };
  }
  return { mode: "HIGH_PREMIUM_ENVIRONMENT", bias: "SELL_PREMIUM" };
}

// --------------------------------------------------
// EXPLANATION BUILDER
// --------------------------------------------------

function buildExplanation(features, scores, compositeScore, vixState, earlyStress, confidence) {
  const lines = [];
  for (const ticker of ["HYG", "KRE", "XLF", "VIX", "QQQ", "TNX"]) {
    const f = features[ticker];
    if (!f) continue;
    const dir = (ticker === "VIX" || ticker === "TNX")
      ? (f.pct1 > 0 ? "rising" : "stable")
      : (f.pct1 < 0 ? "falling" : "stable");
    lines.push(`${ticker}: stress=${scores[ticker]}, z=${r2(f.z20)}, slope=${r2(f.slope5 * 100)}%/bar, 1d=${r2(f.pct1 * 100)}%, ${dir}`);
  }
  lines.push(`Composite: ${compositeScore}/100, VIX: ${vixState}, conf: ${confidence.label}, earlyStress: ${earlyStress}`);
  return lines;
}

// --------------------------------------------------
// MAIN API
// --------------------------------------------------

/**
 * Build credit-vol regime from price history arrays.
 *
 * @param {object} history — { HYG: number[], KRE: number[], XLF: number[], VIX: number[], QQQ: number[], TNX: number[] }
 *   All arrays oldest → newest, minimum 6 bars (20+ recommended for z-scores).
 * @param {object} [userConfig] — override any REGIME_V2_CONFIG fields
 * @returns {object} regime result with backward-compatible fields
 */
export function buildCreditVolRegime(history, userConfig = {}) {
  const cfg = { ...REGIME_V2_CONFIG, ...userConfig };

  // Validate minimum inputs
  const required = ["HYG", "KRE", "VIX"];
  for (const t of required) {
    if (!history[t] || history[t].length < 2) {
      // Fallback: return calm regime if data is insufficient
      return _fallbackResult(`Missing or insufficient data for ${t}`);
    }
  }

  // Extract features per ticker
  const features = {};
  const scores = {};

  for (const ticker of ["HYG", "KRE", "XLF", "QQQ"]) {
    if (history[ticker] && history[ticker].length >= 2) {
      features[ticker] = extractFeatures(history[ticker], cfg);
      scores[ticker] = scoreDownRisk(features[ticker], cfg);
    } else {
      features[ticker] = { current: 0, z20: 0, slope5: 0, pct1: 0, pct5: 0 };
      scores[ticker] = 0;
    }
  }

  for (const ticker of ["VIX", "TNX"]) {
    if (history[ticker] && history[ticker].length >= 2) {
      features[ticker] = extractFeatures(history[ticker], cfg);
      scores[ticker] = scoreUpRisk(features[ticker], cfg);
    } else {
      features[ticker] = { current: 0, z20: 0, slope5: 0, pct1: 0, pct5: 0 };
      scores[ticker] = 0;
    }
  }

  const compositeScore = computeComposite(scores, cfg);
  const vixState = getVixState(features.VIX.current, cfg);
  const earlyStress = detectEarlyStress(scores, vixState, cfg);
  const confidence = computeConfidence(scores);
  const { mode: rawMode, bias } = mapRegime(compositeScore, scores, vixState, earlyStress, cfg);

  // Enhancement 4: Regime persistence — require 2 consecutive bars before defensive flip
  const persistence = applyRegimePersistence(rawMode);
  const mode = persistence.mode;

  const explanation = buildExplanation(features, scores, compositeScore, vixState, earlyStress, confidence);

  // Enhancement 3: Explicit action label
  const sellPutsAction = getExplicitAction(mode);

  // Enhancement 2: Trade-window overlay
  // NOTE: getTradingWindow() is imported by macroRegime.js and attached there.
  // Here we just flag whether regime allows new trades.
  const allowNewTrades = !["HIGH_PREMIUM_ENVIRONMENT"].includes(mode);

  // Enhancement 5: Rolling percentiles for key tickers
  const percentiles = {
    vix: features.VIX.percentile,
    hyg: features.HYG.percentile,
    kre: features.KRE.percentile,
    xlf: features.XLF.percentile,
  };

  // Backward-compatible flags (V1 consumers expect these)
  const creditStress = scores.HYG >= 35 || scores.KRE >= 35;
  const volatilityActive = features.VIX.pct1 > 0 && scores.VIX >= 35;
  const fearBand = features.VIX.current >= cfg.vixBands.watch && features.VIX.current < cfg.vixBands.panic;
  const fearSpike = features.VIX.current >= cfg.vixBands.panic;

  return {
    // === Existing V1 fields (backward compat) ===
    mode,
    bias,
    score: compositeScore,
    creditStress,
    volatilityActive,
    fearBand,
    fearSpike,
    vixRising: features.VIX.pct1 > 0,
    flags: {
      hygWeak: scores.HYG >= 35,
      kreWeak: scores.KRE >= 35,
      xlfWeak: scores.XLF >= 35,
      qqqWeak: scores.QQQ >= 35,
      atrExpanded: false,
      vixElevated: features.VIX.current >= cfg.vixBands.watch,
      vixPanic: features.VIX.current >= cfg.vixBands.panic,
      ratesStress: scores.TNX >= 35,
      earlyStress,
    },
    indicators: {
      hyg: features.HYG.current,
      kre: features.KRE.current,
      xlf: features.XLF.current,
      vix: features.VIX.current,
      qqq: features.QQQ.current,
      tnx: features.TNX.current,
      vixPrev: null,
      lqd: null,
    },

    // === New V2 fields ===
    regimeScore: compositeScore,
    confidence,
    vixState,
    componentScores: { ...scores },
    features,
    explanation,
    engineVersion: 2,

    // === Enhancement outputs ===
    sellPutsAction,         // Enhancement 3: SELL_PUTS_NORMAL / WAIT_OR_SMALL_FAR_OTM / SELL_PUTS_INTO_FEAR / DEFEND_NO_NEW_PUTS
    allowNewTrades,         // Enhancement 2: false when regime = DEFEND mode
    percentiles,            // Enhancement 5: rolling percentile rank for key tickers
    persistence: {          // Enhancement 4: regime flip confirmation
      rawRegime: rawMode,
      confirmedRegime: mode,
      pendingFlip: persistence.pending,
      confirmed: persistence.confirmed,
    },

    // Enhancement 1: Calibration snapshot — persist this for quarterly review
    // Hook: pass this to calibrationTracker.recordRegimeSnapshot()
    calibrationSnapshot: {
      timestamp: Date.now(),
      regimeScore: compositeScore,
      componentScores: { ...scores },
      regime: mode,
      rawRegime: rawMode,
      confidence: confidence.label,
      vixState,
      earlyStress,
      sellPutsAction,
      percentiles,
    },
  };
}

// --------------------------------------------------
// FALLBACK (insufficient data)
// --------------------------------------------------

function _fallbackResult(reason) {
  return {
    mode: "LOW_EDGE", bias: "REDUCE_ACTIVITY", score: 45,
    creditStress: false, volatilityActive: false,
    fearBand: false, fearSpike: false, vixRising: false,
    flags: { hygWeak: false, kreWeak: false, xlfWeak: false, qqqWeak: false, atrExpanded: false, vixElevated: false, vixPanic: false, ratesStress: false, earlyStress: false },
    indicators: { hyg: 0, kre: 0, xlf: 0, vix: 0, qqq: 0, tnx: 0, vixPrev: null, lqd: null },
    regimeScore: 45, confidence: { label: "low", score: 20, agreement: { above35: 0, above60: 0, above75: 0 } },
    vixState: "calm", componentScores: { HYG: 0, KRE: 0, XLF: 0, VIX: 0, QQQ: 0, TNX: 0 },
    features: {}, explanation: [`Fallback: ${reason}`], engineVersion: 2,
  };
}
