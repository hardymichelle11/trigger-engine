// =====================================================================
// CV Simulation → Manager Assessment adapter
// =====================================================================
// PURE function that converts the Credit View block of a simulateAdHoc
// result into the input-bag shape consumed by buildManagerAssessmentTape()
// under the existing `credit_view` agent slot.
//
// Hard rules:
//   - Trader-facing labels only — no raw scores / weights / coefficients.
//   - Returns null when CV is in limited mode (no chain) so the tape's
//     missing-input fallback renders the unavailable card.
// =====================================================================

import {
  STANCE,
  CONFIDENCE,
  RECOMMENDED_ACTION,
  TIME_HORIZON,
} from "../managerAssessmentTypes.js";

const AGENT_NAME = "Credit View Agent";
const AGENT_ROLE = "Evaluates premium quality, spread, strike zone, options timing, confirmation / invalidation, and assignment risk.";

export const CIO_CREDIT_VIEW_AGENT_ID = "credit_view";

// CV recommendation label → (stance, action, label tone) mapping. The
// labels mirror the CREDIT_RECOMMENDATIONS values produced by the
// credit-view narrative builder.
const RECO_PATTERNS = [
  { rx: /strong credit entry|accumulation entry|2pm premium harvest/i,
    stance: STANCE.CONSTRUCTIVE, action: RECOMMENDED_ACTION.PROCEED },
  { rx: /late window|require confirmation|wait for/i,
    stance: STANCE.CAUTIOUS,     action: RECOMMENDED_ACTION.WAIT_FOR_CONFIRMATION },
  { rx: /breakdown|invalidated/i,
    stance: STANCE.BEARISH,      action: RECOMMENDED_ACTION.AVOID_FOR_NOW },
  { rx: /poor premium|poor spread|avoid/i,
    stance: STANCE.CAUTIOUS,     action: RECOMMENDED_ACTION.AVOID_FOR_NOW },
];

/**
 * @param {object} input
 * @param {string} [input.symbol]
 * @param {object|null} input.simResult
 * @returns {object|null}
 */
export function cvSimulationToAssessment(input = {}) {
  const sim = input.simResult || null;
  if (!sim) return null;
  const cv = sim.creditView || null;
  if (!cv || cv.limited === true || !cv.result) return null;

  const r = cv.result;
  const candidate = cv.candidate || {};
  const reco = r.recommendation || {};
  const recoLabel = typeof reco.label === "string" ? reco.label : "";

  const { stance, action } = mapFromLabel(recoLabel);
  const supporting = composeSupportingEvidence(candidate, r);
  const concerns   = composeConcernFlags(candidate, r);
  const missing    = composeMissingEvidence(cv);

  return {
    agentName: AGENT_NAME,
    agentRole: AGENT_ROLE,
    assessmentLabel: recoLabel || "Credit read",
    stance,
    confidenceLabel: mapConfidence(stance, candidate),
    evidenceSummary: composeEvidenceSummary(candidate, r),
    supportingEvidence: supporting,
    concernFlags: concerns,
    missingEvidence: missing,
    recommendedAction: action,
    routeRecommendation: r.managementNote || null,
    timeHorizonBias: TIME_HORIZON.SHORT_TERM,
    calibrationFlag: composeCalibrationFlag(stance, candidate),
    lastUpdatedAt: Number.isFinite(sim.fetchedAt) ? sim.fetchedAt : null,
  };
}

// ---------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------

function mapFromLabel(label) {
  for (const p of RECO_PATTERNS) {
    if (p.rx.test(label)) return { stance: p.stance, action: p.action };
  }
  return { stance: STANCE.NEUTRAL, action: RECOMMENDED_ACTION.MONITOR };
}

function mapConfidence(stance, candidate) {
  // Confidence is derived from spread quality + presence of bid/ask.
  // We never echo raw IV / scores.
  const grade = (candidate?.spreadGrade || "").toUpperCase();
  const haveQuotes = Number.isFinite(num(candidate?.bid)) && Number.isFinite(num(candidate?.ask));
  if (!haveQuotes) return CONFIDENCE.LOW;
  if (grade.startsWith("A")) {
    return stance === STANCE.CONSTRUCTIVE ? CONFIDENCE.MODERATE : CONFIDENCE.MODERATE;
  }
  if (grade === "B+" || grade === "B") return CONFIDENCE.MODERATE;
  return CONFIDENCE.LOW;
}

function composeEvidenceSummary(candidate, r) {
  const strike = num(candidate.strike);
  const exp = candidate.expiration || null;
  const mid = num(candidate.mid);
  if (strike == null || !exp) {
    return r?.recommendation?.label || "Credit read available.";
  }
  const parts = [`Candidate: ${exp} $${strike.toFixed(2)} put`];
  if (mid != null) parts.push(`mid ${fmt$(mid)}`);
  if (candidate.spreadGrade) parts.push(`spread ${candidate.spreadGrade}`);
  return parts.join(" · ") + ".";
}

function composeSupportingEvidence(candidate, r) {
  const out = [];
  const strike = num(candidate.strike);
  if (strike != null && candidate.expiration) {
    out.push(`Preferred strike: $${strike.toFixed(2)} expiring ${candidate.expiration}`);
  }
  const mid = num(candidate.mid);
  if (mid != null) {
    out.push(`Premium mid: ${fmt$(mid)}`);
  }
  if (candidate.spreadGrade) {
    out.push(`Spread grade: ${candidate.spreadGrade}`);
  }
  if (r?.minimumPremium?.label) {
    out.push(`Premium floor: ${r.minimumPremium.label}`);
  }
  if (r?.confirmation?.sentence) {
    out.push(`Confirmation: ${r.confirmation.sentence}`);
  }
  if (r?.bestStrikeZone?.label) {
    out.push(`Best strike zone: ${r.bestStrikeZone.label}`);
  }
  return out;
}

function composeConcernFlags(candidate, r) {
  const out = [];
  const grade = (candidate?.spreadGrade || "").toUpperCase();
  if (grade === "C" || grade === "D" || grade === "F") {
    out.push("Spread quality is wide — execution friction is high.");
  }
  const bid = num(candidate?.bid);
  if (bid == null) {
    out.push("No bid present — chain liquidity is questionable.");
  }
  if (r?.invalidation?.sentence) {
    out.push(`Invalidation: ${r.invalidation.sentence}`);
  }
  return out;
}

function composeMissingEvidence(cv) {
  const out = [];
  if (cv && cv.limited === true) {
    out.push("Options chain unavailable — Credit View in limited mode.");
  }
  if (Array.isArray(cv?.warnings)) {
    for (const w of cv.warnings) {
      if (typeof w === "string" && w.length > 0) out.push(w);
    }
  }
  return Array.from(new Set(out));
}

function composeCalibrationFlag(stance, candidate) {
  const grade = (candidate?.spreadGrade || "").toUpperCase();
  if (stance === STANCE.CONSTRUCTIVE && (grade === "B" || grade === "B+" || !grade)) {
    return "Constructive credit read; recheck spread + premium intraday.";
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
