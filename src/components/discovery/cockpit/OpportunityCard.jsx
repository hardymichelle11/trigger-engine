// =====================================================
// OPPORTUNITY CARD (Phase 4.7.6)
// =====================================================
// Three-zone vertical hierarchy:
//
//   ┌────────────────────────────────────────────────┐
//   │  TOP 60%  — TradingView chart, full width      │
//   │            with floating overlays:             │
//   │              • ticker (top-left)               │
//   │              • score badge (top-right)         │
//   │              • price + %change (bottom-left)   │
//   ├────────────────────────────────────────────────┤
//   │  MIDDLE 25% — 2×2 grid                         │
//   │              Strike (large/bold) | Premium     │
//   │              DTE (small)         | Breakeven   │
//   ├────────────────────────────────────────────────┤
//   │  BOTTOM 15% — single insight line              │
//   │              "best use of capital" OR          │
//   │              "displaced by X" OR thesis        │
//   └────────────────────────────────────────────────┘
//
// Hard rules:
//   - Chart never shows placeholder text — handled
//     entirely inside TradingViewMiniChart now.
//   - Overlay text floats over the chart with a subtle
//     bottom-gradient for readability.
//   - No tags / phase pill / action pill / fit chip —
//     those live in the Detail Panel.
// =====================================================

import React from "react";
import { ScoreRing, fitToneClass } from "./cockpitPrimitives.jsx";
import TradingViewMiniChart from "../../lethal/TradingViewMiniChart.jsx";
import { COCKPIT_PALETTE } from "./cockpitTheme.js";

/**
 * @param {object} props
 * @param {object} props.row                view-model row
 * @param {object} [props.candidate]        original scanner candidate
 * @param {number} props.slotIndex          0/1/2
 * @param {object|null} [props.tradeContext]
 * @param {boolean} [props.selected]
 * @param {(symbol: string) => void} [props.onSelect]
 */
export default function OpportunityCard({
  row,
  candidate = null,
  slotIndex,
  tradeContext = null,
  selected = false,
  onSelect,
}) {
  const isBest = !!row.isBestUseOfCapital;
  const interactive = typeof onSelect === "function";
  const handleKey = interactive
    ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(row.symbol); } }
    : undefined;
  const slotLabel = ["#1", "#2", "#3"][slotIndex] || `#${slotIndex + 1}`;

  const tc = tradeContext || {};
  const strike     = numericOrNull(tc.suggestedStrike);
  const premium    = numericOrNull(tc.estimatedPremium);
  const breakeven  = (strike != null && premium != null) ? (strike - premium) : null;
  const dte        = tc.resolvedExpirationDte ?? tc.expirationDte ?? null;
  const currentPrice = numericOrNull(tc.currentPrice);
  const previousClose = numericOrNull(candidate?.previousClose);
  const pctChange = (currentPrice != null && previousClose != null && previousClose !== 0)
    ? ((currentPrice - previousClose) / previousClose) * 100
    : null;
  const chainVerified = strike != null || premium != null
                     || tc.bid != null || tc.ask != null;

  // BOTTOM zone copy: prioritize displacement → best-use → thesis.
  const insight = row.displacedBy
    ? `displaced by ${row.displacedBy}`
    : (isBest ? "best use of capital"
              : (row.reasonSummary || ""));

  const cardStyle = {
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
      className="cursor-pointer transition-colors flex flex-col h-full"
      style={cardStyle}>

      {/* TOP 60% — chart with floating overlays */}
      <div style={{
        position: "relative",
        flex: "6 1 0",        // 60% of card
        minHeight: 0,
      }}>
        <TradingViewMiniChart
          symbol={row.symbol}
          exchange={candidate?.exchange}
          tradingViewSymbol={candidate?.tradingViewSymbol}
          verified={candidate?.hasLiveChart}
          height="100%" />

        {/* gradient for overlay readability — bottom 35% darker */}
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to bottom,
            ${rgba(COCKPIT_PALETTE.panelBg, 0.55)} 0%,
            transparent 25%,
            transparent 60%,
            ${rgba(COCKPIT_PALETTE.panelBg, 0.85)} 100%)`,
          pointerEvents: "none",
        }} />

        {/* SLOT LABEL — small top-left (sits below TradingView's title bar) */}
        <div style={{
          position: "absolute", top: 8, left: 12,
          fontSize: 9, color: COCKPIT_PALETTE.textFaint,
          letterSpacing: "0.18em", textTransform: "uppercase",
          pointerEvents: "none",
          textShadow: "0 1px 3px rgba(0,0,0,0.6)",
        }}>
          {slotLabel}
          {isBest && (
            <span style={{ marginLeft: 6, color: COCKPIT_PALETTE.accentTeal,
                            fontWeight: 700 }}>★</span>
          )}
        </div>

        {/* TICKER — right-center overlay (Phase 4.7.6.1: moved from top-left
            to avoid overlapping the TradingView mini-widget's own title bar) */}
        <div style={{
          position: "absolute",
          top: "50%", right: 12,
          transform: "translateY(-50%)",
          display: "flex", flexDirection: "column", alignItems: "flex-end",
          pointerEvents: "none",
          ...truncate,
          maxWidth: "55%",
        }}>
          <span style={{
            fontSize: 22, fontWeight: 700, color: COCKPIT_PALETTE.accentTeal,
            letterSpacing: "0.02em",
            textShadow: "0 2px 6px rgba(0,0,0,0.75)",
            ...truncate,
          }}>{row.symbol}</span>
        </div>

        {/* SCORE badge — top-right overlay */}
        <div style={{
          position: "absolute", top: 6, right: 8,
          pointerEvents: "none",
        }}>
          <ScoreRing score={row.score} size={36} stroke={3} tone={isBest ? "good" : undefined} />
        </div>

        {/* PRICE + %CHANGE — bottom-left overlay */}
        <div style={{
          position: "absolute", bottom: 8, left: 12,
          display: "flex", alignItems: "baseline", gap: 6,
          pointerEvents: "none",
          ...truncate,
          maxWidth: "85%",
        }}>
          <span style={{
            fontSize: 18, fontWeight: 700, color: COCKPIT_PALETTE.text,
            fontFeatureSettings: "'tnum'",
            textShadow: "0 1px 4px rgba(0,0,0,0.7)",
          }}>
            {currentPrice != null ? `$${currentPrice.toFixed(2)}` : "—"}
          </span>
          {pctChange != null && (
            <span style={{
              fontSize: 12,
              color: pctChange >= 0 ? COCKPIT_PALETTE.accentGreen : COCKPIT_PALETTE.accentRed,
              fontFeatureSettings: "'tnum'",
              textShadow: "0 1px 4px rgba(0,0,0,0.7)",
            }}>
              {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* MIDDLE 25% — 2x2 contract grid */}
      <div style={{
        flex: "2.5 1 0",
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        columnGap: 14,
        rowGap: 4,
        padding: "10px 14px",
        borderTop: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
      }}>
        {chainVerified ? (
          <>
            <ContractCell
              label="Strike"
              value={strike != null ? `$${strike.toFixed(2)}` : "—"}
              size="lg" />
            <ContractCell
              label="Premium"
              value={premium != null ? `$${premium.toFixed(2)}` : "—"}
              size="lg"
              tone={premium != null
                ? (row.premiumIsLive ? "green" : "amber")
                : "muted"} />
            <ContractCell
              label="DTE"
              value={dte != null ? `${dte}d` : "—"}
              size="sm"
              tone="muted" />
            <ContractCell
              label="Breakeven"
              value={breakeven != null ? `$${breakeven.toFixed(2)}` : "—"}
              size="sm"
              tone="muted" />
          </>
        ) : (
          <div style={{
            gridColumn: "1 / -1", gridRow: "1 / -1",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, color: COCKPIT_PALETTE.textFaint, fontStyle: "italic",
          }}>
            Option chain not verified
          </div>
        )}
      </div>

      {/* BOTTOM 15% — single insight line */}
      <div style={{
        flex: "1.5 1 0",
        minHeight: 0,
        display: "flex", alignItems: "center",
        padding: "0 14px 10px",
      }}>
        <span style={{
          fontSize: 11, color: COCKPIT_PALETTE.textDim,
          ...truncate, width: "100%",
        }}>
          {insight || "—"}
        </span>
      </div>
    </article>
  );
}

// --------------------------------------------------
// helpers
// --------------------------------------------------

function ContractCell({ label, value, size = "md", tone = "default" }) {
  const fg = tone === "green" ? COCKPIT_PALETTE.accentGreen
           : tone === "amber" ? COCKPIT_PALETTE.accentAmber
           : tone === "red"   ? COCKPIT_PALETTE.accentRed
           : tone === "muted" ? COCKPIT_PALETTE.textDim
           :                    COCKPIT_PALETTE.text;
  const valueSize = size === "lg" ? 16 : size === "sm" ? 12 : 13;
  const labelSize = 9;
  return (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{
        fontSize: labelSize, color: COCKPIT_PALETTE.textFaint,
        letterSpacing: "0.12em", textTransform: "uppercase",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: valueSize, fontWeight: 700, color: fg,
        fontFeatureSettings: "'tnum'", lineHeight: 1.15,
        ...truncate,
      }}>
        {value}
      </div>
    </div>
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

// Convert a hex color to an rgba(...) string with given alpha.
function rgba(hex, alpha) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
