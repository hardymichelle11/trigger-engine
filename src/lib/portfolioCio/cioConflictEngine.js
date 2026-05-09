// =====================================================================
// CIO Conflict Engine
// =====================================================================
// Detects manager-level disagreements + builds the override-reason copy
// the operator sees on the tape. PURE: takes a `byId` map of normalized
// assessments and returns a list of conflict records.
//
// Conflict types map 1:1 to the seven CONFLICT_TYPE enum values; each
// conflict carries the trader-facing interpretation the CIO would give.
// =====================================================================

import { CONFLICT_TYPE, STANCE } from "./managerAssessmentTypes.js";

// ---------------------------------------------------------------------
// Manager consensus — one-line summary used on the tape header.
// ---------------------------------------------------------------------

export function summarizeConsensus(assessments) {
  const available = (assessments || []).filter((a) => a && a.stance !== STANCE.UNAVAILABLE);
  if (available.length === 0) return "Insufficient evidence";

  const constructive = available.filter((a) => isConstructive(a)).length;
  const cautious     = available.filter((a) => isCautious(a)).length;

  if (cautious === 0 && constructive >= Math.ceil(available.length * 0.7)) {
    return "Most agents constructive";
  }
  if (constructive === 0 && cautious >= Math.ceil(available.length * 0.7)) {
    return "Most agents cautious";
  }
  if (constructive > 0 && cautious > 0) {
    if (constructive > cautious) return "Mixed: thesis supportive, trade timing weak";
    if (cautious > constructive) return "Mixed: caution leads, thesis under review";
    return "Mixed reads — manager opinions split";
  }
  if (constructive === 0 && cautious === 0) return "Neutral across managers";
  return "Mixed reads";
}

// ---------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------

/**
 * @param {Record<string, object>} byId   normalized assessments keyed by agentId
 * @returns {Array<{conflictType, conflict, agentsInConflict,
 *                  cioInterpretation, suggestedCalibrationCheck}>}
 */
export function detectConflicts(byId) {
  if (!byId || typeof byId !== "object") return [];
  const conflicts = [];

  // 1. thesis_vs_timing: Market Intelligence supportive but Credit View cautious.
  if (isConstructive(byId.market_intel) && isCautious(byId.credit_view)) {
    conflicts.push({
      conflictType: CONFLICT_TYPE.THESIS_VS_TIMING,
      conflict: "Market Intelligence is constructive but Credit View is cautious.",
      agentsInConflict: ["market_intel", "credit_view"],
      cioInterpretation: "Long-term thesis may be valid, but short-term premium trade is not ready.",
      suggestedCalibrationCheck:
        "Watch whether the ticker advances after CV's caution; if it does, premium may have been mispriced.",
    });
  }

  // 2. premium_vs_structure: CV finds premium attractive but TE flags breakdown.
  if (isConstructive(byId.credit_view) && isCautious(byId.trigger_engine)) {
    conflicts.push({
      conflictType: CONFLICT_TYPE.PREMIUM_VS_STRUCTURE,
      conflict: "Credit View finds premium attractive but Trigger Engine flags breakdown risk.",
      agentsInConflict: ["credit_view", "trigger_engine"],
      cioInterpretation: "Premium may be a trap; CIO defers to structure and risk.",
      suggestedCalibrationCheck:
        "Track whether structure breaks down despite the attractive premium.",
    });
  }

  // 3. risk_vs_opportunity: Basket constructive but Risk Manager cautious.
  if (isConstructive(byId.basket) && isCautious(byId.risk_manager)) {
    conflicts.push({
      conflictType: CONFLICT_TYPE.RISK_VS_OPPORTUNITY,
      conflict: "Basket Agent is constructive but Risk Manager is cautious.",
      agentsInConflict: ["basket", "risk_manager"],
      cioInterpretation:
        "Theme fit is valid, but sizing should be reduced due to concentration or affordability.",
      suggestedCalibrationCheck:
        "Track whether reduced size still captures the basket's leadership upside.",
    });
  }

  // 4. macro_vs_micro: Macro supportive but LB or TE missing.
  if (
    isConstructive(byId.macro_regime) &&
    (isUnavailable(byId.lethal_board) || isUnavailable(byId.trigger_engine))
  ) {
    const missing = ["lethal_board", "trigger_engine"].filter((id) => isUnavailable(byId[id]));
    conflicts.push({
      conflictType: CONFLICT_TYPE.MACRO_VS_MICRO,
      conflict: "Macro is supportive but ticker-level validation is incomplete.",
      agentsInConflict: ["macro_regime", ...missing],
      cioInterpretation: "Macro supports the theme, but ticker-specific validation is incomplete.",
      suggestedCalibrationCheck:
        "Run the missing managers (TE / LB) before sizing.",
    });
  }

  // 5. basket_vs_liquidity: Basket constructive but CV flagged liquidity / spread.
  const cvLiquidityFlag = (byId.credit_view?.concernFlags || []).some((c) =>
    /spread|liquidity/i.test(c),
  );
  if (isConstructive(byId.basket) && cvLiquidityFlag) {
    conflicts.push({
      conflictType: CONFLICT_TYPE.BASKET_VS_LIQUIDITY,
      conflict: "Basket fit is good but Credit View flags liquidity or spread quality.",
      agentsInConflict: ["basket", "credit_view"],
      cioInterpretation: "Theme is right, but execution friction should be reconsidered.",
      suggestedCalibrationCheck:
        "Recheck spread quality intraday; consider waiting for a tighter market.",
    });
  }

  // 6. missing_evidence: 4 or more managers unavailable.
  const allAgents = Object.values(byId);
  const unavailable = allAgents.filter(isUnavailable);
  if (unavailable.length >= 4 && allAgents.length > 0) {
    conflicts.push({
      conflictType: CONFLICT_TYPE.MISSING_EVIDENCE,
      conflict: `${unavailable.length} of ${allAgents.length} managers have not produced a read.`,
      agentsInConflict: unavailable.map((a) => a.agentId).filter(Boolean),
      cioInterpretation: "Insufficient manager coverage to make a confident call.",
      suggestedCalibrationCheck: "Run the missing managers before deciding.",
    });
  }

  // 7. concentration_override: Risk Manager flagged concentration / crowding / correlation.
  const rmConcentration = (byId.risk_manager?.concernFlags || []).some((c) =>
    /concentration|crowd|correlation/i.test(c),
  );
  if (rmConcentration) {
    conflicts.push({
      conflictType: CONFLICT_TYPE.CONCENTRATION_OVERRIDE,
      conflict: "Risk Manager flagged concentration / crowding risk.",
      agentsInConflict: ["risk_manager"],
      cioInterpretation: "CIO downgrades sizing because of portfolio concentration.",
      suggestedCalibrationCheck:
        "Track whether the concentrated theme continues to lead before adding back size.",
    });
  }

  return conflicts;
}

// ---------------------------------------------------------------------
// Override reason — the one-liner that explains why the CIO softened or
// overrode a subagent. Returns null when no high-priority conflict fired.
// ---------------------------------------------------------------------

export function buildOverrideReason(byId, conflicts) {
  if (!Array.isArray(conflicts) || conflicts.length === 0) return null;

  const has = (type) => conflicts.some((c) => c.conflictType === type);

  // Priority order — the first match wins so the operator gets a single
  // crisp explanation.
  if (has(CONFLICT_TYPE.CONCENTRATION_OVERRIDE)) {
    return "CIO downgraded trade action because Risk Manager flagged concentration.";
  }
  if (has(CONFLICT_TYPE.PREMIUM_VS_STRUCTURE)) {
    return "CIO rejected premium trade because TE structure conflicted with CV premium attractiveness.";
  }
  if (has(CONFLICT_TYPE.MACRO_VS_MICRO)) {
    return "CIO moved to watchlist because Market Intelligence support is present but technical confirmation is missing.";
  }
  if (has(CONFLICT_TYPE.THESIS_VS_TIMING)) {
    return "CIO kept ticker active despite CV caution because long-term thesis and basket leadership remain constructive.";
  }
  if (has(CONFLICT_TYPE.RISK_VS_OPPORTUNITY)) {
    return "CIO downgraded sizing because Risk Manager caution outweighs the basket-level opportunity.";
  }
  if (has(CONFLICT_TYPE.BASKET_VS_LIQUIDITY)) {
    return "CIO held off because execution friction (spread / liquidity) does not yet support the trade.";
  }
  if (has(CONFLICT_TYPE.MISSING_EVIDENCE)) {
    return "CIO deferred because too many managers have not produced a read yet.";
  }
  return null;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

export function isConstructive(a) {
  return !!a && (a.stance === STANCE.BULLISH || a.stance === STANCE.CONSTRUCTIVE);
}
export function isCautious(a) {
  return !!a && (a.stance === STANCE.CAUTIOUS || a.stance === STANCE.BEARISH);
}
export function isUnavailable(a) {
  return !a || a.stance === STANCE.UNAVAILABLE;
}
