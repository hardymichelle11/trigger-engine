// =====================================================
// IV CACHE — in-memory cache with staleness tracking
// =====================================================
// Stores IV results per symbol with TTL-based staleness.
// Stale entries are still returned (better than nothing)
// but flagged so scoring can degrade confidence.
// =====================================================

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

const _cache = new Map();

/**
 * @typedef {object} CachedIvEntry
 * @property {string} symbol
 * @property {number|null} ivRank — 0-100 percentile, null if unavailable
 * @property {string} source — "polygon", "manual", "estimate", etc.
 * @property {string} asOf — ISO timestamp of when data was fetched
 * @property {boolean} stale — true if entry is older than TTL
 * @property {string} confidence — "high", "medium", "low", "none"
 * @property {number|null} ivCurrent — current implied volatility (annualized), if available
 * @property {number|null} iv52High — 52-week IV high, if available
 * @property {number|null} iv52Low — 52-week IV low, if available
 */

/**
 * Store an IV result in cache.
 * @param {string} symbol
 * @param {object} ivResult — must have at least { ivRank, source }
 */
export function cacheSet(symbol, ivResult) {
  _cache.set(symbol, {
    ...ivResult,
    symbol,
    _cachedAt: Date.now(),
  });
}

/**
 * Get cached IV result for a symbol.
 * Returns entry with `stale` flag based on TTL.
 * Returns null if no entry exists.
 * @param {string} symbol
 * @param {number} [ttlMs] — TTL in milliseconds (default 5 min)
 * @returns {CachedIvEntry|null}
 */
export function cacheGet(symbol, ttlMs = DEFAULT_TTL_MS) {
  const entry = _cache.get(symbol);
  if (!entry) return null;

  const age = Date.now() - entry._cachedAt;
  const stale = age >= ttlMs;

  return {
    symbol: entry.symbol,
    ivRank: entry.ivRank ?? null,
    source: entry.source || "unknown",
    asOf: entry.asOf || new Date(entry._cachedAt).toISOString(),
    stale,
    confidence: stale ? "low" : entry.confidence || "medium",
    ivCurrent: entry.ivCurrent ?? null,
    iv52High: entry.iv52High ?? null,
    iv52Low: entry.iv52Low ?? null,
  };
}

/**
 * Check if cache has a fresh (non-stale) entry.
 * @param {string} symbol
 * @param {number} [ttlMs]
 * @returns {boolean}
 */
export function cacheHasFresh(symbol, ttlMs = DEFAULT_TTL_MS) {
  const entry = cacheGet(symbol, ttlMs);
  return entry !== null && !entry.stale;
}

/**
 * Get all cached entries (for debug/display).
 * @returns {CachedIvEntry[]}
 */
export function cacheGetAll() {
  return Array.from(_cache.keys()).map(sym => cacheGet(sym));
}

/**
 * Clear all cached entries.
 */
export function cacheClear() {
  _cache.clear();
}

/**
 * Get cache stats.
 */
export function cacheStats() {
  const all = cacheGetAll();
  return {
    total: all.length,
    fresh: all.filter(e => !e.stale).length,
    stale: all.filter(e => e.stale).length,
  };
}
