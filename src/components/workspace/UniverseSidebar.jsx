// =====================================================
// UNIVERSE SIDEBAR
// =====================================================
// Persistent left navigation for the operator workspace. Each
// section maps to a top-level view in the redesigned
// UniverseWorkspace. Theme sections that don't have data wired up
// yet still appear so the navigation reflects the planned shape;
// the corresponding views render a "Coming soon" placeholder.
//
// Plain-language mapping the operator sees here:
//   Dynamic Basket          → Active Research
//   CIO Basket              → Manager Review
//   Lethal Board Prospects  → New Opportunities
//   Agent Memory            → Approved Intelligence
//   Thesis Health Evaluator → Thesis Check
//   Market Intelligence Inbox → Intelligence Feed
// =====================================================

import React from "react";

const PALETTE = {
  bg:        "#06090e",
  panelBg:   "#0d1117",
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

export const SECTION_ID = Object.freeze({
  DASHBOARD:        "dashboard",
  AI_INFRA:         "ai_infrastructure",
  AI_HEALTH:        "ai_health_diagnostics",
  ROBOTICS:         "robotics",
  SAAS_HARVEST:     "saas_harvest",
  DIVIDEND_INCOME:  "dividend_income",
  WATCHLIST:        "watchlist",
  ALERTS:           "alerts",
  PORTFOLIO:        "portfolio",
  SETTINGS_ADMIN:   "settings_admin",
});

export const SIDEBAR_SECTIONS = Object.freeze([
  { id: SECTION_ID.DASHBOARD,       label: "Dashboard",              hint: "Overview · top opportunities · active research" },
  { id: SECTION_ID.AI_INFRA,        label: "AI Infrastructure",      hint: "Compute · networks · data centers" },
  { id: SECTION_ID.AI_HEALTH,       label: "AI Health / Diagnostics",hint: "Diagnostics · genomics · pharma data" },
  { id: SECTION_ID.ROBOTICS,        label: "Robotics",               hint: "Physical automation" },
  { id: SECTION_ID.SAAS_HARVEST,    label: "SaaS Harvest",           hint: "Premium harvesting on durable software" },
  { id: SECTION_ID.DIVIDEND_INCOME, label: "Dividend Income",        hint: "Defensive yield" },
  { id: SECTION_ID.WATCHLIST,       label: "Watchlist",              hint: "Active research tickers" },
  { id: SECTION_ID.ALERTS,          label: "Alerts",                 hint: "Catalyst + posture changes" },
  { id: SECTION_ID.PORTFOLIO,       label: "Portfolio",              hint: "Positions · exposure · risk" },
  { id: SECTION_ID.SETTINGS_ADMIN,  label: "Settings / Admin",       hint: "Advanced controls · backend panels" },
]);

/**
 * @param {object} props
 * @param {string} props.selected
 * @param {(id: string) => void} props.onSelect
 * @param {Record<string, number>} [props.badgeCounts]   optional counts per section
 */
export default function UniverseSidebar({ selected, onSelect, badgeCounts = {} }) {
  return (
    <nav aria-label="Universe sidebar"
      style={{
        background: PALETTE.bg,
        borderRight: `1px solid ${PALETTE.border}`,
        padding: "12px 8px",
        display: "flex", flexDirection: "column", gap: 2,
        minWidth: 220,
      }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.16em", color: PALETTE.textFaint,
        marginBottom: 8, paddingLeft: 8,
      }}>
        WORKSPACE
      </div>
      {SIDEBAR_SECTIONS.map((sec) => {
        const active = sec.id === selected;
        const count = typeof badgeCounts[sec.id] === "number" ? badgeCounts[sec.id] : null;
        return (
          <button key={sec.id} type="button"
            onClick={() => onSelect && onSelect(sec.id)}
            aria-pressed={active}
            aria-label={sec.label}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: 6,
              background: active ? `${PALETTE.accentTeal}1a` : "transparent",
              border: `1px solid ${active ? `${PALETTE.accentTeal}66` : "transparent"}`,
              borderLeft: `3px solid ${active ? PALETTE.accentTeal : "transparent"}`,
              color: active ? PALETTE.accentTeal : PALETTE.textDim,
              borderRadius: 6, padding: "7px 10px",
              fontSize: 11, fontWeight: 600, letterSpacing: "0.02em",
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span>{sec.label}</span>
              <span style={{ fontSize: 9, color: PALETTE.textFaint, fontWeight: 400 }}>
                {sec.hint}
              </span>
            </span>
            {count != null && count > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 700,
                color: PALETTE.amber,
                background: `${PALETTE.amber}1a`,
                border: `1px solid ${PALETTE.amber}55`,
                borderRadius: 999, padding: "1px 6px",
                minWidth: 18, textAlign: "center",
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
