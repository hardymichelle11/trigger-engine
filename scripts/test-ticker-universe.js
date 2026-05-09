#!/usr/bin/env node
// =====================================================
// Ticker Universe — engine-layer tests
// Run: npm run test:ticker-universe
//
// Covers the eight cases the spec called out:
//   1. symbol normalization
//   2. dynamic ticker upsert/remove
//   3. deduping static catalog vs dynamic basket
//   4. source priority (static > dynamic > LB > ad-hoc)
//   5. uncataloged ticker resolves as ad_hoc_simulation
//   6. dynamic basket ticker can be scannerEligible
//   7. Credit View limited mode when options chain unavailable
//   8. TE simulation blocked gracefully when Polygon quote/bars unavailable
// =====================================================

import {
  TICKER_SOURCE_TYPES,
  CATALOG_STATUS,
  ANALYSIS_MODES,
  SOURCE_PRIORITY,
  normalizeSymbol,
  makeTickerRecord,
} from "../src/lib/universe/tickerUniverseTypes.js";
import {
  setUniverseBackend,
  resetUniverseBackend,
  upsertDynamicTicker,
  getDynamicTicker,
  removeDynamicTicker,
  clearDynamicUniverse,
  setScannerEligible,
  addBasketTag,
  removeBasketTag,
  listBySource,
  listScannerEligible,
} from "../src/lib/universe/dynamicUniverseStore.js";
import {
  resolveTickerUniverse,
  resolveTickerUniverseBatch,
  isCatalogTicker,
} from "../src/lib/universe/resolveTickerUniverse.js";
import { simulateAdHoc } from "../src/lib/universe/adHocSimulationService.js";

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

// In-memory storage backend for the suite — isolates tests from the
// real localStorage and from one another.
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
  setUniverseBackend(makeMemoryBackend());
  clearDynamicUniverse();
}

// ============================================================
group("[1] symbol normalization");
// ============================================================

assert("'aapl' → 'AAPL'",                   normalizeSymbol("aapl") === "AAPL");
assert("'  AAPL  ' → 'AAPL'",               normalizeSymbol("  AAPL  ") === "AAPL");
assert("'aapl,' (trailing punct) → 'AAPL'", normalizeSymbol("aapl,") === "AAPL");
assert("'BRK.B' is preserved",              normalizeSymbol("BRK.B") === "BRK.B");
assert("'BF.B' is preserved",               normalizeSymbol("BF.B") === "BF.B");
assert("number 0 → null",                   normalizeSymbol(0) === null);
assert("empty string → null",               normalizeSymbol("") === null);
assert("null → null",                       normalizeSymbol(null) === null);
assert("undefined → null",                  normalizeSymbol(undefined) === null);
assert("non-ticker chars → null",           normalizeSymbol("hello world!") === null);
assert("digits-only → null",                normalizeSymbol("12345") === null);

// ============================================================
group("[2] dynamic ticker upsert / remove");
// ============================================================
reset();

const up = upsertDynamicTicker({
  symbol: "tem",
  sourceType: TICKER_SOURCE_TYPES.AD_HOC_SIMULATION,
  addedReason: "user typed",
});
assert("upsert returns record with normalized symbol", up && up.symbol === "TEM");
assert("upsert sets sourceType",                      up.sourceType === TICKER_SOURCE_TYPES.AD_HOC_SIMULATION);
assert("upsert sets addedAt",                         typeof up.addedAt === "number");
assert("upsert preserves addedReason",                up.addedReason === "user typed");

const fetched = getDynamicTicker("TEM");
assert("getDynamicTicker fetches by normalized symbol", fetched && fetched.symbol === "TEM");

// Re-upsert merges, doesn't overwrite addedAt.
const up2 = upsertDynamicTicker({
  symbol: "TEM",
  sourceType: TICKER_SOURCE_TYPES.DYNAMIC_BASKET,
  notes: "vol-rich",
});
assert("re-upsert merges notes",         up2.notes === "vol-rich");
assert("re-upsert escalates sourceType", up2.sourceType === TICKER_SOURCE_TYPES.DYNAMIC_BASKET);
assert("re-upsert preserves addedAt",    up2.addedAt === up.addedAt);

const removed = removeDynamicTicker("TEM");
assert("remove returns true", removed === true);
assert("remove leaves nothing", getDynamicTicker("TEM") === null);
assert("remove of absent symbol returns false", removeDynamicTicker("ZZZ") === false);

// Tags
reset();
upsertDynamicTicker({ symbol: "ALAB", sourceType: TICKER_SOURCE_TYPES.DYNAMIC_BASKET });
const tagged = addBasketTag("alab", "earnings");
assert("addBasketTag stores tag", tagged.basketTags.includes("earnings"));
assert("addBasketTag is idempotent",
  addBasketTag("alab", "earnings").basketTags.filter((t) => t === "earnings").length === 1);
const untagged = removeBasketTag("alab", "earnings");
assert("removeBasketTag drops tag", !untagged.basketTags.includes("earnings"));

// ============================================================
group("[3] dedupe — static catalog vs dynamic basket");
// ============================================================
reset();

// AAPL is in the static watchlist (verified during repo audit).
upsertDynamicTicker({
  symbol: "AAPL",
  sourceType: TICKER_SOURCE_TYPES.DYNAMIC_BASKET,
  basketTags: ["wheel"],
});
const resolved = resolveTickerUniverse("AAPL");
assert("AAPL resolves",                                  resolved && resolved.symbol === "AAPL");
assert("AAPL resolves with STATIC_CATALOG canonical",    resolved.sourceType === TICKER_SOURCE_TYPES.STATIC_CATALOG);
assert("AAPL catalogStatus = cataloged",                 resolved.catalogStatus === CATALOG_STATUS.CATALOGED);
assert("AAPL appearances includes both sources",
  resolved.appearances.some((a) => a.sourceType === TICKER_SOURCE_TYPES.STATIC_CATALOG) &&
  resolved.appearances.some((a) => a.sourceType === TICKER_SOURCE_TYPES.DYNAMIC_BASKET));
assert("AAPL preserves basketTags from dynamic store", resolved.basketTags.includes("wheel"));
assert("isCatalogTicker('AAPL') = true",  isCatalogTicker("AAPL") === true);
assert("isCatalogTicker('TEM') = false",  isCatalogTicker("TEM") === false);

// resolveTickerUniverseBatch dedupes.
reset();
upsertDynamicTicker({ symbol: "TEM", sourceType: TICKER_SOURCE_TYPES.DYNAMIC_BASKET });
const batch = resolveTickerUniverseBatch(["AAPL", "aapl", "  AAPL  ", "TEM", "ZZZ"]);
assert("batch dedupes case + whitespace",
  batch.filter((r) => r.symbol === "AAPL").length === 1);
assert("batch contains TEM",  batch.some((r) => r.symbol === "TEM"));
assert("batch contains ZZZ as ad-hoc",
  batch.some((r) => r.symbol === "ZZZ" && r.sourceType === TICKER_SOURCE_TYPES.AD_HOC_SIMULATION));

// ============================================================
group("[4] source priority");
// ============================================================
reset();

assert("priority order: STATIC > DYNAMIC > LB > AD_HOC",
  SOURCE_PRIORITY[TICKER_SOURCE_TYPES.STATIC_CATALOG] >
  SOURCE_PRIORITY[TICKER_SOURCE_TYPES.DYNAMIC_BASKET]   &&
  SOURCE_PRIORITY[TICKER_SOURCE_TYPES.DYNAMIC_BASKET]   >
  SOURCE_PRIORITY[TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT] &&
  SOURCE_PRIORITY[TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT] >
  SOURCE_PRIORITY[TICKER_SOURCE_TYPES.AD_HOC_SIMULATION],
);

// LB prospect promoted to dynamic basket — sourceType escalates.
reset();
upsertDynamicTicker({
  symbol: "INOD",
  sourceType: TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT,
});
let r = resolveTickerUniverse("INOD");
assert("INOD as LB prospect → catalogStatus = prospect", r.catalogStatus === CATALOG_STATUS.PROSPECT);
assert("INOD sourceType is LB", r.sourceType === TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT);

upsertDynamicTicker({
  symbol: "INOD",
  sourceType: TICKER_SOURCE_TYPES.DYNAMIC_BASKET,
});
r = resolveTickerUniverse("INOD");
assert("INOD now resolves as DYNAMIC_BASKET (priority over LB)",
  r.sourceType === TICKER_SOURCE_TYPES.DYNAMIC_BASKET);

// ============================================================
group("[5] uncataloged ticker resolves as ad_hoc_simulation");
// ============================================================
reset();

const adhoc = resolveTickerUniverse("ZQXNEW");
assert("uncataloged ticker resolves",                     adhoc && adhoc.symbol === "ZQXNEW");
assert("uncataloged → AD_HOC_SIMULATION",                 adhoc.sourceType === TICKER_SOURCE_TYPES.AD_HOC_SIMULATION);
assert("uncataloged → catalogStatus uncataloged",         adhoc.catalogStatus === CATALOG_STATUS.UNCATALOGED);
assert("uncataloged → engineEligibility.triggerEngine = true",
  adhoc.engineEligibility.triggerEngine === true);
assert("uncataloged → engineEligibility.creditView = false (no options data yet)",
  adhoc.engineEligibility.creditView === false);
assert("uncataloged → engineEligibility.lethalBoard = false",
  adhoc.engineEligibility.lethalBoard === false);
assert("uncataloged → not scannerEligible",               adhoc.scannerEligible === false);
assert("uncataloged → catalogMeta is null",               adhoc.catalogMeta === null);

// ============================================================
group("[6] dynamic basket ticker can be scannerEligible");
// ============================================================
reset();

upsertDynamicTicker({
  symbol: "ALAB",
  sourceType: TICKER_SOURCE_TYPES.DYNAMIC_BASKET,
  addedReason: "manual",
});
let alab = resolveTickerUniverse("ALAB");
assert("ALAB starts not scannerEligible", alab.scannerEligible === false);

const promoted = setScannerEligible("ALAB", true);
assert("setScannerEligible returns updated record", promoted && promoted.scannerEligible === true);
assert("setScannerEligible flips promoted = true",  promoted.promoted === true);

alab = resolveTickerUniverse("ALAB");
assert("ALAB now scannerEligible",                  alab.scannerEligible === true);
assert("listScannerEligible() includes ALAB",
  listScannerEligible().some((r) => r.symbol === "ALAB"));

// listBySource filtering.
reset();
upsertDynamicTicker({ symbol: "AAA", sourceType: TICKER_SOURCE_TYPES.DYNAMIC_BASKET });
upsertDynamicTicker({ symbol: "BBB", sourceType: TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT });
upsertDynamicTicker({ symbol: "CCC", sourceType: TICKER_SOURCE_TYPES.AD_HOC_SIMULATION });
assert("listBySource(DYNAMIC_BASKET) = 1",
  listBySource(TICKER_SOURCE_TYPES.DYNAMIC_BASKET).length === 1);
assert("listBySource(LB) = 1",
  listBySource(TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT).length === 1);
assert("listBySource(AD_HOC) = 1",
  listBySource(TICKER_SOURCE_TYPES.AD_HOC_SIMULATION).length === 1);

// ============================================================
group("[7] Credit View limited mode (no options chain)");
// ============================================================
reset();

const fakeQuoteOnly = async () => ({ TEST: { symbol: "TEST", price: 25.0, previousClose: 24.5, percentChange: 2.04 } });

const limitedSim = await simulateAdHoc("TEST", {
  providers: { fetchQuotes: fakeQuoteOnly /* no fetchOptionsChain */ },
  persist: false,
});
assert("simulation completed", !!limitedSim && limitedSim.symbol === "TEST");
assert("analysisMode = AD_HOC_TE_SIMULATION when no options chain",
  limitedSim.analysisMode === ANALYSIS_MODES.AD_HOC_TE_SIMULATION);
assert("dataAvailability.optionsChain = false", limitedSim.dataAvailability.optionsChain === false);
assert("creditView is in limited mode",         limitedSim.creditView.limited === true);
assert("creditView.reason mentions options chain unavailable",
  /options chain data unavailable/i.test(limitedSim.creditView.reason || ""));
assert("creditView.label = 'Ad Hoc Credit Simulation (limited)'",
  limitedSim.creditView.label === "Ad Hoc Credit Simulation (limited)");
assert("creditView.result is null in limited mode",  limitedSim.creditView.result === null);
assert("triggerEngine.ok = true (had quote)",        limitedSim.triggerEngine.ok === true);

// ============================================================
group("[8] TE simulation blocked gracefully (no quote / no bars)");
// ============================================================
reset();

const fakeAllUnavailable = async () => ({});  // empty map
const blockedSim = await simulateAdHoc("ZZZNOPE", {
  providers: { fetchQuotes: fakeAllUnavailable },
  persist: false,
});
assert("simulation returned a result object even with no data",
  !!blockedSim && blockedSim.symbol === "ZZZNOPE");
assert("triggerEngine.ok = false when both quote+bars missing",
  blockedSim.triggerEngine.ok === false);
assert("triggerEngine.reason mentions quote/bars unavailable",
  /quote.*bars|bars.*quote/i.test(blockedSim.triggerEngine.reason || ""));
assert("creditView is also limited",       blockedSim.creditView.limited === true);
assert("dataAvailability.polygonQuote = false", blockedSim.dataAvailability.polygonQuote === false);
assert("dataAvailability.polygonBars  = false", blockedSim.dataAvailability.polygonBars === false);

// Bonus: invalid symbol path.
const invalid = await simulateAdHoc("hello world!", { persist: false });
assert("invalid symbol returns failure shape",
  invalid && invalid.triggerEngine.ok === false);
assert("invalid symbol failure reason mentions ticker",
  /invalid ticker|ticker symbol/i.test(invalid.triggerEngine.reason || ""));

// ============================================================
group("[9] makeTickerRecord defaults");
// ============================================================

const def = makeTickerRecord({ symbol: "TEST" });
assert("default sourceType = AD_HOC_SIMULATION",  def.sourceType === TICKER_SOURCE_TYPES.AD_HOC_SIMULATION);
assert("default catalogStatus = uncataloged",     def.catalogStatus === CATALOG_STATUS.UNCATALOGED);
assert("default engineEligibility.triggerEngine = true",  def.engineEligibility.triggerEngine === true);
assert("default engineEligibility.creditView = false",     def.engineEligibility.creditView === false);
assert("default basketTags is array",             Array.isArray(def.basketTags));

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetUniverseBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
