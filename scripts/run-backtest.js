#!/usr/bin/env node
// =====================================================
// Run a backtest against synthetic or historical data.
// Usage:
//   npm run backtest              (synthetic scenarios)
//   npm run backtest -- --strict   (tighter thresholds)
// =====================================================

import { evaluateTradeOutcome, runBacktest, replayAlertGates } from "../src/lib/backtest/backtestEngine.js";
import { summarizeBacktest, compareBacktests, formatReport } from "../src/lib/backtest/backtestReporter.js";

// --------------------------------------------------
// SYNTHETIC TRADE SCENARIOS
// --------------------------------------------------
// Each scenario simulates a realistic 7-day price path
// from a known alert-triggered entry point.

function syntheticTrades() {
  return [
    // 1. Clean win — price drifts up, never touches strike
    {
      setup: { symbol: "NVDA", entryPrice: 110, strike: 100, credit: 3.50, dte: 7, score: 85, action: "SELL_PUTS", entryDate: "2026-03-01",
        probability: { method: "monte_carlo", probAboveStrike: 0.82, probTouch: 0.18, avgMaxDrawdown: 0.03 },
        metrics: { ivPercentile: 75, ivSource: "polygon_options", ivConfidence: "medium" },
      },
      forwardPrices: [110, 111.5, 112.8, 111.2, 113.5, 114.0, 115.2, 114.8],
    },
    // 2. Win but touched strike briefly
    {
      setup: { symbol: "NBIS", entryPrice: 108, strike: 98, credit: 4.20, dte: 7, score: 78, action: "SELL_PUTS", entryDate: "2026-03-03",
        probability: { method: "monte_carlo", probAboveStrike: 0.72, probTouch: 0.35, avgMaxDrawdown: 0.06 },
        metrics: { ivPercentile: 82, ivSource: "atr_estimate", ivConfidence: "low" },
      },
      forwardPrices: [108, 105, 101, 97.5, 100, 103, 106, 109],
    },
    // 3. Loss — price drops through strike and stays
    {
      setup: { symbol: "CRWV", entryPrice: 42, strike: 38, credit: 2.10, dte: 7, score: 72, action: "SELL_PUTS", entryDate: "2026-03-05",
        probability: { method: "monte_carlo", probAboveStrike: 0.68, probTouch: 0.32, avgMaxDrawdown: 0.05 },
        metrics: { ivPercentile: 88, ivSource: "polygon_options", ivConfidence: "medium" },
      },
      forwardPrices: [42, 40.5, 39.2, 37.8, 36.5, 35.0, 34.2, 33.8],
    },
    // 4. Scratch — barely wins, minimal excursion
    {
      setup: { symbol: "COIN", entryPrice: 185, strike: 170, credit: 5.50, dte: 7, score: 80, action: "SELL_PUTS", entryDate: "2026-03-07",
        probability: { method: "monte_carlo", probAboveStrike: 0.78, probTouch: 0.22, avgMaxDrawdown: 0.04 },
        metrics: { ivPercentile: 70, ivSource: "polygon_options", ivConfidence: "medium" },
      },
      forwardPrices: [185, 183, 180, 178, 175, 172, 170.5, 171.2],
    },
    // 5. Clean win on TSLA — high IV, stock rips
    {
      setup: { symbol: "TSLA", entryPrice: 280, strike: 255, credit: 6.80, dte: 7, score: 88, action: "SELL_PUTS", entryDate: "2026-03-10",
        probability: { method: "monte_carlo", probAboveStrike: 0.85, probTouch: 0.12, avgMaxDrawdown: 0.025 },
        metrics: { ivPercentile: 78, ivSource: "polygon_options", ivConfidence: "high" },
      },
      forwardPrices: [280, 285, 290, 288, 295, 300, 305, 308],
    },
    // 6. ARCC — credit name, stable, easy win
    {
      setup: { symbol: "ARCC", entryPrice: 18.5, strike: 17, credit: 0.30, dte: 7, score: 65, action: "SELL_PUTS", entryDate: "2026-03-12",
        probability: { method: "monte_carlo", probAboveStrike: 0.88, probTouch: 0.08, avgMaxDrawdown: 0.02 },
        metrics: { ivPercentile: 55, ivSource: "atr_estimate", ivConfidence: "low" },
      },
      forwardPrices: [18.5, 18.6, 18.4, 18.7, 18.5, 18.8, 18.9, 19.0],
    },
    // 7. AMD — volatile, touches strike but recovers
    {
      setup: { symbol: "AMD", entryPrice: 120, strike: 110, credit: 4.00, dte: 7, score: 76, action: "SELL_PUTS", entryDate: "2026-03-14",
        probability: { method: "monte_carlo", probAboveStrike: 0.71, probTouch: 0.38, avgMaxDrawdown: 0.07 },
        metrics: { ivPercentile: 72, ivSource: "polygon_options", ivConfidence: "medium" },
      },
      forwardPrices: [120, 116, 112, 109.5, 113, 117, 122, 125],
    },
    // 8. BX — credit signal, slow grind loss
    {
      setup: { symbol: "BX", entryPrice: 115, strike: 107, credit: 2.80, dte: 7, score: 62, action: "SELL_PUTS", entryDate: "2026-03-16",
        probability: { method: "monte_carlo", probAboveStrike: 0.74, probTouch: 0.28, avgMaxDrawdown: 0.05 },
        metrics: { ivPercentile: 60, ivSource: "atr_estimate", ivConfidence: "low" },
      },
      forwardPrices: [115, 113, 111, 109, 107.5, 106, 104, 103],
    },
    // 9. SPY — ETF, steady win
    {
      setup: { symbol: "SPY", entryPrice: 520, strike: 495, credit: 3.20, dte: 7, score: 70, action: "SELL_PUTS", entryDate: "2026-03-18",
        probability: { method: "monte_carlo", probAboveStrike: 0.90, probTouch: 0.05, avgMaxDrawdown: 0.015 },
        metrics: { ivPercentile: 52, ivSource: "atr_estimate", ivConfidence: "low" },
      },
      forwardPrices: [520, 522, 518, 521, 525, 523, 526, 528],
    },
    // 10. MSTR — extreme vol, huge swing loss
    {
      setup: { symbol: "MSTR", entryPrice: 350, strike: 310, credit: 12.50, dte: 7, score: 82, action: "SELL_PUTS", entryDate: "2026-03-20",
        probability: { method: "monte_carlo", probAboveStrike: 0.70, probTouch: 0.35, avgMaxDrawdown: 0.08 },
        metrics: { ivPercentile: 92, ivSource: "polygon_options", ivConfidence: "medium" },
      },
      forwardPrices: [350, 340, 325, 310, 295, 280, 275, 270],
    },
  ];
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

const strict = process.argv.includes("--strict");
const thresholds = strict
  ? { minScore: 80, minProbAboveStrike: 0.75, maxTouchProb: 0.30, maxAvgDrawdown: 0.05 }
  : {};

const trades = syntheticTrades();

// 1. Replay alert gates on each trade
console.log("\n  Alert Gate Replay");
console.log("  ─────────────────");
let alertedCount = 0;
for (const t of trades) {
  const replay = replayAlertGates(t.setup, thresholds);
  const label = replay.wouldAlert ? "\x1b[32mALERT\x1b[0m" : "\x1b[90mSKIP\x1b[0m ";
  console.log(`  ${label} ${t.setup.symbol.padEnd(6)} score=${t.setup.score} prob=${((t.setup.probability?.probAboveStrike || 0) * 100).toFixed(0)}% touch=${((t.setup.probability?.probTouch || 0) * 100).toFixed(0)}%`);
  if (replay.wouldAlert) alertedCount++;
}
console.log(`  → ${alertedCount} of ${trades.length} would have alerted${strict ? " (strict thresholds)" : ""}`);

// 2. Run backtest on all trades
const outcomes = runBacktest(trades);

// 3. Summarize
const summary = summarizeBacktest(outcomes);
console.log(formatReport(summary, strict ? "Strict Backtest" : "Default Backtest"));

// 4. If strict mode, compare with default
if (strict) {
  const defaultOutcomes = runBacktest(trades);
  const defaultSummary = summarizeBacktest(defaultOutcomes);
  const delta = compareBacktests(defaultSummary, summary);
  console.log("  Threshold comparison:");
  console.log(`    Win rate: ${delta.winRateChange}`);
  console.log(`    Trade count: ${delta.tradeCountChange}`);
  console.log("");
}

// 5. Individual outcomes
console.log("  Trade-by-trade:");
console.log(`  ${"Symbol".padEnd(8)} ${"Result".padEnd(8)} ${"P&L".padEnd(8)} ${"Touch".padEnd(8)} ${"MaxFav".padEnd(8)} ${"MaxAdv".padEnd(8)} ${"Days→50%".padEnd(8)}`);
console.log(`  ${"─".repeat(56)}`);
for (const o of outcomes) {
  const resultColor = o.result === "WIN" ? "\x1b[32m" : o.result === "LOSS" ? "\x1b[31m" : "\x1b[33m";
  console.log(`  ${o.symbol.padEnd(8)} ${resultColor}${o.result.padEnd(8)}\x1b[0m ${(o.pnlPct * 100).toFixed(1).padStart(5)}%  ${(o.touchedStrike ? "YES" : "no").padEnd(8)} ${("+" + (o.maxFavorableExcursion * 100).toFixed(1) + "%").padEnd(8)} ${((o.maxAdverseExcursion * 100).toFixed(1) + "%").padEnd(8)} ${o.daysToProfitTarget ?? "—"}`);
}
console.log("");
