#!/usr/bin/env node
// =====================================================
// CIO ↔ Market Intelligence adapter tests
// Run: npm run test:cio-mi-adapter
//
// Acceptance gates per spec:
//   1.  supports → constructive Market Intelligence assessment.
//   2.  conflicts → cautious / bearish assessment.
//   3.  mixed → neutral / cautious assessment.
//   4.  unavailable → unavailable / insufficient evidence assessment.
//   5.  routeRecommendation maps to recommendedAction.
//   6.  riskContradictions become concernFlags.
//   7.  warnings become concernFlags or missingEvidence appropriately.
//   8.  no raw scores / weights / coefficient strings leak.
//   9.  Manager Assessment Tape renders Market Intelligence Agent
//       with the real summary content.
//  10.  Missing summary still renders the unavailable card.
//  11.  Existing tests remain green (verified separately).
//  12.  Production build clean (verified separately).
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  marketIntelligenceToAssessment,
} from "../src/lib/portfolioCio/adapters/marketIntelligenceAssessmentAdapter.js";
import {
  buildManagerAssessmentTape,
} from "../src/lib/portfolioCio/managerAssessmentTape.js";
import {
  STANCE,
  CONFIDENCE,
  RECOMMENDED_ACTION,
  TIME_HORIZON,
} from "../src/lib/portfolioCio/managerAssessmentTypes.js";
import {
  makeSummary,
  THESIS_ALIGNMENT,
  ROUTE_RECOMMENDATION,
  CATALYST_TYPE,
  CONFIDENCE_LABEL,
} from "../src/lib/intelligence/newsIntelligenceTypes.js";

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

// Build a Market Intelligence "result" envelope (the shape returned by
// initializeMarketIntelligenceForSymbol) wrapped around a summary.
function makeResult(summary, opts = {}) {
  return {
    symbol: summary.symbol,
    articles: summary.articlesUsed || [],
    summary,
    intelligenceMode: opts.intelligenceMode || "rules_fallback",
    warnings: summary.warnings || [],
    fetchedAt: opts.fetchedAt || 1714600000000,
  };
}

// ============================================================
group("[1] supports → constructive assessment");
// ============================================================

const summarySupports = makeSummary({
  symbol: "TEST",
  basketLayer: "AI Infra",
  thesisAlignment: THESIS_ALIGNMENT.SUPPORTS,
  catalystType: CATALYST_TYPE.CUSTOMER_ADOPTION,
  macroRead: "Risk-on regime supports the trade.",
  businessRead: "Customer adoption inflecting.",
  newsRead: "Three supportive headlines this week.",
  riskContradictions: ["Cycle could roll over"],
  routeRecommendation: ROUTE_RECOMMENDATION.SEND_TO_TE,
  confidenceLabel: CONFIDENCE_LABEL.MODERATE,
  actionSummary: "Validate structure before sizing.",
  articlesUsed: [
    { id: "a1", title: "Multiyear partnership", source: "Reuters", url: "https://x/1", publishedAt: 1714600000000 },
    { id: "a2", title: "Customer wins",         source: "WSJ",     url: "https://x/2", publishedAt: 1714700000000 },
    { id: "a3", title: "Backlog growth",        source: "FT",      url: "https://x/3", publishedAt: 1714800000000 },
  ],
});
const a1 = marketIntelligenceToAssessment({ symbol: "TEST", marketIntelligenceResult: makeResult(summarySupports, { intelligenceMode: "llm" }) });

assert("[1] adapter returned a record",                    !!a1);
assert("[1] agentName = 'Market Intelligence Agent'",      a1.agentName === "Market Intelligence Agent");
assert("[1] agentRole present",                            typeof a1.agentRole === "string" && a1.agentRole.length > 0);
assert("[1] stance = constructive",                        a1.stance === STANCE.CONSTRUCTIVE);
assert("[1] confidenceLabel = moderate",                   a1.confidenceLabel === CONFIDENCE.MODERATE);
assert("[1] assessmentLabel reflects 'Thesis supportive'", /Thesis supportive/i.test(a1.assessmentLabel));
assert("[1] catalyst surfaces in label",                   /Customer adoption/i.test(a1.assessmentLabel));
assert("[1] evidenceSummary populated",                    typeof a1.evidenceSummary === "string" && a1.evidenceSummary.length > 0);
assert("[1] supportingEvidence includes Macro / Business / News / Catalyst",
  a1.supportingEvidence.some((s) => s.startsWith("Macro:")) &&
  a1.supportingEvidence.some((s) => s.startsWith("Business:")) &&
  a1.supportingEvidence.some((s) => s.startsWith("News:")) &&
  a1.supportingEvidence.some((s) => s.startsWith("Catalyst:")));
assert("[1] recommendedAction = send_to_TE",               a1.recommendedAction === RECOMMENDED_ACTION.SEND_TO_TE);
assert("[1] timeHorizonBias is mixed (macro+business present)",
  a1.timeHorizonBias === TIME_HORIZON.MIXED);
assert("[1] lastUpdatedAt propagated",                     a1.lastUpdatedAt === 1714600000000);

// ============================================================
group("[2] conflicts → cautious assessment");
// ============================================================

const summaryConflicts = makeSummary({
  symbol: "TEST",
  thesisAlignment: THESIS_ALIGNMENT.CONFLICTS,
  catalystType: CATALYST_TYPE.REGULATORY,
  newsRead: "Regulatory inquiry expands.",
  riskContradictions: ["Negative headlines outweigh supportive flow."],
  routeRecommendation: ROUTE_RECOMMENDATION.AVOID_FOR_NOW,
  confidenceLabel: CONFIDENCE_LABEL.MODERATE,
  actionSummary: "Avoid new exposure until headlines clear.",
  articlesUsed: [{ id: "x", title: "Lawsuit filed", source: "WSJ" }],
});
const a2 = marketIntelligenceToAssessment({ symbol: "TEST", marketIntelligenceResult: makeResult(summaryConflicts, { intelligenceMode: "llm" }) });

assert("[2] stance = cautious",                            a2.stance === STANCE.CAUTIOUS);
assert("[2] assessmentLabel = 'Thesis conflicts — Regulatory'",
  /Thesis conflicts/i.test(a2.assessmentLabel) && /Regulatory/i.test(a2.assessmentLabel));
assert("[2] recommendedAction = avoid_for_now",            a2.recommendedAction === RECOMMENDED_ACTION.AVOID_FOR_NOW);

// ============================================================
group("[3] mixed → cautious assessment");
// ============================================================

const summaryMixed = makeSummary({
  symbol: "TEST",
  thesisAlignment: THESIS_ALIGNMENT.MIXED,
  catalystType: CATALYST_TYPE.SENTIMENT,
  riskContradictions: ["Sentiment may shift quickly."],
  routeRecommendation: ROUTE_RECOMMENDATION.MONITOR,
  confidenceLabel: CONFIDENCE_LABEL.LOW,
  actionSummary: "Monitor for catalyst resolution.",
  articlesUsed: [{ id: "x", title: "Mixed flow" }],
});
const a3 = marketIntelligenceToAssessment({ symbol: "TEST", marketIntelligenceResult: makeResult(summaryMixed) });
assert("[3] stance = cautious (mixed → cautious per spec)", a3.stance === STANCE.CAUTIOUS);
assert("[3] assessmentLabel reflects 'Mixed signals'",     /Mixed signals/i.test(a3.assessmentLabel));
assert("[3] recommendedAction = monitor",                  a3.recommendedAction === RECOMMENDED_ACTION.MONITOR);

// ============================================================
group("[4] unavailable → null OR insufficient_evidence");
// ============================================================

// 4a. Null summary in the envelope → adapter returns null so the tape
// produces the generic unavailable card.
const aNull = marketIntelligenceToAssessment({ symbol: "TEST", marketIntelligenceResult: null });
assert("[4] null result → adapter returns null",           aNull === null);

// 4b. Empty unavailable summary (no articles, no actionSummary)
// → adapter still returns null.
const summaryEmpty = makeSummary({
  symbol: "TEST",
  thesisAlignment: THESIS_ALIGNMENT.UNAVAILABLE,
  warnings: ["LLM unavailable — using rules-based news interpretation."],
});
const aEmpty = marketIntelligenceToAssessment({ symbol: "TEST", marketIntelligenceResult: makeResult(summaryEmpty) });
assert("[4] empty unavailable summary → adapter returns null",  aEmpty === null);

// 4c. Unavailable BUT with a populated actionSummary or newsRead → the
// adapter returns a record carrying stance=unavailable +
// insufficient_evidence so the manager card surfaces the engine's
// commentary even when no firm read exists.
const summaryUnavailButWithActionSummary = makeSummary({
  symbol: "TEST",
  thesisAlignment: THESIS_ALIGNMENT.UNAVAILABLE,
  actionSummary: "Insufficient news evidence — monitor for new headlines.",
  warnings: ["LLM unavailable — using rules-based news interpretation."],
});
const aUnavailableSurfaced = marketIntelligenceToAssessment({
  symbol: "TEST",
  marketIntelligenceResult: makeResult(summaryUnavailButWithActionSummary),
});
assert("[4] unavailable + actionSummary → adapter surfaces a record",  !!aUnavailableSurfaced);
assert("[4] stance = unavailable",
  aUnavailableSurfaced && aUnavailableSurfaced.stance === STANCE.UNAVAILABLE);
assert("[4] assessmentLabel = 'Insufficient evidence'",
  aUnavailableSurfaced && aUnavailableSurfaced.assessmentLabel === "Insufficient evidence");
assert("[4] missingEvidence flags 'Recent news evidence unavailable'",
  aUnavailableSurfaced.missingEvidence.includes("Recent news evidence unavailable"));

// ============================================================
group("[5] routeRecommendation → recommendedAction mapping");
// ============================================================

const ROUTE_TESTS = [
  ["send_to_TE",                 RECOMMENDED_ACTION.SEND_TO_TE],
  ["send_to_CV",                 RECOMMENDED_ACTION.SEND_TO_CV],
  ["send_to_TE_and_CV",          RECOMMENDED_ACTION.SEND_TO_TE_AND_CV],
  ["promote_to_scanner",         RECOMMENDED_ACTION.PROMOTE_TO_SCANNER],
  ["add_to_basket",              RECOMMENDED_ACTION.ADD_TO_ACTIVE_UNIVERSE],
  ["monitor",                    RECOMMENDED_ACTION.MONITOR],
  ["avoid_for_now",              RECOMMENDED_ACTION.AVOID_FOR_NOW],
  ["thesis_conflict_detected",   RECOMMENDED_ACTION.WAIT_FOR_CONFIRMATION],
];
for (const [route, expected] of ROUTE_TESTS) {
  const s = makeSummary({
    symbol: "TEST",
    thesisAlignment: THESIS_ALIGNMENT.NEUTRAL,
    routeRecommendation: route,
    actionSummary: "x",
  });
  const r = marketIntelligenceToAssessment({ marketIntelligenceResult: makeResult(s) });
  assert(`[5] route ${route} → ${expected}`, r && r.recommendedAction === expected);
}

// Unknown / missing route → monitor.
const sUnknown = makeSummary({
  symbol: "TEST",
  thesisAlignment: THESIS_ALIGNMENT.NEUTRAL,
  routeRecommendation: "totally_made_up",
  actionSummary: "x",
});
const aUnknown = marketIntelligenceToAssessment({ marketIntelligenceResult: makeResult(sUnknown) });
assert("[5] unknown route → monitor (default)", aUnknown && aUnknown.recommendedAction === RECOMMENDED_ACTION.MONITOR);

// ============================================================
group("[6] riskContradictions become concernFlags");
// ============================================================

assert("[6] mixed.riskContradictions appear in concernFlags",
  a3.concernFlags.includes("Sentiment may shift quickly."));
assert("[6] supports.riskContradictions appear in concernFlags",
  a1.concernFlags.includes("Cycle could roll over"));

// ============================================================
group("[7] warnings categorize correctly");
// ============================================================

const summaryWithWarnings = makeSummary({
  symbol: "TEST",
  thesisAlignment: THESIS_ALIGNMENT.SUPPORTS,
  routeRecommendation: ROUTE_RECOMMENDATION.SEND_TO_TE,
  confidenceLabel: CONFIDENCE_LABEL.MODERATE,
  actionSummary: "ok",
  articlesUsed: [{ id: "1", title: "x" }],
  warnings: [
    "LLM unavailable — using rules-based news interpretation.",
    "provider_polygon_failed",
    "Real-time market caveat: sector rotation accelerating",
  ],
});
const aWarn = marketIntelligenceToAssessment({ marketIntelligenceResult: makeResult(summaryWithWarnings) });
assert("[7] rules-based warning routed to missingEvidence",
  aWarn.missingEvidence.some((m) => /rules-based/i.test(m)));
assert("[7] provider_*_failed routed to missingEvidence",
  aWarn.missingEvidence.some((m) => /provider_polygon_failed/.test(m)));
assert("[7] non-pipeline warning routed to concernFlags",
  aWarn.concernFlags.some((c) => /sector rotation/i.test(c)));
assert("[7] rules-fallback hint added when intelligenceMode = rules_fallback",
  aWarn.missingEvidence.some((m) => /LLM or provider intelligence limited/i.test(m)));

// ============================================================
group("[8] no raw scores / weights / coefficients leak");
// ============================================================

const blob1 = JSON.stringify(a1);
const blob2 = JSON.stringify(a2);
const blob3 = JSON.stringify(a3);
const blobW = JSON.stringify(aWarn);
for (const [name, blob] of [["a1", blob1], ["a2", blob2], ["a3", blob3], ["aWarn", blobW]]) {
  assert(`[8] ${name}: no "score":N raw field`, !/"score"\s*:\s*-?\d/.test(blob));
  assert(`[8] ${name}: no "weight":N raw field`, !/"weight"\s*:/.test(blob));
  assert(`[8] ${name}: no "coefficient" token`, !/coefficient/i.test(blob));
}

// ============================================================
group("[9] Manager Assessment Tape renders the MI Agent");
// ============================================================

const tape = buildManagerAssessmentTape({
  symbol: "TEST",
  inputs: { market_intel: a1 },
});
const miCard = tape.assessments.find((x) => x.agentId === "market_intel");
assert("[9] tape contains market_intel card",         !!miCard);
assert("[9] card stance is constructive",                    miCard.stance === STANCE.CONSTRUCTIVE);
assert("[9] card confidenceLabel = moderate",                miCard.confidenceLabel === CONFIDENCE.MODERATE);
assert("[9] card assessmentLabel surfaces 'Thesis supportive'",
  /Thesis supportive/i.test(miCard.assessmentLabel));
assert("[9] card recommendedAction = send_to_TE",            miCard.recommendedAction === RECOMMENDED_ACTION.SEND_TO_TE);

// Render the tape to HTML — confirm the agent's content surfaces.
const { default: ManagerAssessmentTape } =
  await import("../src/components/portfolioCio/ManagerAssessmentTape.jsx");
const { default: ManagerAssessmentCard } =
  await import("../src/components/portfolioCio/ManagerAssessmentCard.jsx");
const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
function renderSafe(name, Component, props) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(Component, props)) }; }
  catch (err) { return { ok: false, err }; }
}

const renderedTape = renderSafe("ManagerAssessmentTape", ManagerAssessmentTape, { tape });
assert("[9] tape renders without throwing",                   renderedTape.ok, renderedTape.err?.message);
assert("[9] rendered HTML includes 'Market Intelligence Agent'",
  /Market Intelligence Agent/.test(renderedTape.html || ""));
assert("[9] rendered HTML includes 'Thesis supportive' assessment label",
  /Thesis supportive/.test(renderedTape.html || ""));
assert("[9] rendered HTML includes the catalyst label",
  /Customer adoption/i.test(renderedTape.html || ""));
assert("[9] rendered HTML includes the macro read line",
  /Macro:/.test(renderedTape.html || "") && /Risk-on regime/.test(renderedTape.html || ""));
assert("[9] rendered HTML includes the route recommendation chip",
  /Send to TE/.test(renderedTape.html || ""));

// ============================================================
group("[10] missing summary still renders unavailable card");
// ============================================================

const tapeMissing = buildManagerAssessmentTape({
  symbol: "TEST",
  inputs: {}, // no market_intel input → unavailable card
});
const miMissing = tapeMissing.assessments.find((x) => x.agentId === "market_intel");
assert("[10] missing input still produces a card",            !!miMissing);
assert("[10] stance = unavailable",                           miMissing.stance === STANCE.UNAVAILABLE);
assert("[10] assessmentLabel = 'Insufficient evidence'",      miMissing.assessmentLabel === "Insufficient evidence");

const renderedMissing = renderSafe("MA card (missing)", ManagerAssessmentCard, { assessment: miMissing });
assert("[10] unavailable card renders without throwing",      renderedMissing.ok, renderedMissing.err?.message);
assert("[10] unavailable card surfaces 'Insufficient evidence'",
  /Insufficient evidence/.test(renderedMissing.html || ""));
assert("[10] unavailable card surfaces 'Manager input unavailable' bullet",
  /Manager input unavailable/.test(renderedMissing.html || ""));

// ============================================================
group("[Bonus] calibration flag fires on supportive + thin evidence");
// ============================================================

assert("[Bonus] supports + 3+ articles + LLM mode → no flag (well-supported)",
  // Note: a1 has 3 articles, LLM mode, all 3 reads. With the current
  // rule (rules_fallback OR <3 articles OR low confidence OR thin
  // support OR missingEvidence non-empty), a1 should NOT fire.
  a1.calibrationFlag === null);
assert("[Bonus] supports + few articles + rules fallback → flag fires",
  aWarn.calibrationFlag === "Thesis supportive, but manager confirmation is incomplete.");

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
