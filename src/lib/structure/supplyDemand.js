// =====================================================
// SUPPLY/DEMAND ZONES — base + displacement detection
// =====================================================
// Detects zones where price consolidated (base) then
// displaced aggressively (impulse > ATR threshold).
// Tracks freshness and whether zones have been tested.
// =====================================================

import { computeATR } from "./zoneDetection.js";

/**
 * Detect supply and demand zones from bar data.
 *
 * Demand zone: consolidation base followed by upward displacement
 * Supply zone: consolidation base followed by downward displacement
 *
 * @param {object[]} bars — OHLCV bars (oldest first)
 * @param {object} [options]
 * @param {number} [options.baseMaxBars] — max bars for consolidation base (default 5)
 * @param {number} [options.displacementMultiple] — impulse move as ATR multiple (default 1.5)
 * @returns {object}
 */
export function detectSupplyDemand(bars, options = {}) {
  if (!bars || bars.length < 10) return _emptyResult();

  const { baseMaxBars = 5, displacementMultiple = 1.5 } = options;
  const atr = computeATR(bars);
  if (atr <= 0) return _emptyResult();

  const threshold = atr * displacementMultiple;
  const currentPrice = bars[bars.length - 1]?.close || 0;
  const lastIndex = bars.length - 1;

  const demandZones = [];
  const supplyZones = [];

  for (let i = baseMaxBars; i < bars.length - 1; i++) {
    const curr = bars[i];
    const next = bars[i + 1];
    if (!curr || !next) continue;

    // Check for compression base before this bar
    const baseStart = Math.max(0, i - baseMaxBars);
    const baseBars = bars.slice(baseStart, i + 1);
    const baseRange = _rangeOf(baseBars);

    // Is the base compressed? (range < 1.5 * ATR)
    if (baseRange > atr * 1.5) continue;

    // Check for displacement after base
    const displacement = next.close - curr.close;

    // Demand zone: upward displacement
    if (displacement >= threshold) {
      const low = Math.min(...baseBars.map(b => b.low).filter(Boolean));
      const high = Math.max(...baseBars.map(b => b.high).filter(Boolean));
      const tested = _isZoneTested(bars, i + 1, low, high, "demand");
      const fresh = !tested && (lastIndex - i) < 30;

      demandZones.push({
        low: _r2(low),
        high: _r2(high),
        originIndex: baseStart,
        displacementIndex: i + 1,
        displacementSize: _r2(displacement),
        tested,
        fresh,
        confidence: _r2(Math.min(0.95, 0.4 + (displacement / atr) * 0.15 + (fresh ? 0.2 : 0))),
      });
    }

    // Supply zone: downward displacement
    if (-displacement >= threshold) {
      const low = Math.min(...baseBars.map(b => b.low).filter(Boolean));
      const high = Math.max(...baseBars.map(b => b.high).filter(Boolean));
      const tested = _isZoneTested(bars, i + 1, low, high, "supply");
      const fresh = !tested && (lastIndex - i) < 30;

      supplyZones.push({
        low: _r2(low),
        high: _r2(high),
        originIndex: baseStart,
        displacementIndex: i + 1,
        displacementSize: _r2(Math.abs(displacement)),
        tested,
        fresh,
        confidence: _r2(Math.min(0.95, 0.4 + (Math.abs(displacement) / atr) * 0.15 + (fresh ? 0.2 : 0))),
      });
    }
  }

  // Find active zones (nearest to current price)
  const activeDemand = demandZones.filter(z => z.high <= currentPrice && !z.tested)
    .sort((a, b) => b.high - a.high)[0] || null;
  const activeSupply = supplyZones.filter(z => z.low >= currentPrice && !z.tested)
    .sort((a, b) => a.low - b.low)[0] || null;

  return {
    demandZones,
    supplyZones,
    activeDemandZone: activeDemand,
    activeSupplyZone: activeSupply,
    insideDemandZone: demandZones.some(z => currentPrice >= z.low && currentPrice <= z.high),
    insideSupplyZone: supplyZones.some(z => currentPrice >= z.low && currentPrice <= z.high),
  };
}

function _rangeOf(bars) {
  const highs = bars.map(b => b.high).filter(Boolean);
  const lows = bars.map(b => b.low).filter(Boolean);
  if (!highs.length || !lows.length) return Infinity;
  return Math.max(...highs) - Math.min(...lows);
}

function _isZoneTested(bars, afterIndex, low, high, type) {
  // A zone is "tested" if price revisited the zone after displacement
  for (let i = afterIndex + 1; i < bars.length; i++) {
    const bar = bars[i];
    if (!bar) continue;
    if (type === "demand" && bar.low <= high && bar.low >= low) return true;
    if (type === "supply" && bar.high >= low && bar.high <= high) return true;
  }
  return false;
}

function _emptyResult() {
  return {
    demandZones: [], supplyZones: [],
    activeDemandZone: null, activeSupplyZone: null,
    insideDemandZone: false, insideSupplyZone: false,
  };
}

function _r2(n) { return Math.round(n * 100) / 100; }
