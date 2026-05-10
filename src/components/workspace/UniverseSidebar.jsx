// =====================================================
// UNIVERSE SIDEBAR + WORKSPACE TOP NAV
// =====================================================
// Two complementary navigation surfaces sharing one section list:
//
//   - UniverseSidebar      (default export): the persistent left
//     sidebar shown when the operator wants the full labeled nav.
//   - WorkspaceTopNav      (named export):  a horizontal compact bar
//     rendered ABOVE the main workspace when the operator collapses
//     the nav. Lets the dashboard reclaim the full screen width.
//
// Both share SIDEBAR_SECTIONS / SECTION_ID / SECTION_ABBREV so the
// section identity (id, label, hint, abbreviation) is single-source.
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

// 2-letter abbreviations used as compact pills in the top nav. Hover
// surfaces the full label + hint via title-attribute tooltip.
export const SECTION_ABBREV = Object.freeze({
  [SECTION_ID.DASHBOARD]:        "DB",
  [SECTION_ID.AI_INFRA]:         "AI",
  [SECTION_ID.AI_HEALTH]:        "HX",
  [SECTION_ID.ROBOTICS]:         "RB",
  [SECTION_ID.SAAS_HARVEST]:     "SW",
  [SECTION_ID.DIVIDEND_INCOME]:  "DI",
  [SECTION_ID.WATCHLIST]:        "WL",
  [SECTION_ID.ALERTS]:           "AL",
  [SECTION_ID.PORTFOLIO]:        "PF",
  [SECTION_ID.SETTINGS_ADMIN]:   "ST",
});

// =====================================================================
// UniverseSidebar — vertical 220px navigation (expanded mode)
// =====================================================================

/**
 * @param {object} props
 * @param {string} props.selected
 * @param {(id: string) => void} props.onSelect
 * @param {Record<string, number>} [props.badgeCounts]   optional per-section count
 * @param {() => void} [props.onToggleCollapsed]         when set, renders ◀ toggle
 */
export default function UniverseSidebar({
  selected, onSelect, badgeCounts = {}, onToggleCollapsed,
}) {
  return (
    <nav aria-label="Universe sidebar"
      style={{
        background: PALETTE.bg,
        borderRight: `1px solid ${PALETTE.border}`,
        padding: "12px 8px",
        display: "flex", flexDirection: "column", gap: 2,
        minWidth: 220,
      }}>
      {/* Toggle row */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
        paddingLeft: 8,
      }}>
        <span style={{
          fontSize: 9, letterSpacing: "0.16em", color: PALETTE.textFaint,
        }}>
          WORKSPACE
        </span>
        {onToggleCollapsed && (
          <button type="button"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            style={toggleBtnStyle()}>
            ◀
          </button>
        )}
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
              <span style={badgeStyle()}>{count}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

// =====================================================================
// WorkspaceTopNav — horizontal compact tab bar (collapsed mode)
// =====================================================================

/**
 * Sits above the main workspace + drawer when the operator collapses
 * the navigation. Frees up the entire vertical column on the left so
 * the dashboard / drawer reclaim the screen.
 *
 * @param {object} props
 * @param {string} props.selected
 * @param {(id: string) => void} props.onSelect
 * @param {Record<string, number>} [props.badgeCounts]
 * @param {() => void} [props.onToggleCollapsed]   when set, renders ▶ toggle
 */
export function WorkspaceTopNav({
  selected, onSelect, badgeCounts = {}, onToggleCollapsed,
}) {
  return (
    <nav aria-label="Universe top navigation"
      style={{
        background: PALETTE.bg,
        borderBottom: `1px solid ${PALETTE.border}`,
        padding: "6px 12px",
        display: "flex", flexWrap: "wrap",
        alignItems: "center", gap: 6,
      }}>
      {onToggleCollapsed && (
        <button type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          title="Expand sidebar"
          style={toggleBtnStyle()}>
          ▶
        </button>
      )}
      <span style={{
        fontSize: 9, letterSpacing: "0.16em", color: PALETTE.textFaint,
        marginRight: 4,
      }}>
        WORKSPACE
      </span>
      {SIDEBAR_SECTIONS.map((sec) => {
        const active = sec.id === selected;
        const count = typeof badgeCounts[sec.id] === "number" ? badgeCounts[sec.id] : null;
        const abbrev = SECTION_ABBREV[sec.id] || sec.label.slice(0, 2).toUpperCase();
        return (
          <button key={sec.id} type="button"
            onClick={() => onSelect && onSelect(sec.id)}
            aria-pressed={active}
            aria-label={sec.label}
            title={`${sec.label} — ${sec.hint}`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: active ? `${PALETTE.accentTeal}1a` : "transparent",
              border: `1px solid ${active ? `${PALETTE.accentTeal}66` : PALETTE.borderSoft}`,
              color: active ? PALETTE.accentTeal : PALETTE.textDim,
              borderRadius: 5, padding: "4px 8px",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              cursor: "pointer", fontFamily: "inherit",
            }}>
            <span>{abbrev}</span>
            {count != null && count > 0 && (
              <span style={badgeStyle({ compact: true })}>{count}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------
// Shared style helpers
// ---------------------------------------------------------------------

function toggleBtnStyle() {
  return {
    background: "transparent",
    border: `1px solid ${PALETTE.borderSoft}`,
    color: PALETTE.textDim,
    borderRadius: 4,
    padding: "2px 6px",
    fontSize: 10, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit",
    minWidth: 24, textAlign: "center",
  };
}

function badgeStyle({ compact = false } = {}) {
  return {
    fontSize: 9, fontWeight: 700,
    color: PALETTE.amber,
    background: `${PALETTE.amber}1a`,
    border: `1px solid ${PALETTE.amber}55`,
    borderRadius: 999,
    padding: compact ? "1px 4px" : "1px 6px",
    minWidth: compact ? 14 : 18,
    textAlign: "center",
  };
}
