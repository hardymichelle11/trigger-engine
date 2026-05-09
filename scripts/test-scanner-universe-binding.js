#!/usr/bin/env node
// =====================================================
// Scanner ↔ Universe binding — tests
// Run: npm run test:scanner-universe-binding
//
// Pins the wiring between the operator's universe selection (chips +
// manual ticker list) and runDiscoveryScan. Acceptance gates per spec:
//
//   - Core Catalog resolves the static symbol set.
//   - Dynamic Basket filters scannerEligible symbols only.
//   - Manual Ticker List normalizes comma-separated input.
//   - Combined Universe dedupes symbols across all sources.
//   - Empty universe returns a safe no-scan state (no fallback to the
//     static catalog).
//   - runDiscoveryScan honours options.symbols rather than the default
//     candidate selection when a non-core universe is selected.
// =====================================================

import { register } from "node:module";

// Install the JSX-aware loader so UniverseSelector.jsx can be imported
// in plain Node. Must run before the dynamic import of any .jsx module.
register("./jsx-hooks.mjs", import.meta.url);

const { resolveScanSymbols, parseManualTickerList } = await import(
  "../src/components/scanner/UniverseSelector.jsx"
);
import {
  setUniverseBackend,
  resetUniverseBackend,
  upsertDynamicTicker,
  setScannerEligible,
  clearDynamicUniverse,
} from "../src/lib/universe/dynamicUniverseStore.js";
import { TICKER_SOURCE_TYPES } from "../src/lib/universe/tickerUniverseTypes.js";
import { runDiscoveryScan } from "../src/lib/discoveryScanner.js";

// Stub fetch so the snapshot calls inside runDiscoveryScan don't try
// to reach Polygon. Returning ok:false makes every snapshot null;
// downstream buildDiscoverySetups skips nulls and the test still
// asserts the binding (scannedSymbols / universeMode) without needing
// real market data.
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });

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
}

const FIXED_CORE = ["SPY", "QQQ", "IWM", "AAPL", "MSFT"];
const FIXED_LB   = ["INOD", "BE"];

// ============================================================
group("[1] Core Catalog mode resolves to core symbols");
// ============================================================
reset();

const coreResolved = resolveScanSymbols({
  selected: ["core_catalog"],
  coreCatalogSymbols: FIXED_CORE,
  dynamicBasketSymbols: ["TEM"],          // present but should be ignored
  lethalBoardSymbols:   ["INOD"],         // present but should be ignored
  manualList: "ZZZNEW",                    // present but should be ignored
});
assert(
  "core_catalog returns exactly the core list",
  arrayEqualUnordered(coreResolved, FIXED_CORE),
);
assert(
  "core_catalog excludes dynamic_basket symbols",
  !coreResolved.includes("TEM"),
);
assert(
  "core_catalog excludes manual list",
  !coreResolved.includes("ZZZNEW"),
);

// ============================================================
group("[2] Dynamic Basket filters scannerEligible symbols only");
// ============================================================
reset();

upsertDynamicTicker({ symbol: "TEM", sourceType: TICKER_SOURCE_TYPES.DYNAMIC_BASKET });
upsertDynamicTicker({ symbol: "ALAB", sourceType: TICKER_SOURCE_TYPES.DYNAMIC_BASKET });
upsertDynamicTicker({ symbol: "BE", sourceType: TICKER_SOURCE_TYPES.DYNAMIC_BASKET });
setScannerEligible("TEM",  true);
setScannerEligible("ALAB", true);
// BE intentionally NOT eligible

import("../src/lib/universe/dynamicUniverseStore.js").then((store) => {
  const eligible = store.listScannerEligible().map((r) => r.symbol);
  assert(
    "listScannerEligible returns only flagged symbols",
    arrayEqualUnordered(eligible, ["TEM", "ALAB"]),
  );

  const dynResolved = resolveScanSymbols({
    selected: ["dynamic_basket"],
    coreCatalogSymbols: FIXED_CORE,         // ignored
    dynamicBasketSymbols: eligible,
    lethalBoardSymbols: FIXED_LB,
    manualList: "ZZZNEW",
  });
  assert(
    "dynamic_basket resolves only the eligible subset",
    arrayEqualUnordered(dynResolved, ["TEM", "ALAB"]),
  );
  assert(
    "dynamic_basket excludes BE (not flagged)",
    !dynResolved.includes("BE"),
  );

  // ============================================================
  group("[3] Manual Ticker List normalizes comma-separated input");
  // ============================================================

  const manual1 = parseManualTickerList("TEM, ALAB, INOD, BE, CRWV");
  assert(
    "5-symbol comma list normalizes to 5 entries",
    arrayEqualUnordered(manual1, ["TEM", "ALAB", "INOD", "BE", "CRWV"]),
  );

  const manual2 = parseManualTickerList("  tem,, alab ,inod ");
  assert(
    "lowercase + extra commas + whitespace normalize",
    arrayEqualUnordered(manual2, ["TEM", "ALAB", "INOD"]),
  );

  const manual3 = parseManualTickerList("AAPL, aapl, AAPL");
  assert(
    "duplicates dedupe in manual list",
    manual3.length === 1 && manual3[0] === "AAPL",
  );

  const manual4 = parseManualTickerList("");
  assert("empty manual list returns []", Array.isArray(manual4) && manual4.length === 0);

  const manualResolved = resolveScanSymbols({
    selected: ["manual_ticker_list"],
    coreCatalogSymbols: FIXED_CORE,         // ignored
    dynamicBasketSymbols: ["TEM"],          // ignored
    lethalBoardSymbols: ["INOD"],           // ignored
    manualList: "TEM, ALAB, INOD",
  });
  assert(
    "manual_ticker_list resolves only the entered symbols",
    arrayEqualUnordered(manualResolved, ["TEM", "ALAB", "INOD"]),
  );

  // ============================================================
  group("[4] Combined Universe dedupes symbols across sources");
  // ============================================================

  const combined = resolveScanSymbols({
    selected: ["combined"],
    coreCatalogSymbols: ["AAPL", "MSFT", "TEM"],     // TEM also in dynamic
    dynamicBasketSymbols: ["TEM", "ALAB"],            // TEM duplicated
    lethalBoardSymbols: ["INOD", "BE"],
    manualList: "AAPL, CRWV",                         // AAPL duplicated
  });
  assert(
    "combined contains AAPL once",
    combined.filter((s) => s === "AAPL").length === 1,
  );
  assert(
    "combined contains TEM once",
    combined.filter((s) => s === "TEM").length === 1,
  );
  assert(
    "combined includes union of all sources",
    arrayEqualUnordered(combined, ["AAPL", "MSFT", "TEM", "ALAB", "INOD", "BE", "CRWV"]),
  );

  // ============================================================
  group("[5] Empty universe → safe no-scan state");
  // ============================================================

  // Manual list selected but no symbols entered → empty resolution.
  const emptyManual = resolveScanSymbols({
    selected: ["manual_ticker_list"],
    coreCatalogSymbols: FIXED_CORE,
    dynamicBasketSymbols: ["TEM"],
    manualList: "",
  });
  assert("manual list selected but empty → []", emptyManual.length === 0);

  // Dynamic basket selected but no eligible symbols → empty resolution.
  reset();
  const emptyDyn = resolveScanSymbols({
    selected: ["dynamic_basket"],
    coreCatalogSymbols: FIXED_CORE,
    dynamicBasketSymbols: [],
  });
  assert("dynamic_basket selected but no eligible → []", emptyDyn.length === 0);

  // ============================================================
  group("[6] runDiscoveryScan honours options.symbols");
  // ============================================================

  const marketInputs = { hyg: 80, kre: 70, lqd: 105, vix: 20, vixPrev: 20, atrExpansionMultiple: 1 };
  runDiscoveryScan(marketInputs, null, {
    symbols: ["TEM", "ALAB", "INOD"],
    universeMode: "Manual Ticker List",
  }).then((result) => {
    assert(
      "scannedSymbols matches the resolved universe",
      arrayEqualUnordered(result.scannedSymbols || [], ["TEM", "ALAB", "INOD"]),
    );
    assert(
      "universeMode is echoed onto the result",
      result.universeMode === "Manual Ticker List",
    );
    assert(
      "scannedSymbols does NOT include any default catalog symbol (e.g., AAPL)",
      !result.scannedSymbols.includes("AAPL"),
    );

    // Empty symbols → safe no-scan state.
    return runDiscoveryScan(marketInputs, null, {
      symbols: [],
      universeMode: "Dynamic Basket",
    });
  }).then((emptyResult) => {
    assert("empty options.symbols → empty cards",
      Array.isArray(emptyResult.cards) && emptyResult.cards.length === 0);
    assert("empty options.symbols → candidates = 0",
      emptyResult.candidates === 0);
    assert("empty options.symbols → scannedSymbols = []",
      Array.isArray(emptyResult.scannedSymbols) && emptyResult.scannedSymbols.length === 0);
    assert("empty options.symbols → universeMode echoed",
      emptyResult.universeMode === "Dynamic Basket");

    // ============================================================
    group("[7] runDiscoveryScan default behaviour preserved");
    // ============================================================

    return runDiscoveryScan(marketInputs, null, { maxSymbols: 5 });
  }).then((defaultResult) => {
    // No options.symbols passed → uses getDiscoveryCandidates(). With
    // fetch stubbed to return non-ok, snapshots are null and cards is
    // empty. But scannedSymbols should still be the candidate list,
    // proving the default path still works.
    assert(
      "default scan still produces a scannedSymbols list",
      Array.isArray(defaultResult.scannedSymbols),
    );
    assert(
      "default scan respects maxSymbols",
      defaultResult.scannedSymbols.length <= 5,
    );

    finish();
  }).catch((err) => {
    console.log("  ✗ test runner threw: " + (err?.message || String(err)));
    failed++; failures.push("test runner threw");
    finish();
  });
});

function finish() {
  console.log(`\n  ${passed} passed, ${failed} failed`);
  resetUniverseBackend();
  if (failed > 0) {
    console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
    process.exit(1);
  }
}

function arrayEqualUnordered(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return [...a].sort().join("|") === [...b].sort().join("|");
}
