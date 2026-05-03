// =====================================================
// RANKED CANDIDATES PANEL (Phase 4.7.3)
// =====================================================
// Fidelity-style positions-table layout. Header row sticks
// to the top of the panel; body alternates subtle row
// backgrounds; selected row has a thin teal left accent
// and slightly lighter background. Filter row sits above
// the table.
//
// Hard rules:
//   - No engine internals (scoreBreakdown, weights,
//     probability internals, debug fields).
//   - Reads view-model rows + per-symbol trade contexts only.
//   - All cells are min-width: 0 + truncated; horizontal
//     scroll never appears.
// =====================================================

import React, { useMemo, useState } from "react";
import { fitToneClass } from "./cockpitPrimitives.jsx";
import { COCKPIT_PALETTE, COCKPIT_SCROLL_CLASS } from "./cockpitTheme.js";

// --------------------------------------------------
// FILTERS
// --------------------------------------------------

const FILTERS = [
  { id: "all", label: "All" },
  { id: "option_candidates", label: "Option candidates" },
  { id: "watch", label: "Watch" },
  { id: "etfs", label: "ETFs" },
  { id: "ai_infra", label: "AI infrastructure" },
  { id: "high_premium", label: "High premium" },
  { id: "live_premium", label: "Live premium" },
  { id: "estimated_premium", label: "Estimated/unavailable" },
];

const ETF_BUNDLE_HINTS = ["etf", "broad_market_etf", "leveraged_etf", "income_etf"];
const AI_BUNDLE_HINTS  = ["ai_infrastructure", "semiconductors", "ai_theme"];

function applyFilter(rows, filterId, tradeContextBySymbol = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  switch (filterId) {
    case "option_candidates":
      return rows.filter(r => r.actionCode === "option_candidate");
    case "watch":
      return rows.filter(r => r.actionCode === "watch");
    case "etfs":
      return rows.filter(r => bundleMatches(r.bundles, ETF_BUNDLE_HINTS));
    case "ai_infra":
      return rows.filter(r => bundleMatches(r.bundles, AI_BUNDLE_HINTS));
    case "high_premium":
      return rows.filter(r => {
        const tc = tradeContextBySymbol[r.symbol];
        const mid = tc?.mid != null ? Number(tc.mid) : null;
        if (mid != null) return mid >= 2.0;
        return false;
      });
    case "live_premium":
      return rows.filter(r => r.premiumIsLive === true);
    case "estimated_premium":
      return rows.filter(r => r.premiumIsLive === false);
    case "all":
    default:
      return rows;
  }
}

function bundleMatches(bundles, hints) {
  if (!Array.isArray(bundles) || bundles.length === 0) return false;
  const lower = bundles.map(b => String(b).toLowerCase());
  return hints.some(h => lower.includes(h));
}

// --------------------------------------------------
// PUBLIC COMPONENT
// --------------------------------------------------

/**
 * @param {object} props
 * @param {Array<object>} props.rows
 * @param {string|null} [props.selectedSymbol]
 * @param {(sym: string) => void} [props.onSelectSymbol]
 * @param {Record<string, object>} [props.tradeContextBySymbol]
 * @param {number} [props.skipFirstN]
 * @param {string} [props.title]
 */
export default function RankedCandidatesPanel({
  rows,
  selectedSymbol = null,
  onSelectSymbol,
  tradeContextBySymbol = {},
  skipFirstN = 0,
  title = "Ranked candidates",
}) {
  const [activeFilter, setActiveFilter] = useState("all");

  const visibleRows = useMemo(() => {
    const tail = Array.isArray(rows) ? rows.slice(skipFirstN) : [];
    return applyFilter(tail, activeFilter, tradeContextBySymbol);
  }, [rows, skipFirstN, activeFilter, tradeContextBySymbol]);

  return (
    <section
      style={{
        background: COCKPIT_PALETTE.panelBg,
        border: `1px solid ${COCKPIT_PALETTE.border}`,
        borderRadius: 12,
        minWidth: 0,
        minHeight: 0,
        height: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
      aria-label="Ranked candidates panel">

      {/* Title row */}
      <header
        style={{
          flex: "none",
          padding: "12px 16px",
          borderBottom: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8, minWidth: 0,
        }}>
        <h3 style={{
          fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
          color: COCKPIT_PALETTE.textDim,
          ...truncate,
        }}>{title}</h3>
        <span style={{ fontSize: 11, color: COCKPIT_PALETTE.textFaint }}>
          {visibleRows.length}
          {Array.isArray(rows) && rows.length > 0 && ` of ${rows.length - skipFirstN}`}
        </span>
      </header>

      {/* Filter row */}
      <div
        style={{
          flex: "none",
          padding: "8px 12px",
          borderBottom: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
          display: "flex", flexWrap: "wrap", gap: 6,
          minWidth: 0,
        }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            style={{
              fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
              padding: "4px 8px",
              border: `1px solid ${activeFilter === f.id ? COCKPIT_PALETTE.accentGreen : COCKPIT_PALETTE.border}`,
              borderRadius: 6,
              background: activeFilter === f.id
                ? "rgba(34, 197, 94, 0.08)"
                : COCKPIT_PALETTE.nestedBg,
              color: activeFilter === f.id
                ? COCKPIT_PALETTE.accentGreen
                : COCKPIT_PALETTE.textDim,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table — header row */}
      <div
        style={{
          flex: "none",
          display: "grid",
          gridTemplateColumns: "40px 64px minmax(0, 1.4fr) 90px minmax(0, 1fr) 80px 70px",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          background: COCKPIT_PALETTE.nestedBg,
          borderBottom: `1px solid ${COCKPIT_PALETTE.border}`,
          fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
          color: COCKPIT_PALETTE.textDim,
          minWidth: 0,
        }}>
        <span>#</span>
        <span>Symbol</span>
        <span>Action / fit</span>
        <span style={{ textAlign: "right" }}>Score</span>
        <span style={{ ...truncate }}>Premium</span>
        <span style={{ textAlign: "right" }}>Mid</span>
        <span style={{ textAlign: "right" }}>Spread</span>
      </div>

      {/* Table — scrollable body */}
      <div
        className={COCKPIT_SCROLL_CLASS}
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
        }}>
        {visibleRows.length === 0 ? (
          <div style={{
            padding: 24, textAlign: "center", color: COCKPIT_PALETTE.textFaint,
            fontSize: 12,
          }}>
            No candidates match this filter.
          </div>
        ) : (
          visibleRows.map((row, idx) => (
            <RankedRow
              key={`${row.rank}-${row.symbol}`}
              row={row}
              tradeContext={tradeContextBySymbol[row.symbol] || null}
              selected={row.symbol === selectedSymbol}
              alternate={idx % 2 === 1}
              onClick={onSelectSymbol ? () => onSelectSymbol(row.symbol) : undefined}
            />
          ))
        )}
      </div>
    </section>
  );
}

// --------------------------------------------------
// TABLE ROW
// --------------------------------------------------

function RankedRow({ row, tradeContext, selected, alternate, onClick }) {
  const fitTone = fitToneClass(row.capitalFitCode);
  const premiumColor = row.premiumIsLive
    ? COCKPIT_PALETTE.accentGreen
    : (row.premiumMethod === "unavailable"
        ? COCKPIT_PALETTE.textFaint
        : COCKPIT_PALETTE.accentAmber);
  const interactive = typeof onClick === "function";
  const handleKey = interactive
    ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }
    : undefined;

  const tc = tradeContext || {};
  const liveMid = tc.mid != null ? `$${Number(tc.mid).toFixed(2)}` : "—";
  const spreadLabel = tc.spreadWidthLabel || "—";
  const spreadColor = spreadLabel === "tight"    ? COCKPIT_PALETTE.accentGreen
                    : spreadLabel === "moderate" ? COCKPIT_PALETTE.text
                    : spreadLabel === "wide"     ? COCKPIT_PALETTE.accentAmber
                    :                              COCKPIT_PALETTE.textFaint;

  const rowBg = selected
    ? COCKPIT_PALETTE.selectedTint
    : alternate
      ? COCKPIT_PALETTE.workspaceBg
      : "transparent";
  const borderLeft = selected
    ? `2px solid ${COCKPIT_PALETTE.accentTeal}`
    : "2px solid transparent";

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : -1}
      onClick={onClick}
      onKeyDown={handleKey}
      style={{
        display: "grid",
        gridTemplateColumns: "40px 64px minmax(0, 1.4fr) 90px minmax(0, 1fr) 80px 70px",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        background: rowBg,
        borderLeft,
        borderBottom: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
        cursor: interactive ? "pointer" : "default",
        minWidth: 0,
        fontSize: 12,
        color: COCKPIT_PALETTE.text,
        fontFeatureSettings: "'tnum'",
      }}>
      {/* # rank */}
      <span style={{ color: COCKPIT_PALETTE.textFaint, fontSize: 11 }}>
        {row.rank}
      </span>

      {/* symbol — cyan/teal */}
      <span style={{
        color: COCKPIT_PALETTE.accentTeal, fontWeight: 700,
        ...truncate,
      }}>
        {row.symbol}
        {row.isBestUseOfCapital && (
          <span style={{ marginLeft: 4, color: COCKPIT_PALETTE.accentTeal }}>★</span>
        )}
      </span>

      {/* action + fit */}
      <span style={{ ...truncate }}>
        <span style={{ color: COCKPIT_PALETTE.text }}>{row.action}</span>
        {" · "}
        <span className={fitTone} style={{ fontSize: 11 }}>{row.capitalFit}</span>
      </span>

      {/* score */}
      <span style={{ textAlign: "right", color: COCKPIT_PALETTE.text }}>
        {row.score}
      </span>

      {/* premium method */}
      <span style={{ color: premiumColor, ...truncate, fontSize: 11 }}>
        {row.premiumMethod}
      </span>

      {/* live mid */}
      <span style={{
        textAlign: "right",
        color: tc.mid != null ? COCKPIT_PALETTE.accentGreen : COCKPIT_PALETTE.textFaint,
      }}>
        {liveMid}
      </span>

      {/* spread label */}
      <span style={{
        textAlign: "right",
        color: spreadColor, fontSize: 11,
      }}>
        {spreadLabel}
      </span>
    </div>
  );
}

const truncate = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
