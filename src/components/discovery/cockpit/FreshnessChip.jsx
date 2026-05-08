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

const TONE = {
  LIVE:          "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  AGING:         "border-amber-500/40   bg-amber-500/10   text-amber-300",
  RECALCULATING: "border-amber-500/40   bg-amber-500/10   text-amber-300",
  STALE:         "border-rose-500/40    bg-rose-500/10    text-rose-300",
  VERY_STALE:    "border-rose-500/40    bg-rose-500/10    text-rose-300",
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

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border uppercase tracking-wider font-bold ${sizeClass} ${tone}`}
      title={state === FRESHNESS.RECALCULATING
        ? "Quote moved; analytics haven't recomputed yet"
        : `${label} — last update ${humanizeAge(ageMs)}`}>
      <span>{label}</span>
      {showAge && ageMs != null && (
        <span className="opacity-70">· {humanizeAge(ageMs)}</span>
      )}
    </span>
  );
}
