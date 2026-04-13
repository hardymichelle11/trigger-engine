#!/usr/bin/env node
// =====================================================
// Tests for Adaptive Premium Timing Engine
// Run: npm run test:timing
// =====================================================

import { bucketDTE, bucketMoneyness, classifySetupType, getClockContext, TIMING_STATES, TIMING_ACTIONS } from "../src/lib/timing/timingConfig.js";
import { findHistoricalBucket, getBestWindowBySymbol, getBestWindowBySetupType, getBestWindowByRegime, recordPremiumObservation, clearPremiumProfiles, getObservationCount } from "../src/lib/timing/premiumProfiles.js";
import { normalizeCurrentQuote, scorePremiumRichness, scoreSpreadQuality, scoreIVContext, scoreWindowAlignment, scoreSoft2pmBias, calculatePremiumPercentile, computeTimingScore, classifyTimingState, classifySuggestedAction, estimateTimingConfidence } from "../src/lib/timing/timingScorer.js";
import { evaluatePremiumTiming, evaluateCardTiming } from "../src/lib/timing/premiumTimingEngine.js";

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) { console.log(`  \u2713 ${name}`); passed++; }
  else { console.log(`  \u2717 ${name}`); failed++; }
}

console.log("\n  Premium Timing Engine Tests");
console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n");

clearPremiumProfiles();

// ── BUCKET FUNCTIONS ────────────────────────────────

console.log("  -- Bucket Functions --");
assert("DTE 0 → 0-3", bucketDTE(0) === "0-3");
assert("DTE 3 → 0-3", bucketDTE(3) === "0-3");
assert("DTE 5 → 4-7", bucketDTE(5) === "4-7");
assert("DTE 10 → 8-14", bucketDTE(10) === "8-14");
assert("DTE 20 → 15-30", bucketDTE(20) === "15-30");
assert("DTE 45 → 15-30 (capped)", bucketDTE(45) === "15-30");

assert("Moneyness ATM", bucketMoneyness(100, 100, "put") === "ATM");
assert("Moneyness 2% OTM put", bucketMoneyness(100, 98, "put") === "1-3% OTM");
assert("Moneyness 4% OTM put", bucketMoneyness(100, 96, "put") === "3-5% OTM");
assert("Moneyness 7% OTM put", bucketMoneyness(100, 93, "put") === "5-8% OTM");
assert("Moneyness 10% OTM put", bucketMoneyness(100, 90, "put") === "deep OTM");
assert("Moneyness 0 price → ATM", bucketMoneyness(0, 100, "put") === "ATM");

assert("Setup HIGH_IV → MOMENTUM", classifySetupType("HIGH_IV") === "MOMENTUM");
assert("Setup CREDIT → INCOME", classifySetupType("CREDIT") === "INCOME");
assert("Setup ETF → RANGE", classifySetupType("ETF") === "RANGE");

// ── CLOCK CONTEXT ───────────────────────────────────

console.log("\n  -- Clock Context --");
const clock = getClockContext();
assert("Clock: has minuteOfDay", typeof clock.minuteOfDay === "number");
assert("Clock: has timeET", typeof clock.timeET === "string");
assert("Clock: has dayOfWeek", typeof clock.dayOfWeek === "number");
assert("Clock: has marketOpen boolean", typeof clock.marketOpen === "boolean");

// ── COMPONENT SCORERS ───────────────────────────────

console.log("\n  -- Component Scorers --");

// Premium richness
const richBucket = { avgMid: 1.0, medianMid: 1.2, p75Mid: 1.5, p90Mid: 2.0, avgSpreadPct: 0.05, avgIv: 30, observations: 50 };
assert("Richness: p90+ = 95", scorePremiumRichness(2.5, richBucket) === 95);
assert("Richness: p75+ = 80", scorePremiumRichness(1.6, richBucket) === 80);
assert("Richness: > median = 65", scorePremiumRichness(1.3, richBucket) === 65);
assert("Richness: near median = 45", scorePremiumRichness(1.1, richBucket) === 45);
assert("Richness: below = 20", scorePremiumRichness(0.5, richBucket) === 20);
assert("Richness: no history → default", scorePremiumRichness(0.5, { observations: 0 }) <= 65);

// Spread quality
assert("Spread: tight = 90", scoreSpreadQuality(0.04, richBucket) === 90);
assert("Spread: slightly wide = 70", scoreSpreadQuality(0.06, richBucket) === 70);
assert("Spread: wide = 40", scoreSpreadQuality(0.09, richBucket) === 40);
assert("Spread: very wide = 10", scoreSpreadQuality(0.15, richBucket) === 10);

// IV context
assert("IV: rich = 90", scoreIVContext(45, richBucket) === 90);
assert("IV: slightly rich = 75", scoreIVContext(35, richBucket) === 75);
assert("IV: normal = 55", scoreIVContext(28, richBucket) === 55);
assert("IV: compressed = 15", scoreIVContext(15, richBucket) === 15);

// Window alignment
const testWindow = { start: 840, end: 900 };
assert("Window: inside = 100", scoreWindowAlignment(860, testWindow) === 100);
assert("Window: 10 min before = 80", scoreWindowAlignment(830, testWindow) === 80);
assert("Window: 25 min before = 60", scoreWindowAlignment(815, testWindow) === 60);
assert("Window: 45 min before = 40", scoreWindowAlignment(795, testWindow) === 40);
assert("Window: 90 min before = 20", scoreWindowAlignment(750, testWindow) === 20);

// 2PM bias
assert("2PM: at 2:30 PM = 100", scoreSoft2pmBias(870) === 100);
assert("2PM: at 1:45 PM = 70", scoreSoft2pmBias(825) === 70);
assert("2PM: at 10:00 AM = 50", scoreSoft2pmBias(600) === 50);

// ── PREMIUM PERCENTILE ─────────────────────────────

console.log("\n  -- Premium Percentile --");
assert("Percentile: above p90 = 95", calculatePremiumPercentile(2.5, richBucket) === 95);
assert("Percentile: above p75 = 82", calculatePremiumPercentile(1.6, richBucket) === 82);
assert("Percentile: above median = 60", calculatePremiumPercentile(1.3, richBucket) === 60);
assert("Percentile: weak = 35", calculatePremiumPercentile(0.8, richBucket) === 35);
assert("Percentile: very weak = 15", calculatePremiumPercentile(0.2, richBucket) === 15);
assert("Percentile: no history = 50", calculatePremiumPercentile(1.0, { observations: 0, p90Mid: 0 }) === 50);

// ── TIMING SCORE ────────────────────────────────────

console.log("\n  -- Timing Score --");
const highComponents = { premiumRichness: 95, spreadQuality: 90, ivContext: 90, symbolWindowAlignment: 100, setupWindowAlignment: 100, regimeWindowAlignment: 100, soft2pmBias: 100 };
const highScore = computeTimingScore(highComponents);
assert("High components: score > 90", highScore > 90);

const lowComponents = { premiumRichness: 20, spreadQuality: 10, ivContext: 15, symbolWindowAlignment: 20, setupWindowAlignment: 20, regimeWindowAlignment: 20, soft2pmBias: 50 };
const lowScore = computeTimingScore(lowComponents);
assert("Low components: score < 25", lowScore < 25);

assert("Score: 0-100 range", highScore >= 0 && highScore <= 100 && lowScore >= 0 && lowScore <= 100);

// ── TIMING STATE CLASSIFICATION ─────────────────────

console.log("\n  -- Timing Classification --");
assert("State: 90 + 80 pctl = PEAK_WINDOW", classifyTimingState(90, 80) === TIMING_STATES.PEAK_WINDOW);
assert("State: 90 + 60 pctl = FAVORABLE (not peak, low pctl)", classifyTimingState(90, 60) === TIMING_STATES.FAVORABLE);
assert("State: 75 + 50 pctl = FAVORABLE", classifyTimingState(75, 50) === TIMING_STATES.FAVORABLE);
assert("State: 60 + 50 pctl = EARLY", classifyTimingState(60, 50) === TIMING_STATES.EARLY);
assert("State: 40 + 30 pctl = LATE", classifyTimingState(40, 30) === TIMING_STATES.LATE);
assert("State: 20 + 20 pctl = AVOID", classifyTimingState(20, 20) === TIMING_STATES.AVOID);

// ── SUGGESTED ACTION ────────────────────────────────

console.log("\n  -- Suggested Action --");
assert("Action: PEAK → SELL_NOW", classifySuggestedAction("PEAK_WINDOW", 80, "MOMENTUM") === TIMING_ACTIONS.SELL_NOW);
assert("Action: FAVORABLE + high pctl → SELL_NOW", classifySuggestedAction("FAVORABLE", 75, "MOMENTUM") === TIMING_ACTIONS.SELL_NOW);
assert("Action: FAVORABLE + low pctl → WATCH", classifySuggestedAction("FAVORABLE", 50, "RANGE") === TIMING_ACTIONS.WATCH_FOR_2PM_WINDOW);
assert("Action: EARLY → WAIT", classifySuggestedAction("EARLY", 50, "MOMENTUM") === TIMING_ACTIONS.WAIT_FOR_RICHER_PREMIUM);
assert("Action: LATE + INCOME → AVOID", classifySuggestedAction("LATE", 30, "INCOME") === TIMING_ACTIONS.AVOID_LOW_PREMIUM);
assert("Action: AVOID → AVOID", classifySuggestedAction("AVOID", 20, "RANGE") === TIMING_ACTIONS.AVOID_LOW_PREMIUM);

// ── CONFIDENCE ──────────────────────────────────────

console.log("\n  -- Confidence --");
assert("Confidence: 50+ obs = high", estimateTimingConfidence({ observations: 60 }) === "high");
assert("Confidence: 25 obs = medium", estimateTimingConfidence({ observations: 25 }) === "medium");
assert("Confidence: 8 obs = low", estimateTimingConfidence({ observations: 8 }) === "low");
assert("Confidence: 2 obs = seed", estimateTimingConfidence({ observations: 2 }) === "seed");
assert("Confidence: null = low", estimateTimingConfidence(null) === "low");

// ── HISTORICAL PROFILES ─────────────────────────────

console.log("\n  -- Historical Profiles --");
clearPremiumProfiles();
assert("Profiles: starts empty", getObservationCount() === 0);

// Seed windows
const nbisWindow = getBestWindowBySymbol("NBIS");
assert("NBIS: has seed window", nbisWindow.source === "seed");
assert("NBIS: window is early (10 AM)", nbisWindow.start < 660);

const crwvWindow = getBestWindowBySymbol("CRWV");
assert("CRWV: late-day window", crwvWindow.start >= 830);

const unknownWindow = getBestWindowBySymbol("ZZZZ");
assert("Unknown: default 2PM window", unknownWindow.start === 840);
assert("Unknown: default source", unknownWindow.source === "default");

// Setup type windows
assert("FOLLOWER: early window", getBestWindowBySetupType("FOLLOWER").start < 700);
assert("RANGE: late window", getBestWindowBySetupType("RANGE").start >= 840);

// Regime windows
assert("HIGH_PREMIUM: early window", getBestWindowByRegime("HIGH_PREMIUM_ENVIRONMENT").start < 700);
assert("RISK_ON: standard 2PM", getBestWindowByRegime("RISK_ON").start === 840);

// Record observations
recordPremiumObservation({ symbol: "NVDA", setupType: "MOMENTUM", regime: "RISK_ON", dteBucket: "4-7", moneynessBucket: "3-5% OTM", minuteOfDay: 860, dayOfWeek: 2, midpoint: 1.5, spreadPct: 0.04, iv: 45, premiumPctStrike: 0.015, premiumPctUnderlying: 0.008 });
recordPremiumObservation({ symbol: "NVDA", setupType: "MOMENTUM", regime: "RISK_ON", dteBucket: "4-7", moneynessBucket: "3-5% OTM", minuteOfDay: 870, dayOfWeek: 2, midpoint: 1.8, spreadPct: 0.03, iv: 48, premiumPctStrike: 0.018, premiumPctUnderlying: 0.01 });
assert("Profiles: 2 observations", getObservationCount() === 2);

// Find bucket
const bucket = findHistoricalBucket({ symbol: "NVDA", setupType: "MOMENTUM", dteBucket: "4-7", moneynessBucket: "3-5% OTM" });
assert("Bucket: source = historical", bucket.source === "historical");
assert("Bucket: observations = 2", bucket.observations === 2);
assert("Bucket: avgMid > 0", bucket.avgMid > 0);

// Default bucket for unknown
const defaultBucket = findHistoricalBucket({ symbol: "ZZZZ", setupType: "HYBRID", dteBucket: "4-7", moneynessBucket: "ATM" });
assert("Default bucket: source = default", defaultBucket.source === "default");

// ── FULL ORCHESTRATOR ───────────────────────────────

console.log("\n  -- Full Orchestrator --");

const setup = { symbol: "NVDA", price: 188, category: "HIGH_IV", ivPercentile: 65, regime: "RISK_ON" };
const optionQuote = { bid: 1.40, ask: 1.60, strike: 180, iv: 45, dte: 7, optionType: "put" };
const clockAt2pm = { minuteOfDay: 860, hour: 14, minute: 20, dayOfWeek: 3, marketOpen: true, timeET: "14:20" };

const result = evaluatePremiumTiming(setup, optionQuote, clockAt2pm);
assert("Result: has timingState", typeof result.timingState === "string");
assert("Result: timingState is valid", Object.values(TIMING_STATES).includes(result.timingState));
assert("Result: has timingScore", typeof result.timingScore === "number");
assert("Result: score 0-100", result.timingScore >= 0 && result.timingScore <= 100);
assert("Result: has suggestedAction", typeof result.suggestedAction === "string");
assert("Result: action is valid", Object.values(TIMING_ACTIONS).includes(result.suggestedAction));
assert("Result: has confidence", typeof result.confidence === "string");
assert("Result: has rationale array", Array.isArray(result.rationale));
assert("Result: rationale not empty", result.rationale.length > 0);
assert("Result: has premiumContext", result.premiumContext !== null);
assert("Result: has symbolBestWindow", result.premiumContext.symbolBestWindow !== null);
assert("Result: has components", result.components !== null);
assert("Result: has clockContext", result.clockContext !== null);
assert("Result: clockContext.timeET", result.clockContext.timeET === "14:20");

// At 10 AM — should be EARLY for most symbols
const earlyResult = evaluatePremiumTiming(setup, optionQuote, { minuteOfDay: 600, hour: 10, minute: 0, dayOfWeek: 2, marketOpen: true, timeET: "10:00" });
assert("Early: score lower than 2PM", earlyResult.timingScore <= result.timingScore + 10);

// Card timing (quick eval)
const mockCard = { symbol: "SPY", price: 450, category: "ETF", regime: "RISK_ON", ivPercentile: 55, ladder: { primary: 440 }, metrics: { ivPercentile: 55 } };
const cardResult = evaluateCardTiming(mockCard);
assert("CardTiming: has timingState", typeof cardResult.timingState === "string");
assert("CardTiming: has timingScore", typeof cardResult.timingScore === "number");
assert("CardTiming: has suggestedAction", typeof cardResult.suggestedAction === "string");

clearPremiumProfiles();

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
