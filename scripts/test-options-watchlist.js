#!/usr/bin/env node
// =====================================================
// Smoke test for options watchlist data integrity.
// Run: npm run test:watchlist
// =====================================================

import { WATCHLIST_2026, WATCHLIST_HISTORICAL, WATCHLIST_MAP, filterPremiumEngine, filterWheelCandidates, filterTrapNames, filterHighWheel, getWatchlistEntry, isInScanUniverse, get2026Symbols } from "../src/optionsWatchlist.js";

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

console.log("\n  Options Watchlist Tests");
console.log("  ──────────────────────\n");

// 1. Data integrity
assert("2026 watchlist has 27 entries", WATCHLIST_2026.length === 27);
assert("Historical watchlist has 100 entries", WATCHLIST_HISTORICAL.length === 100);
assert("Merged map has entries", Object.keys(WATCHLIST_MAP).length > 0);

// 2. Required fields
const validSpread = ["A+", "A", "B"];
const validWheel = ["High", "Medium", "Low", "No"];
for (const w of WATCHLIST_2026) {
  if (!validSpread.includes(w.spreadQuality)) {
    console.log(`  ✗ ${w.symbol}: invalid spreadQuality "${w.spreadQuality}"`);
    failed++;
  }
  if (!validWheel.includes(w.wheelSuit)) {
    console.log(`  ✗ ${w.symbol}: invalid wheelSuit "${w.wheelSuit}"`);
    failed++;
  }
}
assert("All 2026 entries have valid spreadQuality/wheelSuit", failed === 0);

// 3. Filters
const premium = filterPremiumEngine();
assert("Premium engine filter returns results", premium.length > 0);
assert("Premium engine excludes No wheel", premium.every(w => w.wheelSuit !== "No"));
assert("Premium engine only A+/A spread", premium.every(w => w.spreadQuality === "A+" || w.spreadQuality === "A"));

const wheel = filterWheelCandidates();
assert("Wheel candidates filter returns results", wheel.length > 0);
assert("Wheel candidates are High or Medium", wheel.every(w => w.wheelSuit === "High" || w.wheelSuit === "Medium"));

const traps = filterTrapNames();
assert("Trap names filter returns results", traps.length > 0);
assert("Trap names are all Low wheel", traps.every(w => w.wheelSuit === "Low"));

const highWheel = filterHighWheel();
assert("High wheel filter returns results", highWheel.length > 0);
assert("High wheel are all High", highWheel.every(w => w.wheelSuit === "High"));

// 4. Lookup
assert("SPY is in scan universe", isInScanUniverse("SPY"));
assert("Random garbage is not", !isInScanUniverse("ZZZZZZ"));

const spy = getWatchlistEntry("SPY");
assert("SPY lookup returns entry", spy !== null);
assert("SPY is Tier 1", spy?.tier === 1);

// 5. TradingView list
const syms = get2026Symbols();
assert("get2026Symbols returns 27", syms.length === 27);
assert("Includes SPY", syms.includes("SPY"));

// 6. No duplicate symbols in 2026
const symSet = new Set(WATCHLIST_2026.map(w => w.symbol));
assert("No duplicate symbols in 2026 list", symSet.size === WATCHLIST_2026.length);

// 7. Historical ranks are unique and sequential
const ranks = WATCHLIST_HISTORICAL.map(w => w.histRank).sort((a, b) => a - b);
assert("Historical ranks go 1-100", ranks[0] === 1 && ranks[ranks.length - 1] === 100);

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
