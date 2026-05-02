// =====================================================
// NORMALIZE OPTION CHAIN (Phase 4.5C+2 — v3)
// =====================================================
// Pure helpers that turn provider-specific option-chain
// rows into the app-wide NormalizedOptionRow shape.
//
// Hard rules:
//   - PURE functions. Same input → same output.
//   - WHITELIST output. Provider-specific extra fields are
//     dropped at this boundary, not later.
//   - NEVER throws on malformed input. Returns null when
//     the row cannot be safely normalized.
//   - DOES NOT log secrets, tokens, or raw API keys.
//   - ThetaData v3 scaling rules baked in:
//       strike     dollars (e.g. 140.00 — NO division by 1000;
//                  v3 strikes ship in dollars, unlike legacy v2 millicents)
//       expiration "YYYYMMDD" → "YYYY-MM-DD"
//       right      "call"/"put"  (legacy "C"/"P" still tolerated)
//       mid        (bid+ask)/2 when both present;
//                  null when missing unless `last` is valid.
// =====================================================

import { PROVIDER_NAME, SNAPSHOT_STATUS } from "./optionsProviderTypes.js";

// --------------------------------------------------
// SAFE NUMBER HELPERS
// --------------------------------------------------

function safeNum(n) {
  // Reject null/undefined explicitly — Number(null) === 0 would otherwise
  // sneak through and produce confusing mid prices when bid is missing.
  if (n == null) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function safePositive(n) {
  const v = safeNum(n);
  return v != null && v > 0 ? v : null;
}

function safeNonNegative(n) {
  const v = safeNum(n);
  return v != null && v >= 0 ? v : null;
}

function safeRound(n, digits = 4) {
  const v = safeNum(n);
  if (v == null) return null;
  const factor = Math.pow(10, digits);
  return Math.round(v * factor) / factor;
}

// --------------------------------------------------
// FIELD NORMALIZERS — exported for direct testing
// --------------------------------------------------

/**
 * ThetaData v3 strike normalization: dollars in, dollars out.
 *
 * v3 ships strike values in dollars (140.00, 147.50, etc.) — NOT in
 * legacy v2 millicents (140000, 147500). Phase 4.5C+2 dropped the
 * `/ 1000` scaling that the v2 adapter performed; passing a v2-shaped
 * integer here would silently produce a 1000×-too-large strike. Callers
 * that have a v2-shaped value must convert before calling.
 *
 *   140    → 140.00
 *   147.5  → 147.50
 *
 * @param {number|string} raw
 * @returns {number|null}
 */
export function normalizeStrike(raw) {
  const n = safeNum(raw);
  if (n == null || n <= 0) return null;
  return safeRound(n, 4);
}

/**
 * Expiration normalization. Accepts "YYYYMMDD", "YYYY-MM-DD", or
 * a Date-parsable string. Returns "YYYY-MM-DD" or null.
 *
 * @param {string|number} raw
 * @returns {string|null}
 */
export function normalizeExpiration(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // YYYYMMDD
  const m1 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;

  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

  // Purely-numeric strings that don't match the canonical formats are
  // rejected — Date.parse() will otherwise accept e.g. "20260" as a
  // year, which is meaningless as an option expiration.
  if (/^\d+$/.test(s)) return null;

  // ISO or Date.parse-able fallback (must produce a sane year).
  const t = Date.parse(s);
  if (Number.isFinite(t)) {
    const d = new Date(t);
    const yyyy = d.getUTCFullYear();
    if (yyyy < 1900 || yyyy > 2100) return null;
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/**
 * Right normalization. ThetaData uses "C"/"P".
 * Also accepts already-normalized "call"/"put".
 *
 * @param {string} raw
 * @returns {"call"|"put"|null}
 */
export function normalizeRight(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  if (s === "C" || s === "CALL") return "call";
  if (s === "P" || s === "PUT") return "put";
  return null;
}

/**
 * Mid calculation per spec:
 *   - When both bid and ask are present and ask >= bid: (bid+ask)/2
 *   - Else when `last` is a valid positive number: use last as reference
 *   - Else null
 *
 * @param {object} args
 * @param {number|null} args.bid
 * @param {number|null} args.ask
 * @param {number|null} [args.last]
 * @returns {number|null}
 */
export function computeMid({ bid, ask, last }) {
  const b = safeNonNegative(bid);
  const a = safeNonNegative(ask);
  if (b != null && a != null && a >= b) {
    return safeRound((b + a) / 2, 4);
  }
  const l = safePositive(last);
  if (l != null) return safeRound(l, 4);
  return null;
}

// --------------------------------------------------
// FULL ROW NORMALIZATION
// --------------------------------------------------

/**
 * Normalize a single ThetaData (or compatible) row into a
 * NormalizedOptionRow. Returns null when essential fields are
 * missing or malformed.
 *
 * Accepts EITHER:
 *   - an object-shape row with named fields (test-friendly), OR
 *   - a ThetaData snapshot response with `header` + `response[0]`
 *     positional layout. Caller is responsible for picking the
 *     right shape; this helper covers the object shape directly.
 *
 * @param {object} row
 * @param {object} [hints]                          symbol/expiration/strike/right hints from caller
 * @param {string} [hints.symbol]
 * @param {string} [hints.expiration]
 * @param {number} [hints.strike]
 * @param {string} [hints.right]
 * @param {number} [hints.now]                       epoch ms for staleness check
 * @param {number} [hints.staleAfterMs]
 * @returns {import("./optionsProviderTypes.js").NormalizedOptionRow|null}
 */
export function normalizeRow(row, hints = {}) {
  if (!row || typeof row !== "object") return null;

  // Accept several common field names. Prefer hints when present.
  const symbol = String(hints.symbol || row.symbol || row.root || row.underlying || "").toUpperCase();
  if (!symbol) return null;

  const expiration = normalizeExpiration(hints.expiration || row.expiration || row.exp);
  if (!expiration) return null;

  // Strike: prefer hint (already in dollars). Otherwise scale raw.
  const strikeFromHint = safePositive(hints.strike);
  const strike = strikeFromHint != null ? safeRound(strikeFromHint, 4) : normalizeStrike(row.strike);
  if (strike == null) return null;

  const type = normalizeRight(hints.right || row.right || row.type);
  if (!type) return null;

  const bid = safeNonNegative(row.bid);
  const ask = safeNonNegative(row.ask);
  const last = safePositive(row.last);
  const mid = computeMid({ bid, ask, last });

  // If both bid and ask are missing AND no last, we still emit the row
  // with status "unavailable" rather than dropping it — caller decides.
  const hasUsableQuote = bid != null || ask != null || last != null;

  const lastUpdatedRaw = row.lastUpdated ?? row.last_updated ?? row.ts ?? row.timestamp ?? null;
  const lastUpdated = safeNum(lastUpdatedRaw);

  // Staleness — when caller provides `now` and `staleAfterMs`.
  let status = SNAPSHOT_STATUS.LIVE;
  if (!hasUsableQuote) {
    status = SNAPSHOT_STATUS.UNAVAILABLE;
  } else if (Number.isFinite(Number(hints.now))
             && Number.isFinite(Number(hints.staleAfterMs))
             && lastUpdated != null
             && lastUpdated > 1e10) {                 // looks like epoch ms (not ms-since-midnight)
    if (Number(hints.now) - lastUpdated > Number(hints.staleAfterMs)) {
      status = SNAPSHOT_STATUS.STALE;
    }
  }

  // Whitelist construction. Anything else on `row` (debug, raw IDs,
  // probabilistic internals, undocumented vendor fields) is DROPPED.
  return Object.freeze({
    provider: PROVIDER_NAME.THETADATA,
    status,
    symbol,
    expiration,
    strike,
    type,
    bid,
    ask,
    mid,
    last,
    volume: safeNonNegative(row.volume),
    openInterest: safeNonNegative(row.open_interest ?? row.openInterest ?? row.oi),
    iv: safeNum(row.iv ?? row.implied_volatility),
    delta: safeNum(row.delta),
    theta: safeNum(row.theta),
    gamma: safeNum(row.gamma),
    vega: safeNum(row.vega),
    lastUpdated,
    rawStatus: typeof row.rawStatus === "string" ? row.rawStatus
              : (typeof row.error_type === "string" ? row.error_type : null),
  });
}

/**
 * Normalize an array of rows. Drops malformed entries silently
 * (counts can be derived by length comparison if needed).
 *
 * @param {object[]} rows
 * @param {object} [hints]
 * @returns {import("./optionsProviderTypes.js").NormalizedOptionRow[]}
 */
export function normalizeChain(rows, hints) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    const n = normalizeRow(r, hints);
    if (n) out.push(n);
  }
  return out;
}

// --------------------------------------------------
// THETADATA POSITIONAL RESPONSE PARSER
// --------------------------------------------------

/**
 * ThetaData v3 snapshot JSON parser.
 *
 * Phase 4.5C+2: v3 endpoints accept `format=json` and respond with named-
 * field rows. The exact shape varies slightly between endpoints, so this
 * parser is intentionally tolerant — it accepts any of:
 *
 *   { response: [{ bid: 1.50, ask: 1.55, ... }] }      // canonical
 *   { response: { bid: 1.50, ask: 1.55, ... } }        // single-row object
 *   [{ bid: 1.50, ask: 1.55, ... }]                    // array directly
 *   { bid: 1.50, ask: 1.55, ... }                      // bare object
 *
 * Returns a normalized field-object for `normalizeRow` to consume, or
 * null on shape mismatch / empty result. Never throws.
 *
 * @param {object|Array} payload
 * @returns {object|null}
 */
export function parseThetaDataV3SnapshotPayload(payload) {
  if (payload == null) return null;

  let row = null;
  if (Array.isArray(payload)) {
    row = payload[0];
  } else if (typeof payload === "object") {
    if (Array.isArray(payload.response)) row = payload.response[0];
    else if (payload.response && typeof payload.response === "object") row = payload.response;
    else row = payload;
  }
  if (!row || typeof row !== "object") return null;

  // v3 contract+data wrapper (verified live against Terminal v3 on 2026-05-02):
  //   {
  //     "response": [{
  //       "contract": { symbol, expiration, strike, right },
  //       "data":     [{ bid, ask, last, volume, ... }]
  //     }]
  //   }
  // The actual quote fields live one level deeper at row.data[0].
  // Detect and unwrap so the same shape works for the simpler {bid, ask}
  // forms below.
  if (Array.isArray(row.data) && row.data.length > 0
      && typeof row.data[0] === "object"
      && row.contract && typeof row.contract === "object") {
    row = row.data[0];
  }

  // v3 ships named fields, but defend against the legacy positional
  // shape just in case Terminal still emits it for some endpoints. If
  // header.format is present and row is array-like, fall through to
  // the legacy parser.
  if (Array.isArray(row) && payload && payload.header) {
    return parseThetaDataSnapshotPayload(payload);
  }

  return {
    bid: row.bid ?? row.bid_price,
    ask: row.ask ?? row.ask_price,
    last: row.last ?? row.last_price,
    volume: row.volume,
    open_interest: row.open_interest ?? row.openInterest ?? row.oi,
    iv: row.iv ?? row.implied_volatility,
    delta: row.delta,
    theta: row.theta,
    gamma: row.gamma,
    vega: row.vega,
    lastUpdated: row.ms_of_day ?? row.timestamp ?? row.date ?? row.lastUpdated,
    error_type: row.error_type ?? payload?.header?.error_type ?? null,
  };
}

/**
 * Legacy ThetaData v2 positional parser. Kept for the v3 fallback path
 * when Terminal occasionally returns a positional shape from a
 * `format=json` request. NOT exposed as the active path; v3 callers
 * must go through `parseThetaDataV3SnapshotPayload`.
 *
 *   { header: { format: ["bid_size","bid","ask_size","ask",...] },
 *     response: [[ ...numbers... ]] }
 *
 * @param {object} payload
 * @returns {object|null}
 */
export function parseThetaDataSnapshotPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const fmt = payload.header?.format;
  const rows = payload.response;
  if (!Array.isArray(fmt) || !Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  if (!Array.isArray(row)) return null;
  const obj = {};
  for (let i = 0; i < fmt.length && i < row.length; i++) {
    obj[String(fmt[i])] = row[i];
  }
  // Map common ThetaData column names to the names normalizeRow expects.
  return {
    bid: obj.bid ?? obj.bid_price,
    ask: obj.ask ?? obj.ask_price,
    last: obj.last,
    volume: obj.volume,
    open_interest: obj.open_interest ?? obj.openInterest,
    iv: obj.iv ?? obj.implied_volatility,
    delta: obj.delta,
    theta: obj.theta,
    gamma: obj.gamma,
    vega: obj.vega,
    lastUpdated: obj.ms_of_day ?? obj.timestamp ?? obj.date,
    error_type: payload.header?.error_type,
  };
}
