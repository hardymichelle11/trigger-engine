#!/usr/bin/env node
// =====================================================
// Tests for alert engine conditions + dedup.
// Run: npm run test:alerts
// =====================================================

import { evaluateAlert, evaluateAlerts, DEFAULT_ALERT_THRESHOLDS } from "../src/lib/alerts/alertEngine.js";

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

console.log("\n  Alert Engine Tests");
console.log("  ──────────────────\n");

// --- Mock card builder ---
function makeCard(overrides = {}) {
  const price = overrides.price || 188;
  return {
    symbol: "NVDA",
    price,
    score: 85,
    signal: "GO",
    action: "SELL_PUTS",
    stage: "EARLY",
    probability: {
      method: "monte_carlo",
      probAboveStrike: 0.78,
      probTouch: 0.25,
      avgMaxDrawdown: 0.04,
      passesFilter: true,
    },
    metrics: {
      ivPercentile: 72,
      ivSource: "polygon_options",
      ivConfidence: "medium",
    },
    scoreTrace: [{ pts: 20, reason: "Regime: RISK_ON" }],
    // Fresh liveState so cards pass the freshness safety gate
    liveState: {
      calculatedAt: Date.now(),
      anchorPrice: price,
      stale: false,
    },
    ...overrides,
  };
}

// 1. All gates pass — should alert
const perfect = evaluateAlert(makeCard());
assert("Perfect card: shouldAlert = true", perfect.shouldAlert === true);
assert("Perfect card: priority = high", perfect.priority === "high");
assert("Perfect card: has summary", perfect.summary.includes("NVDA"));
assert("Perfect card: passedGates > 3", perfect.passedGates.length >= 3);
assert("Perfect card: failedGates = 0", perfect.failedGates.length === 0);

// 2. Low score — should NOT alert
const lowScore = evaluateAlert(makeCard({ score: 40, signal: "NO_TRADE" }));
assert("Low score: shouldAlert = false", lowScore.shouldAlert === false);
assert("Low score: has failed gate", lowScore.failedGates.some(g => g.includes("Score")));

// 3. Wrong action — should NOT alert
const waitAction = evaluateAlert(makeCard({ action: "WAIT" }));
assert("WAIT action: shouldAlert = false", waitAction.shouldAlert === false);
assert("WAIT action: failed gate mentions action", waitAction.failedGates.some(g => g.includes("Action")));

// 4. Low probability — should NOT alert
const lowProb = evaluateAlert(makeCard({
  probability: { method: "monte_carlo", probAboveStrike: 0.55, probTouch: 0.60, avgMaxDrawdown: 0.04, passesFilter: false },
}));
assert("Low prob: shouldAlert = false", lowProb.shouldAlert === false);
assert("Low prob: failed gate mentions Prob", lowProb.failedGates.some(g => g.includes("Prob")));

// 5. High touch probability — should NOT alert
const highTouch = evaluateAlert(makeCard({
  probability: { method: "monte_carlo", probAboveStrike: 0.80, probTouch: 0.55, avgMaxDrawdown: 0.04, passesFilter: true },
}));
assert("High touch: shouldAlert = false", highTouch.shouldAlert === false);
assert("High touch: failed gate mentions Touch", highTouch.failedGates.some(g => g.includes("Touch")));

// 6. High drawdown — should NOT alert
const highDD = evaluateAlert(makeCard({
  probability: { method: "monte_carlo", probAboveStrike: 0.80, probTouch: 0.25, avgMaxDrawdown: 0.12, passesFilter: true },
}));
assert("High DD: shouldAlert = false", highDD.shouldAlert === false);
assert("High DD: failed gate mentions DD", highDD.failedGates.some(g => g.includes("DD")));

// 7. No IV confidence — should NOT alert
const noIV = evaluateAlert(makeCard({
  metrics: { ivPercentile: 72, ivSource: "unknown", ivConfidence: "none" },
}));
assert("No IV confidence: shouldAlert = false", noIV.shouldAlert === false);

// 8. Low IV percentile — should NOT alert
const lowIV = evaluateAlert(makeCard({
  metrics: { ivPercentile: 30, ivSource: "polygon_options", ivConfidence: "medium" },
}));
assert("Low IV %ile: shouldAlert = false", lowIV.shouldAlert === false);

// 9. WATCH-level score — medium priority if all other gates pass
const watchCard = evaluateAlert(makeCard({ score: 65, signal: "WATCH" }));
assert("WATCH score: shouldAlert = true", watchCard.shouldAlert === true);
assert("WATCH score: priority = medium", watchCard.priority === "medium");

// 10. Dedup — recent alert blocks duplicate
const recentAlerts = new Set([`NVDA:${Date.now() - 1000}`]); // 1 second ago
const dedupBlocked = evaluateAlert(makeCard(), {}, recentAlerts);
assert("Dedup: blocks recent alert", dedupBlocked.shouldAlert === false);
assert("Dedup: failed gate mentions dedup", dedupBlocked.failedGates.some(g => g.includes("Dedup")));

// 11. Dedup — old alert does NOT block
const oldAlerts = new Set([`NVDA:${Date.now() - 20 * 60 * 1000}`]); // 20 min ago (> 15 min window)
const dedupAllowed = evaluateAlert(makeCard(), {}, oldAlerts);
assert("Old dedup: shouldAlert = true", dedupAllowed.shouldAlert === true);

// 12. Different symbol not blocked by dedup
const diffSymbol = evaluateAlert(makeCard({ symbol: "TSLA" }), {}, recentAlerts);
assert("Different symbol: not blocked by NVDA dedup", diffSymbol.shouldAlert === true);

// 13. No MC data — erf fallback, no MC gates applied
const noMC = evaluateAlert(makeCard({
  probability: { method: "erf_approximation", probAboveStrike: 0.80, probTouch: 0.30, avgMaxDrawdown: null, passesFilter: true },
}));
assert("erf fallback: no MC gates fail (no avgMaxDrawdown check)", noMC.shouldAlert === true);

// 14. Custom thresholds — raising minScore to 90 demotes score 85 to WATCH-level
const strict = evaluateAlert(makeCard(), { minScore: 90 });
assert("Custom minScore 90: score 85 demotes to medium", strict.shouldAlert === true && strict.priority === "medium");

// Raising both thresholds blocks the card
const veryStrict = evaluateAlert(makeCard(), { minScore: 90, minScoreWatch: 90 });
assert("Both thresholds 90: score 85 blocked", veryStrict.shouldAlert === false);

// 15. evaluateAlerts batch — returns only alerting cards
const cards = [
  makeCard({ symbol: "NVDA" }),
  makeCard({ symbol: "BAD", score: 30, signal: "NO_TRADE", action: "NO_TRADE" }),
  makeCard({ symbol: "TSLA" }),
];
const batch = evaluateAlerts(cards);
assert("Batch: returns 2 of 3 cards", batch.length === 2);
assert("Batch: includes NVDA", batch.some(a => a.card.symbol === "NVDA"));
assert("Batch: includes TSLA", batch.some(a => a.card.symbol === "TSLA"));
assert("Batch: excludes BAD", !batch.some(a => a.card.symbol === "BAD"));

// 16. DEFAULT_ALERT_THRESHOLDS shape
assert("Default thresholds has minScore", typeof DEFAULT_ALERT_THRESHOLDS.minScore === "number");
assert("Default thresholds has minProbAboveStrike", typeof DEFAULT_ALERT_THRESHOLDS.minProbAboveStrike === "number");
assert("Default thresholds has maxTouchProb", typeof DEFAULT_ALERT_THRESHOLDS.maxTouchProb === "number");
assert("Default thresholds has dedupWindowMs", typeof DEFAULT_ALERT_THRESHOLDS.dedupWindowMs === "number");

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
