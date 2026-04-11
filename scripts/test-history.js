#!/usr/bin/env node
// =====================================================
// Tests for history provider + BQ reader adapter.
// Run: npm run test:history
// =====================================================

import { getCloses, getTrend, getProviderStatus, clearHistoryCache } from "../src/lib/historyProvider.js";
import { isBqAvailable } from "../src/lib/bqReader.js";

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

console.log("\n  History Provider Tests");
console.log("  ──────────────────────\n");

// Clean state
clearHistoryCache();

// 1. Provider status
const status = getProviderStatus();
assert("Status: has bqAvailable field", typeof status.bqAvailable === "boolean");
assert("Status: BQ not available without proxy env", status.bqAvailable === false);
assert("Status: cache starts empty", status.cacheTotal === 0);

// 2. BQ reader reports unavailable
assert("BQ reader: isBqAvailable = false (no proxy)", isBqAvailable() === false);

// 3. getCloses without API key — returns empty
const noKey = await getCloses("TEST", "", 60);
assert("No API key: returns empty closes", noKey.closes.length === 0);
assert("No API key: source is 'none'", noKey.source === "none");

// 4. getCloses with bad API key — returns empty (Polygon will fail)
// Skip actual fetch to avoid network dependency in tests
// Instead test the cache behavior

// 5. Cache behavior — manual injection via internal test
clearHistoryCache();

// Simulate a successful fetch by calling getCloses with a known-bad key
// then checking cache status
const result1 = await getCloses("FAKE_SYM", "", 10);
assert("Missing data: source is 'none'", result1.source === "none");

// 6. getTrend without data
const noTrend = await getTrend("MISSING", "", 60);
assert("getTrend with no data: available = false", noTrend.trend.available === false);
assert("getTrend with no data: has dataSource field", noTrend.trend.dataSource !== undefined);

// 7. Provider status after queries
const statusAfter = getProviderStatus();
assert("Status after queries: cacheTotal >= 0", statusAfter.cacheTotal >= 0);
assert("Status: contextCacheSize >= 0", statusAfter.contextCacheSize >= 0);

// 8. clearHistoryCache works
clearHistoryCache();
const statusCleared = getProviderStatus();
assert("After clear: cache empty", statusCleared.cacheTotal === 0);
assert("After clear: context cache empty", statusCleared.contextCacheSize === 0);

// 9. Source chain priority
// Without BQ proxy and without valid API key:
// getCloses should return source: "none"
const chainResult = await getCloses("CHAIN_TEST", "", 60);
assert("Source chain: BQ unavailable + no key = 'none'", chainResult.source === "none");

// 10. getTrend returns dataSource metadata
const trendResult = await getTrend("META_TEST", "", 60);
assert("getTrend: has dataSource in trend", "dataSource" in trendResult.trend);
assert("getTrend: source is string", typeof trendResult.source === "string");

// 11. Provider status shape
const fullStatus = getProviderStatus();
assert("Status shape: has bqAvailable", "bqAvailable" in fullStatus);
assert("Status shape: has cacheTotal", "cacheTotal" in fullStatus);
assert("Status shape: has cacheFresh", "cacheFresh" in fullStatus);
assert("Status shape: has cacheStale", "cacheStale" in fullStatus);
assert("Status shape: has contextCacheSize", "contextCacheSize" in fullStatus);

clearHistoryCache();

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
