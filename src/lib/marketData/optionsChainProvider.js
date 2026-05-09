// =====================================================================
// Polygon options-chain provider — normalized contract fetcher
// =====================================================================
// Routes through the existing buildPolygonUrl proxy and returns a
// normalized chain so the ad-hoc Credit View path can run without
// requiring the symbol to be in the static catalog.
//
// Hard rules:
//   - PURE network helper. No state, no React.
//   - Tolerant: returns { contracts: [], warnings: [...] } on every
//     failure, never throws.
//   - Normalized contracts always carry strike/expiration/type when
//     available; Greeks may be null and consumers must degrade gracefully.
// =====================================================================

import { buildPolygonUrl } from "../polygonProxy.js";

const ASOF_MS_DEFAULT = () => Date.now();

/**
 * @typedef {Object} OptionContract
 * @property {string|null} symbol
 * @property {string|null} underlyingSymbol
 * @property {string|null} expiration              ISO yyyy-mm-dd
 * @property {number|null} strike
 * @property {"put"|"call"|null} type
 * @property {number|null} bid
 * @property {number|null} ask
 * @property {number|null} mid                     (bid+ask)/2 when both present
 * @property {number|null} last
 * @property {number|null} volume
 * @property {number|null} openInterest
 * @property {number|null} impliedVolatility       0–1 decimal
 * @property {number|null} delta
 * @property {number|null} gamma
 * @property {number|null} theta
 * @property {number|null} vega
 * @property {boolean} inTheMoney
 */

/**
 * @typedef {Object} OptionsChainResult
 * @property {string} underlyingSymbol
 * @property {OptionContract[]} contracts
 * @property {string} provider                     "polygon"
 * @property {number|null} asOf
 * @property {string[]} warnings
 */

/**
 * Fetch a normalized options chain for a single underlying.
 *
 * @param {string} symbol
 * @param {object} [opts]
 * @param {number} [opts.expirationRangeDays=45]
 * @param {"put"|"call"|"both"} [opts.optionType="put"]
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.timeoutMs=10000]
 * @returns {Promise<OptionsChainResult>}
 */
export async function getOptionsChain(symbol, opts = {}) {
  const sym = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
  const result = {
    underlyingSymbol: sym || (typeof symbol === "string" ? symbol : ""),
    contracts: [],
    provider: "polygon",
    asOf: null,
    warnings: [],
  };

  if (!sym) {
    result.warnings.push("invalid_symbol");
    return result;
  }

  const expirationRangeDays = Number.isFinite(opts.expirationRangeDays) && opts.expirationRangeDays > 0
    ? Math.floor(opts.expirationRangeDays)
    : 45;
  const optionType = opts.optionType === "call" || opts.optionType === "both"
    ? opts.optionType
    : "put";
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 10000;
  const signal = opts.signal ?? safeTimeoutSignal(timeoutMs);

  const today = new Date();
  const maxExp = new Date(today.getTime() + expirationRangeDays * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const params = {
    "expiration_date.gte": fmt(today),
    "expiration_date.lte": fmt(maxExp),
    limit: "250",
  };
  if (optionType !== "both") {
    params.contract_type = optionType;
  }

  try {
    const url = await buildPolygonUrl(`/v3/snapshot/options/${encodeURIComponent(sym)}`, params);
    const r = await fetch(url, { signal });
    if (!r.ok) {
      result.warnings.push(`polygon_${r.status}`);
      return result;
    }
    const json = await r.json();
    const raw = Array.isArray(json?.results) ? json.results : [];
    for (const item of raw) {
      const c = normalizeContract(item, sym);
      if (c) result.contracts.push(c);
    }
    result.asOf = ASOF_MS_DEFAULT();
    if (result.contracts.length === 0) {
      result.warnings.push("empty_chain");
    }
    return result;
  } catch (err) {
    result.warnings.push(err?.name === "AbortError" ? "timeout" : "fetch_failed");
    return result;
  }
}

/**
 * Normalize a single Polygon snapshot/options/{underlying} result row.
 * Exported for tests + future replay/fixture paths.
 */
export function normalizeContract(raw, fallbackUnderlying = null) {
  if (!raw || !raw.details) return null;
  const d = raw.details;
  const q = raw.last_quote || {};
  const t = raw.last_trade || {};
  const g = raw.greeks || {};

  const bid = numeric(q.bid);
  const ask = numeric(q.ask);
  const mid = (bid != null && ask != null && ask >= bid)
    ? (bid + ask) / 2
    : numeric(q.midpoint);

  const type = typeof d.contract_type === "string"
    ? d.contract_type.toLowerCase()
    : null;
  if (type !== "put" && type !== "call") return null;

  return {
    symbol:           d.ticker || null,
    underlyingSymbol: d.underlying_ticker || fallbackUnderlying,
    expiration:       d.expiration_date || null,
    strike:           numeric(d.strike_price),
    type,
    bid, ask, mid,
    last:             numeric(t.price),
    volume:           numeric(raw.day?.volume),
    openInterest:     numeric(raw.open_interest),
    impliedVolatility: numeric(raw.implied_volatility),
    delta:            numeric(g.delta),
    gamma:            numeric(g.gamma),
    theta:            numeric(g.theta),
    vega:             numeric(g.vega),
    inTheMoney:       !!raw.in_the_money,
  };
}

// ---------------------------------------------------------------------
// Helpers — exported so the simulation service + tests share them.
// ---------------------------------------------------------------------

/**
 * Classify the bid/ask spread of a single contract.
 *
 *   excellent  ≤ 8% of mid
 *   acceptable ≤ 15%
 *   wide       ≤ 50%
 *   unusable   no bid / no ask / spread > 50%
 */
export function classifyContractSpread(bid, ask, mid) {
  const b = numeric(bid), a = numeric(ask), m = numeric(mid);
  if (b == null || a == null || a <= 0) return "unusable";
  const usableMid = m != null && m > 0 ? m : (a + b) / 2;
  if (usableMid <= 0) return "unusable";
  const pct = (a - b) / usableMid;
  if (!Number.isFinite(pct) || pct < 0) return "unusable";
  if (pct <= 0.08) return "excellent";
  if (pct <= 0.15) return "acceptable";
  if (pct <= 0.50) return "wide";
  return "unusable";
}

/**
 * Map the spread classification to the letter-grade vocabulary the
 * Credit View narrative builder already understands.
 */
export function spreadGradeFromClass(klass) {
  switch (klass) {
    case "excellent":  return "A+";
    case "acceptable": return "B";
    case "wide":       return "C";
    case "unusable":   return "F";
    default:           return "—";
  }
}

/**
 * Pick a candidate put contract for the ad-hoc Credit View. Prefers
 * strikes at or below the support level; falls back to 3-10% below
 * the current underlying price; prefers liquid contracts (bid+ask
 * present); breaks ties by shortest viable DTE then closest-to-support
 * strike.
 *
 * @param {OptionContract[]} contracts
 * @param {object} ctx
 * @param {number|null} ctx.underlyingPrice
 * @param {number|null} ctx.supportLevel
 * @param {number} [ctx.minDte=7]
 * @param {number} [ctx.maxDte=45]
 * @returns {OptionContract|null}
 */
export function pickCandidatePut(contracts, ctx = {}) {
  if (!Array.isArray(contracts) || contracts.length === 0) return null;
  const { underlyingPrice, supportLevel, minDte = 7, maxDte = 45 } = ctx;

  // Filter to puts with a strike + DTE in range.
  const today = todayMs();
  const dteOf = (iso) => isoToDte(iso, today);

  let pool = contracts.filter((c) =>
    c && c.type === "put" &&
    Number.isFinite(c.strike) &&
    Number.isFinite(dteOf(c.expiration)) &&
    dteOf(c.expiration) >= minDte &&
    dteOf(c.expiration) <= maxDte,
  );
  if (pool.length === 0) {
    // Fallback: any put with a strike (DTE filter dropped).
    pool = contracts.filter((c) => c && c.type === "put" && Number.isFinite(c.strike));
  }
  if (pool.length === 0) return null;

  // Liquidity preference — but never reject all if nothing has a quote.
  const liquid = pool.filter((c) => Number.isFinite(c.bid) && Number.isFinite(c.ask) && c.ask > c.bid);
  const usable = liquid.length > 0 ? liquid : pool;

  // Strike-zone window.
  const ceiling = Number.isFinite(supportLevel)
    ? supportLevel
    : Number.isFinite(underlyingPrice) ? underlyingPrice * 0.97 : null; // 3% below
  const floor = Number.isFinite(underlyingPrice)
    ? underlyingPrice * 0.90                                              // 10% below
    : null;

  let zoned = usable.filter((c) =>
    (ceiling == null || c.strike <= ceiling) &&
    (floor == null  || c.strike >= floor),
  );
  if (zoned.length === 0) zoned = usable;

  // Sort: shortest viable DTE first, then strike closest to ceiling
  // (so we don't drift too deep OTM).
  zoned.sort((a, b) => {
    const da = dteOf(a.expiration);
    const db = dteOf(b.expiration);
    if (da !== db) return da - db;
    if (ceiling != null) {
      const distA = Math.abs(ceiling - a.strike);
      const distB = Math.abs(ceiling - b.strike);
      return distA - distB;
    }
    return b.strike - a.strike;
  });

  return zoned[0] || null;
}

/**
 * Given a chosen primary put, pick the next-lower strike at the same
 * expiration (used for the "best strike zone" range in the narrative).
 */
export function pickSecondaryPut(contracts, primary) {
  if (!Array.isArray(contracts) || !primary) return null;
  const sameExp = contracts.filter((c) =>
    c && c.type === "put" &&
    c.expiration === primary.expiration &&
    Number.isFinite(c.strike) &&
    c.strike < primary.strike,
  );
  if (sameExp.length === 0) return null;
  sameExp.sort((a, b) => b.strike - a.strike);   // closest-below first
  return sameExp[0];
}

// ---------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------

function numeric(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function todayMs() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function isoToDte(iso, refMs) {
  if (!iso || typeof iso !== "string") return NaN;
  const ms = Date.parse(iso + "T00:00:00Z");
  if (!Number.isFinite(ms)) return NaN;
  return Math.round((ms - refMs) / (24 * 60 * 60 * 1000));
}

function safeTimeoutSignal(ms) {
  try {
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      return AbortSignal.timeout(ms);
    }
  } catch { /* fall through */ }
  return undefined;
}
