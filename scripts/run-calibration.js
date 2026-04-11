#!/usr/bin/env node
// =====================================================
// CALIBRATION PASS — chart context vs baseline scoring
// =====================================================
// Compares scoring with and without chart-context adjustments.
// Measures: score shift, signal changes, alert eligibility,
// per-adjustment impact.
//
// Usage: npm run calibrate
// =====================================================

import { scoreSetup } from "../src/lib/engine/setupScoring.js";
import { getChartContext } from "../src/lib/structure/chartContextEngine.js";
import { evaluateAlert, DEFAULT_ALERT_THRESHOLDS } from "../src/lib/alerts/alertEngine.js";
import { monteCarloEstimate } from "../src/lib/engine/probabilityLayer.js";

// --------------------------------------------------
// SYNTHETIC SCENARIOS WITH KNOWN CHART STRUCTURE
// --------------------------------------------------

function makeBar(o, h, l, c) { return { open: o, high: h, low: l, close: c, volume: 1000 }; }

function scenarios() {
  // Build bar arrays with specific structural features

  // 1. CLEAN SETUP: uptrend, near demand zone, clear air to T1
  const cleanBars = [];
  for (let i = 0; i < 30; i++) {
    const base = 100 + i * 0.3 + Math.sin(i * 0.8) * 1.5;
    cleanBars.push(makeBar(base - 0.2, base + 1.2, base - 1.2, base + 0.2));
  }
  // Add demand zone: consolidation then displacement
  cleanBars.push(makeBar(109, 109.5, 108.5, 109.2));
  cleanBars.push(makeBar(109, 109.3, 108.8, 109.1));
  cleanBars.push(makeBar(109, 114, 108.5, 113.5)); // displacement up
  cleanBars.push(makeBar(113.5, 114.5, 113, 114));

  // 2. TRAP SETUP: under resistance, supply overhead, overextended
  const trapBars = [];
  for (let i = 0; i < 25; i++) {
    const base = 120 - i * 0.2 + Math.sin(i * 0.6) * 2;
    trapBars.push(makeBar(base + 0.2, base + 1.5, base - 1.5, base - 0.2));
  }
  // Price recovers into resistance
  for (let i = 0; i < 10; i++) {
    const base = 116 + i * 0.4;
    trapBars.push(makeBar(base - 0.1, base + 0.8, base - 0.8, base + 0.1));
  }

  // 3. NEUTRAL: sideways, no clear zones, mixed candles
  const neutralBars = [];
  for (let i = 0; i < 30; i++) {
    const base = 50 + Math.sin(i * 0.5) * 1;
    neutralBars.push(makeBar(base - 0.3, base + 0.8, base - 0.8, base + 0.3));
  }

  // 4. REVERSAL AT SUPPORT: downtrend, hits support, bullish engulfing
  const reversalBars = [];
  for (let i = 0; i < 20; i++) {
    const base = 90 - i * 0.4 + Math.sin(i * 0.7) * 1.2;
    reversalBars.push(makeBar(base + 0.2, base + 1, base - 1, base - 0.2));
  }
  // Consolidation at support then bounce
  reversalBars.push(makeBar(82, 82.5, 80, 80.5)); // bearish
  reversalBars.push(makeBar(80.5, 83, 80, 82.8)); // bullish engulfing
  reversalBars.push(makeBar(82.8, 84, 82, 83.5));

  return [
    {
      label: "CLEAN: uptrend + demand zone + clear air",
      bars: cleanBars,
      price: 114,
      targetPrice: 120,
      setup: _makeSetup("NVDA", 114, 75, 0.03, 0.02, 0.01, 1.4, 72),
    },
    {
      label: "TRAP: under resistance + supply overhead + extended",
      bars: trapBars,
      price: 120,
      targetPrice: 125,
      setup: _makeSetup("TSLA", 120, 70, 0.02, 0.015, 0.005, 1.6, 68),
    },
    {
      label: "NEUTRAL: sideways, no clear structure",
      bars: neutralBars,
      price: 50,
      targetPrice: 55,
      setup: _makeSetup("ARCC", 50, 55, 0.005, 0.003, 0.002, 1.1, 55),
    },
    {
      label: "REVERSAL: at support with bullish engulfing",
      bars: reversalBars,
      price: 83.5,
      targetPrice: 90,
      setup: _makeSetup("BE", 83.5, 65, 0.02, 0.015, 0.008, 1.3, 62),
    },
  ];
}

function _makeSetup(symbol, price, ivPct, leaderMov, powerMov, followerMov, atrMult, ivPercentile) {
  return {
    symbol, price, prevClose: price * 0.98,
    leaderMovePct: leaderMov, powerMovePct: powerMov, followerMovePct: followerMov,
    atrExpansionMultiple: atrMult, ivPercentile, distT1Pct: 5,
    nearSupport: false, putCallRatio: 1.1,
    ivSource: "polygon_options", ivConfidence: "medium",
    bid: 3, ask: 3.5,
    strikeCandidates: [price * 0.95, price * 0.9, price * 0.85].map(Math.round),
  };
}

// --------------------------------------------------
// MARKET REGIME (constant for comparison)
// --------------------------------------------------

const MARKET = {
  mode: "RISK_ON",
  bias: "NORMAL_OPERATIONS",
  score: 75,
  creditStress: false,
  volatilityActive: false,
  fearBand: false,
  fearSpike: false,
  vixRising: false,
  flags: { hygWeak: false, kreWeak: false, atrExpanded: false },
  indicators: { hyg: 82, kre: 70, lqd: 105, vix: 18, vixPrev: 19 },
};

// --------------------------------------------------
// CALIBRATION
// --------------------------------------------------

console.log("\n  Chart Context Calibration Report");
console.log("  ────────────────────────────────\n");

const results = [];

for (const scenario of scenarios()) {
  // Baseline: score without chart context
  const baseline = scoreSetup(scenario.setup, MARKET);

  // Chart context
  const chartCtx = getChartContext({
    bars: scenario.bars,
    currentPrice: scenario.price,
    targetPrice: scenario.targetPrice,
  });

  // Enhanced: baseline + chart adjustments (clamped)
  const enhanced = Math.max(0, Math.min(100, baseline.score + chartCtx.chartScoreAdjustments));

  // Signal comparison
  const baselineSignal = baseline.score >= 75 ? "GO" : baseline.score >= 55 ? "WATCH" : "NO_TRADE";
  const enhancedSignal = enhanced >= 75 ? "GO" : enhanced >= 55 ? "WATCH" : "NO_TRADE";
  const signalChanged = baselineSignal !== enhancedSignal;

  // MC probability (for alert eligibility)
  const strike = scenario.price * 0.9;
  const prob = monteCarloEstimate({
    price: scenario.price, strike, dte: 7,
    ivPercentile: scenario.setup.ivPercentile, N: 500,
  });

  // Alert eligibility
  const baselineCard = {
    score: baseline.score, action: "SELL_PUTS", signal: baselineSignal,
    probability: prob, metrics: { ivPercentile: scenario.setup.ivPercentile, ivConfidence: "medium" },
  };
  const enhancedCard = { ...baselineCard, score: enhanced, signal: enhancedSignal };

  const baselineAlert = evaluateAlert(baselineCard);
  const enhancedAlert = evaluateAlert(enhancedCard);

  const result = {
    label: scenario.label,
    symbol: scenario.setup.symbol,
    baselineScore: baseline.score,
    enhancedScore: enhanced,
    delta: enhanced - baseline.score,
    chartAdj: chartCtx.chartScoreAdjustments,
    baselineSignal,
    enhancedSignal,
    signalChanged,
    baselineAlert: baselineAlert.shouldAlert,
    enhancedAlert: enhancedAlert.shouldAlert,
    alertChanged: baselineAlert.shouldAlert !== enhancedAlert.shouldAlert,
    traceEntries: chartCtx.scoreTrace,
    chartConfidence: chartCtx.confidence,
    trendBias: chartCtx.swingStructure?.trendBias,
    nearestSupportPct: chartCtx.nearestSupportPct,
    nearestResistancePct: chartCtx.nearestResistancePct,
    insideDemandZone: chartCtx.insideDemandZone,
    atrExtension: chartCtx.atrContext?.extensionState,
  };

  results.push(result);

  // Print
  const deltaColor = result.delta > 0 ? "\x1b[32m" : result.delta < 0 ? "\x1b[31m" : "\x1b[90m";
  console.log(`  ${result.label}`);
  console.log(`    Symbol: ${result.symbol} | Baseline: ${result.baselineScore} (${result.baselineSignal}) | Enhanced: ${result.enhancedScore} (${result.enhancedSignal}) | ${deltaColor}Delta: ${result.delta > 0 ? "+" : ""}${result.delta}\x1b[0m`);
  console.log(`    Chart adj: ${result.chartAdj} | Confidence: ${result.chartConfidence} | Trend: ${result.trendBias}`);
  console.log(`    Support: ${result.nearestSupportPct != null ? (result.nearestSupportPct * 100).toFixed(1) + "%" : "—"} | Resistance: ${result.nearestResistancePct != null ? (result.nearestResistancePct * 100).toFixed(1) + "%" : "—"} | Demand: ${result.insideDemandZone ? "YES" : "no"} | ATR: ${result.atrExtension}`);
  if (result.signalChanged) console.log(`    \x1b[33m⚠ Signal changed: ${result.baselineSignal} → ${result.enhancedSignal}\x1b[0m`);
  if (result.alertChanged) console.log(`    \x1b[33m⚠ Alert eligibility changed: ${result.baselineAlert} → ${result.enhancedAlert}\x1b[0m`);
  if (result.traceEntries.length > 0) {
    console.log("    Trace:");
    for (const t of result.traceEntries) {
      const c = t.pts > 0 ? "\x1b[32m" : t.pts < 0 ? "\x1b[31m" : "\x1b[90m";
      console.log(`      ${c}${t.pts > 0 ? "+" : ""}${t.pts}\x1b[0m ${t.reason}`);
    }
  }
  console.log("");
}

// --------------------------------------------------
// AGGREGATE SUMMARY
// --------------------------------------------------

console.log("  ─── Aggregate Summary ───\n");

const avgDelta = results.reduce((s, r) => s + r.delta, 0) / results.length;
const signalChanges = results.filter(r => r.signalChanged).length;
const alertChanges = results.filter(r => r.alertChanged).length;
const positiveAdj = results.filter(r => r.chartAdj > 0).length;
const negativeAdj = results.filter(r => r.chartAdj < 0).length;
const neutralAdj = results.filter(r => r.chartAdj === 0).length;

console.log(`  Scenarios: ${results.length}`);
console.log(`  Avg score delta: ${avgDelta > 0 ? "+" : ""}${avgDelta.toFixed(1)}`);
console.log(`  Signal changes: ${signalChanges} of ${results.length}`);
console.log(`  Alert eligibility changes: ${alertChanges} of ${results.length}`);
console.log(`  Positive adjustments: ${positiveAdj} | Negative: ${negativeAdj} | Neutral: ${neutralAdj}`);

// Per-adjustment impact
const allTraces = results.flatMap(r => r.traceEntries);
const adjTypes = {};
for (const t of allTraces) {
  const key = t.reason.split(":")[0].trim();
  if (!adjTypes[key]) adjTypes[key] = { count: 0, totalPts: 0 };
  adjTypes[key].count++;
  adjTypes[key].totalPts += t.pts;
}

console.log("\n  Per-adjustment breakdown:");
for (const [type, stats] of Object.entries(adjTypes).sort((a, b) => b[1].totalPts - a[1].totalPts)) {
  console.log(`    ${type}: fired ${stats.count}x, total ${stats.totalPts > 0 ? "+" : ""}${stats.totalPts}pts`);
}

// Recommendations
console.log("\n  ─── Recommendations ───\n");

if (Math.abs(avgDelta) < 3) {
  console.log("  Chart context adjustments are well-balanced (avg delta < ±3).");
} else if (avgDelta > 5) {
  console.log("  ⚠ Chart context may be too generous. Consider reducing positive weights.");
} else if (avgDelta < -5) {
  console.log("  ⚠ Chart context may be too punitive. Consider reducing penalty weights.");
}

if (signalChanges === 0) {
  console.log("  Chart context did not change any signals — acting as refinement, not override. ✓");
} else {
  console.log(`  Chart context changed ${signalChanges} signal(s) — review whether these shifts are correct.`);
}

if (alertChanges === 0) {
  console.log("  Alert eligibility unchanged by chart context — alerts remain stable. ✓");
}

console.log("  Current weights appear suitable for v1. Monitor with real market data.\n");
