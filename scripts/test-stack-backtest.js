#!/usr/bin/env node
// =====================================================
// Tests for stack reversal backtest engine.
// Run: npm run test:stack
// =====================================================

import { evaluateStackEvent, runStackBacktest, summarizeStackBacktest, formatStackReport } from "../src/lib/backtest/stackReversalBacktest.js";

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

console.log("\n  Stack Reversal Backtest Tests");
console.log("  ─────────────────────────────\n");

const baseEvent = {
  date: "2026-03-01", stage: "EARLY", score: 90,
  leaderPrice: 110, leaderMomentum: 0.025, powerStrength: 0.67, followerLag: 0.01,
  bestFollower: "NEBX",
  nbisEntryPrice: 108, nebxEntryPrice: 35,
  targets: [37, 38.5, 40], stop: 32,
  nvdaForwardPrices: [110, 112, 114, 115, 116, 117],
};

// 1. Clean win — both followers hit T1
const cleanWin = evaluateStackEvent({
  ...baseEvent,
  nbisForwardPrices: [108, 110, 113, 115, 118, 120],
  nebxForwardPrices: [35, 36.5, 37.5, 39, 40.5, 42],
});
// Targets [37, 38.5, 40] are absolute. NBIS at 113+ easily clears 37.
assert("Clean win: NBIS hits T1 (108→118, target 37)", cleanWin.nbis.hitT1 === true);
assert("Clean win: NEBX hits T1", cleanWin.nebx.hitT1 === true);
assert("Clean win: NEBX hits T2", cleanWin.nebx.hitT2 === true);
assert("Clean win: NEBX hits T3", cleanWin.nebx.hitT3 === true);
assert("Clean win: NEBX result is WIN", cleanWin.nebx.result === "WIN");
assert("Clean win: no stop hit", cleanWin.nebx.hitStop === false);
assert("Clean win: dayToT1 > 0", cleanWin.nebx.dayToT1 > 0);

// 2. Loss — price drops through stop
const loss = evaluateStackEvent({
  ...baseEvent,
  nbisForwardPrices: [108, 105, 102, 100, 98, 95],
  nebxForwardPrices: [35, 33, 31, 29, 28, 27],
});
assert("Loss: NEBX hits stop", loss.nebx.hitStop === true);
assert("Loss: NEBX result is LOSS", loss.nebx.result === "LOSS");
assert("Loss: NEBX maxAdvPct < 0", loss.nebx.maxAdvPct < 0);

// 3. Stall — no targets hit, no stop
const stall = evaluateStackEvent({
  ...baseEvent,
  nbisForwardPrices: [108, 108.5, 107.5, 108, 107, 108],
  nebxForwardPrices: [35, 35.2, 34.8, 35.1, 34.9, 35.3],
});
assert("Stall: NEBX no T1 hit", stall.nebx.hitT1 === false);
assert("Stall: NEBX no stop hit", stall.nebx.hitStop === false);
assert("Stall: NEBX result is FLAT or SMALL", ["FLAT", "SMALL_WIN", "SMALL_LOSS"].includes(stall.nebx.result));

// 4. MFE and MAE
const volatile = evaluateStackEvent({
  ...baseEvent,
  nbisForwardPrices: [108, 115, 120, 100, 95, 110],
  nebxForwardPrices: [35, 38, 41, 30, 28, 36],
});
assert("Volatile: NEBX maxFavPct > 0", volatile.nebx.maxFavPct > 0);
assert("Volatile: NEBX maxAdvPct < 0", volatile.nebx.maxAdvPct < 0);
assert("Volatile: NBIS maxFavPct captures peak", volatile.nbis.maxFavPct > 0.1); // 120 vs 108 = 11%

// 5. Follower picker accuracy
assert("Clean win: pickedCorrectly is boolean", typeof cleanWin.pickedCorrectly === "boolean");
assert("Clean win: actualBetterFollower is NBIS or NEBX", ["NBIS", "NEBX"].includes(cleanWin.actualBetterFollower));

// 6. Leader forward move
assert("Leader forward move is positive", cleanWin.nvdaForwardMove > 0);

// 7. Insufficient data
const noData = evaluateStackEvent({
  ...baseEvent,
  nbisForwardPrices: [108],
  nebxForwardPrices: [],
});
assert("No data: NBIS result is NO_DATA", noData.nbis.result === "NO_DATA");
assert("No data: NEBX result is NO_DATA", noData.nebx.result === "NO_DATA");

// 8. Batch backtest
const batch = runStackBacktest([
  { ...baseEvent, nbisForwardPrices: [108, 112, 118], nebxForwardPrices: [35, 37.5, 40] },
  { ...baseEvent, stage: "LATE", score: 65, nbisForwardPrices: [108, 105, 102], nebxForwardPrices: [35, 33, 31] },
]);
assert("Batch: returns 2 outcomes", batch.length === 2);

// 9. Summary reporter
const summary = summarizeStackBacktest(batch);
assert("Summary: totalEvents = 2", summary.totalEvents === 2);
assert("Summary: has byStage", typeof summary.byStage === "object");
assert("Summary: has nbis group", typeof summary.nbis === "object");
assert("Summary: has nebx group", typeof summary.nebx === "object");
assert("Summary: followerPickerAccuracy is 0-1", summary.followerPickerAccuracy >= 0 && summary.followerPickerAccuracy <= 1);

// 10. Stage breakdown
assert("Summary: EARLY stage exists", summary.byStage.EARLY !== undefined);
assert("Summary: LATE stage exists", summary.byStage.LATE !== undefined);

// 11. Follower group stats
assert("NEBX stats: has t1Rate", typeof summary.nebx.t1Rate === "number");
assert("NEBX stats: has stopRate", typeof summary.nebx.stopRate === "number");
assert("NEBX stats: has avgMFE", typeof summary.nebx.avgMFE === "number");
assert("NEBX stats: has winRate", typeof summary.nebx.winRate === "number");

// 12. Empty summary
const empty = summarizeStackBacktest([]);
assert("Empty summary: totalEvents = 0", empty.totalEvents === 0);

// 13. Format report (just check no crash)
const report = formatStackReport(summary);
assert("Report: is string", typeof report === "string");
assert("Report: contains event count", report.includes("2"));

// 14. Stage-based target weights test (via outcome)
// LATE stage events should have worse outcomes on average
const earlyWin = evaluateStackEvent({
  ...baseEvent, stage: "EARLY", score: 95,
  nbisForwardPrices: [108, 112, 115, 118, 120, 122],
  nebxForwardPrices: [35, 37, 38, 39, 40, 41],
});
const lateEntry = evaluateStackEvent({
  ...baseEvent, stage: "LATE", score: 60,
  nbisForwardPrices: [108, 107, 106, 105, 104, 103],
  nebxForwardPrices: [35, 34.5, 34, 33.5, 33, 32.5],
});
assert("EARLY has better NEBX outcome than LATE", earlyWin.nebx.maxFavPct > lateEntry.nebx.maxFavPct);

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
