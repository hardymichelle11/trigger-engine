#!/usr/bin/env node
// =====================================================
// Basket Leadership Memory — store + resolver + UI tests
// Run: npm run test:basket-leadership-memory
//
// Acceptance gates per spec:
//   1.  recordManagerAssessmentSnapshot stores sanitized tape result
//       by symbol.
//   2.  Same symbol updates latest snapshot (no duplicate records).
//   3.  getLatestManagerAssessmentSnapshot returns normalized symbol
//       match.
//   4.  Corrupted localStorage recovers safely.
//   5.  Memory store caps records.
//   6.  Raw score / weight / coefficient fields are NOT persisted.
//   7.  Basket manager resolver returns assessment bags for active
//       symbols.
//   8.  Missing memory returns empty / unavailable manager bag.
//   9.  BasketLeadershipTable uses memory to render non-unavailable
//       TE / CV / MI stances.
//  10.  basketLeadershipEngine classifies leader when memory has
//       constructive TE / CV / MI.
//  11.  watch_only when MI supportive but TE / CV missing in memory.
//  12.  Excluded symbols still do not appear as leaders.
//  13.  Existing insufficient-evidence footer remains for symbols
//       without memory (table-wide empty case still surfaces it).
//  14.  No auto-promote, no auto-trade, no Dynamic Basket write.
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  setManagerMemoryBackend,
  resetManagerMemoryBackend,
  setManagerMemoryMaxRecords,
  resetManagerMemoryMaxRecords,
  recordManagerAssessmentSnapshot,
  getLatestManagerAssessmentSnapshot,
  listManagerAssessmentSnapshots,
  deleteManagerAssessmentSnapshot,
  clearManagerAssessmentMemory,
  getManagerAssessmentsBySymbols,
} from "../src/lib/portfolioCio/managerAssessmentMemoryStore.js";
import { getBasketManagerInputs }
  from "../src/lib/portfolioCio/basketManagerAssessmentResolver.js";
import { buildBasketLeadershipRead }
  from "../src/lib/portfolioCio/basketLeadershipEngine.js";
import { LEADERSHIP_STATUS }
  from "../src/lib/portfolioCio/basketAgentTypes.js";
import {
  STANCE,
  CONFIDENCE,
  RECOMMENDED_ACTION,
  TIME_HORIZON,
} from "../src/lib/portfolioCio/managerAssessmentTypes.js";
import {
  setBasketBackend,
  resetBasketBackend,
  upsertBasketSymbol,
  moveToExcluded,
  clearAllBasketUniverses,
  getBasketUniverse,
} from "../src/lib/portfolioCio/basketUniverseManager.js";
import { getBasketAgent }
  from "../src/lib/portfolioCio/basketAgentRegistry.js";
import {
  setUniverseBackend,
  resetUniverseBackend,
  clearDynamicUniverse,
  listScannerEligible,
  listBySource,
  listDynamicTickers,
} from "../src/lib/universe/dynamicUniverseStore.js";
import { TICKER_SOURCE_TYPES }
  from "../src/lib/universe/tickerUniverseTypes.js";

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
  setManagerMemoryBackend(makeMemoryBackend());
  setBasketBackend(makeMemoryBackend());
  setUniverseBackend(makeMemoryBackend());
  clearManagerAssessmentMemory();
  clearAllBasketUniverses();
  clearDynamicUniverse();
  resetManagerMemoryMaxRecords();
}

// Build a fully-populated tape result fixture in the shape produced by
// buildManagerAssessmentTape. We keep it minimal but valid.
function makeAssessment({ agentId, agentName, stance, label, action }) {
  return {
    agentId,
    agentName,
    agentRole: `Role for ${agentName}`,
    assessmentLabel: label || stance,
    stance,
    confidenceLabel: CONFIDENCE.MODERATE,
    evidenceSummary: `${agentName} read.`,
    supportingEvidence: [`${agentName} supporting`],
    concernFlags: [],
    missingEvidence: [],
    recommendedAction: action || RECOMMENDED_ACTION.MONITOR,
    routeRecommendation: null,
    timeHorizonBias: TIME_HORIZON.NEAR_TERM,
    calibrationFlag: null,
    lastUpdatedAt: 1714600000000,
  };
}
function makeTapeFixture({ symbol, te, cv, mi, risk, withLeak = false }) {
  const assessments = [
    makeAssessment({ agentId: "trigger_engine", agentName: "Trigger Engine Agent", stance: te, action: RECOMMENDED_ACTION.SEND_TO_CV }),
    makeAssessment({ agentId: "credit_view",    agentName: "Credit View Agent",    stance: cv, action: RECOMMENDED_ACTION.PROCEED }),
    makeAssessment({ agentId: "market_intel",   agentName: "Market Intelligence Agent", stance: mi, action: RECOMMENDED_ACTION.SEND_TO_TE }),
    makeAssessment({ agentId: "risk_manager",   agentName: "Risk Manager",         stance: risk || STANCE.UNAVAILABLE }),
  ];
  if (withLeak) {
    // Try to leak raw fields the sanitizer must drop.
    for (const a of assessments) {
      a.score = 87;
      a.weight = 0.42;
      a.coefficient = 0.99;
      a.rawWeights = { x: 1, y: 2 };
    }
  }
  return {
    symbol,
    cioRecommendation: { label: "Mixed — monitor", action: RECOMMENDED_ACTION.MONITOR, rationale: "test" },
    managerConsensus: "Most agents constructive",
    managerConflicts: [],
    overrideReason: null,
    calibrationWatch: { calibrationNeeded: false, calibrationReason: null, watchMetric: null, reviewAfter: null, clueFromHistory: null },
    assessments,
    missingEvidence: [],
  };
}

// ============================================================
group("[1] recordManagerAssessmentSnapshot stores sanitized result");
// ============================================================
reset();

const tape1 = makeTapeFixture({
  symbol: "SNDK",
  te: STANCE.CONSTRUCTIVE,
  cv: STANCE.CONSTRUCTIVE,
  mi: STANCE.CONSTRUCTIVE,
});
const rec1 = recordManagerAssessmentSnapshot({ symbol: "sndk", tapeResult: tape1 });
assert("[1] returned a record",                      !!rec1);
assert("[1] symbol normalized to SNDK",              rec1.symbol === "SNDK");
assert("[1] source defaults to 'ad_hoc_simulation'", rec1.source === "ad_hoc_simulation");
assert("[1] updatedAt is finite",                    Number.isFinite(rec1.updatedAt));
assert("[1] managerConsensus carried over",          rec1.managerConsensus === "Most agents constructive");
assert("[1] assessments keyed by agentId",
  rec1.assessments && rec1.assessments.trigger_engine && rec1.assessments.credit_view && rec1.assessments.market_intel);
assert("[1] TE stance preserved",
  rec1.assessments.trigger_engine.stance === STANCE.CONSTRUCTIVE);
assert("[1] CV stance preserved",
  rec1.assessments.credit_view.stance === STANCE.CONSTRUCTIVE);

// ============================================================
group("[2] same symbol updates latest snapshot");
// ============================================================
reset();

recordManagerAssessmentSnapshot({
  symbol: "SNDK",
  tapeResult: makeTapeFixture({ symbol: "SNDK", te: STANCE.CONSTRUCTIVE, cv: STANCE.CONSTRUCTIVE, mi: STANCE.CONSTRUCTIVE }),
});
const recordsBefore = listManagerAssessmentSnapshots();
recordManagerAssessmentSnapshot({
  symbol: "SNDK",
  tapeResult: makeTapeFixture({ symbol: "SNDK", te: STANCE.CAUTIOUS, cv: STANCE.CAUTIOUS, mi: STANCE.CAUTIOUS }),
});
const recordsAfter = listManagerAssessmentSnapshots();
assert("[2] still exactly one record for SNDK",      recordsAfter.length === 1);
assert("[2] previous count was also 1",              recordsBefore.length === 1);
assert("[2] latest reflects new stances",
  recordsAfter[0].assessments.trigger_engine.stance === STANCE.CAUTIOUS &&
  recordsAfter[0].assessments.credit_view.stance === STANCE.CAUTIOUS &&
  recordsAfter[0].assessments.market_intel.stance === STANCE.CAUTIOUS);

// ============================================================
group("[3] getLatest returns normalized symbol match");
// ============================================================
reset();

recordManagerAssessmentSnapshot({
  symbol: "WDC",
  tapeResult: makeTapeFixture({ symbol: "WDC", te: STANCE.CONSTRUCTIVE, cv: STANCE.NEUTRAL, mi: STANCE.CONSTRUCTIVE }),
});
const fetched = getLatestManagerAssessmentSnapshot("  wdc  ");
assert("[3] lowercase + whitespace normalize",       fetched && fetched.symbol === "WDC");
assert("[3] missing symbol returns null",            getLatestManagerAssessmentSnapshot("ZZZNEVER") === null);

// ============================================================
group("[4] corrupted localStorage recovers safely");
// ============================================================
reset();

const corrupted = makeMemoryBackend();
corrupted.setItem("te.cio.manager_memory.v1", "{not valid json");
setManagerMemoryBackend(corrupted);

let listSafe = null;
try { listSafe = listManagerAssessmentSnapshots(); } catch { listSafe = "threw"; }
assert("[4] listManagerAssessmentSnapshots returns []",      Array.isArray(listSafe) && listSafe.length === 0);
const safeRec = recordManagerAssessmentSnapshot({
  symbol: "SNDK",
  tapeResult: makeTapeFixture({ symbol: "SNDK", te: STANCE.CONSTRUCTIVE, cv: STANCE.CONSTRUCTIVE, mi: STANCE.CONSTRUCTIVE }),
});
assert("[4] record write still works after corruption", !!safeRec);

// ============================================================
group("[5] memory store caps records");
// ============================================================
reset();
setManagerMemoryMaxRecords(5);

for (let i = 0; i < 12; i++) {
  recordManagerAssessmentSnapshot({
    symbol: "T" + i,
    tapeResult: makeTapeFixture({ symbol: "T" + i, te: STANCE.CONSTRUCTIVE, cv: STANCE.CONSTRUCTIVE, mi: STANCE.CONSTRUCTIVE }),
  });
}
const cappedList = listManagerAssessmentSnapshots();
assert("[5] capped to 5",                            cappedList.length === 5);
assert("[5] oldest evicted (T0–T6 absent, T7+ present)",
  cappedList.every((r) => !["T0","T1","T2","T3","T4","T5","T6"].includes(r.symbol)));
resetManagerMemoryMaxRecords();

// ============================================================
group("[6] raw score / weight / coefficient NOT persisted");
// ============================================================
reset();

recordManagerAssessmentSnapshot({
  symbol: "SNDK",
  tapeResult: makeTapeFixture({
    symbol: "SNDK", te: STANCE.CONSTRUCTIVE, cv: STANCE.CONSTRUCTIVE, mi: STANCE.CONSTRUCTIVE,
    withLeak: true,
  }),
});
const rec6 = getLatestManagerAssessmentSnapshot("SNDK");
const blob6 = JSON.stringify(rec6);
assert("[6] no \"score\":N",                         !/"score"\s*:\s*-?\d/.test(blob6));
assert("[6] no \"weight\":N",                        !/"weight"\s*:/.test(blob6));
assert("[6] no \"coefficient\" token",               !/coefficient/i.test(blob6));
assert("[6] no \"rawWeights\" field",                !/rawWeights/.test(blob6));

// ============================================================
group("[7] basketManagerResolver returns bags for active symbols");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
upsertBasketSymbol("storage_memory_data_movement", "WDC",  {});
recordManagerAssessmentSnapshot({
  symbol: "SNDK",
  tapeResult: makeTapeFixture({ symbol: "SNDK", te: STANCE.CONSTRUCTIVE, cv: STANCE.CONSTRUCTIVE, mi: STANCE.CONSTRUCTIVE }),
});
recordManagerAssessmentSnapshot({
  symbol: "WDC",
  tapeResult: makeTapeFixture({ symbol: "WDC", te: STANCE.CAUTIOUS, cv: STANCE.CAUTIOUS, mi: STANCE.CONSTRUCTIVE }),
});
const inputs7 = getBasketManagerInputs(["SNDK", "WDC"]);
assert("[7] managerAssessmentsBySymbol has both symbols",
  inputs7.managerAssessmentsBySymbol.SNDK && inputs7.managerAssessmentsBySymbol.WDC);
assert("[7] SNDK trigger_engine stance constructive",
  inputs7.managerAssessmentsBySymbol.SNDK.trigger_engine.stance === STANCE.CONSTRUCTIVE);
assert("[7] WDC credit_view stance cautious",
  inputs7.managerAssessmentsBySymbol.WDC.credit_view.stance === STANCE.CAUTIOUS);
assert("[7] coverage.covered = [SNDK, WDC]",
  inputs7.coverage.covered.length === 2 &&
  inputs7.coverage.covered.includes("SNDK") &&
  inputs7.coverage.covered.includes("WDC"));
assert("[7] coverage.missing is empty",              inputs7.coverage.missing.length === 0);

// ============================================================
group("[8] missing memory → empty / unavailable bag");
// ============================================================
reset();

const inputs8 = getBasketManagerInputs(["NOMEM"]);
assert("[8] managerAssessmentsBySymbol is empty for NOMEM",
  Object.keys(inputs8.managerAssessmentsBySymbol).length === 0);
assert("[8] coverage.covered is empty",              inputs8.coverage.covered.length === 0);
assert("[8] coverage.missing contains NOMEM",        inputs8.coverage.missing.includes("NOMEM"));
assert("[8] coverage.total = 1",                     inputs8.coverage.total === 1);

// ============================================================
group("[9] BasketLeadershipTable uses memory");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
recordManagerAssessmentSnapshot({
  symbol: "SNDK",
  tapeResult: makeTapeFixture({ symbol: "SNDK", te: STANCE.CONSTRUCTIVE, cv: STANCE.CONSTRUCTIVE, mi: STANCE.CONSTRUCTIVE }),
});

const universe9 = getBasketUniverse("storage_memory_data_movement");
const inputs9 = getBasketManagerInputs(universe9.activeUniverse.map((r) => r.symbol));

const { default: BasketLeadershipTable } =
  await import("../src/components/portfolioCio/BasketLeadershipTable.jsx");
const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
function renderSafe(name, Component, props) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(Component, props)) }; }
  catch (err) { return { ok: false, err }; }
}

const read9 = buildBasketLeadershipRead({
  basketProfile: getBasketAgent("storage_memory_data_movement"),
  basketUniverse: universe9,
  managerAssessmentsBySymbol: inputs9.managerAssessmentsBySymbol,
  historyBySymbol: inputs9.historyBySymbol,
});
const tableRender9 = renderSafe("LeadershipTable with memory", BasketLeadershipTable, {
  read: read9,
  universe: universe9,
  managerAssessmentsBySymbol: inputs9.managerAssessmentsBySymbol,
});
const html9 = tableRender9.html || "";
assert("[9] table renders without throwing",          tableRender9.ok, tableRender9.err?.message);
assert("[9] HTML mentions 'Constructive' (TE / CV / MI stance chip)",
  /Constructive/.test(html9));
assert("[9] HTML does NOT show 'Insufficient manager evidence' table footer",
  !/Insufficient manager evidence/.test(html9));
assert("[9] SNDK row has Leader chip",
  /SNDK[\s\S]*?>\s*Leader\s*</.test(html9));

// ============================================================
group("[10] engine classifies leader from memory inputs");
// ============================================================

assert("[10] read.leaders includes SNDK (status = leader)",
  read9.leaders.some((l) => l.symbol === "SNDK" && l.status === LEADERSHIP_STATUS.LEADER));

// ============================================================
group("[11] watch_only when MI supportive but TE / CV missing");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "WDC", {});
recordManagerAssessmentSnapshot({
  symbol: "WDC",
  tapeResult: makeTapeFixture({
    symbol: "WDC",
    te: STANCE.UNAVAILABLE,   // missing TE
    cv: STANCE.UNAVAILABLE,   // missing CV
    mi: STANCE.CONSTRUCTIVE,
  }),
});
const universe11 = getBasketUniverse("storage_memory_data_movement");
const inputs11 = getBasketManagerInputs(universe11.activeUniverse.map((r) => r.symbol));
const read11 = buildBasketLeadershipRead({
  basketProfile: getBasketAgent("storage_memory_data_movement"),
  basketUniverse: universe11,
  managerAssessmentsBySymbol: inputs11.managerAssessmentsBySymbol,
  historyBySymbol: inputs11.historyBySymbol,
});
assert("[11] WDC classified as watch_only",
  read11.watchOnly.some((w) => w.symbol === "WDC" && w.status === LEADERSHIP_STATUS.WATCH_ONLY));

// ============================================================
group("[12] excluded symbols do NOT appear as leaders");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "MU", {});
recordManagerAssessmentSnapshot({
  symbol: "MU",
  tapeResult: makeTapeFixture({ symbol: "MU", te: STANCE.CONSTRUCTIVE, cv: STANCE.CONSTRUCTIVE, mi: STANCE.CONSTRUCTIVE }),
});
moveToExcluded("storage_memory_data_movement", "MU", "concentration_risk");

const universe12 = getBasketUniverse("storage_memory_data_movement");
const inputs12 = getBasketManagerInputs([
  ...universe12.activeUniverse.map((r) => r.symbol),
  ...universe12.watchlist.map((r) => r.symbol),
]);
const read12 = buildBasketLeadershipRead({
  basketProfile: getBasketAgent("storage_memory_data_movement"),
  basketUniverse: universe12,
  managerAssessmentsBySymbol: inputs12.managerAssessmentsBySymbol,
  historyBySymbol: inputs12.historyBySymbol,
});
assert("[12] read.leaders does NOT include MU",       !read12.leaders.some((l) => l.symbol === "MU"));
assert("[12] read.activeUniverse does NOT include MU", !read12.activeUniverse.includes("MU"));
assert("[12] MU still on excludedSymbols",
  universe12.excludedSymbols.some((r) => r.symbol === "MU"));

// ============================================================
group("[13] insufficient-evidence footer remains for empty bag");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "STX", {});  // no memory
const universe13 = getBasketUniverse("storage_memory_data_movement");
const inputs13 = getBasketManagerInputs(universe13.activeUniverse.map((r) => r.symbol));
const read13 = buildBasketLeadershipRead({
  basketProfile: getBasketAgent("storage_memory_data_movement"),
  basketUniverse: universe13,
  managerAssessmentsBySymbol: inputs13.managerAssessmentsBySymbol,
  historyBySymbol: inputs13.historyBySymbol,
});
const tableRender13 = renderSafe("LeadershipTable empty bag", BasketLeadershipTable, {
  read: read13,
  universe: universe13,
  managerAssessmentsBySymbol: inputs13.managerAssessmentsBySymbol,
});
const html13 = tableRender13.html || "";
assert("[13] footer shows 'Insufficient manager evidence'",
  /Insufficient manager evidence/.test(html13));
assert("[13] footer mentions 'Use Ad Hoc Simulation to generate manager reads'",
  /Use Ad Hoc Simulation to generate manager reads/.test(html13));
assert("[13] STX row stance cells render 'unavailable'",
  /unavailable/.test(html13));

// ============================================================
group("[14] no auto-promote / auto-trade / dynamic-basket write");
// ============================================================
reset();

assert("[14] dynamic store empty before",            Object.keys(listDynamicTickers()).length === 0);
recordManagerAssessmentSnapshot({
  symbol: "SNDK",
  tapeResult: makeTapeFixture({ symbol: "SNDK", te: STANCE.CONSTRUCTIVE, cv: STANCE.CONSTRUCTIVE, mi: STANCE.CONSTRUCTIVE }),
});
recordManagerAssessmentSnapshot({
  symbol: "WDC",
  tapeResult: makeTapeFixture({ symbol: "WDC", te: STANCE.CAUTIOUS, cv: STANCE.CAUTIOUS, mi: STANCE.CONSTRUCTIVE }),
});
assert("[14] memory writes did NOT touch dynamic store",
  Object.keys(listDynamicTickers()).length === 0);
assert("[14] listScannerEligible still empty",        listScannerEligible().length === 0);
assert("[14] no DYNAMIC_BASKET entries created",
  listBySource(TICKER_SOURCE_TYPES.DYNAMIC_BASKET).length === 0);
assert("[14] no LETHAL_BOARD_PROSPECT entries created",
  listBySource(TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT).length === 0);

// Bonus: deleting a snapshot works.
const deleted = deleteManagerAssessmentSnapshot("SNDK");
assert("[14] delete returns true",                    deleted === true);
assert("[14] listSnapshots reflects delete",
  !listManagerAssessmentSnapshots().some((r) => r.symbol === "SNDK"));

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetManagerMemoryBackend();
resetBasketBackend();
resetUniverseBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
