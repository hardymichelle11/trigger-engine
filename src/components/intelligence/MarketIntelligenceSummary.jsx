// =====================================================
// MARKET INTELLIGENCE SUMMARY
// =====================================================
// Renders the sanitized MarketIntelligenceSummary as a structured card
// (chips + reads + risks + route + action). No raw scores or weights.
// =====================================================

import React from "react";
import {
  THESIS_ALIGNMENT,
  CATALYST_TYPE,
  ROUTE_RECOMMENDATION,
  CONFIDENCE_LABEL,
} from "../../lib/intelligence/newsIntelligenceTypes.js";

const PALETTE = {
  bg:        "#0d1117",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  green:     "#22c55e",
  amber:     "#f59e0b",
  red:       "#ef4444",
  slate:     "#64748b",
  accentTeal:"#14b8a6",
  cyan:      "#06b6d4",
  purple:    "#a78bfa",
};

const THESIS_TONES = {
  [THESIS_ALIGNMENT.SUPPORTS]:   PALETTE.green,
  [THESIS_ALIGNMENT.MIXED]:      PALETTE.amber,
  [THESIS_ALIGNMENT.NEUTRAL]:    PALETTE.slate,
  [THESIS_ALIGNMENT.CONFLICTS]:  PALETTE.red,
  [THESIS_ALIGNMENT.UNAVAILABLE]:PALETTE.textFaint,
};

const THESIS_LABELS = {
  [THESIS_ALIGNMENT.SUPPORTS]:    "Thesis: supports",
  [THESIS_ALIGNMENT.MIXED]:       "Thesis: mixed",
  [THESIS_ALIGNMENT.NEUTRAL]:     "Thesis: neutral",
  [THESIS_ALIGNMENT.CONFLICTS]:   "Thesis: conflicts",
  [THESIS_ALIGNMENT.UNAVAILABLE]: "Thesis: unavailable",
};

const CATALYST_LABELS = {
  [CATALYST_TYPE.MACRO]:             "Macro",
  [CATALYST_TYPE.EARNINGS]:          "Earnings",
  [CATALYST_TYPE.PRODUCT]:           "Product",
  [CATALYST_TYPE.PARTNERSHIP]:       "Partnership",
  [CATALYST_TYPE.CUSTOMER_ADOPTION]: "Customer adoption",
  [CATALYST_TYPE.REGULATORY]:        "Regulatory",
  [CATALYST_TYPE.CAPITAL_MARKETS]:   "Capital markets",
  [CATALYST_TYPE.SECTOR_ROTATION]:   "Sector rotation",
  [CATALYST_TYPE.SENTIMENT]:         "Sentiment",
  [CATALYST_TYPE.NONE]:              "No catalyst",
};

const ROUTE_LABELS = {
  [ROUTE_RECOMMENDATION.ADD_TO_BASKET]:           "Add to basket",
  [ROUTE_RECOMMENDATION.MONITOR]:                 "Monitor",
  [ROUTE_RECOMMENDATION.SEND_TO_TE]:              "Send to TE",
  [ROUTE_RECOMMENDATION.SEND_TO_CV]:              "Send to CV",
  [ROUTE_RECOMMENDATION.SEND_TO_TE_AND_CV]:       "Send to TE + CV",
  [ROUTE_RECOMMENDATION.PROMOTE_TO_SCANNER]:      "Promote to scanner",
  [ROUTE_RECOMMENDATION.AVOID_FOR_NOW]:           "Avoid for now",
  [ROUTE_RECOMMENDATION.THESIS_CONFLICT_DETECTED]:"Thesis conflict",
};

const CONFIDENCE_LABELS = {
  [CONFIDENCE_LABEL.HIGH]:        "High confidence",
  [CONFIDENCE_LABEL.MODERATE]:    "Moderate confidence",
  [CONFIDENCE_LABEL.LOW]:         "Low confidence",
  [CONFIDENCE_LABEL.UNAVAILABLE]: "Confidence unavailable",
};

/**
 * @param {object} props
 * @param {object} props.summary  sanitized MarketIntelligenceSummary
 */
export default function MarketIntelligenceSummary({ summary }) {
  if (!summary) return null;
  const thesisTone = THESIS_TONES[summary.thesisAlignment] || PALETTE.textFaint;

  return (
    <section aria-label="Market intelligence summary" style={{
      background: PALETTE.bg, border: `1px solid ${PALETTE.border}`,
      borderRadius: 10, padding: 12,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* Chip row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <Chip label={THESIS_LABELS[summary.thesisAlignment] || summary.thesisAlignment} tone={thesisTone} />
        <Chip label={`Catalyst: ${CATALYST_LABELS[summary.catalystType] || summary.catalystType}`} tone={PALETTE.cyan} />
        <Chip label={CONFIDENCE_LABELS[summary.confidenceLabel] || summary.confidenceLabel} tone={PALETTE.textDim} subtle />
        {summary.basketLayer && (
          <Chip label={`Basket: ${summary.basketLayer}`} tone={PALETTE.accentTeal} subtle />
        )}
      </div>

      {/* Reads */}
      {summary.macroRead && (
        <Read label="Macro read"    text={summary.macroRead} />
      )}
      {summary.businessRead && (
        <Read label="Business read" text={summary.businessRead} />
      )}
      {summary.newsRead && (
        <Read label="News read"     text={summary.newsRead} />
      )}

      {/* Risks */}
      {Array.isArray(summary.riskContradictions) && summary.riskContradictions.length > 0 && (
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint, marginBottom: 4 }}>
            RISK CONTRADICTIONS
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {summary.riskContradictions.map((r, i) => (
              <li key={i} style={{
                display: "flex", gap: 6, alignItems: "baseline",
                fontSize: 11, color: PALETTE.text, lineHeight: 1.5, padding: "1px 0",
              }}>
                <span style={{ color: PALETTE.red }}>•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Route + action */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap",
        paddingTop: 8, borderTop: `1px solid ${PALETTE.borderSoft}`,
      }}>
        <Chip label={ROUTE_LABELS[summary.routeRecommendation] || summary.routeRecommendation} tone={routeTone(summary.routeRecommendation)} />
        {summary.actionSummary && (
          <span style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5, flex: 1 }}>
            {summary.actionSummary}
          </span>
        )}
      </div>
    </section>
  );
}

function routeTone(route) {
  switch (route) {
    case ROUTE_RECOMMENDATION.ADD_TO_BASKET:
    case ROUTE_RECOMMENDATION.PROMOTE_TO_SCANNER:
      return PALETTE.accentTeal;
    case ROUTE_RECOMMENDATION.SEND_TO_TE:
    case ROUTE_RECOMMENDATION.SEND_TO_CV:
    case ROUTE_RECOMMENDATION.SEND_TO_TE_AND_CV:
      return PALETTE.cyan;
    case ROUTE_RECOMMENDATION.MONITOR:
      return PALETTE.amber;
    case ROUTE_RECOMMENDATION.AVOID_FOR_NOW:
    case ROUTE_RECOMMENDATION.THESIS_CONFLICT_DETECTED:
      return PALETTE.red;
    default:
      return PALETTE.textFaint;
  }
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

function Read({ label, text }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint, marginBottom: 2 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
        {text}
      </div>
    </div>
  );
}
