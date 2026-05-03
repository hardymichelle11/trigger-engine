// =====================================================
// ALERTS PANEL (Phase 4.7.2)
// =====================================================
// Lower-left panel showing the most recent recorded
// discovery alerts. Renamed from RecentAlertsPanel.
//
// Capital-language rule:
//   When the user has hideBalances === true, the alert
//   row never echoes dollar amounts, only abstract
//   "capital available" / "capital blocked" labels.
//   The underlying projection already excludes raw
//   dollar values, so this panel is privacy-safe by
//   default; the hint helpers are belt-and-suspenders.
//
// Hard rules:
//   - PURE presentational. Reads pre-projected alert rows
//     only. No fetch, no engine call, no internals.
//   - Identical safety as recordedAlertsView projection —
//     no scoreBreakdown / weights / probability internals.
// =====================================================

import React from "react";
import { COCKPIT_PALETTE, COCKPIT_SCROLL_CLASS } from "./cockpitTheme.js";

/**
 * @param {object} props
 * @param {Array<object>} props.alerts             sanitized projection rows
 * @param {(eventCode: string) => string} [props.alertEventLabel]
 * @param {boolean} [props.hideBalances]
 * @param {number} [props.limit]
 */
export default function AlertsPanel({
  alerts,
  alertEventLabel,
  hideBalances = false,
  limit = 8,
}) {
  const safe = Array.isArray(alerts) ? alerts.slice(0, limit) : [];

  return (
    <section
      style={{
        background: COCKPIT_PALETTE.panelBg,
        border: `1px solid ${COCKPIT_PALETTE.border}`,
        borderRadius: 12,
        display: "flex", flexDirection: "column",
        minWidth: 0, minHeight: 0, overflow: "hidden",
      }}
      aria-label="Recent discovery alerts">
      <header style={{
        flex: "none",
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
        minWidth: 0,
      }}>
        <h3 style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
                      color: COCKPIT_PALETTE.textDim }}>
          Recent alerts
        </h3>
        <span style={{ fontSize: 10, color: COCKPIT_PALETTE.textFaint }}>
          {safe.length === 0 ? "0 recorded" : `latest ${safe.length}`}
        </span>
      </header>

      <div className={COCKPIT_SCROLL_CLASS}
           style={{ flex: "1 1 auto", minHeight: 0,
                    overflowY: "auto", overflowX: "hidden",
                    padding: 16 }}>
        {safe.length === 0 ? (
          <p className="text-xs text-zinc-500 leading-snug">
            No recorded discovery alerts yet. Use{" "}
            <span className="text-emerald-300 font-bold">Run &amp; record</span> in the
            console to commit one.
          </p>
        ) : (
          <ul className="space-y-2">
            {safe.map((a, i) => (
              <AlertRow
                key={`${a.symbol}-${a.timestamp || i}`}
                alert={a}
                alertEventLabel={alertEventLabel}
                hideBalances={hideBalances} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AlertRow({ alert, alertEventLabel, hideBalances }) {
  const eventTone = alert.event === "trade_displaced_by_better_opportunity"
    ? "text-amber-400" : "text-emerald-400";
  // Capital-status hint: "available" or "blocked" — never a dollar amount.
  // The underlying projection already excludes balances; this is the safe
  // language we surface in the alerts panel regardless of hide state.
  const capitalHint = alert.bestUseOfCapital ? "capital available" : null;
  return (
    <li className="grid items-baseline text-[12px] gap-x-3 leading-snug border-b border-zinc-800/40 pb-2 last:border-0 last:pb-0"
        style={{ gridTemplateColumns: "minmax(110px, 140px) minmax(70px, 100px) 1fr" }}>
      <span className="text-zinc-500" style={{ fontFeatureSettings: "'tnum'" }}>
        {alert.timestampLabel || "—"}
      </span>
      <span>
        <span className="font-bold text-zinc-100">{alert.symbol}</span>
        {alert.bestUseOfCapital && <span className="text-emerald-400 ml-1">★</span>}
      </span>
      <span className="text-zinc-300 truncate">
        <span className={`${eventTone} font-bold`}>
          {typeof alertEventLabel === "function"
            ? alertEventLabel(alert.event)
            : alert.event}
        </span>
        {alert.action && <span className="text-zinc-500"> · {alert.action}</span>}
        {alert.score != null && <span className="text-zinc-500"> · score {alert.score}</span>}
        {capitalHint && <span className="text-emerald-400/80"> · {capitalHint}</span>}
      </span>
    </li>
  );
}
