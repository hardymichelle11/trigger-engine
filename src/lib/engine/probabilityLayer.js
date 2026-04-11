// =====================================================
// SECTION 10: PROBABILITY LAYER
// Full Monte Carlo with erf fallback for speed
// =====================================================

import { CONFIG, safeNumber, round2, clamp } from "./config.js";

// --------------------------------------------------
// BOX-MULLER NORMAL RANDOM (same as trigger engine)
// --------------------------------------------------

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// --------------------------------------------------
// MONTE CARLO PATH SIMULATION
// --------------------------------------------------

/**
 * Simulate a single price path using geometric Brownian motion.
 * @param {number} startPrice
 * @param {number} dailyVol — daily volatility (annualized IV / sqrt(252))
 * @param {number} steps — number of daily steps
 * @param {number} drift — daily drift (default: slight negative for puts)
 * @returns {number[]} price path
 */
function simulatePath(startPrice, dailyVol, steps, drift = -0.0001) {
  let price = startPrice;
  const path = [price];
  for (let i = 0; i < steps; i++) {
    price *= Math.exp((drift - 0.5 * dailyVol * dailyVol) + dailyVol * randn());
    path.push(price);
  }
  return path;
}

/**
 * Full Monte Carlo probability estimation for put selling.
 * Simulates N price paths and checks:
 * - Does price ever touch strike? (touch probability)
 * - Is final price above strike? (expiry probability)
 *
 * @param {object} params
 * @param {number} params.price — current price
 * @param {number} params.strike — put strike
 * @param {number} params.dte — days to expiration
 * @param {number} params.ivPercentile — 0-100 IV percentile rank
 * @param {number} [params.atrExpansionMultiple] — ATR expansion multiplier
 * @param {number} [params.N] — number of simulations (default 1000)
 * @returns {object} MC result
 */
export function monteCarloEstimate({ price, strike, dte, ivPercentile, atrExpansionMultiple, N = 1000 }) {
  const px = safeNumber(price);
  const s = safeNumber(strike);
  const days = Math.max(1, safeNumber(dte, 7));
  const iv = safeNumber(ivPercentile, 50);

  if (px <= 0 || s <= 0) {
    return _nullResult();
  }

  // Convert IV percentile to daily volatility
  // IV rank 0-100 maps roughly to annualized IV 0.15 - 1.00
  const annualizedIV = 0.15 + (iv / 100) * 0.85;
  const dailyVol = (annualizedIV / Math.sqrt(252)) * (atrExpansionMultiple || 1);

  let aboveAtExpiry = 0;
  let touchedStrike = 0;
  let maxDrawdownSum = 0;
  const finalPrices = [];

  for (let i = 0; i < N; i++) {
    const path = simulatePath(px, dailyVol, days);
    const finalPrice = path[path.length - 1];
    finalPrices.push(finalPrice);

    // Check if price finishes above strike
    if (finalPrice > s) aboveAtExpiry++;

    // Check if price ever touches or goes below strike
    let touched = false;
    let minPrice = px;
    for (let j = 1; j < path.length; j++) {
      if (path[j] <= s) { touched = true; }
      if (path[j] < minPrice) minPrice = path[j];
    }
    if (touched) touchedStrike++;

    maxDrawdownSum += (px - minPrice) / px;
  }

  const probAboveStrike = round2(aboveAtExpiry / N);
  const probTouch = round2(touchedStrike / N);
  const avgMaxDrawdown = round2(maxDrawdownSum / N);

  // Expected move: standard deviation of final prices
  const mean = finalPrices.reduce((a, b) => a + b, 0) / N;
  const variance = finalPrices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / N;
  const expectedMove = round2(Math.sqrt(variance));

  // Percentile bands for final price
  finalPrices.sort((a, b) => a - b);
  const p10 = round2(finalPrices[Math.floor(N * 0.10)]);
  const p25 = round2(finalPrices[Math.floor(N * 0.25)]);
  const p50 = round2(finalPrices[Math.floor(N * 0.50)]);
  const p75 = round2(finalPrices[Math.floor(N * 0.75)]);
  const p90 = round2(finalPrices[Math.floor(N * 0.90)]);

  const passesFilter = probAboveStrike >= CONFIG.setup.minProbability;

  return {
    method: "monte_carlo",
    paths: N,
    steps: days,
    probAboveStrike,
    probTouch,
    expectedMove,
    avgMaxDrawdown,
    passesFilter,
    distribution: { p10, p25, p50, p75, p90 },
    assumptions: {
      annualizedIV: round2(annualizedIV),
      dailyVol: round2(dailyVol * 10000) / 10000,
      atrMultiple: atrExpansionMultiple || 1,
    },
  };
}

// --------------------------------------------------
// ERF FALLBACK (fast, no path simulation)
// --------------------------------------------------

function erf(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x >= 0 ? 1 : -1;
  const t = 1 / (1 + p * Math.abs(x));
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function erfEstimate({ price, strike, dte, ivPercentile, atrExpansionMultiple }) {
  const px = safeNumber(price);
  const s = safeNumber(strike);
  const days = safeNumber(dte, 7);
  const iv = safeNumber(ivPercentile, 50);

  if (px <= 0 || s <= 0) return _nullResult();

  const dailyVol = (0.01 + (iv / 100) * 0.04) * (atrExpansionMultiple || 1);
  const expectedMove = px * dailyVol * Math.sqrt(days);
  const distanceToStrike = px - s;
  const zScore = distanceToStrike / (expectedMove || 1);

  const probAboveStrike = round2(clamp(0.5 + 0.5 * erf(zScore / Math.SQRT2), 0, 1));
  const probTouch = round2(clamp(1 - probAboveStrike * 0.7, 0, 1));
  const passesFilter = probAboveStrike >= CONFIG.setup.minProbability;

  return {
    method: "erf_approximation",
    paths: 0,
    steps: 0,
    probAboveStrike,
    probTouch,
    expectedMove: round2(expectedMove),
    avgMaxDrawdown: null,
    passesFilter,
    distribution: null,
    assumptions: { dailyVol: round2(dailyVol * 10000) / 10000 },
  };
}

function _nullResult() {
  return {
    method: "none",
    paths: 0, steps: 0,
    probAboveStrike: 0, probTouch: 1,
    expectedMove: 0, avgMaxDrawdown: null,
    passesFilter: false,
    distribution: null, assumptions: {},
  };
}

// --------------------------------------------------
// PUBLIC API — uses MC when feasible, erf as fallback
// --------------------------------------------------

/**
 * Estimate probability that price stays above strike.
 * Uses Monte Carlo (N=1000) for reliable results.
 * Falls back to erf approximation if inputs are malformed.
 *
 * @param {object} params — { price, strike, dte, ivPercentile, atrExpansionMultiple }
 * @param {object} [options] — { useMC: true, N: 1000 }
 * @returns {object} probability result with method, probAboveStrike, probTouch, etc.
 */
export function estimateProbability(params, options = {}) {
  const useMC = options.useMC !== false;
  const N = options.N || 1000;

  // Validate minimum inputs
  const px = safeNumber(params.price);
  const s = safeNumber(params.strike);
  if (px <= 0 || s <= 0) return _nullResult();

  // Use Monte Carlo when enabled
  if (useMC) {
    try {
      return monteCarloEstimate({ ...params, N });
    } catch {
      // MC failed — fall through to erf
    }
  }

  return erfEstimate(params);
}
