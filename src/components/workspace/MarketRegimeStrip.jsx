// =====================================================
// MARKET REGIME STRIP
// =====================================================
// Top context bar showing the current market posture, Credit View
// regime, volatility state, and a "What changed today?" line. Pure
// presentational. When upstream regime data is unavailable, renders a
// safe placeholder.
// =====================================================

import React from "react";

const PALETTE = {
  bg:        "#0d1117",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  accentTeal:"#14b8a6",
  amber:     "#f59e0b",
  green:     "#22c55e",
  red:       "#ef4444",
  cyan:      "#06b6d4",
  purple:    "#a78bfa",
};

const POSTURE_TONES = {
  GO:    PALETTE.green,
  WATCH: PALETTE.amber,
  WAIT:  PALETTE.cyan,
  AVOID: PALETTE.red,
};

/**
 * @param {object} props
 * @param {object|null} [props.regime]
 *   {
 *     marketPosture:    "GO" | "WATCH" | "WAIT" | "AVOID" | string,
 *     creditViewRegime: string,
 *     volatilityState:  string,
 *     aiThemeRegime:    string,
 *     whatChangedToday: string,
 *   }
 */
export default function MarketRegimeStrip({ regime }) {
  const r = regime || {};
  const empty =
    !r.marketPosture && !r.creditViewRegime && !r.volatilityState &&
    !r.aiThemeRegime  && !r.whatChangedToday;

  if (empty) {
    return (
      <section aria-label="Market regime strip"
        style={{
          background: PALETTE.bg,
          border: `1px solid ${PALETTE.borderSoft}`,
          borderRadius: 8, padding: "10px 12px",
          fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic",
        }}>
        Regime data unavailable — waiting for next scan.
      </section>
    );
  }

  const postureTone = POSTURE_TONES[r.marketPosture] || PALETTE.textFaint;

  return (
    <section aria-label="Market regime strip"
      style={{
        background: PALETTE.bg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 8, padding: "10px 12px",
        display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center",
      }}>
      <RegimeCell label="Market posture"   value={r.marketPosture}    tone={postureTone} />
      <RegimeCell label="Credit View"      value={r.creditViewRegime} tone={PALETTE.cyan} />
      <RegimeCell label="Volatility"       value={r.volatilityState}  tone={PALETTE.amber} />
      <RegimeCell label="AI theme"         value={r.aiThemeRegime}    tone={PALETTE.purple} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 8, letterSpacing: "0.10em", color: PALETTE.textFaint, marginBottom: 2 }}>
          WHAT CHANGED TODAY?
        </div>
        <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.55 }}>
          {r.whatChangedToday || "No change since last scan."}
        </div>
      </div>
    </section>
  );
}

function RegimeCell({ label, value, tone }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontSize: 8, letterSpacing: "0.10em", color: PALETTE.textFaint, marginBottom: 2 }}>
        {(label || "").toUpperCase()}
      </div>
      {value ? (
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
          color: tone, background: `${tone}1a`,
          border: `1px solid ${tone}55`, borderRadius: 4, padding: "2px 6px",
        }}>
          {String(value)}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic" }}>
          unavailable
        </span>
      )}
    </div>
  );
}
