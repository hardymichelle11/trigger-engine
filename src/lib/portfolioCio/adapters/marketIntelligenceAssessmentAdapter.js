// =====================================================================
// Market Intelligence → Manager Assessment adapter
// =====================================================================
// PURE function that converts a sanitized MarketIntelligenceSummary
// (output of initializeMarketIntelligenceForSymbol) into the input
// shape consumed by buildManagerAssessmentTape() under the existing
// `market_intel` agent slot. (The required-agents registry uses the
// short `market_intel` key — that's the slot the adapter feeds.)
//
// Usage:
//   const a = marketIntelligenceToAssessment({ symbol, marketIntelligenceResult });
//   buildManagerAssessmentTape({ symbol, inputs: { market_intel: a } });
//
// Hard rules:
//   - Trader-facing labels only — never echo raw scores, weights, or
//     coefficients (the upstream sanitizer already drops them; we
//     also avoid accidentally re-introducing any here).
//   - Missing summary returns null — let the tape's missing-input
//     fallback produce the "unavailable" card.
// =====================================================================

// agentId slot the assessment plugs into when handed to the tape. The
// adapter does NOT set agentId on the output (the tape resolves that
// from REQUIRED_AGENTS during normalization), so this constant is
// exported purely as documentation for the host call site.
export const CIO_MARKET_INTELLIGENCE_AGENT_ID = "market_intel";

import {
  STANCE,
  CONFIDENCE,
  RECOMMENDED_ACTION,
  TIME_HORIZON,
} from "../managerAssessmentTypes.js";

const AGENT_NAME = "Market Intelligence Agent";
const AGENT_ROLE = "Interprets news, macro context, business relevance, thesis alignment, and routing implications.";

// MarketIntelligenceSummary thesis enum strings (mirrored from
// newsIntelligenceTypes.js — kept literal here to avoid a cross-module
// dependency on the intelligence package's enum values).
const THESIS_SUPPORTS    = "supports";
const THESIS_CONFLICTS   = "conflicts";
const THESIS_MIXED       = "mixed";
const THESIS_NEUTRAL     = "neutral";
const THESIS_UNAVAILABLE = "unavailable";

const ROUTE_TO_ACTION = Object.freeze({
  send_to_TE:               RECOMMENDED_ACTION.SEND_TO_TE,
  send_to_CV:               RECOMMENDED_ACTION.SEND_TO_CV,
  send_to_TE_and_CV:        RECOMMENDED_ACTION.SEND_TO_TE_AND_CV,
  promote_to_scanner:       RECOMMENDED_ACTION.PROMOTE_TO_SCANNER,
  add_to_basket:            RECOMMENDED_ACTION.ADD_TO_ACTIVE_UNIVERSE,
  monitor:                  RECOMMENDED_ACTION.MONITOR,
  avoid_for_now:            RECOMMENDED_ACTION.AVOID_FOR_NOW,
  thesis_conflict_detected: RECOMMENDED_ACTION.WAIT_FOR_CONFIRMATION,
});

const CONFIDENCE_PASSTHROUGH = new Set(Object.values(CONFIDENCE));

// Warnings that we route to missingEvidence rather than concerns —
// they're operational notes about the intelligence pipeline, not
// market-side caveats.
const WARNING_ROUTES_TO_MISSING_EVIDENCE = [
  /rules.based/i,        // "LLM unavailable — using rules-based news interpretation."
  /provider_.+_failed/i, // "provider_polygon_failed"
  /provider_.+_unavailable/i,
  /llm unavailable/i,
];

/**
 * @param {object} input
 * @param {string} [input.symbol]
 * @param {object|null} input.marketIntelligenceResult — output of
 *   initializeMarketIntelligenceForSymbol()
 * @returns {object|null}  raw assessment shape ready to be placed under
 *   `inputs.market_intelligence` of buildManagerAssessmentTape(); null
 *   when no usable summary is available.
 */
export function marketIntelligenceToAssessment(input = {}) {
  const result = input.marketIntelligenceResult || null;
  if (!result || !result.summary) return null;
  const summary = result.summary;

  const thesis = summary.thesisAlignment;
  const stance = mapStance(thesis);

  // If we have nothing useful, return null and let the tape produce
  // the generic unavailable card. We DO NOT pretend a manager has
  // produced a read when it hasn't.
  if (stance === STANCE.UNAVAILABLE && (!summary.actionSummary && !summary.newsRead)) {
    return null;
  }

  const supporting = composeSupportingEvidence(summary);
  const concerns = composeConcernFlags(summary);
  const missing = composeMissingEvidence(summary, result);
  const action = mapRecommendedAction(summary.routeRecommendation);

  return {
    agentName: AGENT_NAME,
    agentRole: AGENT_ROLE,
    assessmentLabel: composeAssessmentLabel(summary, thesis),
    stance,
    confidenceLabel: CONFIDENCE_PASSTHROUGH.has(summary.confidenceLabel)
      ? summary.confidenceLabel
      : CONFIDENCE.UNAVAILABLE,
    evidenceSummary: composeEvidenceSummary(summary),
    supportingEvidence: supporting,
    concernFlags: concerns,
    missingEvidence: missing,
    recommendedAction: action,
    routeRecommendation: summary.actionSummary || null,
    timeHorizonBias: inferTimeHorizon(summary),
    calibrationFlag: composeCalibrationFlag(summary, result, supporting, missing),
    lastUpdatedAt: Number.isFinite(result.fetchedAt) ? result.fetchedAt : null,
  };
}

// ---------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------

function mapStance(thesis) {
  switch (thesis) {
    case THESIS_SUPPORTS:    return STANCE.CONSTRUCTIVE;
    case THESIS_CONFLICTS:   return STANCE.CAUTIOUS;       // news-only signal: cautious, not bearish
    case THESIS_MIXED:       return STANCE.CAUTIOUS;       // tension warrants caution
    case THESIS_NEUTRAL:     return STANCE.NEUTRAL;
    case THESIS_UNAVAILABLE:
    default:                 return STANCE.UNAVAILABLE;
  }
}

function mapRecommendedAction(route) {
  if (typeof route !== "string") return RECOMMENDED_ACTION.MONITOR;
  return ROUTE_TO_ACTION[route] || RECOMMENDED_ACTION.MONITOR;
}

function composeAssessmentLabel(summary, thesis) {
  const catalyst = summary.catalystType && summary.catalystType !== "none"
    ? humanizeCatalyst(summary.catalystType)
    : null;
  switch (thesis) {
    case THESIS_SUPPORTS:    return catalyst ? `Thesis supportive — ${catalyst}` : "Thesis supportive";
    case THESIS_CONFLICTS:   return catalyst ? `Thesis conflicts — ${catalyst}` : "Thesis conflicts";
    case THESIS_MIXED:       return catalyst ? `Mixed signals — ${catalyst}` : "Mixed signals";
    case THESIS_NEUTRAL:     return catalyst ? `Neutral — ${catalyst}` : "Neutral";
    case THESIS_UNAVAILABLE:
    default:                 return "Insufficient evidence";
  }
}

function composeEvidenceSummary(summary) {
  if (typeof summary.actionSummary === "string" && summary.actionSummary.length > 0) {
    return summary.actionSummary;
  }
  if (typeof summary.businessRead === "string" && summary.businessRead.length > 0) {
    return summary.businessRead;
  }
  if (typeof summary.newsRead === "string" && summary.newsRead.length > 0) {
    return summary.newsRead;
  }
  return "No actionable news evidence has surfaced yet.";
}

function composeSupportingEvidence(summary) {
  const out = [];
  if (typeof summary.macroRead === "string" && summary.macroRead.length > 0) {
    out.push(`Macro: ${summary.macroRead}`);
  }
  if (typeof summary.businessRead === "string" && summary.businessRead.length > 0) {
    out.push(`Business: ${summary.businessRead}`);
  }
  if (typeof summary.newsRead === "string" && summary.newsRead.length > 0) {
    out.push(`News: ${summary.newsRead}`);
  }
  if (summary.catalystType && summary.catalystType !== "none") {
    out.push(`Catalyst: ${humanizeCatalyst(summary.catalystType)}`);
  }
  return out;
}

function composeConcernFlags(summary) {
  const out = [];
  for (const r of (summary.riskContradictions || [])) {
    if (typeof r === "string" && r.length > 0) out.push(r);
  }
  for (const w of (summary.warnings || [])) {
    if (typeof w !== "string" || !w.length) continue;
    if (WARNING_ROUTES_TO_MISSING_EVIDENCE.some((rx) => rx.test(w))) continue;
    out.push(w);
  }
  return out;
}

function composeMissingEvidence(summary, result) {
  const out = [];
  const articles = Array.isArray(summary.articlesUsed) ? summary.articlesUsed : [];

  if (summary.thesisAlignment === THESIS_UNAVAILABLE || articles.length === 0) {
    out.push("Recent news evidence unavailable");
  }

  // Pipeline / provider warnings → missing evidence (not market caveats).
  for (const w of (summary.warnings || [])) {
    if (typeof w !== "string" || !w.length) continue;
    if (!WARNING_ROUTES_TO_MISSING_EVIDENCE.some((rx) => rx.test(w))) continue;
    out.push(w);
  }
  // Surface intelligence-mode hint when running on the rules fallback.
  if (result && result.intelligenceMode === "rules_fallback") {
    out.push("LLM or provider intelligence limited — using rules-based fallback.");
  }
  // Dedupe while preserving order.
  return Array.from(new Set(out));
}

function inferTimeHorizon(summary) {
  // News-driven reads are generally near-term. Macro reads tilt long-term;
  // mixed both → MIXED. Always returns a valid enum value.
  const hasMacro = typeof summary.macroRead === "string" && summary.macroRead.length > 0;
  const hasBusiness = typeof summary.businessRead === "string" && summary.businessRead.length > 0;
  if (hasMacro && hasBusiness) return TIME_HORIZON.MIXED;
  if (hasMacro)                return TIME_HORIZON.LONG_TERM;
  if (hasBusiness)             return TIME_HORIZON.NEAR_TERM;
  return TIME_HORIZON.NEAR_TERM;
}

function composeCalibrationFlag(summary, result, supporting, missing) {
  // When the news read is supportive but the supporting evidence is
  // thin (small article set, low confidence, or the rules-based path
  // produced the read), surface the manager-confirmation calibration
  // hint. The CIO can use this alongside other agents' reads.
  if (summary.thesisAlignment !== THESIS_SUPPORTS) return null;
  const articleCount = Array.isArray(summary.articlesUsed) ? summary.articlesUsed.length : 0;
  const lowConfidence = summary.confidenceLabel === CONFIDENCE.LOW ||
                        summary.confidenceLabel === CONFIDENCE.UNAVAILABLE;
  const fallbackOnly = result && result.intelligenceMode === "rules_fallback";
  const thinSupport = supporting.length <= 1;
  const flagged = articleCount < 3 || lowConfidence || fallbackOnly || thinSupport ||
                  (Array.isArray(missing) && missing.length > 0);
  if (!flagged) return null;
  return "Thesis supportive, but manager confirmation is incomplete.";
}

function humanizeCatalyst(catalyst) {
  switch (catalyst) {
    case "earnings":          return "Earnings";
    case "partnership":       return "Partnership";
    case "customer_adoption": return "Customer adoption";
    case "product":           return "Product";
    case "regulatory":        return "Regulatory";
    case "capital_markets":   return "Capital markets";
    case "macro":             return "Macro";
    case "sector_rotation":   return "Sector rotation";
    case "sentiment":         return "Sentiment";
    case "none":              return "No catalyst";
    default:                  return catalyst || "Catalyst";
  }
}
