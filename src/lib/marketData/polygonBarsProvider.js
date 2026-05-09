// =====================================================================
// Polygon bars provider — daily OHLC normalizer
// =====================================================================
// Thin helper around Polygon's daily aggregates endpoint, routed through
// the existing proxy. Used by the ad-hoc TE simulation path so an
// uncataloged ticker can produce a real structural snapshot (ATR,
// support, resistance, trend) instead of just quote-level info.
//
// Hard rules:
//   - PURE network helper. No state, no React.
//   - Tolerant: returns [] on every failure, never throws.
//   - Normalized output: [{ ts, open, high, low, close, volume }, …].
// =====================================================================

import { buildPolygonUrl } from "../polygonProxy.js";

/**
 * @typedef {Object} DailyBar
 * @property {number} ts        epoch ms
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 * @property {number|null} volume
 */

/**
 * Fetch daily OHLC bars for a single symbol via the Polygon proxy.
 *
 * @param {string} symbol
 * @param {object} [opts]
 * @param {number} [opts.lookbackDays=90]
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.timeoutMs=8000]
 * @returns {Promise<DailyBar[]>}
 */
export async function getPolygonDailyBars(symbol, opts = {}) {
  const sym = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
  if (!sym) return [];
  const lookbackDays = Number.isFinite(opts.lookbackDays) && opts.lookbackDays > 0
    ? Math.floor(opts.lookbackDays)
    : 90;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 8000;
  const signal = opts.signal ?? safeTimeoutSignal(timeoutMs);

  const today = new Date();
  const from = new Date(today.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  try {
    const url = await buildPolygonUrl(
      `/v2/aggs/ticker/${encodeURIComponent(sym)}/range/1/day/${fmt(from)}/${fmt(today)}`,
      { adjusted: "true", sort: "asc", limit: "200" },
    );
    const r = await fetch(url, { signal });
    if (!r.ok) return [];
    const json = await r.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    const out = [];
    for (const b of results) {
      const close = numeric(b?.c);
      if (close == null) continue;
      out.push({
        ts:     numeric(b?.t),
        open:   numeric(b?.o) ?? close,
        high:   numeric(b?.h) ?? close,
        low:    numeric(b?.l) ?? close,
        close,
        volume: numeric(b?.v),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function numeric(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeTimeoutSignal(ms) {
  try {
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      return AbortSignal.timeout(ms);
    }
  } catch { /* fall through */ }
  return undefined;
}
