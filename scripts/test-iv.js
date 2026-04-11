#!/usr/bin/env node
// =====================================================
// Tests for IV rank adapter + cache.
// Run: npm run test:iv
// =====================================================

import { getIvRank, setIvRankManual } from "../src/lib/iv/ivAdapter.js";
import { cacheSet, cacheGet, cacheClear, cacheHasFresh, cacheStats } from "../src/lib/iv/ivCache.js";

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    failed++;
  }
}

console.log("\n  IV Rank Adapter Tests");
console.log("  ─────────────────────\n");

// --- Clean state ---
cacheClear();

// 1. Null/missing symbol
const nullResult = await getIvRank(null);
assert("null symbol returns null ivRank", nullResult.ivRank === null);
assert("null symbol has source 'none'", nullResult.source === "none");
assert("null symbol has confidence 'none'", nullResult.confidence === "none");
assert("null symbol is stale", nullResult.stale === true);

const emptyResult = await getIvRank("");
assert("empty symbol returns null ivRank", emptyResult.ivRank === null);

// 2. ATR-based estimate fallback
const atrResult = await getIvRank("TEST", { atrExpansionMultiple: 1.6, changePct: 5 });
assert("ATR estimate returns a number", typeof atrResult.ivRank === "number");
assert("ATR estimate is 0-100", atrResult.ivRank >= 0 && atrResult.ivRank <= 100);
assert("ATR estimate source is 'atr_estimate'", atrResult.source === "atr_estimate");
assert("ATR estimate confidence is 'low'", atrResult.confidence === "low");
assert("ATR estimate is not stale (just cached)", atrResult.stale === false);

// 3. High ATR = higher IV estimate
const lowAtr = await getIvRank("LOW", { atrExpansionMultiple: 1.0, changePct: 0 });
const highAtr = await getIvRank("HIGH", { atrExpansionMultiple: 2.0, changePct: 10 });
assert("Higher ATR produces higher IV estimate", highAtr.ivRank > lowAtr.ivRank);

// 4. Cache behavior
cacheClear();
assert("Cache starts empty after clear", cacheStats().total === 0);

cacheSet("AAPL", {
  ivRank: 72,
  source: "test",
  asOf: new Date().toISOString(),
  confidence: "high",
});

assert("Cache has entry after set", cacheStats().total === 1);
assert("Cache returns fresh entry", cacheHasFresh("AAPL"));

const cached = cacheGet("AAPL");
assert("Cached entry has correct ivRank", cached.ivRank === 72);
assert("Cached entry has correct source", cached.source === "test");
assert("Cached entry is not stale", cached.stale === false);
assert("Cached entry has high confidence", cached.confidence === "high");

// 5. Cache miss
const miss = cacheGet("ZZZZ");
assert("Cache miss returns null", miss === null);
assert("cacheHasFresh returns false for miss", !cacheHasFresh("ZZZZ"));

// 6. Stale cache entry (simulate with very short TTL)
const staleEntry = cacheGet("AAPL", 0); // 0ms TTL = immediately stale
assert("Entry with 0ms TTL is stale", staleEntry.stale === true);
assert("Stale entry still returns ivRank", staleEntry.ivRank === 72);
assert("Stale entry confidence degrades to 'low'", staleEntry.confidence === "low");

// 7. Manual set
setIvRankManual("MSFT", 85, "thinkorswim");
const manual = cacheGet("MSFT");
assert("Manual set stores correct ivRank", manual.ivRank === 85);
assert("Manual set stores source", manual.source === "thinkorswim");
assert("Manual set has high confidence", manual.confidence === "high");

// 8. Manual set with clamping
setIvRankManual("TSLA", 150);
const clamped = cacheGet("TSLA");
assert("ivRank clamped to 100 max", clamped.ivRank === 100);

setIvRankManual("FLAT", -10);
const clampedLow = cacheGet("FLAT");
assert("ivRank clamped to 0 min", clampedLow.ivRank === 0);

// 9. getIvRank uses cache when fresh
cacheClear();
setIvRankManual("NVDA", 68);
const fromCache = await getIvRank("NVDA");
assert("getIvRank returns cached entry when fresh", fromCache.ivRank === 68);
assert("getIvRank source reflects manual entry", fromCache.source === "manual");

// 10. getIvRank falls back to ATR when no cache
cacheClear();
const fallback = await getIvRank("UNKNOWN", { atrExpansionMultiple: 1.3, changePct: 2 });
assert("Fallback to ATR estimate works", fallback.ivRank !== null);
assert("Fallback source is atr_estimate", fallback.source === "atr_estimate");

// 11. Cache stats
cacheClear();
setIvRankManual("A", 50);
setIvRankManual("B", 60);
setIvRankManual("C", 70);
const stats = cacheStats();
assert("Cache stats reports correct total", stats.total === 3);
assert("All entries are fresh", stats.fresh === 3);

// 12. IvResult contract shape
const result = await getIvRank("SHAPE_TEST", { atrExpansionMultiple: 1.5 });
assert("Result has symbol field", typeof result.symbol === "string");
assert("Result has ivRank field", result.ivRank === null || typeof result.ivRank === "number");
assert("Result has source field", typeof result.source === "string");
assert("Result has asOf field", typeof result.asOf === "string");
assert("Result has stale field", typeof result.stale === "boolean");
assert("Result has confidence field", typeof result.confidence === "string");

cacheClear();

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
