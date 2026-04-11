#!/usr/bin/env node
// =====================================================
// Tests for backtest engine + reporter.
// Run: npm run test:backtest
// =====================================================

import { evaluateTradeOutcome, runBacktest, replayAlertGates } from "../src/lib/backtest/backtestEngine.js";
import { summarizeBacktest, compareBacktests, formatReport } from "../src/lib/backtest/backtestReporter.js";

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

console.log("\n  Backtest Engine Tests");
console.log("  ─────────────────────\n");

const baseSetup = {
  symbol: "TEST", entryPrice: 100, strike: 90, credit: 3.50, dte: 7,
  score: 80, action: "SELL_PUTS",
};

// 1. Clean win — price stays above strike
const win = evaluateTradeOutcome(baseSetup, [100, 102, 104, 103, 105, 106, 107, 108]);
assert("Clean win: result = WIN", win.result === "WIN");
assert("Clean win: expiredAboveStrike = true", win.expiredAboveStrike === true);
assert("Clean win: touchedStrike = false", win.touchedStrike === false);
assert("Clean win: touchDay = -1", win.touchDay === -1);
assert("Clean win: pnlPct = 1.0 (kept full credit)", win.pnlPct === 1);
assert("Clean win: maxFavExcursion > 0", win.maxFavorableExcursion > 0);
assert("Clean win: maxAdvExcursion = 0 (never dipped)", win.maxAdverseExcursion === 0);

// 2. Clean loss — price drops through strike
const loss = evaluateTradeOutcome(baseSetup, [100, 95, 92, 88, 85, 83, 82, 80]);
assert("Loss: result = LOSS", loss.result === "LOSS");
assert("Loss: expiredAboveStrike = false", loss.expiredAboveStrike === false);
assert("Loss: touchedStrike = true", loss.touchedStrike === true);
assert("Loss: touchDay > 0", loss.touchDay > 0);
assert("Loss: pnlPct < 0", loss.pnlPct < 0);

// 3. Touch and recover — touches strike but expires above
const touchRecover = evaluateTradeOutcome(baseSetup, [100, 95, 91, 89.5, 92, 95, 98, 101]);
assert("Touch+recover: result = WIN", touchRecover.result === "WIN");
assert("Touch+recover: touchedStrike = true", touchRecover.touchedStrike === true);
assert("Touch+recover: expiredAboveStrike = true", touchRecover.expiredAboveStrike === true);

// 4. Scratch — barely above strike at expiry
const scratch = evaluateTradeOutcome(
  { ...baseSetup, credit: 3.50, strike: 90 },
  [100, 95, 92, 91, 90.5, 90.2, 90.1, 90.5]
);
assert("Near-miss: result = WIN (expired above strike)", scratch.result === "WIN");

// 5. Exactly at strike — below means loss
const atStrike = evaluateTradeOutcome(baseSetup, [100, 95, 92, 90, 88, 87, 86, 85]);
assert("Below strike: result = LOSS", atStrike.result === "LOSS");

// 6. Max favorable excursion
const bigRun = evaluateTradeOutcome(baseSetup, [100, 110, 120, 115, 118, 112, 108, 105]);
assert("Big run: maxFavExcursion = 20%", bigRun.maxFavorableExcursion === 0.2);
assert("Big run: expiredAboveStrike = true", bigRun.expiredAboveStrike === true);

// 7. Max adverse excursion
const bigDip = evaluateTradeOutcome(baseSetup, [100, 90, 80, 85, 90, 95, 100, 105]);
assert("Big dip: maxAdvExcursion = -20%", bigDip.maxAdverseExcursion === -0.2);
assert("Big dip: touchedStrike = true", bigDip.touchedStrike === true);
assert("Big dip: still wins (recovered)", bigDip.result === "WIN");

// 8. Insufficient data — returns OPEN
const open = evaluateTradeOutcome(baseSetup, [100]);
assert("Single price: result = OPEN", open.result === "OPEN");

const noData = evaluateTradeOutcome(baseSetup, null);
assert("Null prices: result = OPEN", noData.result === "OPEN");

// 9. Profit target detection
const earlyProfit = evaluateTradeOutcome(baseSetup, [100, 103, 105, 106, 104, 103, 102, 101]);
assert("Early profit: daysToProfitTarget is number", typeof earlyProfit.daysToProfitTarget === "number");
assert("Early profit: detected within first half of DTE", earlyProfit.daysToProfitTarget <= 4);

// 10. Batch backtest
const batch = runBacktest([
  { setup: baseSetup, forwardPrices: [100, 102, 104, 106, 108, 110, 112, 115] },
  { setup: { ...baseSetup, symbol: "LOSS" }, forwardPrices: [100, 95, 90, 85, 80, 75, 70, 65] },
  { setup: { ...baseSetup, symbol: "WIN2" }, forwardPrices: [100, 101, 102, 103, 104, 105, 106, 107] },
]);
assert("Batch: returns 3 outcomes", batch.length === 3);
assert("Batch: first is WIN", batch[0].result === "WIN");
assert("Batch: second is LOSS", batch[1].result === "LOSS");

// 11. Summary reporter
const summary = summarizeBacktest(batch);
assert("Summary: totalTrades = 3", summary.totalTrades === 3);
assert("Summary: wins = 2", summary.wins === 2);
assert("Summary: losses = 1", summary.losses === 1);
assert("Summary: winRate ~0.67", summary.winRate >= 0.65 && summary.winRate <= 0.68);
assert("Summary: touchRate >= 0", summary.touchRate >= 0);
assert("Summary: bySymbol has entries", Object.keys(summary.bySymbol).length > 0);

// 12. Empty summary
const empty = summarizeBacktest([]);
assert("Empty summary: totalTrades = 0", empty.totalTrades === 0);
assert("Empty summary: winRate = 0", empty.winRate === 0);

// 13. Compare backtests
const summary2 = summarizeBacktest([batch[0], batch[2]]); // only wins
const delta = compareBacktests(summary, summary2);
assert("Compare: has winRateDelta", typeof delta.winRateDelta === "number");
assert("Compare: has tradeCountChange", typeof delta.tradeCountChange === "string");

// 14. Format report (just check it doesn't crash)
const report = formatReport(summary, "Test");
assert("Report: is string", typeof report === "string");
assert("Report: contains trade count", report.includes("3"));

// 15. Alert gate replay — all gates pass
const alertCard = {
  score: 85, action: "SELL_PUTS",
  probability: { method: "monte_carlo", probAboveStrike: 0.80, probTouch: 0.20, avgMaxDrawdown: 0.04 },
  metrics: { ivPercentile: 72, ivConfidence: "medium" },
};
const replay = replayAlertGates(alertCard);
assert("Gate replay: wouldAlert = true (all pass)", replay.wouldAlert === true);
assert("Gate replay: all gates true", Object.values(replay.gateResults).every(Boolean));

// 16. Gate replay — score fails
const lowScoreCard = { ...alertCard, score: 40 };
const lowReplay = replayAlertGates(lowScoreCard);
assert("Gate replay: low score blocks alert", lowReplay.wouldAlert === false);
assert("Gate replay: score gate = false", lowReplay.gateResults.score === false);

// 17. Gate replay — high touch prob fails
const highTouchCard = {
  ...alertCard,
  probability: { ...alertCard.probability, probTouch: 0.55 },
};
const touchReplay = replayAlertGates(highTouchCard);
assert("Gate replay: high touch blocks alert", touchReplay.wouldAlert === false);

// 18. Gate replay — custom thresholds (both must be raised to block)
const strictReplay = replayAlertGates(alertCard, { minScore: 90, minScoreWatch: 90 });
assert("Gate replay strict: score 85 < 90 blocks", strictReplay.wouldAlert === false);

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
