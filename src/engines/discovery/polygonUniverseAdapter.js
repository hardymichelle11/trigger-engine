// =====================================================
// POLYGON UNIVERSE ADAPTER (Phase 3)
// =====================================================
// Thin, additive adapter that turns Polygon market-snapshot
// payloads into the marketDataBySymbol shape expected by
// runMarketDiscoveryScan().
//
// Hard rules:
//   - DOES NOT fetch live data on its own. The HTTP fetcher
//     is dependency-injected (so tests stay offline).
//   - Reads fields defensively; never throws on missing data.
//   - Drops invalid rows with explicit reason codes — never
//     silently truncates the universe.
//   - Stays additive: imports nothing from existing engines.
// =====================================================

import { safeNum, round2 } from "./types.js";

export const UNIVERSE_SOURCE = Object.freeze({
  GAINERS: "gainers",
  LOSERS: "losers",
  MOST_ACTIVE: "most_active",
  CUSTOM_WATCHLIST: "custom_watchlist",
  EXISTING_CATALOG: "existing_catalog",
});

export const UNIVERSE_DROP_REASON = Object.freeze({
  INVALID_SYMBOL: "invalid_symbol",
  MISSING_PRICE: "missing_price",
  MISSING_VOLUME: "missing_volume",
  MISSING_TIMESTAMP: "missing_timestamp",
  STALE_SNAPSHOT: "stale_snapshot",
  EMPTY_RECORD: "empty_record",
});

// --------------------------------------------------
// FIELD READERS (defensive)
// --------------------------------------------------

function readSymbol(row) {
  if (!row || typeof row !== "object") return null;
  const sym = String(row.ticker || row.T || row.symbol || "").toUpperCase().trim();
  return sym && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym) ? sym : null;
}

function readPrice(row) {
  if (!row) return null;
  const day = row.day || {};
  const last = row.lastTrade || {};
  if (Number.isFinite(Number(day.c)) && Number(day.c) > 0) return Number(day.c);
  if (Number.isFinite(Number(day.close)) && Number(day.close) > 0) return Number(day.close);
  if (Number.isFinite(Number(last.p)) && Number(last.p) > 0) return Number(last.p);
  if (Number.isFinite(Number(row.price)) && Number(row.price) > 0) return Number(row.price);
  return null;
}

function readPrevClose(row) {
  if (!row) return null;
  const prev = row.prevDay || row.previousDay || {};
  if (Number.isFinite(Number(prev.c)) && Number(prev.c) > 0) return Number(prev.c);
  if (Number.isFinite(Number(prev.close)) && Number(prev.close) > 0) return Number(prev.close);
  if (Number.isFinite(Number(row.previousClose)) && Number(row.previousClose) > 0) return Number(row.previousClose);
  return null;
}

function readPercentChange(row) {
  if (!row) return null;
  if (Number.isFinite(Number(row.todaysChangePerc))) return Number(row.todaysChangePerc);
  if (Number.isFinite(Number(row.percentChange))) return Number(row.percentChange);
  return null;
}

function readVolume(row) {
  if (!row) return null;
  const day = row.day || {};
  if (Number.isFinite(Number(day.v)) && Number(day.v) >= 0) return Number(day.v);
  if (Number.isFinite(Number(day.volume)) && Number(day.volume) >= 0) return Number(day.volume);
  if (Number.isFinite(Number(row.volume)) && Number(row.volume) >= 0) return Number(row.volume);
  return null;
}

function readPrevVolume(row) {
  if (!row) return null;
  const prev = row.prevDay || row.previousDay || {};
  if (Number.isFinite(Number(prev.v)) && Number(prev.v) >= 0) return Number(prev.v);
  if (Number.isFinite(Number(prev.volume)) && Number(prev.volume) >= 0) return Number(prev.volume);
  return null;
}

function readVwap(row) {
  const day = row?.day || {};
  if (Number.isFinite(Number(day.vw)) && Number(day.vw) > 0) return Number(day.vw);
  if (Number.isFinite(Number(day.vwap)) && Number(day.vwap) > 0) return Number(day.vwap);
  return null;
}

function readTimestampMs(row) {
  if (!row) return null;
  // Polygon `updated` is nanoseconds; lastQuote/lastTrade also use ns.
  const candidates = [row.updated, row.lastTrade?.t, row.lastQuote?.t, row.lastUpdate, row.timestamp];
  for (const c of candidates) {
    if (!Number.isFinite(Number(c))) continue;
    const n = Number(c);
    // Heuristic: ns ≈ 1.7e18, ms ≈ 1.7e12, sec ≈ 1.7e9
    if (n > 1e16) return Math.floor(n / 1_000_000);
    if (n > 1e12) return n;
    if (n > 1e9) return n * 1000;
  }
  if (typeof row.asOf === "string") {
    const t = Date.parse(row.asOf);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

// --------------------------------------------------
// CORE: normalize a single Polygon row → MarketData
// --------------------------------------------------

/**
 * Normalize one Polygon snapshot row.
 * @param {object} row
 * @param {string} source
 * @param {number} now                    epoch ms (used to label freshness)
 * @returns {{ ok: true, symbol: string, data: object } | { ok: false, symbol: string|null, reason: string }}
 */
export function normalizePolygonRow(row, source, now) {
  if (!row || typeof row !== "object") {
    return { ok: false, symbol: null, reason: UNIVERSE_DROP_REASON.EMPTY_RECORD };
  }

  const symbol = readSymbol(row);
  if (!symbol) return { ok: false, symbol: null, reason: UNIVERSE_DROP_REASON.INVALID_SYMBOL };

  const price = readPrice(row);
  if (price == null) return { ok: false, symbol, reason: UNIVERSE_DROP_REASON.MISSING_PRICE };

  const volume = readVolume(row);
  if (volume == null) return { ok: false, symbol, reason: UNIVERSE_DROP_REASON.MISSING_VOLUME };

  const prevClose = readPrevClose(row);
  const prevVolume = readPrevVolume(row);
  const vwap = readVwap(row);
  const ts = readTimestampMs(row);
  const percentChange = readPercentChange(row) ?? (prevClose && prevClose > 0
    ? ((price - prevClose) / prevClose) * 100 : null);
  const dollarVolume = vwap && volume ? vwap * volume : (price && volume ? price * volume : 0);

  const data = {
    symbol,
    price: round2(price),
    previousClose: prevClose != null ? round2(prevClose) : null,
    percentChange: percentChange != null ? round2(percentChange) : null,
    volume,
    avgVolume: prevVolume != null ? prevVolume : null,
    dollarVolume: round2(dollarVolume),
    timestamp: ts != null ? ts : now,
    source: `polygon_${source}`,
  };

  return { ok: true, symbol, data };
}

// --------------------------------------------------
// CORE: build universe from an injected response
// --------------------------------------------------

/**
 * Build a marketDataBySymbol object from a Polygon snapshot payload.
 * Caller supplies the parsed Polygon JSON; this function is pure.
 *
 * @param {object} args
 * @param {string} args.source                        UNIVERSE_SOURCE value
 * @param {object} [args.polygonResponse]             parsed Polygon JSON: { tickers: [...] } or { results: [...] }
 * @param {Array<object>} [args.rawRows]              alternative: directly pass an array of rows
 * @param {string[]} [args.customSymbols]             for CUSTOM_WATCHLIST: filter to these tickers
 * @param {number} [args.now]                         epoch ms; defaults to Date.now()
 * @param {number} [args.maxStaleMs]                  drop rows older than this; default disabled
 * @returns {{
 *   symbols: string[],
 *   marketDataBySymbol: Record<string, object>,
 *   metadata: { source: string, snapshotCount: number, normalizedCount: number, droppedCount: number, droppedReasons: Array<{symbol: string|null, reason: string}> },
 * }}
 */
export function buildUniverseFromPolygon(args = {}) {
  const source = args.source || UNIVERSE_SOURCE.MOST_ACTIVE;
  const now = Number.isFinite(Number(args.now)) ? Number(args.now) : Date.now();
  const maxStale = Number.isFinite(Number(args.maxStaleMs)) ? Number(args.maxStaleMs) : null;

  let rows = [];
  if (Array.isArray(args.rawRows)) {
    rows = args.rawRows;
  } else if (args.polygonResponse && typeof args.polygonResponse === "object") {
    const r = args.polygonResponse;
    rows = Array.isArray(r.tickers) ? r.tickers
      : Array.isArray(r.results) ? r.results
      : Array.isArray(r) ? r
      : [];
  }

  // Custom watchlist filter
  if (source === UNIVERSE_SOURCE.CUSTOM_WATCHLIST && Array.isArray(args.customSymbols)) {
    const allow = new Set(args.customSymbols.map(s => String(s || "").toUpperCase().trim()).filter(Boolean));
    rows = rows.filter(r => allow.has(String(r?.ticker || r?.T || r?.symbol || "").toUpperCase()));
  }

  const marketDataBySymbol = {};
  const droppedReasons = [];
  let normalizedCount = 0;

  for (const row of rows) {
    const result = normalizePolygonRow(row, source, now);
    if (!result.ok) {
      droppedReasons.push({ symbol: result.symbol, reason: result.reason });
      continue;
    }
    if (maxStale != null && result.data.timestamp != null
        && (now - result.data.timestamp) > maxStale) {
      droppedReasons.push({ symbol: result.symbol, reason: UNIVERSE_DROP_REASON.STALE_SNAPSHOT });
      continue;
    }
    // Last-write-wins on duplicate symbols
    marketDataBySymbol[result.symbol] = result.data;
    normalizedCount++;
  }

  return {
    symbols: Object.keys(marketDataBySymbol),
    marketDataBySymbol,
    metadata: {
      source,
      snapshotCount: rows.length,
      normalizedCount,
      droppedCount: droppedReasons.length,
      droppedReasons,
    },
  };
}

// --------------------------------------------------
// OPTIONAL HTTP FETCHER (DI — never called by the scanner)
// --------------------------------------------------

/**
 * Fetch a Polygon snapshot universe via an injected fetcher.
 * Pure orchestration: maps a UNIVERSE_SOURCE value to a path,
 * calls `fetcher(path)`, returns the parsed payload through
 * buildUniverseFromPolygon(). Network failures resolve to an
 * empty universe with a recorded reason — they NEVER throw.
 *
 * @param {object} args
 * @param {string} args.source
 * @param {(path: string) => Promise<object>} args.fetcher       DI: returns parsed JSON
 * @param {string[]} [args.customSymbols]
 * @param {number} [args.now]
 * @param {number} [args.maxStaleMs]
 * @returns {Promise<ReturnType<typeof buildUniverseFromPolygon>>}
 */
export async function fetchUniverse(args = {}) {
  const { source, fetcher, customSymbols, now, maxStaleMs } = args;
  if (typeof fetcher !== "function") {
    return {
      symbols: [],
      marketDataBySymbol: {},
      metadata: {
        source: source || "unknown",
        snapshotCount: 0,
        normalizedCount: 0,
        droppedCount: 0,
        droppedReasons: [{ symbol: null, reason: "missing_fetcher" }],
      },
    };
  }

  const path = pathForSource(source, customSymbols);
  let payload = null;
  try {
    payload = await fetcher(path);
  } catch (err) {
    return {
      symbols: [],
      marketDataBySymbol: {},
      metadata: {
        source: source || "unknown",
        snapshotCount: 0,
        normalizedCount: 0,
        droppedCount: 0,
        droppedReasons: [{ symbol: null, reason: `fetch_failed: ${err?.message || "error"}` }],
      },
    };
  }

  return buildUniverseFromPolygon({
    source, polygonResponse: payload, customSymbols, now, maxStaleMs,
  });
}

function pathForSource(source, customSymbols) {
  switch (source) {
    case UNIVERSE_SOURCE.GAINERS:
      return "/v2/snapshot/locale/us/markets/stocks/gainers";
    case UNIVERSE_SOURCE.LOSERS:
      return "/v2/snapshot/locale/us/markets/stocks/losers";
    case UNIVERSE_SOURCE.MOST_ACTIVE:
      return "/v2/snapshot/locale/us/markets/stocks/most_active";
    case UNIVERSE_SOURCE.CUSTOM_WATCHLIST: {
      const tickers = (customSymbols || []).map(s => String(s).toUpperCase()).join(",");
      return tickers
        ? `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${encodeURIComponent(tickers)}`
        : "/v2/snapshot/locale/us/markets/stocks/tickers";
    }
    case UNIVERSE_SOURCE.EXISTING_CATALOG:
      return "/v2/snapshot/locale/us/markets/stocks/tickers";
    default:
      return "/v2/snapshot/locale/us/markets/stocks/tickers";
  }
}
