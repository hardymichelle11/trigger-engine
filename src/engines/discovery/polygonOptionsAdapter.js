// =====================================================
// POLYGON OPTIONS ADAPTER (Phase 3)
// =====================================================
// Normalize Polygon options-snapshot data into the
// optionsDataBySymbol shape consumed by
// estimatedPremiumEngine.estimatePremium().
//
// Hard rules:
//   - DOES NOT fetch live data on its own. Fetcher is DI.
//   - When chain data is unavailable, returns a STRUCTURED
//     ABSENCE marker (`status: "no_chain_data"`) so the
//     downstream premium engine cleanly falls back to the
//     IV / ATR / insufficient_data branches.
//   - Drops malformed contract rows with reason codes; does
//     not throw on partial input.
//   - Adapter never grades liquidity itself — that decision
//     stays inside estimatedPremiumEngine. Adapter only
//     surfaces the raw fields the engine needs.
// =====================================================

import { safeNum, round2 } from "./types.js";

export const OPTIONS_STATUS = Object.freeze({
  CHAIN_AVAILABLE: "chain_available",
  NO_CHAIN_DATA: "no_chain_data",
  PARTIAL: "partial",
});

export const OPTIONS_DROP_REASON = Object.freeze({
  MISSING_DETAILS: "missing_details",
  MISSING_TYPE: "missing_type",
  MISSING_STRIKE: "missing_strike",
  MISSING_EXPIRATION: "missing_expiration",
  MISSING_QUOTE: "missing_quote",
  INVALID_QUOTE: "invalid_quote",
  EXPIRED: "expired",
});

const DAY_MS = 24 * 60 * 60 * 1000;

// --------------------------------------------------
// FIELD READERS
// --------------------------------------------------

function readContractType(row) {
  const t = String(row?.details?.contract_type || row?.type || row?.contractType || "").toLowerCase();
  if (t === "put" || t === "call") return t;
  return null;
}

function readStrike(row) {
  const k = Number(row?.details?.strike_price ?? row?.strike ?? row?.strike_price);
  return Number.isFinite(k) && k > 0 ? k : null;
}

function readExpirationMs(row) {
  const exp = row?.details?.expiration_date || row?.expiration || row?.expirationDate;
  if (!exp) return null;
  // Accept "YYYY-MM-DD" or epoch ms
  if (typeof exp === "number" && Number.isFinite(exp)) return exp;
  const t = Date.parse(typeof exp === "string" && /^\d{4}-\d{2}-\d{2}$/.test(exp) ? exp + "T20:00:00Z" : exp);
  return Number.isFinite(t) ? t : null;
}

function readQuote(row) {
  const q = row?.last_quote || row?.lastQuote || {};
  const bid = Number(q.bid ?? q.b ?? row?.bid);
  const ask = Number(q.ask ?? q.a ?? row?.ask);
  const mid = Number(q.midpoint ?? q.mid ?? row?.mid);
  const lastUpdated = q.last_updated ?? q.t ?? row?.lastUpdated ?? null;
  return { bid, ask, mid, lastUpdated };
}

function readIvPercent(row) {
  const v = Number(row?.implied_volatility ?? row?.iv ?? row?.impliedVolatility);
  if (!Number.isFinite(v) || v <= 0) return null;
  // Polygon returns IV as decimal (0.32). Normalize to percent (32) so it
  // matches the field expected by estimatedPremiumEngine.
  return v <= 5 ? round2(v * 100) : round2(v);
}

function readVolume(row) {
  const v = Number(row?.day?.volume ?? row?.volume ?? row?.day?.v);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function readOpenInterest(row) {
  const oi = Number(row?.open_interest ?? row?.openInterest ?? row?.oi);
  return Number.isFinite(oi) && oi >= 0 ? oi : 0;
}

// --------------------------------------------------
// NORMALIZE A SINGLE CONTRACT
// --------------------------------------------------

/**
 * @param {object} row                  Polygon contract snapshot row
 * @param {number} asOf                 epoch ms anchor for DTE calculation
 * @returns {{ ok: true, row: object } | { ok: false, reason: string }}
 */
export function normalizeOptionContract(row, asOf) {
  if (!row || typeof row !== "object") return { ok: false, reason: OPTIONS_DROP_REASON.MISSING_DETAILS };

  const type = readContractType(row);
  if (!type) return { ok: false, reason: OPTIONS_DROP_REASON.MISSING_TYPE };

  const strike = readStrike(row);
  if (strike == null) return { ok: false, reason: OPTIONS_DROP_REASON.MISSING_STRIKE };

  const expirationMs = readExpirationMs(row);
  if (expirationMs == null) return { ok: false, reason: OPTIONS_DROP_REASON.MISSING_EXPIRATION };

  const dte = Math.round((expirationMs - asOf) / DAY_MS);
  if (dte < 0) return { ok: false, reason: OPTIONS_DROP_REASON.EXPIRED };

  const { bid, ask, mid, lastUpdated } = readQuote(row);
  const hasUsableQuote = (Number.isFinite(bid) && bid > 0) || (Number.isFinite(ask) && ask > 0)
    || (Number.isFinite(mid) && mid > 0);
  if (!hasUsableQuote) return { ok: false, reason: OPTIONS_DROP_REASON.MISSING_QUOTE };

  if (Number.isFinite(bid) && Number.isFinite(ask) && ask < bid) {
    return { ok: false, reason: OPTIONS_DROP_REASON.INVALID_QUOTE };
  }

  return {
    ok: true,
    row: {
      type,
      strike: round2(strike),
      dte,
      expiration: expirationMs,
      bid: Number.isFinite(bid) && bid > 0 ? round2(bid) : 0,
      ask: Number.isFinite(ask) && ask > 0 ? round2(ask) : 0,
      mid: Number.isFinite(mid) && mid > 0 ? round2(mid)
        : (Number.isFinite(bid) && Number.isFinite(ask) ? round2((bid + ask) / 2) : 0),
      iv: readIvPercent(row),
      openInterest: readOpenInterest(row),
      volume: readVolume(row),
      lastUpdated,
    },
  };
}

// --------------------------------------------------
// BUILD optionsDataBySymbol
// --------------------------------------------------

/**
 * Build an optionsDataBySymbol map from per-underlying snapshot payloads.
 *
 * @param {object} args
 * @param {Record<string, object>} args.snapshotsBySymbol   { SYM: polygonOptionsSnapshotPayload, ... }
 * @param {number} [args.now]                                epoch ms; defaults to Date.now()
 * @param {("put"|"call")[]} [args.contractTypes]            default ["put"]
 * @returns {{
 *   optionsDataBySymbol: Record<string, { chain: object[], asOf: number, status: string, droppedReasons: object[] }>,
 *   metadata: { totalUnderlyings: number, withChain: number, withoutChain: number, totalContracts: number, totalDropped: number }
 * }}
 */
export function buildOptionsDataFromPolygon(args = {}) {
  const snapshotsBySymbol = args.snapshotsBySymbol || {};
  const now = Number.isFinite(Number(args.now)) ? Number(args.now) : Date.now();
  const allowedTypes = new Set((args.contractTypes && args.contractTypes.length > 0)
    ? args.contractTypes : ["put"]);

  const optionsDataBySymbol = {};
  let withChain = 0;
  let withoutChain = 0;
  let totalContracts = 0;
  let totalDropped = 0;

  for (const [rawSym, payload] of Object.entries(snapshotsBySymbol)) {
    const symbol = String(rawSym).toUpperCase().trim();
    if (!symbol) continue;

    let rows = [];
    if (Array.isArray(payload)) rows = payload;
    else if (Array.isArray(payload?.results)) rows = payload.results;
    else if (Array.isArray(payload?.chain)) rows = payload.chain;
    else if (Array.isArray(payload?.tickers)) rows = payload.tickers;

    if (!rows || rows.length === 0) {
      optionsDataBySymbol[symbol] = {
        chain: [],
        asOf: now,
        status: OPTIONS_STATUS.NO_CHAIN_DATA,
        droppedReasons: [],
      };
      withoutChain++;
      continue;
    }

    const droppedReasons = [];
    const chain = [];
    for (const r of rows) {
      const result = normalizeOptionContract(r, now);
      if (!result.ok) {
        droppedReasons.push({ reason: result.reason });
        totalDropped++;
        continue;
      }
      if (!allowedTypes.has(result.row.type)) {
        // Skipping by type isn't an error — don't record as drop.
        continue;
      }
      chain.push(result.row);
      totalContracts++;
    }

    if (chain.length === 0) {
      optionsDataBySymbol[symbol] = {
        chain: [],
        asOf: now,
        status: OPTIONS_STATUS.NO_CHAIN_DATA,
        droppedReasons,
      };
      withoutChain++;
      continue;
    }

    const status = droppedReasons.length === 0
      ? OPTIONS_STATUS.CHAIN_AVAILABLE
      : OPTIONS_STATUS.PARTIAL;

    optionsDataBySymbol[symbol] = {
      chain,
      asOf: now,
      status,
      droppedReasons,
    };
    withChain++;
  }

  return {
    optionsDataBySymbol,
    metadata: {
      totalUnderlyings: Object.keys(snapshotsBySymbol).length,
      withChain,
      withoutChain,
      totalContracts,
      totalDropped,
    },
  };
}

// --------------------------------------------------
// OPTIONAL HTTP FETCHER (DI)
// --------------------------------------------------

/**
 * Fetch options snapshots for a list of underlyings via an injected fetcher.
 * Network failures result in a STRUCTURED ABSENCE per symbol — never throw.
 *
 * @param {object} args
 * @param {string[]} args.symbols
 * @param {(path: string) => Promise<object>} args.fetcher
 * @param {number} [args.now]
 * @param {("put"|"call")[]} [args.contractTypes]
 * @returns {Promise<ReturnType<typeof buildOptionsDataFromPolygon>>}
 */
export async function fetchOptionsChains(args = {}) {
  const { symbols = [], fetcher, now, contractTypes } = args;
  if (typeof fetcher !== "function" || symbols.length === 0) {
    return buildOptionsDataFromPolygon({ snapshotsBySymbol: {}, now, contractTypes });
  }

  const snapshotsBySymbol = {};
  for (const rawSym of symbols) {
    const symbol = String(rawSym || "").toUpperCase().trim();
    if (!symbol) continue;
    try {
      const payload = await fetcher(`/v3/snapshot/options/${encodeURIComponent(symbol)}`);
      snapshotsBySymbol[symbol] = payload || {};
    } catch {
      // Per-symbol failure becomes a structured absence — adapter does not throw.
      snapshotsBySymbol[symbol] = {};
    }
  }
  return buildOptionsDataFromPolygon({ snapshotsBySymbol, now, contractTypes });
}
