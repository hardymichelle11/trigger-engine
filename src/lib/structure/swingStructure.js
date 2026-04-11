// =====================================================
// SWING STRUCTURE — highs, lows, trend bias, BOS/MSS
// =====================================================
// Detects swing points and market structure from OHLCV bars.
// Uses a simple pivot-point method (N bars left, N bars right).
// =====================================================

/**
 * Detect swing highs and lows from bar data.
 * A swing high = bar.high is the highest of the surrounding window.
 * A swing low = bar.low is the lowest of the surrounding window.
 *
 * @param {object[]} bars — OHLCV bars (oldest first)
 * @param {number} [lookback] — bars on each side for pivot detection (default 3)
 * @returns {{ highs: object[], lows: object[] }}
 */
export function detectSwings(bars, lookback = 3) {
  if (!bars || bars.length < lookback * 2 + 1) {
    return { highs: [], lows: [] };
  }

  const highs = [];
  const lows = [];

  for (let i = lookback; i < bars.length - lookback; i++) {
    const bar = bars[i];
    if (!bar || bar.high == null || bar.low == null) continue;

    // Swing high: bar.high >= all neighbors in window
    let isHigh = true;
    let isLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i || !bars[j]) continue;
      if (bars[j].high > bar.high) isHigh = false;
      if (bars[j].low < bar.low) isLow = false;
    }

    if (isHigh) highs.push({ index: i, price: bar.high, bar });
    if (isLow) lows.push({ index: i, price: bar.low, bar });
  }

  return { highs, lows };
}

/**
 * Analyze swing structure for trend bias and structure events.
 * @param {object[]} bars
 * @param {number} [lookback] — pivot detection window (default 3)
 * @returns {object} structure analysis
 */
export function analyzeSwingStructure(bars, lookback = 3) {
  if (!bars || bars.length < 10) {
    return { trendBias: "NEUTRAL", swings: { highs: [], lows: [] }, lastStructureEvent: null, higherHighs: 0, higherLows: 0, lowerHighs: 0, lowerLows: 0 };
  }

  const swings = detectSwings(bars, lookback);
  const { highs, lows } = swings;

  // Count higher highs / lower highs
  let higherHighs = 0, lowerHighs = 0;
  for (let i = 1; i < highs.length; i++) {
    if (highs[i].price > highs[i - 1].price) higherHighs++;
    else if (highs[i].price < highs[i - 1].price) lowerHighs++;
  }

  // Count higher lows / lower lows
  let higherLows = 0, lowerLows = 0;
  for (let i = 1; i < lows.length; i++) {
    if (lows[i].price > lows[i - 1].price) higherLows++;
    else if (lows[i].price < lows[i - 1].price) lowerLows++;
  }

  // Trend bias
  const bullishPoints = higherHighs + higherLows;
  const bearishPoints = lowerHighs + lowerLows;
  let trendBias = "NEUTRAL";
  if (bullishPoints > bearishPoints + 1) trendBias = "BULLISH";
  else if (bearishPoints > bullishPoints + 1) trendBias = "BEARISH";

  // Structure events (Break of Structure / Market Structure Shift)
  let lastStructureEvent = null;

  if (highs.length >= 2 && lows.length >= 2) {
    const lastHigh = highs[highs.length - 1];
    const prevHigh = highs[highs.length - 2];
    const lastLow = lows[lows.length - 1];
    const prevLow = lows[lows.length - 2];

    // BOS_UP: new higher high after higher low
    if (lastHigh.price > prevHigh.price && lastLow.price > prevLow.price) {
      lastStructureEvent = "BOS_UP";
    }
    // BOS_DOWN: new lower low after lower high
    else if (lastLow.price < prevLow.price && lastHigh.price < prevHigh.price) {
      lastStructureEvent = "BOS_DOWN";
    }
    // MSS_UP: was making lower lows, now made a higher high (shift to bullish)
    else if (lowerLows > 0 && lastHigh.price > prevHigh.price && lastHigh.index > lastLow.index) {
      lastStructureEvent = "MSS_UP";
    }
    // MSS_DOWN: was making higher highs, now made a lower low (shift to bearish)
    else if (higherHighs > 0 && lastLow.price < prevLow.price && lastLow.index > lastHigh.index) {
      lastStructureEvent = "MSS_DOWN";
    }
  }

  return {
    trendBias,
    swings,
    lastStructureEvent,
    higherHighs,
    higherLows,
    lowerHighs,
    lowerLows,
  };
}
