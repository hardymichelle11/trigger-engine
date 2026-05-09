#!/usr/bin/env node
// =====================================================
// Ad Hoc TE Simulation — Polygon bars wiring tests
// Run: npm run test:ad-hoc-bars
//
// Acceptance gates per spec:
//   1. ad hoc simulation uses bars when provider returns them.
//   2. quote-only fallback still works when bars are unavailable.
//   3. safe unavailable state when quote and bars both fail.
//   4. structural fields are present when bars exist.
//   5. uncataloged symbol remains uncataloged.
//   6. static catalog behavior remains unchanged.
//   7. no dynamic basket write occurs just because simulation ran.
// =====================================================

import {
  setUniverseBackend,
  resetUniverseBackend,
  clearDynamicUniverse,
  listDynamicTickers,
  listScannerEligible,
  listBySource,
} from "../src/lib/universe/dynamicUniverseStore.js";
import { TICKER_SOURCE_TYPES } from "../src/lib/universe/tickerUniverseTypes.js";
import { simulateAdHoc } from "../src/lib/universe/adHocSimulationService.js";
import {
  resolveTickerUniverse,
  isCatalogTicker,
} from "../src/lib/universe/resolveTickerUniverse.js";
import { isInScanUniverse, getWatchlistEntry } from "../src/optionsWatchlist.js";

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

// Build a fake daily-bar series with a clear bullish drift so we can
// pin the structural fields produced by simulateAdHoc.
function fakeBars({ start = 100, count = 30, drift = 0.4, range = 1.0 } = {}) {
  const out = [];
  let prev = start;
  for (let i = 0; i < count; i++) {
    const open = prev;
    const close = prev + drift + (Math.sin(i) * 0.05);
    const high = Math.max(open, close) + range * 0.5;
    const low  = Math.min(open, close) - range * 0.5;
    out.push({
      ts: Date.now() - (count - i) * 86_400_000,
      open, high, low, close,
      volume: 1_000_000,
    });
    prev = close;
  }
  return out;
}

const MARKET = { hyg: 80, kre: 70, lqd: 105, vix: 20, vixPrev: 20, atrExpansionMultiple: 1 };
const FAKE_QUOTE = { symbol: "ZQXTEST", price: 113.0, previousClose: 112.5, percentChange: 0.44 };

// ============================================================
group("[1] uses bars when provider returns OHLC series");
// ============================================================
reset();

const bars = fakeBars();
const withBars = await simulateAdHoc("ZQXTEST", {
  persist: false,
  providers: {
    fetchQuotes: async () => ({ ZQXTEST: FAKE_QUOTE }),
    fetchBars:   async () => bars,
  },
});

assert("simulation completed",            withBars && withBars.symbol === "ZQXTEST");
assert("dataAvailability.polygonQuote",   withBars.dataAvailability.polygonQuote === true);
assert("dataAvailability.polygonBars",    withBars.dataAvailability.polygonBars === true);
assert("dataAvailabilityLabel = 'Quote + bars'",
  withBars.dataAvailabilityLabel === "Quote + bars");
assert("noMarketData = false",            withBars.noMarketData === false);
assert("triggerEngine.ok = true",         withBars.triggerEngine.ok === true);
assert("triggerEngine.barsAvailable = true",
  withBars.triggerEngine.barsAvailable === true);
assert("triggerEngine.dataQuality = quote_and_bars",
  withBars.triggerEngine.dataQuality === "quote_and_bars");

// ============================================================
group("[2] structural fields are present when bars exist");
// ============================================================

const struct = withBars.triggerEngine.result?.structure;
assert("structure object present",                !!struct);
assert("structure.support is finite + > 0",
  Number.isFinite(struct.support) && struct.support > 0);
assert("structure.resistance is finite + > 0",
  Number.isFinite(struct.resistance) && struct.resistance > 0);
assert("structure.resistance ≥ structure.support",
  struct.resistance >= struct.support);
assert("structure.atr is finite",                 Number.isFinite(struct.atr));
assert("structure.atr > 0 (true range from OHLC)", struct.atr > 0);
assert("structure.trendBias is BULLISH for upward drift",
  struct.trendBias === "BULLISH");
assert("structure.windowSize = bar count",        struct.windowSize === bars.length);
assert("structure.ohlcAvailable = true",          struct.ohlcAvailable === true);
assert("structure.supportPct ≥ 0",                struct.supportPct >= 0);
assert("structure.resistancePct ≥ 0",             struct.resistancePct >= 0);
assert("'No static catalog profile found' note preserved",
  /No static catalog profile found/.test(withBars.triggerEngine.result?.note || ""));

// ============================================================
group("[3] quote-only fallback when bars are unavailable");
// ============================================================
reset();

const quoteOnly = await simulateAdHoc("ZQXTEST", {
  persist: false,
  providers: {
    fetchQuotes: async () => ({ ZQXTEST: FAKE_QUOTE }),
    fetchBars:   async () => [],
  },
});

assert("quote-only completed",                  quoteOnly.symbol === "ZQXTEST");
assert("dataAvailability.polygonQuote = true",  quoteOnly.dataAvailability.polygonQuote === true);
assert("dataAvailability.polygonBars  = false", quoteOnly.dataAvailability.polygonBars  === false);
assert("dataAvailabilityLabel = 'Quote only'",  quoteOnly.dataAvailabilityLabel === "Quote only");
assert("triggerEngine.ok = true (quote alone is enough)",
  quoteOnly.triggerEngine.ok === true);
assert("triggerEngine.limited = true",          quoteOnly.triggerEngine.limited === true);
assert("triggerEngine.dataQuality = quote_only",
  quoteOnly.triggerEngine.dataQuality === "quote_only");
assert("structure.atr is null (no bars)",
  quoteOnly.triggerEngine.result?.structure?.atr === null);
assert("price still surfaced from quote",
  quoteOnly.triggerEngine.result?.price === FAKE_QUOTE.price);
assert("noMarketData = false (quote present)",  quoteOnly.noMarketData === false);

// ============================================================
group("[4] safe unavailable state when quote + bars both fail");
// ============================================================
reset();

const noData = await simulateAdHoc("ZQXTEST", {
  persist: false,
  providers: {
    fetchQuotes: async () => ({}),
    fetchBars:   async () => [],
  },
});

assert("noMarketData = true",                          noData.noMarketData === true);
assert("dataAvailabilityLabel = 'No market data'",     noData.dataAvailabilityLabel === "No market data");
assert("triggerEngine.ok = false",                     noData.triggerEngine.ok === false);
assert("triggerEngine.barsAvailable = false",          noData.triggerEngine.barsAvailable === false);
assert("triggerEngine.reason names quote+bars unavailable",
  /Polygon quote and bars unavailable/i.test(noData.triggerEngine.reason || ""));
assert("creditView is in limited mode",                noData.creditView.limited === true);

// ============================================================
group("[5] uncataloged symbol remains uncataloged after sim");
// ============================================================
reset();

const beforeRec = resolveTickerUniverse("ZQXTEST");
assert("ZQXTEST is uncataloged before sim",
  beforeRec.catalogStatus === "uncataloged" &&
  beforeRec.sourceType   === TICKER_SOURCE_TYPES.AD_HOC_SIMULATION);

await simulateAdHoc("ZQXTEST", {
  persist: false,
  providers: {
    fetchQuotes: async () => ({ ZQXTEST: FAKE_QUOTE }),
    fetchBars:   async () => fakeBars(),
  },
});

const afterRec = resolveTickerUniverse("ZQXTEST");
assert("ZQXTEST still uncataloged after sim",
  afterRec.catalogStatus === "uncataloged");
assert("ZQXTEST sourceType still AD_HOC_SIMULATION",
  afterRec.sourceType === TICKER_SOURCE_TYPES.AD_HOC_SIMULATION);
assert("isCatalogTicker('ZQXTEST') = false",
  isCatalogTicker("ZQXTEST") === false);

// ============================================================
group("[6] static catalog behavior remains unchanged");
// ============================================================
reset();

// Capture a known catalog symbol's metadata.
const aaplBefore = getWatchlistEntry("AAPL");
assert("AAPL is in the static catalog",     !!aaplBefore);
assert("AAPL is in scan universe (A+/A)",   isInScanUniverse("AAPL") === true);

// Simulate against an uncataloged symbol AND a cataloged symbol.
await simulateAdHoc("ZQXTEST", {
  persist: false,
  providers: { fetchQuotes: async () => ({ ZQXTEST: FAKE_QUOTE }), fetchBars: async () => fakeBars() },
});
await simulateAdHoc("AAPL", {
  persist: false,
  providers: { fetchQuotes: async () => ({ AAPL: { symbol: "AAPL", price: 200 } }), fetchBars: async () => fakeBars({ start: 195 }) },
});

const aaplAfter = getWatchlistEntry("AAPL");
assert("AAPL catalog metadata is byte-identical (object reference equality acceptable)",
  aaplAfter === aaplBefore || JSON.stringify(aaplAfter) === JSON.stringify(aaplBefore));
assert("AAPL still in scan universe", isInScanUniverse("AAPL") === true);
assert("AAPL still resolves as STATIC_CATALOG",
  resolveTickerUniverse("AAPL").sourceType === TICKER_SOURCE_TYPES.STATIC_CATALOG);

// ============================================================
group("[7] no dynamic basket write occurs just because simulation ran");
// ============================================================
reset();

assert("dynamic store is empty before sim",     Object.keys(listDynamicTickers()).length === 0);

await simulateAdHoc("ZQXTEST", {
  // Default is persist: false now. We pass nothing to confirm the new
  // default does not write.
  providers: {
    fetchQuotes: async () => ({ ZQXTEST: FAKE_QUOTE }),
    fetchBars:   async () => fakeBars(),
  },
});

assert("dynamic store is still empty after sim",
  Object.keys(listDynamicTickers()).length === 0);
assert("listScannerEligible is empty",   listScannerEligible().length === 0);
assert("no DYNAMIC_BASKET entries",
  listBySource(TICKER_SOURCE_TYPES.DYNAMIC_BASKET).length === 0);
assert("no LETHAL_BOARD_PROSPECT entries",
  listBySource(TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT).length === 0);

// Explicit persist:true still works (escape hatch for callers that
// re-simulate an already-basketed symbol and want lastSimulatedAt
// refreshed). It writes an AD_HOC_SIMULATION record but still does
// NOT promote into the scanner-eligible basket.
await simulateAdHoc("ZQXTEST", {
  persist: true,
  providers: {
    fetchQuotes: async () => ({ ZQXTEST: FAKE_QUOTE }),
    fetchBars:   async () => fakeBars(),
  },
});
assert("explicit persist:true writes an ad-hoc record",
  Object.keys(listDynamicTickers()).length === 1);
assert("explicit persist:true does NOT promote to scanner-eligible",
  listScannerEligible().length === 0);

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetUniverseBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
