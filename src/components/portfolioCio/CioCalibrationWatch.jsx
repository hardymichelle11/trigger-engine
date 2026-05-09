// =====================================================
// CIO CALIBRATION WATCH
// =====================================================
// Renders the calibrationWatch record from buildManagerAssessmentTape.
// When calibrationNeeded === false the panel collapses to a quiet
// "no calibration flag" line so the operator still sees the section
// header consistently.
// =====================================================

import React from "react";

const PALETTE = {
  bg:        "#0d1117",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  purple:    "#a78bfa",
  cyan:      "#06b6d4",
};

const REVIEW_LABELS = {
  "5_trading_days": "Review after 5 trading days",
  "10_trading_days": "Review after 10 trading days",
  "1_week":  "Review after 1 week",
  "2_weeks": "Review after 2 weeks",
};

/**
 * @param {object} props
 * @param {object} props.watch
 *   { calibrationNeeded, calibrationReason, watchMetric, reviewAfter,
 *     clueFromHistory }
 */
export default function CioCalibrationWatch({ watch }) {
  const w = watch || {};
  const needed = !!w.calibrationNeeded;
  const tone = needed ? PALETTE.purple : PALETTE.textFaint;

  return (
    <section style={{
      background: PALETTE.bg,
      border: `1px solid ${needed ? `${tone}55` : PALETTE.border}`,
      borderRadius: 10, padding: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim }}>
          CALIBRATION WATCH
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
          color: tone,
          background: `${tone}1a`, border: `1px solid ${tone}55`,
          borderRadius: 4, padding: "2px 6px",
        }}>
          {needed ? "FLAG ACTIVE" : "NO FLAG"}
        </span>
      </div>

      {!needed ? (
        <div style={{ fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic" }}>
          No calibration concerns — manager reads do not suggest the CIO is misaligned.
          {w.clueFromHistory && (
            <div style={{ marginTop: 6, color: PALETTE.cyan, fontStyle: "normal" }}>
              History clue: {w.clueFromHistory}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: PALETTE.text, lineHeight: 1.55, marginBottom: 6 }}>
            {w.calibrationReason}
          </div>
          {w.watchMetric && (
            <div style={{
              fontSize: 11, color: PALETTE.textDim, lineHeight: 1.5, marginBottom: 4,
            }}>
              <strong style={{ color: PALETTE.textDim, fontWeight: 700 }}>Watch: </strong>
              {w.watchMetric}
            </div>
          )}
          {w.reviewAfter && (
            <div style={{
              fontSize: 11, color: PALETTE.textDim, lineHeight: 1.5,
            }}>
              <strong style={{ color: PALETTE.textDim, fontWeight: 700 }}>Cadence: </strong>
              {REVIEW_LABELS[w.reviewAfter] || w.reviewAfter}
            </div>
          )}
          {w.clueFromHistory && (
            <div style={{
              marginTop: 6, fontSize: 11, color: PALETTE.cyan, fontStyle: "italic", lineHeight: 1.5,
            }}>
              History clue: {w.clueFromHistory}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
