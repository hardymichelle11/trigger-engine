// =====================================================================
// Market Intelligence Prompt Builder
// =====================================================================
// Produces the JSON-only payload sent to the LLM provider. The prompt
// keeps the model trader-facing and avoids exposing raw scores or
// internal weights. PURE: returns plain strings — no I/O.
// =====================================================================

import {
  THESIS_ALIGNMENT,
  CATALYST_TYPE,
  ROUTE_RECOMMENDATION,
  CONFIDENCE_LABEL,
} from "./newsIntelligenceTypes.js";

const SYSTEM_PROMPT = `You are a market intelligence agent inside a trader's
decision aid. Your job is to read a small batch of news articles plus
optional context (basket profile, macro regime, TE / CV snapshots,
portfolio context) and return a strict JSON object.

Hard rules:
- Do NOT make direct buy / sell recommendations.
- Do NOT expose raw scores or internal weights.
- Use trader-facing language only.
- Return valid JSON ONLY — no prose, no markdown, no commentary.
- Focus on thesis alignment, macro relevance, business relevance, risks,
  catalyst type, and routing.
- Route to TE / CV / Basket / Scanner only when appropriate.

Return shape (every field required, even if value is null or "unavailable"):
{
  "thesisAlignment":     one of ${arr(THESIS_ALIGNMENT)},
  "macroRead":           string | null,
  "businessRead":        string | null,
  "newsRead":            string | null,
  "catalystType":        one of ${arr(CATALYST_TYPE)},
  "signalImpact":        string | null,
  "riskContradictions":  string[]  (may be empty),
  "routeRecommendation": one of ${arr(ROUTE_RECOMMENDATION)},
  "confidenceLabel":     one of ${arr(CONFIDENCE_LABEL)},
  "actionSummary":       string | null
}`;

/**
 * @param {object} input
 * @returns {{ system: string, user: string }}
 */
export function buildMarketIntelligencePrompt(input = {}) {
  const symbol = typeof input.symbol === "string" ? input.symbol.toUpperCase() : "(unknown symbol)";
  const articles = Array.isArray(input.articles) ? input.articles.slice(0, 12) : [];

  const articleLines = articles.map((a, i) => {
    const t = (a?.publishedAt && Number.isFinite(a.publishedAt))
      ? new Date(a.publishedAt).toISOString()
      : "—";
    return `${i + 1}. [${t}] ${a?.source || "—"} :: ${a?.title || "—"}` +
           (a?.summary ? `\n   summary: ${truncate(a.summary, 300)}` : "");
  });

  const sections = [];
  if (input.basketProfile) {
    sections.push("BASKET PROFILE: " + safeJson(input.basketProfile));
  }
  if (input.macroContext) {
    sections.push("MACRO CONTEXT: " + safeJson(input.macroContext));
  }
  if (input.teSnapshot) {
    sections.push("TE SNAPSHOT: " + safeJson(input.teSnapshot));
  }
  if (input.cvSnapshot) {
    sections.push("CV SNAPSHOT: " + safeJson(input.cvSnapshot));
  }
  if (input.portfolioContext) {
    sections.push("PORTFOLIO CONTEXT: " + safeJson(input.portfolioContext));
  }

  const userPrompt = [
    `SYMBOL: ${symbol}`,
    sections.join("\n\n"),
    `ARTICLES (${articles.length}):`,
    articleLines.length > 0 ? articleLines.join("\n") : "  (no articles)",
    "Return the JSON object only.",
  ].filter(Boolean).join("\n\n");

  return {
    system: SYSTEM_PROMPT.trim(),
    user: userPrompt,
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function arr(enumObj) {
  return Object.values(enumObj).map((v) => `"${v}"`).join(" | ");
}
function truncate(s, n) {
  if (typeof s !== "string") return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
function safeJson(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return "(unserializable)";
  }
}
