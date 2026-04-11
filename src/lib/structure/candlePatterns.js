// =====================================================
// CANDLE PATTERNS — strict numeric detection from OHLCV
// =====================================================
// Detects 8 patterns from bar data. No visual parsing.
// Returns normalized pattern objects with confidence.
//
// Bar shape: { open, high, low, close, volume }
// =====================================================

/**
 * @typedef {object} CandlePattern
 * @property {string} type
 * @property {boolean} bullish
 * @property {boolean} bearish
 * @property {number} confidence — 0-1
 * @property {number} barIndex — index in the input array
 */

/**
 * Detect all candle patterns in a bar array.
 * @param {object[]} bars — OHLCV bars (oldest first)
 * @returns {CandlePattern[]} detected patterns
 */
export function detectCandlePatterns(bars) {
  if (!bars || bars.length < 2) return [];

  const patterns = [];

  for (let i = 1; i < bars.length; i++) {
    const curr = bars[i];
    const prev = bars[i - 1];
    if (!_valid(curr) || !_valid(prev)) continue;

    const currBody = Math.abs(curr.close - curr.open);
    const prevBody = Math.abs(prev.close - prev.open);
    const currRange = curr.high - curr.low || 0.001;
    const currUpperWick = curr.high - Math.max(curr.open, curr.close);
    const currLowerWick = Math.min(curr.open, curr.close) - curr.low;

    // Bullish engulfing: prev bearish, curr bullish, curr body engulfs prev body
    if (prev.close < prev.open && curr.close > curr.open &&
        curr.open <= prev.close && curr.close >= prev.open &&
        currBody > prevBody) {
      patterns.push({ type: "bullish_engulfing", bullish: true, bearish: false, confidence: _clamp(currBody / prevBody * 0.5, 0.4, 0.95), barIndex: i });
    }

    // Bearish engulfing: prev bullish, curr bearish, curr body engulfs prev body
    if (prev.close > prev.open && curr.close < curr.open &&
        curr.open >= prev.close && curr.close <= prev.open &&
        currBody > prevBody) {
      patterns.push({ type: "bearish_engulfing", bullish: false, bearish: true, confidence: _clamp(currBody / prevBody * 0.5, 0.4, 0.95), barIndex: i });
    }

    // Hammer: small body at top, long lower wick (>= 2x body), small upper wick
    if (currLowerWick >= currBody * 2 && currUpperWick <= currBody * 0.5 && currBody > 0) {
      patterns.push({ type: "hammer", bullish: true, bearish: false, confidence: _clamp(currLowerWick / currRange, 0.3, 0.85), barIndex: i });
    }

    // Shooting star: small body at bottom, long upper wick (>= 2x body), small lower wick
    if (currUpperWick >= currBody * 2 && currLowerWick <= currBody * 0.5 && currBody > 0) {
      patterns.push({ type: "shooting_star", bullish: false, bearish: true, confidence: _clamp(currUpperWick / currRange, 0.3, 0.85), barIndex: i });
    }

    // Doji: very small body relative to range (<10%)
    if (currBody / currRange < 0.1 && currRange > 0) {
      patterns.push({ type: "doji", bullish: false, bearish: false, confidence: _clamp(1 - currBody / currRange, 0.4, 0.9), barIndex: i });
    }

    // Inside bar: curr range entirely within prev range
    if (curr.high <= prev.high && curr.low >= prev.low) {
      patterns.push({ type: "inside_bar", bullish: false, bearish: false, confidence: _clamp(1 - currRange / (prev.high - prev.low || 1), 0.3, 0.8), barIndex: i });
    }

    // Outside bar: curr range engulfs prev range
    if (curr.high >= prev.high && curr.low <= prev.low && currRange > (prev.high - prev.low)) {
      const isBullish = curr.close > curr.open;
      patterns.push({ type: "outside_bar", bullish: isBullish, bearish: !isBullish, confidence: _clamp(currRange / (prev.high - prev.low || 1) * 0.5, 0.4, 0.85), barIndex: i });
    }

    // Three-bar reversal (bullish): three consecutive bars, last reverses prior two
    if (i >= 2) {
      const prev2 = bars[i - 2];
      if (_valid(prev2)) {
        // Bullish: prev2 + prev bearish, curr bullish closing above prev2 open
        if (prev2.close < prev2.open && prev.close < prev.open && curr.close > curr.open && curr.close >= prev2.open) {
          patterns.push({ type: "three_bar_reversal", bullish: true, bearish: false, confidence: 0.7, barIndex: i });
        }
        // Bearish: prev2 + prev bullish, curr bearish closing below prev2 open
        if (prev2.close > prev2.open && prev.close > prev.open && curr.close < curr.open && curr.close <= prev2.open) {
          patterns.push({ type: "three_bar_reversal", bullish: false, bearish: true, confidence: 0.7, barIndex: i });
        }
      }
    }
  }

  return patterns;
}

/**
 * Get the most recent pattern of each type (last N bars).
 * @param {object[]} bars
 * @param {number} [lookback] — only consider last N bars (default 10)
 * @returns {CandlePattern[]}
 */
export function getRecentPatterns(bars, lookback = 10) {
  if (!bars || bars.length < 3) return [];
  const recentBars = bars.slice(-lookback);
  const offset = bars.length - recentBars.length;

  const patterns = detectCandlePatterns(recentBars);
  // Adjust barIndex to be relative to the full array
  return patterns.map(p => ({ ...p, barIndex: p.barIndex + offset }));
}

function _valid(bar) {
  return bar && typeof bar.open === "number" && typeof bar.close === "number" && typeof bar.high === "number" && typeof bar.low === "number";
}

function _clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
