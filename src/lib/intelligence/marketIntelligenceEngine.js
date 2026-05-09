// =====================================================================
// Market Intelligence Engine
// =====================================================================
// Orchestrates the LLM call → sanitization → rules-fallback path. Always
// returns a sanitized MarketIntelligenceSummary plus the intelligence
// mode that produced it. Never throws.
// =====================================================================

import { sanitizeSummary, INTELLIGENCE_MODE } from "./newsIntelligenceTypes.js";
import { runMarketIntelligenceLLM } from "./llmProvider.js";
import { buildRulesSummary } from "./rulesBasedMarketIntelligence.js";

/**
 * @param {object} payload
 * @param {string} [payload.symbol]
 * @param {object|null} [payload.basketProfile]
 * @param {Array<object>} [payload.articles]
 * @param {object|null} [payload.macroContext]
 * @param {object|null} [payload.teSnapshot]
 * @param {object|null} [payload.cvSnapshot]
 * @param {object|null} [payload.portfolioContext]
 * @param {object} [opts]
 * @param {object|null} [opts.provider]      LLM provider; overrides the registered default
 * @param {boolean} [opts.useLLM=true]       set false to force rules-fallback
 *
 * @returns {Promise<{
 *   summary: object,
 *   intelligenceMode: string,
 *   provider: string,
 *   model: string|null,
 *   warnings: string[]
 * }>}
 */
export async function runMarketIntelligenceEngine(payload = {}, opts = {}) {
  const useLLM = opts.useLLM !== false;
  const articles = Array.isArray(payload.articles) ? payload.articles : [];

  // When the operator opted out of LLM, skip straight to the rules path.
  if (!useLLM) {
    return rulesPath(payload);
  }

  const llm = await runMarketIntelligenceLLM({ ...payload, provider: opts.provider });

  if (llm.available && llm.summary) {
    const sanitized = sanitizeSummary(llm.summary, {
      symbol: payload.symbol,
      basketLayer: payload.basketProfile?.label || payload.basketProfile?.name || null,
      articlesUsed: articles.slice(0, 5).map(projectArticleUsed),
    });
    // Always re-attach the warning list from the LLM call (may be empty).
    sanitized.warnings = [...(sanitized.warnings || []), ...(llm.warnings || [])];
    return {
      summary: sanitized,
      intelligenceMode: INTELLIGENCE_MODE.LLM,
      provider: llm.provider,
      model: llm.model,
      warnings: llm.warnings || [],
    };
  }

  // LLM unavailable / failed → rules path. We carry the LLM warnings
  // (e.g. "Provider X failed: …") into the rules summary so the UI can
  // surface them alongside the fallback notice.
  const out = rulesPath(payload);
  out.warnings = mergeWarnings(out.warnings, llm.warnings || []);
  out.summary.warnings = mergeWarnings(out.summary.warnings, llm.warnings || []);
  return out;
}

function rulesPath(payload) {
  const summary = buildRulesSummary(payload);
  return {
    summary,
    intelligenceMode: INTELLIGENCE_MODE.RULES_FALLBACK,
    provider: "rules_fallback",
    model: null,
    warnings: summary.warnings || [],
  };
}

function mergeWarnings(a, b) {
  const seen = new Set();
  const out = [];
  for (const v of [...(a || []), ...(b || [])]) {
    if (typeof v !== "string" || !v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function projectArticleUsed(a) {
  return {
    id: a?.id || null,
    title: a?.title || "",
    source: a?.source || null,
    url: a?.url || null,
    publishedAt: Number.isFinite(a?.publishedAt) ? a.publishedAt : null,
  };
}
