// =====================================================
// PRICE HISTORY — slope, trend, and MA utilities
// =====================================================
// Pure math functions that work on any close-price array.
// Also includes a Polygon aggs fetcher for recent bars.
//
// Slope convention: positive = price rising, negative = falling.
// All functions handle insufficient data gracefully.
// =====================================================

// --------------------------------------------------
// PURE SLOPE / TREND FUNCTIONS
// --------------------------------------------------

/**
 * Compute slope of a price series using linear regression.
 * Returns slope in price-units per bar, normalized by mean price.
 * Positive = uptrend, negative = downtrend.
 * @param {number[]} closes — array of close prices (oldest first)
 * @returns {{ slope: number, r2: number, bars: number } | null}
 */
export function computeSlope(closes) {
  if (!closes || closes.length < 3) return null;

  const n = closes.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += closes[i];
    sumXY += i * closes[i];
    sumX2 += i * i;
    sumY2 += closes[i] * closes[i];
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;

  const rawSlope = (n * sumXY - sumX * sumY) / denom;
  const meanPrice = sumY / n;

  // Normalize: slope as fraction of mean price per bar
  const slope = meanPrice > 0 ? rawSlope / meanPrice : 0;

  // R² for confidence
  const ssRes = closes.reduce((sum, y, i) => {
    const yHat = (sumY / n) + rawSlope * (i - sumX / n);
    return sum + (y - yHat) ** 2;
  }, 0);
  const ssTot = closes.reduce((sum, y) => sum + (y - meanPrice) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return {
    slope: Math.round(slope * 1e6) / 1e6,
    r2: Math.round(r2 * 1000) / 1000,
    bars: n,
  };
}

/**
 * Compute short moving average from close prices.
 * @param {number[]} closes — close prices (oldest first)
 * @param {number} period — MA period (default 5)
 * @returns {number | null}
 */
export function computeMA(closes, period = 5) {
  if (!closes || closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Compute MA slope: slope of the last N MA values.
 * Tells you if the trend itself is accelerating or decelerating.
 * @param {number[]} closes — close prices (oldest first)
 * @param {number} maPeriod — MA window (default 5)
 * @param {number} slopeBars — how many MA points to regress (default 10)
 * @returns {{ maSlope: number, r2: number } | null}
 */
export function computeMASlope(closes, maPeriod = 5, slopeBars = 10) {
  if (!closes || closes.length < maPeriod + slopeBars) return null;

  const maValues = [];
  for (let i = maPeriod - 1; i < closes.length; i++) {
    const window = closes.slice(i - maPeriod + 1, i + 1);
    maValues.push(window.reduce((a, b) => a + b, 0) / maPeriod);
  }

  const recent = maValues.slice(-slopeBars);
  return computeSlope(recent);
}

/**
 * Compute acceleration: difference between recent slope and older slope.
 * Positive = trend strengthening, negative = trend weakening.
 * @param {number[]} closes
 * @param {number} halfWindow — bars in each half (default 15)
 * @returns {{ acceleration: number, recentSlope: number, olderSlope: number } | null}
 */
export function computeAcceleration(closes, halfWindow = 15) {
  if (!closes || closes.length < halfWindow * 2) return null;

  const older = computeSlope(closes.slice(-halfWindow * 2, -halfWindow));
  const recent = computeSlope(closes.slice(-halfWindow));

  if (!older || !recent) return null;

  return {
    acceleration: Math.round((recent.slope - older.slope) * 1e6) / 1e6,
    recentSlope: recent.slope,
    olderSlope: older.slope,
  };
}

/**
 * Full trend analysis from a close price series.
 * Returns everything evaluators need in one call.
 * @param {number[]} closes — close prices (oldest first)
 * @param {number} shortPeriod — short MA period (default 5)
 * @returns {object} trend analysis result
 */
export function analyzeTrend(closes, shortPeriod = 5) {
  if (!closes || closes.length < 3) {
    return { available: false, reason: "insufficient bars" };
  }

  const slope = computeSlope(closes);
  const shortMA = computeMA(closes, shortPeriod);
  const maSlope = computeMASlope(closes, shortPeriod);
  const accel = computeAcceleration(closes);
  const lastPrice = closes[closes.length - 1];

  // Confidence: high if enough bars and good R²
  let confidence = "low";
  if (slope && slope.bars >= 30 && slope.r2 >= 0.3) confidence = "high";
  else if (slope && slope.bars >= 10 && slope.r2 >= 0.15) confidence = "medium";

  // Direction
  const turningUp = slope ? slope.slope > 0 : false;
  const strongTrend = slope ? Math.abs(slope.slope) > 0.0005 : false;

  return {
    available: true,
    slope: slope?.slope ?? 0,
    r2: slope?.r2 ?? 0,
    bars: slope?.bars ?? 0,
    shortMA,
    priceAboveMA: shortMA ? lastPrice > shortMA : null,
    maSlope: maSlope?.slope ?? null,
    acceleration: accel?.acceleration ?? null,
    confidence,
    turningUp,
    strongTrend,
  };
}

// --------------------------------------------------
// POLYGON RECENT BARS FETCHER (browser-side)
// --------------------------------------------------

const POLYGON_BASE = "https://api.polygon.io";

/**
 * Fetch recent 1m bars from Polygon for a single symbol.
 * Returns array of close prices (oldest first).
 * @param {string} symbol
 * @param {string} apiKey
 * @param {number} barsWanted — how many bars (default 60)
 * @returns {Promise<number[]>} close prices
 */
export async function fetchRecentBars(symbol, apiKey, barsWanted = 60) {
  if (!apiKey || !symbol) return [];

  // Fetch today + yesterday to ensure enough bars
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 2);

  const from = yesterday.toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);

  const url = `${POLYGON_BASE}/v2/aggs/ticker/${symbol}/range/1/minute/${from}/${to}?adjusted=true&sort=asc&limit=${barsWanted * 2}&apiKey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const results = data.results || [];

    // Extract close prices, take the most recent N
    const closes = results.map(r => r.c).filter(c => c != null && c > 0);
    return closes.slice(-barsWanted);
  } catch {
    return [];
  }
}

/**
 * Fetch recent bars and compute trend for multiple symbols.
 * Returns { symbol: trendAnalysis } map.
 * @param {string[]} symbols — symbols to analyze
 * @param {string} apiKey
 * @param {number} barsWanted
 * @returns {Promise<Record<string, object>>}
 */
export async function fetchTrendData(symbols, apiKey, barsWanted = 60) {
  const results = {};

  // Batch in groups of 5 to respect rate limits
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    const promises = batch.map(async (sym) => {
      try {
        const closes = await fetchRecentBars(sym, apiKey, barsWanted);
        results[sym] = analyzeTrend(closes);
      } catch {
        results[sym] = { available: false, reason: "fetch failed" };
      }
    });
    await Promise.all(promises);
  }

  return results;
}
