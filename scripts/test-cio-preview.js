#!/usr/bin/env node
// =====================================================
// CIO Audit Preview — TE + CV + MI adapter integration tests
// Run: npm run test:cio-preview
//
// Acceptance gates per spec:
//   1.  TE simulation maps to Trigger Engine manager assessment.
//   2.  CV simulation maps to Credit View manager assessment.
//   3.  MI summary maps to Market Intelligence manager assessment.
//   4.  Missing TE/CV/MI produce unavailable cards through tape fallback.
//   5.  Full ad-hoc sim renders MI + TE + CV cards.
//   6.  All 9 required manager cards render.
//   7.  Conflict detected when MI supportive but CV cautious.
//   8.  Calibration watch fires when MI supportive but TE/CV
//       confirmation incomplete.
//   9.  No raw scores/weights/coefficients in rendered CIO preview.
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import { simulateAdHoc } from "../src/lib/universe/adHocSimulationService.js";
import { initializeMarketIntelligenceForSymbol }
  from "../src/lib/intelligence/newsIntelligenceService.js";
import {
  registerNewsProvider,
  clearNewsProviders,
} from "../src/lib/intelligence/newsProviderRegistry.js";
import { createManualNewsProvider }
  from "../src/lib/intelligence/newsFeedAdapter.js";
import {
  setUniverseBackend,
  resetUniverseBackend,
  clearDynamicUniverse,
} from "../src/lib/universe/dynamicUniverseStore.js";
import {
  STANCE,
  RECOMMENDED_ACTION,
  CONFLICT_TYPE,
} from "../src/lib/portfolioCio/managerAssessmentTypes.js";
import { buildManagerAssessmentTape }
  from "../src/lib/portfolioCio/managerAssessmentTape.js";
import {
  teSimulationToAssessment,
  CIO_TRIGGER_ENGINE_AGENT_ID,
} from "../src/lib/portfolioCio/adapters/teSimulationAssessmentAdapter.js";
import {
  cvSimulationToAssessment,
  CIO_CREDIT_VIEW_AGENT_ID,
} from "../src/lib/portfolioCio/adapters/cvSimulationAssessmentAdapter.js";
import { buildAdHocCioTapeInputs }
  from "../src/lib/portfolioCio/adapters/adHocCioTapeInputs.js";

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

function makeMemoryBackend() {
  const map = new Map();
  return {
    getItem: (k) => map.has(k) ? map.get(k) : null,
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
}
function reset() {
  setUniverseBackend(makeMemoryBackend());
  clearDynamicUniverse();
  clearNewsProviders();
}

// ---------------------------------------------------------------------
// Sim fixtures — bullish bars + put chain.
// ---------------------------------------------------------------------

const FAKE_QUOTE = { symbol: "TEST", price: 100, previousClose: 99, percentChange: 1.01 };
function fakeBars({ count = 30, drift = 0.4 } = {}) {
  const out = [];
  let prev = 100;
  for (let i = 0; i < count; i++) {
    const close = prev + drift + Math.sin(i) * 0.2;
    out.push({
      ts: Date.now() - (count - i) * 86_400_000,
      open: prev, close,
      high: Math.max(prev, close) + 0.5,
      low: Math.min(prev, close) - 0.5,
      volume: 1_000_000,
    });
    prev = close;
  }
  return out;
}
function fakeChain({ wide = false } = {}) {
  const today = new Date();
  const exp = new Date(today.getTime() + 21 * 86_400_000);
  const expIso = exp.toISOString().slice(0, 10);
  const strikes = [105, 100, 95, 90];
  return {
    underlyingSymbol: "TEST",
    contracts: strikes.map((k, i) => ({
      symbol: `O:TEST${expIso}P${k}`, underlyingSymbol: "TEST",
      expiration: expIso, strike: k, type: "put",
      bid: wide ? 0.20 : Math.max(0.10, 0.50 - i * 0.05),
      ask: wide ? 0.80 : Math.max(0.15, 0.55 - i * 0.05 + 0.05),
      mid: null, last: 0.40, volume: 1000, openInterest: 5000,
      impliedVolatility: 0.30, delta: -0.20 + (k - 100) * 0.01,
      gamma: 0.02, theta: -0.05, vega: 0.10, inTheMoney: k > 100,
    })).map((c) => ({ ...c, mid: (c.bid + c.ask) / 2 })),
    provider: "polygon", asOf: Date.now(), warnings: [],
  };
}
async function runSim(symbol = "TEST", { wideSpread = false } = {}) {
  return simulateAdHoc(symbol, {
    persist: false,
    providers: {
      fetchQuotes: async () => ({ [symbol]: { ...FAKE_QUOTE, symbol } }),
      fetchBars: async () => fakeBars(),
      fetchOptionsChain: async () => fakeChain({ wide: wideSpread }),
    },
  });
}
async function runSimNoChain(symbol = "TEST") {
  return simulateAdHoc(symbol, {
    persist: false,
    providers: {
      fetchQuotes: async () => ({ [symbol]: { ...FAKE_QUOTE, symbol } }),
      fetchBars: async () => fakeBars(),
      fetchOptionsChain: async () => ({ underlyingSymbol: symbol, contracts: [], provider: "polygon", asOf: Date.now(), warnings: ["empty_chain"] }),
    },
  });
}
async function runSimNoData(symbol = "TEST") {
  return simulateAdHoc(symbol, {
    persist: false,
    providers: { fetchQuotes: async () => ({}), fetchBars: async () => [], fetchOptionsChain: async () => null },
  });
}

// ============================================================
group("[1] TE simulation → Trigger Engine assessment");
// ============================================================
reset();

const sim1 = await runSim("TEST");
const teA = teSimulationToAssessment({ symbol: "TEST", simResult: sim1 });
assert("TE adapter returns a record",                 !!teA);
assert("agent name = 'Trigger Engine Agent'",         teA.agentName === "Trigger Engine Agent");
assert("stance = constructive (bullish drift)",       teA.stance === STANCE.CONSTRUCTIVE);
assert("recommendedAction = send_to_CV",              teA.recommendedAction === RECOMMENDED_ACTION.SEND_TO_CV);
assert("supportingEvidence includes Price",
  teA.supportingEvidence.some((s) => s.startsWith("Price ")));
assert("supportingEvidence includes Trend bias",
  teA.supportingEvidence.some((s) => s.startsWith("Trend bias:")));
assert("supportingEvidence includes Recent support",
  teA.supportingEvidence.some((s) => s.startsWith("Recent support:")));
assert("supportingEvidence includes ATR",
  teA.supportingEvidence.some((s) => s.startsWith("ATR:")));

// TE limited (no quote + no bars) → null.
const simNoData = await runSimNoData("TEST");
const teNull = teSimulationToAssessment({ symbol: "TEST", simResult: simNoData });
assert("TE adapter returns null when TE blocked",     teNull === null);

// CIO_TRIGGER_ENGINE_AGENT_ID is the canonical slot
assert("trigger_engine slot id is 'trigger_engine'",
  CIO_TRIGGER_ENGINE_AGENT_ID === "trigger_engine");

// ============================================================
group("[2] CV simulation → Credit View assessment");
// ============================================================

const cvA = cvSimulationToAssessment({ symbol: "TEST", simResult: sim1 });
assert("CV adapter returns a record",                 !!cvA);
assert("agent name = 'Credit View Agent'",            cvA.agentName === "Credit View Agent");
assert("supportingEvidence includes Preferred strike",
  cvA.supportingEvidence.some((s) => /Preferred strike:/.test(s)));
assert("supportingEvidence includes Premium mid",
  cvA.supportingEvidence.some((s) => /Premium mid:/.test(s)));
assert("supportingEvidence includes Spread grade",
  cvA.supportingEvidence.some((s) => /Spread grade:/.test(s)));
assert("supportingEvidence includes Confirmation sentence",
  cvA.supportingEvidence.some((s) => s.startsWith("Confirmation:")));
assert("concernFlags include Invalidation sentence",
  cvA.concernFlags.some((c) => c.startsWith("Invalidation:")));

// Wide-spread sim → spread grade C → concern flag fires.
const simWide = await runSim("TEST", { wideSpread: true });
const cvWide = cvSimulationToAssessment({ symbol: "TEST", simResult: simWide });
assert("wide spread → 'Spread quality is wide' concern",
  !!cvWide && cvWide.concernFlags.some((c) => /Spread quality is wide/i.test(c)));

// CV limited (empty chain) → null.
const simLimited = await runSimNoChain("TEST");
const cvNull = cvSimulationToAssessment({ symbol: "TEST", simResult: simLimited });
assert("CV adapter returns null when CV is limited",  cvNull === null);
assert("credit_view slot id is 'credit_view'",
  CIO_CREDIT_VIEW_AGENT_ID === "credit_view");

// ============================================================
group("[3] MI summary → Market Intelligence assessment");
// ============================================================

// Register a manual provider with supportive copy so MI fires.
const manualSupports = createManualNewsProvider();
manualSupports.addArticles("TEST", [
  { title: "TEST signs multiyear data center partnership", source: "Reuters", url: "https://x/1", publishedAt: 1714600000000 },
  { title: "TEST guidance raised on backlog growth",       source: "WSJ",     url: "https://x/2", publishedAt: 1714700000000 },
  { title: "Customer adoption deal announced",             source: "FT",      url: "https://x/3", publishedAt: 1714800000000 },
]);
clearNewsProviders();
registerNewsProvider(manualSupports);

const intel1 = await initializeMarketIntelligenceForSymbol({
  symbol: "TEST",
  basketProfile: { label: "AI Infra" },
  useLLM: false,
});
const composed1 = buildAdHocCioTapeInputs({
  symbol: "TEST",
  simResult: sim1,
  intelligenceResult: intel1,
});
assert("composer returned a market_intel slot",       !!composed1.inputs.market_intel);
assert("market_intel stance = constructive",
  composed1.inputs.market_intel.stance === STANCE.CONSTRUCTIVE);
assert("composer returned a trigger_engine slot",     !!composed1.inputs.trigger_engine);
assert("composer returned a credit_view slot",        !!composed1.inputs.credit_view);

// ============================================================
group("[4] Missing TE/CV/MI → unavailable cards via tape fallback");
// ============================================================

// Build a tape from a sim where everything is unavailable.
const composedEmpty = buildAdHocCioTapeInputs({
  symbol: "VOID",
  simResult: simNoData,
  intelligenceResult: null,
});
assert("composedEmpty.inputs is empty",               Object.keys(composedEmpty.inputs).length === 0);
const tapeEmpty = buildManagerAssessmentTape({
  symbol: "VOID",
  inputs: composedEmpty.inputs,
  history: composedEmpty.history,
});
const required = ["basket", "market_intel", "lethal_board", "trigger_engine", "credit_view", "risk_manager", "capital_allocation", "macro_regime", "institutional_rotation"];
for (const id of required) {
  const card = tapeEmpty.assessments.find((a) => a.agentId === id);
  assert(`${id} card present even when missing`,       !!card);
  assert(`${id} stance = unavailable`,                 card.stance === STANCE.UNAVAILABLE);
}

// ============================================================
group("[5] Full ad-hoc sim renders MI + TE + CV cards");
// ============================================================

const tape5 = buildManagerAssessmentTape({
  symbol: composed1.symbol,
  inputs: composed1.inputs,
  history: composed1.history,
});
const teCard = tape5.assessments.find((a) => a.agentId === "trigger_engine");
const cvCard = tape5.assessments.find((a) => a.agentId === "credit_view");
const miCard = tape5.assessments.find((a) => a.agentId === "market_intel");
assert("[5] TE card stance = constructive",          teCard.stance === STANCE.CONSTRUCTIVE);
assert("[5] CV card has populated assessmentLabel",  typeof cvCard.assessmentLabel === "string" && cvCard.assessmentLabel.length > 0);
assert("[5] MI card stance = constructive",          miCard.stance === STANCE.CONSTRUCTIVE);

// ============================================================
group("[6] All 9 required manager cards render");
// ============================================================

assert("tape5 has exactly 9 assessments",             tape5.assessments.length === 9);
const ids5 = tape5.assessments.map((a) => a.agentId).sort();
assert("tape5 agentIds == required set",
  ids5.join("|") === [...required].sort().join("|"));

// ============================================================
group("[7] Conflict detected — MI supportive + CV cautious");
// ============================================================
clearNewsProviders();

// Force CV to land in "Wait for Better Premium" (cautious) by using a
// sim with wide spread + low IV. Wide-spread chain → spreadClass = wide
// → CV recommendation includes "Avoid — Poor Premium/Spread". Per the
// CV adapter's mapping, "avoid" labels become avoid_for_now (cautious).
const simCvCautious = await runSim("TEST", { wideSpread: true });
const intelSupports = await initializeMarketIntelligenceForSymbol({
  symbol: "TEST",
  basketProfile: { label: "AI Infra" },
  useLLM: false,
  // Re-use the supportive manual provider via a one-off registration.
  providers: [manualSupports],
});
const composed7 = buildAdHocCioTapeInputs({
  symbol: "TEST",
  simResult: simCvCautious,
  intelligenceResult: intelSupports,
});
const tape7 = buildManagerAssessmentTape({
  symbol: composed7.symbol,
  inputs: composed7.inputs,
  history: composed7.history,
});

assert("[7] MI stance = constructive in this fixture",
  tape7.assessments.find((a) => a.agentId === "market_intel").stance === STANCE.CONSTRUCTIVE);
const cv7 = tape7.assessments.find((a) => a.agentId === "credit_view");
assert("[7] CV stance is cautious / bearish under wide spread",
  cv7.stance === STANCE.CAUTIOUS || cv7.stance === STANCE.BEARISH);
assert("[7] thesis_vs_timing conflict fires",
  tape7.managerConflicts.some((c) => c.conflictType === CONFLICT_TYPE.THESIS_VS_TIMING));

// ============================================================
group("[8] Calibration watch — MI supportive, TE/CV confirmation incomplete");
// ============================================================

// Same supportive MI + a sim where CV is in limited mode (empty chain).
// MI supportive + CV unavailable + TE constructive → calibration watch
// from the cioCalibrationWatch.evaluate() rule for "Market Intel
// supportive but TE/CV confirmation missing".
const simLimited8 = await runSimNoChain("TEST");
const composed8 = buildAdHocCioTapeInputs({
  symbol: "TEST",
  simResult: simLimited8,
  intelligenceResult: intelSupports,
});
const tape8 = buildManagerAssessmentTape({
  symbol: composed8.symbol,
  inputs: composed8.inputs,
  history: composed8.history,
});
assert("[8] CV slot omitted (limited)",       !composed8.inputs.credit_view);
assert("[8] CV card renders unavailable",
  tape8.assessments.find((a) => a.agentId === "credit_view").stance === STANCE.UNAVAILABLE);
assert("[8] calibrationWatch.calibrationNeeded = true",
  tape8.calibrationWatch.calibrationNeeded === true);
assert("[8] calibration reason mentions missing TE/CV confirmation",
  /TE \/ CV confirmation is missing|TE\/CV confirmation/i.test(tape8.calibrationWatch.calibrationReason || ""));

// ============================================================
group("[9] No raw scores / weights / coefficients in rendered preview");
// ============================================================

const { default: ManagerAssessmentTape } =
  await import("../src/components/portfolioCio/ManagerAssessmentTape.jsx");
const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");

function renderSafe(name, Component, props) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(Component, props)) }; }
  catch (err) { return { ok: false, err }; }
}

const rendered = renderSafe("ManagerAssessmentTape (full)", ManagerAssessmentTape, { tape: tape5 });
assert("[9] tape renders without throwing",           rendered.ok, rendered.err?.message);
const html = rendered.html || "";
assert("[9] HTML mentions Trigger Engine Agent",      /Trigger Engine Agent/.test(html));
assert("[9] HTML mentions Credit View Agent",         /Credit View Agent/.test(html));
assert("[9] HTML mentions Market Intelligence Agent", /Market Intelligence Agent/.test(html));
assert("[9] no \"score\":N field",                    !/"score"\s*:\s*-?\d/.test(html));
assert("[9] no \"weight\":N field",                   !/"weight"\s*:/.test(html));
assert("[9] no coefficient token",                    !/coefficient/i.test(html));

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
clearNewsProviders();
resetUniverseBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
