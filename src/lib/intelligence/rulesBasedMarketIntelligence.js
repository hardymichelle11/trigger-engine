// =====================================================================
// Rules-Based Market Intelligence
// =====================================================================
// Fallback path that runs when the LLM provider is unavailable. PURE:
// keyword-driven thesis-alignment + catalyst-type detection + concise
// trader-facing copy. Always returns a sanitized summary; never throws.
// =====================================================================

import {
  THESIS_ALIGNMENT,
  CATALYST_TYPE,
  ROUTE_RECOMMENDATION,
  CONFIDENCE_LABEL,
  makeSummary,
} from "./newsIntelligenceTypes.js";

// ---------------------------------------------------------------------
// Keyword dictionaries
// ---------------------------------------------------------------------

const SUPPORTIVE_KEYWORDS = [
  "partnership", "contract", "customer", "growth", "ai", "data center",
  "backlog", "adoption", "guidance raised", "revenue acceleration",
  "multiyear agreement", "expand", "expansion", "wins", "selected",
  "upgrade", "buy rating", "beats",
];

const NEGATIVE_KEYWORDS = [
  "downgrade", "lawsuit", "miss", "guidance cut", "delay",
  "regulatory", "margin pressure", "debt", "investigation",
  "customer concentration", "halt", "fraud", "subpoena", "warning",
  "loss", "recall", "impairment",
];

// Catalyst keyword groups — first hit wins so order matters.
const CATALYST_KEYWORDS = [
  { type: CATALYST_TYPE.EARNINGS,          keys: ["earnings", "quarterly", "guidance", "beat", "miss", "eps"] },
  { type: CATALYST_TYPE.PARTNERSHIP,       keys: ["partnership", "joint venture", "agreement"] },
  { type: CATALYST_TYPE.CUSTOMER_ADOPTION, keys: ["customer", "deployment", "adoption", "selected", "deal"] },
  { type: CATALYST_TYPE.PRODUCT,           keys: ["launch", "released", "product", "platform", "unveil"] },
  { type: CATALYST_TYPE.REGULATORY,        keys: ["regulator", "regulatory", "ruling", "fda", "ftc", "antitrust"] },
  { type: CATALYST_TYPE.CAPITAL_MARKETS,   keys: ["offering", "buyback", "dividend", "ipo", "acquisition", "merger"] },
  { type: CATALYST_TYPE.MACRO,             keys: ["fed", "inflation", "cpi", "rates", "macro", "recession"] },
  { type: CATALYST_TYPE.SECTOR_ROTATION,   keys: ["sector", "rotation", "leadership", "theme"] },
];

// ---------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------

/**
 * @param {object} input
 * @param {string} [input.symbol]
 * @param {object|null} [input.basketProfile]
 * @param {Array<object>} [input.articles]
 * @returns {object}  sanitized MarketIntelligenceSummary
 */
export function buildRulesSummary(input = {}) {
  const symbol = typeof input.symbol === "string" ? input.symbol.toUpperCase() : null;
  const basketLayer = input.basketProfile?.label || input.basketProfile?.name || null;
  const articles = Array.isArray(input.articles) ? input.articles : [];

  // Empty news → unavailable.
  if (articles.length === 0) {
    return makeSummary({
      symbol,
      basketLayer,
      thesisAlignment:     THESIS_ALIGNMENT.UNAVAILABLE,
      macroRead:           null,
      businessRead:        null,
      newsRead:            "No news articles available.",
      catalystType:        CATALYST_TYPE.NONE,
      signalImpact:        null,
      riskContradictions:  [],
      routeRecommendation: ROUTE_RECOMMENDATION.MONITOR,
      confidenceLabel:     CONFIDENCE_LABEL.UNAVAILABLE,
      actionSummary:       "Insufficient news evidence — monitor for new headlines.",
      articlesUsed:        [],
      warnings:            ["LLM unavailable — using rules-based news interpretation."],
    });
  }

  const corpus = articles
    .map((a) => `${a?.title || ""} ${a?.summary || ""}`)
    .join(" ")
    .toLowerCase();

  const supportiveHits = SUPPORTIVE_KEYWORDS.filter((k) => corpus.includes(k.toLowerCase()));
  const negativeHits   = NEGATIVE_KEYWORDS.filter((k) => corpus.includes(k.toLowerCase()));

  const { alignment, route, confidence, action } = pickAlignmentAndRoute(supportiveHits, negativeHits);
  const catalyst = detectCatalyst(corpus);

  const newsRead = composeNewsRead(articles);
  const businessRead = composeBusinessRead(supportiveHits, negativeHits);
  const macroRead = catalyst === CATALYST_TYPE.MACRO
    ? "Macro / regime headlines present — confirm against the macro regime read."
    : null;

  const riskContradictions = negativeHits.length > 0 && supportiveHits.length > 0
    ? [
        "Mixed news flow — both supportive and negative items present.",
        "Sentiment may shift quickly until catalyst resolves.",
      ]
    : negativeHits.length > 0
      ? ["Negative headlines outweigh supportive flow — avoid new exposure until cleared."]
      : [];

  return makeSummary({
    symbol,
    basketLayer,
    thesisAlignment:     alignment,
    macroRead,
    businessRead,
    newsRead,
    catalystType:        catalyst,
    signalImpact:        action,
    riskContradictions,
    routeRecommendation: route,
    confidenceLabel:     confidence,
    actionSummary:       action,
    articlesUsed:        articles.slice(0, 5).map(projectArticleUsed),
    warnings:            ["LLM unavailable — using rules-based news interpretation."],
  });
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function pickAlignmentAndRoute(supportiveHits, negativeHits) {
  const supportive = supportiveHits.length > 0;
  const negative   = negativeHits.length > 0;

  if (supportive && negative) {
    return {
      alignment:  THESIS_ALIGNMENT.MIXED,
      route:      ROUTE_RECOMMENDATION.MONITOR,
      confidence: CONFIDENCE_LABEL.LOW,
      action:     "Mixed news — monitor for catalyst resolution before sizing.",
    };
  }
  if (supportive) {
    return {
      alignment:  THESIS_ALIGNMENT.SUPPORTS,
      route:      ROUTE_RECOMMENDATION.SEND_TO_TE,
      confidence: CONFIDENCE_LABEL.MODERATE,
      action:     "Supportive news flow — validate structure before allocating capital.",
    };
  }
  if (negative) {
    return {
      alignment:  THESIS_ALIGNMENT.CONFLICTS,
      route:      ROUTE_RECOMMENDATION.AVOID_FOR_NOW,
      confidence: CONFIDENCE_LABEL.MODERATE,
      action:     "Negative news flow — avoid new exposure until headlines clear.",
    };
  }
  return {
    alignment:  THESIS_ALIGNMENT.NEUTRAL,
    route:      ROUTE_RECOMMENDATION.MONITOR,
    confidence: CONFIDENCE_LABEL.LOW,
    action:     "Neutral news flow — monitor for emerging catalyst.",
  };
}

function detectCatalyst(corpus) {
  for (const group of CATALYST_KEYWORDS) {
    if (group.keys.some((k) => corpus.includes(k))) {
      return group.type;
    }
  }
  return CATALYST_TYPE.SENTIMENT;     // articles existed but no clear catalyst keyword
}

function composeNewsRead(articles) {
  const top = articles.slice(0, 3).map((a) => a?.title).filter(Boolean);
  if (top.length === 0) return "No actionable headlines.";
  return top.join(" · ");
}

function composeBusinessRead(supportive, negative) {
  if (supportive.length > 0 && negative.length > 0) {
    return `Both supportive (${supportive.slice(0, 3).join(", ")}) and concerning (${negative.slice(0, 3).join(", ")}) themes detected.`;
  }
  if (supportive.length > 0) {
    return `Supportive themes detected: ${supportive.slice(0, 3).join(", ")}.`;
  }
  if (negative.length > 0) {
    return `Concerning themes detected: ${negative.slice(0, 3).join(", ")}.`;
  }
  return "No standout supportive or concerning themes in the article flow.";
}

function projectArticleUsed(a) {
  return {
    id: a?.id || null,
    title: a?.title || "",
    source: a?.source || null,
    url: a?.url || null,
    publishedAt: Number.isFinite(a?.publishedAt) ? a.publishedAt : null,
  };
}
