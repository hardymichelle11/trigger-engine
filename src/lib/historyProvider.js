// =====================================================
// HISTORY PROVIDER — unified bar history source
// =====================================================
// Priority chain:
//   1. In-memory cache (if fresh)
//   2. BigQuery via proxy (if configured)
//   3. Polygon REST aggs (always available)
//
// Returns the same shape regardless of source.
// Consumers (slope, evaluators, UI) never know where data came from.
// =====================================================

import { isBqAvailable, fetchClosesFromBQ, fetchDailyContext } from "./bqReader.js";
import { fetchRecentBars, analyzeTrend } from "./priceHistory.js";

// --------------------------------------------------
// IN-MEMORY CACHE
// --------------------------------------------------

const _closeCache = new Map();   // symbol -> { closes, source, fetchedAt }
const _contextCache = new Map(); // symbol -> { context, fetchedAt }
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

function _isFresh(entry) {
  return entry && (Date.now() - entry.fetchedAt) < CACHE_TTL_MS;
}

// --------------------------------------------------
// CLOSE PRICES (for slope/trend)
// --------------------------------------------------

/**
 * Get recent close prices for a symbol.
 * Tries: cache → BQ → Polygon REST.
 * @param {string} symbol
 * @param {string} apiKey — Polygon API key (fallback)
 * @param {number} [barsWanted] — default 60
 * @returns {Promise<{ closes: number[], source: string }>}
 */
export async function getCloses(symbol, apiKey, barsWanted = 60) {
  // 1. Cache
  const cached = _closeCache.get(symbol);
  if (_isFresh(cached) && cached.closes.length >= barsWanted * 0.5) {
    return { closes: cached.closes, source: `cache(${cached.source})` };
  }

  // 2. BQ
  if (isBqAvailable()) {
    try {
      const bqCloses = await fetchClosesFromBQ(symbol, barsWanted);
      if (bqCloses && bqCloses.length >= 3) {
        _closeCache.set(symbol, { closes: bqCloses, source: "bq", fetchedAt: Date.now() });
        return { closes: bqCloses, source: "bq" };
      }
    } catch {
      // BQ failed — fall through
    }
  }

  // 3. Polygon REST
  if (apiKey) {
    try {
      const polygonCloses = await fetchRecentBars(symbol, apiKey, barsWanted);
      if (polygonCloses.length >= 3) {
        _closeCache.set(symbol, { closes: polygonCloses, source: "polygon", fetchedAt: Date.now() });
        return { closes: polygonCloses, source: "polygon" };
      }
    } catch {
      // Polygon failed — fall through
    }
  }

  // 4. Return stale cache if available
  if (cached) {
    return { closes: cached.closes, source: `stale_cache(${cached.source})` };
  }

  return { closes: [], source: "none" };
}

// --------------------------------------------------
// TREND ANALYSIS (slope + MA + acceleration)
// --------------------------------------------------

/**
 * Get full trend analysis for a symbol.
 * Uses getCloses() internally — same source priority.
 * @param {string} symbol
 * @param {string} apiKey
 * @param {number} [barsWanted]
 * @returns {Promise<{ trend: object, source: string }>}
 */
export async function getTrend(symbol, apiKey, barsWanted = 60) {
  const { closes, source } = await getCloses(symbol, apiKey, barsWanted);
  const trend = analyzeTrend(closes);
  return { trend: { ...trend, dataSource: source }, source };
}

/**
 * Get trend data for multiple symbols.
 * @param {string[]} symbols
 * @param {string} apiKey
 * @param {number} [barsWanted]
 * @returns {Promise<Record<string, object>>} { symbol: trendResult }
 */
export async function getTrendBatch(symbols, apiKey, barsWanted = 60) {
  const results = {};

  // Batch in groups of 5
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    const promises = batch.map(async (sym) => {
      const { trend } = await getTrend(sym, apiKey, barsWanted);
      results[sym] = trend;
    });
    await Promise.all(promises);
  }

  return results;
}

// --------------------------------------------------
// DAILY CONTEXT (richer: gap, range, period high/low)
// --------------------------------------------------

/**
 * Get daily context for a symbol.
 * Tries BQ first (has gap, prev_close, range_pct), falls back to null.
 * @param {string} symbol
 * @param {number} [days] — default 10
 * @returns {Promise<object|null>}
 */
export async function getDailyContext(symbol, days = 10) {
  // Cache
  const cached = _contextCache.get(symbol);
  if (_isFresh(cached)) return cached.context;

  // BQ
  if (isBqAvailable()) {
    try {
      const ctx = await fetchDailyContext(symbol, days);
      if (ctx) {
        _contextCache.set(symbol, { context: ctx, fetchedAt: Date.now() });
        return ctx;
      }
    } catch {
      // fall through
    }
  }

  // No fallback for daily context — it's BQ-only data (gap, prev_close series)
  return null;
}

/**
 * Get daily context for multiple symbols.
 * @param {string[]} symbols
 * @param {number} [days]
 * @returns {Promise<Record<string, object|null>>}
 */
export async function getDailyContextBatch(symbols, days = 10) {
  const results = {};
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    await Promise.all(batch.map(async (sym) => {
      results[sym] = await getDailyContext(sym, days);
    }));
  }
  return results;
}

// --------------------------------------------------
// PROVIDER STATUS
// --------------------------------------------------

/**
 * Get provider status summary.
 * @returns {object}
 */
export function getProviderStatus() {
  const now = Date.now();
  let cachedFresh = 0, cachedStale = 0;
  for (const entry of _closeCache.values()) {
    if (_isFresh(entry)) cachedFresh++;
    else cachedStale++;
  }

  return {
    bqAvailable: isBqAvailable(),
    cacheTotal: _closeCache.size,
    cacheFresh: cachedFresh,
    cacheStale: cachedStale,
    contextCacheSize: _contextCache.size,
  };
}

/**
 * Clear all caches (for testing or forced refresh).
 */
export function clearHistoryCache() {
  _closeCache.clear();
  _contextCache.clear();
}
