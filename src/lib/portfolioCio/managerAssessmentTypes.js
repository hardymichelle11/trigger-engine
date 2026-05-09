// =====================================================================
// Manager Assessment — types + enums + normalizers
// =====================================================================
// PURE constants + helpers for the Portfolio CIO subagent tape. The
// CIO sits above LB / TE / CV / Market Intel / Risk Manager / Capital
// Allocation / Macro Regime / Institutional Rotation. Every recommendation
// emitted by the CIO must include a per-subagent assessment so the
// operator can audit the synthesis.
//
// Hard rules:
//   - No raw scores, weights, or formulas surface here.
//   - Trader-facing labels only.
//   - Missing subagents are returned as "unavailable" — never omitted.
// =====================================================================

export const STANCE = Object.freeze({
  BULLISH:      "bullish",
  CONSTRUCTIVE: "constructive",
  NEUTRAL:      "neutral",
  CAUTIOUS:     "cautious",
  BEARISH:      "bearish",
  UNAVAILABLE:  "unavailable",
});
const STANCE_VALUES = new Set(Object.values(STANCE));

export const CONFIDENCE = Object.freeze({
  HIGH:        "high",
  MODERATE:    "moderate",
  LOW:         "low",
  UNAVAILABLE: "unavailable",
});
const CONFIDENCE_VALUES = new Set(Object.values(CONFIDENCE));

export const RECOMMENDED_ACTION = Object.freeze({
  PROCEED:                "proceed",
  MONITOR:                "monitor",
  SEND_TO_TE:             "send_to_TE",
  SEND_TO_CV:             "send_to_CV",
  SEND_TO_TE_AND_CV:      "send_to_TE_and_CV",
  ADD_TO_ACTIVE_UNIVERSE: "add_to_active_universe",
  PROMOTE_TO_SCANNER:     "promote_to_scanner",
  WAIT_FOR_CONFIRMATION:  "wait_for_confirmation",
  REDUCE_SIZE:            "reduce_size",
  AVOID_FOR_NOW:          "avoid_for_now",
  INSUFFICIENT_EVIDENCE:  "insufficient_evidence",
});
const ACTION_VALUES = new Set(Object.values(RECOMMENDED_ACTION));

export const TIME_HORIZON = Object.freeze({
  SHORT_TERM:  "short_term",
  NEAR_TERM:   "near_term",
  LONG_TERM:   "long_term",
  MIXED:       "mixed",
  UNAVAILABLE: "unavailable",
});
const HORIZON_VALUES = new Set(Object.values(TIME_HORIZON));

export const CONFLICT_TYPE = Object.freeze({
  THESIS_VS_TIMING:        "thesis_vs_timing",
  PREMIUM_VS_STRUCTURE:    "premium_vs_structure",
  RISK_VS_OPPORTUNITY:     "risk_vs_opportunity",
  MACRO_VS_MICRO:          "macro_vs_micro",
  BASKET_VS_LIQUIDITY:     "basket_vs_liquidity",
  MISSING_EVIDENCE:        "missing_evidence",
  CONCENTRATION_OVERRIDE:  "concentration_override",
});

// Required subagents — every CIO recommendation must surface a card for
// each one of these (unavailable fallback when the manager hasn't run).
export const REQUIRED_AGENTS = Object.freeze([
  { agentId: "basket",
    agentName: "Basket Agent",
    agentRole: "Determines whether the ticker belongs in the basket and whether it is leading, lagging, fading, or emerging." },
  { agentId: "market_intel",
    agentName: "Market Intelligence Agent",
    agentRole: "Reads thesis-level signals from news, sentiment, institutional flow, and theme rotation." },
  { agentId: "lethal_board",
    agentName: "Lethal Board Agent",
    agentRole: "Surfaces capital-fit prospects from the discovery layer and evaluates premium / capital fit." },
  { agentId: "trigger_engine",
    agentName: "Trigger Engine Agent",
    agentRole: "Validates structure, support / resistance, ATR, trend, and probability of touch." },
  { agentId: "credit_view",
    agentName: "Credit View Agent",
    agentRole: "Determines whether premium, spread, strike, timing, and assignment risk are acceptable." },
  { agentId: "risk_manager",
    agentName: "Risk Manager",
    agentRole: "Evaluates affordability, concentration, correlation, capital fit, and total portfolio risk." },
  { agentId: "capital_allocation",
    agentName: "Capital Allocation Agent",
    agentRole: "Sizes positions against deployable cash, remaining budget, and per-trade risk caps." },
  { agentId: "macro_regime",
    agentName: "Macro Regime Agent",
    agentRole: "Reads the broader regime — VIX, credit stress, rates, leadership rotation, and market mode." },
  { agentId: "institutional_rotation",
    agentName: "Institutional Repricing / Rotation Agent",
    agentRole: "Identifies institutional repricing flows, theme rotation, and crowding dynamics." },
]);

const REQUIRED_AGENT_IDS = new Set(REQUIRED_AGENTS.map((a) => a.agentId));

/**
 * Build the unavailable fallback card. Always returns a complete record
 * with the same shape as a populated assessment so the UI never has to
 * branch on missing fields.
 */
export function makeUnavailableAssessment(agentDef) {
  return {
    agentId: agentDef.agentId,
    agentName: agentDef.agentName,
    agentRole: agentDef.agentRole,
    assessmentLabel: "Insufficient evidence",
    stance: STANCE.UNAVAILABLE,
    confidenceLabel: CONFIDENCE.UNAVAILABLE,
    evidenceSummary: "This manager has not produced a read yet.",
    supportingEvidence: [],
    concernFlags: [],
    missingEvidence: ["Manager input unavailable"],
    recommendedAction: RECOMMENDED_ACTION.INSUFFICIENT_EVIDENCE,
    routeRecommendation: null,
    timeHorizonBias: TIME_HORIZON.UNAVAILABLE,
    calibrationFlag: null,
    lastUpdatedAt: null,
  };
}

/**
 * Validate + coerce a subagent assessment into the canonical shape.
 * Invalid enum values are coerced to "unavailable" / "insufficient_evidence"
 * rather than thrown — the tape is a best-effort presentation layer.
 */
export function normalizeAssessment(input, agentDef) {
  if (!input || typeof input !== "object") {
    return makeUnavailableAssessment(agentDef);
  }
  return {
    agentId: agentDef.agentId,
    agentName: typeof input.agentName === "string" && input.agentName ? input.agentName : agentDef.agentName,
    agentRole: typeof input.agentRole === "string" && input.agentRole ? input.agentRole : agentDef.agentRole,
    assessmentLabel: typeof input.assessmentLabel === "string" ? input.assessmentLabel : "—",
    stance: STANCE_VALUES.has(input.stance) ? input.stance : STANCE.UNAVAILABLE,
    confidenceLabel: CONFIDENCE_VALUES.has(input.confidenceLabel) ? input.confidenceLabel : CONFIDENCE.UNAVAILABLE,
    evidenceSummary: typeof input.evidenceSummary === "string" ? input.evidenceSummary : "",
    supportingEvidence: stringArray(input.supportingEvidence),
    concernFlags: stringArray(input.concernFlags),
    missingEvidence: stringArray(input.missingEvidence),
    recommendedAction: ACTION_VALUES.has(input.recommendedAction)
      ? input.recommendedAction
      : RECOMMENDED_ACTION.INSUFFICIENT_EVIDENCE,
    routeRecommendation: typeof input.routeRecommendation === "string" ? input.routeRecommendation : null,
    timeHorizonBias: HORIZON_VALUES.has(input.timeHorizonBias) ? input.timeHorizonBias : TIME_HORIZON.UNAVAILABLE,
    calibrationFlag: typeof input.calibrationFlag === "string" ? input.calibrationFlag : null,
    lastUpdatedAt: Number.isFinite(input.lastUpdatedAt) ? input.lastUpdatedAt : null,
  };
}

export function isRequiredAgentId(id) { return REQUIRED_AGENT_IDS.has(id); }

function stringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((s) => typeof s === "string" && s.length > 0);
}
