// =====================================================
// CAPITAL POLICY ENGINE
// =====================================================
// Pure function: given the user's capital context and
// open positions, compute deployable / reserved / pressure.
//
// Math rules (per spec):
//   - availableCash drives deployable + reserved math.
//   - totalAccountValue is informational only.
//   - maxDeployedPct applied to availableCash.
//   - reservedCashBufferPct applied to availableCash.
// =====================================================

import {
  CAPITAL_PRESSURE,
  SIZING_BIAS,
  MARKET_MODE,
  safeNum,
  round2,
} from "./types.js";

const SHORT_PUT_MULTIPLIER = 100;

/**
 * Derive collateral committed by a single open position.
 * Short puts: strike * 100 * contracts (cash-secured).
 * If `position.collateral` is provided, it wins.
 *
 * @param {import("./types.js").OpenPosition} pos
 * @returns {number}
 */
export function derivePositionCollateral(pos) {
  if (!pos) return 0;
  if (Number.isFinite(Number(pos.collateral))) return Math.max(0, Number(pos.collateral));
  const strategy = (pos.strategy || "").toLowerCase();
  const strike = safeNum(pos.strike);
  const contracts = Math.max(1, safeNum(pos.contracts, 1));
  if (strategy === "short_put" && strike > 0) {
    return strike * SHORT_PUT_MULTIPLIER * contracts;
  }
  // long_stock: collateral = price * shares (if price/shares supplied)
  const price = safeNum(pos.price);
  const shares = safeNum(pos.shares);
  if (strategy === "long_stock" && price > 0 && shares > 0) {
    return price * shares;
  }
  return 0;
}

/**
 * Sum collateral across all open positions.
 * @param {import("./types.js").OpenPosition[]} positions
 * @returns {number}
 */
export function sumDeployedCollateral(positions = []) {
  return (positions || []).reduce((acc, p) => acc + derivePositionCollateral(p), 0);
}

/**
 * Determine pressure level from remaining vs deployable cash.
 * @param {number} remaining
 * @param {number} deployable
 * @returns {import("./types.js").CapitalPressureLevel}
 */
export function classifyPressure(remaining, deployable) {
  if (remaining <= 0) return CAPITAL_PRESSURE.MAXED;
  if (deployable <= 0) return CAPITAL_PRESSURE.MAXED;
  const ratio = remaining / deployable;
  if (ratio < 0.20) return CAPITAL_PRESSURE.HIGH;
  if (ratio < 0.50) return CAPITAL_PRESSURE.MODERATE;
  return CAPITAL_PRESSURE.LOW;
}

/**
 * Pick a sizing bias from pressure + market mode.
 * Defensive shrinks; opportunistic grows (within deployable).
 *
 * @param {import("./types.js").CapitalPressureLevel} pressure
 * @param {import("./types.js").MarketMode} mode
 * @returns {import("./types.js").SizingBias}
 */
export function pickSizingBias(pressure, mode) {
  if (pressure === CAPITAL_PRESSURE.MAXED) return SIZING_BIAS.SKIP;
  if (mode === MARKET_MODE.DEFENSIVE) {
    if (pressure === CAPITAL_PRESSURE.HIGH) return SIZING_BIAS.MICRO;
    if (pressure === CAPITAL_PRESSURE.MODERATE) return SIZING_BIAS.MICRO;
    return SIZING_BIAS.STARTER;
  }
  if (mode === MARKET_MODE.OPPORTUNISTIC) {
    if (pressure === CAPITAL_PRESSURE.HIGH) return SIZING_BIAS.STARTER;
    if (pressure === CAPITAL_PRESSURE.MODERATE) return SIZING_BIAS.NORMAL;
    return SIZING_BIAS.MAX_ALLOWED;
  }
  if (mode === MARKET_MODE.RISK_ON) {
    if (pressure === CAPITAL_PRESSURE.HIGH) return SIZING_BIAS.MICRO;
    if (pressure === CAPITAL_PRESSURE.MODERATE) return SIZING_BIAS.STARTER;
    return SIZING_BIAS.NORMAL;
  }
  // neutral (default)
  if (pressure === CAPITAL_PRESSURE.HIGH) return SIZING_BIAS.MICRO;
  if (pressure === CAPITAL_PRESSURE.MODERATE) return SIZING_BIAS.STARTER;
  return SIZING_BIAS.NORMAL;
}

/**
 * Build the capital policy state.
 *
 * @param {import("./types.js").CapitalPolicyInput} input
 * @returns {import("./types.js").CapitalPolicyState}
 */
export function evaluateCapitalPolicy(input) {
  const totalAccountValue = safeNum(input?.totalAccountValue);
  const availableCash = Math.max(0, safeNum(input?.availableCash));
  const rawMaxPct = safeNum(input?.maxDeployedPct);
  const rawResPct = safeNum(input?.reservedCashBufferPct);
  const maxDeployedPct = Math.max(0, Math.min(1, rawMaxPct));
  const reservedPct = Math.max(0, Math.min(1, rawResPct));
  const positions = Array.isArray(input?.currentOpenPositions) ? input.currentOpenPositions : [];
  const modeRaw = (input?.marketMode || MARKET_MODE.NEUTRAL).toLowerCase();
  const validModes = new Set(Object.values(MARKET_MODE));
  const marketMode = validModes.has(modeRaw) ? modeRaw : MARKET_MODE.NEUTRAL;

  const deployableCash = round2(availableCash * maxDeployedPct);
  const reservedCash = round2(availableCash * reservedPct);
  const currentlyDeployedCash = round2(sumDeployedCollateral(positions));
  const remainingDeployableCash = round2(Math.max(0, deployableCash - currentlyDeployedCash));

  const capitalPressureLevel = classifyPressure(remainingDeployableCash, deployableCash);
  const sizingBias = pickSizingBias(capitalPressureLevel, marketMode);

  const warnings = [];
  if (rawMaxPct > 1 || rawMaxPct < 0) {
    warnings.push(`maxDeployedPct ${rawMaxPct} clamped to ${maxDeployedPct}`);
  }
  if (rawResPct > 1 || rawResPct < 0) {
    warnings.push(`reservedCashBufferPct ${rawResPct} clamped to ${reservedPct}`);
  }
  if (availableCash <= 0) {
    warnings.push("availableCash is zero — no capital to deploy");
  }
  if (capitalPressureLevel === CAPITAL_PRESSURE.MAXED) {
    warnings.push("All deployable capital exhausted — no new trades recommended");
  }
  if (capitalPressureLevel === CAPITAL_PRESSURE.HIGH) {
    warnings.push("Remaining deployable capital below 20% — size down");
  }
  if (currentlyDeployedCash > deployableCash && deployableCash > 0) {
    warnings.push("Currently deployed exceeds maxDeployed limit");
  }
  if (marketMode === MARKET_MODE.DEFENSIVE) {
    warnings.push("Defensive mode — sizing reduced");
  }
  if (deployableCash + reservedCash > availableCash + 0.01) {
    warnings.push(`maxDeployedPct + reservedCashBufferPct (${maxDeployedPct + reservedPct}) exceeds 1.0 — overlapping budgets`);
  }

  return {
    totalAccountValue: round2(totalAccountValue),
    availableCash: round2(availableCash),
    deployableCash,
    reservedCash,
    currentlyDeployedCash,
    remainingDeployableCash,
    capitalPressureLevel,
    marketMode,
    sizingBias,
    warnings,
  };
}

/**
 * True if the trade's required collateral fits inside the remaining
 * deployable budget. Useful as an admission test before ranking.
 *
 * @param {number} capitalRequired
 * @param {import("./types.js").CapitalPolicyState} state
 * @returns {boolean}
 */
export function fitsRemainingDeployable(capitalRequired, state) {
  const req = safeNum(capitalRequired);
  if (req <= 0) return false;
  return req <= safeNum(state?.remainingDeployableCash);
}
