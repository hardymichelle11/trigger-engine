// =====================================================
// REPLAY LAST CLOSE LOADER (Phase 4.7.6)
// =====================================================
// Pulls the last completed market session's OHLCV data and
// shapes it into the same `marketDataBySymbol` bundle the
// scanner consumes, so the operator can stage candidates
// after-hours / overnight / on weekends without faking
// "live" timestamps.
//
// Tiered data sources (only Tier 2 is wired in this phase):
//
//   Tier 1 — BigQuery `bars_1d` table  [stub, returns null]
//     The Python pipeline writes daily bars to BQ. There is
//     no frontend BQ client yet; Polygon prev-close is the
//     practical replacement for v1. Stub left in place so
//     the future wiring is a one-function swap, not a refactor.
//
//   Tier 2 — Polygon grouped daily aggregates (PRIMARY)
//     /v2/aggs/grouped/locale/us/market/stocks/{date}
//     Single HTTP call returns OHLCV for every US stock on
//     a given trading date. Cheap (one call), complete (no
//     per-symbol fan-out), and consistent (same shape across
//     all symbols). Walks back from "today" up to 5 calendar
//     days to find the most recent date that returns data
//     (handles weekends + holidays without a calendar table).
//
//   Tier 3 — Polygon per-symbol previous-close (FALLBACK)
//     /v2/aggs/ticker/{symbol}/prev
//     Used when grouped fails for whatever reason. N HTTP
//     calls, one per curated symbol. Same OHLCV semantics.
//
// Hard rules:
//   - PURE — no React, no DOM, no localStorage.
//   - No engine internals leaked — output shape mirrors the
//     existing scanner-input bundle (`fetchScannerInputBundle`).
//   - Replay is honest about what it is. metadata.universe.session
//     is set to "replay" (not "live"), the bundle carries
//     `replay: true`, and a human-readable `sessionDate` is
//     attached so the UI can render "REPLAY · 2026-05-01".
//   - Single-day-derived approximations are clearly labeled:
//     `previousClose` is the session OPEN (not yesterday's
//     close) for v1, and `atr` is `high - low` of the same
//     day. Multi-day context is a future enhancement.
//   - Never throws on missing data. Returns a structured
//     fallback bundle on any error so the operator sees an
//     honest reason instead of a crash.
// =====================================================

import { buildPolygonUrl } from "../../lib/polygonProxy.js";
import { buildCuratedWatchlist } from "./extendedHoursWatchlist.js";

// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

export const REPLAY_TIER = Object.freeze({
  BQ_BARS_1D:                "bq_bars_1d",                  // future
  POLYGON_GROUPED_DAILY:     "polygon_grouped_daily",       // primary
  POLYGON_PREV_CLOSE:        "polygon_prev_close",          // fallback
});

export const REPLAY_SESSION = "replay";

// Session-date staleness: warn the operator when the most recent
// trading day is more than this many calendar days behind today.
// Three trading days ≈ five calendar days (covers a long weekend).
export const REPLAY_STALE_CALENDAR_DAYS = 5;

// How far back to walk when probing for a successful trading day.
// Polygon's grouped endpoint returns an empty results array on
// non-trading days; we walk back up to N calendar days to find one
// that returns data, avoiding the need for a holiday calendar table.
const PROBE_BACK_MAX_DAYS = 5;

const DEFAULT_TIMEOUT_MS = 6000;

// --------------------------------------------------
// PUBLIC: fetchReplayLastCloseBundle
// --------------------------------------------------

/**
 * @param {object} args
 * @param {(path: string) => Promise<object>} [args.fetcher]    DI fetcher (used by tests)
 * @param {() => number} [args.now]                             injectable clock
 * @param {string[]} [args.curatedSymbols]                       override the default curated list
 * @param {number} [args.timeoutMs]
 * @returns {Promise<{
 *   symbols: string[],
 *   marketDataBySymbol: Record<string, object>,
 *   optionsDataBySymbol: Record<string, object>,
 *   metadata: object,
 *   warnings: string[],
 * }>}
 */
export async function fetchReplayLastCloseBundle(args = {}) {
  const now = typeof args.now === "function" ? args.now : () => Date.now();
  const fetcher = typeof args.fetcher === "function" ? args.fetcher : buildDefaultFetcher({
    timeoutMs: Number.isFinite(Number(args.timeoutMs)) ? Number(args.timeoutMs) : DEFAULT_TIMEOUT_MS,
  });

  const curated = resolveCuratedSymbols(args.curatedSymbols);
  if (curated.length === 0) {
    return wrapFallback({
      now: now(),
      reason: "no_curated_symbols",
      tier: null,
    });
  }

  // Tier 1 — BQ bars_1d (stub).
  const bqBundle = await fetchTierBigQuery(curated);
  if (bqBundle && bqBundle.symbols.length > 0) {
    return finalizeBundle({ ...bqBundle, tier: REPLAY_TIER.BQ_BARS_1D, now: now() });
  }

  // Tier 2 — Polygon grouped daily (PRIMARY).
  if (typeof fetcher === "function") {
    const grouped = await fetchTierGroupedDaily({ fetcher, curated, now: now() });
    if (grouped && grouped.symbols.length > 0) {
      return finalizeBundle({ ...grouped, tier: REPLAY_TIER.POLYGON_GROUPED_DAILY, now: now() });
    }

    // Tier 3 — Polygon per-symbol prev-close (FALLBACK).
    const fallback = await fetchTierPerSymbolPrevClose({ fetcher, curated, now: now() });
    if (fallback && fallback.symbols.length > 0) {
      return finalizeBundle({ ...fallback, tier: REPLAY_TIER.POLYGON_PREV_CLOSE, now: now() });
    }

    return wrapFallback({
      now: now(),
      reason: "all_tiers_returned_no_data",
      tier: null,
    });
  }

  return wrapFallback({
    now: now(),
    reason: "no_fetcher_available",
    tier: null,
  });
}

// --------------------------------------------------
// TIER 1 — BIGQUERY (stub)
// --------------------------------------------------

/**
 * Stub. The Python pipeline writes daily bars to BigQuery, but the
 * frontend has no BQ client. When that wiring lands, this function
 * will return a `{ symbols, marketDataBySymbol, sessionDate }` triple
 * the same shape as the Polygon tiers; until then it returns null
 * so the loader skips ahead to Polygon.
 *
 * @returns {Promise<null>}
 */
// eslint-disable-next-line no-unused-vars
async function fetchTierBigQuery(curated) {
  // TODO(phase 4.8?): wire a BQ-over-HTTP read endpoint and parse the
  // bars_1d projection here. Until then this tier intentionally no-ops.
  return null;
}

// --------------------------------------------------
// TIER 2 — POLYGON GROUPED DAILY (primary)
// --------------------------------------------------

async function fetchTierGroupedDaily({ fetcher, curated, now }) {
  const probe = await probeMostRecentTradingDay({ fetcher, now });
  if (!probe.payload || !Array.isArray(probe.payload.results) || probe.payload.results.length === 0) {
    return null;
  }

  const wantedSet = new Set(curated.map((s) => s.toUpperCase()));
  const marketDataBySymbol = {};
  let kept = 0;

  for (const row of probe.payload.results) {
    const sym = String(row?.T || "").toUpperCase();
    if (!sym || !wantedSet.has(sym)) continue;
    const md = shapeMarketData({
      symbol: sym,
      open:   Number(row?.o),
      high:   Number(row?.h),
      low:    Number(row?.l),
      close:  Number(row?.c),
      volume: Number(row?.v),
      sessionDate: probe.sessionDate,
      sessionEpochMs: probe.sessionEpochMs,
    });
    if (md) {
      marketDataBySymbol[sym] = md;
      kept++;
    }
  }

  if (kept === 0) return null;
  return {
    symbols: Object.keys(marketDataBySymbol),
    marketDataBySymbol,
    sessionDate: probe.sessionDate,
    sessionEpochMs: probe.sessionEpochMs,
    httpCalls: probe.httpCalls,
  };
}

/**
 * Walk backward from "today" up to PROBE_BACK_MAX_DAYS calendar days,
 * calling Polygon's grouped daily endpoint, until we find a date that
 * returns a non-empty results array. Avoids hardcoding a holiday
 * calendar — non-trading days simply return empty results.
 */
async function probeMostRecentTradingDay({ fetcher, now }) {
  let httpCalls = 0;
  for (let back = 1; back <= PROBE_BACK_MAX_DAYS; back++) {
    const date = isoDateNDaysBack(now, back);
    const path = `/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true`;
    let payload = null;
    try {
      payload = await fetcher(path);
      httpCalls++;
    } catch {
      payload = null;
      httpCalls++;
    }
    if (payload && Array.isArray(payload.results) && payload.results.length > 0) {
      return {
        payload,
        sessionDate: date,
        sessionEpochMs: epochMsForIsoDate(date),
        httpCalls,
      };
    }
  }
  return { payload: null, sessionDate: null, sessionEpochMs: null, httpCalls };
}

// --------------------------------------------------
// TIER 3 — PER-SYMBOL PREV-CLOSE (fallback)
// --------------------------------------------------

async function fetchTierPerSymbolPrevClose({ fetcher, curated, now }) {
  const marketDataBySymbol = {};
  let httpCalls = 0;
  let resolvedSessionEpochMs = null;
  let resolvedSessionDate = null;

  // Per-symbol fan-out. Polygon returns the most recent completed
  // session for each ticker — different symbols can in theory return
  // different `t` values around boundary moments, so we resolve the
  // bundle's sessionDate from the highest `t` we see (most recent).
  await Promise.all(curated.map(async (sym) => {
    const path = `/v2/aggs/ticker/${encodeURIComponent(sym)}/prev?adjusted=true`;
    try {
      const payload = await fetcher(path);
      httpCalls++;
      const row = Array.isArray(payload?.results) ? payload.results[0] : null;
      if (!row) return;
      const t = Number(row.t);
      const md = shapeMarketData({
        symbol: sym,
        open:   Number(row.o),
        high:   Number(row.h),
        low:    Number(row.l),
        close:  Number(row.c),
        volume: Number(row.v),
        sessionDate: Number.isFinite(t) ? isoDateForEpochMs(t) : null,
        sessionEpochMs: Number.isFinite(t) ? t : null,
      });
      if (md) {
        marketDataBySymbol[sym] = md;
        if (Number.isFinite(t) && (resolvedSessionEpochMs == null || t > resolvedSessionEpochMs)) {
          resolvedSessionEpochMs = t;
          resolvedSessionDate = isoDateForEpochMs(t);
        }
      }
    } catch {
      httpCalls++;
      // skip this symbol; fallback to other tiers / partial bundle
    }
  }));

  const symbols = Object.keys(marketDataBySymbol);
  if (symbols.length === 0) return null;

  // Backfill bundle-level sessionDate onto rows that had no `t`.
  if (resolvedSessionDate) {
    for (const sym of symbols) {
      const md = marketDataBySymbol[sym];
      if (!md.sessionDate) {
        md.sessionDate = resolvedSessionDate;
        md.sessionEpochMs = resolvedSessionEpochMs;
        md.timestamp = resolvedSessionEpochMs;
      }
    }
  }

  // Fall back to "today minus 1" only if we never saw a real `t`.
  return {
    symbols,
    marketDataBySymbol,
    sessionDate: resolvedSessionDate || isoDateNDaysBack(now, 1),
    sessionEpochMs: resolvedSessionEpochMs || epochMsForIsoDate(isoDateNDaysBack(now, 1)),
    httpCalls,
  };
}

// --------------------------------------------------
// SHAPING
// --------------------------------------------------

/**
 * Convert a single-day OHLCV row into the marketDataBySymbol shape
 * the scanner expects. Returns null when the row is unusable.
 *
 * Single-day approximations (clearly labeled in metadata.replay):
 *   - previousClose ← session open (no Thursday-close lookup in v1)
 *   - atr           ← high - low (single-day proxy)
 *   - avgVolume     ← session volume (1-day proxy; 20d avg is future)
 */
function shapeMarketData({ symbol, open, high, low, close, volume, sessionDate, sessionEpochMs }) {
  if (!Number.isFinite(close) || close <= 0) return null;
  const safeOpen   = Number.isFinite(open)   && open   > 0 ? open   : null;
  const safeHigh   = Number.isFinite(high)   && high   > 0 ? high   : null;
  const safeLow    = Number.isFinite(low)    && low    > 0 ? low    : null;
  const safeVolume = Number.isFinite(volume) && volume >= 0 ? volume : 0;
  const dollarVolume = close * safeVolume;
  const dayRange = (safeHigh != null && safeLow != null && safeHigh >= safeLow)
    ? (safeHigh - safeLow) : null;

  return {
    symbol,
    price: close,
    previousClose: safeOpen,                  // single-day approximation
    open: safeOpen,
    high: safeHigh,
    low: safeLow,
    close,
    volume: safeVolume,
    avgVolume: safeVolume,                    // single-day proxy
    dollarVolume,
    atr: dayRange,                            // single-day proxy
    timestamp: sessionEpochMs || null,
    sessionDate: sessionDate || null,
    sessionEpochMs: sessionEpochMs || null,
    detectedRegime: "RISK_ON",                // replay does not derive regime
    replay: true,
  };
}

function finalizeBundle({ symbols, marketDataBySymbol, sessionDate, sessionEpochMs, tier, httpCalls, now }) {
  const stale = isReplayStale(sessionEpochMs, now);
  const dateLabel = sessionDate ? humanReadableDateLabel(sessionDate) : "unknown";
  const warnings = [
    `Replay analysis from ${dateLabel}. Confirm live pricing before any entry.`,
  ];
  if (stale) {
    warnings.push(`Replay data stale — last completed session is ${dateLabel}.`);
  }

  return {
    symbols,
    marketDataBySymbol,
    optionsDataBySymbol: {},                 // replay has no live chains
    metadata: {
      universe: {
        source: "replay_last_close",
        session: REPLAY_SESSION,
        sessionLabel: "REPLAY — last close",
        sessionDate,
        sessionDateLabel: dateLabel,
        sessionEpochMs,
        universeStrategy: "replay_last_close",
        normalizedCount: symbols.length,
        snapshotCount: symbols.length,
        droppedCount: 0,
        tier,
        httpCalls,
        stale: !!stale,
        generatedAt: now,
      },
      options: {
        source: "skipped_for_replay",
        reason: "replay_no_chains",
      },
      circuit: { state: "n/a_for_replay" },
      replay: true,
      sessionDate,
      sessionDateLabel: dateLabel,
      sessionEpochMs,
      tier,
      stale: !!stale,
    },
    warnings,
  };
}

function wrapFallback({ now, reason, tier }) {
  return {
    symbols: [],
    marketDataBySymbol: {},
    optionsDataBySymbol: {},
    metadata: {
      universe: {
        source: "replay_last_close",
        session: REPLAY_SESSION,
        sessionLabel: "REPLAY — last close",
        sessionDate: null,
        sessionDateLabel: "unknown",
        sessionEpochMs: null,
        universeStrategy: "replay_last_close",
        normalizedCount: 0,
        snapshotCount: 0,
        droppedCount: 0,
        tier,
        stale: false,
        reason: reason || "replay_unavailable",
        generatedAt: now,
      },
      options: {
        source: "skipped_for_replay",
        reason: "replay_no_chains",
      },
      circuit: { state: "n/a_for_replay" },
      replay: true,
      reason: reason || "replay_unavailable",
      stale: false,
    },
    warnings: [
      `Replay last close unavailable (${reason || "unknown"}). Check Polygon proxy.`,
    ],
  };
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function resolveCuratedSymbols(override) {
  if (Array.isArray(override) && override.length > 0) {
    return override.map((s) => String(s || "").toUpperCase()).filter(Boolean);
  }
  const built = buildCuratedWatchlist();
  return Array.isArray(built?.symbols) ? built.symbols : [];
}

function buildDefaultFetcher({ timeoutMs }) {
  if (typeof fetch !== "function") return null;
  return async function defaultFetcher(path) {
    const url = await buildPolygonUrl(path);
    const ctrl = typeof AbortSignal?.timeout === "function"
      ? AbortSignal.timeout(timeoutMs) : undefined;
    const response = await fetch(url, ctrl ? { signal: ctrl } : undefined);
    if (!response.ok) {
      const err = new Error(`polygon_http_${response.status}`);
      err.status = response.status;
      throw err;
    }
    return await response.json();
  };
}

/**
 * Stale check: most recent session is older than REPLAY_STALE_CALENDAR_DAYS
 * days from now. Used only for warning, not rejection — replay never
 * rejects on staleness, the operator is staging deliberately.
 */
export function isReplayStale(sessionEpochMs, nowEpochMs) {
  // Guard against null/undefined explicitly — Number(null) is 0, which is
  // finite and would otherwise produce a huge ageMs against the current
  // clock and falsely flag "stale".
  if (sessionEpochMs == null || !Number.isFinite(Number(sessionEpochMs))
      || Number(sessionEpochMs) <= 0) {
    return false;
  }
  const ageMs = Number(nowEpochMs) - Number(sessionEpochMs);
  if (!Number.isFinite(ageMs) || ageMs < 0) return false;
  const ageDays = ageMs / (24 * 3600 * 1000);
  return ageDays > REPLAY_STALE_CALENDAR_DAYS;
}

/** YYYY-MM-DD for `now - back` days, in UTC (Polygon expects ISO date). */
export function isoDateNDaysBack(nowEpochMs, back) {
  const d = new Date(Number(nowEpochMs));
  d.setUTCDate(d.getUTCDate() - Math.max(0, Math.floor(Number(back) || 0)));
  return d.toISOString().slice(0, 10);
}

function isoDateForEpochMs(t) {
  if (!Number.isFinite(Number(t))) return null;
  return new Date(Number(t)).toISOString().slice(0, 10);
}

function epochMsForIsoDate(iso) {
  if (typeof iso !== "string" || iso.length < 10) return null;
  const d = new Date(`${iso.slice(0, 10)}T20:00:00Z`);  // ~16:00 ET close
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

function humanReadableDateLabel(iso) {
  try {
    const d = new Date(`${iso}T00:00:00Z`);
    if (!Number.isFinite(d.getTime())) return iso;
    const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    return `${month} ${day}, ${year}`;
  } catch {
    return iso;
  }
}
