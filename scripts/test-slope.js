#!/usr/bin/env node
// =====================================================
// Tests for slope/trend calculation utilities.
// Run: npm run test:slope
// =====================================================

import { computeSlope, computeMA, computeMASlope, computeAcceleration, analyzeTrend } from "../src/lib/priceHistory.js";

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

console.log("\n  Slope / Trend Tests");
console.log("  ───────────────────\n");

// --- Generate test price series ---
function rising(n, start = 100, step = 0.1) {
  return Array.from({ length: n }, (_, i) => start + i * step);
}
function falling(n, start = 100, step = 0.1) {
  return Array.from({ length: n }, (_, i) => start - i * step);
}
function flat(n, price = 100) {
  return Array.from({ length: n }, () => price);
}
function noisy(n, start = 100) {
  // Sideways with noise
  return Array.from({ length: n }, (_, i) => start + Math.sin(i * 0.5) * 0.3);
}

// 1. computeSlope — positive slope
const upSlope = computeSlope(rising(30));
assert("Rising series has positive slope", upSlope !== null && upSlope.slope > 0);
assert("Rising series has high R²", upSlope.r2 > 0.9);
assert("Rising series reports 30 bars", upSlope.bars === 30);

// 2. computeSlope — negative slope
const downSlope = computeSlope(falling(30));
assert("Falling series has negative slope", downSlope !== null && downSlope.slope < 0);
assert("Falling series has high R²", downSlope.r2 > 0.9);

// 3. computeSlope — flat
const flatSlope = computeSlope(flat(30));
assert("Flat series has ~zero slope", flatSlope !== null && Math.abs(flatSlope.slope) < 0.0001);

// 4. computeSlope — noisy/sideways
const noisySlope = computeSlope(noisy(30));
assert("Noisy series has near-zero slope", noisySlope !== null && Math.abs(noisySlope.slope) < 0.01);
assert("Noisy series has low R²", noisySlope.r2 < 0.5);

// 5. computeSlope — insufficient bars
assert("Returns null for 2 bars", computeSlope([100, 101]) === null);
assert("Returns null for empty array", computeSlope([]) === null);
assert("Returns null for null input", computeSlope(null) === null);

// 6. computeMA
const ma5 = computeMA(rising(10), 5);
assert("MA5 returns a number", typeof ma5 === "number");
assert("MA5 of rising series > start", ma5 > 100);
assert("MA with insufficient bars returns null", computeMA([100, 101], 5) === null);

// 7. computeMASlope
const maSlope = computeMASlope(rising(30), 5, 10);
assert("MA slope of rising series is positive", maSlope !== null && maSlope.slope > 0);
assert("MA slope returns null for short series", computeMASlope(rising(5), 5, 10) === null);

// 8. computeAcceleration
// Accelerating: first half slow rise, second half fast rise
const accelerating = [
  ...Array.from({ length: 15 }, (_, i) => 100 + i * 0.05),
  ...Array.from({ length: 15 }, (_, i) => 100.75 + i * 0.2),
];
const accel = computeAcceleration(accelerating, 15);
assert("Accelerating series has positive acceleration", accel !== null && accel.acceleration > 0);
assert("Recent slope > older slope in accelerating", accel.recentSlope > accel.olderSlope);

// Decelerating
const decelerating = [
  ...Array.from({ length: 15 }, (_, i) => 100 + i * 0.2),
  ...Array.from({ length: 15 }, (_, i) => 103 + i * 0.02),
];
const decel = computeAcceleration(decelerating, 15);
assert("Decelerating series has negative acceleration", decel !== null && decel.acceleration < 0);

assert("Acceleration returns null for short series", computeAcceleration(rising(10), 15) === null);

// 9. analyzeTrend — full analysis
const upTrend = analyzeTrend(rising(60));
assert("analyzeTrend reports available=true", upTrend.available === true);
assert("analyzeTrend reports turningUp for rising", upTrend.turningUp === true);
assert("analyzeTrend reports strongTrend for clear rise", upTrend.strongTrend === true);
assert("analyzeTrend reports high confidence for 60 bars", upTrend.confidence === "high");
assert("analyzeTrend has slope number", typeof upTrend.slope === "number");
assert("analyzeTrend has shortMA", upTrend.shortMA !== null);
assert("analyzeTrend has priceAboveMA for uptrend", upTrend.priceAboveMA === true);

const downTrend = analyzeTrend(falling(60));
assert("analyzeTrend reports turningUp=false for falling", downTrend.turningUp === false);

// 10. analyzeTrend — insufficient data
const thin = analyzeTrend([100, 101]);
assert("analyzeTrend reports available=false for 2 bars", thin.available === false);
assert("analyzeTrend gives reason for insufficient", thin.reason === "insufficient bars");

const empty = analyzeTrend(null);
assert("analyzeTrend handles null input", empty.available === false);

// 11. Confidence levels
const mediumConf = analyzeTrend(rising(15));
assert("15-bar rising series has medium confidence", mediumConf.confidence === "medium" || mediumConf.confidence === "high");

const lowConf = analyzeTrend(noisy(8));
assert("8-bar noisy series has low confidence", lowConf.confidence === "low");

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
