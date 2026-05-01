// =====================================================
// ESTIMATED PREMIUM ENGINE
// =====================================================
// Determines whether an option (cash-secured put first)
// is worth a deeper look, even when full chain data is
// limited. Three estimation methods plus an explicit
// insufficient_data branch.
//
// Hard rules (per spec):
//   - chain_based when optionsChain available
//   - iv_estimated when no chain but IV exists
//   - atr_estimated when only ATR exists
//   - insufficient_data otherwise
//   - Never fabricates a value as "live"; method tag is
//     always honest about the source.
//   - No randomness. Outputs are deterministic given inputs.
// =====================================================

import { PREMIUM_SOURCE, safeNum, clamp, round2 } from "./types.js";

const SHORT_PUT_MULT = 100;
const DEFAULT_DTE_TARGETS = Object.freeze([7, 14, 21, 30, 45]);
const DEFAULT_OTM_PCT = 0.05;             // 5% OTM put as default target

const SCANNER_MODE_DEFAULTS = Object.freeze({
  conservative: {
    minConfidence: "medium",
    maxSpreadRisk: "medium",
    minLiquidityGrade: "B",
    minYieldOnCollateral: 0.0035,   // 0.35% per cycle
    preferredDteWindow: [14, 30],
  },
  neutral: {
    minConfidence: "low",
    maxSpreadRisk: "high",
    minLiquidityGrade: "C",
    minYieldOnCollateral: 0.0020,
    preferredDteWindow: [7, 30],
  },
  aggressive: {
    minConfidence: "low",
    maxSpreadRisk: "high",
    minLiquidityGrade: "D",
    minYieldOnCollateral: 0.0010,
    preferredDteWindow: [5, 45],
  },
});

const LIQ_RANK = { "A+": 5, "A": 4, "B+": 3, "B": 2, "C": 1, "D": 0, "unknown": 0 };
const SPREAD_RANK = { low: 0, medium: 1, high: 2, unknown: 3 };
const CONF_RANK = { high: 3, medium: 2, low: 1 };

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function pickModeCfg(scannerMode, override) {
  const base = SCANNER_MODE_DEFAULTS[scannerMode] || SCANNER_MODE_DEFAULTS.neutral;
  return { ...base, ...(override || {}) };
}

function gradeSpread(bid, ask) {
  const b = safeNum(bid);
  const a = safeNum(ask);
  if (b <= 0 || a <= 0 || a <= b) return { spreadPct: null, risk: "unknown" };
  const mid = (a + b) / 2;
  const pct = mid > 0 ? (a - b) / mid : Infinity;
  if (pct <= 0.02) return { spreadPct: pct, risk: "low" };
  if (pct <= 0.05) return { spreadPct: pct, risk: "medium" };
  return { spreadPct: pct, risk: "high" };
}

function gradeLiquidity(spreadRisk, openInterest, volume) {
  const oi = safeNum(openInterest);
  const v = safeNum(volume);
  if (spreadRisk === "low" && oi >= 1000) return "A+";
  if (spreadRisk === "low" && oi >= 200) return "A";
  if (spreadRisk === "medium" && oi >= 200) return "B+";
  if (spreadRisk === "medium" && oi >= 50) return "B";
  if (spreadRisk === "high" && oi >= 50) return "C";
  if (oi > 0 || v > 0) return "D";
  return "unknown";
}

/** Standard normal pdf φ(z) */
function phi(z) {
  return Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI);
}

/**
 * Rough OTM put premium estimate using Bachelier-style scaling:
 *   premium ≈ expectedMove · φ(z)   where  z = (S − K) / expectedMove
 *
 * Underestimates deep ITM but is a reasonable first cut for OTM/ATM
 * which is what we sell. Used only by iv_estimated / atr_estimated.
 *
 * @param {number} expectedMove
 * @param {number} otmDistance        (S − K), positive for OTM puts
 * @returns {number} premium per share
 */
function approxOtmPutPerShare(expectedMove, otmDistance) {
  if (!Number.isFinite(expectedMove) || expectedMove <= 0) return 0;
  const z = otmDistance / expectedMove;
  // Scale by expectedMove × φ(z); ensure non-negative
  const raw = expectedMove * phi(z);
  return Math.max(0, raw);
}

function pickPreferredDte(targets, mode) {
  const cfg = pickModeCfg(mode);
  const window = cfg.preferredDteWindow;
  const ts = (Array.isArray(targets) && targets.length > 0 ? targets : DEFAULT_DTE_TARGETS).slice().sort((a, b) => a - b);
  // pick smallest DTE inside the window, else closest to lower bound
  const inside = ts.find(d => d >= window[0] && d <= window[1]);
  if (Number.isFinite(inside)) return inside;
  // fallback: closest to lower bound
  let best = ts[0];
  let bestGap = Math.abs(ts[0] - window[0]);
  for (const d of ts) {
    const g = Math.abs(d - window[0]);
    if (g < bestGap) { best = d; bestGap = g; }
  }
  return best;
}

// --------------------------------------------------
// CHAIN-BASED METHOD
// --------------------------------------------------

function estimateFromChain(input) {
  const { symbol, price, optionsChain, dteTargets, scannerMode } = input;
  const cfg = pickModeCfg(scannerMode);
  const reasons = [];

  // Filter to puts within preferred DTE window AND near 5% OTM (within 2.5–10%)
  const targetWindow = cfg.preferredDteWindow;
  const filtered = (optionsChain || []).filter(c => {
    if (!c || c.type !== "put") return false;
    const k = safeNum(c.strike);
    const d = safeNum(c.dte);
    if (k <= 0 || d <= 0) return false;
    if (price > 0 && (k > price || (price - k) / price > 0.20)) return false;
    return d >= targetWindow[0] - 2 && d <= targetWindow[1] + 5;
  });

  if (filtered.length === 0) {
    reasons.push("no chain rows match DTE window or OTM band");
    return null;
  }

  // Score each: prefer ~5% OTM with good liquidity and DTE inside the window
  const scored = filtered.map(c => {
    const strike = Number(c.strike);
    const dte = Number(c.dte);
    const otmPct = price > 0 ? (price - strike) / price : 0;
    const otmGap = Math.abs(otmPct - DEFAULT_OTM_PCT);
    const dteInside = dte >= targetWindow[0] && dte <= targetWindow[1];
    const { spreadPct, risk } = gradeSpread(c.bid, c.ask);
    const liqGrade = gradeLiquidity(risk, c.openInterest, c.volume);
    const liqRank = LIQ_RANK[liqGrade] ?? 0;

    // Lower score = better
    const score = otmGap * 100              // distance from 5% OTM (in pct units)
      + (dteInside ? 0 : 5)                  // penalty for outside DTE window
      + (4 - Math.min(4, liqRank)) * 1.2;    // liquidity penalty
    return { contract: c, otmPct, otmGap, spreadPct, risk, liqGrade, score, dte, strike };
  }).sort((a, b) => a.score - b.score);

  const best = scored[0];
  const c = best.contract;
  const bid = safeNum(c.bid);
  const ask = safeNum(c.ask);
  const mid = (bid > 0 && ask > 0) ? (bid + ask) / 2 : (bid > 0 ? bid : ask);
  if (!(mid > 0)) {
    reasons.push("chain row missing usable bid/ask");
    return null;
  }

  const collateralRequired = round2(best.strike * SHORT_PUT_MULT);
  const estimatedPremium = round2(mid * SHORT_PUT_MULT);
  const yieldOnCollateral = collateralRequired > 0 ? estimatedPremium / collateralRequired : 0;

  let confidence = "medium";
  if (best.liqGrade === "A+" || best.liqGrade === "A") confidence = "high";
  else if (best.liqGrade === "C" || best.liqGrade === "D") confidence = "low";

  reasons.push(`chain: ${best.liqGrade} liquidity, spread ${best.risk}`);
  if (yieldOnCollateral < cfg.minYieldOnCollateral) {
    reasons.push(`yield ${(yieldOnCollateral * 100).toFixed(2)}% below mode floor`);
  }

  return {
    symbol,
    method: "chain_based",
    estimatedPremium,
    estimatedYieldOnCollateral: round2(yieldOnCollateral * 10000) / 10000,
    preferredDte: best.dte,
    preferredStrike: round2(best.strike),
    collateralRequired,
    liquidityGrade: best.liqGrade,
    spreadRisk: best.risk,
    confidence,
    reasons,
    premiumSource: PREMIUM_SOURCE.LIVE,
  };
}

// --------------------------------------------------
// IV-ESTIMATED METHOD (no chain, but IV available)
// --------------------------------------------------

function estimateFromIv(input) {
  const { symbol, price, iv, ivPercentile, dteTargets, scannerMode } = input;
  const cfg = pickModeCfg(scannerMode);
  const reasons = [];

  if (!(price > 0)) {
    reasons.push("missing price");
    return null;
  }
  // Either an IV percent (e.g. 35) or an IV percentile in 0..100
  let sigma = null;
  if (Number.isFinite(Number(iv)) && Number(iv) > 0) {
    sigma = Number(iv) / 100;
    reasons.push(`IV ${iv}%`);
  } else if (Number.isFinite(Number(ivPercentile)) && Number(ivPercentile) > 0) {
    // Map IV percentile 0..100 to roughly 15%..100% annualized — same heuristic as
    // existing probability layer.
    const pct = clamp(Number(ivPercentile), 0, 100);
    sigma = 0.15 + (pct / 100) * 0.85;
    reasons.push(`ivPercentile ${pct} → est σ=${sigma.toFixed(2)}`);
  } else {
    reasons.push("no usable IV");
    return null;
  }

  const dte = pickPreferredDte(dteTargets, scannerMode);
  const t = Math.max(1, dte) / 365;
  const expectedMove = price * sigma * Math.sqrt(t);
  const preferredStrike = round2(price * (1 - DEFAULT_OTM_PCT));
  const otmDistance = price - preferredStrike;
  const perShare = approxOtmPutPerShare(expectedMove, otmDistance);
  const estimatedPremium = round2(perShare * SHORT_PUT_MULT);
  const collateralRequired = round2(preferredStrike * SHORT_PUT_MULT);
  const yieldOnCollateral = collateralRequired > 0 ? estimatedPremium / collateralRequired : 0;

  let confidence = "medium";
  if (cfg.preferredDteWindow[0] <= dte && dte <= cfg.preferredDteWindow[1]) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  reasons.push(`expected move ${round2(expectedMove)} over ${dte}d`);
  if (yieldOnCollateral < cfg.minYieldOnCollateral) {
    reasons.push(`est yield ${(yieldOnCollateral * 100).toFixed(2)}% below mode floor`);
  }

  return {
    symbol,
    method: "iv_estimated",
    estimatedPremium,
    estimatedYieldOnCollateral: round2(yieldOnCollateral * 10000) / 10000,
    preferredDte: dte,
    preferredStrike,
    collateralRequired,
    liquidityGrade: "unknown",
    spreadRisk: "unknown",
    confidence,
    reasons,
    premiumSource: PREMIUM_SOURCE.ESTIMATED,
  };
}

// --------------------------------------------------
// ATR-ESTIMATED METHOD (no chain, no IV — ATR only)
// --------------------------------------------------

function estimateFromAtr(input) {
  const { symbol, price, atr, dteTargets, scannerMode } = input;
  const cfg = pickModeCfg(scannerMode);
  const reasons = [];

  if (!(price > 0)) { reasons.push("missing price"); return null; }
  const a = safeNum(atr);
  if (a <= 0) { reasons.push("missing ATR"); return null; }

  const dte = pickPreferredDte(dteTargets, scannerMode);
  // Daily ATR scaled by sqrt(dte) and dampened — ATR underestimates true range
  // when used as IV proxy, so we *don't* multiply by 1.0.
  const expectedMove = a * Math.sqrt(Math.max(1, dte)) * 0.7;
  const preferredStrike = round2(price * (1 - DEFAULT_OTM_PCT));
  const otmDistance = price - preferredStrike;
  const perShare = approxOtmPutPerShare(expectedMove, otmDistance);
  const estimatedPremium = round2(perShare * SHORT_PUT_MULT);
  const collateralRequired = round2(preferredStrike * SHORT_PUT_MULT);
  const yieldOnCollateral = collateralRequired > 0 ? estimatedPremium / collateralRequired : 0;

  reasons.push(`ATR ${a}/day, est move ${round2(expectedMove)} over ${dte}d`);

  return {
    symbol,
    method: "atr_estimated",
    estimatedPremium,
    estimatedYieldOnCollateral: round2(yieldOnCollateral * 10000) / 10000,
    preferredDte: dte,
    preferredStrike,
    collateralRequired,
    liquidityGrade: "unknown",
    spreadRisk: "unknown",
    confidence: "low",
    reasons,
    premiumSource: PREMIUM_SOURCE.ESTIMATED,
  };
}

// --------------------------------------------------
// PUBLIC: estimatePremium
// --------------------------------------------------

/**
 * @param {object} input
 * @param {string} input.symbol
 * @param {number} input.price
 * @param {number} [input.atr]
 * @param {number} [input.iv]                    annualized %, e.g. 35 for 35%
 * @param {number} [input.ivPercentile]          0..100
 * @param {Array<object>} [input.optionsChain]
 * @param {number[]} [input.dteTargets]
 * @param {object} [input.accountState]
 * @param {"conservative"|"neutral"|"aggressive"} [input.scannerMode]
 * @returns {object}
 */
export function estimatePremium(input) {
  const symbol = String(input?.symbol || "").toUpperCase();
  const price = safeNum(input?.price);
  const scannerMode = (input?.scannerMode || "neutral").toLowerCase();
  const dteTargets = Array.isArray(input?.dteTargets) && input.dteTargets.length > 0
    ? input.dteTargets : DEFAULT_DTE_TARGETS;

  const baseFail = (reason) => ({
    symbol,
    method: "insufficient_data",
    estimatedPremium: 0,
    estimatedYieldOnCollateral: 0,
    preferredDte: null,
    preferredStrike: null,
    collateralRequired: 0,
    liquidityGrade: "unknown",
    spreadRisk: "unknown",
    confidence: "low",
    reasons: [reason],
    premiumSource: PREMIUM_SOURCE.UNAVAILABLE,
  });

  if (!symbol) return baseFail("missing symbol");
  if (!(price > 0)) return baseFail("missing or invalid price");

  const baseInput = { symbol, price, dteTargets, scannerMode };

  // 1) Chain-based first
  const chain = Array.isArray(input?.optionsChain) ? input.optionsChain : null;
  if (chain && chain.length > 0) {
    const result = estimateFromChain({ ...baseInput, optionsChain: chain });
    if (result) {
      // Apply scanner-mode floor on liquidity / spread
      result.reasons = applyModeChecks(result, scannerMode, result.reasons);
      return result;
    }
  }

  // 2) IV-based
  if (Number.isFinite(Number(input?.iv)) || Number.isFinite(Number(input?.ivPercentile))) {
    const result = estimateFromIv({ ...baseInput, iv: input.iv, ivPercentile: input.ivPercentile });
    if (result) {
      result.reasons = applyModeChecks(result, scannerMode, result.reasons);
      return result;
    }
  }

  // 3) ATR-based
  if (Number.isFinite(Number(input?.atr)) && Number(input.atr) > 0) {
    const result = estimateFromAtr({ ...baseInput, atr: input.atr });
    if (result) {
      result.reasons = applyModeChecks(result, scannerMode, result.reasons);
      return result;
    }
  }

  return baseFail("no chain, IV, or ATR available");
}

/**
 * Apply scanner-mode minimums. Adds an explicit reason when the result
 * fails the mode floor — does NOT downgrade method, keeps confidence as-is
 * unless a mode-specific rule triggers.
 */
function applyModeChecks(result, scannerMode, reasons) {
  const cfg = pickModeCfg(scannerMode);
  const out = reasons.slice();
  const liqOk = (LIQ_RANK[result.liquidityGrade] ?? -1) >= (LIQ_RANK[cfg.minLiquidityGrade] ?? -1);
  const spreadOk = (SPREAD_RANK[result.spreadRisk] ?? 99) <= (SPREAD_RANK[cfg.maxSpreadRisk] ?? 99);
  const yieldOk = result.estimatedYieldOnCollateral >= cfg.minYieldOnCollateral;
  const confOk = (CONF_RANK[result.confidence] ?? -1) >= (CONF_RANK[cfg.minConfidence] ?? -1);

  if (!liqOk) out.push(`mode '${scannerMode}' requires liquidity ≥ ${cfg.minLiquidityGrade}`);
  if (!spreadOk) out.push(`mode '${scannerMode}' requires spread ≤ ${cfg.maxSpreadRisk}`);
  if (!yieldOk) out.push(`mode '${scannerMode}' yield floor ${cfg.minYieldOnCollateral * 100}%`);
  if (!confOk) out.push(`mode '${scannerMode}' requires confidence ≥ ${cfg.minConfidence}`);

  // Conservative downgrade: if any check fails, drop confidence one notch.
  if (scannerMode === "conservative" && (!liqOk || !spreadOk || !confOk)) {
    if (result.confidence === "high") result.confidence = "medium";
    else if (result.confidence === "medium") result.confidence = "low";
  }
  return out;
}

export const PREMIUM_SCANNER_MODE_DEFAULTS = SCANNER_MODE_DEFAULTS;
