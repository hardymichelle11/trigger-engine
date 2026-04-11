// =====================================================
// IV ADAPTER — source-agnostic IV rank provider
// =====================================================
// Single entry point: getIvRank(symbol) returns a
// normalized IvResult regardless of data source.
//
// Sources (in priority order):
//   1. Cache (if fresh)
//   2. Polygon options snapshot (if API key available)
//   3. ATR-based estimate (fallback)
//
// Future sources (plug in without changing scoring):
//   - Thinkorswim API
//   - TradingView webhook
//   - Fidelity data paste
//   - Manual override
// =====================================================

import { cacheGet, cacheSet, cacheHasFresh } from "./ivCache.js";

const POLYGON_BASE = "https://api.polygon.io";

// --------------------------------------------------
// CORE CONTRACT
// --------------------------------------------------

/**
 * @typedef {object} IvResult
 * @property {string} symbol
 * @property {number|null} ivRank — 0-100 percentile rank
 * @property {string} source — where this came from
 * @property {string} asOf — ISO timestamp
 * @property {boolean} stale — true if data may be outdated
 * @property {string} confidence — "high", "medium", "low", "none"
 * @property {number|null} ivCurrent
 * @property {number|null} iv52High
 * @property {number|null} iv52Low
 */

/**
 * Get IV rank for a symbol. Checks cache first, then fetches.
 * Never throws — returns fallback on failure.
 * @param {string} symbol
 * @param {object} [options]
 * @param {string} [options.apiKey] — Polygon API key
 * @param {object} [options.snapshot] — Polygon snapshot data (if already fetched)
 * @param {number} [options.atrExpansionMultiple] — for ATR-based estimate fallback
 * @param {number} [options.changePct] — for ATR-based estimate fallback
 * @returns {Promise<IvResult>}
 */
export async function getIvRank(symbol, options = {}) {
  if (!symbol) return _nullResult(symbol);

  // 1. Check cache
  if (cacheHasFresh(symbol)) {
    return cacheGet(symbol);
  }

  // 2. Try Polygon options snapshot
  if (options.apiKey) {
    const result = await _fetchPolygonIv(symbol, options.apiKey);
    if (result) {
      cacheSet(symbol, result);
      return cacheGet(symbol);
    }
  }

  // 3. Use Polygon snapshot data if provided (from existing fetch)
  if (options.snapshot) {
    const result = _extractFromSnapshot(symbol, options.snapshot);
    if (result) {
      cacheSet(symbol, result);
      return cacheGet(symbol);
    }
  }

  // 4. ATR-based estimate fallback
  if (options.atrExpansionMultiple != null || options.changePct != null) {
    const result = _estimateFromATR(symbol, options.atrExpansionMultiple, options.changePct);
    cacheSet(symbol, result);
    return cacheGet(symbol);
  }

  // 5. Return stale cache if available, else null
  const staleEntry = cacheGet(symbol);
  if (staleEntry) return staleEntry;

  return _nullResult(symbol);
}

/**
 * Batch fetch IV rank for multiple symbols.
 * @param {string[]} symbols
 * @param {object} [options] — passed to each getIvRank call
 * @returns {Promise<Record<string, IvResult>>}
 */
export async function getIvRankBatch(symbols, options = {}) {
  const results = {};

  // Batch in groups of 5 to respect rate limits
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    const promises = batch.map(async (sym) => {
      results[sym] = await getIvRank(sym, options);
    });
    await Promise.all(promises);
  }

  return results;
}

/**
 * Manually set IV rank for a symbol (for manual data entry or broker paste).
 * @param {string} symbol
 * @param {number} ivRank — 0-100
 * @param {string} [source] — e.g. "manual", "thinkorswim"
 */
export function setIvRankManual(symbol, ivRank, source = "manual") {
  if (!symbol || ivRank == null) return;
  cacheSet(symbol, {
    ivRank: Math.max(0, Math.min(100, Number(ivRank))),
    source,
    asOf: new Date().toISOString(),
    confidence: "high",
    ivCurrent: null,
    iv52High: null,
    iv52Low: null,
  });
}

// --------------------------------------------------
// POLYGON OPTIONS SOURCE
// --------------------------------------------------

async function _fetchPolygonIv(symbol, apiKey) {
  try {
    // Polygon options snapshot includes implied_volatility on the ticker
    const url = `${POLYGON_BASE}/v3/snapshot/options/${symbol}?apiKey=${apiKey}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const results = data.results || [];
    if (!results.length) return null;

    // Extract IV from the first option contract
    const contract = results[0];
    const iv = contract?.implied_volatility;
    if (iv == null) return null;

    // We get current IV but not 52-week range from this endpoint.
    // IV rank would need historical IV data to compute properly.
    // For now, we normalize IV to a rough percentile estimate.
    // Typical equity IV range: 0.15 (low) to 1.5 (extreme)
    const ivPct = Math.round(Math.min(99, Math.max(1, ((iv - 0.15) / (1.0 - 0.15)) * 100)));

    return {
      ivRank: ivPct,
      source: "polygon_options",
      asOf: new Date().toISOString(),
      confidence: "medium",
      ivCurrent: Math.round(iv * 1000) / 1000,
      iv52High: null,
      iv52Low: null,
    };
  } catch {
    return null;
  }
}

// --------------------------------------------------
// SNAPSHOT EXTRACTION (from existing Polygon stock snapshot)
// --------------------------------------------------

function _extractFromSnapshot(symbol, snapshot) {
  // Polygon stock snapshots don't include options IV directly,
  // but we can use the day's price action to estimate
  const day = snapshot?.day || {};
  const prev = snapshot?.prevDay || {};
  if (!day.c || !prev.c) return null;

  const changePct = Math.abs((day.c - prev.c) / prev.c);
  const range = day.h && day.l ? (day.h - day.l) / day.c : 0;

  // Rough heuristic: big moves + wide ranges = high IV environment
  const ivEstimate = Math.round(Math.min(99, Math.max(1, 30 + changePct * 500 + range * 300)));

  return {
    ivRank: ivEstimate,
    source: "snapshot_estimate",
    asOf: new Date().toISOString(),
    confidence: "low",
    ivCurrent: null,
    iv52High: null,
    iv52Low: null,
  };
}

// --------------------------------------------------
// ATR-BASED ESTIMATE (current fallback, promoted to adapter)
// --------------------------------------------------

function _estimateFromATR(symbol, atrMult, changePct) {
  const base = 40;
  const atrBonus = Math.min(30, ((atrMult || 1) - 1) * 40);
  const moveBonus = Math.min(20, Math.abs(changePct || 0) * 3);
  const ivRank = Math.round(Math.min(99, base + atrBonus + moveBonus));

  return {
    ivRank,
    source: "atr_estimate",
    asOf: new Date().toISOString(),
    confidence: "low",
    ivCurrent: null,
    iv52High: null,
    iv52Low: null,
  };
}

// --------------------------------------------------
// NULL RESULT
// --------------------------------------------------

function _nullResult(symbol) {
  return {
    symbol: symbol || "UNKNOWN",
    ivRank: null,
    source: "none",
    asOf: new Date().toISOString(),
    stale: true,
    confidence: "none",
    ivCurrent: null,
    iv52High: null,
    iv52Low: null,
  };
}
