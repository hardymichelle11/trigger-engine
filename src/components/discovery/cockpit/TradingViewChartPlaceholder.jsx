// =====================================================
// TRADING VIEW CHART PLACEHOLDER (Phase 4.7)
// =====================================================
// Reserves visual space where a real TradingView embed,
// chart adapter, or Polygon-driven sparkline will live in
// a later phase. Renders a labeled box with the symbol
// and DTE so the cockpit layout reads correctly even
// before any chart provider is wired.
//
// Hard rules:
//   - PURE presentational component. No fetch, no embed,
//     no third-party script tag injection.
//   - Never claims live chart data. Banner is explicit
//     about "chart area — placeholder".
// =====================================================

import React from "react";

/**
 * @param {object} props
 * @param {string} [props.symbol]
 * @param {string} [props.expiration]   "YYYY-MM-DD" or label
 * @param {number} [props.height]       px; defaults to 140
 * @param {string} [props.note]
 */
export default function TradingViewChartPlaceholder({
  symbol = null,
  expiration = null,
  height = 140,
  note = null,
}) {
  return (
    <div
      className="relative rounded border border-dashed border-zinc-700 bg-zinc-900/40 overflow-hidden"
      style={{ height }}
      aria-label={symbol ? `${symbol} chart placeholder` : "chart placeholder"}>
      {/* faux-grid background to suggest a chart surface */}
      <svg className="absolute inset-0 w-full h-full opacity-30" aria-hidden="true">
        <defs>
          <pattern id="cockpit-chart-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#27272a" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cockpit-chart-grid)" />
      </svg>

      <div className="relative h-full w-full flex flex-col justify-between p-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            Chart area · placeholder
          </span>
          {expiration && (
            <span className="text-[10px] text-zinc-500">{expiration}</span>
          )}
        </div>
        <div className="flex items-end justify-between">
          {symbol ? (
            <span className="text-2xl font-bold tracking-tight text-zinc-300/70">{symbol}</span>
          ) : <span />}
          <span className="text-[10px] text-zinc-600">TradingView embed reserved</span>
        </div>
        {note && (
          <div className="absolute inset-x-2 bottom-2 text-[10px] text-zinc-600">{note}</div>
        )}
      </div>
    </div>
  );
}
