#!/usr/bin/env node
// =====================================================
// Market Intelligence — provider + engine + UI tests
// Run: npm run test:market-intelligence
//
// Acceptance gates per spec:
//   1.  Polygon news normalizes article shape.
//   2.  LB news normalizes article shape.
//   3.  Manual articles normalize.
//   4.  Provider failure returns [].
//   5.  Deduplication by URL.
//   6.  Deduplication by source/title when URL missing.
//   7.  Articles sort newest first.
//   8.  Empty news creates unavailable summary.
//   9.  Supportive news creates thesisAlignment supports.
//  10.  Negative news creates thesisAlignment conflicts.
//  11.  Mixed news creates thesisAlignment mixed.
//  12.  Neutral news creates thesisAlignment neutral.
//  13.  LLM failure triggers fallback.
//  14.  LLM success is sanitized to allowed output shape.
//  15.  Invalid enum values sanitize to safe defaults.
//  16.  Raw scores/weights are not included in output.
//  17.  MarketIntelligencePanel renders fallback mode.
//  18.  MarketIntelligencePanel renders article list.
//  19.  Vertex provider route skeleton can return fallback without
//       credentials.
//  20.  (existing tests remain green — verified separately)
//  21.  (production build clean — verified separately)
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  THESIS_ALIGNMENT,
  CATALYST_TYPE,
  ROUTE_RECOMMENDATION,
  CONFIDENCE_LABEL,
  INTELLIGENCE_MODE,
  normalizeArticleShape,
  sanitizeSummary,
  makeSummary,
} from "../src/lib/intelligence/newsIntelligenceTypes.js";
import {
  registerNewsProvider,
  clearNewsProviders,
  fetchFromAllProviders,
  listNewsProviders,
} from "../src/lib/intelligence/newsProviderRegistry.js";
import {
  createPolygonNewsProvider,
  createLethalBoardNewsProvider,
  createManualNewsProvider,
  dedupeArticles,
  sortNewestFirst,
} from "../src/lib/intelligence/newsFeedAdapter.js";
import { buildRulesSummary } from "../src/lib/intelligence/rulesBasedMarketIntelligence.js";
import { runMarketIntelligenceEngine } from "../src/lib/intelligence/marketIntelligenceEngine.js";
import { initializeMarketIntelligenceForSymbol } from "../src/lib/intelligence/newsIntelligenceService.js";
import {
  buildVertexMarketIntelligenceHandler,
  runVertexHandlerForTest,
} from "../server/routes/vertexMarketIntelligence.js";

let passed = 0;
let failed = 0;
const failures = [];
function assert(name, cond, detail = "") {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${detail ? "  →  " + detail : ""}`); failures.push(name); failed++; }
}
function group(label) {
  console.log(`\n  ${label}\n  ${"─".repeat(Math.max(20, label.length))}`);
}

// ============================================================
group("[1] Polygon news normalizes article shape");
// ============================================================

const polygonRaw = {
  id: "poly-123",
  title: "AAPL announces multiyear partnership with major data center operator",
  description: "Long-term agreement covers AI capacity expansion.",
  publisher: { name: "Polygon News" },
  article_url: "https://news.example/aapl-partnership",
  published_utc: "2026-05-08T14:30:00Z",
  tickers: ["AAPL"],
  insights: [{ sentiment: "positive", sentiment_score: 0.78 }],
};
const fakePolygonFetch = async (_url) => ({
  ok: true,
  json: async () => ({ results: [polygonRaw] }),
});
const polyProvider = createPolygonNewsProvider({ fetchImpl: fakePolygonFetch });
const polyArticles = await polyProvider.fetchForSymbol("AAPL");
assert("Polygon provider returns one article",                   polyArticles.length === 1);
assert("title preserved",                                        polyArticles[0].title.startsWith("AAPL announces"));
assert("source mapped from publisher.name",                      polyArticles[0].source === "Polygon News");
assert("url mapped from article_url",                            polyArticles[0].url === "https://news.example/aapl-partnership");
assert("publishedAt parsed to epoch ms",                         Number.isFinite(polyArticles[0].publishedAt));
assert("tickers included",                                       polyArticles[0].tickers.includes("AAPL"));
assert("symbol propagated",                                      polyArticles[0].symbol === "AAPL");
assert("sentimentLabel mapped",                                  polyArticles[0].sentimentLabel === "positive");
assert("sentimentScore mapped",                                  Math.abs(polyArticles[0].sentimentScore - 0.78) < 1e-9);

// Tolerant: bad fetch returns [].
const polyFail = createPolygonNewsProvider({ fetchImpl: async () => ({ ok: false }) });
const polyFailArticles = await polyFail.fetchForSymbol("AAPL");
assert("Polygon provider returns [] on non-ok response",         Array.isArray(polyFailArticles) && polyFailArticles.length === 0);

// ============================================================
group("[2] Lethal Board news normalizes article shape");
// ============================================================

const lbRaw = {
  title: "TEM signs major customer adoption deal",
  summary: "Multiyear agreement with a hyperscaler.",
  source: "Reuters",
  url: "https://news.example/tem-deal",
  publishedAt: 1714576800000,
};
const lbFetch = async ({ ticker }) => (ticker === "TEM" ? [lbRaw] : []);
const lbProvider = createLethalBoardNewsProvider({ fetchNews: lbFetch });
const lbArticles = await lbProvider.fetchForSymbol("TEM");
assert("LB provider returns one article",                        lbArticles.length === 1);
assert("LB url preserved",                                       lbArticles[0].url === "https://news.example/tem-deal");
assert("LB source preserved",                                    lbArticles[0].source === "Reuters");
assert("LB symbol propagated",                                   lbArticles[0].symbol === "TEM");
assert("LB available() === false when fetchNews not supplied",
  createLethalBoardNewsProvider({}).available() === false);

// ============================================================
group("[3] Manual articles normalize");
// ============================================================

const manual = createManualNewsProvider();
manual.addArticles("ALAB", [
  { title: "ALAB sees revenue acceleration",     source: "Bloomberg",      publishedAt: 1714000000000 },
  { title: "ALAB faces regulatory inquiry",      source: "Wall Street Journal", publishedAt: 1714100000000 },
]);
const manualArticles = await manual.fetchForSymbol("ALAB");
assert("manual provider returns 2 articles",                     manualArticles.length === 2);
assert("manual normalizes title + symbol",
  manualArticles.every((a) => a.title && a.symbol === "ALAB"));

// ============================================================
group("[4] Provider failure returns [] (no throw)");
// ============================================================

clearNewsProviders();
registerNewsProvider({
  name: "broken",
  fetchForSymbol: async () => { throw new Error("kaboom"); },
});
registerNewsProvider({
  name: "ok",
  fetchForSymbol: async () => [
    normalizeArticleShape({ title: "ok title", url: "https://ex/1", publishedAt: 1714000000000 }, { symbol: "X" }),
  ],
});

const fetchAll = await fetchFromAllProviders("X");
assert("good provider's articles still surface",                 fetchAll.articles.length === 1);
assert("warnings include broken-provider mark",                  fetchAll.warnings.some((w) => /broken/i.test(w)));

// ============================================================
group("[5] Deduplication by URL");
// ============================================================

const dedupeByUrl = dedupeArticles([
  normalizeArticleShape({ title: "A", url: "https://x/1", publishedAt: 1 }),
  normalizeArticleShape({ title: "A copy", url: "https://x/1", publishedAt: 2 }),
  normalizeArticleShape({ title: "B", url: "https://x/2", publishedAt: 3 }),
]);
assert("dedupe by URL collapses duplicates",                     dedupeByUrl.length === 2);
assert("first-seen wins (title 'A' kept)",                       dedupeByUrl[0].title === "A");

// ============================================================
group("[6] Deduplication by source+title when URL missing");
// ============================================================

const dedupeBySrcTitle = dedupeArticles([
  normalizeArticleShape({ title: "Same title", source: "Reuters" }),
  normalizeArticleShape({ title: "  same title ", source: "reuters" }),
  normalizeArticleShape({ title: "Same title", source: "Bloomberg" }),
]);
assert("source+title dedupe collapses Reuters duplicate",        dedupeBySrcTitle.length === 2);

// ============================================================
group("[7] Articles sort newest first");
// ============================================================

const sorted = sortNewestFirst([
  normalizeArticleShape({ title: "old",  publishedAt: 1000 }),
  normalizeArticleShape({ title: "new",  publishedAt: 5000 }),
  normalizeArticleShape({ title: "mid",  publishedAt: 3000 }),
]);
assert("sortNewestFirst orders by publishedAt desc",
  sorted[0].title === "new" && sorted[1].title === "mid" && sorted[2].title === "old");

// ============================================================
group("[8] Empty news creates unavailable summary");
// ============================================================

const emptySum = buildRulesSummary({ symbol: "TEST", articles: [] });
assert("thesisAlignment unavailable",          emptySum.thesisAlignment === THESIS_ALIGNMENT.UNAVAILABLE);
assert("route recommendation = monitor",       emptySum.routeRecommendation === ROUTE_RECOMMENDATION.MONITOR);
assert("confidenceLabel unavailable",          emptySum.confidenceLabel === CONFIDENCE_LABEL.UNAVAILABLE);
assert("warnings include LLM-fallback notice", emptySum.warnings.some((w) => /rules-based/i.test(w)));

// ============================================================
group("[9] Supportive news creates thesisAlignment supports");
// ============================================================

const supportiveSum = buildRulesSummary({
  symbol: "AAPL",
  articles: [
    normalizeArticleShape({ title: "AAPL announces multiyear agreement, guidance raised", source: "Reuters" }),
    normalizeArticleShape({ title: "Customer adoption growing rapidly", source: "WSJ" }),
  ],
});
assert("thesisAlignment supports",                supportiveSum.thesisAlignment === THESIS_ALIGNMENT.SUPPORTS);
assert("route = send_to_TE",                      supportiveSum.routeRecommendation === ROUTE_RECOMMENDATION.SEND_TO_TE);
assert("confidence moderate",                     supportiveSum.confidenceLabel === CONFIDENCE_LABEL.MODERATE);

// ============================================================
group("[10] Negative news creates thesisAlignment conflicts");
// ============================================================

const negativeSum = buildRulesSummary({
  symbol: "TEST",
  articles: [
    normalizeArticleShape({ title: "Company faces lawsuit and regulatory investigation", source: "FT" }),
    normalizeArticleShape({ title: "Analyst issues downgrade after guidance cut", source: "Barron's" }),
  ],
});
assert("thesisAlignment conflicts",               negativeSum.thesisAlignment === THESIS_ALIGNMENT.CONFLICTS);
assert("route = avoid_for_now",                   negativeSum.routeRecommendation === ROUTE_RECOMMENDATION.AVOID_FOR_NOW);

// ============================================================
group("[11] Mixed news creates thesisAlignment mixed");
// ============================================================

const mixedSum = buildRulesSummary({
  symbol: "TEST",
  articles: [
    normalizeArticleShape({ title: "Company wins multiyear agreement", source: "Reuters" }),
    normalizeArticleShape({ title: "But faces lawsuit over delays", source: "WSJ" }),
  ],
});
assert("thesisAlignment mixed",                   mixedSum.thesisAlignment === THESIS_ALIGNMENT.MIXED);
assert("confidence low",                          mixedSum.confidenceLabel === CONFIDENCE_LABEL.LOW);
assert("riskContradictions populated",
  Array.isArray(mixedSum.riskContradictions) && mixedSum.riskContradictions.length > 0);

// ============================================================
group("[12] Neutral news creates thesisAlignment neutral");
// ============================================================

const neutralSum = buildRulesSummary({
  symbol: "TEST",
  articles: [
    normalizeArticleShape({ title: "Quarterly trading commentary", source: "Reuters" }),
    normalizeArticleShape({ title: "Sector index unchanged", source: "Bloomberg" }),
  ],
});
assert("thesisAlignment neutral",                 neutralSum.thesisAlignment === THESIS_ALIGNMENT.NEUTRAL);
assert("route = monitor",                         neutralSum.routeRecommendation === ROUTE_RECOMMENDATION.MONITOR);

// ============================================================
group("[13] LLM failure triggers fallback");
// ============================================================

const failingProvider = {
  name: "broken_llm",
  model: "fake-1",
  available: () => true,
  run: async () => { throw new Error("provider blew up"); },
};
const fallbackResult = await runMarketIntelligenceEngine(
  {
    symbol: "TEST",
    articles: [normalizeArticleShape({ title: "Customer adoption", source: "Reuters" })],
  },
  { provider: failingProvider },
);
assert("intelligenceMode = rules_fallback",       fallbackResult.intelligenceMode === INTELLIGENCE_MODE.RULES_FALLBACK);
assert("provider field reads 'rules_fallback'",   fallbackResult.provider === "rules_fallback");
assert("warnings carry LLM failure note",
  fallbackResult.warnings.some((w) => /broken_llm.*failed/i.test(w)));
assert("warnings include rules-based notice",
  fallbackResult.summary.warnings.some((w) => /rules-based/i.test(w)));

// ============================================================
group("[14] LLM success sanitized to allowed output shape");
// ============================================================

const goodLlmProvider = {
  name: "stub_llm",
  model: "stub-1",
  available: () => true,
  run: async () => ({
    thesisAlignment:     "supports",
    macroRead:           "Risk-on regime supports the trade.",
    businessRead:        "Customer adoption inflecting.",
    newsRead:            "Three supportive headlines this week.",
    catalystType:        "customer_adoption",
    signalImpact:        "Constructive trajectory.",
    riskContradictions:  ["Cycle could roll over"],
    routeRecommendation: "send_to_TE",
    confidenceLabel:     "moderate",
    actionSummary:       "Validate structure before sizing.",
  }),
};
const goodResult = await runMarketIntelligenceEngine(
  {
    symbol: "TEST",
    basketProfile: { label: "AI Infra" },
    articles: [normalizeArticleShape({ title: "TEST customer adoption" })],
  },
  { provider: goodLlmProvider },
);
assert("intelligenceMode = llm",                  goodResult.intelligenceMode === INTELLIGENCE_MODE.LLM);
assert("provider name surfaced",                  goodResult.provider === "stub_llm");
assert("model surfaced",                          goodResult.model === "stub-1");
assert("symbol survives sanitization",            goodResult.summary.symbol === "TEST");
assert("basketLayer copied from profile",         goodResult.summary.basketLayer === "AI Infra");
assert("thesisAlignment maps cleanly",            goodResult.summary.thesisAlignment === THESIS_ALIGNMENT.SUPPORTS);
assert("catalystType maps cleanly",               goodResult.summary.catalystType === CATALYST_TYPE.CUSTOMER_ADOPTION);
assert("routeRecommendation maps cleanly",        goodResult.summary.routeRecommendation === ROUTE_RECOMMENDATION.SEND_TO_TE);
assert("confidenceLabel maps cleanly",            goodResult.summary.confidenceLabel === CONFIDENCE_LABEL.MODERATE);
assert("articlesUsed populated from fallback",    goodResult.summary.articlesUsed.length === 1);

// ============================================================
group("[15] Invalid enum values sanitize to safe defaults");
// ============================================================

const dirty = sanitizeSummary({
  symbol: "X",
  thesisAlignment:     "make-believe",
  catalystType:        "ufo",
  routeRecommendation: "yolo",
  confidenceLabel:     "vibes",
  riskContradictions:  ["valid string", 42, null, ""],
  articlesUsed:        [{ title: "x", id: 17 }, { /* no title */ }],
}, { symbol: "X" });
assert("invalid thesisAlignment → unavailable",        dirty.thesisAlignment === THESIS_ALIGNMENT.UNAVAILABLE);
assert("invalid catalystType → none",                  dirty.catalystType === CATALYST_TYPE.NONE);
assert("invalid routeRecommendation → monitor",        dirty.routeRecommendation === ROUTE_RECOMMENDATION.MONITOR);
assert("invalid confidenceLabel → unavailable",        dirty.confidenceLabel === CONFIDENCE_LABEL.UNAVAILABLE);
assert("riskContradictions filters non-strings",
  Array.isArray(dirty.riskContradictions) &&
  dirty.riskContradictions.length === 1 &&
  dirty.riskContradictions[0] === "valid string");
assert("articlesUsed drops rows without title",
  Array.isArray(dirty.articlesUsed) && dirty.articlesUsed.length === 1);

// ============================================================
group("[16] Raw scores / weights are not included in output");
// ============================================================

const noLeakProvider = {
  name: "leaky_llm",
  model: "x",
  available: () => true,
  run: async () => ({
    thesisAlignment: "supports",
    catalystType: "customer_adoption",
    routeRecommendation: "send_to_TE",
    confidenceLabel: "moderate",
    actionSummary: "Trader-facing copy only.",
    // Try to leak fields the sanitizer should drop.
    score:  82,
    weight: 0.42,
    coefficient: 0.99,
    rawWeights: { x: 1, y: 2 },
  }),
};
const noLeakResult = await runMarketIntelligenceEngine(
  { symbol: "X", articles: [normalizeArticleShape({ title: "x" })] },
  { provider: noLeakProvider },
);
const blob = JSON.stringify(noLeakResult.summary);
assert("no \"score\" leaks",                  !/"score"\s*:\s*-?\d/.test(blob));
assert("no \"weight\" leaks",                 !/"weight"|"w_/.test(blob));
assert("no \"coefficient\" leaks",            !/"coefficient/i.test(blob));
assert("no \"rawWeights\" leaks",             !/rawWeights/i.test(blob));

// ============================================================
group("[17–18] MarketIntelligencePanel renders fallback + articles");
// ============================================================

const { default: MarketIntelligencePanel } =
  await import("../src/components/intelligence/MarketIntelligencePanel.jsx");
const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");

function renderSafe(name, Component, props) {
  try {
    const html = renderToStaticMarkup(createElement(Component, props));
    return { ok: typeof html === "string", html };
  } catch (err) {
    return { ok: false, err };
  }
}

// Build a real fallback result.
clearNewsProviders();
const m = createManualNewsProvider();
m.addArticles("INOD", [
  { title: "INOD signs multiyear agreement", source: "Reuters", url: "https://news.example/inod-1", publishedAt: 1714000000000 },
  { title: "INOD revenue acceleration",      source: "Bloomberg", url: "https://news.example/inod-2", publishedAt: 1714100000000 },
]);
registerNewsProvider(m);
const fallbackResultUI = await initializeMarketIntelligenceForSymbol({
  symbol: "INOD",
  basketProfile: { label: "AI Infra" },
  useLLM: false,    // force rules path
});
const renderFallback = renderSafe("MarketIntelligencePanel (rules)", MarketIntelligencePanel, { result: fallbackResultUI });
assert("[17] panel renders without throwing",  renderFallback.ok, renderFallback.err?.message);
assert("[17] mode badge shows 'Rules fallback'",
  /Rules fallback/.test(renderFallback.html || ""));
assert("[17] symbol surfaces in header",
  /INOD/.test(renderFallback.html || ""));
assert("[17] thesisAlignment chip surfaces",
  /Thesis: (supports|mixed|neutral|conflicts|unavailable)/.test(renderFallback.html || ""));
assert("[18] panel renders article titles",
  /INOD signs multiyear agreement/.test(renderFallback.html || "") ||
  /INOD revenue acceleration/.test(renderFallback.html || ""));
assert("[18] panel renders article source",
  /Reuters|Bloomberg/.test(renderFallback.html || ""));
assert("[18] warnings section visible",
  /WARNINGS/.test(renderFallback.html || "") &&
  /rules-based/i.test(renderFallback.html || ""));

// LLM-mode panel (using the stub provider).
const llmResultUI = await initializeMarketIntelligenceForSymbol({
  symbol: "INOD",
  basketProfile: { label: "AI Infra" },
  useLLM: true,
  llmProvider: goodLlmProvider,
});
const renderLLM = renderSafe("MarketIntelligencePanel (llm)", MarketIntelligencePanel, { result: llmResultUI });
assert("[Bonus] LLM mode badge shows 'LLM read'",
  renderLLM.ok && /LLM read/.test(renderLLM.html || ""));

// ============================================================
group("[19] Vertex route skeleton returns fallback w/o credentials");
// ============================================================

const handlerNoCreds = buildVertexMarketIntelligenceHandler({
  readEnv: () => ({}),    // no env
  callVertex: null,       // no vertex hook
});
const r1 = await runVertexHandlerForTest(handlerNoCreds, { payload: { symbol: "X" } });
assert("503 when not configured",                       r1.status === 503);
assert("body.available = false",                        r1.body && r1.body.available === false);
assert("body.provider = 'vertex_ai'",                   r1.body.provider === "vertex_ai");
assert("body.summary = null",                           r1.body.summary === null);
assert("warning explains unavailability",
  Array.isArray(r1.body.warnings) && r1.body.warnings.some((w) => /Vertex AI not configured/.test(w)));
assert("reason = 'vertex_not_configured'",              r1.body.reason === "vertex_not_configured");

// 400 when payload missing.
const handlerWithCreds = buildVertexMarketIntelligenceHandler({
  readEnv: () => ({ GOOGLE_CLOUD_PROJECT: "p", GOOGLE_CLOUD_LOCATION: "us-east1" }),
  callVertex: async () => ({ summary: { thesisAlignment: "neutral", catalystType: "none", routeRecommendation: "monitor", confidenceLabel: "low" } }),
});
const r400 = await runVertexHandlerForTest(handlerWithCreds, {});
assert("400 when payload missing",                      r400.status === 400);
assert("400 reason = 'invalid_request'",                r400.body.reason === "invalid_request");

// 200 happy path with fake callVertex.
const r200 = await runVertexHandlerForTest(handlerWithCreds, { payload: { symbol: "X" } });
assert("200 happy path",                                r200.status === 200);
assert("200 body.available = true",                     r200.body.available === true);
assert("200 body.summary present",                      !!r200.body.summary);

// 502 when callVertex throws.
const handlerThrows = buildVertexMarketIntelligenceHandler({
  readEnv: () => ({ GOOGLE_CLOUD_PROJECT: "p", GOOGLE_CLOUD_LOCATION: "us-east1" }),
  callVertex: async () => { throw new Error("boom"); },
});
const r502 = await runVertexHandlerForTest(handlerThrows, { payload: { symbol: "X" } });
assert("502 when callVertex throws",                    r502.status === 502);
assert("502 reason = 'vertex_call_failed'",             r502.body.reason === "vertex_call_failed");

// ============================================================
group("[End-to-end] initializeMarketIntelligenceForSymbol");
// ============================================================

clearNewsProviders();
const integManual = createManualNewsProvider();
integManual.addArticles("AAPL", [
  { title: "AAPL announces multiyear data center partnership", source: "Reuters", url: "https://x/1", publishedAt: 1714600000000 },
  { title: "AAPL guidance raised on backlog growth",            source: "WSJ",     url: "https://x/2", publishedAt: 1714700000000 },
]);
registerNewsProvider(integManual);
const integ = await initializeMarketIntelligenceForSymbol({
  symbol: "AAPL",
  basketProfile: { label: "AI Infra" },
  useLLM: false,
});
assert("end-to-end returns 2 articles",        integ.articles.length === 2);
assert("articles sorted newest first",
  integ.articles[0].publishedAt >= integ.articles[1].publishedAt);
assert("summary thesisAlignment = supports",   integ.summary.thesisAlignment === THESIS_ALIGNMENT.SUPPORTS);
assert("intelligenceMode = rules_fallback",    integ.intelligenceMode === INTELLIGENCE_MODE.RULES_FALLBACK);
assert("warnings carry rules-based notice",
  integ.warnings.some((w) => /rules-based/i.test(w)));

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
clearNewsProviders();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
