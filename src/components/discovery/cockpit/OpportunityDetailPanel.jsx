// =====================================================
// OPPORTUNITY DETAIL PANEL (Phase 4.7.2)
// =====================================================
// Right column (40%) of the cockpit lower split. Renamed
// from DetailSidePanel. Capital impact section now masks
// dollar amounts when ctx.hideBalances is true.
//
// Sections (in order):
//   A. Summary
//   B. Trade Construction
//   C. Capital impact          (masked when hideBalances)
//   D. Practical insights
//   E. Technical context
//   F. News / market insight
//   G. Why this ranks high
//   H. Risks to verify
//
// Hard rules:
//   - PURE presentational. Reads view-model row +
//     trade context + capital context only.
//   - Never exposes scoreBreakdown / weights / probability
//     internals / Monte Carlo / IV percentiles / debug.
//   - Renders "—" for missing values; never fabricates.
//   - Capital values are NEVER logged. Mask is applied
//     at the render layer only.
// =====================================================

import React, { useEffect, useState } from "react";
import {
  ScoreRing,
  ActionPill,
  BundlePills,
  ReasonList,
  fitToneClass,
} from "./cockpitPrimitives.jsx";
import TradeConstructionSection from "../TradeConstructionSection.jsx";
import MarketIntelligencePanel from "./MarketIntelligencePanel.jsx";
import { maskMoney } from "../../../lib/capital/capitalContext.js";
import { COCKPIT_PALETTE, COCKPIT_SCROLL_CLASS } from "./cockpitTheme.js";

/**
 * @param {object} props
 * @param {object|null} props.row                       view-model row for selected symbol
 * @param {object|null} [props.tradeContext]            buildTradeConstructionContext output
 * @param {object|null} [props.summary]                 view-model summary
 * @param {object|null} [props.providerHealth]          ThetaData provider health
 * @param {Array<object>|null} [props.newsItems]        future Phase 4.9 wiring
 * @param {object|null} [props.capitalCtx]              CapitalContext (private)
 */
export default function OpportunityDetailPanel({
  row,
  tradeContext = null,
  summary = null,
  providerHealth = null,
  newsItems = null,
  capitalCtx = null,
  // Phase 4.7.4: bottom-action-bar wiring. Consumed from useCockpitActions
  // in LethalBoardPage. All four are no-ops by default so the component
  // still renders standalone in tests.
  isWatching = () => false,
  isCandidate = () => false,
  getAlert = () => null,
  onToggleWatch = () => {},
  onToggleCandidate = () => {},
  onSetAlert = () => {},
  onClearAlert = () => {},
}) {
  if (!row) {
    return (
      <aside style={{
        background: COCKPIT_PALETTE.panelBg,
        border: `1px solid ${COCKPIT_PALETTE.border}`,
        borderRadius: 12,
        padding: 16,
        height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: COCKPIT_PALETTE.textFaint, fontSize: 13,
      }} aria-label="Selected ticker detail (none)">
        Select a candidate to see its detail panel.
      </aside>
    );
  }

  return (
    <aside style={{
      background: COCKPIT_PALETTE.panelBg,
      border: `1px solid ${COCKPIT_PALETTE.border}`,
      borderRadius: 12,
      display: "flex", flexDirection: "column",
      minHeight: 0, minWidth: 0, height: "100%",
      overflow: "hidden",
    }} aria-label="Selected ticker detail">

      {/* Fidelity-style quote header (title left + price right) */}
      <QuoteHeader row={row} tradeContext={tradeContext} />

      {/* Scrollable body */}
      <div className={COCKPIT_SCROLL_CLASS}
           style={{
             flex: "1 1 auto", minHeight: 0,
             overflowY: "auto", overflowX: "hidden",
             padding: 16,
           }}>
        <div className="space-y-6">
          <SectionA_Summary row={row} summary={summary} />
          <SectionB_TradeConstruction tradeContext={tradeContext} />
          <SectionRangeBars row={row} tradeContext={tradeContext} />
          <SectionC_CapitalImpact row={row} tradeContext={tradeContext}
            summary={summary} capitalCtx={capitalCtx} />
          {/* Phase 4.7.5: probability + IV + chart-context fields */}
          <SectionProbability row={row} tradeContext={tradeContext} />
          <SectionD_PracticalInsights row={row} summary={summary}
            tradeContext={tradeContext} providerHealth={providerHealth} />
          <SectionE_TechnicalContext tradeContext={tradeContext} />
          <SectionF_NewsInsight items={newsItems} />
          <SectionG_WhyHigh row={row} />
          {/* Phase 4.7.5: trader-facing decision aids */}
          <SectionWhatUpgrades row={row} tradeContext={tradeContext} />
          <SectionWhatInvalidates row={row} tradeContext={tradeContext} />
          <SectionExecutionPlan row={row} tradeContext={tradeContext} />
          <SectionH_Risks row={row} tradeContext={tradeContext} providerHealth={providerHealth} />
        </div>
      </div>

      {/* Bottom action bar — Watch / Candidate / Simulate / Alert */}
      <DetailActionBar
        row={row}
        tradeContext={tradeContext}
        watching={isWatching(row.symbol)}
        candidate={isCandidate(row.symbol)}
        alert={getAlert(row.symbol)}
        onToggleWatch={() => onToggleWatch(row.symbol)}
        onToggleCandidate={() => onToggleCandidate(row.symbol, {
          score: row.score,
          action: row.action,
          capitalFit: row.capitalFit,
        })}
        onSetAlert={(target, direction) => onSetAlert(row.symbol, target, direction)}
        onClearAlert={() => onClearAlert(row.symbol)} />
    </aside>
  );
}

// --------------------------------------------------
// QUOTE HEADER (Fidelity-style)
// --------------------------------------------------

function QuoteHeader({ row, tradeContext }) {
  const price = parsePrice(tradeContext?.currentPrice ?? tradeContext?.suggestedStrike);
  const mid = tradeContext?.mid != null ? Number(tradeContext.mid) : null;
  const bid = tradeContext?.bid != null ? Number(tradeContext.bid) : null;
  const ask = tradeContext?.ask != null ? Number(tradeContext.ask) : null;
  return (
    <header style={{
      flex: "none", padding: 16,
      borderBottom: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      gap: 12, minWidth: 0,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 22, fontWeight: 700, letterSpacing: "0.02em",
          color: COCKPIT_PALETTE.accentTeal,
          ...truncate,
        }}>
          {row.symbol}
          {row.isBestUseOfCapital && (
            <span style={{ marginLeft: 8, fontSize: 11, color: COCKPIT_PALETTE.accentTeal }}>
              ★ BEST USE
            </span>
          )}
        </div>
        <div style={{
          fontSize: 11, color: COCKPIT_PALETTE.textDim, marginTop: 4,
          ...truncate,
        }}>
          {row.primaryType ? humanize(row.primaryType) : "—"}
          {" · rank #"}{row.rank}
          {" · score "}{row.score}
        </div>
      </div>

      <div style={{ textAlign: "right", flex: "none" }}>
        <div style={{
          fontSize: 22, fontWeight: 700, color: COCKPIT_PALETTE.text,
          fontFeatureSettings: "'tnum'",
        }}>
          {price != null ? `$${price.toFixed(2)}` : "—"}
        </div>
        <div style={{
          fontSize: 11, color: COCKPIT_PALETTE.textDim, marginTop: 4,
          fontFeatureSettings: "'tnum'",
        }}>
          {bid != null && ask != null
            ? `bid $${bid.toFixed(2)}  ·  ask $${ask.toFixed(2)}`
            : mid != null
              ? `mid $${mid.toFixed(2)}`
              : "no live quote"}
        </div>
      </div>
    </header>
  );
}

// --------------------------------------------------
// RANGE BARS (ATR range, Bid/Ask range)
// --------------------------------------------------

function SectionRangeBars({ row, tradeContext }) {
  const tc = tradeContext || {};
  const price = parsePrice(tc.currentPrice);
  const atr = parsePrice(tc.atr);

  // ATR-based range (price ± 1× ATR) — gives the operator a sense of where
  // today's likely high/low sits given typical volatility. We do not have
  // a live day-range or 52-week-range without additional fetches; this is
  // an honest, derived range from data we already have.
  const atrLow = price != null && atr != null ? price - atr : null;
  const atrHigh = price != null && atr != null ? price + atr : null;

  const bid = tc.bid != null ? Number(tc.bid) : null;
  const ask = tc.ask != null ? Number(tc.ask) : null;

  return (
    <section>
      <SectionHeader title="Range" />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <RangeBar
          label="ATR range"
          low={atrLow} high={atrHigh} marker={price}
          unit="$" hint="±1 ATR around current price" />
        <RangeBar
          label="Bid / ask"
          low={bid} high={ask} marker={tc.mid != null ? Number(tc.mid) : null}
          unit="$" hint="live quote spread" />
      </div>
    </section>
  );
}

function RangeBar({ label, low, high, marker, unit = "", hint }) {
  const valid = Number.isFinite(low) && Number.isFinite(high) && high > low;
  const markerPct = valid && Number.isFinite(marker)
    ? Math.max(0, Math.min(1, (marker - low) / (high - low)))
    : null;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: 8, marginBottom: 6, minWidth: 0,
      }}>
        <span style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
                        color: COCKPIT_PALETTE.textDim }}>{label}</span>
        <span style={{ fontSize: 10, color: COCKPIT_PALETTE.textFaint, ...truncate }}>{hint}</span>
      </div>
      <div style={{ position: "relative", height: 6,
                    background: COCKPIT_PALETTE.nestedBg,
                    borderRadius: 3, overflow: "hidden" }}>
        {valid && (
          <div style={{
            position: "absolute", top: 0, bottom: 0,
            left: 0, right: 0,
            background: `linear-gradient(90deg, ${COCKPIT_PALETTE.border}, ${COCKPIT_PALETTE.accentTeal}33, ${COCKPIT_PALETTE.border})`,
          }} />
        )}
        {markerPct != null && (
          <div style={{
            position: "absolute", top: -3, bottom: -3,
            left: `${markerPct * 100}%`,
            width: 2,
            background: COCKPIT_PALETTE.accentTeal,
            transform: "translateX(-1px)",
          }} aria-label={`marker at ${marker}`} />
        )}
      </div>
      <div style={{
        marginTop: 4, display: "flex", justifyContent: "space-between",
        fontSize: 11, color: COCKPIT_PALETTE.textDim,
        fontFeatureSettings: "'tnum'",
      }}>
        <span>{Number.isFinite(low) ? `${unit}${Number(low).toFixed(2)}` : "—"}</span>
        <span>{Number.isFinite(high) ? `${unit}${Number(high).toFixed(2)}` : "—"}</span>
      </div>
    </div>
  );
}

// --------------------------------------------------
// BOTTOM ACTION BAR — Watch / Candidate / Simulate / Alert
// --------------------------------------------------

function DetailActionBar({
  row,
  tradeContext,
  watching,
  candidate,
  alert,
  onToggleWatch,
  onToggleCandidate,
  onSetAlert,
  onClearAlert,
}) {
  // Per-symbol UI state for the inline expansions. Resets when the row
  // (selected symbol) changes so we don't carry stale Simulate/Alert
  // panels across selections.
  const [open, setOpen] = useState(null);   // "simulate" | "alert" | null
  useEffect(() => { setOpen(null); }, [row.symbol]);

  const closePanel = () => setOpen(null);
  const togglePanel = (which) => setOpen((prev) => (prev === which ? null : which));

  return (
    <div role="group" aria-label="Detail actions"
         style={{
           flex: "none",
           borderTop: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
           background: COCKPIT_PALETTE.consoleBg,
         }}>
      {/* Inline expansion (above the buttons so it doesn't get hidden
          behind the page boundary). Visible only when an expander is open. */}
      {open === "simulate" && (
        <SimulatePanel row={row} tradeContext={tradeContext} onClose={closePanel} />
      )}
      {open === "alert" && (
        <AlertPanel
          row={row}
          tradeContext={tradeContext}
          alert={alert}
          onSubmit={(target, direction) => { onSetAlert(target, direction); closePanel(); }}
          onClear={() => { onClearAlert(); closePanel(); }}
          onClose={closePanel} />
      )}

      <div style={{
        padding: 12,
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 8,
      }}>
        <ActionButton
          label={watching ? "Watching" : "Watch"}
          hint={watching ? `Stop watching ${row.symbol}` : `Track ${row.symbol}`}
          active={watching}
          onClick={onToggleWatch} />
        <ActionButton
          label={candidate ? "Candidate ✓" : "Candidate"}
          hint={candidate ? "Remove from candidates" : "Promote to candidate list"}
          active={candidate}
          onClick={onToggleCandidate} />
        <ActionButton
          label="Simulate"
          hint="Open trade simulator"
          active={open === "simulate"}
          onClick={() => togglePanel("simulate")} />
        <ActionButton
          label={alert ? `Alert: $${Number(alert.target).toFixed(2)}` : "Alert"}
          hint={alert ? "Edit or clear price alert" : "Set price alert"}
          active={!!alert || open === "alert"}
          tone="green"
          onClick={() => togglePanel("alert")} />
      </div>
    </div>
  );
}

function ActionButton({ label, hint, active, tone = "default", onClick }) {
  const isGreen = tone === "green" || (active && tone !== "default");
  // Active state uses teal accent for non-green buttons (Watch / Candidate /
  // Simulate). Alert always uses green when active.
  let bg, fg, br;
  if (active) {
    if (tone === "green") {
      bg = "rgba(34,197,94,0.18)"; fg = COCKPIT_PALETTE.accentGreen; br = COCKPIT_PALETTE.accentGreen;
    } else {
      bg = "rgba(20,184,166,0.15)"; fg = COCKPIT_PALETTE.accentTeal; br = COCKPIT_PALETTE.accentTeal;
    }
  } else if (tone === "green") {
    bg = "rgba(34,197,94,0.08)"; fg = COCKPIT_PALETTE.accentGreen; br = COCKPIT_PALETTE.accentGreen;
  } else {
    bg = COCKPIT_PALETTE.nestedBg; fg = COCKPIT_PALETTE.text; br = COCKPIT_PALETTE.border;
  }
  return (
    <button
      type="button"
      title={hint}
      onClick={onClick}
      aria-pressed={!!active}
      style={{
        background: bg,
        border: `1px solid ${br}`,
        color: fg,
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        cursor: "pointer",
        minWidth: 0,
        ...truncate,
      }}>
      {label}
    </button>
  );
}

// --------------------------------------------------
// SIMULATE PANEL — inline what-if from existing trade context
// --------------------------------------------------

function SimulatePanel({ row, tradeContext, onClose }) {
  const tc = tradeContext || {};
  const strike = parsePrice(tc.suggestedStrike);
  const mid    = tc.mid != null ? Number(tc.mid) : null;
  const bid    = tc.bid != null ? Number(tc.bid) : null;
  const ask    = tc.ask != null ? Number(tc.ask) : null;
  const collat = parsePrice(tc.estimatedCollateral);
  const dte    = parsePrice(tc.resolvedExpirationDte ?? tc.expirationDte);

  // Premium income proxy: if filled at mid (or estimated premium), what's
  // the credit per contract and the simple ROI on collateral?
  // 1 short put = 100 shares. Premium × 100 = credit per contract.
  const premium = mid ?? parsePrice(tc.estimatedPremium);
  const credit  = premium != null ? premium * 100 : null;
  const roi     = (credit != null && collat) ? (credit / collat) * 100 : null;
  const annROI  = (roi != null && dte && dte > 0) ? (roi / dte) * 365 : null;
  const breakeven = (strike != null && premium != null) ? (strike - premium) : null;

  return (
    <div style={{
      borderBottom: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
      background: COCKPIT_PALETTE.nestedBg,
      padding: 12,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 8,
      }}>
        <div style={{
          fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
          color: COCKPIT_PALETTE.textDim,
        }}>
          Trade simulation · {row.symbol}
        </div>
        <button onClick={onClose}
          style={{
            background: "transparent", border: "none",
            color: COCKPIT_PALETTE.textFaint, fontSize: 11, cursor: "pointer",
          }}>
          Close
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, fontSize: 11 }}>
        <Stat label="Strike"         value={strike != null ? `$${strike.toFixed(2)}` : "—"} />
        <Stat label="Mid (premium)"  value={premium != null ? `$${premium.toFixed(2)}` : "—"}
              tone="green" />
        <Stat label="Bid / ask"      value={bid != null && ask != null ? `$${bid.toFixed(2)} / $${ask.toFixed(2)}` : "—"} />
        <Stat label="DTE"            value={dte != null ? `${dte}d` : "—"} />
        <Stat label="Collateral"     value={collat != null ? `$${collat.toLocaleString()}` : "—"} />
        <Stat label="Credit / contract"
              value={credit != null ? `$${credit.toFixed(0)}` : "—"} tone="green" />
        <Stat label="ROI on collateral"
              value={roi != null ? `${roi.toFixed(2)}%` : "—"} />
        <Stat label="Annualized ROI"
              value={annROI != null ? `${annROI.toFixed(1)}%` : "—"}
              tone={annROI != null && annROI > 25 ? "green" : "default"} />
        <Stat label="Breakeven"
              value={breakeven != null ? `$${breakeven.toFixed(2)}` : "—"} />
      </div>
      <div style={{
        marginTop: 8, fontSize: 10, color: COCKPIT_PALETTE.textFaint, lineHeight: 1.5,
      }}>
        Derived from current trade-construction context. Verify against your broker chain
        before entry. No order placement is wired.
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }) {
  const fg = tone === "green" ? COCKPIT_PALETTE.accentGreen
           : tone === "warn"  ? COCKPIT_PALETTE.accentAmber
           : tone === "bad"   ? COCKPIT_PALETTE.accentRed
           :                    COCKPIT_PALETTE.text;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
        color: COCKPIT_PALETTE.textFaint,
      }}>{label}</div>
      <div style={{
        fontSize: 12, fontWeight: 700, color: fg,
        fontFeatureSettings: "'tnum'", ...truncate,
      }}>{value}</div>
    </div>
  );
}

// --------------------------------------------------
// ALERT PANEL — inline price-alert form
// --------------------------------------------------

function AlertPanel({ row, tradeContext, alert, onSubmit, onClear, onClose }) {
  const defaultTarget = (() => {
    if (alert?.target) return String(alert.target);
    const price = parsePrice(tradeContext?.currentPrice);
    return price != null ? price.toFixed(2) : "";
  })();
  const [target, setTarget] = useState(defaultTarget);
  const [direction, setDirection] = useState(alert?.direction || "below");

  // Reset when row changes
  useEffect(() => {
    setTarget(alert?.target ? String(alert.target) : "");
    setDirection(alert?.direction || "below");
  }, [row.symbol, alert?.target, alert?.direction]);

  const submit = (e) => {
    e?.preventDefault?.();
    const t = Number(target);
    if (!Number.isFinite(t) || t <= 0) return;
    onSubmit(t, direction);
  };

  return (
    <form onSubmit={submit}
          style={{
            borderBottom: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
            background: COCKPIT_PALETTE.nestedBg,
            padding: 12,
          }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 8,
      }}>
        <div style={{
          fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
          color: COCKPIT_PALETTE.textDim,
        }}>
          Price alert · {row.symbol}
        </div>
        <button type="button" onClick={onClose}
          style={{
            background: "transparent", border: "none",
            color: COCKPIT_PALETTE.textFaint, fontSize: 11, cursor: "pointer",
          }}>
          Close
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          style={{
            background: COCKPIT_PALETTE.inputBg,
            border: `1px solid ${COCKPIT_PALETTE.border}`,
            color: COCKPIT_PALETTE.text,
            borderRadius: 6,
            padding: "6px 8px",
            fontSize: 12,
          }}>
          <option value="above">Notify when above</option>
          <option value="below">Notify when below</option>
        </select>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Target price"
          style={{
            flex: 1,
            background: COCKPIT_PALETTE.inputBg,
            border: `1px solid ${COCKPIT_PALETTE.border}`,
            color: COCKPIT_PALETTE.text,
            borderRadius: 6,
            padding: "6px 8px",
            fontSize: 12,
            minWidth: 0,
          }} />
        <button type="submit"
          style={{
            background: "rgba(34,197,94,0.12)",
            border: `1px solid ${COCKPIT_PALETTE.accentGreen}`,
            color: COCKPIT_PALETTE.accentGreen,
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
            cursor: "pointer",
          }}>
          {alert ? "Update" : "Set"}
        </button>
        {alert && (
          <button type="button" onClick={onClear}
            style={{
              background: "transparent",
              border: `1px solid ${COCKPIT_PALETTE.accentRed}`,
              color: COCKPIT_PALETTE.accentRed,
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
              cursor: "pointer",
            }}>
            Clear
          </button>
        )}
      </div>
      <div style={{
        marginTop: 8, fontSize: 10, color: COCKPIT_PALETTE.textFaint, lineHeight: 1.5,
      }}>
        Alerts are stored locally on this device. Notification delivery (browser
        push / email) ships in a later phase.
      </div>
    </form>
  );
}

const truncate = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

function parsePrice(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function humanize(s) {
  return String(s || "").replace(/_candidate$/, "").replace(/_/g, " ");
}

// --------------------------------------------------
// A. Summary
// --------------------------------------------------

function SectionA_Summary({ row, summary }) {
  const fitTone = fitToneClass(row.capitalFitCode);
  return (
    <section>
      <SectionHeader title="Summary" />
      <div className="flex items-start gap-3">
        <ScoreRing score={row.score} size={48} stroke={4} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-base font-bold">{row.symbol}</span>
            {row.isBestUseOfCapital && <span className="text-emerald-400 text-xs">★ best use</span>}
            <span className="text-[10px] text-zinc-500">rank #{row.rank}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <ActionPill action={row.action} actionCode={row.actionCode} />
            <span className={`text-[11px] ${fitTone}`}>fit {row.capitalFit}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <KV label="Action"        value={row.action} />
        <KV label="Score"         value={row.score} />
        <KV label="Capital fit"   value={row.capitalFit} valueClass={fitTone} />
        <KV label="Signal"        value={row.signalQuality} />
        <KV label="Regime"        value={summary?.regime || "—"} />
        <KV label="Regime align"  value={row.regimeAlignment || "—"} />
        <KV label="Primary type"  value={row.primaryType || "—"} />
        <KV label="Market mode"   value={summary?.marketMode || "—"} />
      </div>
      {row.bundles?.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Bundle exposure</div>
          <BundlePills bundles={row.bundles} max={4} />
        </div>
      )}
    </section>
  );
}

// --------------------------------------------------
// B. Trade Construction
// --------------------------------------------------

function SectionB_TradeConstruction({ tradeContext }) {
  return (
    <section>
      <SectionHeader title="Trade construction" />
      <TradeConstructionSection tradeContext={tradeContext} />
    </section>
  );
}

// --------------------------------------------------
// C. Capital impact (masked when hideBalances)
// --------------------------------------------------

function SectionC_CapitalImpact({ row, tradeContext, summary, capitalCtx }) {
  const fitTone = fitToneClass(row.capitalFitCode);
  const hide = !!capitalCtx?.hideBalances;

  // Prefer the operator's saved capital values when they exist, falling
  // back to the scanner summary. All dollar values pass through maskMoney
  // so the same panel is safe to screenshot when "Hide balances" is on.
  const collateralRaw = numericOrNull(row.estimatedCollateral) ?? numericOrNull(tradeContext?.estimatedCollateral);
  const deployableRaw = numericOrNull(capitalCtx?.deployableCapital) ?? parseSummaryCash(summary?.deployableCash);
  const remainingRaw  = parseSummaryCash(summary?.remainingDeployableCash);

  return (
    <section>
      <SectionHeader title="Capital impact" />
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <KV label="Estimated collateral" value={maskMoney(collateralRaw, hide)}
            valueClass={
              row.capitalFitCode === "not_affordable" ? "text-rose-400" : "text-zinc-200"
            } />
        <KV label="Capital fit" value={row.capitalFit} valueClass={fitTone} />
        <KV label="Deployable cash" value={maskMoney(deployableRaw, hide)} />
        <KV label="Remaining deployable" value={maskMoney(remainingRaw, hide)} />
        <KV label="Sizing bias" value={summary?.sizingBias || "—"} />
        <KV label="Pressure" value={summary?.capitalPressureLevel || "—"} />
      </div>
      {row.capitalFitCode === "not_affordable" && (
        <div className="mt-2 text-[11px] text-rose-400">
          {hide
            ? "Capital blocked — this trade exceeds your available cash."
            : "This trade exceeds available cash. Verify before entry."}
        </div>
      )}
      {row.capitalFitCode === "poor" && (
        <div className="mt-2 text-[11px] text-amber-400">
          {hide
            ? "Capital tight — sizes most of your remaining budget."
            : "Trade ties up most of your remaining deployable budget — size carefully."}
        </div>
      )}
    </section>
  );
}

function numericOrNull(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseSummaryCash(v) {
  // viewModel summary stringifies dollar values like "$60,000". Strip non-numeric.
  if (v == null) return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// --------------------------------------------------
// D. Practical insights
// --------------------------------------------------

function SectionD_PracticalInsights({ row, summary, tradeContext, providerHealth }) {
  const insights = buildPracticalInsights({ row, summary, tradeContext, providerHealth });
  return (
    <section>
      <SectionHeader title="Practical insights" />
      {insights.length === 0 ? (
        <div className="text-[11px] text-zinc-500">No additional context surfaced.</div>
      ) : (
        <ul className="space-y-1.5 text-[12px]">
          {insights.map((line, i) => (
            <li key={i} className="flex items-start gap-2">
              <ToneDot tone={line.tone} />
              <span className="text-zinc-200 leading-snug">{line.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function buildPracticalInsights({ row, summary, tradeContext, providerHealth }) {
  const out = [];
  if (row.regimeAlignment === "aligned") {
    out.push({ tone: "good", text: "Regime supports this setup — operator can lean in if other criteria pass." });
  } else if (row.regimeAlignment === "mismatch") {
    out.push({ tone: "warn", text: "Regime currently does not favor this setup — size cautiously." });
  }
  if (row.actionCode === "option_candidate") {
    out.push({ tone: "good", text: "Action: prepare a short-put entry once Trigger Engine timing confirms." });
  } else if (row.actionCode === "deep_scan") {
    out.push({ tone: "good", text: "Action: deep scan — review against existing watch list before entry." });
  } else if (row.actionCode === "watch") {
    out.push({ tone: "warn", text: "Action: watch — wait for tighter setup or better timing." });
  } else if (String(row.actionCode || "").startsWith("skip")) {
    out.push({ tone: "bad", text: "Action: skip — does not meet the engine's bar in this regime." });
  }
  if (row.premiumIsLive) {
    out.push({ tone: "good", text: "Premium is live — bid/ask reflect chain data, not estimates." });
  } else if (tradeContext?.premiumSource === "estimated") {
    out.push({ tone: "warn", text: "Premium is estimated — verify against your broker chain before entry." });
  } else {
    out.push({ tone: "warn", text: "Premium unavailable — option pricing is unknown right now." });
  }
  if (tradeContext?.spreadWidthLabel === "tight") {
    out.push({ tone: "good", text: "Spread is tight — execution friction should be low." });
  } else if (tradeContext?.spreadWidthLabel === "wide") {
    out.push({ tone: "warn", text: "Spread is wide — verify liquidity and consider a limit price." });
  }
  if (row.capitalFitCode === "excellent") {
    out.push({ tone: "good", text: "Capital fit excellent — capital available for this trade." });
  } else if (row.capitalFitCode === "not_affordable") {
    out.push({ tone: "bad", text: "Capital blocked — this trade exceeds your available cash." });
  } else if (row.capitalFitCode === "poor") {
    out.push({ tone: "warn", text: "Capital tight — most of remaining budget is consumed." });
  }
  if (providerHealth && providerHealth.status !== "available") {
    out.push({
      tone: "warn",
      text: `Options provider ${providerHealth.status}${providerHealth.reason ? ` (${providerHealth.reason})` : ""} — live chain data may be stale or unavailable.`,
    });
  }
  return out;
}

// --------------------------------------------------
// Probability / IV  (Phase 4.7.5)
// --------------------------------------------------

function SectionProbability({ row, tradeContext }) {
  const tc = tradeContext || {};
  // The discovery engine exposes a probability_status (validated|unverified)
  // via row.signalQuality. Raw probabilities are intentionally NOT exposed
  // to the cockpit (engine-internal). We surface qualitative status only.
  const aboveLabel = row.signalQuality === "validated"
    ? "Validated by engine"
    : "Not validated yet";
  const touchLabel = row.signalQuality === "validated"
    ? "Validated by engine"
    : "Not validated yet";
  // IV percentile is provider-dependent. Surface as "—" when missing rather
  // than fabricating. liquidityGrade is the closest verified-data proxy
  // for chain quality.
  const ivLabel = "—";
  return (
    <section>
      <SectionHeader title="Probability · IV" />
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <KV label="Probability above strike" value={aboveLabel}
            valueClass={row.signalQuality === "validated" ? "text-emerald-400" : "text-zinc-400"} />
        <KV label="Touch probability" value={touchLabel}
            valueClass={row.signalQuality === "validated" ? "text-emerald-400" : "text-zinc-400"} />
        <KV label="IV percentile" value={ivLabel} />
        <KV label="Liquidity grade" value={tc.liquidityGrade || "unknown"} />
      </div>
      {row.signalQuality !== "validated" && (
        <div className="mt-2 text-[10px]" style={{ color: "#9ca3af", lineHeight: 1.5 }}>
          Probabilities are not yet validated for this candidate. The engine
          surfaces qualitative status only — raw probabilities stay internal.
        </div>
      )}
    </section>
  );
}

// --------------------------------------------------
// What upgrades it / What invalidates it / Execution plan
// (Phase 4.7.5 — derived from existing view-model + trade context)
// --------------------------------------------------

function SectionWhatUpgrades({ row, tradeContext }) {
  const items = buildUpgrades(row, tradeContext);
  return (
    <section>
      <SectionHeader title="What upgrades this" />
      {items.length === 0 ? (
        <div className="text-[11px] text-zinc-500">
          Already at the engine's bar for this regime.
        </div>
      ) : (
        <ul className="space-y-1.5 text-[12px]">
          {items.map((line, i) => (
            <li key={i} className="flex items-start gap-2">
              <ToneDot tone="good" />
              <span className="text-zinc-200 leading-snug">{line}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function buildUpgrades(row, tc = {}) {
  const out = [];
  if (!row.premiumIsLive) out.push("Live ThetaData chain available for this symbol.");
  if (row.regimeAlignment !== "aligned") out.push("Regime aligns with the setup type.");
  if (tc?.spreadWidthLabel === "wide") out.push("Spread tightens during regular session.");
  if (tc?.liquidityGrade === "unknown") out.push("Liquidity grade verified from chain data.");
  if (row.signalQuality !== "validated") out.push("Probability validated against the existing engine.");
  if (row.capitalFitCode === "poor" || row.capitalFitCode === "not_affordable") {
    out.push("Capital fit improves (smaller strike or more deployable cash).");
  }
  return out;
}

function SectionWhatInvalidates({ row, tradeContext }) {
  const items = buildInvalidators(row, tradeContext);
  return (
    <section>
      <SectionHeader title="What invalidates this" />
      {items.length === 0 ? (
        <div className="text-[11px] text-zinc-500">
          No specific invalidators surfaced — review risks before entry anyway.
        </div>
      ) : (
        <ul className="space-y-1.5 text-[12px]">
          {items.map((line, i) => (
            <li key={i} className="flex items-start gap-2">
              <ToneDot tone="bad" />
              <span className="text-zinc-200 leading-snug">{line}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function buildInvalidators(row, tc = {}) {
  const out = [];
  if (row.regimeAlignment === "mismatch") out.push("Regime turns hostile to this setup.");
  if (row.capitalFitCode === "not_affordable") out.push("Capital remains insufficient for entry.");
  if (tc?.spreadWidthLabel === "wide") out.push("Spread stays wide into regular session — execution risk.");
  if (tc?.premiumSource === "unavailable") out.push("Option chain remains unavailable at entry time.");
  if (tc?.resolvedExpirationMatched === "fallback") out.push("Resolver fallback expiration is the only option — chain too thin.");
  if (row.displacedBy) out.push(`Displaced by ${row.displacedBy} — capital better used there.`);
  return out;
}

function SectionExecutionPlan({ row, tradeContext }) {
  const steps = buildExecutionSteps(row, tradeContext);
  return (
    <section>
      <SectionHeader title="Execution plan" />
      <ol className="space-y-1.5 text-[12px]" style={{ counterReset: "step", paddingLeft: 0 }}>
        {steps.map((s, i) => (
          <li key={i}
              style={{
                display: "grid", gridTemplateColumns: "20px 1fr",
                alignItems: "start", gap: 8,
              }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#14b8a6",
              fontFeatureSettings: "'tnum'",
            }}>
              {i + 1}.
            </span>
            <span style={{ color: "#e5e7eb", lineHeight: 1.5 }}>{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function buildExecutionSteps(row, tc = {}) {
  const steps = [];
  // Step 1 — confirmation
  if (row.actionCode === "option_candidate") {
    steps.push("Wait for Trigger Engine timing confirmation on this symbol.");
  } else if (row.actionCode === "deep_scan") {
    steps.push("Open the existing watch list and review historical setups for this symbol.");
  } else if (row.actionCode === "watch") {
    steps.push("Add to watch list and monitor for tighter setup.");
  } else if (String(row.actionCode || "").startsWith("skip")) {
    steps.push("Skip — does not meet the engine's bar in this regime.");
  } else {
    steps.push("Review Trigger Engine state for this symbol before considering entry.");
  }
  // Step 2 — broker verify (always)
  steps.push("Verify the broker option chain matches the suggested strike, expiration, bid/ask.");
  // Step 3 — sizing
  if (row.capitalFitCode === "excellent" || row.capitalFitCode === "good") {
    steps.push("Size within Capital Settings deployable cash; respect max-single-trade %.");
  } else {
    steps.push("Reconcile capital fit before sizing — adjust strike or skip.");
  }
  // Step 4 — limit price
  if (tc?.spreadWidthLabel === "tight") {
    steps.push("Submit at mid as a limit; expect a quick fill.");
  } else {
    steps.push("Submit at limit between bid and mid; do not chase a wide spread.");
  }
  // Step 5 — record
  steps.push("Record the entry to alert history (Run & record) for outcome tracking.");
  return steps;
}

// --------------------------------------------------
// E. Technical context placeholder
// --------------------------------------------------

function SectionE_TechnicalContext({ tradeContext }) {
  const tc = tradeContext || {};
  const fields = [
    ["Support",    tc.support,                                 "$"],
    ["R1",         tc.r1,                                       "$"],
    ["R2",         tc.r2,                                       "$"],
    ["ATR",        tc.atr,                                      ""],
    ["ATR × to strike", tc.atrDistanceFromStrike,               "×"],
    ["Distance: price → strike", tc.distanceFromPriceToStrike,  "$"],
    ["Distance: support → strike", tc.distanceFromSupportToStrike, "$"],
  ];
  return (
    <section>
      <SectionHeader title="Technical context" />
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {fields.map(([label, value, suffix]) => (
          <KV key={label} label={label}
              value={value == null ? "—" : `${suffix === "$" ? "$" : ""}${Number(value).toFixed(2)}${suffix === "×" ? "×" : ""}`} />
        ))}
      </div>
    </section>
  );
}

// --------------------------------------------------
// F. News / market insight placeholder
// --------------------------------------------------

function SectionF_NewsInsight({ items }) {
  return (
    <section>
      <SectionHeader title="News / market insight" />
      <MarketIntelligencePanel items={items || null} title="Headlines" />
    </section>
  );
}

// --------------------------------------------------
// G. Why this ranks high
// --------------------------------------------------

function SectionG_WhyHigh({ row }) {
  return (
    <section>
      <SectionHeader title="Why this ranks high" />
      <ReasonList title="" items={row.keyReasons} tone="good" />
      {(!row.keyReasons || row.keyReasons.length === 0) && (
        <div className="text-[11px] text-zinc-500">No specific reasons surfaced.</div>
      )}
    </section>
  );
}

// --------------------------------------------------
// H. Risks to verify
// --------------------------------------------------

function SectionH_Risks({ row, tradeContext, providerHealth }) {
  const extras = [];
  if (tradeContext?.premiumSource === "unavailable") {
    extras.push("Premium unavailable — treat option pricing as unknown.");
  }
  if (tradeContext?.spreadWidthLabel === "wide" && !row.risks?.some(r => /spread/i.test(r))) {
    extras.push("Wide bid/ask spread — verify before entry.");
  }
  if (tradeContext?.resolvedExpirationMatched === "fallback") {
    extras.push("Expiration is a resolver fallback — chain may be thin around this date.");
  }
  if (providerHealth && providerHealth.status === "terminal_not_running") {
    extras.push("ThetaData terminal not running — live data is offline this session.");
  }
  if (providerHealth && providerHealth.status === "incompatible_version") {
    extras.push("ThetaData responded with HTTP 410 (incompatible version) — adapter and Terminal are out of sync.");
  }
  extras.push("Verify broker option chain before entry.");

  const merged = [...(row.risks || []), ...extras];

  return (
    <section>
      <SectionHeader title="Risks to verify" />
      <ReasonList title="" items={merged} tone="warn" />
    </section>
  );
}

// --------------------------------------------------
// PRIMITIVES
// --------------------------------------------------

function SectionHeader({ title }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1.5">{title}</div>
  );
}

function KV({ label, value, valueClass = "text-zinc-200" }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-[12px] font-medium ${valueClass}`} style={{ fontFeatureSettings: "'tnum'" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function ToneDot({ tone }) {
  const c = tone === "good" ? "bg-emerald-500"
          : tone === "warn" ? "bg-amber-500"
          : tone === "bad"  ? "bg-rose-500"
          :                   "bg-zinc-500";
  return <span className={`mt-1.5 inline-block w-1.5 h-1.5 rounded-full ${c}`} aria-hidden="true" />;
}
