// =====================================================
// BASKET MANDATE CARD
// =====================================================
// Pure presentational card describing a basket's mandate, baseline
// leaders (reference anchors only), discovery keywords, macro drivers,
// catalysts, risk mandate, and rebalance cadence.
//
// Baseline-leader selection + Seed actions live here so the operator
// can opt-in to populating the active universe. Nothing happens
// automatically.
// =====================================================

import React, { useState, useCallback } from "react";

const PALETTE = {
  bg:        "#0d1117",
  panelBg:   "#0a0d12",
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
};

/**
 * @param {object} props
 * @param {object} props.profile             registry profile
 * @param {(symbols: string[]) => void} [props.onSeedBaseline]
 *   Called when the operator clicks Seed Selected / Seed All. The
 *   parent owns the actual store mutation so this component stays pure.
 */
export default function BasketMandateCard({ profile, onSeedBaseline }) {
  const [selected, setSelected] = useState(() => new Set());

  const toggle = useCallback((sym) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym);
      else next.add(sym);
      return next;
    });
  }, []);

  const seedSelected = useCallback(() => {
    if (typeof onSeedBaseline !== "function" || selected.size === 0) return;
    onSeedBaseline(Array.from(selected));
    setSelected(new Set());
  }, [onSeedBaseline, selected]);

  const seedAll = useCallback(() => {
    if (typeof onSeedBaseline !== "function") return;
    onSeedBaseline(profile.baselineLeaders.slice());
  }, [onSeedBaseline, profile]);

  if (!profile) return null;
  const baselineLeaders = Array.isArray(profile.baselineLeaders) ? profile.baselineLeaders : [];

  return (
    <article aria-label={`${profile.basketName} mandate`} style={{
      background: PALETTE.bg,
      border: `1px solid ${PALETTE.border}`,
      borderLeft: `3px solid ${PALETTE.accentTeal}`,
      borderRadius: 8,
      padding: 12,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* Header */}
      <header>
        <div style={{ fontSize: 13, fontWeight: 700, color: PALETTE.accentTeal, letterSpacing: "0.02em" }}>
          {profile.basketName}
        </div>
        <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5, marginTop: 4 }}>
          {profile.mandate}
        </div>
      </header>

      {/* Meta chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Chip label={`Cadence: ${profile.rebalanceCadence}`} tone={PALETTE.textDim} subtle />
        <Chip label={`Max exposure: ${profile.maxSuggestedExposure}`} tone={PALETTE.textDim} subtle />
        <Chip label={`Route: ${humanizeRoute(profile.preferredManagerRoute)}`} tone={PALETTE.cyan} />
      </div>

      {/* Risk mandate */}
      {profile.riskMandate && (
        <div style={{ fontSize: 10, color: PALETTE.textDim, fontStyle: "italic", lineHeight: 1.5 }}>
          {profile.riskMandate}
        </div>
      )}

      {/* Baseline leaders */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint }}>
            BASELINE LEADERS · REFERENCE ANCHORS ONLY
          </span>
          <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
            {baselineLeaders.length} symbol{baselineLeaders.length === 1 ? "" : "s"}
          </span>
        </div>
        <div style={{ fontSize: 10, color: PALETTE.textFaint, lineHeight: 1.5, marginBottom: 6 }}>
          Baseline leaders are reference anchors, not active membership. Click to select, then Seed Selected — or Seed All — to add to the active universe. Nothing is auto-added.
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {baselineLeaders.map((sym) => (
            <button key={sym} type="button"
              onClick={() => toggle(sym)}
              aria-pressed={selected.has(sym)}
              style={{
                background: selected.has(sym) ? `${PALETTE.accentTeal}1a` : "transparent",
                border: `1px solid ${selected.has(sym) ? PALETTE.accentTeal : PALETTE.border}`,
                color: selected.has(sym) ? PALETTE.accentTeal : PALETTE.text,
                borderRadius: 4, padding: "3px 6px",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {sym}{selected.has(sym) ? " ✓" : ""}
            </button>
          ))}
        </div>
        {onSeedBaseline && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <button type="button"
              onClick={seedSelected}
              disabled={selected.size === 0}
              style={btn(PALETTE.green, selected.size === 0)}>
              Seed Selected ({selected.size})
            </button>
            <button type="button"
              onClick={seedAll}
              style={btn(PALETTE.cyan)}>
              Seed All
            </button>
          </div>
        )}
      </section>

      {/* Drivers + catalysts */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 8,
      }}>
        {Array.isArray(profile.discoveryKeywords) && profile.discoveryKeywords.length > 0 && (
          <Bullet label="Discovery keywords" items={profile.discoveryKeywords} tone={PALETTE.cyan} />
        )}
        {Array.isArray(profile.macroDrivers) && profile.macroDrivers.length > 0 && (
          <Bullet label="Macro drivers" items={profile.macroDrivers} tone={PALETTE.purple} />
        )}
        {Array.isArray(profile.positiveCatalysts) && profile.positiveCatalysts.length > 0 && (
          <Bullet label="Positive catalysts" items={profile.positiveCatalysts} tone={PALETTE.green} />
        )}
        {Array.isArray(profile.negativeCatalysts) && profile.negativeCatalysts.length > 0 && (
          <Bullet label="Negative catalysts" items={profile.negativeCatalysts} tone={PALETTE.red} />
        )}
      </div>
    </article>
  );
}

function Bullet({ label, items, tone }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint, marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {items.map((item, i) => (
          <li key={i} style={{
            display: "flex", gap: 6, alignItems: "baseline",
            fontSize: 11, color: PALETTE.text, lineHeight: 1.45, padding: "1px 0",
          }}>
            <span style={{ color: tone }}>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chip({ label, tone, subtle = false }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
      color: tone,
      background: subtle ? "transparent" : `${tone}1a`,
      border: `1px solid ${subtle ? PALETTE.border : `${tone}55`}`,
      borderRadius: 4, padding: "2px 6px",
    }}>
      {label}
    </span>
  );
}

function btn(color, disabled = false) {
  return {
    background: disabled ? "transparent" : `${color}1a`,
    border: `1px solid ${disabled ? PALETTE.border : `${color}88`}`,
    color: disabled ? PALETTE.textFaint : color,
    borderRadius: 6, padding: "5px 10px",
    fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    opacity: disabled ? 0.5 : 1,
  };
}

function humanizeRoute(r) {
  if (!r) return "—";
  return String(r).replace(/_/g, " ").replace(/\bto\b/g, "→").replace(/\bTE and CV\b/i, "TE + CV");
}
