#!/usr/bin/env node
// =====================================================
// Basket Agent Registry + Universe Manager + Leadership Engine — tests
// Run: npm run test:basket-agents
//
// Acceptance gates per spec:
//   1.  registry includes all 12 required baskets.
//   2.  baseline leaders do not equal active universe.
//   3.  SNDK appears as baseline leader for Storage / Memory.
//   4.  CARR appears as baseline leader for Cooling / HVAC.
//   5.  active universe can add symbol.
//   6.  active universe can remove symbol.
//   7.  move to watchlist removes from active.
//   8.  move to excluded removes from active and watchlist.
//   9.  restore to active removes from watchlist/excluded.
//  10.  symbol tags and notes update.
//  11.  corrupted localStorage recovers safely.
//  12.  active/watchlist/excluded are mutually exclusive.
//  13.  leadership engine identifies leader when MI/TE/CV are constructive.
//  14.  leadership engine identifies watch_only when thesis supportive
//       but TE/CV missing.
//  15.  leadership engine identifies fading/watch when TE/CV are cautious.
//  16.  excluded symbols do not appear as leaders.
//  17.  missed_winner history creates calibration note.
//  18.  avoided_correctly history creates caution-validation note.
//  19.  no raw scores/weights/coefficient tokens appear in output.
//  20.  existing tests remain green (verified separately).
//  21.  production build clean (verified separately).
// =====================================================

import {
  BASKET_AGENTS,
  getBasketAgent,
  listBasketAgents,
  listBasketIds,
} from "../src/lib/portfolioCio/basketAgentRegistry.js";
import {
  LEADERSHIP_STATUS,
  normalizeSymbol,
} from "../src/lib/portfolioCio/basketAgentTypes.js";
import {
  setBasketBackend,
  resetBasketBackend,
  upsertBasketSymbol,
  removeBasketSymbol,
  moveToWatchlist,
  moveToExcluded,
  restoreToActive,
  updateBasketSymbolNote,
  addBasketSymbolTag,
  removeBasketSymbolTag,
  clearBasketUniverse,
  clearAllBasketUniverses,
  getBasketUniverse,
  listBasketUniverses,
} from "../src/lib/portfolioCio/basketUniverseManager.js";
import { buildBasketLeadershipRead } from "../src/lib/portfolioCio/basketLeadershipEngine.js";
import { STANCE } from "../src/lib/portfolioCio/managerAssessmentTypes.js";

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
    _map: map,
  };
}
function reset() {
  setBasketBackend(makeMemoryBackend());
  clearAllBasketUniverses();
}

// ============================================================
group("[1] registry includes all 12 baskets");
// ============================================================

const REQUIRED_IDS = [
  "brain_compute",
  "workflow_agentic_software",
  "data_center_infra",
  "power_energy",
  "cooling_hvac_building",
  "storage_memory_data_movement",
  "ai_health_diagnostics",
  "robotics_automation",
  "cybersecurity_trust",
  "data_mlops",
  "connectivity_networking",
  "semiconductor_hardware",
];
assert("BASKET_AGENTS length = 12",                        BASKET_AGENTS.length === 12);
assert("listBasketAgents() length = 12",                   listBasketAgents().length === 12);
assert("listBasketIds() returns 12",                        listBasketIds().length === 12);
const ids = listBasketIds().slice().sort();
assert("all required basket ids present",                  ids.join("|") === REQUIRED_IDS.slice().sort().join("|"));

for (const id of REQUIRED_IDS) {
  const profile = getBasketAgent(id);
  assert(`getBasketAgent("${id}") returns a profile`,       !!profile);
  assert(`profile has basketName`,                          typeof profile.basketName === "string" && profile.basketName.length > 0);
  assert(`profile has mandate`,                             typeof profile.mandate === "string" && profile.mandate.length > 0);
  assert(`profile has baselineLeaders array`,                Array.isArray(profile.baselineLeaders) && profile.baselineLeaders.length > 0);
  assert(`profile has discoveryKeywords`,                   Array.isArray(profile.discoveryKeywords) && profile.discoveryKeywords.length > 0);
  assert(`profile has rebalanceCadence`,                    typeof profile.rebalanceCadence === "string");
  assert(`profile has maxSuggestedExposure`,                typeof profile.maxSuggestedExposure === "string");
  assert(`profile has riskMandate`,                         typeof profile.riskMandate === "string");
  assert(`profile has preferredManagerRoute`,               typeof profile.preferredManagerRoute === "string");
}

// ============================================================
group("[2] baseline leaders ≠ active universe");
// ============================================================
reset();

for (const id of REQUIRED_IDS) {
  const profile = getBasketAgent(id);
  const universe = getBasketUniverse(id);
  assert(`${id}: profile.baselineLeaders is non-empty`,     profile.baselineLeaders.length > 0);
  assert(`${id}: getBasketUniverse(${id}).activeUniverse is empty by default`,
    Array.isArray(universe.activeUniverse) && universe.activeUniverse.length === 0);
  assert(`${id}: getBasketUniverse(${id}).watchlist empty`,
    Array.isArray(universe.watchlist) && universe.watchlist.length === 0);
  assert(`${id}: getBasketUniverse(${id}).excludedSymbols empty`,
    Array.isArray(universe.excludedSymbols) && universe.excludedSymbols.length === 0);
}

// ============================================================
group("[3] SNDK is baseline leader for Storage / Memory");
// ============================================================

const storage = getBasketAgent("storage_memory_data_movement");
assert("storage profile present",                           !!storage);
assert("SNDK in storage.baselineLeaders",                   storage.baselineLeaders.includes("SNDK"));
assert("WDC in storage.baselineLeaders",                    storage.baselineLeaders.includes("WDC"));
assert("MU  in storage.baselineLeaders",                    storage.baselineLeaders.includes("MU"));

// ============================================================
group("[4] CARR is baseline leader for Cooling / HVAC");
// ============================================================

const cooling = getBasketAgent("cooling_hvac_building");
assert("cooling profile present",                           !!cooling);
assert("CARR in cooling.baselineLeaders",                   cooling.baselineLeaders.includes("CARR"));
assert("VRT  in cooling.baselineLeaders",                   cooling.baselineLeaders.includes("VRT"));

// ============================================================
group("[5] active universe can add symbol");
// ============================================================
reset();

const added = upsertBasketSymbol("storage_memory_data_movement", "sndk", { addedReason: "manual" });
assert("[5] upsert returned a record",                      !!added);
assert("[5] symbol normalized to SNDK",                     added.symbol === "SNDK");
const u5 = getBasketUniverse("storage_memory_data_movement");
assert("[5] active universe length = 1",                    u5.activeUniverse.length === 1);
assert("[5] activeUniverse contains SNDK record",
  u5.activeUniverse.some((r) => r.symbol === "SNDK"));

// ============================================================
group("[6] active universe can remove symbol");
// ============================================================

const removed = removeBasketSymbol("storage_memory_data_movement", "SNDK");
assert("[6] remove returned true",                          removed === true);
const u6 = getBasketUniverse("storage_memory_data_movement");
assert("[6] active universe is empty",                      u6.activeUniverse.length === 0);
assert("[6] removeBasketSymbol(absent) returns false",      removeBasketSymbol("storage_memory_data_movement", "ZZZ") === false);

// ============================================================
group("[7] move to watchlist removes from active");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "WDC", { addedReason: "manual" });
moveToWatchlist("storage_memory_data_movement", "WDC", "needs_confirmation");
const u7 = getBasketUniverse("storage_memory_data_movement");
assert("[7] WDC removed from activeUniverse",
  !u7.activeUniverse.some((r) => r.symbol === "WDC"));
assert("[7] WDC present on watchlist",
  u7.watchlist.some((r) => r.symbol === "WDC"));
assert("[7] watchlist record carries reason",
  u7.watchlist.find((r) => r.symbol === "WDC").addedReason === "needs_confirmation");

// ============================================================
group("[8] move to excluded removes from active + watchlist");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "MU", {});
moveToWatchlist("storage_memory_data_movement", "STX", "wait_for_confirmation");
moveToExcluded("storage_memory_data_movement", "MU", "concentration_risk");
moveToExcluded("storage_memory_data_movement", "STX", "concentration_risk");
const u8 = getBasketUniverse("storage_memory_data_movement");
assert("[8] MU not in activeUniverse",
  !u8.activeUniverse.some((r) => r.symbol === "MU"));
assert("[8] STX not in watchlist",
  !u8.watchlist.some((r) => r.symbol === "STX"));
assert("[8] both MU + STX in excludedSymbols",
  u8.excludedSymbols.some((r) => r.symbol === "MU") &&
  u8.excludedSymbols.some((r) => r.symbol === "STX"));

// ============================================================
group("[9] restore to active removes from watchlist + excluded");
// ============================================================

restoreToActive("storage_memory_data_movement", "MU");
restoreToActive("storage_memory_data_movement", "STX");
const u9 = getBasketUniverse("storage_memory_data_movement");
assert("[9] MU restored to activeUniverse",
  u9.activeUniverse.some((r) => r.symbol === "MU"));
assert("[9] STX restored to activeUniverse",
  u9.activeUniverse.some((r) => r.symbol === "STX"));
assert("[9] excludedSymbols cleared of MU + STX",
  !u9.excludedSymbols.some((r) => r.symbol === "MU" || r.symbol === "STX"));

// ============================================================
group("[10] tags + notes update");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "PSTG", {});
const noted = updateBasketSymbolNote("storage_memory_data_movement", "PSTG", "watching guidance");
assert("[10] updateBasketSymbolNote returned record",       !!noted);
assert("[10] notes captured",                                noted.notes === "watching guidance");

const tagged = addBasketSymbolTag("storage_memory_data_movement", "PSTG", "earnings");
assert("[10] addBasketSymbolTag adds tag",
  tagged && tagged.tags && tagged.tags.includes("earnings"));
const tagged2 = addBasketSymbolTag("storage_memory_data_movement", "PSTG", "earnings");
assert("[10] addBasketSymbolTag is idempotent",
  tagged2.tags.filter((t) => t === "earnings").length === 1);
const untagged = removeBasketSymbolTag("storage_memory_data_movement", "PSTG", "earnings");
assert("[10] removeBasketSymbolTag drops tag",
  !untagged.tags.includes("earnings"));

// ============================================================
group("[11] corrupted localStorage recovers safely");
// ============================================================

const corrupted = makeMemoryBackend();
corrupted.setItem("te.basket.universe.v1", "{not valid json");
setBasketBackend(corrupted);

let safeUniverses = null;
try { safeUniverses = listBasketUniverses(); } catch { safeUniverses = "threw"; }
assert("[11] listBasketUniverses returns object after corruption",
  safeUniverses && typeof safeUniverses === "object" && !Array.isArray(safeUniverses));
const safeAdd = upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
assert("[11] upsert still works after corruption",          !!safeAdd);

// ============================================================
group("[12] active / watchlist / excluded mutually exclusive");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "WDC", {});
moveToWatchlist("storage_memory_data_movement", "WDC", "wait");
upsertBasketSymbol("storage_memory_data_movement", "WDC", { addedReason: "back_to_active" });
const u12a = getBasketUniverse("storage_memory_data_movement");
assert("[12] re-upsert pulled WDC back to active",
  u12a.activeUniverse.some((r) => r.symbol === "WDC"));
assert("[12] WDC no longer on watchlist",
  !u12a.watchlist.some((r) => r.symbol === "WDC"));
assert("[12] WDC not on excludedSymbols",
  !u12a.excludedSymbols.some((r) => r.symbol === "WDC"));

moveToExcluded("storage_memory_data_movement", "WDC", "concentration");
const u12b = getBasketUniverse("storage_memory_data_movement");
assert("[12] move-to-excluded pulled WDC out of activeUniverse",
  !u12b.activeUniverse.some((r) => r.symbol === "WDC"));
assert("[12] WDC only present on excludedSymbols",
  u12b.excludedSymbols.filter((r) => r.symbol === "WDC").length === 1 &&
  !u12b.activeUniverse.some((r) => r.symbol === "WDC") &&
  !u12b.watchlist.some((r) => r.symbol === "WDC"));

// ============================================================
group("[13] leader when MI / TE / CV constructive");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
const profile13 = getBasketAgent("storage_memory_data_movement");
const universe13 = getBasketUniverse("storage_memory_data_movement");
const ma13 = {
  SNDK: {
    trigger_engine: { stance: STANCE.CONSTRUCTIVE },
    credit_view:    { stance: STANCE.CONSTRUCTIVE },
    market_intel:   { stance: STANCE.CONSTRUCTIVE },
  },
};
const read13 = buildBasketLeadershipRead({
  basketProfile: profile13,
  basketUniverse: universe13,
  managerAssessmentsBySymbol: ma13,
});
assert("[13] SNDK classified as leader",
  read13.leaders.some((l) => l.symbol === "SNDK" && l.status === LEADERSHIP_STATUS.LEADER));
assert("[13] activeUniverse list includes SNDK",            read13.activeUniverse.includes("SNDK"));
assert("[13] basketConfidence = moderate",                  read13.basketConfidence === "moderate");
assert("[13] actionSummary mentions confirmed leader",      /confirmed leader/i.test(read13.actionSummary));

// ============================================================
group("[14] watch_only when thesis supportive + TE/CV missing");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
const ma14 = {
  SNDK: {
    market_intel: { stance: STANCE.CONSTRUCTIVE },
    trigger_engine: { stance: STANCE.UNAVAILABLE },
    credit_view: { stance: STANCE.UNAVAILABLE },
  },
};
const read14 = buildBasketLeadershipRead({
  basketProfile: getBasketAgent("storage_memory_data_movement"),
  basketUniverse: getBasketUniverse("storage_memory_data_movement"),
  managerAssessmentsBySymbol: ma14,
});
assert("[14] SNDK classified as watch_only",
  read14.watchOnly.some((w) => w.symbol === "SNDK" && w.status === LEADERSHIP_STATUS.WATCH_ONLY));
assert("[14] read mentions 'TE/CV confirmation missing'",
  read14.watchOnly.some((w) => /TE\/CV confirmation missing|timing incomplete/i.test(w.read)));

// ============================================================
group("[15] fading_leader when TE+CV cautious");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "MU", {});
const ma15 = {
  MU: {
    trigger_engine: { stance: STANCE.CAUTIOUS },
    credit_view:    { stance: STANCE.CAUTIOUS },
    market_intel:   { stance: STANCE.CONSTRUCTIVE },
  },
};
const read15 = buildBasketLeadershipRead({
  basketProfile: getBasketAgent("storage_memory_data_movement"),
  basketUniverse: getBasketUniverse("storage_memory_data_movement"),
  managerAssessmentsBySymbol: ma15,
});
assert("[15] MU classified as fading_leader",
  read15.fadingNames.some((f) => f.symbol === "MU" && f.status === LEADERSHIP_STATUS.FADING_LEADER));
assert("[15] suggestedRemovals includes MU",
  read15.suggestedRemovals.some((r) => r.symbol === "MU"));

// ============================================================
group("[16] excluded symbols do NOT appear as leaders");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
moveToExcluded("storage_memory_data_movement", "SNDK", "concentration_risk");
const ma16 = {
  SNDK: {
    trigger_engine: { stance: STANCE.CONSTRUCTIVE },
    credit_view:    { stance: STANCE.CONSTRUCTIVE },
    market_intel:   { stance: STANCE.CONSTRUCTIVE },
  },
};
const read16 = buildBasketLeadershipRead({
  basketProfile: getBasketAgent("storage_memory_data_movement"),
  basketUniverse: getBasketUniverse("storage_memory_data_movement"),
  managerAssessmentsBySymbol: ma16,
});
assert("[16] SNDK does NOT appear in leaders",
  !read16.leaders.some((l) => l.symbol === "SNDK"));
assert("[16] SNDK does NOT appear in active universe array",
  !read16.activeUniverse.includes("SNDK"));
assert("[16] SNDK does NOT appear in watchOnly",
  !read16.watchOnly.some((w) => w.symbol === "SNDK"));

// ============================================================
group("[17] missed_winner history → over-conservatism note");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "WDC", {});
const ma17 = {
  WDC: {
    market_intel: { stance: STANCE.CONSTRUCTIVE },
    trigger_engine: { stance: STANCE.UNAVAILABLE },
    credit_view: { stance: STANCE.UNAVAILABLE },
  },
};
const history17 = { WDC: { outcome: { status: "missed_winner" } } };
const read17 = buildBasketLeadershipRead({
  basketProfile: getBasketAgent("storage_memory_data_movement"),
  basketUniverse: getBasketUniverse("storage_memory_data_movement"),
  managerAssessmentsBySymbol: ma17,
  historyBySymbol: history17,
});
const wdcRead = read17.watchOnly.find((w) => w.symbol === "WDC")?.read;
assert("[17] WDC read mentions missed winner / over-conservatism",
  /missed winner|over.conservat/i.test(wdcRead || ""));

// ============================================================
group("[18] avoided_correctly history → caution-validation note");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "STX", {});
const ma18 = {
  STX: {
    trigger_engine: { stance: STANCE.CAUTIOUS },
    credit_view: { stance: STANCE.CAUTIOUS },
    market_intel: { stance: STANCE.CAUTIOUS },
  },
};
const history18 = { STX: { outcome: { status: "avoided_correctly" } } };
const read18 = buildBasketLeadershipRead({
  basketProfile: getBasketAgent("storage_memory_data_movement"),
  basketUniverse: getBasketUniverse("storage_memory_data_movement"),
  managerAssessmentsBySymbol: ma18,
  historyBySymbol: history18,
});
const stxRead = read18.fadingNames.find((f) => f.symbol === "STX")?.read;
assert("[18] STX read mentions caution validated / avoided correctly",
  /avoided correctly|caution may have been appropriate|caution validated/i.test(stxRead || ""));

// ============================================================
group("[19] no raw scores / weights / coefficients leak");
// ============================================================

const allBlobs = [read13, read14, read15, read16, read17, read18]
  .map((r) => JSON.stringify(r));
for (const [i, blob] of allBlobs.entries()) {
  assert(`[19] read[${i}] no \"score\":N`,        !/"score"\s*:\s*-?\d/.test(blob));
  assert(`[19] read[${i}] no \"weight\" key`,     !/"weight"\s*:/.test(blob));
  assert(`[19] read[${i}] no \"coefficient\"`,    !/coefficient/i.test(blob));
  assert(`[19] read[${i}] no \"w_\" prefix`,      !/"w_/.test(blob));
}

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetBasketBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
