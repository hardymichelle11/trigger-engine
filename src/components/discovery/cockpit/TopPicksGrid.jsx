// =====================================================
// TOP PICKS GRID (Phase 4.7.2)
// =====================================================
// Three-column grid of OpportunityCards. Renamed from
// TopOpportunityGrid (Phase 4.7) and now delegates the
// card rendering to a dedicated OpportunityCard component
// so the same card can be reused elsewhere.
//
// Hard rules:
//   - PURE presentational. Reads view-model rows +
//     tradeContextBySymbol only.
//   - Strict 3-column grid on desktop (per spec); collapses
//     gracefully on narrow viewports via auto-fit fallback
//     when the page width can't accommodate three cards.
// =====================================================

import React from "react";
import OpportunityCard from "./OpportunityCard.jsx";

/**
 * @param {object} props
 * @param {Array<object>} props.rows
 * @param {string|null} [props.selectedSymbol]
 * @param {(sym: string) => void} [props.onSelectSymbol]
 * @param {Record<string, object>} [props.tradeContextBySymbol]
 * @param {number} [props.topN]
 */
export default function TopPicksGrid({
  rows,
  selectedSymbol = null,
  onSelectSymbol,
  tradeContextBySymbol = {},
  topN = 3,
}) {
  const top = Array.isArray(rows) ? rows.slice(0, topN) : [];

  if (top.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400 h-full flex items-center justify-center">
        No top opportunities surfaced this cycle. Run a scan.
      </div>
    );
  }

  return (
    <div
      className="grid gap-4 h-full min-h-0"
      style={{
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        minWidth: 0,
      }}>
      {top.map((r, idx) => (
        <OpportunityCard
          key={`${r.rank}-${r.symbol}`}
          row={r}
          slotIndex={idx}
          tradeContext={tradeContextBySymbol[r.symbol] || null}
          selected={r.symbol === selectedSymbol}
          onSelect={onSelectSymbol}
        />
      ))}
    </div>
  );
}
