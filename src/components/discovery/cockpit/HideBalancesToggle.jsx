// =====================================================
// HIDE BALANCES TOGGLE (Phase 4.7.2)
// =====================================================
// Small reusable toggle that flips the operator's
// hideBalances flag in CapitalContext. Used by the
// Capital Command Bar and the Operator Console so the
// operator can mask dollar amounts before screen-sharing.
//
// Hard rules:
//   - PURE presentational. Receives state + handler from
//     parent; never reads localStorage directly.
//   - Visual state is unambiguous (eye / eye-off icons +
//     "Hide" / "Show" label).
// =====================================================

import React from "react";

/**
 * @param {object} props
 * @param {boolean} props.hidden
 * @param {() => void} props.onToggle
 * @param {"sm"|"md"} [props.size]
 */
export default function HideBalancesToggle({ hidden, onToggle, size = "md" }) {
  const cls = size === "sm"
    ? "text-[10px] px-2 py-0.5 gap-1"
    : "text-[11px] px-2 py-1 gap-1.5";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={hidden ? "Show dollar balances" : "Hide dollar balances"}
      aria-pressed={hidden}
      className={
        `inline-flex items-center rounded border transition-colors font-bold uppercase tracking-wider ${cls} ` +
        (hidden
          ? "border-amber-500/60 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
          : "border-zinc-700 text-zinc-300 bg-transparent hover:bg-zinc-800")
      }>
      <EyeIcon hidden={hidden} />
      <span>{hidden ? "Hidden" : "Visible"}</span>
    </button>
  );
}

function EyeIcon({ hidden }) {
  // Open eye when balances are visible, slashed eye when hidden.
  if (hidden) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9.88 4.61A10.66 10.66 0 0 1 12 4.5c5 0 9 4 10 7.5a14.4 14.4 0 0 1-2.9 4.05" />
        <path d="M6.6 6.6A14.4 14.4 0 0 0 2 12c1 3.5 5 7.5 10 7.5a10.7 10.7 0 0 0 5.4-1.4" />
        <line x1="3" y1="3" x2="21" y2="21" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12c1-3.5 5-7.5 10-7.5s9 4 10 7.5c-1 3.5-5 7.5-10 7.5S3 15.5 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
