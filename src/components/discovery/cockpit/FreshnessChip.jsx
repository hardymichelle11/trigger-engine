// =====================================================
// FRESHNESS CHIP — reusable across cards + detail panel
// =====================================================
// Tiny pill that shows "Live · 12s ago" / "Stale · 8m ago" /
// "Recalculating" depending on the candidate's age + analytics
// freshness. Source of truth is lib/marketFreshness.
// =====================================================

import React from "react";
import {
  FRESHNESS,
  freshnessForCandidate,
  humanizeAge,
} from "../../../lib/marketFreshness.js";

// Distinct tones per state so the operator can tell the four trust levels
// apart at a glance:
//   LIVE          green
//   AGING         yellow (still trustworthy, getting old)
//   RECALCULATING amber  (quote moved; engine catching up)
//   STALE/VERY_STALE  red
//   UNKNOWN       zinc (no signal)
const TONE = {
  LIVE:          "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  AGING:         "border-yellow-500/40  bg-yellow-500/10  text-yellow-300",
  RECALCULATING: "border-amber-500/50   bg-amber-500/15   text-amber-200",
  STALE:         "border-rose-500/40    bg-rose-500/10    text-rose-300",
  VERY_STALE:    "border-rose-500/50    bg-rose-500/15    text-rose-200",
  UNKNOWN:       "border-zinc-700       bg-zinc-800/60    text-zinc-400",
};

const SHORT_LABEL = {
  LIVE:          "Live",
  AGING:         "Aging",
  RECALCULATING: "Recalc",
  STALE:         "Stale",
  VERY_STALE:    "Stale",
  UNKNOWN:       "—",
};

/**
 * @param {object} props
 * @param {number|null} [props.quoteAgeMs]
 * @param {number|null} [props.analyticsAgeMs]
 * @param {boolean} [props.showAge]   show the "Xs ago" suffix (default: true)
 * @param {string}  [props.size]      "xs" | "sm"
 */
export default function FreshnessChip({
  quoteAgeMs = null,
  analyticsAgeMs = null,
  showAge = true,
  size = "xs",
}) {
  const state = freshnessForCandidate({ quoteAgeMs, analyticsAgeMs });
  const tone = TONE[state] || TONE.UNKNOWN;
  const label = SHORT_LABEL[state] || "—";

  // Show the worst (most-aging) of the two ages so the chip never
  // implies things are fresher than they are.
  const ageMs =
    Number.isFinite(quoteAgeMs) && Number.isFinite(analyticsAgeMs)
      ? Math.max(quoteAgeMs, analyticsAgeMs)
      : Number.isFinite(quoteAgeMs)
      ? quoteAgeMs
      : Number.isFinite(analyticsAgeMs)
      ? analyticsAgeMs
      : null;

  const sizeClass =
    size === "sm"
      ? "text-[11px] px-1.5 py-0.5"
      : "text-[10px] px-1.5 py-[1px]";

  // Tooltip surfaces BOTH ages so the operator can see exactly which
  // stream is lagging when the chip is anything other than LIVE.
  const tooltip = buildTooltip(state, quoteAgeMs, analyticsAgeMs);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border uppercase tracking-wider font-bold ${sizeClass} ${tone}`}
      title={tooltip}>
      <span>{label}</span>
      {showAge && ageMs != null && (
        <span className="opacity-70">· {humanizeAge(ageMs)}</span>
      )}
    </span>
  );
}

function buildTooltip(state, quoteAgeMs, analyticsAgeMs) {
  const parts = [];
  if (Number.isFinite(quoteAgeMs)) {
    parts.push(`Quote updated: ${humanizeAge(quoteAgeMs)}`);
  }
  if (Number.isFinite(analyticsAgeMs)) {
    parts.push(`Analytics updated: ${humanizeAge(analyticsAgeMs)}`);
  }
  if (state === FRESHNESS.RECALCULATING) {
    parts.unshift("Quote updated; analytics recompute pending.");
  } else if (state === FRESHNESS.UNKNOWN || parts.length === 0) {
    return "Freshness unknown — no recent update timestamps";
  }
  return parts.join("\n");
}
