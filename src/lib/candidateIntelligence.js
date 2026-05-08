// =====================================================================
// Candidate Intelligence Summary
// =====================================================================
// Combines engine state + news context into a concise investor-facing
// brief without exposing internals. Lives next to newsIntelligence.js
// because the inputs flow through the same enrichment pipeline.
//
// Hard rules:
//   - News NEVER overrides the engine. The summary may say "news is
//     supportive" but the posture comes from the engine's own action
//     and capital-fit codes. A WAIT engine action stays a wait.
//   - Raw newsScoreAdjustment integers are NOT surfaced. The summary
//     uses categorical labels only (supports / conflicts / neutral /
//     mixed / unavailable + high / moderate / low / unavailable).
//   - Placeholder rows are filtered before any signal is computed.
//   - Defensive: empty / unreliable news → "News feed unavailable —
//     do not use news context for decisioning."
// =====================================================================

import {
  aggregateNewsAdjustment,
  catalystLabel,
  _internals as newsInternals,
} from "./newsIntelligence.js";

const POSTURES = [
  "bullish_watch",
  "income_candidate",
  "wait_for_entry",
  "risk_elevated",
  "avoid",
];

const NEWS_ALIGNMENTS = [
  "supports",
  "conflicts",
  "neutral",
  "mixed",
  "unavailable",
];

const POSTURE_LEAD = {
  income_candidate:
    "The engine ranks this setup on capital fit, premium quality, and technical structure.",
  bullish_watch:
    "The engine has this on a deep-scan track — under research before commitment.",
  wait_for_entry:
    "The engine is waiting for entry confirmation on this setup.",
  risk_elevated:
    "Risk is elevated on this candidate — capital fit, regime, or signal quality is pushing back.",
  avoid:
    "The engine recommends skipping this setup in the current regime.",
};

const ACTION_REMINDERS = {
  income_candidate: "Confirm live price, spread, and timing before entry.",
  bullish_watch:
    "Open the watch list and review historical setups before considering entry.",
  wait_for_entry:
    "Add to watch list. Wait for tighter setup or better timing.",
  risk_elevated:
    "Resolve the risk before sizing — adjust strike, change setup, or skip.",
  avoid: "Skip — does not meet the engine bar in this regime.",
};

// ---------- posture derivation ---------------------------------------

function derivePosture(candidate) {
  if (!candidate) return "wait_for_entry";

  const ac = String(candidate.actionCode || "").toLowerCase();
  const cf = String(candidate.capitalFitCode || "").toLowerCase();

  // Hard rejections first.
  if (ac.startsWith("skip")) return "avoid";
  if (cf === "not_affordable") return "risk_elevated";
  if (candidate.regimeAlignment === "mismatch") return "risk_elevated";
  if (candidate.signalState === "unverified" && ac === "watch") {
    return "wait_for_entry";
  }
  if (cf === "poor" && ac !== "option_candidate") return "risk_elevated";

  if (ac === "option_candidate") return "income_candidate";
  if (ac === "deep_scan") return "bullish_watch";
  if (ac === "watch") return "wait_for_entry";

  return "wait_for_entry";
}

// ---------- news alignment + confidence ------------------------------

function deriveNewsAlignment(realArticles, aggregateAdjustment) {
  if (realArticles.length === 0) return "unavailable";

  const positives = realArticles.filter(
    (a) => (a.newsScoreAdjustment ?? 0) > 0,
  ).length;
  const negatives = realArticles.filter(
    (a) => (a.newsScoreAdjustment ?? 0) < 0,
  ).length;

  // Mixed = both directions present and the net is small enough that
  // neither dominates. This is meaningfully different from "neutral",
  // which means no signal in either direction at all.
  if (positives > 0 && negatives > 0 && Math.abs(aggregateAdjustment) <= 2) {
    return "mixed";
  }
  if (aggregateAdjustment >= 3) return "supports";
  if (aggregateAdjustment <= -3) return "conflicts";
  return "neutral";
}

function deriveConfidenceLabel(realArticles) {
  if (realArticles.length === 0) return "unavailable";
  const labels = realArticles.map((a) => a.confidenceLabel || "low");
  if (labels.includes("high")) return "high";
  if (labels.includes("moderate")) return "moderate";
  return "low";
}

// ---------- summary text ---------------------------------------------

function buildSummaryText({
  posture,
  newsAlignment,
  catalystLabel: cat,
  confidenceLabel,
}) {
  const lead = POSTURE_LEAD[posture] || POSTURE_LEAD.wait_for_entry;

  if (newsAlignment === "unavailable") {
    return `${lead} News feed unavailable — do not use news context for decisioning.`;
  }

  // Special case: WAIT engine action with positive news → must NOT read
  // as an upgrade. News is supportive, but the engine has not confirmed
  // entry timing.
  if (posture === "wait_for_entry" && newsAlignment === "supports") {
    const tail = cat ? ` from a ${cat.toLowerCase()} catalyst` : "";
    return `${lead} News is supportive${tail}, but the engine has not confirmed entry timing — wait for confirmation before sizing.`;
  }

  // AVOID + positive news → still avoid. News doesn't override.
  if (posture === "avoid" && newsAlignment === "supports") {
    const tail = cat ? ` from a ${cat.toLowerCase()} catalyst` : "";
    return `${lead} News is positive${tail}, but does not raise this above the engine bar.`;
  }

  if (newsAlignment === "supports") {
    const tail = cat ? ` from a ${cat.toLowerCase()} catalyst` : "";
    const strength =
      confidenceLabel === "high"
        ? "strong"
        : confidenceLabel === "moderate"
          ? "moderate"
          : "soft";
    return `${lead} News adds ${strength} positive support${tail}, but does not change the engine score.`;
  }

  if (newsAlignment === "conflicts") {
    const tail = cat ? ` (${cat.toLowerCase()})` : "";
    return `${lead} News raises additional risk${tail} — treat as a hedge or skip signal until structure stabilizes.`;
  }

  if (newsAlignment === "mixed") {
    return `${lead} News is mixed — supportive and concerning headlines roughly balance. Treat as neutral until one side dominates.`;
  }

  // neutral
  return `${lead} News is neutral — no actionable catalyst above the noise floor.`;
}

// ---------- public API ------------------------------------------------

/**
 * Build the candidate intelligence summary.
 *
 * @param {object|null} candidate           view-model row (action, capitalFit, etc.)
 * @param {Array<object>|null} newsArticles enriched articles (may include placeholders)
 * @returns {{
 *   posture: string,
 *   newsAlignment: string,
 *   catalystLabel: string|null,
 *   confidenceLabel: string,
 *   summaryText: string,
 *   actionReminder: string
 * }}
 */
export function buildCandidateIntelligenceSummary(candidate, newsArticles) {
  const posture = derivePosture(candidate);

  const real = Array.isArray(newsArticles)
    ? newsArticles.filter((a) => a && !a.isPlaceholder)
    : [];

  const aggregateAdjustment = aggregateNewsAdjustment(real);
  const newsAlignment = deriveNewsAlignment(real, aggregateAdjustment);
  const confidenceLbl = deriveConfidenceLabel(real);

  const dominant =
    real.length > 0 ? newsInternals.dominantCatalyst(real) : "unknown";
  const catLbl = real.length > 0 ? catalystLabel(dominant) : null;

  const summaryText = buildSummaryText({
    posture,
    newsAlignment,
    catalystLabel: catLbl,
    confidenceLabel: confidenceLbl,
  });

  return {
    posture,
    newsAlignment,
    catalystLabel: catLbl,
    confidenceLabel: confidenceLbl,
    summaryText,
    actionReminder: ACTION_REMINDERS[posture] || ACTION_REMINDERS.wait_for_entry,
  };
}

// Friendly labels for the badge row.
export const POSTURE_LABELS = {
  bullish_watch: "Bullish watch",
  income_candidate: "Income candidate",
  wait_for_entry: "Wait for entry",
  risk_elevated: "Risk elevated",
  avoid: "Avoid",
};

export const NEWS_ALIGNMENT_LABELS = {
  supports: "News supports",
  conflicts: "News conflicts",
  neutral: "News neutral",
  mixed: "News mixed",
  unavailable: "News unavailable",
};

export const _internals = {
  derivePosture,
  deriveNewsAlignment,
  deriveConfidenceLabel,
  buildSummaryText,
  POSTURES,
  NEWS_ALIGNMENTS,
  POSTURE_LEAD,
  ACTION_REMINDERS,
};
