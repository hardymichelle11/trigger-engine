// =====================================================
// MANAGER ASSESSMENT CARD
// =====================================================
// Single-agent card. Pure presentational — reads a normalized
// assessment object and displays trader-facing fields. No raw
// scores or weights surface here.
// =====================================================

import React from "react";
import {
  STANCE,
  CONFIDENCE,
  TIME_HORIZON,
} from "../../lib/portfolioCio/managerAssessmentTypes.js";

const PALETTE = {
  bg:        "#0d1117",
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

const STANCE_TONES = {
  [STANCE.BULLISH]:      PALETTE.green,
  [STANCE.CONSTRUCTIVE]: PALETTE.accentTeal,
  [STANCE.NEUTRAL]:      PALETTE.slate,
  [STANCE.CAUTIOUS]:     PALETTE.amber,
  [STANCE.BEARISH]:      PALETTE.red,
  [STANCE.UNAVAILABLE]:  PALETTE.textFaint,
};

const STANCE_LABELS = {
  [STANCE.BULLISH]:      "Bullish",
  [STANCE.CONSTRUCTIVE]: "Constructive",
  [STANCE.NEUTRAL]:      "Neutral",
  [STANCE.CAUTIOUS]:     "Cautious",
  [STANCE.BEARISH]:      "Bearish",
  [STANCE.UNAVAILABLE]:  "Unavailable",
};

const CONFIDENCE_LABELS = {
  [CONFIDENCE.HIGH]:        "High confidence",
  [CONFIDENCE.MODERATE]:    "Moderate confidence",
  [CONFIDENCE.LOW]:         "Low confidence",
  [CONFIDENCE.UNAVAILABLE]: "Confidence unavailable",
};

const HORIZON_LABELS = {
  [TIME_HORIZON.SHORT_TERM]:  "Short-term",
  [TIME_HORIZON.NEAR_TERM]:   "Near-term",
  [TIME_HORIZON.LONG_TERM]:   "Long-term",
  [TIME_HORIZON.MIXED]:       "Mixed horizons",
  [TIME_HORIZON.UNAVAILABLE]: "Horizon —",
};

const ACTION_LABELS = {
  proceed:                  "Proceed",
  monitor:                  "Monitor",
  send_to_TE:               "Send to TE",
  send_to_CV:               "Send to CV",
  send_to_TE_and_CV:        "Send to TE + CV",
  add_to_active_universe:   "Add to active universe",
  promote_to_scanner:       "Promote to scanner",
  wait_for_confirmation:    "Wait for confirmation",
  reduce_size:              "Reduce size",
  avoid_for_now:            "Avoid for now",
  insufficient_evidence:    "Insufficient evidence",
};

export default function ManagerAssessmentCard({ assessment }) {
  if (!assessment) return null;
  const tone = STANCE_TONES[assessment.stance] || PALETTE.textFaint;
  const isUnavailable = assessment.stance === STANCE.UNAVAILABLE;

  return (
    <article
      aria-label={`${assessment.agentName} assessment`}
      style={{
        background: PALETTE.bg,
        border: `1px solid ${isUnavailable ? PALETTE.borderSoft : `${tone}55`}`,
        borderLeft: `3px solid ${tone}`,
        borderRadius: 8,
        padding: 12,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
      {/* Header */}
      <header style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", gap: 8, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: PALETTE.text, letterSpacing: "0.02em",
          }}>
            {assessment.agentName}
          </div>
          <div style={{ fontSize: 10, color: PALETTE.textDim, lineHeight: 1.5, marginTop: 2 }}>
            {assessment.agentRole}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <Chip label={STANCE_LABELS[assessment.stance] || assessment.stance} tone={tone} />
          <Chip label={CONFIDENCE_LABELS[assessment.confidenceLabel] || assessment.confidenceLabel} tone={PALETTE.textDim} subtle />
        </div>
      </header>

      {/* Assessment label */}
      {assessment.assessmentLabel && (
        <div style={{
          fontSize: 13, fontWeight: 700, color: tone, letterSpacing: "0.02em",
        }}>
          {assessment.assessmentLabel}
        </div>
      )}

      {/* Evidence summary */}
      {assessment.evidenceSummary && (
        <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
          {assessment.evidenceSummary}
        </div>
      )}

      {/* Bullets */}
      {assessment.supportingEvidence?.length > 0 && (
        <Bullets label="Supporting evidence" tone={PALETTE.green} items={assessment.supportingEvidence} />
      )}
      {assessment.concernFlags?.length > 0 && (
        <Bullets label="Concerns" tone={PALETTE.red} items={assessment.concernFlags} />
      )}
      {assessment.missingEvidence?.length > 0 && (
        <Bullets label="Missing evidence" tone={PALETTE.amber} items={assessment.missingEvidence} />
      )}

      {/* Footer — recommended action + horizon + route */}
      <footer style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", gap: 8, flexWrap: "wrap",
        marginTop: 4, paddingTop: 8,
        borderTop: `1px solid ${PALETTE.borderSoft}`,
      }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Chip label={ACTION_LABELS[assessment.recommendedAction] || assessment.recommendedAction} tone={tone} />
          <Chip label={HORIZON_LABELS[assessment.timeHorizonBias] || assessment.timeHorizonBias} tone={PALETTE.textDim} subtle />
        </div>
        {assessment.calibrationFlag && (
          <span style={{
            fontSize: 10, color: PALETTE.purple, fontStyle: "italic",
          }}>
            Calibration flag: {assessment.calibrationFlag}
          </span>
        )}
      </footer>

      {assessment.routeRecommendation && (
        <div style={{
          fontSize: 10, color: PALETTE.textDim, fontStyle: "italic", lineHeight: 1.5,
        }}>
          {assessment.routeRecommendation}
        </div>
      )}
    </article>
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

function Bullets({ label, tone, items }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint, marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {items.map((item, i) => (
          <li key={i} style={{
            display: "flex", alignItems: "baseline", gap: 6,
            fontSize: 11, color: PALETTE.text, lineHeight: 1.5,
            padding: "1px 0",
          }}>
            <span style={{ color: tone }}>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
