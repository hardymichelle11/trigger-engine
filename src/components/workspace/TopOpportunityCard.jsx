// =====================================================
// TOP OPPORTUNITY CARD
// =====================================================
// One of the three cards rendered at the top of the operator
// dashboard. Operator-facing only — no engine internals, no scoring,
// no _rank. Click opens the detail drawer for the symbol.
// =====================================================

import React from "react";

const PALETTE = {
  bg:        "#06090e",
  cardBg:    "#0d1117",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  accentTeal:"#14b8a6",
  green:     "#22c55e",
  red:       "#ef4444",
  amber:     "#f59e0b",
  cyan:      "#06b6d4",
  purple:    "#a78bfa",
  slate:     "#64748b",
};

const POSTURE_TONES = {
  GO:    PALETTE.green,
  WATCH: PALETTE.amber,
  WAIT:  PALETTE.cyan,
  AVOID: PALETTE.red,
};

/**
 * @param {object} props
 * @param {object|null} [props.opportunity]
 *   {
 *     symbol, theme, posture: "GO" | "WATCH" | "WAIT" | "AVOID",
 *     reason, premiumQuality, latestNote, whatChanged, action,
 *   }
 * @param {(symbol: string) => void} [props.onSelect]
 * @param {string} [props.placeholderTitle]
 */
export default function TopOpportunityCard({ opportunity, onSelect, placeholderTitle }) {
  if (!opportunity || !opportunity.symbol) {
    return (
      <article style={cardStyle(PALETTE.borderSoft)}>
        <div style={titleStyle(PALETTE.textFaint)}>
          {placeholderTitle || "Top opportunity"}
        </div>
        <div style={{ fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic" }}>
          Waiting for qualifying setup.
        </div>
      </article>
    );
  }

  const posture = opportunity.posture || "WATCH";
  const tone = POSTURE_TONES[posture] || PALETTE.slate;

  return (
    <article aria-label={`${opportunity.symbol} top opportunity`}
      style={cardStyle(tone)}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <div style={titleStyle(tone)}>
          {opportunity.title || "Top opportunity"}
        </div>
        <Chip label={posture} tone={tone} />
      </header>

      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={() => onSelect && onSelect(opportunity.symbol)}
          style={symbolBtn()}>
          {opportunity.symbol}
        </button>
        {opportunity.theme && (
          <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
            {opportunity.theme}
          </span>
        )}
      </div>

      {opportunity.reason && (
        <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
          {opportunity.reason}
        </div>
      )}

      {opportunity.premiumQuality && (
        <div style={{ fontSize: 10, color: PALETTE.textDim }}>
          <strong style={{ color: PALETTE.textDim }}>Premium quality: </strong>
          {opportunity.premiumQuality}
        </div>
      )}

      {opportunity.latestNote && (
        <div style={{
          fontSize: 10, color: PALETTE.textDim, fontStyle: "italic", lineHeight: 1.5,
          background: `${PALETTE.purple}08`,
          border: `1px solid ${PALETTE.purple}33`,
          borderRadius: 6, padding: "5px 8px",
        }}>
          {opportunity.latestNote}
        </div>
      )}

      {opportunity.whatChanged && (
        <div style={{ fontSize: 10, color: PALETTE.amber, lineHeight: 1.5 }}>
          <strong style={{ color: PALETTE.amber, marginRight: 4 }}>What changed:</strong>
          {opportunity.whatChanged}
        </div>
      )}

      {opportunity.action && (
        <div style={{ fontSize: 11, color: PALETTE.cyan, fontStyle: "italic", lineHeight: 1.5 }}>
          → {opportunity.action}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------

function cardStyle(tone) {
  return {
    background: PALETTE.cardBg,
    border: `1px solid ${tone}55`,
    borderLeft: `3px solid ${tone}`,
    borderRadius: 8, padding: 10,
    display: "flex", flexDirection: "column", gap: 6,
    minHeight: 140,
  };
}
function titleStyle(tone) {
  return {
    fontSize: 9, letterSpacing: "0.10em", color: tone, fontWeight: 700,
  };
}
function symbolBtn() {
  return {
    background: "transparent", border: "none", padding: 0, cursor: "pointer",
    color: PALETTE.accentTeal, fontWeight: 700, fontSize: 14, letterSpacing: "0.04em",
    fontFamily: "inherit",
  };
}
function Chip({ label, tone }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
      color: tone, background: `${tone}1a`,
      border: `1px solid ${tone}55`, borderRadius: 4, padding: "2px 6px",
    }}>
      {label}
    </span>
  );
}
