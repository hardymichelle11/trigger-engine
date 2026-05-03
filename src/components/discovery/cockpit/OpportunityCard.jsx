// =====================================================
// OPPORTUNITY CARD (Phase 4.7.2)
// =====================================================
// Single top-pick card. Chart is visually dominant
// (~60% of card height). Score ring is the primary
// accent. Compact action+fit row, tags, and a one-line
// insight. Used by TopPicksGrid; could be reused
// elsewhere (e.g. dashboards).
//
// Hard rules:
//   - PURE presentational. Reads view-model row +
//     trade context only.
//   - Premium label is honest: live | estimated | unavailable.
//   - No scoreBreakdown, weights, probability internals,
//     debug fields.
// =====================================================

import React from "react";
import {
  ScoreRing,
  ActionPill,
  BundlePills,
  fitToneClass,
} from "./cockpitPrimitives.jsx";
import TradingViewChartPlaceholder from "./TradingViewChartPlaceholder.jsx";
import { COCKPIT_PALETTE } from "./cockpitTheme.js";

/**
 * @param {object} props
 * @param {object} props.row                view-model row
 * @param {number} props.slotIndex          0/1/2 → "#1 top pick" / "#2" / "#3"
 * @param {object|null} [props.tradeContext]
 * @param {boolean} [props.selected]
 * @param {(symbol: string) => void} [props.onSelect]
 * @param {number} [props.chartHeight]
 */
export default function OpportunityCard({
  row,
  slotIndex,
  tradeContext = null,
  selected = false,
  onSelect,
  chartHeight = 200,
}) {
  const isBest = !!row.isBestUseOfCapital;
  const fitTone = fitToneClass(row.capitalFitCode);
  const interactive = typeof onSelect === "function";
  const handleKey = interactive
    ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(row.symbol); } }
    : undefined;
  const slotLabel = ["#1", "#2", "#3"][slotIndex] || `#${slotIndex + 1}`;

  const expirationLabel = tradeContext?.resolvedExpirationLabel
                       || tradeContext?.expirationLabel || null;

  // Phase 4.7.3: Fidelity-style — default subtle border; selected adds a thin
  // teal left accent only (no whole-card glow). Best-use is signaled via the
  // small ★ badge in the header, not via a glowing border.
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

      {/* CHART — visually dominant (~60% of card) */}
      <TradingViewChartPlaceholder
        symbol={row.symbol}
        expiration={expirationLabel}
        height={chartHeight} />

      {/* HEADER — slot/best badge + ticker (cyan/teal) + score */}
      <div className="mt-3 flex items-center justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2"
               style={{ ...truncateStyle }}>
            <span style={{ fontSize: 10, color: COCKPIT_PALETTE.textFaint, letterSpacing: "0.18em" }}>
              {slotLabel}
            </span>
            {isBest && (
              <span style={{ fontSize: 10, color: COCKPIT_PALETTE.accentTeal, fontWeight: 700 }}>
                ★ BEST USE
              </span>
            )}
          </div>
          <div className="font-bold truncate"
               style={{ fontSize: 18, color: COCKPIT_PALETTE.accentTeal,
                        letterSpacing: "0.02em", marginTop: 2 }}>
            {row.symbol}
          </div>
        </div>
        <ScoreRing score={row.score} size={40} stroke={4} tone={isBest ? "good" : undefined} />
      </div>

      {/* ACTION + FIT — single compact line */}
      <div className="mt-2 flex items-center gap-2 flex-wrap min-w-0">
        <ActionPill action={row.action} actionCode={row.actionCode} />
        <span className={`text-[11px] truncate ${fitTone}`}>fit {row.capitalFit}</span>
      </div>

      {/* TAGS */}
      {row.bundles?.length > 0 && (
        <div className="mt-3 min-w-0 overflow-hidden"><BundlePills bundles={row.bundles} max={3} /></div>
      )}

      {/* INSIGHT */}
      {row.reasonSummary && (
        <p className="mt-3 text-[12px] leading-snug min-w-0"
           style={{ color: COCKPIT_PALETTE.textDim, ...truncateStyle }}>
          {row.reasonSummary}
        </p>
      )}
    </article>
  );
}

const truncateStyle = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
