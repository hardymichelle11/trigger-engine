// =====================================================================
// News Intelligence Service — top-level orchestrator
// =====================================================================
// Single entry point the UI uses to populate the Market Intelligence
// Panel. Combines the provider registry + dedupe/sort + the intelligence
// engine (LLM or rules fallback). Always returns a result; never throws.
// =====================================================================

import { fetchFromAllProviders, listNewsProviders } from "./newsProviderRegistry.js";
import {
  dedupeArticles,
  sortNewestFirst,
} from "./newsFeedAdapter.js";
import {
  normalizeArticleShape,
} from "./newsIntelligenceTypes.js";
import { runMarketIntelligenceEngine } from "./marketIntelligenceEngine.js";

/**
 * Initialize Market Intelligence for a single symbol.
 *
 * @param {object} input
 * @param {string} input.symbol
 * @param {object|null} [input.basketProfile]
 * @param {object|null} [input.lethalBoardCandidate]   may carry a .news[] array
 * @param {Array<object>} [input.manualArticles]
 * @param {object|null} [input.macroContext]
 * @param {object|null} [input.teSnapshot]
 * @param {object|null} [input.cvSnapshot]
 * @param {object|null} [input.portfolioContext]
 * @param {boolean} [input.useLLM=true]
 * @param {Array<object>} [input.providers]            override the registry
 * @param {object|null} [input.llmProvider]            overrides the default LLM
 * @param {number} [input.maxArticles=25]
 * @returns {Promise<{
 *   symbol: string|null,
 *   articles: object[],
 *   summary: object,
 *   intelligenceMode: string,
 *   warnings: string[]
 * }>}
 */
export async function initializeMarketIntelligenceForSymbol(input = {}) {
  const symbol = typeof input.symbol === "string" ? input.symbol.toUpperCase() : null;
  const useLLM = input.useLLM !== false;
  const maxArticles = Number.isFinite(input.maxArticles) && input.maxArticles > 0
    ? Math.floor(input.maxArticles)
    : 25;

  if (!symbol) {
    return {
      symbol: null,
      articles: [],
      summary: rulesUnavailable(null),
      intelligenceMode: "rules_fallback",
      warnings: ["invalid_symbol"],
    };
  }

  // 1. Pull from registered news providers (or the explicit override list).
  const providersToUse = Array.isArray(input.providers) && input.providers.length > 0
    ? input.providers
    : listNewsProviders();

  const fetchResult = providersToUse.length > 0
    ? await fetchFromAllProviders(symbol, { providers: providersToUse, limit: maxArticles })
    : { articles: [], warnings: [] };

  // 2. Combine with manual + LB-candidate-supplied articles.
  const lbArticles = Array.isArray(input.lethalBoardCandidate?.news)
    ? input.lethalBoardCandidate.news
    : [];
  const manualArticles = Array.isArray(input.manualArticles) ? input.manualArticles : [];
  const combined = [
    ...fetchResult.articles,
    ...lbArticles,
    ...manualArticles,
  ];

  // 3. Normalize → dedupe → sort newest first → cap.
  const normalized = combined
    .map((raw) => normalizeArticleShape(raw, { symbol }))
    .filter((a) => a != null);
  const deduped = dedupeArticles(normalized);
  const sorted = sortNewestFirst(deduped).slice(0, maxArticles);

  // 4. Run the engine (LLM with rules fallback, or rules-only when
  //    useLLM === false).
  const engineOut = await runMarketIntelligenceEngine(
    {
      symbol,
      basketProfile:    input.basketProfile || null,
      articles:         sorted,
      macroContext:     input.macroContext || null,
      teSnapshot:       input.teSnapshot || null,
      cvSnapshot:       input.cvSnapshot || null,
      portfolioContext: input.portfolioContext || null,
    },
    { provider: input.llmProvider || null, useLLM },
  );

  return {
    symbol,
    articles: sorted,
    summary: engineOut.summary,
    intelligenceMode: engineOut.intelligenceMode,
    warnings: mergeWarnings(fetchResult.warnings, engineOut.warnings),
  };
}

function rulesUnavailable(symbol) {
  return {
    symbol,
    basketLayer: null,
    thesisAlignment: "unavailable",
    macroRead: null,
    businessRead: null,
    newsRead: null,
    catalystType: "none",
    signalImpact: null,
    riskContradictions: [],
    routeRecommendation: "monitor",
    confidenceLabel: "unavailable",
    actionSummary: null,
    articlesUsed: [],
    warnings: ["LLM unavailable — using rules-based news interpretation."],
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
