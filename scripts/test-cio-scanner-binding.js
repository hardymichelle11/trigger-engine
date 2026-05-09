#!/usr/bin/env node
// =====================================================
// CIO Basket → Scanner binding tests
// Run: npm run test:cio-scanner-binding
//
// Acceptance gates per spec:
//   1. Selected CIO basket resolves active symbols only.
//   2. Baseline leaders are not included unless seeded to active.
//   3. Watchlist names are not included.
//   4. Excluded names are not included.
//   5. All CIO baskets resolves active symbols across baskets.
//   6. All CIO baskets dedupes overlapping symbols.
//   7. Empty selected CIO basket returns safe no-scan state.
//   8. Existing Core Catalog behavior unchanged.
//   9. Existing Dynamic Basket behavior unchanged.
//  10. Existing Manual Ticker List behavior unchanged.
//  11. Combined Universe behavior unchanged unless CIO baskets are
//      explicitly included.
//  12. sourceType is cio_basket_active_universe.
//  13. Rendered UniverseSelector includes CIO Basket and All CIO
//      Baskets options.
//  14. No raw scores / weights / coefficients in UI.
//  15. Existing tests remain green (verified separately).
//  16. Production build clean (verified separately).
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  setBasketBackend,
  resetBasketBackend,
  upsertBasketSymbol,
  moveToWatchlist,
  moveToExcluded,
  clearAllBasketUniverses,
  seedBaselineLeaders,
} from "../src/lib/portfolioCio/basketUniverseManager.js";
import { getBasketAgent } from "../src/lib/portfolioCio/basketAgentRegistry.js";
import { TICKER_SOURCE_TYPES } from "../src/lib/universe/tickerUniverseTypes.js";

// UniverseSelector lives in a .jsx file → dynamic import after register.
const {
  resolveScanSymbols,
  resolveCioBasketSymbols,
  resolveAllCioBasketSymbols,
  buildCioBasketRecords,
  UNIVERSE_OPTIONS,
  default: UniverseSelector,
} = await import("../src/components/scanner/UniverseSelector.jsx");

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
  setBasketBackend(makeMemoryBackend());
  clearAllBasketUniverses();
}

// ============================================================
group("[1] selected CIO basket resolves active symbols only");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "SNDK", { addedReason: "manual" });
upsertBasketSymbol("storage_memory_data_movement", "WDC",  { addedReason: "manual" });
const symbols1 = resolveCioBasketSymbols("storage_memory_data_movement");
assert("[1] resolveCioBasketSymbols returns array",        Array.isArray(symbols1));
assert("[1] returns 2 symbols",                            symbols1.length === 2);
assert("[1] includes SNDK",                                symbols1.includes("SNDK"));
assert("[1] includes WDC",                                 symbols1.includes("WDC"));

const resolved1 = resolveScanSymbols({
  selected: ["cio_basket"],
  cioBasketSymbols: symbols1,
  // Provide other lists to confirm only CIO basket symbols flow through.
  coreCatalogSymbols: ["AAPL", "MSFT"],
  dynamicBasketSymbols: ["TSLA"],
  manualList: "ZZZ",
});
assert("[1] resolveScanSymbols returns only CIO basket symbols",
  resolved1.length === 2 && resolved1.includes("SNDK") && resolved1.includes("WDC"));
assert("[1] resolveScanSymbols excludes Core Catalog when only cio_basket selected",
  !resolved1.includes("AAPL") && !resolved1.includes("MSFT"));
assert("[1] resolveScanSymbols excludes Dynamic Basket when only cio_basket selected",
  !resolved1.includes("TSLA"));
assert("[1] resolveScanSymbols excludes Manual list when only cio_basket selected",
  !resolved1.includes("ZZZ"));

// ============================================================
group("[2] baseline leaders are NOT included unless seeded to active");
// ============================================================
reset();

const profile = getBasketAgent("storage_memory_data_movement");
assert("[2] profile has baseline leaders",                 profile.baselineLeaders.length > 0);
const symbols2 = resolveCioBasketSymbols("storage_memory_data_movement");
assert("[2] resolveCioBasketSymbols returns [] when nothing seeded",
  Array.isArray(symbols2) && symbols2.length === 0);
for (const sym of profile.baselineLeaders) {
  assert(`[2] baseline leader ${sym} NOT in resolved symbols`,
    !symbols2.includes(sym));
}

// After seeding only some, only those appear.
upsertBasketSymbol("storage_memory_data_movement", "SNDK", { addedReason: "baseline_anchor" });
upsertBasketSymbol("storage_memory_data_movement", "MU",   { addedReason: "baseline_anchor" });
const symbols2b = resolveCioBasketSymbols("storage_memory_data_movement");
assert("[2] only seeded baseline names show (SNDK + MU)",
  symbols2b.length === 2 && symbols2b.includes("SNDK") && symbols2b.includes("MU"));
assert("[2] WDC + STX baseline (not seeded) absent",
  !symbols2b.includes("WDC") && !symbols2b.includes("STX"));

// Seed All puts every baseline into active.
reset();
seedBaselineLeaders("storage_memory_data_movement");
const symbols2c = resolveCioBasketSymbols("storage_memory_data_movement");
assert("[2] after seedBaselineLeaders → all baseline names active",
  symbols2c.length === profile.baselineLeaders.length);

// ============================================================
group("[3] watchlist names are NOT included");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
upsertBasketSymbol("storage_memory_data_movement", "WDC",  {});
moveToWatchlist("storage_memory_data_movement", "WDC", "needs_confirmation");
const symbols3 = resolveCioBasketSymbols("storage_memory_data_movement");
assert("[3] resolved symbols length = 1 (WDC moved to watchlist)",
  symbols3.length === 1);
assert("[3] SNDK still in resolved",                       symbols3.includes("SNDK"));
assert("[3] WDC absent (on watchlist)",                    !symbols3.includes("WDC"));

// ============================================================
group("[4] excluded names are NOT included");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
upsertBasketSymbol("storage_memory_data_movement", "MU",   {});
moveToExcluded("storage_memory_data_movement", "MU", "concentration_risk");
const symbols4 = resolveCioBasketSymbols("storage_memory_data_movement");
assert("[4] resolved length = 1 (MU excluded)",            symbols4.length === 1);
assert("[4] MU absent (excluded)",                         !symbols4.includes("MU"));

// ============================================================
group("[5] all CIO baskets resolves active symbols across baskets");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
upsertBasketSymbol("storage_memory_data_movement", "WDC",  {});
upsertBasketSymbol("cooling_hvac_building",        "CARR", {});
upsertBasketSymbol("ai_health_diagnostics",        "TEM",  {});
upsertBasketSymbol("robotics_automation",          "TSLA", {});

const all5 = resolveAllCioBasketSymbols();
assert("[5] all-baskets returns 5 symbols",                all5.length === 5);
for (const sym of ["SNDK", "WDC", "CARR", "TEM", "TSLA"]) {
  assert(`[5] all-baskets includes ${sym}`,                all5.includes(sym));
}

const resolved5 = resolveScanSymbols({
  selected: ["all_cio_baskets"],
  allCioBasketSymbols: all5,
  cioBasketSymbols: ["SHOULD_BE_IGNORED"],
  coreCatalogSymbols: ["AAPL"],
});
assert("[5] resolveScanSymbols(all_cio_baskets) returns only the union",
  resolved5.length === 5 && resolved5.includes("SNDK") &&
  !resolved5.includes("AAPL") && !resolved5.includes("SHOULD_BE_IGNORED"));

// ============================================================
group("[6] all CIO baskets dedupes overlapping symbols");
// ============================================================
reset();

// SNDK appears in two baskets with different metadata; the union must
// surface it once.
upsertBasketSymbol("storage_memory_data_movement", "SNDK", { addedReason: "primary" });
upsertBasketSymbol("data_center_infra",            "SNDK", { addedReason: "secondary" });
upsertBasketSymbol("storage_memory_data_movement", "WDC",  {});
const all6 = resolveAllCioBasketSymbols();
assert("[6] union dedupes SNDK → length = 2 (SNDK + WDC)", all6.length === 2);
assert("[6] union contains SNDK",                          all6.includes("SNDK"));
assert("[6] union contains WDC",                           all6.includes("WDC"));

// ============================================================
group("[7] empty selected CIO basket → safe no-scan state");
// ============================================================
reset();

const emptyBasketSyms = resolveCioBasketSymbols("ai_health_diagnostics");
assert("[7] empty basket returns []",                       Array.isArray(emptyBasketSyms) && emptyBasketSyms.length === 0);
const resolvedEmpty = resolveScanSymbols({
  selected: ["cio_basket"],
  cioBasketSymbols: emptyBasketSyms,
  coreCatalogSymbols: ["NEVER_SCAN"],
});
assert("[7] resolveScanSymbols on empty CIO basket returns []",
  Array.isArray(resolvedEmpty) && resolvedEmpty.length === 0);
assert("[7] does NOT fall back to Core Catalog",            !resolvedEmpty.includes("NEVER_SCAN"));

// Empty all-baskets is also safe.
const all7 = resolveAllCioBasketSymbols();
assert("[7] empty all-baskets returns []",                  all7.length === 0);
const resolvedAllEmpty = resolveScanSymbols({
  selected: ["all_cio_baskets"],
  allCioBasketSymbols: all7,
  coreCatalogSymbols: ["NEVER_SCAN"],
});
assert("[7] resolveScanSymbols on empty all-baskets returns []",
  resolvedAllEmpty.length === 0);

// ============================================================
group("[8–10] existing Core / Dynamic / Manual behavior unchanged");
// ============================================================
reset();

const core8 = resolveScanSymbols({
  selected: ["core_catalog"],
  coreCatalogSymbols: ["SPY", "QQQ", "AAPL", "MSFT"],
  dynamicBasketSymbols: ["TEM"],
  cioBasketSymbols: ["SHOULD_NOT_APPEAR"],
});
assert("[8] core_catalog returns only core list",
  core8.length === 4 && !core8.includes("TEM") &&
  !core8.includes("SHOULD_NOT_APPEAR"));

const dyn9 = resolveScanSymbols({
  selected: ["dynamic_basket"],
  coreCatalogSymbols: ["AAPL"],
  dynamicBasketSymbols: ["TEM", "ALAB"],
  cioBasketSymbols: ["SHOULD_NOT_APPEAR"],
});
assert("[9] dynamic_basket returns only dynamic list",
  dyn9.length === 2 && dyn9.includes("TEM") && dyn9.includes("ALAB") &&
  !dyn9.includes("AAPL") && !dyn9.includes("SHOULD_NOT_APPEAR"));

const manual10 = resolveScanSymbols({
  selected: ["manual_ticker_list"],
  manualList: "TEM, ALAB, INOD",
  coreCatalogSymbols: ["AAPL"],
  cioBasketSymbols: ["SHOULD_NOT_APPEAR"],
});
assert("[10] manual_ticker_list returns only manual",
  manual10.length === 3 && manual10.includes("TEM") && manual10.includes("ALAB") &&
  manual10.includes("INOD") && !manual10.includes("AAPL") &&
  !manual10.includes("SHOULD_NOT_APPEAR"));

// ============================================================
group("[11] Combined Universe — unchanged unless CIO baskets explicit");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
const allCio = resolveAllCioBasketSymbols();

// Combined WITHOUT cio_basket / all_cio_baskets selected — we still
// pass the cio symbol arrays in case the caller pre-fetched, but the
// combined mode will pick them up because combined unions everything.
const combined11 = resolveScanSymbols({
  selected: ["combined"],
  coreCatalogSymbols: ["AAPL", "MSFT"],
  dynamicBasketSymbols: ["TEM"],
  lethalBoardSymbols: ["INOD"],
  manualList: "ZZZ",
  cioBasketSymbols: ["BAS_SINGLE"],
  allCioBasketSymbols: allCio,
});
assert("[11] combined includes core + dynamic + LB + manual",
  combined11.includes("AAPL") && combined11.includes("MSFT") &&
  combined11.includes("TEM") && combined11.includes("INOD") &&
  combined11.includes("ZZZ"));
assert("[11] combined includes CIO basket union when supplied",
  combined11.includes("SNDK"));
assert("[11] combined dedupes",
  combined11.filter((s) => s === "SNDK").length === 1);

// Without combined or cio_basket selected, CIO symbols stay out.
const noCio = resolveScanSymbols({
  selected: ["core_catalog"],
  coreCatalogSymbols: ["AAPL"],
  cioBasketSymbols: ["BAS_SINGLE"],
  allCioBasketSymbols: ["BAS_UNION"],
});
assert("[11] core_catalog alone does NOT include CIO basket symbols",
  !noCio.includes("BAS_SINGLE") && !noCio.includes("BAS_UNION"));

// ============================================================
group("[12] sourceType = cio_basket_active_universe");
// ============================================================

assert("[12] TICKER_SOURCE_TYPES.CIO_BASKET_ACTIVE_UNIVERSE = 'cio_basket_active_universe'",
  TICKER_SOURCE_TYPES.CIO_BASKET_ACTIVE_UNIVERSE === "cio_basket_active_universe");
assert("[12] UNIVERSE_OPTIONS.CIO_BASKET.sourceType = cio_basket_active_universe",
  UNIVERSE_OPTIONS.CIO_BASKET.sourceType === TICKER_SOURCE_TYPES.CIO_BASKET_ACTIVE_UNIVERSE);
assert("[12] UNIVERSE_OPTIONS.ALL_CIO_BASKETS.sourceType = cio_basket_active_universe",
  UNIVERSE_OPTIONS.ALL_CIO_BASKETS.sourceType === TICKER_SOURCE_TYPES.CIO_BASKET_ACTIVE_UNIVERSE);

reset();
upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
const records = buildCioBasketRecords("storage_memory_data_movement");
assert("[12] buildCioBasketRecords returns 1 record",       records.length === 1);
assert("[12] record.symbol = SNDK",                         records[0].symbol === "SNDK");
assert("[12] record.sourceType = cio_basket_active_universe",
  records[0].sourceType === TICKER_SOURCE_TYPES.CIO_BASKET_ACTIVE_UNIVERSE);
assert("[12] record.scannerEligible = true",                records[0].scannerEligible === true);
assert("[12] record.basketId set",                          records[0].basketId === "storage_memory_data_movement");
assert("[12] record.basketName set",                        records[0].basketName === "Storage / Memory / Data Movement");
assert("[12] record.catalogStatus = promoted",              records[0].catalogStatus === "promoted");

// ============================================================
group("[13] UniverseSelector renders CIO Basket + All CIO Baskets options");
// ============================================================

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
function renderSafe(name, Component, props) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(Component, props)) }; }
  catch (err) { return { ok: false, err }; }
}

const baseRender = renderSafe("UniverseSelector default", UniverseSelector, {
  selected: ["core_catalog"],
});
assert("[13] UniverseSelector renders without throwing",    baseRender.ok, baseRender.err?.message);
const baseHtml = baseRender.html || "";
assert("[13] HTML lists 'CIO Basket' chip",                 />\s*CIO Basket\s*</.test(baseHtml));
assert("[13] HTML lists 'All CIO Baskets' chip",            /All CIO Baskets/.test(baseHtml));
assert("[13] HTML lists existing 'Core Catalog' chip (untouched)",
  /Core Catalog/.test(baseHtml));
assert("[13] HTML lists existing 'Dynamic Basket' chip (untouched)",
  /Dynamic Basket/.test(baseHtml));

// When cio_basket is active, the basket dropdown appears.
reset();
upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
const cioRender = renderSafe("UniverseSelector cio_basket on", UniverseSelector, {
  selected: ["cio_basket"],
  selectedCioBasketId: "storage_memory_data_movement",
});
const cioHtml = cioRender.html || "";
assert("[13] basket sub-selector visible when cio_basket active",
  /CIO BASKET[\s\S]*?<select/.test(cioHtml));
assert("[13] basket dropdown lists Storage / Memory option",
  /Storage \/ Memory \/ Data Movement/.test(cioHtml));
assert("[13] sub-selector subtitle copy matches spec",
  /Scans active names only\. Baseline leaders, watchlist, and excluded names are not scanned/.test(cioHtml));

// When all_cio_baskets is on, only the helper text shows.
const allRender = renderSafe("UniverseSelector all_cio_baskets on", UniverseSelector, {
  selected: ["all_cio_baskets"],
});
const allHtml = allRender.html || "";
assert("[13] all_cio_baskets helper text matches spec",
  /Scans active universes across all CIO basket agents/.test(allHtml));

// ============================================================
group("[14] no raw scores / weights / coefficients in UI HTML");
// ============================================================

for (const [name, html] of [["base", baseHtml], ["cio", cioHtml], ["all", allHtml]]) {
  assert(`[14] ${name}: no \"score\":N`,            !/"score"\s*:\s*-?\d/.test(html));
  assert(`[14] ${name}: no \"weight\":N`,           !/"weight"\s*:/.test(html));
  assert(`[14] ${name}: no coefficient token`,      !/coefficient/i.test(html));
}

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetBasketBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
