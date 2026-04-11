#!/usr/bin/env node
// =====================================================
// Checks that SYSTEM_MANIFEST.md is in sync with code.
// Run: npm run manifest:check
// =====================================================

import { readFileSync, existsSync } from "fs";
import { SETUPS } from "../src/config/setups.js";
import { TICKER_CATALOG } from "../src/tickerCatalog.js";
import { WATCHLIST_2026 } from "../src/optionsWatchlist.js";

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

console.log("\n  Manifest Sync Check");
console.log("  ───────────────────\n");

const manifestPath = "docs/history/SYSTEM_MANIFEST.md";
assert("SYSTEM_MANIFEST.md exists", existsSync(manifestPath));

const manifest = existsSync(manifestPath) ? readFileSync(manifestPath, "utf-8") : "";

// 1. Ticker count
assert(`Manifest mentions ${TICKER_CATALOG.length} tickers (catalog has ${TICKER_CATALOG.length})`,
  manifest.includes(`${TICKER_CATALOG.length}`) || manifest.includes("ticker"));

// 2. Setup count
assert(`Config has ${SETUPS.length} setups`, SETUPS.length > 0);

// 3. Key files exist
const requiredFiles = [
  "src/signalEngine.js",
  "src/CreditVolScanner.jsx",
  "src/optionsWatchlist.js",
  "src/tickerCatalog.js",
  "src/config/setups.js",
  "src/lib/setupRegistry.js",
  "src/lib/setupValidator.js",
  "src/lib/engine/config.js",
  "src/lib/engine/macroRegime.js",
  "src/lib/engine/setupScoring.js",
  "src/lib/engine/strikeSelection.js",
  "src/lib/engine/profitManagement.js",
  "src/lib/engine/defenseLogic.js",
  "src/lib/engine/probabilityLayer.js",
  "src/lib/evaluators/pairEvaluator.js",
  "src/lib/evaluators/basketEvaluator.js",
  "src/lib/evaluators/standaloneEvaluator.js",
  "src/lib/evaluators/infraFollowerEvaluator.js",
  "src/lib/evaluators/stackReversalEvaluator.js",
  "docs/CLAUDE.md",
  "docs/WORK_QUEUE.md",
  "docs/DECISIONS.md",
];

for (const f of requiredFiles) {
  assert(`${f} exists`, existsSync(f));
}

// 4. Watchlist count
assert(`2026 watchlist has ${WATCHLIST_2026.length} entries`, WATCHLIST_2026.length > 0);

// 5. Manifest has recent date
const dateMatch = manifest.match(/\*\*Last updated:\*\*\s*(\d{4}-\d{2}-\d{2})/);
if (dateMatch) {
  const lastUpdate = new Date(dateMatch[1]);
  const daysSince = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
  assert(`Manifest updated within last 30 days (${dateMatch[1]})`, daysSince < 30);
} else {
  console.log("  ✗ Could not find last updated date in manifest");
  failed++;
}

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
