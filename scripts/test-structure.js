#!/usr/bin/env node
// =====================================================
// Tests for chart structure modules.
// Run: npm run test:structure
// =====================================================

import { detectCandlePatterns, getRecentPatterns } from "../src/lib/structure/candlePatterns.js";
import { detectSwings, analyzeSwingStructure } from "../src/lib/structure/swingStructure.js";
import { detectZones, computeATR } from "../src/lib/structure/zoneDetection.js";
import { detectSupplyDemand } from "../src/lib/structure/supplyDemand.js";
import { getChartContext, ENABLE_CHART_CONTEXT } from "../src/lib/structure/chartContextEngine.js";

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

// --- Test data generators ---
function makeBars(closes, baseOpen) {
  return closes.map((c, i) => {
    const o = baseOpen || (i === 0 ? c : closes[i - 1]);
    return { open: o, high: Math.max(o, c) + 0.5, low: Math.min(o, c) - 0.5, close: c, volume: 1000 };
  });
}

function makeUptrend(n, start = 100) {
  // Create a wavy uptrend with clear swing highs and lows
  const bars = [];
  for (let i = 0; i < n; i++) {
    const wave = Math.sin(i * 0.7) * 2; // oscillation
    const trend = i * 0.5; // upward drift
    const mid = start + trend + wave;
    const o = mid - 0.3;
    const c = mid + 0.3;
    bars.push({ open: o, high: Math.max(o, c) + 1, low: Math.min(o, c) - 1, close: c, volume: 1000 });
  }
  return bars;
}

function makeDowntrend(n, start = 100) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const wave = Math.sin(i * 0.7) * 2;
    const trend = -i * 0.5;
    const mid = start + trend + wave;
    const o = mid + 0.3;
    const c = mid - 0.3;
    bars.push({ open: o, high: Math.max(o, c) + 1, low: Math.min(o, c) - 1, close: c, volume: 1000 });
  }
  return bars;
}

console.log("\n  Chart Structure Tests");
console.log("  ─────────────────────\n");

// ===========================
// CANDLE PATTERNS
// ===========================
console.log("  -- Candle Patterns --");

// Bullish engulfing: prev bearish (close < open), curr bullish (close > open),
// curr.open <= prev.close, curr.close >= prev.open, currBody > prevBody
const engulfBars = [
  { open: 102, high: 102.5, low: 99, close: 99.5, volume: 100 }, // bearish: body = 2.5
  { open: 99.5, high: 103.5, low: 99, close: 103, volume: 200 }, // bullish: body = 3.5, engulfs prev
];
const engulf = detectCandlePatterns(engulfBars);
assert("Bullish engulfing detected", engulf.some(p => p.type === "bullish_engulfing"));
assert("Bullish engulfing is bullish", engulf.find(p => p.type === "bullish_engulfing")?.bullish === true);

// Hammer: small body at top, long lower wick >= 2x body, upper wick <= 0.5x body
const hammerBars = [
  { open: 100, high: 101, low: 99, close: 100, volume: 100 },
  { open: 99, high: 99.5, low: 95, close: 99.4, volume: 200 }, // body=0.4, lower=4, upper=0.1
];
const hammer = detectCandlePatterns(hammerBars);
assert("Hammer detected", hammer.some(p => p.type === "hammer"));

// Doji
const dojiBars = [
  { open: 100, high: 101, low: 99, close: 100, volume: 100 },
  { open: 100, high: 102, low: 98, close: 100.01, volume: 200 }, // tiny body, wide range
];
const doji = detectCandlePatterns(dojiBars);
assert("Doji detected", doji.some(p => p.type === "doji"));

// Inside bar
const insideBars = [
  { open: 100, high: 105, low: 95, close: 102, volume: 100 },
  { open: 101, high: 103, low: 97, close: 100, volume: 200 }, // range inside prev
];
const inside = detectCandlePatterns(insideBars);
assert("Inside bar detected", inside.some(p => p.type === "inside_bar"));

// Empty / malformed
assert("Empty bars returns []", detectCandlePatterns([]).length === 0);
assert("Null bars returns []", detectCandlePatterns(null).length === 0);
assert("1 bar returns [] (need at least 2)", detectCandlePatterns([{ open: 1, high: 2, low: 0, close: 1.5 }]).length === 0);

// Pattern shape
if (engulf.length > 0) {
  const p = engulf[0];
  assert("Pattern has type", typeof p.type === "string");
  assert("Pattern has bullish", typeof p.bullish === "boolean");
  assert("Pattern has confidence 0-1", p.confidence >= 0 && p.confidence <= 1);
  assert("Pattern has barIndex", typeof p.barIndex === "number");
}

// getRecentPatterns
const recentP = getRecentPatterns(engulfBars, 5);
assert("getRecentPatterns returns array", Array.isArray(recentP));

// ===========================
// SWING STRUCTURE
// ===========================
console.log("  -- Swing Structure --");

const uptrendBars = makeUptrend(30);
const swing = analyzeSwingStructure(uptrendBars);
assert("Uptrend: trendBias = BULLISH", swing.trendBias === "BULLISH");
assert("Uptrend: has swing highs", swing.swings.highs.length > 0);
assert("Uptrend: has swing lows", swing.swings.lows.length > 0);
assert("Uptrend: higherHighs > 0", swing.higherHighs > 0);

const downtrendBars = makeDowntrend(30);
const downSwing = analyzeSwingStructure(downtrendBars);
assert("Downtrend: trendBias = BEARISH", downSwing.trendBias === "BEARISH");
assert("Downtrend: lowerLows > 0", downSwing.lowerLows > 0);

// Structure events
assert("Structure has lastStructureEvent field", "lastStructureEvent" in swing);

// Empty input
const emptySwing = analyzeSwingStructure([]);
assert("Empty bars: trendBias = NEUTRAL", emptySwing.trendBias === "NEUTRAL");

// ===========================
// ZONE DETECTION (S/R)
// ===========================
console.log("  -- Zone Detection --");

const atr = computeATR(uptrendBars);
assert("ATR is positive for uptrend", atr > 0);
assert("ATR is 0 for empty bars", computeATR([]) === 0);

const zones = detectZones(uptrendBars);
assert("Zones: has supportZones array", Array.isArray(zones.supportZones));
assert("Zones: has resistanceZones array", Array.isArray(zones.resistanceZones));
assert("Zones: has nearestSupportPct", zones.nearestSupportPct === null || typeof zones.nearestSupportPct === "number");
assert("Zones: has currentPrice", zones.currentPrice > 0);

// Zone shape
if (zones.supportZones.length > 0) {
  const z = zones.supportZones[0];
  assert("Zone has low/high/touches/confidence/fresh", z.low >= 0 && z.high >= z.low && typeof z.touches === "number" && typeof z.confidence === "number" && typeof z.fresh === "boolean");
}

// Empty input
const emptyZones = detectZones([]);
assert("Empty bars: no zones", emptyZones.supportZones.length === 0);

// ===========================
// SUPPLY / DEMAND
// ===========================
console.log("  -- Supply/Demand --");

// Create bars with consolidation then displacement
const sdBars = [
  ...Array.from({ length: 5 }, (_, i) => ({ open: 100, high: 101, low: 99, close: 100 + (i % 2) * 0.2, volume: 100 })), // base
  { open: 100, high: 106, low: 100, close: 105, volume: 500 }, // upward displacement
  ...Array.from({ length: 5 }, (_, i) => ({ open: 105 + i * 0.3, high: 106 + i * 0.3, low: 104 + i * 0.3, close: 105.5 + i * 0.3, volume: 100 })),
];
const sd = detectSupplyDemand(sdBars);
assert("SD: has demandZones array", Array.isArray(sd.demandZones));
assert("SD: has supplyZones array", Array.isArray(sd.supplyZones));
assert("SD: insideDemandZone is boolean", typeof sd.insideDemandZone === "boolean");
assert("SD: insideSupplyZone is boolean", typeof sd.insideSupplyZone === "boolean");

// Zone shape
if (sd.demandZones.length > 0) {
  const dz = sd.demandZones[0];
  assert("Demand zone has low/high/confidence/fresh", dz.low >= 0 && dz.high >= dz.low && typeof dz.confidence === "number" && typeof dz.fresh === "boolean");
}

// Empty input
const emptySD = detectSupplyDemand([]);
assert("Empty bars: no SD zones", emptySD.demandZones.length === 0);

// ===========================
// CHART CONTEXT ENGINE
// ===========================
console.log("  -- Chart Context Engine --");

const ctx = getChartContext({ bars: uptrendBars, currentPrice: uptrendBars[uptrendBars.length - 1].close, targetPrice: 150, stopPrice: 90 });
assert("Context: has candleSignals", Array.isArray(ctx.candleSignals));
assert("Context: has swingStructure", ctx.swingStructure !== null);
assert("Context: has supportZones", Array.isArray(ctx.supportZones));
assert("Context: has demandZones", Array.isArray(ctx.demandZones));
assert("Context: has atrContext", ctx.atrContext !== null);
assert("Context: atrContext has extensionState", typeof ctx.atrContext.extensionState === "string");
assert("Context: has scoreTrace", Array.isArray(ctx.scoreTrace));
assert("Context: has chartScoreAdjustments", typeof ctx.chartScoreAdjustments === "number");
assert("Context: has confidence", typeof ctx.confidence === "number");
assert("Context: has atr", typeof ctx.atr === "number");
assert("Context: enabled flag", typeof ctx.enabled === "boolean");

// Score cap
assert("Score adjustments capped at ±15", ctx.chartScoreAdjustments >= -15 && ctx.chartScoreAdjustments <= 15);

// Score trace entries have source
if (ctx.scoreTrace.length > 0) {
  assert("Score trace entries have source='chart_context'", ctx.scoreTrace[0].source === "chart_context");
}

// Empty input
const emptyCtx = getChartContext({ bars: [], currentPrice: 100 });
assert("Empty bars: returns empty context", emptyCtx.chartScoreAdjustments === 0);
assert("Empty bars: confidence = 0", emptyCtx.confidence === 0);

// Null input
const nullCtx = getChartContext({ bars: null, currentPrice: 0 });
assert("Null input: safe empty context", nullCtx.supportZones.length === 0);

// Room to target
assert("Context: roomToTarget exists or null", ctx.roomToTarget === null || typeof ctx.roomToTarget === "object");
if (ctx.roomToTarget) {
  assert("roomToTarget: has distPct", typeof ctx.roomToTarget.distPct === "number");
  assert("roomToTarget: has clearPath", typeof ctx.roomToTarget.clearPath === "boolean");
}

// Feature flag
assert("ENABLE_CHART_CONTEXT is exported", typeof ENABLE_CHART_CONTEXT === "boolean");

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
