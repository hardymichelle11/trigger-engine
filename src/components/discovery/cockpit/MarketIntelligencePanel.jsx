// =====================================================
// MARKET INTELLIGENCE PANEL (Phase 4.7.2)
// =====================================================
// Lower-left panel reserved for future Phase 4.9 news /
// market-context integrations (Investing.com, CNBC,
// Bloomberg, MarketWatch, TradingView, etc.).
//
// Renamed from MarketNewsPanel (Phase 4.7) to better
// reflect its broader role — context, not just headlines.
//
// Hard rules:
//   - PURE presentational. No fetch, no scraping, no
//     third-party script injection.
//   - Never displays a hard-coded headline as if it were
//     real news. Placeholder rows are clearly labeled
//     "placeholder · no live feed wired".
// =====================================================

import React from "react";
import { COCKPIT_PALETTE, COCKPIT_SCROLL_CLASS } from "./cockpitTheme.js";

const PLACEHOLDER_ITEMS = [
  {
    headline: "News headline area",
    source: "—",
    timestamp: "—",
    why: "Wire in Investing.com / CNBC / Bloomberg / MarketWatch feed (Phase 4.9)",
    relevance: "placeholder",
  },
  {
    headline: "Sector rotation context will appear here",
    source: "—",
    timestamp: "—",
    why: "Macro / sector news will inform the operator before entry",
    relevance: "placeholder",
  },
  {
    headline: "Earnings / catalyst event reminders",
    source: "—",
    timestamp: "—",
    why: "Avoid entering trades into known catalysts unless that is the thesis",
    relevance: "placeholder",
  },
];

/**
 * @param {object} props
 * @param {Array<object>} [props.items]
 * @param {string} [props.title]
 */
export default function MarketIntelligencePanel({
  items = null,
  title = "Market intelligence",
}) {
  const rows = Array.isArray(items) && items.length > 0 ? items : PLACEHOLDER_ITEMS;
  const isPlaceholder = !items || items.length === 0;

  return (
    <section
      style={{
        background: COCKPIT_PALETTE.panelBg,
        border: `1px solid ${COCKPIT_PALETTE.border}`,
        borderRadius: 12,
        display: "flex", flexDirection: "column",
        minWidth: 0, minHeight: 0, overflow: "hidden",
      }}
      aria-label={title}>
      <header style={{
        flex: "none",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
        minWidth: 0,
      }}>
        <h3 style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
                      color: COCKPIT_PALETTE.textDim }}>{title}</h3>
        {isPlaceholder && (
          <span style={{ fontSize: 10, color: COCKPIT_PALETTE.accentAmber }}>
            placeholder · no live feed wired
          </span>
        )}
      </header>
      <div className={COCKPIT_SCROLL_CLASS}
           style={{ flex: "1 1 auto", minHeight: 0,
                    overflowY: "auto", overflowX: "hidden",
                    padding: 16 }}>
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={i} className="border-t border-zinc-800/60 pt-3 first:border-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-zinc-300 truncate">{r.headline}</span>
                <RelevanceBadge value={r.relevance} />
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
                <span>{r.source || "—"}</span>
                <span>·</span>
                <span>{r.timestamp || "—"}</span>
              </div>
              {r.why && (
                <div className="mt-1 text-[11px] text-zinc-400 leading-snug">{r.why}</div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function RelevanceBadge({ value }) {
  if (!value) return null;
  const tone = value === "high"        ? "bg-emerald-500/15 text-emerald-400"
             : value === "medium"      ? "bg-cyan-500/15 text-cyan-400"
             : value === "low"         ? "bg-zinc-700/40 text-zinc-300"
             : value === "placeholder" ? "bg-zinc-800/60 text-zinc-500"
             :                           "bg-zinc-800/60 text-zinc-400";
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${tone}`}>
      {value}
    </span>
  );
}
