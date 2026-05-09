// =====================================================
// THESIS HEALTH PANEL
// =====================================================
// Operator review surface for approved thesis memory vs proposed
// intelligence. Pure presentational — runs evaluateThesisHealth on
// the inputs and renders the verdict, evidence buckets, and four
// action buttons. The panel never mutates memory directly; every
// action is delegated to the parent via a callback.
//
// Hard rules:
//   - This is a review and governance surface. It does not change
//     scanner verdicts, posture, allowedActions, or risk controls.
//   - Trader-facing copy only. No raw scores / weights / coefficients.
//   - Does not expose raw memory JSON.
// =====================================================

import React, { useMemo } from "react";
import { getBasketAgent } from "../../lib/portfolioCio/basketAgentRegistry.js";
import {
  evaluateThesisHealth,
  THESIS_HEALTH_STATUS,
  THESIS_HEALTH_CONFIDENCE,
} from "../../lib/portfolioCio/thesisHealthEvaluator.js";

const PALETTE = {
  bg:        "#06090e",
  panelBg:   "#0d1117",
  cardBg:    "#0a0d12",
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

const STATUS_TONES = {
  [THESIS_HEALTH_STATUS.STRENGTHENING]:        PALETTE.green,
  [THESIS_HEALTH_STATUS.WEAKENING]:            PALETTE.red,
  [THESIS_HEALTH_STATUS.CONFLICTING]:          PALETTE.amber,
  [THESIS_HEALTH_STATUS.UNCHANGED]:            PALETTE.slate,
  [THESIS_HEALTH_STATUS.INSUFFICIENT_EVIDENCE]: PALETTE.cyan,
};

const STATUS_LABELS = {
  [THESIS_HEALTH_STATUS.STRENGTHENING]:        "Thesis strengthening",
  [THESIS_HEALTH_STATUS.WEAKENING]:            "Thesis weakening",
  [THESIS_HEALTH_STATUS.CONFLICTING]:          "Thesis conflicted",
  [THESIS_HEALTH_STATUS.UNCHANGED]:            "Thesis unchanged",
  [THESIS_HEALTH_STATUS.INSUFFICIENT_EVIDENCE]: "Needs more evidence",
};

const CONFIDENCE_LABELS = {
  [THESIS_HEALTH_CONFIDENCE.HIGH]:        "High confidence",
  [THESIS_HEALTH_CONFIDENCE.MEDIUM]:      "Medium confidence",
  [THESIS_HEALTH_CONFIDENCE.LOW]:         "Low confidence",
  [THESIS_HEALTH_CONFIDENCE.UNAVAILABLE]: "Confidence unavailable",
};

const DISCLAIMER =
  "Thesis Health enriches market context only. It does not override scanner verdicts, Credit View risk, Trigger Engine posture, stale-data warnings, or allowed actions.";

/**
 * @param {object} props
 * @param {string} [props.basketId]
 * @param {string} [props.agentId]
 * @param {string} [props.symbol]
 * @param {object|object[]} [props.approvedMemory]
 * @param {object|object[]} [props.proposedIntelligence]
 * @param {object|null} [props.agentInsight]
 * @param {(proposed: object|null) => void} [props.onAcceptUpdate]
 * @param {(approved: object|null) => void} [props.onEditThesis]
 * @param {(proposed: object|null) => void} [props.onRejectUpdate]
 * @param {(evidenceId: string) => void} [props.onArchiveEvidence]
 */
export default function ThesisHealthPanel({
  basketId,
  agentId,
  symbol,
  approvedMemory,
  proposedIntelligence,
  agentInsight,
  onAcceptUpdate,
  onEditThesis,
  onRejectUpdate,
  onArchiveEvidence,
}) {
  const basketProfile = useMemo(() => basketId ? getBasketAgent(basketId) : null, [basketId]);

  const evaluation = useMemo(() => evaluateThesisHealth({
    basketId,
    agentId,
    symbol,
    approvedMemory,
    proposedIntelligence,
    agentInsight,
  }), [basketId, agentId, symbol, approvedMemory, proposedIntelligence, agentInsight]);

  const approvedArr = arrayify(approvedMemory);
  const proposedArr = arrayify(proposedIntelligence);
  const latestApproved = approvedArr[0] || null;
  const latestProposed = proposedArr[0] || null;

  const tone = STATUS_TONES[evaluation.status] || PALETTE.slate;

  const triggerAccept = () => onAcceptUpdate && onAcceptUpdate(latestProposed);
  const triggerEdit   = () => onEditThesis && onEditThesis(latestApproved);
  const triggerReject = () => onRejectUpdate && onRejectUpdate(latestProposed);

  return (
    <article aria-label="Thesis Health"
      style={{
        background: PALETTE.bg,
        border: `1px solid ${tone}55`,
        borderLeft: `3px solid ${tone}`,
        borderRadius: 10, padding: 12,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
      {/* Header */}
      <header style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "baseline", flexWrap: "wrap", gap: 6,
      }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim, marginBottom: 4 }}>
            THESIS HEALTH
          </div>
          <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
            {basketProfile?.basketName || basketId || "(no basket)"}
            {agentId  ? `  ·  ${agentId}` : ""}
            {symbol ? `  ·  ${symbol}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <Chip tone={tone}
            label={STATUS_LABELS[evaluation.status] || evaluation.status} />
          <Chip tone={confidenceTone(evaluation.confidenceLabel)}
            label={CONFIDENCE_LABELS[evaluation.confidenceLabel] || evaluation.confidenceLabel} />
        </div>
      </header>

      {/* Approved thesis */}
      <section>
        <div style={{ fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint, fontWeight: 700, marginBottom: 4 }}>
          CURRENT APPROVED THESIS
        </div>
        {latestApproved ? (
          <div style={cardStyle(PALETTE.borderSoft)}>
            <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.55, marginBottom: 4 }}>
              {latestApproved.thesis?.coreClaim || latestApproved.title || "(no claim recorded)"}
            </div>
            <div style={{
              display: "flex", gap: 6, flexWrap: "wrap",
              fontSize: 9, color: PALETTE.textFaint,
            }}>
              {latestApproved.thesis?.basketRole && (
                <span><strong style={{ color: PALETTE.textDim }}>Role: </strong>{latestApproved.thesis.basketRole}</span>
              )}
              {latestApproved.thesis?.companyRole && (
                <span><strong style={{ color: PALETTE.textDim }}>Company: </strong>{latestApproved.thesis.companyRole}</span>
              )}
              {latestApproved.thesis?.marketFrame && (
                <span><strong style={{ color: PALETTE.textDim }}>Frame: </strong>{latestApproved.thesis.marketFrame}</span>
              )}
            </div>
          </div>
        ) : (
          <div style={emptyLine()}>No approved thesis on file yet.</div>
        )}
      </section>

      {/* Summary */}
      <section style={{
        background: PALETTE.panelBg,
        border: `1px solid ${PALETTE.borderSoft}`,
        borderRadius: 8, padding: "8px 10px",
      }}>
        <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.55 }}>
          {evaluation.summary}
        </div>
        <div style={{ fontSize: 10, color: PALETTE.textDim, lineHeight: 1.5, marginTop: 4 }}>
          {evaluation.recommendation}
        </div>
      </section>

      {/* Evidence buckets */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 8,
      }}>
        <EvidenceList title="Confirming" tone={PALETTE.green}
          items={evaluation.confirmingEvidence} />
        <EvidenceList title="Challenging" tone={PALETTE.red}
          items={evaluation.challengingEvidence} />
        <EvidenceList title="Neutral / watch" tone={PALETTE.cyan}
          items={evaluation.neutralEvidence} />
      </div>

      {/* Memory status + last updated */}
      <section style={{ fontSize: 10, color: PALETTE.textFaint, lineHeight: 1.5 }}>
        Memory status:&nbsp;
        <strong style={{ color: PALETTE.text }}>
          {approvedArr.length > 0 ? `${approvedArr.length} approved item${approvedArr.length === 1 ? "" : "s"}` : "no approved memory"}
        </strong>
        {" · "}Proposed intelligence:&nbsp;
        <strong style={{ color: PALETTE.text }}>
          {proposedArr.length > 0 ? `${proposedArr.length} item${proposedArr.length === 1 ? "" : "s"}` : "none"}
        </strong>
        {" · "}Last updated:&nbsp;
        <strong style={{ color: PALETTE.text }}>{formatDate(evaluation.updatedAt)}</strong>
      </section>

      {/* Disclaimer */}
      <section style={{
        fontSize: 9, color: PALETTE.textFaint, fontStyle: "italic", lineHeight: 1.5,
        background: PALETTE.cardBg,
        border: `1px solid ${PALETTE.borderSoft}`,
        borderRadius: 6, padding: "6px 8px",
      }}>
        {DISCLAIMER}
      </section>

      {/* Action buttons */}
      <footer style={{
        display: "flex", gap: 6, flexWrap: "wrap",
        marginTop: 4, paddingTop: 6,
        borderTop: `1px solid ${PALETTE.borderSoft}`,
      }}>
        <button type="button" onClick={triggerAccept}
          disabled={!latestProposed}
          style={btn(latestProposed ? PALETTE.green : PALETTE.textFaint, !latestProposed)}>
          Accept Update
        </button>
        <button type="button" onClick={triggerEdit}
          disabled={!latestApproved}
          style={btn(latestApproved ? PALETTE.cyan : PALETTE.textFaint, !latestApproved)}>
          Edit Thesis
        </button>
        <button type="button" onClick={triggerReject}
          disabled={!latestProposed}
          style={btn(latestProposed ? PALETTE.red : PALETTE.textFaint, !latestProposed)}>
          Reject Update
        </button>
        <button type="button"
          onClick={() => onArchiveEvidence && latestApproved && onArchiveEvidence(latestApproved.id)}
          disabled={!latestApproved}
          style={btn(latestApproved ? PALETTE.purple : PALETTE.textFaint, !latestApproved)}>
          Archive Evidence
        </button>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

function EvidenceList({ title, tone, items }) {
  return (
    <div style={cardStyle(`${tone}55`)}>
      <div style={{ fontSize: 9, letterSpacing: "0.10em", color: tone, fontWeight: 700, marginBottom: 4 }}>
        {title.toUpperCase()} · {items.length}
      </div>
      {items.length === 0 ? (
        <div style={emptyLine()}>No items.</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((it, i) => (
            <li key={`${it.label}-${i}`} style={{
              fontSize: 11, color: PALETTE.text, lineHeight: 1.5,
            }}>
              <span style={{ color: tone, fontWeight: 700 }}>•</span>{" "}
              {it.label}
              <span style={{ fontSize: 9, color: PALETTE.textFaint, marginLeft: 4 }}>
                ({it.origin})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({ label, tone }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
      color: tone, background: `${tone}1a`,
      border: `1px solid ${tone}55`, borderRadius: 4, padding: "2px 6px",
    }}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function arrayify(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === "object") return [v];
  return [];
}

function confidenceTone(label) {
  switch (label) {
    case THESIS_HEALTH_CONFIDENCE.HIGH:    return PALETTE.green;
    case THESIS_HEALTH_CONFIDENCE.MEDIUM:  return PALETTE.cyan;
    case THESIS_HEALTH_CONFIDENCE.LOW:     return PALETTE.amber;
    default:                                return PALETTE.textFaint;
  }
}

function formatDate(ts) {
  if (typeof ts !== "number" || ts <= 0) return "—";
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}

function cardStyle(borderColor) {
  return {
    background: PALETTE.cardBg,
    border: `1px solid ${borderColor}`,
    borderRadius: 8, padding: "8px 10px",
  };
}
function emptyLine() {
  return { fontSize: 10, color: PALETTE.textFaint, fontStyle: "italic" };
}
function btn(color, disabled) {
  return {
    background: `${color}1a`, border: `1px solid ${color}88`, color,
    borderRadius: 5, padding: "4px 10px",
    fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    opacity: disabled ? 0.6 : 1,
  };
}
