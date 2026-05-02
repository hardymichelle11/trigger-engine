// =====================================================
// TRADE CONSTRUCTION CONTEXT (Phase 4.5B)
// =====================================================
// Pure helper that projects safe execution-context fields
// for the currently selected ticker into a whitelisted
// object. The Trade Construction section in the Lethal
// Board's Detail panel reads this object and renders.
//
// Hard rules:
//   - PURE function. Same input → same output.
//   - WHITELIST only. Any extra field on the candidate or
//     on the optionChainSnapshot is dropped — even if a
//     scoreBreakdown / probability / IV internal sneaks in.
//   - Returns null when no usable context exists. Never
//     throws on missing data.
//   - DOES NOT claim live premium unless the optionChainSnapshot
//     explicitly carries a chain-derived live row. Phase 4.5B
//     never sets premiumSource = "live"; that capability
//     lights up in Phase 4.5C when ThetaData is wired.
//   - DOES NOT infer fake values. Missing field → null in
//     the output; the UI renders "—".
// =====================================================

const SHORT_PUT_MULT = 100;

const PREMIUM_SOURCE = Object.freeze({
  LIVE: "live",
  ESTIMATED: "estimated",
  UNAVAILABLE: "unavailable",
});

const VERIFY_WARNING = "Verify broker option chain before entry";

// --------------------------------------------------
// FIELD READERS — defensive, tolerate missing/typed values
// --------------------------------------------------

function safeNum(n) {
  // Reject null/undefined explicitly — Number(null) === 0 would otherwise
  // mask "missing" fields as zero values.
  if (n == null) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function safePositive(n) {
  const v = safeNum(n);
  return v != null && v > 0 ? v : null;
}

function safeRound(n, digits = 2) {
  const v = safeNum(n);
  if (v == null) return null;
  const factor = Math.pow(10, digits);
  return Math.round(v * factor) / factor;
}

function safeStr(s) {
  return typeof s === "string" && s.length > 0 ? s : null;
}

// --------------------------------------------------
// CANDIDATE LOOKUP
// --------------------------------------------------

function findCandidate(scanResult, symbol) {
  if (!scanResult || typeof scanResult !== "object") return null;
  if (!symbol) return null;
  const upper = String(symbol).toUpperCase();
  const candidates = Array.isArray(scanResult.candidates) ? scanResult.candidates : [];
  return candidates.find(c => String(c?.symbol || "").toUpperCase() === upper) || null;
}

// --------------------------------------------------
// PREMIUM SOURCE RESOLUTION
// --------------------------------------------------

/**
 * Resolve premiumSource honoring the strict ordering:
 *   1. optionChainSnapshot with a live, valid row → "live"
 *   2. candidate.premiumEstimate.method in (chain_based, iv_estimated, atr_estimated) → "estimated"
 *   3. otherwise → "unavailable"
 *
 * Phase 4.5B will never set "live" because no caller passes a live snapshot
 * yet. The branch exists so Phase 4.5C can light it up via ThetaData without
 * touching this helper's safety guarantees.
 */
function resolvePremiumSource(candidate, snapshot) {
  if (snapshot && typeof snapshot === "object"
      && snapshot.status === "live"
      && (safePositive(snapshot.bid) != null || safePositive(snapshot.ask) != null)) {
    return PREMIUM_SOURCE.LIVE;
  }
  const method = candidate?.premiumEstimate?.method;
  if (method === "chain_based" || method === "iv_estimated" || method === "atr_estimated") {
    return PREMIUM_SOURCE.ESTIMATED;
  }
  return PREMIUM_SOURCE.UNAVAILABLE;
}

// --------------------------------------------------
// CHART CONTEXT EXTRACTION (whitelist only)
// --------------------------------------------------

function extractChartLevels(chartContextBySymbol, symbol) {
  if (!chartContextBySymbol || typeof chartContextBySymbol !== "object") {
    return { support: null, r1: null, r2: null };
  }
  const upper = String(symbol).toUpperCase();
  const ctx = chartContextBySymbol[upper] || chartContextBySymbol[symbol];
  if (!ctx || typeof ctx !== "object") {
    return { support: null, r1: null, r2: null };
  }
  return {
    support: safePositive(ctx.support ?? ctx.nearestSupport),
    r1: safePositive(ctx.r1 ?? ctx.nearestResistance),
    r2: safePositive(ctx.r2 ?? ctx.priorHigh),
  };
}

// --------------------------------------------------
// LIVE-CHAIN FIELDS FROM optionChainSnapshot (Phase 4.5C)
// --------------------------------------------------

/**
 * Phase 4.5B never receives a live snapshot, but the helper is shaped so
 * Phase 4.5C can drop in a normalized row from ThetaData. Pulls only the
 * safe fields; any extra metadata is ignored.
 */
function extractLiveChainFields(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return { bid: null, ask: null, mid: null, last: null };
  }
  const bid = safePositive(snapshot.bid);
  const ask = safePositive(snapshot.ask);
  const last = safePositive(snapshot.last);
  let mid = safePositive(snapshot.mid);
  if (mid == null && bid != null && ask != null && ask >= bid) {
    mid = (bid + ask) / 2;
  }
  return { bid, ask, mid: safeRound(mid, 4), last };
}

// --------------------------------------------------
// SPREAD WIDTH WARNING
// --------------------------------------------------

function spreadWidthLabel(bid, ask) {
  if (bid == null || ask == null || ask <= 0) return null;
  const mid = (bid + ask) / 2;
  if (mid <= 0) return null;
  const widthPct = (ask - bid) / mid;
  if (widthPct <= 0.02) return "tight";
  if (widthPct <= 0.05) return "moderate";
  return "wide";
}

function liquidityWarning(bidAskMid, spreadRisk) {
  if (bidAskMid?.bid == null || bidAskMid?.ask == null) {
    if (bidAskMid?.bid == null && bidAskMid?.ask == null) return null;     // both missing → silent
    return "Bid or ask missing — chain liquidity is incomplete";
  }
  const label = spreadWidthLabel(bidAskMid.bid, bidAskMid.ask);
  if (label === "wide") return "Wide bid/ask spread — verify before entry";
  if (spreadRisk === "high") return "High spread risk — verify before entry";
  return null;
}

// --------------------------------------------------
// RESOLVED-EXPIRATION PROJECTION (Phase 4.5C+1)
// --------------------------------------------------

const RESOLVED_EXPIRATION_ISO = /^\d{4}-\d{2}-\d{2}$/;
const RESOLVED_MATCHED_ALLOWED = new Set(["preferred", "fallback"]);

/**
 * Whitelist-only projection of the resolver's output. Drops any
 * provider-shaped extra fields and validates each surface against
 * the documented vocabulary. Tolerates a missing/null input and
 * always returns a flat, frozen-friendly object.
 */
function resolveResolvedExpiration(input) {
  if (!input || typeof input !== "object") {
    return { expiration: null, dte: null, label: null, matched: null, reason: null };
  }
  const isoRaw = typeof input.expiration === "string" ? input.expiration : null;
  const expiration = isoRaw && RESOLVED_EXPIRATION_ISO.test(isoRaw) ? isoRaw : null;
  const dte = expiration != null ? safePositive(input.dte) ?? safeNum(input.dte) : null;
  const matchedRaw = typeof input.matched === "string" ? input.matched : null;
  const matched = matchedRaw && RESOLVED_MATCHED_ALLOWED.has(matchedRaw) ? matchedRaw : null;
  const reason = typeof input.reason === "string" && input.reason.length > 0 ? input.reason : null;
  const label = expiration != null
    ? (dte != null ? `${dte} DTE (${expiration})` : expiration)
    : null;
  return { expiration, dte, label, matched, reason };
}

// --------------------------------------------------
// PUBLIC: buildTradeConstructionContext
// --------------------------------------------------

/**
 * @typedef {object} TradeConstructionContext
 * @property {string} symbol
 * @property {number|null} currentPrice
 * @property {number|null} suggestedStrike
 * @property {number|null} expirationDte                 target DTE from premium estimator (legacy)
 * @property {string|null} expirationLabel               "{N} DTE" target string (legacy)
 * @property {string|null} resolvedExpiration            Phase 4.5C+1: "YYYY-MM-DD" actual chain expiration
 * @property {number|null} resolvedExpirationDte         Phase 4.5C+1: DTE between today and resolvedExpiration
 * @property {string|null} resolvedExpirationLabel       Phase 4.5C+1: "{N} DTE (YYYY-MM-DD)" once resolved
 * @property {string|null} resolvedExpirationMatched     Phase 4.5C+1: "preferred" | "fallback" | null
 * @property {string|null} resolvedExpirationReason      Phase 4.5C+1: diagnostic vocabulary; null on success
 * @property {string} premiumSource                "live" | "estimated" | "unavailable"
 * @property {number|null} estimatedPremium
 * @property {number|null} estimatedCollateral
 * @property {number|null} atr
 * @property {number|null} support
 * @property {number|null} r1
 * @property {number|null} r2
 * @property {number|null} distanceFromPriceToStrike
 * @property {number|null} distanceFromPriceToStrikePct
 * @property {number|null} distanceFromSupportToStrike
 * @property {number|null} distanceFromSupportToStrikePct
 * @property {number|null} atrDistanceFromStrike
 * @property {number|null} bid
 * @property {number|null} ask
 * @property {number|null} mid
 * @property {number|null} last
 * @property {string|null} liquidityGrade           "A+|A|B+|B|C|D|unknown"
 * @property {string|null} spreadRisk               "low|medium|high|unknown"
 * @property {string|null} spreadWidthLabel         "tight|moderate|wide"
 * @property {string|null} liquidityWarning
 * @property {string} verifyWarning
 */

/**
 * Build a safe, whitelisted trade-construction context object for the
 * currently selected ticker.
 *
 * @param {object} args
 * @param {object} args.scanResult                     runMarketDiscoveryScan() output
 * @param {string} args.selectedSymbol
 * @param {Record<string, object>} [args.chartContextBySymbol]   optional chart levels
 * @param {object} [args.optionChainSnapshot]                     optional live snapshot (Phase 4.5C)
 * @param {object} [args.resolvedExpiration]                       Phase 4.5C+1: { expiration, dte, matched, reason }
 * @returns {TradeConstructionContext|null}
 */
export function buildTradeConstructionContext(args = {}) {
  const { scanResult, selectedSymbol, chartContextBySymbol, optionChainSnapshot, resolvedExpiration } = args;
  const candidate = findCandidate(scanResult, selectedSymbol);
  if (!candidate) return null;

  const symbol = String(candidate.symbol || selectedSymbol || "").toUpperCase();

  const currentPrice = safePositive(candidate.price);
  const atr = safePositive(candidate.atr);

  const premiumEstimate = candidate.premiumEstimate && typeof candidate.premiumEstimate === "object"
    ? candidate.premiumEstimate
    : null;

  const suggestedStrike = safePositive(premiumEstimate?.preferredStrike);
  const expirationDte = safePositive(premiumEstimate?.preferredDte);
  const expirationLabel = expirationDte != null ? `${expirationDte} DTE` : null;

  // Phase 4.5C+1: surface the real chain expiration once the resolver has
  // chosen one. Whitelist exactly four fields off the resolver's output.
  const resolved = resolveResolvedExpiration(resolvedExpiration);

  const premiumSource = resolvePremiumSource(candidate, optionChainSnapshot);
  const estimatedPremium = premiumSource === PREMIUM_SOURCE.UNAVAILABLE
    ? null : safeRound(premiumEstimate?.estimatedPremium, 2);
  const estimatedCollateral = safePositive(premiumEstimate?.collateralRequired)
    ?? (suggestedStrike != null ? safeRound(suggestedStrike * SHORT_PUT_MULT, 2) : null);

  const { support, r1, r2 } = extractChartLevels(chartContextBySymbol, symbol);

  const distanceFromPriceToStrike = (currentPrice != null && suggestedStrike != null)
    ? safeRound(currentPrice - suggestedStrike, 4) : null;
  const distanceFromPriceToStrikePct = (currentPrice != null && suggestedStrike != null && currentPrice > 0)
    ? safeRound(((currentPrice - suggestedStrike) / currentPrice) * 100, 2) : null;

  const distanceFromSupportToStrike = (support != null && suggestedStrike != null)
    ? safeRound(support - suggestedStrike, 4) : null;
  const distanceFromSupportToStrikePct = (support != null && suggestedStrike != null && support > 0)
    ? safeRound(((support - suggestedStrike) / support) * 100, 2) : null;

  const atrDistanceFromStrike = (atr != null && atr > 0
                                 && currentPrice != null && suggestedStrike != null)
    ? safeRound(Math.abs(currentPrice - suggestedStrike) / atr, 2) : null;

  const liveFields = extractLiveChainFields(optionChainSnapshot);

  const liquidityGrade = safeStr(premiumEstimate?.liquidityGrade) || "unknown";
  const spreadRisk = safeStr(premiumEstimate?.spreadRisk) || "unknown";
  const widthLabel = spreadWidthLabel(liveFields.bid, liveFields.ask);
  const liqWarn = liquidityWarning(liveFields, spreadRisk);

  // Whitelist construction — any unexpected field on candidate or snapshot
  // is dropped here. This is the safety boundary.
  return Object.freeze({
    symbol,
    currentPrice,
    suggestedStrike,
    expirationDte,
    expirationLabel,
    resolvedExpiration: resolved.expiration,
    resolvedExpirationDte: resolved.dte,
    resolvedExpirationLabel: resolved.label,
    resolvedExpirationMatched: resolved.matched,
    resolvedExpirationReason: resolved.reason,
    premiumSource,
    estimatedPremium,
    estimatedCollateral,
    atr,
    support,
    r1,
    r2,
    distanceFromPriceToStrike,
    distanceFromPriceToStrikePct,
    distanceFromSupportToStrike,
    distanceFromSupportToStrikePct,
    atrDistanceFromStrike,
    bid: liveFields.bid,
    ask: liveFields.ask,
    mid: liveFields.mid,
    last: liveFields.last,
    liquidityGrade,
    spreadRisk,
    spreadWidthLabel: widthLabel,
    liquidityWarning: liqWarn,
    verifyWarning: VERIFY_WARNING,
  });
}

export const TRADE_CONSTRUCTION_PREMIUM_SOURCE = PREMIUM_SOURCE;
export const TRADE_CONSTRUCTION_VERIFY_WARNING = VERIFY_WARNING;
