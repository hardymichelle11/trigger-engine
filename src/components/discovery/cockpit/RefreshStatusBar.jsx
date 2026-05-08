// =====================================================
// REFRESH STATUS BAR — single source of truth for live state
// =====================================================
// Sits directly under the Capital Command Bar. Tells the operator,
// at a glance:
//   - SESSION:      PREMARKET / REGULAR / AFTERHOURS / WEEKEND_REPLAY / CLOSED
//   - REFRESH:      LIVE · AUTO ACTIVE   |   PAUSED · MANUAL REFRESH
//   - FRESHNESS:    Live (12s ago) / Stale (8m ago) / Recalculating
//   - TOGGLE:       button to flip the auto-refresh preference
//   - MANUAL TICK:  button to refresh now
//
// Reads from props only — owns no state. The cockpit hook + LethalBoardPage
// drive the underlying values.
// =====================================================

import React from "react";
import { COCKPIT_PALETTE } from "./cockpitTheme.js";
import { SESSION_LABEL, isReplayOnlySession } from "../../../lib/sessionState.js";
import {
  freshnessForCandidate,
  FRESHNESS,
  FRESHNESS_LABEL,
  humanizeAge,
} from "../../../lib/marketFreshness.js";

const FRESH_TONE = {
  LIVE:          "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  AGING:         "bg-amber-500/10   text-amber-300   border-amber-500/40",
  RECALCULATING: "bg-amber-500/10   text-amber-300   border-amber-500/40",
  STALE:         "bg-rose-500/10    text-rose-300    border-rose-500/40",
  VERY_STALE:    "bg-rose-500/10    text-rose-300    border-rose-500/40",
  UNKNOWN:       "bg-zinc-800/60    text-zinc-400    border-zinc-700",
};

const SESSION_TONE = {
  PREMARKET:      "bg-amber-500/10  text-amber-300  border-amber-500/40",
  REGULAR:        "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  AFTERHOURS:     "bg-amber-500/10  text-amber-300  border-amber-500/40",
  WEEKEND_REPLAY: "bg-zinc-800/60   text-zinc-400   border-zinc-700",
  CLOSED:         "bg-zinc-800/60   text-zinc-400   border-zinc-700",
};

/**
 * @param {object} props
 * @param {string} props.sessionState
 * @param {boolean} props.autoRefreshEnabled
 * @param {() => void} props.onToggleAutoRefresh
 * @param {() => void} props.onRefreshNow
 * @param {boolean} [props.refreshInFlight]
 * @param {number|null} [props.quoteAgeMs]
 * @param {number|null} [props.analyticsAgeMs]
 * @param {string} [props.policyReason]   one-liner from refreshPolicyForSession
 */
export default function RefreshStatusBar({
  sessionState,
  autoRefreshEnabled,
  onToggleAutoRefresh,
  onRefreshNow,
  refreshInFlight = false,
  quoteAgeMs = null,
  analyticsAgeMs = null,
  policyReason = "",
}) {
  const replayOnly = isReplayOnlySession(sessionState);
  const freshness = freshnessForCandidate({ quoteAgeMs, analyticsAgeMs });
  const freshTone = FRESH_TONE[freshness] || FRESH_TONE.UNKNOWN;
  const sessTone = SESSION_TONE[sessionState] || SESSION_TONE.CLOSED;
  const ageDisplay = analyticsAgeMs != null
    ? humanizeAge(analyticsAgeMs)
    : (quoteAgeMs != null ? humanizeAge(quoteAgeMs) : "—");

  const refreshState = !autoRefreshEnabled
    ? { label: "Paused · Manual refresh", tone: "bg-rose-500/10 text-rose-300 border-rose-500/40" }
    : replayOnly
      ? { label: "Auto paused · Replay-only session", tone: "bg-zinc-800/60 text-zinc-400 border-zinc-700" }
      : { label: "Live · Auto refresh active", tone: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40" };

  return (
    <header
      style={{
        background: COCKPIT_PALETTE.stripBg,
        borderBottom: `1px solid ${COCKPIT_PALETTE.border}`,
        padding: "8px 16px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        minWidth: 0,
      }}
      aria-label="Refresh status bar"
    >
      {/* Session pill */}
      <span
        className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${sessTone}`}
        title={SESSION_LABEL[sessionState] || sessionState}
      >
        {sessionState.replace(/_/g, " ")}
      </span>

      {/* Refresh state pill */}
      <span
        className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${refreshState.tone}`}
        title={policyReason || ""}
      >
        {refreshInFlight ? "Refreshing…" : refreshState.label}
      </span>

      {/* Freshness pill */}
      <span
        className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${freshTone}`}
        title={`${FRESHNESS_LABEL[freshness]} — last analytics ${ageDisplay}`}
      >
        {FRESHNESS_LABEL[freshness]}
        {ageDisplay !== "—" && <span className="ml-1 opacity-70">· {ageDisplay}</span>}
      </span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Toggle + manual refresh */}
      <button
        type="button"
        onClick={onToggleAutoRefresh}
        title={autoRefreshEnabled ? "Pause auto-refresh" : "Resume auto-refresh"}
        className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
          autoRefreshEnabled
            ? "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
            : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        }`}
      >
        {autoRefreshEnabled ? "Pause" : "Resume"}
      </button>
      <button
        type="button"
        onClick={onRefreshNow}
        disabled={refreshInFlight}
        title="Refresh now"
        className="rounded border border-zinc-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
      >
        {refreshInFlight ? "…" : "Refresh now"}
      </button>
    </header>
  );
}
