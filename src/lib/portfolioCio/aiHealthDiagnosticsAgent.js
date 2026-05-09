// =====================================================================
// AI Health / Diagnostics — operator-facing insight builder
// =====================================================================
// PURE function. Combines the per-symbol profile + the scanner verdict +
// the manager-assessment context into an operator-safe insight object
// that drives the Credit-View-style cards in the specialty panel.
//
// Hard rules:
//   - Trader-facing copy only. No raw scores / weights / coefficients.
//   - News alignment NEVER overrides the engine — supportive news only
//     decorates copy.
//   - Allowed actions are constrained by posture so the UI cannot
//     surface a "Promote to Scanner" button on an avoid_or_wait.
// =====================================================================

import {
  getAIHealthDiagnosticsProfile,
  CATEGORY_LABELS,
} from "./aiHealthDiagnosticsProfiles.js";
import {
  evaluateAIHealthDiagnosticsCandidate,
  VERDICT,
  VERDICT_LABELS,
} from "./aiHealthDiagnosticsScanner.js";
import { ACTION_TYPE } from "./basketActionQueue.js";
import { STANCE } from "./managerAssessmentTypes.js";

// Posture maps directly to the verdict but uses the spec's named
// posture vocabulary so the panel headers can group cards consistently.
export const POSTURE = Object.freeze({
  ACCUMULATE_WATCH:           "accumulate_watch",
  PREMIUM_CANDIDATE:          "premium_candidate",
  WAIT_FOR_CONFIRMATION:      "wait_for_confirmation",
  LONG_HOLD_ANCHOR:           "long_hold_anchor",
  AVOID_FOR_NOW:              "avoid_for_now",
  RISK_ELEVATED:              "risk_elevated",
  SECTOR_CONFIRMATION_SIGNAL: "sector_confirmation_signal",
});

const POSTURE_LABELS = Object.freeze({
  [POSTURE.ACCUMULATE_WATCH]:           "Accumulate / Watch",
  [POSTURE.PREMIUM_CANDIDATE]:          "Premium Candidate",
  [POSTURE.WAIT_FOR_CONFIRMATION]:      "Wait for Confirmation",
  [POSTURE.LONG_HOLD_ANCHOR]:           "Long-Hold Anchor",
  [POSTURE.AVOID_FOR_NOW]:              "Avoid for Now",
  [POSTURE.RISK_ELEVATED]:              "Risk Elevated",
  [POSTURE.SECTOR_CONFIRMATION_SIGNAL]: "Sector Confirmation Signal",
});

/**
 * @param {object} input
 * @param {string} input.symbol
 * @param {object} [input.managerAssessment]
 * @param {object} [input.history]
 * @param {object} [input.leadershipClass]
 * @param {string} [input.newsAlignment]    "supports_thesis" / "conflicts_with_thesis" / "mixed" / "neutral" / "unavailable"
 * @param {object} [input.priceData]        optional decoration; we accept but never trust
 * @returns {object|null} operator-facing insight, or null when symbol is not in the basket
 */
export function buildAIHealthDiagnosticsInsight(input = {}) {
  const profile = getAIHealthDiagnosticsProfile(input.symbol);
  if (!profile) return null;

  const evalRes = evaluateAIHealthDiagnosticsCandidate({
    symbol: input.symbol,
    managerAssessment: input.managerAssessment,
    history: input.history,
    leadershipClass: input.leadershipClass,
    newsAlignment: input.newsAlignment,
  });
  if (!evalRes) return null;

  const posture = postureFromVerdict(evalRes.verdict, evalRes.cautiousManagerCount, input.managerAssessment);
  const allowed = allowedActionsFor(posture);

  const newsAlignment = evalRes.newsAlignment;
  const newsLine = composeNewsLine(newsAlignment);

  const creditViewInsight = composeCreditViewInsight({
    profile, evalRes, newsAlignment,
  });

  const suggestedAction = composeSuggestedAction(posture, profile);
  const keyLevels = composeKeyLevels(profile, evalRes);
  const assignmentComfort = composeAssignmentComfort(profile, evalRes);
  const risksToVerify = composeRisksToVerify(profile, evalRes, input.managerAssessment);

  const catalystLabel = composeCatalystLabel(profile, evalRes);

  return {
    symbol: profile.symbol,
    name: profile.name,
    category: profile.category,
    categoryLabel: CATEGORY_LABELS[profile.category] || "AI Health",
    tier: profile.tier,
    role: profile.role,
    thesisSummary: profile.thesis,
    ownershipLayer: profile.ownershipLayer,
    posture,
    postureLabel: POSTURE_LABELS[posture] || "Strong Watch",
    verdict: evalRes.verdict,
    verdictLabel: VERDICT_LABELS[evalRes.verdict] || "Strong Watch",
    leadershipStatus: evalRes.leadershipStatus,
    leadershipRead: evalRes.leadershipRead,
    newsAlignment,
    newsLine,
    catalystLabel,
    creditViewInsight,
    suggestedAction,
    keyLevels,
    assignmentComfort,
    risksToVerify,
    allowedActions: allowed,
  };
}

// ---------------------------------------------------------------------
// Posture / actions
// ---------------------------------------------------------------------

function postureFromVerdict(verdict, cautiousCount, ma) {
  const riskStance = ma?.risk_manager?.stance;
  if (riskStance === STANCE.BEARISH) return POSTURE.RISK_ELEVATED;
  switch (verdict) {
    case VERDICT.PREMIUM_CANDIDATE:      return POSTURE.PREMIUM_CANDIDATE;
    case VERDICT.ACCUMULATION_CANDIDATE: return POSTURE.ACCUMULATE_WATCH;
    case VERDICT.DEFENSIVE_ANCHOR:       return POSTURE.LONG_HOLD_ANCHOR;
    case VERDICT.AVOID_OR_WAIT:
      return cautiousCount >= 2 ? POSTURE.RISK_ELEVATED : POSTURE.AVOID_FOR_NOW;
    case VERDICT.STRONG_WATCH:
    default:
      return POSTURE.WAIT_FOR_CONFIRMATION;
  }
}

function allowedActionsFor(posture) {
  switch (posture) {
    case POSTURE.PREMIUM_CANDIDATE:
      return [
        ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW,
        ACTION_TYPE.SEND_TO_TE,
        ACTION_TYPE.SEND_TO_CV,
      ];
    case POSTURE.ACCUMULATE_WATCH:
      return [
        ACTION_TYPE.SEND_TO_TE,
        ACTION_TYPE.SEND_TO_CV,
        ACTION_TYPE.RUN_AD_HOC_SIMULATION,
      ];
    case POSTURE.LONG_HOLD_ANCHOR:
      return [
        ACTION_TYPE.MONITOR_ONLY,
        ACTION_TYPE.SEND_TO_CV,
      ];
    case POSTURE.WAIT_FOR_CONFIRMATION:
    case POSTURE.SECTOR_CONFIRMATION_SIGNAL:
      return [
        ACTION_TYPE.RUN_AD_HOC_SIMULATION,
        ACTION_TYPE.SEND_TO_TE,
        ACTION_TYPE.SEND_TO_CV,
      ];
    case POSTURE.AVOID_FOR_NOW:
      return [
        ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW,
        ACTION_TYPE.MONITOR_ONLY,
      ];
    case POSTURE.RISK_ELEVATED:
      return [
        ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW,
        ACTION_TYPE.EXCLUDE_REVIEW,
        ACTION_TYPE.MONITOR_ONLY,
      ];
    default:
      return [ACTION_TYPE.MONITOR_ONLY];
  }
}

// ---------------------------------------------------------------------
// Copy composition
// ---------------------------------------------------------------------

function composeCreditViewInsight({ profile, evalRes, newsAlignment }) {
  const lines = [];
  lines.push(`What it owns: ${profile.ownershipLayer}.`);
  if (evalRes.leadershipRead) {
    lines.push(`Manager read: ${evalRes.leadershipRead}`);
  } else if (evalRes.constructiveManagerCount >= 1) {
    lines.push(
      `Manager evidence: ${evalRes.constructiveManagerCount} constructive read${evalRes.constructiveManagerCount === 1 ? "" : "s"} on file.`,
    );
  } else {
    lines.push("Manager evidence: none on file yet — run an Ad Hoc Simulation to generate TE / CV / MI reads.");
  }
  if (newsAlignment === "supports_thesis") {
    lines.push("News alignment: recent flow appears to support the thesis. Confirm with manager evidence before sizing.");
  } else if (newsAlignment === "conflicts_with_thesis") {
    lines.push("News alignment: recent flow appears to conflict with the thesis. Watch for risk-manager confirmation before adding.");
  } else if (newsAlignment === "mixed") {
    lines.push("News alignment: signals are mixed — defer to manager reads.");
  }
  return lines.join(" ");
}

function composeNewsLine(alignment) {
  switch (alignment) {
    case "supports_thesis":      return "Supportive flow — confirm with manager reads.";
    case "conflicts_with_thesis":return "Conflicting flow — watch risk reads.";
    case "mixed":                return "Mixed news — defer to managers.";
    case "neutral":              return "Neutral news flow.";
    default:                     return "News alignment unavailable.";
  }
}

function composeCatalystLabel(profile, evalRes) {
  if (evalRes.historyStatus === "missed_winner") {
    return "Calibration: prior outcome flagged as missed winner.";
  }
  if (evalRes.historyStatus === "profitable") {
    return "Calibration: prior simulation outcome was profitable.";
  }
  if (evalRes.historyStatus === "avoided_correctly" || evalRes.historyStatus === "invalidated") {
    return "Caution validated by prior outcome.";
  }
  // Tier-driven baseline catalyst label.
  if (profile.tier === "tier_2_incumbent_fortress") return "Sector validator — anchors the basket thesis.";
  if (profile.tier === "tier_3_adjacency")          return "Adjacency — sector confirmation only.";
  return "Pure-play candidate — driven by adoption, partnerships, and reimbursement.";
}

function composeSuggestedAction(posture, profile) {
  switch (posture) {
    case POSTURE.PREMIUM_CANDIDATE:
      return `Premium candidate — review for scanner promotion. Confirm structure (TE) and premium (CV) before sizing.`;
    case POSTURE.ACCUMULATE_WATCH:
      return `Accumulate / watch — fortress posture. Confirm continuing constructive reads.`;
    case POSTURE.LONG_HOLD_ANCHOR:
      return `Long-hold anchor — defensive sector exposure. Monitor only unless premium becomes attractive.`;
    case POSTURE.WAIT_FOR_CONFIRMATION:
      return `Wait for confirmation — run an Ad Hoc Simulation or wait for manager reads to mature.`;
    case POSTURE.AVOID_FOR_NOW:
      return `Avoid for now — move to watchlist; revisit when manager reads improve.`;
    case POSTURE.RISK_ELEVATED:
      return `Risk elevated — consider exclude or watchlist; do not size on conflicting reads.`;
    case POSTURE.SECTOR_CONFIRMATION_SIGNAL:
      return `Sector confirmation only — do not deploy basket capital here; monitor for tape signal.`;
    default:
      return `Monitor for additional manager evidence on ${profile.name}.`;
  }
}

function composeKeyLevels(profile, evalRes) {
  // Engine doesn't ingest price data here, so the spec's "key level"
  // is delegated downstream — we surface a trader-facing line that
  // tells the operator what posture changes the trade.
  const parts = [];
  if (evalRes.leadershipStatus === "leader" || evalRes.leadershipStatus === "emerging_leader") {
    parts.push("Bullish posture maintained while leadership read holds.");
  } else if (evalRes.leadershipStatus === "fading_leader") {
    parts.push("Posture flips to derisking if leadership read keeps fading.");
  } else {
    parts.push("Posture unconfirmed until manager reads mature.");
  }
  if (evalRes.cautiousManagerCount >= 1) {
    parts.push(`${evalRes.cautiousManagerCount} cautious manager read${evalRes.cautiousManagerCount === 1 ? "" : "s"} on file — watch for resolution.`);
  }
  return parts.join(" ");
}

function composeAssignmentComfort(profile, evalRes) {
  if (evalRes.verdict === VERDICT.AVOID_OR_WAIT) {
    return "Low — do not accept assignment risk on a name with cautious manager evidence.";
  }
  if (profile.tier === "tier_2_incumbent_fortress") {
    return "Higher — assignment is acceptable at a price compatible with a defensive healthcare hold.";
  }
  if (profile.tier === "tier_1_pure_play" && evalRes.constructiveManagerCount >= 2) {
    return "Moderate — only at a price compatible with owning a speculative AI-health platform.";
  }
  if (profile.tier === "tier_1_pure_play") {
    return "Below moderate — pure-play volatility; only accept at a discounted strike.";
  }
  return "Adjacency — basket assignment not recommended; this name belongs to another basket.";
}

function composeRisksToVerify(profile, evalRes, ma) {
  const out = [];
  if (profile.primaryRisk) out.push(profile.primaryRisk);
  if (evalRes.cautiousManagerCount >= 1) {
    out.push("Cautious manager read on file — confirm resolution before sizing.");
  }
  if (ma?.risk_manager?.stance === STANCE.BEARISH) {
    out.push("Risk Manager flagged elevated risk — defer trade activity until updated read.");
  }
  if (evalRes.historyStatus === "missed_winner") {
    out.push("Prior outcome flagged as missed winner — review whether the original CIO override still applies.");
  }
  if (out.length === 0) {
    out.push("No specific risk flags on file beyond standard sector volatility.");
  }
  return out;
}
