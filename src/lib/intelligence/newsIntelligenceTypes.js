// =====================================================================
// News Intelligence — types + enums + sanitizers
// =====================================================================
// PURE constants + helpers shared across the intelligence pipeline:
//   News Providers → Normalizer → Engine → LLM/Rules → Summary
//
// Hard rules:
//   - No raw scores or weights in the public summary.
//   - Trader-facing labels only.
//   - Every enum value is sanitized; invalid LLM output is coerced to a
//     safe default rather than thrown.
// =====================================================================

export const THESIS_ALIGNMENT = Object.freeze({
  SUPPORTS:    "supports",
  CONFLICTS:   "conflicts",
  MIXED:       "mixed",
  NEUTRAL:     "neutral",
  UNAVAILABLE: "unavailable",
});
const THESIS_VALUES = new Set(Object.values(THESIS_ALIGNMENT));

export const CATALYST_TYPE = Object.freeze({
  MACRO:             "macro",
  EARNINGS:          "earnings",
  PRODUCT:           "product",
  PARTNERSHIP:       "partnership",
  CUSTOMER_ADOPTION: "customer_adoption",
  REGULATORY:        "regulatory",
  CAPITAL_MARKETS:   "capital_markets",
  SECTOR_ROTATION:   "sector_rotation",
  SENTIMENT:         "sentiment",
  NONE:              "none",
});
const CATALYST_VALUES = new Set(Object.values(CATALYST_TYPE));

export const ROUTE_RECOMMENDATION = Object.freeze({
  ADD_TO_BASKET:           "add_to_basket",
  MONITOR:                 "monitor",
  SEND_TO_TE:              "send_to_TE",
  SEND_TO_CV:              "send_to_CV",
  SEND_TO_TE_AND_CV:       "send_to_TE_and_CV",
  PROMOTE_TO_SCANNER:      "promote_to_scanner",
  AVOID_FOR_NOW:           "avoid_for_now",
  THESIS_CONFLICT_DETECTED:"thesis_conflict_detected",
});
const ROUTE_VALUES = new Set(Object.values(ROUTE_RECOMMENDATION));

export const CONFIDENCE_LABEL = Object.freeze({
  HIGH:        "high",
  MODERATE:    "moderate",
  LOW:         "low",
  UNAVAILABLE: "unavailable",
});
const CONFIDENCE_VALUES = new Set(Object.values(CONFIDENCE_LABEL));

export const INTELLIGENCE_MODE = Object.freeze({
  LLM:            "llm",
  RULES_FALLBACK: "rules_fallback",
});

// ---------------------------------------------------------------------
// Normalized article — every provider must produce this shape so the
// downstream engine never has to branch on source-specific quirks.
// ---------------------------------------------------------------------

/**
 * @typedef {Object} NewsArticle
 * @property {string|null} id                   stable id (URL or hashed source/title)
 * @property {string|null} symbol               primary ticker the article is about
 * @property {string} title
 * @property {string} summary
 * @property {string|null} source
 * @property {string|null} url
 * @property {number|null} publishedAt          epoch ms
 * @property {string[]} tickers                 all tickers mentioned
 * @property {string|null} sentimentLabel       provider-supplied label (positive/negative/neutral)
 * @property {number|null} sentimentScore       provider-supplied score (decimal)
 * @property {object|null} raw                  provider-specific raw payload (kept private to the layer)
 */

export function makeArticle(overrides = {}) {
  const base = {
    id: null,
    symbol: null,
    title: "",
    summary: "",
    source: null,
    url: null,
    publishedAt: null,
    tickers: [],
    sentimentLabel: null,
    sentimentScore: null,
    raw: null,
  };
  return { ...base, ...overrides };
}

export function normalizeArticleShape(input, opts = {}) {
  if (!input || typeof input !== "object") return null;
  const symbol = typeof opts.symbol === "string" ? opts.symbol.toUpperCase() : null;

  // Title is the only hard requirement — empty title means we drop the row.
  const title = (typeof input.title === "string" && input.title.trim())
    || (typeof input.headline === "string" && input.headline.trim())
    || "";
  if (!title) return null;

  const summary = stringOrEmpty(input.summary || input.description || input.snippet);
  const source = stringOrNull(input.source || input.publisher?.name || input.publisher);
  const url = stringOrNull(input.url || input.article_url || input.amp_url);
  const publishedAt = parseTime(input.publishedAt ?? input.published_utc ?? input.published_at ?? input.timestamp);
  const tickers = Array.isArray(input.tickers)
    ? input.tickers.map((t) => String(t || "").trim().toUpperCase()).filter(Boolean)
    : symbol ? [symbol] : [];
  const id = stringOrNull(input.id) || url
    || `${source || "src"}::${title}::${publishedAt || ""}`;
  const sentimentLabel = stringOrNull(input.sentimentLabel || input.sentiment);
  const sentimentScore = numericOrNull(input.sentimentScore);

  return makeArticle({
    id, symbol, title, summary, source, url, publishedAt,
    tickers, sentimentLabel, sentimentScore, raw: input,
  });
}

// ---------------------------------------------------------------------
// Market intelligence summary — the final shape consumed by the UI and
// by the Portfolio CIO Manager Assessment Tape.
// ---------------------------------------------------------------------

/**
 * @typedef {Object} MarketIntelligenceSummary
 * @property {string|null} symbol
 * @property {string|null} basketLayer
 * @property {string} thesisAlignment           one of THESIS_ALIGNMENT
 * @property {string|null} macroRead
 * @property {string|null} businessRead
 * @property {string|null} newsRead
 * @property {string} catalystType              one of CATALYST_TYPE
 * @property {string|null} signalImpact         brief trader-facing impact line
 * @property {string[]} riskContradictions
 * @property {string} routeRecommendation       one of ROUTE_RECOMMENDATION
 * @property {string} confidenceLabel           one of CONFIDENCE_LABEL
 * @property {string|null} actionSummary        single sentence
 * @property {Array<{id, title, source, url, publishedAt}>} articlesUsed
 * @property {string[]} warnings
 */

export function makeSummary(overrides = {}) {
  const base = {
    symbol: null,
    basketLayer: null,
    thesisAlignment: THESIS_ALIGNMENT.UNAVAILABLE,
    macroRead: null,
    businessRead: null,
    newsRead: null,
    catalystType: CATALYST_TYPE.NONE,
    signalImpact: null,
    riskContradictions: [],
    routeRecommendation: ROUTE_RECOMMENDATION.MONITOR,
    confidenceLabel: CONFIDENCE_LABEL.UNAVAILABLE,
    actionSummary: null,
    articlesUsed: [],
    warnings: [],
  };
  return { ...base, ...overrides };
}

/**
 * Coerce arbitrary LLM output (or a partial summary) into the canonical
 * sanitized shape. Invalid enum values become safe defaults; numeric or
 * "score"-style fields are NOT echoed back to the UI even if the LLM
 * tried to include them.
 */
export function sanitizeSummary(input, fallback = {}) {
  if (!input || typeof input !== "object") {
    return makeSummary({ symbol: fallback.symbol || null });
  }
  return makeSummary({
    symbol:              fallback.symbol || stringOrNull(input.symbol),
    basketLayer:         stringOrNull(input.basketLayer ?? fallback.basketLayer),
    thesisAlignment:     THESIS_VALUES.has(input.thesisAlignment) ? input.thesisAlignment : THESIS_ALIGNMENT.UNAVAILABLE,
    macroRead:           stringOrNull(input.macroRead),
    businessRead:        stringOrNull(input.businessRead),
    newsRead:            stringOrNull(input.newsRead),
    catalystType:        CATALYST_VALUES.has(input.catalystType) ? input.catalystType : CATALYST_TYPE.NONE,
    signalImpact:        stringOrNull(input.signalImpact),
    riskContradictions:  stringArray(input.riskContradictions),
    routeRecommendation: ROUTE_VALUES.has(input.routeRecommendation) ? input.routeRecommendation : ROUTE_RECOMMENDATION.MONITOR,
    confidenceLabel:     CONFIDENCE_VALUES.has(input.confidenceLabel) ? input.confidenceLabel : CONFIDENCE_LABEL.UNAVAILABLE,
    actionSummary:       stringOrNull(input.actionSummary),
    articlesUsed:        sanitizeArticlesUsed(input.articlesUsed ?? fallback.articlesUsed),
    warnings:            stringArray(input.warnings),
  });
}

function sanitizeArticlesUsed(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const a of arr) {
    if (!a || typeof a !== "object") continue;
    const title = stringOrNull(a.title);
    if (!title) continue;
    out.push({
      id:          stringOrNull(a.id),
      title,
      source:      stringOrNull(a.source),
      url:         stringOrNull(a.url),
      publishedAt: numericOrNull(a.publishedAt),
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function stringOrNull(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length === 0 ? null : t;
  }
  return null;
}
function stringOrEmpty(v) {
  const s = stringOrNull(v);
  return s == null ? "" : s;
}
function stringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.map(stringOrNull).filter((s) => typeof s === "string" && s.length > 0);
}
function numericOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function parseTime(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}
