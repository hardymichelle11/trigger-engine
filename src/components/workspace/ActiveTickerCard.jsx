// =====================================================
// ACTIVE TICKER CARD
// =====================================================
// One row in the operator workspace's "Active Research" list. Pure
// presentational. Operator-facing language only — no _rank, score,
// or memory JSON. Click selects the symbol and opens the drawer.
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

const CHANGE_TONES = {
  challenging: PALETTE.red,
  supportive:  PALETTE.green,
  neutral:     PALETTE.textFaint,
};

/**
 * @param {object} props
 * @param {object} props.ticker
 *   {
 *     symbol, theme,
 *     enginePosture: "GO" | "WATCH" | "WAIT" | "AVOID" | string,
 *     creditViewPosture: string,
 *     thesisCheckStatus: "strengthening" | "weakening" | "conflicting" | "unchanged" | "insufficient_evidence" | string,
 *     intelligenceHeadline: string,
 *     whyHere: string,
 *     whatChanged: string,
 *     whatChangedTone: "supportive" | "challenging" | "neutral",
 *     nextStep: string,
 *     watchRisk: string,
 *   }
 * @param {boolean} [props.isSelected]
 * @param {(symbol: string) => void} [props.onSelect]
 * @param {(symbol: string) => void} [props.onRemove]
 */
export default function ActiveTickerCard({ ticker, isSelected, onSelect, onRemove }) {
  if (!ticker || !ticker.symbol) return null;

  const postureTone = POSTURE_TONES[ticker.enginePosture] || PALETTE.slate;
  const changeTone = CHANGE_TONES[ticker.whatChangedTone] || PALETTE.textFaint;

  return (
    <article aria-label={`${ticker.symbol} active research card`}
      style={{
        background: PALETTE.cardBg,
        border: `1px solid ${isSelected ? `${postureTone}88` : PALETTE.border}`,
        borderLeft: `3px solid ${postureTone}`,
        borderRadius: 8, padding: 10,
        display: "flex", flexDirection: "column", gap: 5,
        cursor: "pointer",
      }}
      onClick={() => onSelect && onSelect(ticker.symbol)}>
      {/* Header */}
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 6, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 13, fontWeight: 700, color: PALETTE.accentTeal, letterSpacing: "0.04em",
          }}>
            {ticker.symbol}
          </span>
          {ticker.theme && (
            <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
              {ticker.theme}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {ticker.enginePosture && <Chip label={`Posture: ${ticker.enginePosture}`} tone={postureTone} />}
          {ticker.creditViewPosture && <Chip label={`CV: ${ticker.creditViewPosture}`} tone={PALETTE.cyan} />}
          {ticker.thesisCheckStatus && <Chip label={`Thesis: ${labelForStatus(ticker.thesisCheckStatus)}`} tone={thesisTone(ticker.thesisCheckStatus)} />}
          {onRemove && (
            <button type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(ticker.symbol); }}
              style={miniBtn(PALETTE.textFaint)}
              aria-label={`Remove ${ticker.symbol}`}>×</button>
          )}
        </div>
      </header>

      {ticker.whyHere && (
        <Field label="Why this is here" value={ticker.whyHere} />
      )}
      {ticker.whatChanged && (
        <div style={{ fontSize: 10, color: changeTone, lineHeight: 1.5 }}>
          <strong style={{ color: changeTone, marginRight: 4 }}>What changed:</strong>
          {ticker.whatChanged}
        </div>
      )}
      {ticker.intelligenceHeadline && (
        <div style={{
          fontSize: 10, color: PALETTE.textDim, fontStyle: "italic", lineHeight: 1.5,
          background: `${PALETTE.purple}08`,
          border: `1px solid ${PALETTE.purple}33`,
          borderRadius: 6, padding: "4px 8px",
        }}>
          {ticker.intelligenceHeadline}
        </div>
      )}
      {(ticker.nextStep || ticker.actionHint) && (
        <div style={{ fontSize: 11, color: PALETTE.cyan, fontStyle: "italic", lineHeight: 1.5 }}>
          <strong style={{ color: PALETTE.cyan, marginRight: 4 }}>Next step:</strong>
          {ticker.nextStep || ticker.actionHint}
        </div>
      )}
      {ticker.watchRisk && (
        <div style={{
          fontSize: 10, color: PALETTE.amber, lineHeight: 1.5,
          background: `${PALETTE.amber}10`,
          border: `1px solid ${PALETTE.amber}33`,
          borderRadius: 6, padding: "4px 8px",
        }}>
          <strong style={{ color: PALETTE.amber, marginRight: 4 }}>Watch risk:</strong>
          {ticker.watchRisk}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

function Field({ label, value }) {
  return (
    <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
      <strong style={{ color: PALETTE.textDim, marginRight: 4 }}>{label}:</strong>
      {value}
    </div>
  );
}

function Chip({ label, tone }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
      color: tone, background: `${tone}1a`,
      border: `1px solid ${tone}55`, borderRadius: 4, padding: "1px 5px",
    }}>
      {label}
    </span>
  );
}

function miniBtn(color) {
  return {
    background: `${color}1a`, border: `1px solid ${color}66`, color,
    borderRadius: 4, padding: "0 6px",
    fontSize: 11, fontWeight: 700, lineHeight: 1.4,
    cursor: "pointer", fontFamily: "inherit",
  };
}

function labelForStatus(s) {
  switch (s) {
    case "strengthening":         return "Strengthening";
    case "weakening":             return "Weakening";
    case "conflicting":           return "Conflicting";
    case "unchanged":             return "Unchanged";
    case "insufficient_evidence": return "Needs evidence";
    default:                      return s || "Unavailable";
  }
}

function thesisTone(s) {
  switch (s) {
    case "strengthening": return PALETTE.green;
    case "weakening":     return PALETTE.red;
    case "conflicting":   return PALETTE.amber;
    case "unchanged":     return PALETTE.slate;
    default:              return PALETTE.textFaint;
  }
}
