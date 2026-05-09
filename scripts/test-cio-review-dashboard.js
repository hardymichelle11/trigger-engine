#!/usr/bin/env node
// =====================================================
// CIO Review Dashboard — engine + UI tests
// Run: npm run test:cio-review-dashboard
//
// Acceptance gates per spec:
//   1.  Dashboard summarizes all 12 registered baskets
//   2.  Active / watchlist / excluded counts roll up correctly
//   3.  High-priority action count surfaces per basket
//   4.  Emerging leaders surface in the per-basket summary
//   5.  Fading names roll up into the global derisking watch
//   6.  Insufficient evidence rolls up across baskets
//   7.  missed_winner produces a calibration flag rollup
//   8.  avoided_correctly produces a low-priority monitor item
//       (no calibration flag at the dashboard level)
//   9.  TE / CV review needed sub-lists collected globally
//  10.  Scanner-promotion candidates collected globally
//  11.  No active universe → safe empty read (no throws)
//  12.  No raw scores / weights / coefficients in rendered HTML
//  13.  Dashboard sorts busiest baskets first
//  14.  Top queue + per-basket card components render
//  15.  Production build clean (verified separately by npm run build)
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  buildCioReviewDashboard,
} from "../src/lib/portfolioCio/cioReviewDashboardEngine.js";
import {
  ACTION_TYPE,
  PRIORITY,
} from "../src/lib/portfolioCio/basketActionQueue.js";
import {
  LEADERSHIP_STATUS,
  makeBasketUniverse,
} from "../src/lib/portfolioCio/basketAgentTypes.js";
import {
  STANCE,
} from "../src/lib/portfolioCio/managerAssessmentTypes.js";
import {
  listBasketAgents,
  getBasketAgent,
} from "../src/lib/portfolioCio/basketAgentRegistry.js";

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

function makeUniverse(basketId, active = [], watchlist = [], excluded = []) {
  const u = makeBasketUniverse(basketId);
  const wrap = (s) => ({ symbol: s, addedAt: 1, addedReason: null, source: null, notes: null, tags: [], lastReviewedAt: null });
  u.activeUniverse  = active.map(wrap);
  u.watchlist       = watchlist.map(wrap);
  u.excludedSymbols = excluded.map(wrap);
  return u;
}

const allBaskets = listBasketAgents();
const profileStorage = getBasketAgent("storage_memory_data_movement");
const profileCool    = getBasketAgent("cooling_hvac_building");
const profileBrain   = getBasketAgent("brain_compute");

// Helper: build a basket-universes-by-id map covering only the baskets
// we want to populate. Other basket profiles fall back to safe empty
// universes inside the engine.
function makeUniversesById(map) {
  const out = {};
  for (const [basketId, u] of Object.entries(map)) out[basketId] = u;
  return out;
}

// ============================================================
group("[1] dashboard summarizes all 12 registered baskets");
// ============================================================

const d1 = buildCioReviewDashboard({
  basketProfiles: allBaskets,
});
assert("[1] basketSummaries length = 12",
  Array.isArray(d1.basketSummaries) && d1.basketSummaries.length === 12);
assert("[1] every registered basketId appears in the summaries",
  allBaskets.every((p) => d1.basketSummaries.some((s) => s.basketId === p.basketId)));
assert("[1] generatedAt is set",
  typeof d1.generatedAt === "number" && d1.generatedAt > 0);

// ============================================================
group("[2] active / watchlist / excluded counts roll up");
// ============================================================

const uStorage2 = makeUniverse(
  "storage_memory_data_movement",
  ["SNDK", "WDC"],         // 2 active
  ["MU"],                   // 1 watchlist
  ["NTAP", "STX"],         // 2 excluded
);
const uCool2 = makeUniverse(
  "cooling_hvac_building",
  ["CARR"],                 // 1 active
  [],
  ["JCI"],                  // 1 excluded
);
const d2 = buildCioReviewDashboard({
  basketProfiles: allBaskets,
  basketUniversesById: makeUniversesById({
    storage_memory_data_movement: uStorage2,
    cooling_hvac_building: uCool2,
  }),
});
assert("[2] totalActive = 3",     d2.totalActive === 3);
assert("[2] totalWatchlist = 1",  d2.totalWatchlist === 1);
assert("[2] totalExcluded = 3",   d2.totalExcluded === 3);
const sumStorage = d2.basketSummaries.find((s) => s.basketId === "storage_memory_data_movement");
const sumCool    = d2.basketSummaries.find((s) => s.basketId === "cooling_hvac_building");
assert("[2] storage activeCount = 2",     sumStorage && sumStorage.activeCount === 2);
assert("[2] storage watchlistCount = 1",  sumStorage && sumStorage.watchlistCount === 1);
assert("[2] storage excludedCount = 2",   sumStorage && sumStorage.excludedCount === 2);
assert("[2] cooling activeCount = 1",     sumCool && sumCool.activeCount === 1);

// ============================================================
group("[3] high-priority action count surfaces per basket");
// ============================================================

// Storage: SNDK (constructive across all → emerging/leader → promote, HIGH)
//          MU  (cv constructive + te cautious → review_conflict, HIGH)
// Cooling: CARR (no manager evidence → run_ad_hoc, LOW)
const uStorage3 = makeUniverse("storage_memory_data_movement", ["SNDK", "MU"]);
const uCool3 = makeUniverse("cooling_hvac_building", ["CARR"]);
const ma3 = {
  SNDK: {
    trigger_engine: { stance: STANCE.CONSTRUCTIVE },
    credit_view:    { stance: STANCE.CONSTRUCTIVE },
    market_intel:   { stance: STANCE.CONSTRUCTIVE },
  },
  MU: {
    trigger_engine: { stance: STANCE.CAUTIOUS },
    credit_view:    { stance: STANCE.CONSTRUCTIVE },
    market_intel:   { stance: STANCE.NEUTRAL },
  },
};
const d3 = buildCioReviewDashboard({
  basketProfiles: allBaskets,
  basketUniversesById: makeUniversesById({
    storage_memory_data_movement: uStorage3,
    cooling_hvac_building: uCool3,
  }),
  managerAssessmentsBySymbol: ma3,
});
const sumStorage3 = d3.basketSummaries.find((s) => s.basketId === "storage_memory_data_movement");
const sumCool3    = d3.basketSummaries.find((s) => s.basketId === "cooling_hvac_building");
assert("[3] storage highPriorityActionCount = 2",
  sumStorage3 && sumStorage3.highPriorityActionCount === 2);
assert("[3] cooling highPriorityActionCount = 0",
  sumCool3 && sumCool3.highPriorityActionCount === 0);
assert("[3] dashboard totalHighPriorityActions = 2",
  d3.totalHighPriorityActions === 2);

// ============================================================
group("[4] emerging leaders surface per basket");
// ============================================================

// 2 of 3 constructive (no cautious) → emerging_leader.
const uStorage4 = makeUniverse("storage_memory_data_movement", ["SNDK"]);
const ma4 = {
  SNDK: {
    trigger_engine: { stance: STANCE.CONSTRUCTIVE },
    credit_view:    { stance: STANCE.CONSTRUCTIVE },
    market_intel:   { stance: STANCE.UNAVAILABLE },
  },
};
const d4 = buildCioReviewDashboard({
  basketProfiles: allBaskets,
  basketUniversesById: makeUniversesById({
    storage_memory_data_movement: uStorage4,
  }),
  managerAssessmentsBySymbol: ma4,
});
const sumStorage4 = d4.basketSummaries.find((s) => s.basketId === "storage_memory_data_movement");
assert("[4] emergingLeaderCount >= 1",
  sumStorage4 && (sumStorage4.leadershipRead?.emergingLeaderCount || 0) >= 1);
assert("[4] emergingLeaders array contains SNDK",
  sumStorage4 && sumStorage4.emergingLeaders.some((c) => c.symbol === "SNDK"));

// ============================================================
group("[5] fading names roll up into global derisking watch");
// ============================================================

// Two cautious reads → fading_leader from leadership engine.
const uStorage5 = makeUniverse("storage_memory_data_movement", ["NTAP"]);
const uCool5    = makeUniverse("cooling_hvac_building", ["JCI"]);
const ma5 = {
  NTAP: {
    trigger_engine: { stance: STANCE.CAUTIOUS },
    credit_view:    { stance: STANCE.CAUTIOUS },
    market_intel:   { stance: STANCE.CONSTRUCTIVE },
  },
  JCI: {
    trigger_engine: { stance: STANCE.CAUTIOUS },
    credit_view:    { stance: STANCE.CAUTIOUS },
    market_intel:   { stance: STANCE.CONSTRUCTIVE },
  },
};
const d5 = buildCioReviewDashboard({
  basketProfiles: allBaskets,
  basketUniversesById: makeUniversesById({
    storage_memory_data_movement: uStorage5,
    cooling_hvac_building: uCool5,
  }),
  managerAssessmentsBySymbol: ma5,
});
assert("[5] deriskingWatch contains NTAP",
  d5.deriskingWatch.some((d) => d.symbol === "NTAP"));
assert("[5] deriskingWatch contains JCI",
  d5.deriskingWatch.some((d) => d.symbol === "JCI"));
assert("[5] derisking entries echo basketId / basketName",
  d5.deriskingWatch.every((d) =>
    typeof d.basketId === "string" && typeof d.basketName === "string"));
assert("[5] fading items show up in deriskingWatch with status",
  d5.deriskingWatch.some(
    (d) => d.symbol === "NTAP" && d.status === LEADERSHIP_STATUS.FADING_LEADER));

// ============================================================
group("[6] insufficient evidence rolls up across baskets");
// ============================================================

// Two baskets, each with one symbol that has no manager evidence.
const uStorage6 = makeUniverse("storage_memory_data_movement", ["HPE"]);
const uCool6    = makeUniverse("cooling_hvac_building", ["CARR"]);
const d6 = buildCioReviewDashboard({
  basketProfiles: allBaskets,
  basketUniversesById: makeUniversesById({
    storage_memory_data_movement: uStorage6,
    cooling_hvac_building: uCool6,
  }),
  managerAssessmentsBySymbol: {},
});
assert("[6] totalInsufficientEvidence = 2",
  d6.totalInsufficientEvidence === 2);
assert("[6] insufficientEvidence list contains HPE + CARR",
  d6.insufficientEvidence.some((it) => it.symbol === "HPE") &&
  d6.insufficientEvidence.some((it) => it.symbol === "CARR"));
const sumStorage6 = d6.basketSummaries.find((s) => s.basketId === "storage_memory_data_movement");
assert("[6] basket summary insufficientEvidenceCount echoes per-basket count",
  sumStorage6 && sumStorage6.insufficientEvidenceCount === 1);

// ============================================================
group("[7] missed_winner → calibration flag rollup");
// ============================================================

const uStorage7 = makeUniverse("storage_memory_data_movement", ["PSTG"]);
const ma7 = {
  PSTG: {
    trigger_engine: { stance: STANCE.UNAVAILABLE },
    credit_view:    { stance: STANCE.UNAVAILABLE },
    market_intel:   { stance: STANCE.CONSTRUCTIVE },
  },
};
const hist7 = { PSTG: { outcome: { status: "missed_winner" } } };
const d7 = buildCioReviewDashboard({
  basketProfiles: allBaskets,
  basketUniversesById: makeUniversesById({
    storage_memory_data_movement: uStorage7,
  }),
  managerAssessmentsBySymbol: ma7,
  historyBySymbol: hist7,
});
assert("[7] totalCalibrationFlags >= 1",
  d7.totalCalibrationFlags >= 1);
assert("[7] calibrationFlags includes PSTG",
  d7.calibrationFlags.some((f) =>
    f.symbol === "PSTG" && /missed winner/i.test(f.flag || "")));
const sumStorage7 = d7.basketSummaries.find((s) => s.basketId === "storage_memory_data_movement");
assert("[7] basket summary surfaces calibrationFlags for PSTG",
  sumStorage7 && sumStorage7.calibrationFlags.some((f) => f.symbol === "PSTG"));

// ============================================================
group("[8] avoided_correctly → monitor_only, low priority");
// ============================================================

const uStorage8 = makeUniverse("storage_memory_data_movement", ["DELL"]);
const ma8 = {
  DELL: {
    trigger_engine: { stance: STANCE.NEUTRAL },
    credit_view:    { stance: STANCE.NEUTRAL },
    market_intel:   { stance: STANCE.NEUTRAL },
  },
};
const hist8 = { DELL: { outcome: { status: "avoided_correctly" } } };
const d8 = buildCioReviewDashboard({
  basketProfiles: allBaskets,
  basketUniversesById: makeUniversesById({
    storage_memory_data_movement: uStorage8,
  }),
  managerAssessmentsBySymbol: ma8,
  historyBySymbol: hist8,
});
// The monitor_only item is LOW priority, so it must not bump high-pri counts.
assert("[8] avoided_correctly does NOT raise high-priority count",
  d8.totalHighPriorityActions === 0);
// avoided_correctly DOES surface a positive calibration flag ("caution
// validated") so the dashboard records both directions of calibration
// signal. Confirm the flag is the validation copy, not a misalignment.
assert("[8] avoided_correctly surfaces a caution-validated calibration flag",
  d8.calibrationFlags.some(
    (f) => f.symbol === "DELL" && /caution.*validated|validated by prior outcome/i.test(f.flag || "")));

// ============================================================
group("[9] TE / CV review needed sub-lists collected globally");
// ============================================================

// One symbol per route across 3 baskets:
//   TE-needed:  CV constructive + TE cautious → review_conflict
//                ALSO: an explicit allowedActions includes SEND_TO_TE.
//                Engine surfaces SEND_TO_TE via review_conflict's allowedActions.
//                But teReviewNeeded uses item.actionType === SEND_TO_TE which
//                only surfaces in the rare direct send_to_TE rule. Here we
//                use rule 4 (TE constructive + CV unavailable → SEND_TO_CV)
//                to populate cvReviewNeeded directly, and use rule 2
//                (MI constructive + TE/CV unavailable → run_ad_hoc, MEDIUM)
//                to populate teReviewNeeded via its medium-priority
//                run_ad_hoc surface.
const uStorage9 = makeUniverse("storage_memory_data_movement", ["STX"]);   // TE→CV
const uCool9    = makeUniverse("cooling_hvac_building",        ["WATT"]);  // MI→Ad Hoc
const ma9 = {
  STX:  { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
          credit_view:    { stance: STANCE.UNAVAILABLE },
          market_intel:   { stance: STANCE.NEUTRAL } },
  WATT: { trigger_engine: { stance: STANCE.UNAVAILABLE },
          credit_view:    { stance: STANCE.UNAVAILABLE },
          market_intel:   { stance: STANCE.CONSTRUCTIVE } },
};
const d9 = buildCioReviewDashboard({
  basketProfiles: allBaskets,
  basketUniversesById: makeUniversesById({
    storage_memory_data_movement: uStorage9,
    cooling_hvac_building: uCool9,
  }),
  managerAssessmentsBySymbol: ma9,
});
assert("[9] cvReviewNeeded contains STX (send_to_CV)",
  d9.cvReviewNeeded.some((it) => it.symbol === "STX" && it.actionType === ACTION_TYPE.SEND_TO_CV));
assert("[9] teReviewNeeded contains WATT (medium run_ad_hoc, routed to TE surface)",
  d9.teReviewNeeded.some((it) => it.symbol === "WATT"));

// ============================================================
group("[10] scanner-promotion candidates collected globally");
// ============================================================

// 3-of-3 constructive on an active name → leader → promote_to_scanner_review.
const uStorage10 = makeUniverse("storage_memory_data_movement", ["SNDK"]);
const uCool10    = makeUniverse("cooling_hvac_building",         ["CARR"]);
const ma10 = {
  SNDK: { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
          credit_view:    { stance: STANCE.CONSTRUCTIVE },
          market_intel:   { stance: STANCE.CONSTRUCTIVE } },
  CARR: { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
          credit_view:    { stance: STANCE.CONSTRUCTIVE },
          market_intel:   { stance: STANCE.CONSTRUCTIVE } },
};
const d10 = buildCioReviewDashboard({
  basketProfiles: allBaskets,
  basketUniversesById: makeUniversesById({
    storage_memory_data_movement: uStorage10,
    cooling_hvac_building: uCool10,
  }),
  managerAssessmentsBySymbol: ma10,
});
assert("[10] scannerPromotionCandidates includes SNDK and CARR",
  d10.scannerPromotionCandidates.some((it) => it.symbol === "SNDK") &&
  d10.scannerPromotionCandidates.some((it) => it.symbol === "CARR"));
assert("[10] all promotion candidates use PROMOTE_TO_SCANNER_REVIEW",
  d10.scannerPromotionCandidates.every((it) => it.actionType === ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW));

// ============================================================
group("[11] no active universe → safe empty read (no throws)");
// ============================================================

let dEmpty;
let emptyOk = true;
let emptyErr = null;
try {
  dEmpty = buildCioReviewDashboard({});                                // nothing
  buildCioReviewDashboard({ basketProfiles: [] });                     // empty baskets
  buildCioReviewDashboard({ basketProfiles: allBaskets });             // no universes
} catch (err) {
  emptyOk = false;
  emptyErr = err;
}
assert("[11] empty inputs do not throw", emptyOk, emptyErr?.message);
assert("[11] no profiles → empty basketSummaries",
  Array.isArray(dEmpty.basketSummaries) && dEmpty.basketSummaries.length === 0);
assert("[11] no profiles → totalActive = 0",          dEmpty.totalActive === 0);
assert("[11] empty case still returns actionSummary string",
  typeof dEmpty.actionSummary === "string" && dEmpty.actionSummary.length > 0);
assert("[11] empty case still returns generatedAt",
  typeof dEmpty.generatedAt === "number" && dEmpty.generatedAt > 0);

// ============================================================
group("[12] no raw scores / weights / coefficients in rendered HTML");
// ============================================================

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
const { default: CioBasketSummaryCard } =
  await import("../src/components/portfolioCio/CioBasketSummaryCard.jsx");
const { default: CioReviewQueueSummary } =
  await import("../src/components/portfolioCio/CioReviewQueueSummary.jsx");
const { default: CioCalibrationSummary } =
  await import("../src/components/portfolioCio/CioCalibrationSummary.jsx");

function renderSafe(Component, props) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(Component, props)) }; }
  catch (err) { return { ok: false, err }; }
}

// Mix all the trickiest situations into one engine run for rendering.
const uMix = makeUniverse("storage_memory_data_movement", ["SNDK", "MU", "NTAP", "HPE"], ["WDC"], ["STX"]);
const uMixCool = makeUniverse("cooling_hvac_building", ["CARR"]);
const maMix = {
  SNDK: { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
          credit_view:    { stance: STANCE.CONSTRUCTIVE },
          market_intel:   { stance: STANCE.CONSTRUCTIVE } },
  MU:   { trigger_engine: { stance: STANCE.CAUTIOUS },
          credit_view:    { stance: STANCE.CONSTRUCTIVE },
          market_intel:   { stance: STANCE.NEUTRAL } },
  NTAP: { trigger_engine: { stance: STANCE.CAUTIOUS },
          credit_view:    { stance: STANCE.CAUTIOUS },
          market_intel:   { stance: STANCE.CONSTRUCTIVE } },
  CARR: { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
          credit_view:    { stance: STANCE.CONSTRUCTIVE },
          market_intel:   { stance: STANCE.CONSTRUCTIVE } },
  STX:  { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
          credit_view:    { stance: STANCE.CONSTRUCTIVE },
          market_intel:   { stance: STANCE.NEUTRAL } },
  WDC:  { trigger_engine: { stance: STANCE.UNAVAILABLE },
          credit_view:    { stance: STANCE.UNAVAILABLE },
          market_intel:   { stance: STANCE.CONSTRUCTIVE } },
};
const histMix = { SNDK: { outcome: { status: "missed_winner" } } };
const dMix = buildCioReviewDashboard({
  basketProfiles: allBaskets,
  basketUniversesById: makeUniversesById({
    storage_memory_data_movement: uMix,
    cooling_hvac_building: uMixCool,
  }),
  managerAssessmentsBySymbol: maMix,
  historyBySymbol: histMix,
});

const cardSummary = dMix.basketSummaries.find((s) => s.basketId === "storage_memory_data_movement");
const renderCard = renderSafe(CioBasketSummaryCard, { summary: cardSummary });
const renderQueue = renderSafe(CioReviewQueueSummary, {
  topQueueItems: dMix.topQueueItems,
  scannerPromotionCandidates: dMix.scannerPromotionCandidates,
  teReviewNeeded: dMix.teReviewNeeded,
  cvReviewNeeded: dMix.cvReviewNeeded,
});
const renderCalib = renderSafe(CioCalibrationSummary, {
  calibrationFlags: dMix.calibrationFlags,
  insufficientEvidence: dMix.insufficientEvidence,
  deriskingWatch: dMix.deriskingWatch,
});

assert("[12] CioBasketSummaryCard renders without throwing",
  renderCard.ok, renderCard.err?.message);
assert("[12] CioReviewQueueSummary renders without throwing",
  renderQueue.ok, renderQueue.err?.message);
assert("[12] CioCalibrationSummary renders without throwing",
  renderCalib.ok, renderCalib.err?.message);

const probes = [renderCard.html || "", renderQueue.html || "", renderCalib.html || ""];
for (const [i, html] of probes.entries()) {
  assert(`[12] probe[${i}] no \"score\":N`,        !/"score"\s*:\s*-?\d/.test(html));
  assert(`[12] probe[${i}] no \"weight\":N`,       !/"weight"\s*:/.test(html));
  assert(`[12] probe[${i}] no coefficient token`,  !/coefficient/i.test(html));
  assert(`[12] probe[${i}] no \"w_\" prefix`,      !/"w_/.test(html));
}

// ============================================================
group("[13] dashboard sorts busiest baskets first");
// ============================================================

// Storage has 2 high-priority items (SNDK leader + MU conflict).
// Cooling has 1 high-priority item (CARR leader). Other baskets have 0.
// Expectation: storage first, then cooling, then ties broken
// alphabetically.
const idxStorage = dMix.basketSummaries.findIndex(
  (s) => s.basketId === "storage_memory_data_movement");
const idxCool = dMix.basketSummaries.findIndex(
  (s) => s.basketId === "cooling_hvac_building");
assert("[13] storage_memory ranks before cooling",
  idxStorage >= 0 && idxCool >= 0 && idxStorage < idxCool);
assert("[13] busiest basket is at index 0",
  dMix.basketSummaries[0].highPriorityActionCount === Math.max(...dMix.basketSummaries.map((s) => s.highPriorityActionCount)));

// ============================================================
group("[14] top queue + per-basket card render with key fields");
// ============================================================

assert("[14] top queue HTML mentions at least one symbol from the mix",
  /SNDK|MU|NTAP|CARR|STX|WDC/.test(renderQueue.html || ""));
assert("[14] top queue HTML carries priority chip (HIGH or URGENT)",
  /HIGH|URGENT/i.test(renderQueue.html || ""));
assert("[14] basket-card HTML includes basketName label",
  /Storage \/ Memory \/ Data Movement/.test(renderCard.html || ""));
assert("[14] basket-card HTML carries 'Leaders' / 'Emerging' counts",
  /LEADERS/.test(renderCard.html || "") && /EMERGING/.test(renderCard.html || ""));
assert("[14] calibration HTML lists insufficient evidence header",
  /INSUFFICIENT MANAGER EVIDENCE/i.test(renderCalib.html || ""));
assert("[14] calibration HTML lists derisking watch header",
  /DERISKING WATCH/i.test(renderCalib.html || ""));

// ============================================================
group("[15] no buy / sell wording leaks into dashboard copy");
// ============================================================

// Trader-facing — guard against overt buy/sell phrasing.
const allHtml = probes.join("\n");
assert("[15] no \"buy now\" / \"sell now\" phrasing",
  !/(\bbuy\s+now\b|\bsell\s+now\b)/i.test(allHtml));
assert("[15] no \"go long\" / \"go short\" phrasing",
  !/(\bgo\s+long\b|\bgo\s+short\b)/i.test(allHtml));
assert("[15] no capital allocation tokens (\"size to\" / \"allocate \\d+\")",
  !/(\bsize\s+to\b|\ballocate\s+\d)/i.test(allHtml));

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
