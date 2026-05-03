// =====================================================
// OPPORTUNITY CARD (Phase 4.7.5)
// =====================================================
// Compact top-pick card. Chart-dominant with the live
// TradingView mini widget on top. Below the chart: a
// dense, decision-oriented field list.
//
// Hard rules:
//   - PURE presentational. Reads view-model row +
//     trade context only.
//   - Premium label is honest: live | estimated | unavailable.
//     When chain data is missing, surface a single clean
//     "Option chain not verified" line — never repeat
//     "premium unavailable" across multiple fields.
//   - No scoreBreakdown / weights / probability internals /
//     Monte Carlo / IV percentiles raw / debug fields.
// =====================================================

import React from "react";
import {
  ScoreRing,
  ActionPill,
  fitToneClass,
} from "./cockpitPrimitives.jsx";
import TradingViewMiniChart from "../../lethal/TradingViewMiniChart.jsx";
import { COCKPIT_PALETTE } from "./cockpitTheme.js";

/**
 * @param {object} props
 * @param {object} props.row                view-model row
 * @param {object} [props.candidate]        original scanner candidate (carries
 *                                          provider hints: exchange,
 *                                          tradingViewSymbol, hasLiveChart)
 * @param {number} props.slotIndex          0/1/2 → "#1" / "#2" / "#3"
 * @param {object|null} [props.tradeContext]
 * @param {boolean} [props.selected]
 * @param {(symbol: string) => void} [props.onSelect]
 * @param {number} [props.chartHeight]
 */
export default function OpportunityCard({
  row,
  candidate = null,
  slotIndex,
  tradeContext = null,
  selected = false,
  onSelect,
  // chartHeight is honored when explicitly passed, otherwise the chart
  // fills the remaining flex space inside the card (Phase 4.7.5.1 — fixes
  // the "card content clipped on small viewports" regression).
  chartHeight = null,
}) {
  const isBest = !!row.isBestUseOfCapital;
  const fitTone = fitToneClass(row.capitalFitCode);
  const interactive = typeof onSelect === "function";
  const handleKey = interactive
    ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(row.symbol); } }
    : undefined;
  const slotLabel = ["#1", "#2", "#3"][slotIndex] || `#${slotIndex + 1}`;

  const tc = tradeContext || {};
  const expirationLabel = tc.resolvedExpirationLabel || tc.expirationLabel || null;
  const dte = tc.resolvedExpirationDte ?? tc.expirationDte ?? null;
  const strike = numericOrNull(tc.suggestedStrike);
  const premium = numericOrNull(tc.estimatedPremium);
  const collateral = numericOrNull(tc.estimatedCollateral);
  const breakeven = (strike != null && premium != null) ? (strike - premium) : null;
  const currentPrice = numericOrNull(tc.currentPrice);

  // Honest "Option chain not verified" — preferred over repeating
  // "premium unavailable" in three different cells.
  const chainVerified = strike != null || premium != null
                     || tc.bid != null || tc.ask != null;

  const cardStyle = {
    padding: 16,
    background: selected ? COCKPIT_PALETTE.selectedTint : COCKPIT_PALETTE.panelBg,
    border: `1px solid ${COCKPIT_PALETTE.border}`,
    borderLeft: selected
      ? `2px solid ${COCKPIT_PALETTE.accentTeal}`
      : `1px solid ${COCKPIT_PALETTE.border}`,
    borderRadius: 12,
    minWidth: 0,
  };

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : -1}
      onClick={interactive ? () => onSelect(row.symbol) : undefined}
      onKeyDown={handleKey}
      className="cursor-pointer transition-colors flex flex-col h-full overflow-hidden"
      style={cardStyle}>

      {/* CHART — TradingView mini, with sparkline / "Chart unavailable" fallback.
          Wrapped in a flex-grow box so the chart fills whatever vertical space
          remains after the text content below — prevents bottom-clipping when
          the parent grid row is short. */}
      <div style={{
        flex: chartHeight == null ? "1 1 auto" : "0 0 auto",
        minHeight: 110,
        marginBottom: 12,
        minWidth: 0,
        overflow: "hidden",
      }}>
        <TradingViewMiniChart
          symbol={row.symbol}
          exchange={candidate?.exchange}
          tradingViewSymbol={candidate?.tradingViewSymbol}
          verified={candidate?.hasLiveChart}
          height={chartHeight == null ? "100%" : chartHeight} />
      </div>

      {/* HEADER ROW — slot/best · ticker (teal, large) · current price · score */}
      <div className="mt-3 flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 min-w-0" style={truncate}>
            <span style={{ fontSize: 10, color: COCKPIT_PALETTE.textFaint, letterSpacing: "0.18em" }}>
              {slotLabel}
            </span>
            {isBest && (
              <span style={{ fontSize: 10, color: COCKPIT_PALETTE.accentTeal, fontWeight: 700 }}>
                ★ BEST USE
              </span>
            )}
            <span style={{ fontSize: 9, color: COCKPIT_PALETTE.textFaint, marginLeft: "auto" }}>
              rank #{row.rank}
            </span>
          </div>
          <div className="font-bold truncate"
               style={{ fontSize: 18, color: COCKPIT_PALETTE.accentTeal,
                        letterSpacing: "0.02em", marginTop: 2 }}>
            {row.symbol}
          </div>
          <div style={{
            fontSize: 11, color: COCKPIT_PALETTE.textDim, marginTop: 2,
            fontFeatureSettings: "'tnum'",
          }}>
            {currentPrice != null ? `$${currentPrice.toFixed(2)}` : "—"}
          </div>
        </div>
        <ScoreRing score={row.score} size={40} stroke={4} tone={isBest ? "good" : undefined} />
      </div>

      {/* ACTION + PHASE + FIT row */}
      <div className="mt-3 flex items-center gap-2 flex-wrap min-w-0">
        <ActionPill action={row.action} actionCode={row.actionCode} />
        <PhaseBadge primaryType={row.primaryType} />
        <span className={`text-[11px] truncate ${fitTone}`}>fit {row.capitalFit}</span>
      </div>

      {/* CONTRACT BLOCK — clean fallback when chain is missing */}
      {chainVerified ? (
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 min-w-0"
             style={{ fontSize: 11 }}>
          <Field label="Strike" value={strike != null ? `$${strike.toFixed(2)}` : "—"} />
          <Field label="DTE"    value={dte != null ? `${dte}d` : "—"} />
          <Field label="Premium"
                 value={premium != null ? `$${premium.toFixed(2)}` : "—"}
                 tone={row.premiumIsLive ? "green" : "amber"} />
          <Field label="Collateral"
                 value={collateral != null
                   ? `$${collateral.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                   : "—"} />
          <Field label="Break-even"
                 value={breakeven != null ? `$${breakeven.toFixed(2)}` : "—"} />
          <Field label="Premium src" value={row.premiumMethod} />
        </div>
      ) : (
        <div className="mt-3 text-[11px]"
             style={{ color: COCKPIT_PALETTE.textFaint, fontStyle: "italic" }}>
          Option chain not verified
        </div>
      )}

      {/* SIGNAL ROW — probability status + signal quality + spread */}
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 min-w-0"
           style={{ fontSize: 10, color: COCKPIT_PALETTE.textDim }}>
        <Tag label="signal" value={row.signalQuality || "—"}
             tone={row.signalQuality === "validated" ? "green" : "muted"} />
        <Tag label="liq"  value={tc.liquidityGrade || "unknown"} />
        <Tag label="spread" value={tc.spreadWidthLabel || "—"}
             tone={tc.spreadWidthLabel === "tight" ? "green"
                  : tc.spreadWidthLabel === "wide" ? "amber" : "muted"} />
      </div>

      {/* INSIGHT — single line */}
      {row.reasonSummary && (
        <p className="mt-3 text-[11px] leading-snug min-w-0"
           style={{ color: COCKPIT_PALETTE.textDim, ...truncate }}>
          {row.reasonSummary}
        </p>
      )}
    </article>
  );
}

// --------------------------------------------------
// LITTLE PRIMITIVES
// --------------------------------------------------

function Field({ label, value, tone = "default" }) {
  const fg = tone === "green" ? COCKPIT_PALETTE.accentGreen
           : tone === "amber" ? COCKPIT_PALETTE.accentAmber
           : tone === "bad"   ? COCKPIT_PALETTE.accentRed
           :                    COCKPIT_PALETTE.text;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
        color: COCKPIT_PALETTE.textFaint,
      }}>{label}</div>
      <div style={{
        fontSize: 12, fontWeight: 600, color: fg,
        fontFeatureSettings: "'tnum'", ...truncate,
      }}>{value}</div>
    </div>
  );
}

function Tag({ label, value, tone = "muted" }) {
  const fg = tone === "green" ? COCKPIT_PALETTE.accentGreen
           : tone === "amber" ? COCKPIT_PALETTE.accentAmber
           :                    COCKPIT_PALETTE.textDim;
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "baseline", minWidth: 0 }}>
      <span style={{ color: COCKPIT_PALETTE.textFaint }}>{label}</span>
      <span style={{ color: fg, fontWeight: 600 }}>{value}</span>
    </span>
  );
}

function PhaseBadge({ primaryType }) {
  if (!primaryType) return null;
  // The discovery engine's primaryType is the closest analogue to "phase":
  // breakout_candidate / stack_reversal_candidate / etc. Render as a short
  // human label without exposing engine internals.
  const label = String(primaryType).replace(/_candidate$/, "").replace(/_/g, " ");
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
      padding: "2px 6px",
      background: "rgba(20, 184, 166, 0.10)",
      border: `1px solid rgba(20, 184, 166, 0.35)`,
      borderRadius: 4,
      color: COCKPIT_PALETTE.accentTeal,
      ...truncate,
    }}>
      {label}
    </span>
  );
}

const truncate = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function numericOrNull(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
