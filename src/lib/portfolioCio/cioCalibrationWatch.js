// =====================================================================
// CIO Calibration Watch
// =====================================================================
// Flags scenarios where the CIO's synthesis may need calibration —
// either too conservative (rejected setups that later run) or too
// aggressive (promoted despite a major caution flag). PURE: takes the
// normalized assessments + the conflict list + an optional history clue
// and returns a calibrationWatch record.
// =====================================================================

import { CONFLICT_TYPE } from "./managerAssessmentTypes.js";
import { isConstructive, isCautious, isUnavailable } from "./cioConflictEngine.js";

const REVIEW_AFTER_DEFAULT = "5_trading_days";

// History outcome strings the watch knows about. Mirrored here rather
// than imported from the history store so the CIO module stays free of
// the history dependency unless the operator passes a record in.
const HISTORY_PROFITABLE         = "profitable";
const HISTORY_MISSED_WINNER      = "missed_winner";
const HISTORY_INVALIDATED        = "invalidated";
const HISTORY_AVOIDED_CORRECTLY  = "avoided_correctly";

/**
 * @param {object} input
 * @param {Record<string, object>} input.byId               normalized assessments
 * @param {Array<object>} [input.conflicts]                 detected conflicts
 * @param {object|null} [input.history]                     latest history record
 *                                                          (optional, for clues)
 * @returns {{ calibrationNeeded: boolean,
 *             calibrationReason: string|null,
 *             watchMetric: string|null,
 *             reviewAfter: string|null,
 *             clueFromHistory: string|null }}
 */
export function evaluateCalibrationWatch({ byId, conflicts = [], history = null } = {}) {
  if (!byId || typeof byId !== "object") {
    return emptyWatch();
  }

  const reasons = [];
  let watchMetric = null;

  // 1. CV cautious while TE + Market Intel constructive → possible over-conservatism
  if (
    isCautious(byId.credit_view) &&
    isConstructive(byId.trigger_engine) &&
    isConstructive(byId.market_intel)
  ) {
    reasons.push(
      "CV is cautious, but TE and Market Intelligence are constructive. Review if price advances after rejection.",
    );
    watchMetric = "Price performance and premium change over next 5 trading days";
  }

  // 2. TE bearish while CV unusually attractive → premium-trap watch
  if (isCautious(byId.trigger_engine) && isConstructive(byId.credit_view)) {
    reasons.push(
      "TE flagged structure risk while CV finds premium attractive. Watch whether structure resolves into a breakdown.",
    );
    if (!watchMetric) watchMetric = "Whether structure resolves into a breakdown over the next 5 trading days";
  }

  // 3. Risk Manager blocks despite multiple constructive managers
  const constructiveCount = Object.values(byId).filter(isConstructive).length;
  if (isCautious(byId.risk_manager) && constructiveCount >= 3) {
    reasons.push(
      "Risk Manager blocked despite multiple constructive managers. Confirm whether the concentration caution holds.",
    );
    if (!watchMetric) watchMetric = "Whether smaller size still captures upside without inflating concentration";
  }

  // 4. CIO chose watch_only despite strong basket leadership
  // Approximated by: basket constructive + many other constructive but CV / Risk lock it down.
  // Surfaced via the THESIS_VS_TIMING / RISK_VS_OPPORTUNITY conflicts.
  if (
    Array.isArray(conflicts) &&
    (conflicts.some((c) => c.conflictType === CONFLICT_TYPE.THESIS_VS_TIMING) ||
      conflicts.some((c) => c.conflictType === CONFLICT_TYPE.RISK_VS_OPPORTUNITY)) &&
    isConstructive(byId.basket)
  ) {
    reasons.push(
      "Basket leadership is constructive but the CIO is in a watch-only stance — track whether the basket leads continues to advance.",
    );
    if (!watchMetric) watchMetric = "Basket leader return relative to index over the next 5 trading days";
  }

  // 5. CIO promoted despite one major caution flag
  // Heuristic: at least one cautious manager with high confidence + several constructive.
  const highConfidenceCautious = Object.values(byId).filter(
    (a) => a && isCautious(a) && a.confidenceLabel === "high",
  );
  if (highConfidenceCautious.length >= 1 && constructiveCount >= 4) {
    reasons.push(
      "CIO is leaning constructive despite a high-confidence caution from " +
        highConfidenceCautious.map((a) => a.agentName).join(", ") +
        " — confirm whether the caution materializes.",
    );
    if (!watchMetric) watchMetric = "Whether the cautioned risk materializes within the next 5 trading days";
  }

  // 6. Market Intel supportive but price/premium confirmation missing
  if (
    isConstructive(byId.market_intel) &&
    (isUnavailable(byId.trigger_engine) || isUnavailable(byId.credit_view))
  ) {
    reasons.push(
      "Market Intelligence is supportive but TE / CV confirmation is missing — track whether structure or premium develops.",
    );
    if (!watchMetric) watchMetric = "Whether structure or premium develops over the next session";
  }

  // 7. Concentration override — track whether concentrated theme keeps leading
  if (Array.isArray(conflicts) && conflicts.some((c) => c.conflictType === CONFLICT_TYPE.CONCENTRATION_OVERRIDE)) {
    reasons.push(
      "Concentration override active — track whether the theme continues to lead before re-adding size.",
    );
    if (!watchMetric) watchMetric = "Theme leadership over the next 5 trading days";
  }

  // 8. History clue (optional)
  let clueFromHistory = null;
  if (history && typeof history === "object" && history.outcome) {
    const status = history.outcome.status;
    if (status === HISTORY_MISSED_WINNER) {
      clueFromHistory =
        "A recent simulation for this symbol was later marked a missed winner — consider whether the CIO is too conservative.";
    } else if (status === HISTORY_AVOIDED_CORRECTLY || status === HISTORY_INVALIDATED) {
      clueFromHistory =
        "A recent simulation for this symbol was avoided correctly or invalidated — caution may have been appropriate.";
    } else if (status === HISTORY_PROFITABLE) {
      clueFromHistory =
        "A recent simulation for this symbol was profitable — current caution may need calibration.";
    }
  }
  if (clueFromHistory) reasons.push(clueFromHistory);

  if (reasons.length === 0) {
    return { ...emptyWatch(), clueFromHistory };
  }

  return {
    calibrationNeeded: true,
    calibrationReason: reasons.join(" "),
    watchMetric: watchMetric || "Track outcome over the next 5 trading days",
    reviewAfter: REVIEW_AFTER_DEFAULT,
    clueFromHistory,
  };
}

function emptyWatch() {
  return {
    calibrationNeeded: false,
    calibrationReason: null,
    watchMetric: null,
    reviewAfter: null,
    clueFromHistory: null,
  };
}
