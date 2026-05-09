// =====================================================================
// Manager Assessment Tape — top-level CIO synthesis output
// =====================================================================
// Single PURE entry point that takes a bag of per-subagent assessments,
// normalizes them, detects conflicts, builds the override reason, and
// stamps a calibration-watch record. The result is exactly the shape
// the UI renders — no further transformation needed.
// =====================================================================

import {
  REQUIRED_AGENTS,
  makeUnavailableAssessment,
  normalizeAssessment,
  STANCE,
  RECOMMENDED_ACTION,
} from "./managerAssessmentTypes.js";
import {
  detectConflicts,
  summarizeConsensus,
  buildOverrideReason,
  isConstructive,
  isCautious,
  isUnavailable,
} from "./cioConflictEngine.js";
import { evaluateCalibrationWatch } from "./cioCalibrationWatch.js";

/**
 * @param {object} args
 * @param {string} [args.symbol]
 * @param {Record<string, object>} [args.inputs]    keys = agentId, values = raw assessments
 * @param {object|null} [args.history]              optional ad-hoc history record
 * @returns {{
 *   symbol: string|null,
 *   cioRecommendation: { label, action, rationale },
 *   managerConsensus: string,
 *   managerConflicts: Array<object>,
 *   overrideReason: string|null,
 *   calibrationWatch: object,
 *   assessments: Array<object>,
 *   missingEvidence: string[]
 * }}
 */
export function buildManagerAssessmentTape({ symbol = null, inputs = {}, history = null } = {}) {
  // 1. Build the canonical per-agent assessment list. Required agents
  //    that are missing get an unavailable record so the UI never has
  //    to branch on missing fields.
  const assessments = REQUIRED_AGENTS.map((agentDef) => {
    const raw = inputs && inputs[agentDef.agentId];
    return raw ? normalizeAssessment(raw, agentDef) : makeUnavailableAssessment(agentDef);
  });
  const byId = {};
  for (const a of assessments) byId[a.agentId] = a;

  // 2. Consensus + conflicts.
  const managerConsensus = summarizeConsensus(assessments);
  const managerConflicts = detectConflicts(byId);

  // 3. CIO synthesis — explainable, no hidden formulas.
  const cioRecommendation = synthesizeCioRecommendation(byId, managerConflicts);

  // 4. Override reason fires when the CIO softened or rejected what one
  //    or more managers recommended.
  const overrideReason = buildOverrideReason(byId, managerConflicts);

  // 5. Calibration watch.
  const calibrationWatch = evaluateCalibrationWatch({
    byId, conflicts: managerConflicts, history,
  });

  // 6. Roll up missing evidence so the UI can show a single dedicated
  //    "Missing Evidence" section.
  const missingEvidence = collectMissingEvidence(assessments);

  return {
    symbol,
    cioRecommendation,
    managerConsensus,
    managerConflicts,
    overrideReason,
    calibrationWatch,
    assessments,
    missingEvidence,
  };
}

// ---------------------------------------------------------------------
// CIO synthesis — explainable rule layer.
// ---------------------------------------------------------------------
// The CIO doesn't have its own scoring; it tallies subagent stances and
// applies the override priorities the operator specified. Every branch
// returns a rationale string so the operator can audit the call.

function synthesizeCioRecommendation(byId, conflicts) {
  const all = Object.values(byId);
  const available = all.filter((a) => !isUnavailable(a));

  if (available.length === 0) {
    return {
      label: "Insufficient evidence",
      action: RECOMMENDED_ACTION.INSUFFICIENT_EVIDENCE,
      rationale: "No manager has produced a read.",
    };
  }

  const constructiveCount = available.filter(isConstructive).length;
  const cautiousCount     = available.filter(isCautious).length;

  const teBearish = isCautious(byId.trigger_engine);
  const cvCautious = isCautious(byId.credit_view);
  const cvConstructive = isConstructive(byId.credit_view);
  const teConstructive = isConstructive(byId.trigger_engine);
  const rmCautious = isCautious(byId.risk_manager);

  // Hard avoid — both structure and premium unfavourable.
  if (teBearish && cvCautious) {
    return {
      label: "Avoid for now",
      action: RECOMMENDED_ACTION.AVOID_FOR_NOW,
      rationale: "Both structure (TE) and premium (CV) are unfavourable.",
    };
  }

  // Concentration override — Risk Manager flagged crowding/correlation.
  const concentration = (conflicts || []).some((c) => c.conflictType === "concentration_override");
  if (concentration) {
    return {
      label: "Starter size only",
      action: RECOMMENDED_ACTION.REDUCE_SIZE,
      rationale: "Risk Manager flagged concentration; downsize while monitoring.",
    };
  }

  // Premium-trap — CV constructive but TE bearish: defer to structure.
  if (cvConstructive && teBearish) {
    return {
      label: "Defer — premium trap risk",
      action: RECOMMENDED_ACTION.WAIT_FOR_CONFIRMATION,
      rationale: "CIO defers to structure when TE flags risk despite attractive premium.",
    };
  }

  // Thesis-vs-timing — Market Intel constructive but CV cautious: keep alive on watch.
  if (isConstructive(byId.market_intel) && cvCautious) {
    return {
      label: "Watchlist only",
      action: RECOMMENDED_ACTION.MONITOR,
      rationale:
        "Long-term thesis remains constructive but premium is not ready — keep ticker alive on watchlist.",
    };
  }

  // Macro-vs-micro — macro supportive but TE/LB missing.
  if (
    isConstructive(byId.macro_regime) &&
    (isUnavailable(byId.trigger_engine) || isUnavailable(byId.lethal_board))
  ) {
    return {
      label: "Watchlist — micro unverified",
      action: RECOMMENDED_ACTION.MONITOR,
      rationale: "Macro supports the theme; run TE / LB before sizing.",
    };
  }

  // Risk caution against many constructive — starter size.
  if (rmCautious && constructiveCount >= 3) {
    return {
      label: "Starter size only",
      action: RECOMMENDED_ACTION.REDUCE_SIZE,
      rationale: "Multiple managers constructive but Risk Manager flagged caution.",
    };
  }

  // Strong consensus.
  if (constructiveCount >= 4 && cautiousCount === 0) {
    return {
      label: "Proceed with normal sizing",
      action: RECOMMENDED_ACTION.PROCEED,
      rationale: "Manager consensus is constructive; no caution flags fired.",
    };
  }
  if (constructiveCount > cautiousCount && available.length >= 4) {
    return {
      label: "Proceed — staged",
      action: RECOMMENDED_ACTION.PROCEED,
      rationale: "Manager consensus leans constructive; size in stages and confirm.",
    };
  }
  if (cautiousCount > constructiveCount) {
    return {
      label: "Defer",
      action: RECOMMENDED_ACTION.WAIT_FOR_CONFIRMATION,
      rationale: "Manager consensus leans cautious; wait for confirmation.",
    };
  }
  if (constructiveCount === cautiousCount) {
    return {
      label: "Mixed — monitor",
      action: RECOMMENDED_ACTION.MONITOR,
      rationale: "Manager reads are evenly split — monitor for tie-breakers.",
    };
  }

  return {
    label: "Mixed — monitor",
    action: RECOMMENDED_ACTION.MONITOR,
    rationale: "Manager reads are mixed.",
  };
}

function collectMissingEvidence(assessments) {
  const out = [];
  for (const a of assessments || []) {
    if (a.stance === STANCE.UNAVAILABLE) {
      out.push(`${a.agentName}: ${a.evidenceSummary || "Manager input unavailable"}`);
    }
    for (const item of a.missingEvidence || []) {
      if (typeof item === "string" && item.length > 0) {
        out.push(`${a.agentName}: ${item}`);
      }
    }
  }
  // Dedupe while preserving order.
  return Array.from(new Set(out));
}
