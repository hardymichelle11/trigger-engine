// =====================================================
// CANDIDATE INTELLIGENCE SUMMARY
// =====================================================
// Concise investor-facing brief that combines engine
// posture + news context. Sits at the top of
// OpportunityDetailPanel, above News / market insight.
//
// Hard rules:
//   - PURE presentational. Reads the
//     buildCandidateIntelligenceSummary() output only.
//   - Never shows raw newsScoreAdjustment integers or
//     internal score weights.
//   - One short paragraph + one badge row. No table.
// =====================================================

import React from "react";
import { COCKPIT_PALETTE } from "./cockpitTheme.js";
import {
  POSTURE_LABELS,
  NEWS_ALIGNMENT_LABELS,
} from "../../../lib/candidateIntelligence.js";

/**
 * @param {object} props
 * @param {object|null} props.summary  buildCandidateIntelligenceSummary() output
 */
export default function CandidateIntelligenceSummary({ summary }) {
  if (!summary) return null;

  return (
    <section
      style={{
        background: COCKPIT_PALETTE.nestedBg,
        border: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
        borderRadius: 10,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
      aria-label="Candidate intelligence summary"
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: COCKPIT_PALETTE.textDim,
        }}
      >
        Candidate intelligence
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <PostureBadge posture={summary.posture} />
        <NewsAlignmentBadge alignment={summary.newsAlignment} />
        <ConfidenceBadge level={summary.confidenceLabel} />
      </div>

      <p
        style={{
          fontSize: 12,
          color: COCKPIT_PALETTE.text,
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        {summary.summaryText}
      </p>

      {summary.actionReminder && (
        <div
          style={{
            fontSize: 11,
            color: COCKPIT_PALETTE.accentTeal,
            fontWeight: 600,
            lineHeight: 1.45,
          }}
        >
          → {summary.actionReminder}
        </div>
      )}
    </section>
  );
}

// --------------------------------------------------
// Badges
// --------------------------------------------------

function PostureBadge({ posture }) {
  const label = POSTURE_LABELS[posture] || "Posture";
  const cls =
    posture === "income_candidate"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : posture === "bullish_watch"
        ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
        : posture === "risk_elevated"
          ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
          : posture === "avoid"
            ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
            : "bg-zinc-700/40 text-zinc-300 border-zinc-700";
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}
    >
      {label}
    </span>
  );
}

function NewsAlignmentBadge({ alignment }) {
  const label = NEWS_ALIGNMENT_LABELS[alignment] || "News";
  const cls =
    alignment === "supports"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
      : alignment === "conflicts"
        ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
        : alignment === "mixed"
          ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
          : alignment === "unavailable"
            ? "bg-zinc-800/60 text-zinc-500 border-zinc-700"
            : "bg-zinc-700/40 text-zinc-300 border-zinc-700";
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}
    >
      {label}
    </span>
  );
}

function ConfidenceBadge({ level }) {
  const cls =
    level === "high"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
      : level === "moderate"
        ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
        : level === "low"
          ? "bg-zinc-700/40 text-zinc-400 border-zinc-700"
          : "bg-zinc-800/60 text-zinc-500 border-zinc-700";
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}
    >
      {level} conf
    </span>
  );
}
