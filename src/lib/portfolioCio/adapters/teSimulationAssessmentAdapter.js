// =====================================================================
// TE Simulation → Manager Assessment adapter
// =====================================================================
// PURE function that converts the Trigger Engine block of a simulateAdHoc
// result into the input-bag shape consumed by buildManagerAssessmentTape()
// under the existing `trigger_engine` agent slot.
//
// Hard rules:
//   - Trader-facing labels only — no raw scores / weights / coefficients.
//   - Returns null when TE didn't produce a usable structural read so
//     the tape's missing-input fallback renders the unavailable card.
// =====================================================================

import {
  STANCE,
  CONFIDENCE,
  RECOMMENDED_ACTION,
  TIME_HORIZON,
} from "../managerAssessmentTypes.js";

const AGENT_NAME = "Trigger Engine Agent";
const AGENT_ROLE = "Evaluates price structure, path risk, trend, support / resistance, ATR, and technical confirmation.";

export const CIO_TRIGGER_ENGINE_AGENT_ID = "trigger_engine";

/**
 * @param {object} input
 * @param {string} [input.symbol]
 * @param {object|null} input.simResult
 * @returns {object|null}  raw assessment shape ready to be placed under
 *   `inputs.trigger_engine` of buildManagerAssessmentTape(); null when
 *   no usable TE read is available.
 */
export function teSimulationToAssessment(input = {}) {
  const sim = input.simResult || null;
  if (!sim) return null;
  const te = sim.triggerEngine || null;
  if (!te || te.ok !== true || !te.result) return null;

  const r = te.result;
  const struct = r.structure || {};
  const trend = struct.trendBias || null;
  const stance = mapStance(trend);
  const dataQuality = te.dataQuality || null;
  const limited = te.limited === true;

  return {
    agentName: AGENT_NAME,
    agentRole: AGENT_ROLE,
    assessmentLabel: composeAssessmentLabel(trend, limited),
    stance,
    confidenceLabel: mapConfidence(dataQuality, limited),
    evidenceSummary: composeEvidenceSummary(r, struct, trend),
    supportingEvidence: composeSupportingEvidence(r, struct, trend),
    concernFlags: composeConcernFlags(struct, trend, limited),
    missingEvidence: composeMissingEvidence(dataQuality, limited),
    recommendedAction: mapRecommendedAction(stance, limited),
    routeRecommendation: composeRoute(stance, limited),
    timeHorizonBias: TIME_HORIZON.SHORT_TERM,
    calibrationFlag: composeCalibrationFlag(stance, dataQuality, limited),
    lastUpdatedAt: Number.isFinite(sim.fetchedAt) ? sim.fetchedAt : null,
  };
}

// ---------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------

function mapStance(trend) {
  switch (trend) {
    case "BULLISH": return STANCE.CONSTRUCTIVE;
    case "BEARISH": return STANCE.CAUTIOUS;
    case "NEUTRAL": return STANCE.NEUTRAL;
    default:        return STANCE.UNAVAILABLE;
  }
}

function mapConfidence(dataQuality, limited) {
  if (limited) return CONFIDENCE.LOW;
  if (dataQuality === "quote_and_bars") return CONFIDENCE.MODERATE;
  if (dataQuality === "quote_only")     return CONFIDENCE.LOW;
  if (dataQuality === "bars_only")      return CONFIDENCE.LOW;
  return CONFIDENCE.UNAVAILABLE;
}

function mapRecommendedAction(stance, limited) {
  if (limited)                     return RECOMMENDED_ACTION.INSUFFICIENT_EVIDENCE;
  if (stance === STANCE.CONSTRUCTIVE) return RECOMMENDED_ACTION.SEND_TO_CV;
  if (stance === STANCE.NEUTRAL)      return RECOMMENDED_ACTION.WAIT_FOR_CONFIRMATION;
  if (stance === STANCE.CAUTIOUS)     return RECOMMENDED_ACTION.AVOID_FOR_NOW;
  return RECOMMENDED_ACTION.INSUFFICIENT_EVIDENCE;
}

function composeAssessmentLabel(trend, limited) {
  if (limited)         return "Structure read limited";
  if (trend === "BULLISH") return "Structure intact";
  if (trend === "BEARISH") return "Breakdown risk";
  if (trend === "NEUTRAL") return "Sideways structure";
  return "Insufficient structural data";
}

function composeEvidenceSummary(result, struct, trend) {
  const price = num(result.price);
  if (price == null) return "Quote-level data only — structure not fully validated.";
  const support = num(struct.support);
  const resistance = num(struct.resistance);
  const atr = num(struct.atr);
  const parts = [];
  parts.push(`Price ${fmt$(price)}.`);
  if (trend) parts.push(`Trend bias ${trend.toLowerCase()}.`);
  if (support != null)    parts.push(`Recent support ${fmt$(support)}.`);
  if (resistance != null) parts.push(`Recent resistance ${fmt$(resistance)}.`);
  if (atr != null)        parts.push(`ATR ${fmt$(atr)}.`);
  return parts.join(" ");
}

function composeSupportingEvidence(result, struct, trend) {
  const out = [];
  const price = num(result.price);
  const prevClose = num(result.previousClose);
  const pct = num(result.percentChange);
  if (price != null) out.push(`Price ${fmt$(price)}`);
  if (prevClose != null && pct != null) {
    out.push(`Today: ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% vs prev ${fmt$(prevClose)}`);
  }
  if (trend) out.push(`Trend bias: ${trend}`);
  if (Number.isFinite(num(struct.support))) {
    out.push(`Recent support: ${fmt$(num(struct.support))}`);
  }
  if (Number.isFinite(num(struct.resistance))) {
    out.push(`Recent resistance: ${fmt$(num(struct.resistance))}`);
  }
  if (Number.isFinite(num(struct.atr))) {
    out.push(`ATR: ${fmt$(num(struct.atr))}`);
  }
  return out;
}

function composeConcernFlags(struct, trend, limited) {
  const out = [];
  if (trend === "BEARISH")           out.push("Trend bias is bearish");
  const support = num(struct.support);
  const supportPct = num(struct.supportPct);
  if (Number.isFinite(supportPct) && supportPct < 0.005) {
    out.push("Price testing or below recent support");
  }
  if (!limited && trend === null) {
    out.push("Trend bias undetermined");
  }
  return out;
}

function composeMissingEvidence(dataQuality, limited) {
  const out = [];
  if (dataQuality === "quote_only" || dataQuality === null) {
    out.push("Daily bars unavailable — quote-only structural read.");
  }
  if (limited) {
    out.push("Limited TE data; structure not fully validated.");
  }
  return Array.from(new Set(out));
}

function composeRoute(stance, limited) {
  if (limited)                        return "Run TE again with daily bars before validating premium.";
  if (stance === STANCE.CONSTRUCTIVE) return "Validate options premium before sizing.";
  if (stance === STANCE.CAUTIOUS)     return "Wait for trend re-acceptance before re-engaging.";
  if (stance === STANCE.NEUTRAL)      return "Hold for a tighter trigger; structure is range-bound.";
  return null;
}

function composeCalibrationFlag(stance, dataQuality, limited) {
  if (stance === STANCE.CONSTRUCTIVE && (limited || dataQuality !== "quote_and_bars")) {
    return "Constructive structure but data quality is limited.";
  }
  return null;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function fmt$(v) {
  if (v == null) return "—";
  return `$${Number(v).toFixed(2)}`;
}
