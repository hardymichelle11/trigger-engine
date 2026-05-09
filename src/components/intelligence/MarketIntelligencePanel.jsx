// =====================================================
// MARKET INTELLIGENCE PANEL
// =====================================================
// Top-level renderer for the Market Intelligence layer. Composes:
//   1. Header with intelligence-mode badge (LLM / Rules fallback)
//   2. MarketIntelligenceSummary
//   3. NewsArticleList
//   4. Warnings (LLM unavailable, provider failed, …)
// =====================================================

import React from "react";
import MarketIntelligenceSummary from "./MarketIntelligenceSummary.jsx";
import NewsArticleList from "./NewsArticleList.jsx";

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
  cyan:      "#06b6d4",
};

/**
 * @param {object} props
 * @param {object} props.result   output of initializeMarketIntelligenceForSymbol
 */
export default function MarketIntelligencePanel({ result }) {
  if (!result) return null;
  const { symbol, articles, summary, intelligenceMode, warnings } = result;
  const isLLM = intelligenceMode === "llm";

  return (
    <section aria-label="Market intelligence panel" style={{
      background: PALETTE.bg,
      border: `1px solid ${PALETTE.border}`,
      borderRadius: 10, padding: 12,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* Header */}
      <header style={{
        background: PALETTE.panelBg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 10, padding: "8px 12px",
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: 8, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim }}>
            MARKET INTELLIGENCE
          </div>
          {symbol && (
            <div style={{ fontSize: 13, fontWeight: 700, color: PALETTE.accentTeal, letterSpacing: "0.04em" }}>
              {symbol}
            </div>
          )}
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
          color: isLLM ? PALETTE.cyan : PALETTE.amber,
          background: isLLM ? `${PALETTE.cyan}1a` : `${PALETTE.amber}1a`,
          border: `1px solid ${isLLM ? PALETTE.cyan : PALETTE.amber}55`,
          borderRadius: 4, padding: "2px 6px",
        }}>
          {isLLM ? "LLM read" : "Rules fallback"}
        </span>
      </header>

      {/* Summary */}
      <MarketIntelligenceSummary summary={summary} />

      {/* Articles */}
      <section style={{
        background: PALETTE.panelBg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 10, padding: 12,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          marginBottom: 8, gap: 8, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim }}>
            ARTICLES USED
          </span>
          <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
            {(articles || []).length} item{(articles || []).length === 1 ? "" : "s"}
          </span>
        </div>
        <NewsArticleList articles={articles} limit={8} />
      </section>

      {/* Warnings */}
      {Array.isArray(warnings) && warnings.length > 0 && (
        <section style={{
          background: `${PALETTE.amber}10`,
          border: `1px solid ${PALETTE.amber}55`,
          borderRadius: 10, padding: "8px 12px",
        }}>
          <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.amber, fontWeight: 700, marginBottom: 4 }}>
            WARNINGS
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {warnings.map((w, i) => (
              <li key={i} style={{
                display: "flex", gap: 6, alignItems: "baseline",
                fontSize: 11, color: PALETTE.text, lineHeight: 1.5, padding: "1px 0",
              }}>
                <span style={{ color: PALETTE.amber }}>•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
