// =====================================================
// MANAGER ASSESSMENT TAPE
// =====================================================
// Top-level renderer for the CIO subagent tape. Composes:
//   1. CIO Final Recommendation
//   2. Manager Consensus
//   3. Manager Conflicts (CioConflictSummary — also surfaces the
//      override reason)
//   4. Manager Assessment Tape (one ManagerAssessmentCard per agent)
//   5. Calibration Watch
//   6. Missing Evidence
// =====================================================

import React from "react";
import ManagerAssessmentCard from "./ManagerAssessmentCard.jsx";
import CioConflictSummary from "./CioConflictSummary.jsx";
import CioCalibrationWatch from "./CioCalibrationWatch.jsx";

const PALETTE = {
  bg:        "#06090e",
  panelBg:   "#0d1117",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  accentTeal:"#14b8a6",
  green:     "#22c55e",
  amber:     "#f59e0b",
  red:       "#ef4444",
  cyan:      "#06b6d4",
  slate:     "#64748b",
};

const ACTION_TONES = {
  proceed:                  PALETTE.green,
  monitor:                  PALETTE.amber,
  send_to_TE:               PALETTE.cyan,
  send_to_CV:               PALETTE.cyan,
  send_to_TE_and_CV:        PALETTE.cyan,
  add_to_active_universe:   PALETTE.accentTeal,
  promote_to_scanner:       PALETTE.accentTeal,
  wait_for_confirmation:    PALETTE.amber,
  reduce_size:              PALETTE.amber,
  avoid_for_now:            PALETTE.red,
  insufficient_evidence:    PALETTE.textFaint,
};

/**
 * @param {object} props
 * @param {object} props.tape — output of buildManagerAssessmentTape()
 */
export default function ManagerAssessmentTape({ tape }) {
  if (!tape) return null;
  const {
    symbol,
    cioRecommendation,
    managerConsensus,
    managerConflicts,
    overrideReason,
    calibrationWatch,
    assessments,
    missingEvidence,
  } = tape;

  const action = cioRecommendation?.action;
  const tone = ACTION_TONES[action] || PALETTE.accentTeal;

  return (
    <section
      aria-label="CIO Manager Assessment Tape"
      style={{
        background: PALETTE.bg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 10, padding: 12,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
      {/* 1. CIO Final Recommendation */}
      <header style={{
        background: PALETTE.panelBg,
        border: `1px solid ${tone}55`,
        borderRadius: 10, padding: 12,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "baseline", gap: 8, marginBottom: 6, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim }}>
            CIO FINAL RECOMMENDATION
          </span>
          {symbol && (
            <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.accentTeal }}>
              {symbol}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 16, fontWeight: 700, color: tone, letterSpacing: "0.02em",
        }}>
          {cioRecommendation?.label || "—"}
        </div>
        {cioRecommendation?.rationale && (
          <div style={{
            marginTop: 6, fontSize: 11, color: PALETTE.text, lineHeight: 1.55,
          }}>
            <strong style={{ color: PALETTE.textDim, fontWeight: 700 }}>Why did CIO decide this? </strong>
            {cioRecommendation.rationale}
          </div>
        )}
      </header>

      {/* 2 + 3. Manager Consensus + Conflicts + Override */}
      <CioConflictSummary
        consensus={managerConsensus}
        conflicts={managerConflicts}
        overrideReason={overrideReason} />

      {/* 4. Manager Assessment Tape — per-agent cards */}
      <section style={{
        background: PALETTE.panelBg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 10, padding: 12,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          marginBottom: 10, gap: 8, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim }}>
            MANAGER ASSESSMENT TAPE
          </span>
          <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
            Subagent reads · {(assessments || []).length} managers
          </span>
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 10,
        }}>
          {(assessments || []).map((a) => (
            <ManagerAssessmentCard key={a.agentId} assessment={a} />
          ))}
        </div>
      </section>

      {/* 5. Calibration watch */}
      <CioCalibrationWatch watch={calibrationWatch} />

      {/* 6. Missing evidence rollup */}
      {Array.isArray(missingEvidence) && missingEvidence.length > 0 && (
        <section style={{
          background: PALETTE.panelBg,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: 10, padding: 12,
        }}>
          <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim, marginBottom: 6 }}>
            MISSING EVIDENCE
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {missingEvidence.map((line, i) => (
              <li key={i} style={{
                fontSize: 11, color: PALETTE.text, lineHeight: 1.5,
                display: "flex", gap: 6, alignItems: "baseline",
              }}>
                <span style={{ color: PALETTE.amber }}>•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
