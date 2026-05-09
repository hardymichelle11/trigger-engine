// =====================================================
// CIO CONFLICT SUMMARY
// =====================================================
// Renders the manager-conflict list (thesis vs timing, premium vs
// structure, risk vs opportunity, …) plus the override-reason banner.
// Pure presentational — input comes from buildManagerAssessmentTape.
// =====================================================

import React from "react";

const PALETTE = {
  bg:        "#0d1117",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  amber:     "#f59e0b",
  red:       "#ef4444",
  cyan:      "#06b6d4",
  purple:    "#a78bfa",
};

const CONFLICT_LABELS = {
  thesis_vs_timing:        "Thesis vs Timing",
  premium_vs_structure:    "Premium vs Structure",
  risk_vs_opportunity:     "Risk vs Opportunity",
  macro_vs_micro:          "Macro vs Micro",
  basket_vs_liquidity:     "Basket vs Liquidity",
  missing_evidence:        "Missing Evidence",
  concentration_override:  "Concentration Override",
};

/**
 * @param {object} props
 * @param {string} [props.consensus]
 * @param {Array<object>} [props.conflicts]
 * @param {string|null} [props.overrideReason]
 */
export default function CioConflictSummary({ consensus, conflicts = [], overrideReason }) {
  const hasConflicts = Array.isArray(conflicts) && conflicts.length > 0;

  return (
    <section style={{
      background: PALETTE.bg, border: `1px solid ${PALETTE.border}`,
      borderRadius: 10, padding: 12,
    }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim, marginBottom: 8,
      }}>
        MANAGER CONSENSUS
      </div>
      <div style={{
        fontSize: 13, fontWeight: 700, color: PALETTE.text, marginBottom: 10,
      }}>
        {consensus || "—"}
      </div>

      {overrideReason && (
        <div style={{
          marginBottom: 10, padding: "8px 10px",
          background: `${PALETTE.amber}10`,
          border: `1px solid ${PALETTE.amber}55`,
          borderRadius: 8,
          fontSize: 12, color: PALETTE.text, lineHeight: 1.5,
        }}>
          <div style={{ fontSize: 9, letterSpacing: "0.10em", color: PALETTE.amber, marginBottom: 4, fontWeight: 700 }}>
            CIO OVERRIDE
          </div>
          {overrideReason}
        </div>
      )}

      <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim, marginBottom: 6 }}>
        MANAGER CONFLICTS
      </div>
      {!hasConflicts ? (
        <div style={{ fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic" }}>
          No conflicts detected — managers are aligned.
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {conflicts.map((c, i) => (
            <li key={`${c.conflictType}-${i}`} style={{
              padding: "8px 10px",
              background: "#0a0d12",
              border: `1px solid ${PALETTE.borderSoft}`,
              borderRadius: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                  color: PALETTE.amber,
                  background: `${PALETTE.amber}1a`,
                  border: `1px solid ${PALETTE.amber}55`,
                  borderRadius: 4, padding: "2px 6px",
                }}>
                  Conflict Detected · {CONFLICT_LABELS[c.conflictType] || c.conflictType}
                </span>
                {Array.isArray(c.agentsInConflict) && c.agentsInConflict.length > 0 && (
                  <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
                    {c.agentsInConflict.join(" · ")}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: PALETTE.text, lineHeight: 1.5 }}>
                {c.conflict}
              </div>
              <div style={{
                marginTop: 4, fontSize: 11, color: PALETTE.cyan, lineHeight: 1.5, fontStyle: "italic",
              }}>
                CIO read: {c.cioInterpretation}
              </div>
              {c.suggestedCalibrationCheck && (
                <div style={{ marginTop: 4, fontSize: 10, color: PALETTE.purple, lineHeight: 1.5 }}>
                  Calibration check: {c.suggestedCalibrationCheck}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
