// =====================================================================
// Thesis Health Evaluator
// =====================================================================
// PURE function. Compares approved agent memory against newly processed
// (proposed) intelligence — and optionally the engine's current
// agentInsight — and returns a deterministic verdict on whether the
// thesis is strengthening, weakening, unchanged, conflicting, or
// lacking enough evidence to call.
//
// Hard rules:
//   - Deterministic only. No random scoring. Same input → same output.
//   - Approved memory remains the source of truth until the operator
//     accepts an update. This evaluator never mutates memory.
//   - Engine fields surfaced on agentInsight (verdict, posture,
//     allowedActions) are read-only inputs to the classification —
//     they are NOT overridden, just summarised.
//   - Trader-facing copy only. No raw scores / weights / coefficients.
// =====================================================================

import { AI_HEALTH_DIAGNOSTICS_BASKET_ID } from "./aiHealthDiagnosticsProfiles.js";
import { POSTURE } from "./aiHealthDiagnosticsAgent.js";
import { VERDICT } from "./aiHealthDiagnosticsScanner.js";

export const THESIS_HEALTH_STATUS = Object.freeze({
  STRENGTHENING:        "strengthening",
  WEAKENING:            "weakening",
  UNCHANGED:            "unchanged",
  CONFLICTING:          "conflicting",
  INSUFFICIENT_EVIDENCE: "insufficient_evidence",
});

export const THESIS_HEALTH_CONFIDENCE = Object.freeze({
  HIGH:        "high",
  MEDIUM:      "medium",
  LOW:         "low",
  UNAVAILABLE: "unavailable",
});

export const THESIS_HEALTH_ACTION = Object.freeze({
  NO_CHANGE:      "no_change",
  REVIEW_UPDATE:  "review_update",
  REVIEW_CONCERN: "review_concern",
  GATHER_MORE:    "gather_more",
});

// ---------------------------------------------------------------------
// AI Health domain keyword maps
// ---------------------------------------------------------------------
//
// Maps from the catalyst / risk labels that intelligenceProcessor.js
// emits onto the operator-facing evidence buckets. Catalysts default
// to "confirming"; risks default to "challenging"; a small allow-list
// reroutes ambiguous or directionless labels into the "neutral"
// bucket. Anything we don't recognise lands in "neutral" — better to
// surface than to silently discard.

const AI_HEALTH_CONFIRMING_CATALYSTS = new Set([
  "Pharma partnership",
  "Partnership",
  "Hospital adoption / expansion",
  "Diagnostics revenue growth",
  "Data & Applications growth",
  "AI pathology validation",
  "AI infrastructure expansion",
  "ARK accumulation",
  "Insider accumulation",
  "M&A activity",
]);

const AI_HEALTH_CHALLENGING_RISKS = new Set([
  "Execution risk",
  "Reimbursement pressure",
  "Reimbursement pathway uncertainty",
  "Valuation / crowded-trade risk",
  "Incumbent pressure / competition",
  "Regulatory pushback",
  "Cash / runway risk",
  "Trial failure / missed endpoint",
  "Supply chain pressure",
]);

// Catalyst / risk labels we route to "neutral" so the operator can
// see them without swinging the thesis-health verdict.
const AI_HEALTH_NEUTRAL_LABELS = new Set([
  // Catalysts whose direction depends on the actual outcome.
  "Medicare / reimbursement decision",
  "Earnings catalyst",
  "Clinical / trial readout",
  // Risks that are informational rather than directional.
  "Elevated volatility",
]);

// ---------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------

/**
 * @param {object} input
 * @param {string} [input.basketId]
 * @param {string} [input.agentId]
 * @param {string} [input.symbol]
 * @param {object|object[]} [input.approvedMemory]    intelligence items already approved
 * @param {object|object[]} [input.proposedIntelligence] new drafts / processed items
 * @param {object|null} [input.agentInsight]           output of buildAIHealthDiagnosticsInsight
 * @param {number} [input.now]                         clock injection for tests
 * @returns {object} { status, confidenceLabel, confirmingEvidence,
 *                     challengingEvidence, neutralEvidence,
 *                     recommendation, suggestedAction, summary,
 *                     updatedAt }
 */
export function evaluateThesisHealth(input = {}) {
  const now = typeof input.now === "number" ? input.now : Date.now();
  const basketId = typeof input.basketId === "string" ? input.basketId : null;

  const approvedMemory     = arrayify(input.approvedMemory);
  const proposedIntelligence = arrayify(input.proposedIntelligence);
  const insight = input.agentInsight || null;

  const confirmingEvidence = [];
  const challengingEvidence = [];
  const neutralEvidence = [];

  // 1) Catalyst + risk labels from the proposed intelligence stream.
  for (const item of proposedIntelligence) {
    if (!item) continue;
    const itemLabel = item.title || `Proposed ${(item.entities && item.entities.primarySymbols && item.entities.primarySymbols[0]) || "intelligence"}`;
    for (const cat of arrSafe(item.catalysts)) {
      classifyEvidence({
        label: cat,
        basketId,
        defaultBucket: "confirming",
        origin: "proposed",
        sourceTitle: itemLabel,
        confirming: confirmingEvidence,
        challenging: challengingEvidence,
        neutral: neutralEvidence,
      });
    }
    for (const risk of arrSafe(item.risks)) {
      classifyEvidence({
        label: risk,
        basketId,
        defaultBucket: "challenging",
        origin: "proposed",
        sourceTitle: itemLabel,
        confirming: confirmingEvidence,
        challenging: challengingEvidence,
        neutral: neutralEvidence,
      });
    }
  }

  // 2) Engine signals from agentInsight. Treated as evidence — read-
  //    only, never as overrides. The evaluator just describes them.
  if (insight) {
    const engineNotes = engineEvidenceFromInsight(insight);
    confirmingEvidence.push(...engineNotes.confirming);
    challengingEvidence.push(...engineNotes.challenging);
    neutralEvidence.push(...engineNotes.neutral);
  }

  // 3) Status decision.
  const confirmingCount  = confirmingEvidence.length;
  const challengingCount = challengingEvidence.length;
  const evidenceCount    = confirmingCount + challengingCount;
  const status           = decideStatus({
    confirmingCount,
    challengingCount,
    approvedMemoryCount: approvedMemory.length,
  });
  const confidenceLabel  = decideConfidence(evidenceCount);

  const updatedAt = mostRecentApprovedAt(approvedMemory) || now;

  return {
    status,
    confidenceLabel,
    confirmingEvidence,
    challengingEvidence,
    neutralEvidence,
    recommendation: composeRecommendation({ status, confidenceLabel, approvedMemoryCount: approvedMemory.length }),
    suggestedAction: suggestedActionFor(status),
    summary: composeSummary({ status, confirmingCount, challengingCount, neutralCount: neutralEvidence.length }),
    updatedAt,
  };
}

// ---------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------

function classifyEvidence({
  label, basketId, defaultBucket, origin, sourceTitle,
  confirming, challenging, neutral,
}) {
  if (typeof label !== "string" || !label.trim()) return;

  if (AI_HEALTH_NEUTRAL_LABELS.has(label)) {
    neutral.push({ label, origin, sourceTitle, bucket: "neutral" });
    return;
  }
  // For now, AI Health is the only basket with explicit keyword maps.
  // Other baskets fall through to defaults.
  if (basketId === AI_HEALTH_DIAGNOSTICS_BASKET_ID) {
    if (AI_HEALTH_CONFIRMING_CATALYSTS.has(label)) {
      confirming.push({ label, origin, sourceTitle, bucket: "confirming" });
      return;
    }
    if (AI_HEALTH_CHALLENGING_RISKS.has(label)) {
      challenging.push({ label, origin, sourceTitle, bucket: "challenging" });
      return;
    }
  }
  // Default by source kind: catalyst → confirming, risk → challenging.
  if (defaultBucket === "confirming") {
    confirming.push({ label, origin, sourceTitle, bucket: "confirming" });
  } else if (defaultBucket === "challenging") {
    challenging.push({ label, origin, sourceTitle, bucket: "challenging" });
  } else {
    neutral.push({ label, origin, sourceTitle, bucket: "neutral" });
  }
}

function engineEvidenceFromInsight(insight) {
  const confirming = [];
  const challenging = [];
  const neutral = [];

  // Posture / verdict — engine-driven, never overridable.
  if (insight.posture === POSTURE.RISK_ELEVATED) {
    challenging.push({
      label: "Engine posture: risk elevated",
      origin: "engine",
      sourceTitle: "Agent insight",
      bucket: "challenging",
    });
  }
  if (insight.verdict === VERDICT.AVOID_OR_WAIT) {
    challenging.push({
      label: "Engine verdict: avoid / wait",
      origin: "engine",
      sourceTitle: "Agent insight",
      bucket: "challenging",
    });
  }
  if (insight.verdict === VERDICT.PREMIUM_CANDIDATE) {
    confirming.push({
      label: "Engine verdict: premium candidate",
      origin: "engine",
      sourceTitle: "Agent insight",
      bucket: "confirming",
    });
  }
  if (insight.verdict === VERDICT.ACCUMULATION_CANDIDATE ||
      insight.verdict === VERDICT.DEFENSIVE_ANCHOR) {
    confirming.push({
      label: `Engine verdict: ${insight.verdictLabel || insight.verdict}`,
      origin: "engine",
      sourceTitle: "Agent insight",
      bucket: "confirming",
    });
  }

  // Manager-evidence summary — additive context, not directional
  // override. Use neutral so the verdict math stays driven by the
  // proposed-intelligence + posture signals.
  if (typeof insight.constructiveManagerCount === "number" ||
      typeof insight.cautiousManagerCount === "number") {
    const c = insight.constructiveManagerCount || 0;
    const k = insight.cautiousManagerCount || 0;
    if (c > 0 || k > 0) {
      neutral.push({
        label: `Manager reads on file: ${c} constructive · ${k} cautious`,
        origin: "engine",
        sourceTitle: "Agent insight",
        bucket: "neutral",
      });
    }
  }

  // Leadership read description, when present.
  if (typeof insight.leadershipRead === "string" && insight.leadershipRead.trim()) {
    neutral.push({
      label: `Leadership read: ${insight.leadershipRead.trim()}`,
      origin: "engine",
      sourceTitle: "Agent insight",
      bucket: "neutral",
    });
  }

  return { confirming, challenging, neutral };
}

// ---------------------------------------------------------------------
// Status / confidence / copy
// ---------------------------------------------------------------------

function decideStatus({ confirmingCount, challengingCount, approvedMemoryCount }) {
  if (confirmingCount === 0 && challengingCount === 0) {
    if (approvedMemoryCount > 0) return THESIS_HEALTH_STATUS.UNCHANGED;
    return THESIS_HEALTH_STATUS.INSUFFICIENT_EVIDENCE;
  }
  if (confirmingCount > 0 && challengingCount === 0)  return THESIS_HEALTH_STATUS.STRENGTHENING;
  if (challengingCount > 0 && confirmingCount === 0)  return THESIS_HEALTH_STATUS.WEAKENING;
  return THESIS_HEALTH_STATUS.CONFLICTING;
}

function decideConfidence(evidenceCount) {
  if (evidenceCount >= 4) return THESIS_HEALTH_CONFIDENCE.HIGH;
  if (evidenceCount >= 2) return THESIS_HEALTH_CONFIDENCE.MEDIUM;
  if (evidenceCount >= 1) return THESIS_HEALTH_CONFIDENCE.LOW;
  return THESIS_HEALTH_CONFIDENCE.UNAVAILABLE;
}

function suggestedActionFor(status) {
  switch (status) {
    case THESIS_HEALTH_STATUS.STRENGTHENING:        return THESIS_HEALTH_ACTION.NO_CHANGE;
    case THESIS_HEALTH_STATUS.WEAKENING:            return THESIS_HEALTH_ACTION.REVIEW_CONCERN;
    case THESIS_HEALTH_STATUS.UNCHANGED:            return THESIS_HEALTH_ACTION.NO_CHANGE;
    case THESIS_HEALTH_STATUS.CONFLICTING:          return THESIS_HEALTH_ACTION.REVIEW_UPDATE;
    case THESIS_HEALTH_STATUS.INSUFFICIENT_EVIDENCE:
    default:                                        return THESIS_HEALTH_ACTION.GATHER_MORE;
  }
}

function composeRecommendation({ status, confidenceLabel, approvedMemoryCount }) {
  switch (status) {
    case THESIS_HEALTH_STATUS.STRENGTHENING:
      return "Recent intelligence supports the approved thesis. No engine action required — keep monitoring.";
    case THESIS_HEALTH_STATUS.WEAKENING:
      return "Recent intelligence challenges the approved thesis. Review whether to revise the operator memory or tighten posture.";
    case THESIS_HEALTH_STATUS.CONFLICTING:
      return "Recent intelligence both supports and challenges the thesis. Review specific evidence before any update.";
    case THESIS_HEALTH_STATUS.UNCHANGED:
      return confidenceLabel === THESIS_HEALTH_CONFIDENCE.UNAVAILABLE
        ? "No change to the approved thesis based on current intelligence."
        : "No directional change since the last approved update.";
    case THESIS_HEALTH_STATUS.INSUFFICIENT_EVIDENCE:
    default:
      if (approvedMemoryCount === 0) {
        return "No approved thesis on file yet. Process and promote an intelligence item to set the operator baseline.";
      }
      return "Not enough proposed intelligence to gauge thesis health. Process more notes or wait for new evidence.";
  }
}

function composeSummary({ status, confirmingCount, challengingCount, neutralCount }) {
  const headline = (() => {
    switch (status) {
      case THESIS_HEALTH_STATUS.STRENGTHENING:        return "Thesis strengthening";
      case THESIS_HEALTH_STATUS.WEAKENING:            return "Thesis weakening";
      case THESIS_HEALTH_STATUS.CONFLICTING:          return "Thesis conflicted";
      case THESIS_HEALTH_STATUS.UNCHANGED:            return "Thesis unchanged";
      case THESIS_HEALTH_STATUS.INSUFFICIENT_EVIDENCE:
      default:                                        return "Needs more evidence";
    }
  })();
  const counts = `${confirmingCount} confirming · ${challengingCount} challenging · ${neutralCount} neutral`;
  return `${headline} — ${counts}`;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function arrayify(input) {
  if (input == null) return [];
  if (Array.isArray(input)) return input.filter(Boolean);
  if (typeof input === "object") return [input];
  return [];
}

function arrSafe(v) {
  return Array.isArray(v) ? v : [];
}

function mostRecentApprovedAt(approvedMemory) {
  let max = 0;
  for (const it of approvedMemory) {
    if (!it) continue;
    const t = typeof it.updatedAt === "number" ? it.updatedAt
            : typeof it.createdAt === "number" ? it.createdAt
            : 0;
    if (t > max) max = t;
  }
  return max || null;
}
