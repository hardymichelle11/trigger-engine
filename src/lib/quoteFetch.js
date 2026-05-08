// =====================================================================
// Quote-only refresh — bulk Polygon snapshot
// =====================================================================
// Lightweight companion to the full scanner. Hits Polygon's bulk
// snapshot endpoint via the existing proxy and returns just the price /
// percent change / volume / previous close for the supplied symbols.
//
// Use case: card prices stay current at the quote cadence (every 15-30s
// per refreshPolicy) without recomputing scores or re-ranking. Score and
// rank still come from the analytics path on the slower cadence.
//
// Hard rules:
//   - PURE network helper. No state, no React.
//   - Tolerant of failures: returns the data we did receive (or {}); never
//     throws to the caller. The cockpit falls back to the last analytics
//     snapshot when this returns nothing.
//   - Stamps `lastQuoteAtMs` on every projection so the cockpit can age
//     the per-symbol freshness chip independently.
// =====================================================================

import { buildPolygonUrl } from "./polygonProxy.js";

/**
 * @typedef {Object} LiveQuote
 * @property {string} symbol
 * @property {number|null} price
 * @property {number|null} previousClose
 * @property {number|null} percentChange       %, decimal × 100 (Polygon's todaysChangePerc)
 * @property {number|null} volume
 * @property {number|null} dollarVolume
 * @property {number} lastQuoteAtMs            epoch ms when this was fetched
 * @property {number|null} updatedAtNs         provider-side update timestamp (ns), if available
 */

/**
 * Fetch live quotes for the given symbols. Always returns a map
 * {symbol → LiveQuote}; failure to fetch yields an empty map. Does NOT
 * throw.
 *
 * @param {string[]} symbols
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.timeoutMs=5000]
 * @returns {Promise<Record<string, LiveQuote>>}
 */
export async function fetchQuotes(symbols, opts = {}) {
  if (!Array.isArray(symbols) || symbols.length === 0) return {};
  const unique = Array.from(new Set(symbols.filter(Boolean)));
  if (unique.length === 0) return {};

  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 5000;
  const signal = opts.signal ?? AbortSignal.timeout(timeoutMs);

  try {
    const url = await buildPolygonUrl(
      "/v2/snapshot/locale/us/markets/stocks/tickers",
      { tickers: unique.join(",") },
    );
    const r = await fetch(url, { signal });
    if (!r.ok) return {};
    const json = await r.json();
    const at = Date.now();
    const out = {};
    const tickers = Array.isArray(json.tickers) ? json.tickers : [];
    for (const t of tickers) {
      if (!t || !t.ticker) continue;
      out[t.ticker] = projectTicker(t, at);
    }
    return out;
  } catch {
    return {};
  }
}

function projectTicker(t, at) {
  const day = t.day || {};
  const lastTrade = t.lastTrade || {};
  const prevDay = t.prevDay || {};

  // Prefer day.c (today's close so far) when present, else last trade price.
  const price = numericOrNull(day.c) ?? numericOrNull(lastTrade.p);
  const prevClose = numericOrNull(prevDay.c);
  const percentChange = numericOrNull(t.todaysChangePerc);
  const volume = numericOrNull(day.v);
  const dollarVolume = numericOrNull(day.dv ?? (price != null && volume != null ? price * volume : null));

  return {
    symbol: t.ticker,
    price,
    previousClose: prevClose,
    percentChange,
    volume,
    dollarVolume,
    lastQuoteAtMs: at,
    updatedAtNs: numericOrNull(t.updated),
  };
}

function numericOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Merge a fresh quote map over an existing one. Newer entries
 * (higher lastQuoteAtMs) win; missing entries stay as-is. Lets the
 * cockpit accumulate quotes across cycles when partial fetches return.
 */
export function mergeQuotes(prev, next) {
  const out = { ...(prev || {}) };
  if (!next) return out;
  for (const [sym, q] of Object.entries(next)) {
    const existing = out[sym];
    if (
      !existing ||
      !Number.isFinite(existing.lastQuoteAtMs) ||
      q.lastQuoteAtMs >= existing.lastQuoteAtMs
    ) {
      out[sym] = q;
    }
  }
  return out;
}
