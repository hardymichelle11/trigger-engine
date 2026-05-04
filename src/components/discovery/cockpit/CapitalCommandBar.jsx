// =====================================================
// CAPITAL COMMAND BAR (Phase 4.7.2)
// =====================================================
// Full-width horizontal bar at the top of the cockpit.
// Renders five at-a-glance trading-context items, an
// "Edit Capital" button that opens the settings modal,
// and a "Hide balances" toggle that masks dollar amounts.
//
// Hard rules:
//   - PURE presentational. Reads view-model summary +
//     CapitalContext only. No engine call, no fetch.
//   - Dollar amounts are masked when ctx.hideBalances is
//     true. Mask is applied at render — values stored
//     in CapitalContext are unaffected.
//   - When CapitalContext is unconfigured (all zeros),
//     a subtle banner prompts the operator to set
//     starting capital before trusting the rankings.
// =====================================================

import React from "react";
import { maskMoney, isCapitalContextUnconfigured } from "../../../lib/capital/capitalContext.js";
import HideBalancesToggle from "./HideBalancesToggle.jsx";
import { COCKPIT_PALETTE } from "./cockpitTheme.js";

/**
 * @param {object} props
 * @param {object|null} props.summary               viewModel.summary
 * @param {object} props.capitalCtx                 CapitalContext
 * @param {object|null} [props.liveMeta]            metadata from the active scan;
 *                                                  used to surface a REPLAY pill
 *                                                  when liveMeta.replay === true.
 * @param {() => void} props.onEditCapital
 * @param {() => void} props.onToggleHideBalances
 */
export default function CapitalCommandBar({
  summary,
  capitalCtx,
  liveMeta,
  onEditCapital,
  onToggleHideBalances,
}) {
  const hide = !!capitalCtx?.hideBalances;
  const unconfigured = isCapitalContextUnconfigured(capitalCtx);

  // Prefer the operator's saved capital values for the bar's headline metrics.
  // The view-model summary still drives non-dollar fields (mode, regime, best).
  const deployable = capitalCtx?.deployableCapital ?? null;
  const pressureLabel = summary?.capitalPressureLevel || "—";
  const bestSymbol = summary?.bestUseOfCapitalSymbol || null;

  return (
    <header
      style={{
        background: COCKPIT_PALETTE.stripBg,
        borderBottom: `1px solid ${COCKPIT_PALETTE.border}`,
        padding: "10px 16px",
        minWidth: 0,
      }}
      aria-label="Capital command bar">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
        <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          Trader cockpit
        </span>
        {/* Phase 4.7.6: REPLAY pill — visible only when the active scan
            was loaded via Replay Last Close. Honest mode label so the
            operator never confuses replay analysis with live data. */}
        {liveMeta?.replay && (
          <span
            aria-label="REPLAY mode"
            title={`Replay last close · ${liveMeta?.universe?.sessionDateLabel || liveMeta?.sessionDateLabel || "previous session"}`}
            style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "3px 8px", borderRadius: 4,
              background: "rgba(245, 158, 11, 0.14)",
              border: `1px solid ${COCKPIT_PALETTE.accentAmber}`,
              color: COCKPIT_PALETTE.accentAmber,
            }}>
            ● Replay {liveMeta?.universe?.sessionDateLabel
              ? `· ${liveMeta.universe.sessionDateLabel}`
              : (liveMeta?.sessionDateLabel ? `· ${liveMeta.sessionDateLabel}` : "")}
          </span>
        )}

        <div className="flex flex-1 flex-wrap items-baseline justify-around gap-x-6 gap-y-1.5 min-w-[20rem]">
          <CommandItem
            label="Market mode"
            value={(capitalCtx?.marketMode || summary?.scannerMode || "—").replace(/_/g, " ")} />
          <CommandItem
            label="Regime"
            value={summary?.regime || "—"} />
          <CommandItem
            label="Deployable"
            value={maskMoney(deployable, hide)}
            tone={deployable > 0 ? "emerald" : "muted"} />
          <CommandItem
            label="Pressure"
            value={pressureLabel}
            tone={pressureTone(pressureLabel)} />
          <CommandItem
            label="Best"
            value={bestSymbol ? `★ ${bestSymbol}` : "—"}
            tone={bestSymbol ? "emerald" : "muted"} />
        </div>

        <div className="flex items-center gap-2">
          <HideBalancesToggle hidden={hide} onToggle={onToggleHideBalances} size="sm" />
          <button
            type="button"
            onClick={onEditCapital}
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/10 transition-colors">
            Edit capital
          </button>
        </div>
      </div>

      {unconfigured && (
        <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-300">
          Configure your capital settings to enable accurate ranking and capital-fit labels.
          {" "}
          <button onClick={onEditCapital}
            className="underline underline-offset-2 hover:text-amber-200 font-bold">
            Open settings
          </button>
        </div>
      )}
    </header>
  );
}

function CommandItem({ label, value, tone = "muted" }) {
  const toneClass = tone === "emerald" ? "text-emerald-400"
                  : tone === "warn"    ? "text-amber-400"
                  : tone === "bad"     ? "text-rose-400"
                  : tone === "good"    ? "text-emerald-400"
                  :                       "text-zinc-100";
  return (
    <div className="flex items-baseline gap-2 min-w-[6rem]">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span className={`text-sm font-bold ${toneClass}`}
            style={{ fontFeatureSettings: "'tnum'" }}>
        {value}
      </span>
    </div>
  );
}

function pressureTone(level) {
  if (level === "MAXED")    return "bad";
  if (level === "HIGH")     return "warn";
  if (level === "MODERATE") return "muted";
  if (level === "—")        return "muted";
  return "emerald";
}
