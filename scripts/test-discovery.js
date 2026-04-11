#!/usr/bin/env node
// =====================================================
// Tests for discovery scanner.
// Run: npm run test:discovery
// =====================================================

import { getDiscoveryCandidates, getAllDiscoverySymbols, getDiscoveryPreview } from "../src/lib/discoveryScanner.js";
import { WATCHLIST_2026, WATCHLIST_HISTORICAL } from "../src/optionsWatchlist.js";

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

console.log("\n  Discovery Scanner Tests");
console.log("  ───────────────────────\n");

const curated2026 = new Set(WATCHLIST_2026.map(w => w.symbol));

// 1. Default candidates exclude curated symbols
const candidates = getDiscoveryCandidates();
assert("Candidates exist", candidates.length > 0);
assert("No curated symbol in candidates", candidates.every(c => !curated2026.has(c.symbol)));

// 2. All candidates have spread A+ or A (default filter)
assert("All candidates have A+ or A spread", candidates.every(c => c.spreadQuality === "A+" || c.spreadQuality === "A"));

// 3. All candidates have High or Medium wheel (default filter)
assert("All candidates have High or Medium wheel", candidates.every(c => c.wheelSuit === "High" || c.wheelSuit === "Medium"));

// 4. Candidates are sorted by histRank
for (let i = 1; i < candidates.length; i++) {
  if (candidates[i].histRank < candidates[i - 1].histRank) {
    assert("Candidates sorted by rank", false);
    break;
  }
}
assert("Candidates sorted by histRank", true);

// 5. Custom filter: only High wheel
const highOnly = getDiscoveryCandidates({ wheelSuit: ["High"] });
assert("High-only filter works", highOnly.every(c => c.wheelSuit === "High"));
assert("High-only is subset of default", highOnly.length <= candidates.length);

// 6. Custom filter: include B spread
const withB = getDiscoveryCandidates({ spreadQuality: ["A+", "A", "B"] });
assert("Including B spread returns more candidates", withB.length >= candidates.length);

// 7. Custom filter: maxRank
const top20 = getDiscoveryCandidates({ maxRank: 20 });
assert("maxRank 20 limits results", top20.every(c => c.histRank <= 20));

// 8. getAllDiscoverySymbols
const allSyms = getAllDiscoverySymbols();
assert("getAllDiscoverySymbols returns array", Array.isArray(allSyms));
assert("No curated symbols in all discovery", allSyms.every(s => !curated2026.has(s)));
assert("All discovery symbols are from historical list", allSyms.every(s =>
  WATCHLIST_HISTORICAL.some(w => w.symbol === s)
));

// 9. getDiscoveryPreview
const preview = getDiscoveryPreview();
assert("Preview has totalCandidates", typeof preview.totalCandidates === "number");
assert("Preview has symbols array", Array.isArray(preview.symbols));
assert("Preview has bySpreadQuality", typeof preview.bySpreadQuality === "object");
assert("Preview has byWheelSuit", typeof preview.byWheelSuit === "object");
assert("Preview has rankRange", typeof preview.rankRange === "string");
assert("Preview totalCandidates matches candidates length", preview.totalCandidates === candidates.length);

// 10. No duplicates in candidates
const candSyms = candidates.map(c => c.symbol);
const candSet = new Set(candSyms);
assert("No duplicate symbols in candidates", candSet.size === candSyms.length);

// 11. Known curated symbols NOT in candidates
const curatedExamples = ["SPY", "NVDA", "AAPL", "COIN", "TSLA"];
for (const sym of curatedExamples) {
  assert(`${sym} (curated) not in discovery`, !candSet.has(sym));
}

// 12. Known historical-only symbols SHOULD be in candidates (if they pass filters)
// BAC (#11) has A+ spread and High wheel — should appear
const bacEntry = WATCHLIST_HISTORICAL.find(w => w.symbol === "BAC");
if (bacEntry && !curated2026.has("BAC") && (bacEntry.spreadQuality === "A+" || bacEntry.spreadQuality === "A") && (bacEntry.wheelSuit === "High" || bacEntry.wheelSuit === "Medium")) {
  assert("BAC (#11, A+, High) is in discovery candidates", candSet.has("BAC"));
}

// 13. Empty filter result
const impossible = getDiscoveryCandidates({ maxRank: 0 });
assert("maxRank 0 returns empty", impossible.length === 0);

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
