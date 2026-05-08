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
import FreshnessChip from "./FreshnessChip.jsx";

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
 * @param {string} [props.insight]          comparative insight string from
 *                                          buildComparativeInsight(); falls
 *                                          back to row.reasonSummary when not
 *                                          supplied.
 * @param {boolean} [props.replay]          Phase 4.7.6 — true when this card
 *                                          is rendered from a Replay Last Close
 *                                          scan; surfaces a REPLAY pill.
 * @param {string} [props.replaySessionDate]  human-readable session date
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
  insight = null,
  replay = false,
  replaySessionDate = null,
  // Phase 4.7.9: per-card freshness. quoteAgeMs comes from the live-quote
  // refresh layer; analyticsAgeMs from the last full scanner recompute.
  // When quote is fresher than analytics by > tolerance, the chip
  // shows RECALCULATING.
  quoteAgeMs = null,
  analyticsAgeMs = null,
  // Phase 4.7.9: live-quote overlay. When present, its price /
  // percentChange / previousClose drive the price strip — score and
  // rank still come from `row` (engine output).
  liveQuote = null,
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
  // Live-quote overlay wins when present; otherwise fall back to scan-time
  // values. Score and rank remain row-driven (engine), unchanged.
  const currentPrice =
    numericOrNull(liveQuote?.price) ?? numericOrNull(tc.currentPrice);
  const previousClose =
    numericOrNull(liveQuote?.previousClose) ?? numericOrNull(candidate?.previousClose);
  // Polygon's todaysChangePerc is already a percent (e.g., 2.01 = 2.01%).
  const livePercentChange = numericOrNull(liveQuote?.percentChange);

  // Honest "Option chain not verified" — preferred over repeating
  // "premium unavailable" in three different cells.
  const chainVerified = strike != null || premium != null
                     || tc.bid != null || tc.ask != null;

  // Card padding moved to per-zone padding so the chart bleeds edge-to-edge
  // (no frame around the chart area). The card's own outer border + 12px
  // borderRadius + overflow: hidden still give the rounded outline; the
  // chart simply fills its zone with no inner padding.
  const cardStyle = {
    padding: 0,
    background: selected ? COCKPIT_PALETTE.selectedTint : COCKPIT_PALETTE.panelBg,
    border: `1px solid ${COCKPIT_PALETTE.border}`,
    borderLeft: selected
      ? `2px solid ${COCKPIT_PALETTE.accentTeal}`
      : `1px solid ${COCKPIT_PALETTE.border}`,
    borderRadius: 12,
    minWidth: 0,
    overflow: "hidden",
  };

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : -1}
      onClick={interactive ? () => onSelect(row.symbol) : undefined}
      onKeyDown={handleKey}
      className="cursor-pointer transition-colors flex flex-col h-full overflow-hidden"
      style={cardStyle}>

      {/* CHART — full-bleed, edge-to-edge.
          No padding around the chart frame; floating overlays sit on top.
          Card's outer borderRadius + overflow:hidden clip the chart corners. */}
      <div style={{
        position: "relative",
        flex: chartHeight == null ? "1 1 auto" : "0 0 auto",
        minHeight: 140,
        minWidth: 0,
        overflow: "hidden",
      }}>
        <TradingViewMiniChart
          symbol={row.symbol}
          exchange={candidate?.exchange}
          tradingViewSymbol={candidate?.tradingViewSymbol}
          verified={candidate?.hasLiveChart}
          height={chartHeight == null ? "100%" : chartHeight} />

        {/* Subtle bottom gradient — improves overlay readability without
            making the chart feel "boxed". Top stays clean. */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }} />

        {/* SLOT only — top-left, floating.
            The ★ BEST USE marker moved to the action row below: it used
            to sit here next to the slot number, but TradingView renders
            the company name across the top of its widget and the two
            collided. Slot number alone is narrow enough to avoid TV. */}
        <div style={{
          position: "absolute", top: 8, left: 12,
          fontSize: 10, color: COCKPIT_PALETTE.textFaint,
          letterSpacing: "0.18em", textTransform: "uppercase",
          textShadow: "0 1px 3px rgba(0,0,0,0.7)",
          pointerEvents: "none",
        }}>
          {slotLabel}
        </div>

        {/* FRESHNESS CHIP — top-right, floating.
            Tells the operator at a glance whether the card's data is
            current. Sits above the ticker so it doesn't compete with
            the price overlay at the bottom. */}
        {(quoteAgeMs != null || analyticsAgeMs != null) && (
          <div style={{
            position: "absolute", top: 8, right: 12,
            pointerEvents: "none",
          }}>
            <FreshnessChip
              quoteAgeMs={quoteAgeMs}
              analyticsAgeMs={analyticsAgeMs}
              showAge={false}
              size="xs" />
          </div>
        )}

        {/* Score moved off the chart — it now lives in the action row below
            so it sits with the engine's other assessments (action / phase /
            fit) instead of competing with TradingView's own chrome. */}

        {/* TICKER — right-center, floating (avoids TradingView's title bar) */}
        <div style={{
          position: "absolute",
          top: "50%", right: 12,
          transform: "translateY(-50%)",
          fontSize: 22, fontWeight: 700, color: COCKPIT_PALETTE.accentTeal,
          letterSpacing: "0.02em",
          textShadow: "0 2px 6px rgba(0,0,0,0.75)",
          pointerEvents: "none",
          ...truncate,
          maxWidth: "55%",
          textAlign: "right",
        }}>
          {row.symbol}
        </div>

        {/* PRICE + %CHANGE — bottom-left, floating */}
        <div style={{
          position: "absolute", bottom: 8, left: 12,
          display: "flex", alignItems: "baseline", gap: 6,
          pointerEvents: "none",
          textShadow: "0 2px 6px rgba(0,0,0,0.85)",
          ...truncate,
          maxWidth: "85%",
        }}>
          <span style={{
            fontSize: 18, fontWeight: 700, color: COCKPIT_PALETTE.text,
            fontFeatureSettings: "'tnum'",
          }}>
            {currentPrice != null ? `$${currentPrice.toFixed(2)}` : "—"}
          </span>
          {(() => {
            // Prefer the provider's todaysChangePerc when we have it
            // (handles extended-hours math correctly). Otherwise compute
            // from price + previousClose.
            const pct = livePercentChange != null
              ? livePercentChange
              : (currentPrice != null && previousClose != null && previousClose !== 0)
                ? ((currentPrice - previousClose) / previousClose) * 100
                : null;
            if (pct == null) return null;
            return (
              <span style={{
                fontSize: 12,
                color: pct >= 0 ? COCKPIT_PALETTE.accentGreen : COCKPIT_PALETTE.accentRed,
                fontFeatureSettings: "'tnum'",
              }}>
                {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
              </span>
            );
          })()}
        </div>

        {/* Rank text removed — the SLOT label at top-left already shows
            the same #N for top picks, and the ScoreRing now occupies
            bottom-right. Keeping it would crowd the chart corner. */}
      </div>

      {/* ACTION + PHASE + FIT + SCORE row — sits below the full-bleed chart.
          BEST USE badge leads when applicable. Score is right-aligned so the
          engine's assessments cluster reads left-to-right: best · action ·
          phase · capital fit · final score. The REPLAY pill, when active,
          leads everything so the operator never confuses replay with live. */}
      <div className="flex items-center gap-2 flex-wrap min-w-0"
           style={{ padding: "10px 14px 0" }}>
        {replay && <ReplayBadge sessionDate={replaySessionDate} />}
        {isBest && <BestUseBadge />}
        <ActionPill action={row.action} actionCode={row.actionCode} />
        <PhaseBadge primaryType={row.primaryType} />
        <span className={`text-[11px] truncate ${fitTone}`}>fit {row.capitalFit}</span>
        <div style={{ marginLeft: "auto", flex: "0 0 auto" }}>
          <ScoreRing score={row.score} size={32} stroke={3}
                     tone={isBest ? "good" : undefined} />
        </div>
      </div>

      {/* CONTRACT BLOCK — 4 essential fields only.
          Collateral, Premium source, signal/liq/spread tags moved to the
          Detail Panel (Phase 4.7.5.2) so the card stays scannable in
          narrow vertical space. The card focuses on the at-a-glance
          decision: strike, DTE, premium, break-even. */}
      {chainVerified ? (
        // Layout:
        //   [ STRIKE      PREMIUM ]   ← Premium is the primary decision number
        //   [ DTE         BREAKEVEN ] ← muted secondary fields
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 min-w-0"
             style={{ padding: "10px 14px 0" }}>
          <Field label="Strike" size="md" tone="default"
                 value={strike != null ? `$${strike.toFixed(2)}` : "—"} />
          <Field label="Premium" size="lg"
                 tone={premium == null
                   ? "muted"
                   : (row.premiumIsLive ? "teal" : "amber")}
                 value={premium != null ? `$${premium.toFixed(2)}` : "—"} />
          <Field label="DTE" size="sm" tone="muted"
                 value={dte != null ? `${dte}d` : "—"} />
          <Field label="Break-even" size="sm" tone="muted"
                 value={breakeven != null ? `$${breakeven.toFixed(2)}` : "—"} />
        </div>
      ) : (
        <div className="text-[11px]"
             style={{ color: COCKPIT_PALETTE.textFaint, fontStyle: "italic",
                      padding: "10px 14px 0" }}>
          Option chain not verified
        </div>
      )}

      {/* INSIGHT — single comparative line.
          Prefers the engine's comparative insight (peer-aware reasoning) over
          the raw reasonSummary. Falls back to reasonSummary when no peer
          comparison can be derived. */}
      {(() => {
        const line = (insight && insight.length > 0) ? insight : row.reasonSummary;
        if (!line) return null;
        return (
          <p className="text-[11px] leading-snug min-w-0"
             style={{ color: COCKPIT_PALETTE.textDim, padding: "8px 14px 12px",
                      ...truncate }}>
            {line}
          </p>
        );
      })()}
    </article>
  );
}

// --------------------------------------------------
// LITTLE PRIMITIVES
// --------------------------------------------------

function Field({ label, value, tone = "default", size = "md" }) {
  const fg = tone === "teal"   ? COCKPIT_PALETTE.accentTeal
           : tone === "green"  ? COCKPIT_PALETTE.accentGreen
           : tone === "amber"  ? COCKPIT_PALETTE.accentAmber
           : tone === "bad"    ? COCKPIT_PALETTE.accentRed
           : tone === "muted"  ? COCKPIT_PALETTE.textDim
           :                     COCKPIT_PALETTE.text;
  // Size scale: lg (Premium — primary) > md (Strike — secondary) > sm (DTE/Breakeven)
  const valueFontSize = size === "lg" ? 22
                      : size === "md" ? 16
                      :                 12;
  const valueWeight   = size === "lg" ? 800
                      : size === "md" ? 700
                      :                 600;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
        color: COCKPIT_PALETTE.textFaint,
      }}>{label}</div>
      <div style={{
        fontSize: valueFontSize, fontWeight: valueWeight, color: fg,
        lineHeight: 1.15,
        fontFeatureSettings: "'tnum'", ...truncate,
      }}>{value}</div>
    </div>
  );
}

function ReplayBadge({ sessionDate }) {
  return (
    <span
      title={sessionDate ? `REPLAY — last close · ${sessionDate}` : "REPLAY — last close"}
      style={{
        fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
        padding: "2px 6px",
        background: "rgba(245, 158, 11, 0.16)",
        border: `1px solid ${COCKPIT_PALETTE.accentAmber}`,
        borderRadius: 4,
        color: COCKPIT_PALETTE.accentAmber,
        whiteSpace: "nowrap",
      }}>
      ● Replay{sessionDate ? ` · ${sessionDate}` : ""}
    </span>
  );
}

function BestUseBadge() {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: "0.10em", textTransform: "uppercase",
      padding: "2px 6px",
      background: "rgba(20, 184, 166, 0.18)",
      border: `1px solid ${COCKPIT_PALETTE.accentTeal}`,
      borderRadius: 4,
      color: COCKPIT_PALETTE.accentTeal,
      whiteSpace: "nowrap",
    }}>
      ★ Best use
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
