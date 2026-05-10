// =====================================================
// TICKER DETAIL DRAWER
// =====================================================
// Right-side drawer that opens whenever the operator selects a ticker
// (search, click on top-3 card, click on active research card). Pure
// presentational — pulls everything it needs from the supplied
// agentInsight + intelligence items + thesis health evaluation +
// market intelligence context.
//
// Sections (top to bottom):
//   1. Header
//   2. Chart placeholder
//   3. What changed?
//   4. Trigger Engine summary
//   5. Credit View summary
//   6. Thesis Check (compact)
//   7. Market Intelligence Context
//   8. Intelligence Feed (ticker-specific)
//   9. Recommended action
//  10. Risk / invalidation notes
//
// Hard rules:
//   - No raw scores / weights / coefficients / _rank.
//   - Disclaimer "Context only — does not override engine verdict."
//     surfaces under the Market Intelligence section.
//   - When data is missing for a section, render a safe placeholder
//     instead of hiding the section entirely so the operator always
//     sees the same shape.
// =====================================================

import React from "react";

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

const POSTURE_TONES = {
  GO:    PALETTE.green,
  WATCH: PALETTE.amber,
  WAIT:  PALETTE.cyan,
  AVOID: PALETTE.red,
};

const THESIS_STATUS_TONES = {
  strengthening: PALETTE.green,
  weakening:     PALETTE.red,
  conflicting:   PALETTE.amber,
  unchanged:     PALETTE.slate,
  insufficient_evidence: PALETTE.cyan,
};

const NO_OVERRIDE = "Context only — does not override engine verdict.";

/**
 * @param {object} props
 * @param {string} props.symbol
 * @param {string} [props.theme]
 * @param {string} [props.posture]              "GO" / "WATCH" / "WAIT" / "AVOID"
 * @param {string} [props.lastUpdated]
 * @param {string} [props.whatChanged]
 * @param {object} [props.triggerEngine]        { posture, summary }
 * @param {object} [props.creditView]           { posture, summary }
 * @param {object} [props.thesisCheck]          output of evaluateThesisHealth
 * @param {object|null} [props.marketIntelligenceContext] from marketIntelligenceContextBuilder
 * @param {object[]} [props.intelligenceFeed]   intelligence items relevant to the ticker
 * @param {string} [props.recommendedAction]
 * @param {string[]} [props.risks]
 * @param {() => void} [props.onClose]
 */
export default function TickerDetailDrawer({
  symbol,
  theme,
  posture,
  lastUpdated,
  whatChanged,
  triggerEngine,
  creditView,
  thesisCheck,
  marketIntelligenceContext,
  intelligenceFeed,
  recommendedAction,
  risks,
  onClose,
}) {
  if (!symbol) return null;
  const tone = POSTURE_TONES[posture] || PALETTE.slate;

  return (
    <aside aria-label={`${symbol} detail drawer`}
      style={{
        background: PALETTE.bg,
        borderLeft: `1px solid ${PALETTE.border}`,
        padding: 12,
        display: "flex", flexDirection: "column", gap: 10,
        minWidth: 320, maxWidth: 480, overflow: "auto",
      }}>
      {/* 1. Header */}
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 6, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim }}>
            DETAIL
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: PALETTE.accentTeal, letterSpacing: "0.04em" }}>
              {symbol}
            </span>
            {theme && (
              <span style={{ fontSize: 10, color: PALETTE.textFaint }}>{theme}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            {posture && <Chip label={posture} tone={tone} />}
            {lastUpdated && (
              <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
                Last updated {lastUpdated}
              </span>
            )}
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} style={btn(PALETTE.textFaint)}>Close</button>
        )}
      </header>

      {/* 2. Chart area */}
      <Section title="Chart">
        <div aria-label="Chart placeholder"
          style={{
            background: PALETTE.panelBg,
            border: `1px dashed ${PALETTE.borderSoft}`,
            borderRadius: 8, padding: 24,
            display: "flex", alignItems: "center", justifyContent: "center",
            minHeight: 140,
            fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic", textAlign: "center",
          }}>
          Chart integration pending — use TradingView or your charting tool of choice in another tab.
        </div>
      </Section>

      {/* 3. What changed */}
      <Section title="What changed?">
        <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.55 }}>
          {whatChanged || "No major change since last scan."}
        </div>
      </Section>

      {/* 4. Trigger Engine summary */}
      <Section title="Trigger Engine summary">
        {triggerEngine && (triggerEngine.posture || triggerEngine.summary) ? (
          <div>
            {triggerEngine.posture && (
              <div style={{ fontSize: 10, color: PALETTE.textFaint, marginBottom: 2 }}>
                Posture: <strong style={{ color: PALETTE.text }}>{triggerEngine.posture}</strong>
              </div>
            )}
            {triggerEngine.summary && (
              <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.55 }}>
                {triggerEngine.summary}
              </div>
            )}
          </div>
        ) : (
          <PlaceholderLine>Trigger Engine read unavailable for this symbol.</PlaceholderLine>
        )}
      </Section>

      {/* 5. Credit View summary */}
      <Section title="Credit View summary">
        {creditView && (creditView.posture || creditView.summary) ? (
          <div>
            {creditView.posture && (
              <div style={{ fontSize: 10, color: PALETTE.textFaint, marginBottom: 2 }}>
                Stance: <strong style={{ color: PALETTE.text }}>{creditView.posture}</strong>
              </div>
            )}
            {creditView.summary && (
              <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.55 }}>
                {creditView.summary}
              </div>
            )}
          </div>
        ) : (
          <PlaceholderLine>Credit View read unavailable for this symbol.</PlaceholderLine>
        )}
      </Section>

      {/* 6. Thesis Check */}
      <Section title="Thesis Check">
        {thesisCheck ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <Chip
                label={labelForStatus(thesisCheck.status)}
                tone={THESIS_STATUS_TONES[thesisCheck.status] || PALETTE.textFaint} />
              {thesisCheck.confidenceLabel && (
                <Chip label={confidenceLabel(thesisCheck.confidenceLabel)}
                  tone={confidenceTone(thesisCheck.confidenceLabel)} />
              )}
            </div>
            {thesisCheck.summary && (
              <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
                {thesisCheck.summary}
              </div>
            )}
            {thesisCheck.recommendation && (
              <div style={{ fontSize: 10, color: PALETTE.textDim, fontStyle: "italic", lineHeight: 1.5 }}>
                {thesisCheck.recommendation}
              </div>
            )}
          </div>
        ) : (
          <PlaceholderLine>No thesis on file yet — process and approve an intelligence item to set the operator baseline.</PlaceholderLine>
        )}
      </Section>

      {/* 7. Market Intelligence Context */}
      <Section title="Market Intelligence Context">
        {marketIntelligenceContext ? (
          <div style={{
            background: `${PALETTE.purple}08`,
            border: `1px solid ${PALETTE.purple}33`,
            borderLeft: `2px solid ${PALETTE.purple}`,
            borderRadius: 6, padding: "8px 10px",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            {marketIntelligenceContext.basket && (
              <div style={{ fontSize: 10, color: PALETTE.textFaint }}>
                Basket: <strong style={{ color: PALETTE.text }}>{marketIntelligenceContext.basket}</strong>
              </div>
            )}
            {marketIntelligenceContext.agentRead && (
              <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.55 }}>
                {marketIntelligenceContext.agentRead}
              </div>
            )}
            {marketIntelligenceContext.thesisAlignment && (
              <div style={{ fontSize: 10, color: PALETTE.textDim }}>
                Thesis alignment: <strong style={{ color: PALETTE.text }}>{marketIntelligenceContext.thesisAlignment}</strong>
              </div>
            )}
            {Array.isArray(marketIntelligenceContext.supportingSignals) &&
              marketIntelligenceContext.supportingSignals.length > 0 && (
              <SignalLine label="Supporting signals" tone={PALETTE.green}
                items={marketIntelligenceContext.supportingSignals} />
            )}
            {Array.isArray(marketIntelligenceContext.challengingSignals) &&
              marketIntelligenceContext.challengingSignals.length > 0 && (
              <SignalLine label="Challenging signals" tone={PALETTE.red}
                items={marketIntelligenceContext.challengingSignals} />
            )}
            {marketIntelligenceContext.primaryRisk && (
              <div style={{ fontSize: 10, color: PALETTE.textDim }}>
                Primary risk: <strong style={{ color: PALETTE.text }}>{marketIntelligenceContext.primaryRisk}</strong>
              </div>
            )}
            {marketIntelligenceContext.tradeTranslation && (
              <div style={{ fontSize: 11, color: PALETTE.cyan, fontStyle: "italic", lineHeight: 1.55 }}>
                → {marketIntelligenceContext.tradeTranslation}
              </div>
            )}
            <div style={{ fontSize: 9, color: PALETTE.textFaint, fontStyle: "italic", marginTop: 2 }}>
              {NO_OVERRIDE}
            </div>
          </div>
        ) : (
          <PlaceholderLine>No approved intelligence yet for this symbol.</PlaceholderLine>
        )}
      </Section>

      {/* 8. Intelligence Feed */}
      <Section title="Intelligence Feed">
        {Array.isArray(intelligenceFeed) && intelligenceFeed.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {intelligenceFeed.slice(0, 6).map((it) => (
              <li key={it.id} style={{
                background: PALETTE.cardBg,
                border: `1px solid ${PALETTE.borderSoft}`,
                borderRadius: 6, padding: "6px 8px",
                fontSize: 10, color: PALETTE.text, lineHeight: 1.5,
              }}>
                <div style={{ fontWeight: 700, color: PALETTE.text }}>
                  {it.title || "Intelligence note"}
                </div>
                {it.thesis && it.thesis.coreClaim && (
                  <div style={{ color: PALETTE.textDim }}>
                    {truncate(it.thesis.coreClaim, 180)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <PlaceholderLine>No intelligence on file for this symbol. Use the Intelligence Feed (Settings / Admin) to add a note.</PlaceholderLine>
        )}
      </Section>

      {/* 9. Recommended action */}
      <Section title="Recommended action">
        <div style={{ fontSize: 11, color: PALETTE.cyan, fontStyle: "italic", lineHeight: 1.55 }}>
          {recommendedAction || "Monitor for additional manager evidence."}
        </div>
      </Section>

      {/* 10. Risk / invalidation notes */}
      <Section title="Risk / invalidation notes">
        {Array.isArray(risks) && risks.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {risks.map((r, i) => (
              <li key={`${r}-${i}`} style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
                • {r}
              </li>
            ))}
          </ul>
        ) : (
          <PlaceholderLine>No specific risk flags on file.</PlaceholderLine>
        )}
      </Section>
    </aside>
  );
}

// ---------------------------------------------------------------------
// Sub-components / helpers
// ---------------------------------------------------------------------

function Section({ title, children }) {
  return (
    <section>
      <div style={{
        fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint, fontWeight: 700, marginBottom: 4,
      }}>
        {(title || "").toUpperCase()}
      </div>
      {children}
    </section>
  );
}

function PlaceholderLine({ children }) {
  return (
    <div style={{ fontSize: 10, color: PALETTE.textFaint, fontStyle: "italic", lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

function SignalLine({ label, tone, items }) {
  return (
    <div style={{ fontSize: 10, color: PALETTE.textDim, lineHeight: 1.5 }}>
      <strong style={{ color: tone, marginRight: 4 }}>{label}:</strong>
      {items.slice(0, 4).map((s, i) => (
        <span key={`${s}-${i}`} style={{ color: PALETTE.text }}>
          {i > 0 ? " · " : ""}{s}
        </span>
      ))}
      {items.length > 4 && (
        <span style={{ color: PALETTE.textFaint }}>
          {" · "}+{items.length - 4} more
        </span>
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

function btn(color) {
  return {
    background: `${color}1a`, border: `1px solid ${color}88`, color,
    borderRadius: 5, padding: "3px 8px",
    fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
    cursor: "pointer", fontFamily: "inherit",
  };
}

function labelForStatus(s) {
  switch (s) {
    case "strengthening":         return "Thesis strengthening";
    case "weakening":             return "Thesis weakening";
    case "conflicting":           return "Thesis conflicted";
    case "unchanged":             return "Thesis unchanged";
    case "insufficient_evidence": return "Needs more evidence";
    default:                      return s ? String(s) : "Thesis unavailable";
  }
}
function confidenceLabel(c) {
  switch (c) {
    case "high":    return "High confidence";
    case "medium":  return "Medium confidence";
    case "low":     return "Low confidence";
    default:        return "Confidence unavailable";
  }
}
function confidenceTone(c) {
  switch (c) {
    case "high":   return PALETTE.green;
    case "medium": return PALETTE.cyan;
    case "low":    return PALETTE.amber;
    default:       return PALETTE.textFaint;
  }
}

function truncate(s, max) {
  if (typeof s !== "string") return "";
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}
