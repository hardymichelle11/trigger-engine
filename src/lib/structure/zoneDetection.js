// =====================================================
// ZONE DETECTION — support/resistance bands from swings
// =====================================================
// Clusters nearby swing levels into bands using ATR tolerance.
// Tracks touches, strength, and freshness.
// =====================================================

import { detectSwings } from "./swingStructure.js";

/**
 * Compute Average True Range from bars.
 * @param {object[]} bars
 * @param {number} [period] — default 14
 * @returns {number}
 */
export function computeATR(bars, period = 14) {
  if (!bars || bars.length < 2) return 0;

  let sum = 0;
  let count = 0;
  for (let i = 1; i < bars.length && count < period; i++) {
    const curr = bars[i];
    const prev = bars[i - 1];
    if (!curr || !prev) continue;
    const tr = Math.max(
      (curr.high || 0) - (curr.low || 0),
      Math.abs((curr.high || 0) - (prev.close || 0)),
      Math.abs((curr.low || 0) - (prev.close || 0))
    );
    sum += tr;
    count++;
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Detect support and resistance zones by clustering swing levels.
 *
 * @param {object[]} bars — OHLCV bars (oldest first)
 * @param {object} [options]
 * @param {number} [options.atrMultiple] — clustering tolerance as ATR multiple (default 0.5)
 * @param {number} [options.swingLookback] — pivot detection window (default 3)
 * @param {number} [options.minTouches] — minimum touches for a zone to be considered (default 1)
 * @returns {object} support/resistance zones
 */
export function detectZones(bars, options = {}) {
  if (!bars || bars.length < 10) return _emptyResult();

  const { atrMultiple = 0.5, swingLookback = 3, minTouches = 1 } = options;

  const atr = computeATR(bars);
  if (atr <= 0) return _emptyResult();

  const tolerance = atr * atrMultiple;
  const swings = detectSwings(bars, swingLookback);
  const currentPrice = bars[bars.length - 1]?.close || 0;
  const lastIndex = bars.length - 1;

  // Collect all swing levels
  const levels = [
    ...swings.highs.map(h => ({ price: h.price, type: "resistance", index: h.index })),
    ...swings.lows.map(l => ({ price: l.price, type: "support", index: l.index })),
  ].sort((a, b) => a.price - b.price);

  // Cluster nearby levels into zones
  const zones = [];
  const used = new Set();

  for (let i = 0; i < levels.length; i++) {
    if (used.has(i)) continue;

    const cluster = [levels[i]];
    used.add(i);

    for (let j = i + 1; j < levels.length; j++) {
      if (used.has(j)) continue;
      if (Math.abs(levels[j].price - levels[i].price) <= tolerance) {
        cluster.push(levels[j]);
        used.add(j);
      }
    }

    const prices = cluster.map(c => c.price);
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const mid = (low + high) / 2;
    const touches = cluster.length;
    const latestTouch = Math.max(...cluster.map(c => c.index));
    const fresh = (lastIndex - latestTouch) < 20; // within last 20 bars
    const confidence = Math.min(0.95, 0.3 + touches * 0.15 + (fresh ? 0.15 : 0));

    if (touches >= minTouches) {
      zones.push({
        low: _r2(low),
        high: _r2(high),
        mid: _r2(mid),
        touches,
        confidence: _r2(confidence),
        fresh,
        isSupport: mid < currentPrice,
        isResistance: mid >= currentPrice,
      });
    }
  }

  // Split into support and resistance
  const supportZones = zones.filter(z => z.isSupport).sort((a, b) => b.mid - a.mid); // nearest first
  const resistanceZones = zones.filter(z => z.isResistance).sort((a, b) => a.mid - b.mid); // nearest first

  const nearestSupport = supportZones[0] || null;
  const nearestResistance = resistanceZones[0] || null;

  return {
    supportZones,
    resistanceZones,
    nearestSupport,
    nearestResistance,
    nearestSupportPct: nearestSupport && currentPrice > 0 ? _r4((currentPrice - nearestSupport.mid) / currentPrice) : null,
    nearestResistancePct: nearestResistance && currentPrice > 0 ? _r4((nearestResistance.mid - currentPrice) / currentPrice) : null,
    atr: _r2(atr),
    currentPrice: _r2(currentPrice),
  };
}

function _emptyResult() {
  return {
    supportZones: [], resistanceZones: [],
    nearestSupport: null, nearestResistance: null,
    nearestSupportPct: null, nearestResistancePct: null,
    atr: 0, currentPrice: 0,
  };
}

function _r2(n) { return Math.round(n * 100) / 100; }
function _r4(n) { return Math.round(n * 10000) / 10000; }
