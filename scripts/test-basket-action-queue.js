#!/usr/bin/env node
// =====================================================
// Basket Action Queue — engine + UI tests
// Run: npm run test:basket-action-queue
//
// Acceptance gates per spec:
//   1.  emerging leader → promote_to_scanner_review
//   2.  MI constructive but TE/CV unavailable → run_ad_hoc_simulation
//   3.  CV constructive + TE cautious → review_conflict
//   4.  TE constructive + CV unavailable → send_to_CV
//   5.  fading leader → move_to_watchlist_review
//   6.  missed_winner → review_calibration
//   7.  avoided_correctly → monitor_only with caution-validation read
//   8.  symbols with no manager memory → run_ad_hoc_simulation
//   9.  queue groups by priority
//  10.  filters by basket
//  11.  filters by action type
//  12.  rendered HTML leaks no raw score / weight / coefficient tokens
//  13.  existing tests remain green (verified separately)
//  14.  production build clean (verified separately)
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  buildBasketActionQueue,
  groupByPriority,
  ACTION_TYPE,
  PRIORITY,
} from "../src/lib/portfolioCio/basketActionQueue.js";
import { buildBasketLeadershipRead }
  from "../src/lib/portfolioCio/basketLeadershipEngine.js";
import { LEADERSHIP_STATUS, makeBasketUniverse }
  from "../src/lib/portfolioCio/basketAgentTypes.js";
import { STANCE }
  from "../src/lib/portfolioCio/managerAssessmentTypes.js";
import { getBasketAgent }
  from "../src/lib/portfolioCio/basketAgentRegistry.js";

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

// Build a basket universe with explicit active / watch / excluded.
function makeUniverse(basketId, active = [], watchlist = [], excluded = []) {
  const u = makeBasketUniverse(basketId);
  u.activeUniverse  = active.map((s)  => ({ symbol: s, addedAt: 1, addedReason: null, source: null, notes: null, tags: [], lastReviewedAt: null }));
  u.watchlist       = watchlist.map((s) => ({ symbol: s, addedAt: 1, addedReason: null, source: null, notes: null, tags: [], lastReviewedAt: null }));
  u.excludedSymbols = excluded.map((s) => ({ symbol: s, addedAt: 1, addedReason: null, source: null, notes: null, tags: [], lastReviewedAt: null }));
  return u;
}

const profile = getBasketAgent("storage_memory_data_movement");
const profileCool = getBasketAgent("cooling_hvac_building");

// Build the leadership read so the engine can branch on cls.status.
function buildRead(basketProfile, universe, ma, hist) {
  return buildBasketLeadershipRead({
    basketProfile,
    basketUniverse: universe,
    managerAssessmentsBySymbol: ma,
    historyBySymbol: hist,
  });
}

// ============================================================
group("[1] emerging leader → promote_to_scanner_review");
// ============================================================

// 2-of-3 constructive (no cautious) → emerging_leader from the engine.
const u1 = makeUniverse("storage_memory_data_movement", ["SNDK"]);
const ma1 = {
  SNDK: {
    trigger_engine: { stance: STANCE.CONSTRUCTIVE },
    credit_view:    { stance: STANCE.CONSTRUCTIVE },
    market_intel:   { stance: STANCE.UNAVAILABLE },
  },
};
const r1 = buildRead(profile, u1, ma1, {});
const q1 = buildBasketActionQueue({
  basketProfile: profile, basketUniverse: u1,
  leadershipRead: r1, managerAssessmentsBySymbol: ma1,
});
const item1 = q1.find((x) => x.symbol === "SNDK");
assert("[1] queue contains an item for SNDK",        !!item1);
assert("[1] actionType = promote_to_scanner_review",
  item1 && item1.actionType === ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW);
assert("[1] priority = high",                        item1 && item1.priority === PRIORITY.HIGH);
assert("[1] basketId echoed",                        item1 && item1.basketId === "storage_memory_data_movement");
assert("[1] title mentions leadership / scanner",
  item1 && /leadership|scanner/i.test(item1.title));

// ============================================================
group("[2] MI constructive but TE/CV unavailable → run_ad_hoc");
// ============================================================

const u2 = makeUniverse("storage_memory_data_movement", ["WDC"]);
const ma2 = {
  WDC: {
    trigger_engine: { stance: STANCE.UNAVAILABLE },
    credit_view:    { stance: STANCE.UNAVAILABLE },
    market_intel:   { stance: STANCE.CONSTRUCTIVE },
  },
};
const r2 = buildRead(profile, u2, ma2, {});
const q2 = buildBasketActionQueue({
  basketProfile: profile, basketUniverse: u2,
  leadershipRead: r2, managerAssessmentsBySymbol: ma2,
});
const item2 = q2.find((x) => x.symbol === "WDC");
assert("[2] actionType = run_ad_hoc_simulation",
  item2 && item2.actionType === ACTION_TYPE.RUN_AD_HOC_SIMULATION);
assert("[2] priority = medium",                      item2 && item2.priority === PRIORITY.MEDIUM);
assert("[2] suggestedNextStep mentions Ad Hoc Simulation",
  item2 && /Ad Hoc Simulation/i.test(item2.suggestedNextStep));

// ============================================================
group("[3] CV constructive + TE cautious → review_conflict");
// ============================================================

const u3 = makeUniverse("storage_memory_data_movement", ["MU"]);
const ma3 = {
  MU: {
    trigger_engine: { stance: STANCE.CAUTIOUS },
    credit_view:    { stance: STANCE.CONSTRUCTIVE },
    market_intel:   { stance: STANCE.NEUTRAL },
  },
};
const r3 = buildRead(profile, u3, ma3, {});
const q3 = buildBasketActionQueue({
  basketProfile: profile, basketUniverse: u3,
  leadershipRead: r3, managerAssessmentsBySymbol: ma3,
});
const item3 = q3.find((x) => x.symbol === "MU");
assert("[3] actionType = review_conflict",
  item3 && item3.actionType === ACTION_TYPE.REVIEW_CONFLICT);
assert("[3] priority = high",                        item3 && item3.priority === PRIORITY.HIGH);
assert("[3] rationale mentions premium + structure",
  item3 && /premium/i.test(item3.rationale) && /structure/i.test(item3.rationale));

// ============================================================
group("[4] TE constructive + CV unavailable → send_to_CV");
// ============================================================

const u4 = makeUniverse("storage_memory_data_movement", ["STX"]);
const ma4 = {
  STX: {
    trigger_engine: { stance: STANCE.CONSTRUCTIVE },
    credit_view:    { stance: STANCE.UNAVAILABLE },
    market_intel:   { stance: STANCE.NEUTRAL },
  },
};
const r4 = buildRead(profile, u4, ma4, {});
const q4 = buildBasketActionQueue({
  basketProfile: profile, basketUniverse: u4,
  leadershipRead: r4, managerAssessmentsBySymbol: ma4,
});
const item4 = q4.find((x) => x.symbol === "STX");
assert("[4] actionType = send_to_CV",
  item4 && item4.actionType === ACTION_TYPE.SEND_TO_CV);
assert("[4] priority = medium",                      item4 && item4.priority === PRIORITY.MEDIUM);
assert("[4] allowedActions includes send_to_CV",
  item4 && item4.allowedActions.includes(ACTION_TYPE.SEND_TO_CV));

// ============================================================
group("[5] fading leader → move_to_watchlist_review");
// ============================================================

// TE + CV both cautious → engine produces FADING_LEADER.
const u5 = makeUniverse("storage_memory_data_movement", ["NTAP"]);
const ma5 = {
  NTAP: {
    trigger_engine: { stance: STANCE.CAUTIOUS },
    credit_view:    { stance: STANCE.CAUTIOUS },
    market_intel:   { stance: STANCE.CONSTRUCTIVE },
  },
};
const r5 = buildRead(profile, u5, ma5, {});
const item5 = buildBasketActionQueue({
  basketProfile: profile, basketUniverse: u5,
  leadershipRead: r5, managerAssessmentsBySymbol: ma5,
}).find((x) => x.symbol === "NTAP");
assert("[5] leadership engine classified NTAP as fading_leader",
  r5.fadingNames.some((f) => f.symbol === "NTAP" && f.status === LEADERSHIP_STATUS.FADING_LEADER));
assert("[5] actionType = move_to_watchlist_review",
  item5 && item5.actionType === ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW);
assert("[5] priority = medium",                      item5 && item5.priority === PRIORITY.MEDIUM);
assert("[5] allowedActions includes move_to_watchlist_review",
  item5 && item5.allowedActions.includes(ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW));

// ============================================================
group("[6] missed_winner history → review_calibration");
// ============================================================

const u6 = makeUniverse("storage_memory_data_movement", ["PSTG"]);
const ma6 = {
  PSTG: {
    trigger_engine: { stance: STANCE.UNAVAILABLE },
    credit_view:    { stance: STANCE.UNAVAILABLE },
    market_intel:   { stance: STANCE.CONSTRUCTIVE },
  },
};
const hist6 = { PSTG: { outcome: { status: "missed_winner" } } };
const r6 = buildRead(profile, u6, ma6, hist6);
const item6 = buildBasketActionQueue({
  basketProfile: profile, basketUniverse: u6,
  leadershipRead: r6, managerAssessmentsBySymbol: ma6, historyBySymbol: hist6,
}).find((x) => x.symbol === "PSTG");
assert("[6] actionType = review_calibration",
  item6 && item6.actionType === ACTION_TYPE.REVIEW_CALIBRATION);
assert("[6] priority = high",                        item6 && item6.priority === PRIORITY.HIGH);
assert("[6] rationale mentions over-conservatism",
  item6 && /over.conservat/i.test(item6.rationale));
assert("[6] calibrationFlag set",                    item6 && /missed winner/i.test(item6.calibrationFlag || ""));

// ============================================================
group("[7] avoided_correctly history → monitor_only (caution validated)");
// ============================================================

const u7 = makeUniverse("storage_memory_data_movement", ["DELL"]);
// Use partial constructive reads so it doesn't fall through other rules.
const ma7 = {
  DELL: {
    trigger_engine: { stance: STANCE.NEUTRAL },
    credit_view:    { stance: STANCE.NEUTRAL },
    market_intel:   { stance: STANCE.NEUTRAL },
  },
};
const hist7 = { DELL: { outcome: { status: "avoided_correctly" } } };
const r7 = buildRead(profile, u7, ma7, hist7);
const item7 = buildBasketActionQueue({
  basketProfile: profile, basketUniverse: u7,
  leadershipRead: r7, managerAssessmentsBySymbol: ma7, historyBySymbol: hist7,
}).find((x) => x.symbol === "DELL");
assert("[7] actionType = monitor_only",
  item7 && item7.actionType === ACTION_TYPE.MONITOR_ONLY);
assert("[7] priority = low",                         item7 && item7.priority === PRIORITY.LOW);
assert("[7] rationale mentions caution validated",
  item7 && /caution.*validated|caution may have been appropriate|avoided correctly/i.test(item7.rationale));

// ============================================================
group("[8] no manager memory → run_ad_hoc_simulation");
// ============================================================

const u8 = makeUniverse("storage_memory_data_movement", ["HPE"]);
const r8 = buildRead(profile, u8, {}, {});
const item8 = buildBasketActionQueue({
  basketProfile: profile, basketUniverse: u8,
  leadershipRead: r8, managerAssessmentsBySymbol: {},
}).find((x) => x.symbol === "HPE");
assert("[8] actionType = run_ad_hoc_simulation",
  item8 && item8.actionType === ACTION_TYPE.RUN_AD_HOC_SIMULATION);
assert("[8] priority is low or medium",
  item8 && (item8.priority === PRIORITY.LOW || item8.priority === PRIORITY.MEDIUM));
assert("[8] managerContext mentions Insufficient evidence",
  item8 && /Insufficient manager evidence/i.test(item8.managerContext));

// ============================================================
group("[9] queue groups by priority");
// ============================================================

// Build a mixed-priority queue.
const uMix = makeUniverse("storage_memory_data_movement", ["A1", "A2", "A3", "A4"]);
const maMix = {
  A1: { trigger_engine: { stance: STANCE.CAUTIOUS },
        credit_view:    { stance: STANCE.CONSTRUCTIVE },
        market_intel:   { stance: STANCE.NEUTRAL } },                   // review_conflict (HIGH)
  A2: { trigger_engine: { stance: STANCE.UNAVAILABLE },
        credit_view:    { stance: STANCE.UNAVAILABLE },
        market_intel:   { stance: STANCE.CONSTRUCTIVE } },               // run_ad_hoc (MEDIUM)
  A3: { trigger_engine: { stance: STANCE.NEUTRAL },
        credit_view:    { stance: STANCE.NEUTRAL },
        market_intel:   { stance: STANCE.NEUTRAL } },                    // monitor_only (LOW)
  A4: { trigger_engine: { stance: STANCE.UNAVAILABLE },
        credit_view:    { stance: STANCE.UNAVAILABLE },
        market_intel:   { stance: STANCE.UNAVAILABLE } },                // run_ad_hoc (LOW)
};
const rMix = buildRead(profile, uMix, maMix, {});
const items9 = buildBasketActionQueue({
  basketProfile: profile, basketUniverse: uMix,
  leadershipRead: rMix, managerAssessmentsBySymbol: maMix,
});
assert("[9] queue length matches inputs",            items9.length === 4);
assert("[9] sorted high → low",
  items9[0].priority === PRIORITY.HIGH && items9[items9.length - 1].priority === PRIORITY.LOW);
const grouped = groupByPriority(items9);
assert("[9] groupByPriority produces all 4 buckets",
  grouped[PRIORITY.URGENT] !== undefined &&
  grouped[PRIORITY.HIGH] !== undefined &&
  grouped[PRIORITY.MEDIUM] !== undefined &&
  grouped[PRIORITY.LOW] !== undefined);
assert("[9] HIGH bucket contains review_conflict (A1)",
  grouped[PRIORITY.HIGH].some((it) => it.symbol === "A1" && it.actionType === ACTION_TYPE.REVIEW_CONFLICT));
assert("[9] MEDIUM bucket contains run_ad_hoc (A2)",
  grouped[PRIORITY.MEDIUM].some((it) => it.symbol === "A2"));
assert("[9] LOW bucket contains monitor_only (A3) + run_ad_hoc (A4)",
  grouped[PRIORITY.LOW].some((it) => it.symbol === "A3") &&
  grouped[PRIORITY.LOW].some((it) => it.symbol === "A4"));

// ============================================================
group("[10] UI filters by basket");
// ============================================================

// Build items across two baskets.
const uStorage = makeUniverse("storage_memory_data_movement", ["SNDK"]);
const uCooling = makeUniverse("cooling_hvac_building", ["CARR"]);
const maTwo = {
  SNDK: { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
          credit_view:    { stance: STANCE.CONSTRUCTIVE },
          market_intel:   { stance: STANCE.CONSTRUCTIVE } },
  CARR: { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
          credit_view:    { stance: STANCE.CONSTRUCTIVE },
          market_intel:   { stance: STANCE.CONSTRUCTIVE } },
};
const itemsStorage = buildBasketActionQueue({
  basketProfile: profile, basketUniverse: uStorage,
  leadershipRead: buildRead(profile, uStorage, maTwo, {}),
  managerAssessmentsBySymbol: maTwo,
});
const itemsCooling = buildBasketActionQueue({
  basketProfile: profileCool, basketUniverse: uCooling,
  leadershipRead: buildRead(profileCool, uCooling, maTwo, {}),
  managerAssessmentsBySymbol: maTwo,
});
const allItems = [...itemsStorage, ...itemsCooling];

const { default: BasketActionQueue } =
  await import("../src/components/portfolioCio/BasketActionQueue.jsx");
const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");

function renderSafe(name, Component, props) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(Component, props)) }; }
  catch (err) { return { ok: false, err }; }
}

const renderUnfiltered = renderSafe("queue all", BasketActionQueue, { items: allItems });
assert("[10] queue renders without throwing",        renderUnfiltered.ok, renderUnfiltered.err?.message);
const htmlAll = renderUnfiltered.html || "";
assert("[10] HTML mentions both SNDK and CARR",
  /SNDK/.test(htmlAll) && /CARR/.test(htmlAll));
assert("[10] basket filter dropdown lists both basket names",
  /Storage \/ Memory \/ Data Movement/.test(htmlAll) &&
  /Cooling \/ HVAC \/ Building Systems/.test(htmlAll));

const renderStorageOnly = renderSafe("queue filtered storage", BasketActionQueue, {
  items: allItems,
  basketFilter: "storage_memory_data_movement",
});
const htmlStorage = renderStorageOnly.html || "";
assert("[10] basket filter scopes rendered cards",
  /SNDK/.test(htmlStorage) && !/>\s*CARR\s*</.test(htmlStorage));

// ============================================================
group("[11] UI filters by action type (dropdown options reflect items)");
// ============================================================

// Render the unfiltered queue and confirm the action-type dropdown
// includes options corresponding to the items in the queue.
assert("[11] action-type dropdown lists 'Promote to Scanner'",
  />Promote to Scanner<\/option>/.test(htmlAll));
assert("[11] action-type dropdown lists 'All actions'",
  />All actions<\/option>/.test(htmlAll));

// The mixed-priority queue includes Review Conflict + Run Ad Hoc + Monitor.
const renderMixed = renderSafe("queue mixed", BasketActionQueue, { items: items9 });
const htmlMixed = renderMixed.html || "";
assert("[11] dropdown lists Review Conflict (HIGH bucket present)",
  />Review Conflict<\/option>/.test(htmlMixed));
assert("[11] dropdown lists Run Ad Hoc Simulation",
  />Run Ad Hoc Simulation<\/option>/.test(htmlMixed));
assert("[11] dropdown lists Monitor",
  />Monitor<\/option>/.test(htmlMixed));
// Priority headers visible per group.
assert("[11] HIGH section header rendered",          /HIGH ·/.test(htmlMixed));
assert("[11] MEDIUM section header rendered",        /MEDIUM ·/.test(htmlMixed));
assert("[11] LOW section header rendered",           /LOW ·/.test(htmlMixed));

// ============================================================
group("[12] no raw scores / weights / coefficients in rendered HTML");
// ============================================================

const probes = [htmlAll, htmlStorage, htmlMixed];
for (const [i, html] of probes.entries()) {
  assert(`[12] probe[${i}] no \"score\":N`,         !/"score"\s*:\s*-?\d/.test(html));
  assert(`[12] probe[${i}] no \"weight\":N`,        !/"weight"\s*:/.test(html));
  assert(`[12] probe[${i}] no coefficient token`,   !/coefficient/i.test(html));
  assert(`[12] probe[${i}] no \"w_\" prefix`,       !/"w_/.test(html));
}

// ============================================================
group("[Bonus] excluded names with constructive memory → restore review");
// ============================================================

const uExcl = makeUniverse("storage_memory_data_movement", [], [], ["MU"]);
const maExcl = {
  MU: {
    trigger_engine: { stance: STANCE.CONSTRUCTIVE },
    credit_view:    { stance: STANCE.CONSTRUCTIVE },
    market_intel:   { stance: STANCE.CONSTRUCTIVE },
  },
};
const itemsExcl = buildBasketActionQueue({
  basketProfile: profile, basketUniverse: uExcl,
  leadershipRead: buildRead(profile, uExcl, maExcl, {}),
  managerAssessmentsBySymbol: maExcl,
});
const itemMu = itemsExcl.find((x) => x.symbol === "MU");
assert("[Bonus] excluded MU surfaces a restore review",
  itemMu && itemMu.actionType === ACTION_TYPE.RESTORE_TO_ACTIVE_REVIEW);
assert("[Bonus] allowedActions includes RESTORE_TO_ACTIVE_REVIEW",
  itemMu && itemMu.allowedActions.includes(ACTION_TYPE.RESTORE_TO_ACTIVE_REVIEW));

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
