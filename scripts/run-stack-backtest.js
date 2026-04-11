#!/usr/bin/env node
// =====================================================
// Run stack reversal backtest against synthetic scenarios.
// Usage: npm run backtest:stack
// =====================================================

import { runStackBacktest, summarizeStackBacktest, formatStackReport } from "../src/lib/backtest/stackReversalBacktest.js";

// --------------------------------------------------
// SYNTHETIC REVERSAL SCENARIOS
// --------------------------------------------------
// Each simulates an NVDA reversal event with power confirmation
// and follower forward paths for NBIS and NEBX.

function syntheticEvents() {
  return [
    // 1. EARLY stage — strong reversal, clean run to T1/T2
    {
      date: "2026-03-01", stage: "EARLY", score: 95,
      leaderPrice: 110, leaderMomentum: 0.025, powerStrength: 0.67, followerLag: 0.01,
      bestFollower: "NEBX",
      nbisEntryPrice: 108, nebxEntryPrice: 35,
      targets: [37, 38.5, 40], stop: 32,
      nbisForwardPrices: [108, 110, 113, 115, 116, 118],
      nebxForwardPrices: [35, 36.2, 37.5, 38.8, 39.2, 40.5],
      nvdaForwardPrices: [110, 112, 114, 115, 116, 117],
    },
    // 2. EARLY stage — reversal but power fades, follower stalls
    {
      date: "2026-03-03", stage: "EARLY", score: 88,
      leaderPrice: 109, leaderMomentum: 0.018, powerStrength: 0.5, followerLag: 0.008,
      bestFollower: "NBIS",
      nbisEntryPrice: 106, nebxEntryPrice: 33,
      targets: [37, 38.5, 40], stop: 32,
      nbisForwardPrices: [106, 107, 106.5, 105, 104, 103],
      nebxForwardPrices: [33, 33.8, 33.2, 32.5, 31.8, 31],
      nvdaForwardPrices: [109, 110, 109.5, 108, 107, 106],
    },
    // 3. MID stage — moderate entry, hits T1 then reverses
    {
      date: "2026-03-05", stage: "MID", score: 82,
      leaderPrice: 112, leaderMomentum: 0.015, powerStrength: 0.67, followerLag: 0.005,
      bestFollower: "NEBX",
      nbisEntryPrice: 112, nebxEntryPrice: 36,
      targets: [37, 38.5, 40], stop: 32,
      nbisForwardPrices: [112, 114, 116, 115, 113, 111],
      nebxForwardPrices: [36, 37.2, 38, 37.5, 36.8, 35.5],
      nvdaForwardPrices: [112, 113.5, 114, 113, 112, 111],
    },
    // 4. MID stage — clean win, NBIS outperforms NEBX
    {
      date: "2026-03-08", stage: "MID", score: 78,
      leaderPrice: 108, leaderMomentum: 0.012, powerStrength: 0.83, followerLag: 0.007,
      bestFollower: "NBIS",
      nbisEntryPrice: 105, nebxEntryPrice: 32,
      targets: [37, 38.5, 40], stop: 32,
      nbisForwardPrices: [105, 108, 112, 115, 118, 120],
      nebxForwardPrices: [32, 33.5, 35, 36, 36.8, 37.2],
      nvdaForwardPrices: [108, 110, 112, 114, 115, 116],
    },
    // 5. LATE stage — exhausted, minimal upside, touches stop
    {
      date: "2026-03-10", stage: "LATE", score: 65,
      leaderPrice: 115, leaderMomentum: 0.008, powerStrength: 0.5, followerLag: 0.002,
      bestFollower: "NEBX",
      nbisEntryPrice: 118, nebxEntryPrice: 39,
      targets: [40, 41.5, 43], stop: 36,
      nbisForwardPrices: [118, 117, 115, 114, 113, 112],
      nebxForwardPrices: [39, 38.5, 37, 36.2, 35.5, 35],
      nvdaForwardPrices: [115, 114, 113, 112, 111, 110],
    },
    // 6. EARLY stage — volatile, hits stop then recovers (too late)
    {
      date: "2026-03-12", stage: "EARLY", score: 90,
      leaderPrice: 105, leaderMomentum: 0.03, powerStrength: 1.0, followerLag: 0.015,
      bestFollower: "NEBX",
      nbisEntryPrice: 100, nebxEntryPrice: 30,
      targets: [37, 38.5, 40], stop: 32,
      nbisForwardPrices: [100, 96, 93, 97, 102, 108],
      nebxForwardPrices: [30, 28, 26, 29, 33, 38],
      nvdaForwardPrices: [105, 102, 99, 103, 108, 112],
    },
    // 7. EARLY stage — picture-perfect, all 3 targets hit
    {
      date: "2026-03-15", stage: "EARLY", score: 98,
      leaderPrice: 107, leaderMomentum: 0.035, powerStrength: 1.0, followerLag: 0.02,
      bestFollower: "NEBX",
      nbisEntryPrice: 102, nebxEntryPrice: 31,
      targets: [37, 38.5, 40], stop: 32,
      nbisForwardPrices: [102, 106, 110, 115, 120, 125],
      nebxForwardPrices: [31, 34, 37.5, 39, 41, 43],
      nvdaForwardPrices: [107, 110, 113, 116, 118, 120],
    },
    // 8. MID stage — NEBX leverage amplifies loss
    {
      date: "2026-03-18", stage: "MID", score: 75,
      leaderPrice: 111, leaderMomentum: 0.01, powerStrength: 0.5, followerLag: 0.003,
      bestFollower: "NEBX",
      nbisEntryPrice: 110, nebxEntryPrice: 36,
      targets: [37, 38.5, 40], stop: 32,
      nbisForwardPrices: [110, 108, 106, 104, 103, 102],
      nebxForwardPrices: [36, 34, 31.5, 29, 28, 27],
      nvdaForwardPrices: [111, 109, 107, 105, 104, 103],
    },
  ];
}

// --------------------------------------------------
// RUN
// --------------------------------------------------

const events = syntheticEvents();
const outcomes = runStackBacktest(events);
const summary = summarizeStackBacktest(outcomes);

console.log(formatStackReport(summary));

// Per-event detail
console.log("  Per-event detail:");
console.log(`  ${"Date".padEnd(12)} ${"Stage".padEnd(7)} ${"Score".padEnd(6)} ${"NVDA".padEnd(8)} ${"NBIS".padEnd(12)} ${"NEBX".padEnd(12)} ${"Picker".padEnd(8)}`);
console.log(`  ${"─".repeat(65)}`);

for (const o of outcomes) {
  const nvda = (o.nvdaForwardMove * 100).toFixed(1) + "%";
  const nbis = `${o.nbis.result.slice(0, 4)} ${(o.nbis.maxFavPct * 100).toFixed(0)}%↑`;
  const nebx = `${o.nebx.result.slice(0, 4)} ${(o.nebx.maxFavPct * 100).toFixed(0)}%↑`;
  const picker = o.pickedCorrectly ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${o.date.padEnd(12)} ${o.stage.padEnd(7)} ${String(o.score).padEnd(6)} ${nvda.padEnd(8)} ${nbis.padEnd(12)} ${nebx.padEnd(12)} ${picker} ${o.bestFollowerPicked}`);
}
console.log("");
