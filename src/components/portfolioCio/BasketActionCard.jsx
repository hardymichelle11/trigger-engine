// =====================================================
// BASKET ACTION CARD
// =====================================================
// Single review item rendered by BasketActionQueue. Pure presentational.
// Action buttons fire only the callbacks the host supplied — nothing
// happens automatically.
// =====================================================

import React from "react";
import {
  ACTION_TYPE,
  PRIORITY,
} from "../../lib/portfolioCio/basketActionQueue.js";

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
  slate:     "#64748b",
};

const PRIORITY_TONES = {
  [PRIORITY.URGENT]: PALETTE.red,
  [PRIORITY.HIGH]:   PALETTE.amber,
  [PRIORITY.MEDIUM]: PALETTE.cyan,
  [PRIORITY.LOW]:    PALETTE.slate,
};

const PRIORITY_LABELS = {
  [PRIORITY.URGENT]: "Urgent",
  [PRIORITY.HIGH]:   "High priority",
  [PRIORITY.MEDIUM]: "Medium priority",
  [PRIORITY.LOW]:    "Low priority",
};

const ACTION_LABELS = {
  [ACTION_TYPE.RUN_AD_HOC_SIMULATION]:     "Run Ad Hoc Simulation",
  [ACTION_TYPE.SEND_TO_TE]:                "Send to TE",
  [ACTION_TYPE.SEND_TO_CV]:                "Send to CV",
  [ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW]: "Promote to Scanner",
  [ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW]:  "Move to Watchlist",
  [ACTION_TYPE.EXCLUDE_REVIEW]:            "Exclude",
  [ACTION_TYPE.RESTORE_TO_ACTIVE_REVIEW]:  "Restore to Active",
  [ACTION_TYPE.REVIEW_CONFLICT]:           "Review Conflict",
  [ACTION_TYPE.REVIEW_CALIBRATION]:        "Review Calibration",
  [ACTION_TYPE.MONITOR_ONLY]:              "Monitor",
};

const ACTION_TONES = {
  [ACTION_TYPE.RUN_AD_HOC_SIMULATION]:     PALETTE.cyan,
  [ACTION_TYPE.SEND_TO_TE]:                PALETTE.cyan,
  [ACTION_TYPE.SEND_TO_CV]:                PALETTE.cyan,
  [ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW]: PALETTE.accentTeal,
  [ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW]:  PALETTE.amber,
  [ACTION_TYPE.EXCLUDE_REVIEW]:            PALETTE.red,
  [ACTION_TYPE.RESTORE_TO_ACTIVE_REVIEW]:  PALETTE.green,
  [ACTION_TYPE.REVIEW_CONFLICT]:           PALETTE.amber,
  [ACTION_TYPE.REVIEW_CALIBRATION]:        PALETTE.purple,
  [ACTION_TYPE.MONITOR_ONLY]:              PALETTE.slate,
};

/**
 * @param {object} props
 * @param {object} props.item                              queue item
 * @param {(item) => void} [props.onMarkReviewed]
 * @param {(symbol) => void} [props.onRunAdHocSimulation]
 * @param {(symbol) => void} [props.onSendToTE]
 * @param {(symbol) => void} [props.onSendToCV]
 * @param {(symbol) => void} [props.onPromoteToScanner]
 * @param {(symbol) => void} [props.onMoveToWatchlist]
 * @param {(symbol) => void} [props.onMoveToExcluded]
 * @param {(symbol) => void} [props.onRestoreToActive]
 */
export default function BasketActionCard({
  item,
  onMarkReviewed,
  onRunAdHocSimulation,
  onSendToTE,
  onSendToCV,
  onPromoteToScanner,
  onMoveToWatchlist,
  onMoveToExcluded,
  onRestoreToActive,
}) {
  if (!item) return null;
  const priorityTone = PRIORITY_TONES[item.priority] || PALETTE.textFaint;
  const actionTone   = ACTION_TONES[item.actionType] || PALETTE.textFaint;
  const allowed = new Set(item.allowedActions || []);

  const handlerFor = (action) => {
    switch (action) {
      case ACTION_TYPE.RUN_AD_HOC_SIMULATION:
        return onRunAdHocSimulation && (() => onRunAdHocSimulation(item.symbol));
      case ACTION_TYPE.SEND_TO_TE:
        return onSendToTE && (() => onSendToTE(item.symbol));
      case ACTION_TYPE.SEND_TO_CV:
        return onSendToCV && (() => onSendToCV(item.symbol));
      case ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW:
        return onPromoteToScanner && (() => onPromoteToScanner(item.symbol));
      case ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW:
        return onMoveToWatchlist && (() => onMoveToWatchlist(item.symbol, "queue_review"));
      case ACTION_TYPE.EXCLUDE_REVIEW:
        return onMoveToExcluded && (() => onMoveToExcluded(item.symbol, "queue_review"));
      case ACTION_TYPE.RESTORE_TO_ACTIVE_REVIEW:
        return onRestoreToActive && (() => onRestoreToActive(item.symbol));
      default:
        return null;
    }
  };

  return (
    <article aria-label={`${item.symbol} action card`}
      style={{
        background: PALETTE.bg,
        border: `1px solid ${priorityTone}33`,
        borderLeft: `3px solid ${priorityTone}`,
        borderRadius: 8, padding: 10,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
      {/* Header */}
      <header style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", gap: 6, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 12, fontWeight: 700, color: PALETTE.accentTeal, letterSpacing: "0.04em",
          }}>
            {item.symbol}
          </span>
          <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
            {item.basketName}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <Chip label={PRIORITY_LABELS[item.priority] || item.priority} tone={priorityTone} />
          <Chip label={ACTION_LABELS[item.actionType] || item.actionType} tone={actionTone} />
        </div>
      </header>

      {/* Title */}
      <div style={{ fontSize: 12, color: PALETTE.text, lineHeight: 1.45 }}>
        {item.title}
      </div>

      {/* Rationale */}
      {item.rationale && (
        <div style={{ fontSize: 11, color: PALETTE.textDim, lineHeight: 1.5 }}>
          {item.rationale}
        </div>
      )}

      {/* Manager context */}
      {item.managerContext && (
        <div style={{
          fontSize: 10, color: PALETTE.textFaint, fontFamily: "ui-monospace, Menlo, monospace",
        }}>
          {item.managerContext}
        </div>
      )}

      {/* Suggested next step */}
      {item.suggestedNextStep && (
        <div style={{ fontSize: 10, color: PALETTE.cyan, fontStyle: "italic", lineHeight: 1.5 }}>
          → {item.suggestedNextStep}
        </div>
      )}

      {/* Calibration flag */}
      {item.calibrationFlag && (
        <div style={{ fontSize: 10, color: PALETTE.purple, lineHeight: 1.5 }}>
          {item.calibrationFlag}
        </div>
      )}

      {/* Action buttons */}
      <footer style={{
        display: "flex", gap: 4, flexWrap: "wrap",
        marginTop: 4, paddingTop: 6,
        borderTop: `1px solid ${PALETTE.borderSoft}`,
      }}>
        {Array.from(allowed).map((action) => {
          const handler = handlerFor(action);
          if (!handler) return null;
          const tone = ACTION_TONES[action] || PALETTE.textFaint;
          return (
            <button key={action} type="button"
              onClick={handler}
              style={btn(tone)}>
              {ACTION_LABELS[action] || action}
            </button>
          );
        })}
        {onMarkReviewed && (
          <button type="button"
            onClick={() => onMarkReviewed(item)}
            style={btn(PALETTE.textFaint)}>
            Mark Reviewed
          </button>
        )}
      </footer>
    </article>
  );
}

function Chip({ label, tone }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
      color: tone,
      background: `${tone}1a`,
      border: `1px solid ${tone}55`,
      borderRadius: 4, padding: "2px 6px",
    }}>
      {label}
    </span>
  );
}

function btn(color) {
  return {
    background: `${color}1a`, border: `1px solid ${color}88`, color,
    borderRadius: 5, padding: "3px 8px",
    fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
    cursor: "pointer", fontFamily: "inherit",
  };
}
