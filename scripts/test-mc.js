#!/usr/bin/env node
// =====================================================
// Tests for Monte Carlo probability layer.
// Run: npm run test:mc
// =====================================================

import { estimateProbability, monteCarloEstimate } from "../src/lib/engine/probabilityLayer.js";

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

console.log("\n  Monte Carlo Probability Tests");
console.log("  ─────────────────────────────\n");

// 1. Basic MC — deep OTM put should have high prob above strike
const deepOTM = monteCarloEstimate({
  price: 100, strike: 80, dte: 7, ivPercentile: 50, N: 500,
});
assert("Deep OTM: method is monte_carlo", deepOTM.method === "monte_carlo");
assert("Deep OTM: high prob above strike (>0.8)", deepOTM.probAboveStrike > 0.8);
assert("Deep OTM: low touch prob (<0.5)", deepOTM.probTouch < 0.5);
assert("Deep OTM: passes filter", deepOTM.passesFilter === true);
assert("Deep OTM: has distribution", deepOTM.distribution !== null);
assert("Deep OTM: has assumptions", deepOTM.assumptions.annualizedIV > 0);
assert("Deep OTM: paths = 500", deepOTM.paths === 500);
assert("Deep OTM: steps = 7", deepOTM.steps === 7);

// 2. ATM put — should be roughly 50/50
const atm = monteCarloEstimate({
  price: 100, strike: 100, dte: 7, ivPercentile: 50, N: 2000,
});
assert("ATM: prob above ~0.4-0.6", atm.probAboveStrike >= 0.35 && atm.probAboveStrike <= 0.65);
assert("ATM: touch prob is high (>0.5)", atm.probTouch > 0.5);

// 3. ITM put — should have low prob above strike
const itm = monteCarloEstimate({
  price: 100, strike: 110, dte: 7, ivPercentile: 50, N: 500,
});
assert("ITM: low prob above strike (<0.4)", itm.probAboveStrike < 0.4);
assert("ITM: does not pass filter", itm.passesFilter === false);

// 4. High IV increases expected move and touch prob
const lowIV = monteCarloEstimate({
  price: 100, strike: 90, dte: 7, ivPercentile: 20, N: 500,
});
const highIV = monteCarloEstimate({
  price: 100, strike: 90, dte: 7, ivPercentile: 90, N: 500,
});
assert("Higher IV → larger expected move", highIV.expectedMove > lowIV.expectedMove);
assert("Higher IV → higher touch prob", highIV.probTouch > lowIV.probTouch);

// 5. Longer DTE increases expected move
const shortDTE = monteCarloEstimate({
  price: 100, strike: 90, dte: 3, ivPercentile: 50, N: 500,
});
const longDTE = monteCarloEstimate({
  price: 100, strike: 90, dte: 14, ivPercentile: 50, N: 500,
});
assert("Longer DTE → larger expected move", longDTE.expectedMove > shortDTE.expectedMove);

// 6. ATR expansion multiplier amplifies vol
const noExpansion = monteCarloEstimate({
  price: 100, strike: 90, dte: 7, ivPercentile: 50, atrExpansionMultiple: 1.0, N: 500,
});
const expanded = monteCarloEstimate({
  price: 100, strike: 90, dte: 7, ivPercentile: 50, atrExpansionMultiple: 2.0, N: 500,
});
assert("ATR expansion → larger expected move", expanded.expectedMove > noExpansion.expectedMove);

// 7. Distribution percentiles are ordered
assert("Distribution: p10 < p25", deepOTM.distribution.p10 < deepOTM.distribution.p25);
assert("Distribution: p25 < p50", deepOTM.distribution.p25 < deepOTM.distribution.p50);
assert("Distribution: p50 < p75", deepOTM.distribution.p50 < deepOTM.distribution.p75);
assert("Distribution: p75 < p90", deepOTM.distribution.p75 < deepOTM.distribution.p90);

// 8. Max drawdown is non-negative
assert("Avg max drawdown >= 0", deepOTM.avgMaxDrawdown >= 0);
assert("Avg max drawdown < 1", deepOTM.avgMaxDrawdown < 1);

// 9. Null/invalid inputs
const nullPrice = monteCarloEstimate({ price: 0, strike: 90, dte: 7, ivPercentile: 50 });
assert("Zero price → null result", nullPrice.method === "none");
assert("Zero price → probAboveStrike = 0", nullPrice.probAboveStrike === 0);

const nullStrike = monteCarloEstimate({ price: 100, strike: 0, dte: 7, ivPercentile: 50 });
assert("Zero strike → null result", nullStrike.method === "none");

// 10. estimateProbability API — uses MC by default
const apiResult = estimateProbability({
  price: 100, strike: 90, dte: 7, ivPercentile: 50,
});
assert("estimateProbability uses MC by default", apiResult.method === "monte_carlo");
assert("estimateProbability returns valid probAboveStrike", apiResult.probAboveStrike >= 0 && apiResult.probAboveStrike <= 1);

// 11. estimateProbability fallback to erf
const erfResult = estimateProbability(
  { price: 100, strike: 90, dte: 7, ivPercentile: 50 },
  { useMC: false },
);
assert("erf fallback: method is erf_approximation", erfResult.method === "erf_approximation");
assert("erf fallback: returns valid probAboveStrike", erfResult.probAboveStrike >= 0 && erfResult.probAboveStrike <= 1);
assert("erf fallback: distribution is null", erfResult.distribution === null);

// 12. Convergence: running twice with large N should give similar results
const run1 = monteCarloEstimate({ price: 100, strike: 90, dte: 7, ivPercentile: 50, N: 5000 });
const run2 = monteCarloEstimate({ price: 100, strike: 90, dte: 7, ivPercentile: 50, N: 5000 });
const diff = Math.abs(run1.probAboveStrike - run2.probAboveStrike);
assert("Convergence: two 5K-path runs differ by <5%", diff < 0.05);

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
