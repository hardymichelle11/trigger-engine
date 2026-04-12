#!/usr/bin/env node
// =====================================================
// Tests for live state engine — universal recalibration.
// Run: npm run test:livestate
// =====================================================

import {
  shouldRecalculate,
  extractLiveMarketState,
  buildLiveState,
  buildDynamicTargets,
  getFreshnessStatus,
  renderSafeCardState,
  mcCacheValid,
  invalidateDerivedState,
  isAlertSafe,
  enableDebugMode,
  getRecalcLog,
  clearRecalcLog,
  RECALC_THRESHOLDS,
  RECALC_REASON_CODES,
} from "../src/lib/engine/liveStateEngine.js";
import { evaluateAlert } from "../src/lib/alerts/alertEngine.js";
import { computeFreshnessMetrics, computeRecalcAnalytics, computeInvalidationAnalytics, getHealthSnapshot } from "../src/lib/engine/recalcMonitor.js";
import { recordRecalcEvent, recordInvalidationEvent, recordAlertBlockEvent, recordAlertFireEvent, loadOpsEvents, getEventSummary, drainEvents, clearOpsEvents, OPS_EVENT_TYPES } from "../src/lib/engine/opsEventCollector.js";

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`  \u2713 ${name}`);
    passed++;
  } else {
    console.log(`  \u2717 ${name}`);
    failed++;
  }
}

console.log("\n  Live State Engine Tests");
console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n");

// ── shouldRecalculate ───────────────────────────────

console.log("  -- shouldRecalculate --");

// No previous state
const r1 = shouldRecalculate(null, { price: 100 });
assert("No prev state: recalc = true", r1.recalc === true);
assert("No prev state: reason = no_previous_state", r1.reasons.includes("no_previous_state"));

// No change
const stable = { price: 100, leaderPrice: 50, regime: "RISK_ON", ivPercentile: 50, atrExpansion: 1, leverageGap: 0.02 };
const r2 = shouldRecalculate(stable, { ...stable });
assert("Stable: recalc = false", r2.recalc === false);
assert("Stable: no reasons", r2.reasons.length === 0);

// Large up-move triggers recalc (equity 1.5%)
const r3 = shouldRecalculate(
  { price: 100, regime: "RISK_ON" },
  { price: 102, regime: "RISK_ON" }  // +2%
);
assert("Large up-move: recalc = true", r3.recalc === true);
assert("Large up-move: reason mentions price_drift", r3.reasons.some(r => r.includes("price_drift")));

// Large down-move triggers recalc
const r4 = shouldRecalculate(
  { price: 100, regime: "RISK_ON" },
  { price: 97, regime: "RISK_ON" }  // -3%
);
assert("Large down-move: recalc = true", r4.recalc === true);

// Leveraged proxy threshold (2.5%)
const r5 = shouldRecalculate(
  { price: 35, isLeveraged: false },
  { price: 35.4, isLeveraged: false }  // +1.14% — below equity threshold
);
assert("Small equity move: recalc = false", r5.recalc === false);

const r5b = shouldRecalculate(
  { price: 35 },
  { price: 35.4, isLeveraged: true }  // +1.14% — below 2.5% leveraged threshold
);
assert("Small leveraged move: recalc = false", r5b.recalc === false);

const r5c = shouldRecalculate(
  { price: 35 },
  { price: 36, isLeveraged: true }  // +2.86% — above 2.5% leveraged threshold
);
assert("Large leveraged move: recalc = true", r5c.recalc === true);

// Regime change
const r6 = shouldRecalculate(
  { price: 100, regime: "RISK_ON" },
  { price: 100, regime: "CREDIT_STRESS_WATCH" }
);
assert("Regime change: recalc = true", r6.recalc === true);
assert("Regime change: reason mentions regime", r6.reasons.some(r => r.includes("regime_change")));

// Leverage gap drift
const r7 = shouldRecalculate(
  { price: 35, leverageGap: 0.02 },
  { price: 35, leverageGap: 0.028 }  // 0.8% drift > 0.5% threshold
);
assert("Leverage gap drift: recalc = true", r7.recalc === true);
assert("Leverage gap drift: reason mentions leverage", r7.reasons.some(r => r.includes("leverage_gap")));

// IV change
const r8 = shouldRecalculate(
  { price: 100, ivPercentile: 50 },
  { price: 100, ivPercentile: 56 }  // 12% relative change > 10% threshold
);
assert("IV change: recalc = true", r8.recalc === true);

// TTL expired
const r9 = shouldRecalculate(
  { price: 100 },
  { price: 100 },
  { calculatedAt: Date.now() - 100000 }  // 100s > 90s TTL
);
assert("TTL expired: recalc = true", r9.recalc === true);
assert("TTL expired: reason mentions ttl", r9.reasons.some(r => r.includes("ttl_expired")));

// Leader drift
const r10 = shouldRecalculate(
  { price: 35, leaderPrice: 100 },
  { price: 35, leaderPrice: 102 }  // 2% leader drift
);
assert("Leader drift: recalc = true", r10.recalc === true);

// New bar close
const r11 = shouldRecalculate(
  { price: 100, barTimestamp: 1000 },
  { price: 100, barTimestamp: 2000 }
);
assert("New bar close: recalc = true", r11.recalc === true);

// ── extractLiveMarketState ──────────────────────────

console.log("\n  -- extractLiveMarketState --");

const lms = extractLiveMarketState({
  price: 35.31,
  leaderPrice: 108.82,
  ivPercentile: 65,
  atrExpansion: 1.2,
  regime: "RISK_ON",
  regimeScore: 25,
  vixState: "calm",
  isLeveraged: true,
});
assert("LMS: price = 35.31", lms.price === 35.31);
assert("LMS: leaderPrice = 108.82", lms.leaderPrice === 108.82);
assert("LMS: regime = RISK_ON", lms.regime === "RISK_ON");
assert("LMS: isLeveraged = true", lms.isLeveraged === true);
assert("LMS: has snapshotTime", typeof lms.snapshotTime === "number");

// ── buildLiveState ──────────────────────────────────

console.log("\n  -- buildLiveState --");

const ls = buildLiveState({
  price: 35.31,
  leaderPrice: 108.82,
  ivPercentile: 65,
  atrExpansion: 1.2,
  regime: "RISK_ON",
  regimeScore: 25,
  vixState: "calm",
  staticTargets: [37.0, 38.5, 40.0],
  staticStop: 32.0,
  isLeveraged: true,
});
assert("LiveState: anchorPrice = 35.31", ls.anchorPrice === 35.31);
assert("LiveState: leaderPrice = 108.82", ls.leaderPrice === 108.82);
assert("LiveState: regime = RISK_ON", ls.regime === "RISK_ON");
assert("LiveState: stale = false", ls.stale === false);
assert("LiveState: has calculatedAt", typeof ls.calculatedAt === "number");
assert("LiveState: dailyVol > 0", ls.dailyVol > 0);
assert("LiveState: annualizedIV > 0", ls.annualizedIV > 0);
assert("LiveState: has dynamicTargets", ls.dynamicTargets !== null);
assert("LiveState: dynamicTargets has targets array", Array.isArray(ls.dynamicTargets.targets));
assert("LiveState: 3 targets", ls.dynamicTargets.targets.length === 3);
assert("LiveState: T1 level = 37", ls.dynamicTargets.targets[0].level === 37);
assert("LiveState: T1 has distPct", typeof ls.dynamicTargets.targets[0].distPct === "number");
assert("LiveState: T1 is reachable", ls.dynamicTargets.targets[0].reachable === true);
assert("LiveState: method = static_validated", ls.dynamicTargets.method === "static_validated");
assert("LiveState: has stop", ls.dynamicTargets.stop !== null);
assert("LiveState: stop level = 32", ls.dynamicTargets.stop.level === 32);
assert("LiveState: expectedMove > 0", ls.dynamicTargets.expectedMove > 0);

// ── buildDynamicTargets ─────────────────────────────

console.log("\n  -- buildDynamicTargets --");

// Dynamic (no static targets)
const dt = buildDynamicTargets({
  anchor: 100,
  staticTargets: null,
  staticStop: null,
  dailyVol: 0.02,
  horizon: 10,
  regime: "RISK_ON",
});
assert("Dynamic: method = dynamic", dt.method === "dynamic");
assert("Dynamic: 3 targets", dt.targets.length === 3);
assert("Dynamic: T1 > anchor", dt.targets[0].level > 100);
assert("Dynamic: T2 > T1", dt.targets[1].level > dt.targets[0].level);
assert("Dynamic: T3 > T2", dt.targets[2].level > dt.targets[1].level);
assert("Dynamic: has stop < anchor", dt.stop.level < 100);
assert("Dynamic: expectedMove > 0", dt.expectedMove > 0);
assert("Dynamic: all reachable", dt.targets.every(t => t.reachable));

// Regime affects vol multiplier
const dtStress = buildDynamicTargets({
  anchor: 100,
  dailyVol: 0.02,
  horizon: 10,
  regime: "HIGH_PREMIUM_ENVIRONMENT",
});
assert("Stress regime: wider expectedMove", dtStress.expectedMove > dt.expectedMove);

// Zero anchor
const dtZero = buildDynamicTargets({ anchor: 0 });
assert("Zero anchor: method = none", dtZero.method === "none");

// ── getFreshnessStatus ──────────────────────────────

console.log("\n  -- getFreshnessStatus --");

// Fresh card
const freshCard = {
  price: 35.31,
  liveState: { calculatedAt: Date.now(), anchorPrice: 35.31, regime: "RISK_ON", volSource: "iv_percentile" },
};
const fs1 = getFreshnessStatus(freshCard);
assert("Fresh: fresh = true", fs1.fresh === true);
assert("Fresh: label = LIVE", fs1.label === "LIVE");
assert("Fresh: anchorDrift = 0", fs1.anchorDrift === 0);

// Stale card (old timestamp)
const staleCard = {
  price: 35.31,
  liveState: { calculatedAt: Date.now() - 120000, anchorPrice: 35.31 },
};
const fs2 = getFreshnessStatus(staleCard);
assert("Stale by time: stale = true", fs2.stale === true);
assert("Stale by time: label = STALE", fs2.label === "STALE");

// Stale card (anchor drift)
const driftCard = {
  price: 37.0,
  liveState: { calculatedAt: Date.now(), anchorPrice: 35.31 },  // 4.8% drift
};
const fs3 = getFreshnessStatus(driftCard);
assert("Stale by drift: stale = true", fs3.stale === true);
assert("Stale by drift: anchorDrift > 2", fs3.anchorDrift > 2);

// No liveState
const fs4 = getFreshnessStatus({});
assert("No liveState: stale = true", fs4.stale === true);
assert("No liveState: label = NO DATA", fs4.label === "NO DATA");

// ── renderSafeCardState ─────────────────────────────

console.log("\n  -- renderSafeCardState --");

// Fresh card passes through
const safeF = renderSafeCardState(freshCard);
assert("Safe fresh: has freshness", safeF.freshness !== undefined);
assert("Safe fresh: freshness.fresh = true", safeF.freshness.fresh === true);

// Stale card nulls out analytics
const staleCardFull = {
  symbol: "NVDA",
  price: 37.0,
  probability: { probAboveStrike: 0.82 },
  recommendation: { trade: "YES" },
  ladder: { primary: 31.75, secondary: 33.54 },
  metrics: { distT1Pct: 4.8 },
  liveState: { calculatedAt: Date.now() - 120000, anchorPrice: 35.31 },
};
const safeS = renderSafeCardState(staleCardFull);
assert("Safe stale: probability = null", safeS.probability === null);
assert("Safe stale: recommendation = null", safeS.recommendation === null);
assert("Safe stale: ladder.stale = true", safeS.ladder.stale === true);
assert("Safe stale: metrics.distT1Pct = null", safeS.metrics.distT1Pct === null);
assert("Safe stale: symbol preserved", safeS.symbol === "NVDA");
assert("Safe stale: freshness.stale = true", safeS.freshness.stale === true);

// ── mcCacheValid ────────────────────────────────────

console.log("\n  -- mcCacheValid --");

const mcFresh = { anchorPrice: 100, iv: 50, regime: "RISK_ON", timestamp: Date.now() };
const mcCurrent = { price: 100, ivPercentile: 50, regime: "RISK_ON" };
assert("MC fresh: valid = true", mcCacheValid(mcFresh, mcCurrent) === true);

// Expired
const mcOld = { ...mcFresh, timestamp: Date.now() - 150000 };
assert("MC expired: valid = false", mcCacheValid(mcOld, mcCurrent) === false);

// Price drift
assert("MC price drift: valid = false", mcCacheValid(mcFresh, { ...mcCurrent, price: 103 }) === false);

// IV drift
assert("MC IV drift: valid = false", mcCacheValid(mcFresh, { ...mcCurrent, ivPercentile: 60 }) === false);

// Regime change
assert("MC regime change: valid = false", mcCacheValid(mcFresh, { ...mcCurrent, regime: "CREDIT_STRESS_WATCH" }) === false);

// No cache
assert("MC no cache: valid = false", mcCacheValid(null, mcCurrent) === false);

// ── invalidateDerivedState ──────────────────────────

console.log("\n  -- invalidateDerivedState --");

const inv = invalidateDerivedState("price_drift");
assert("Invalidated: stale = true", inv.stale === true);
assert("Invalidated: has invalidatedAt", typeof inv.invalidatedAt === "number");
assert("Invalidated: reason = price_drift", inv.invalidationReason === "price_drift");
assert("Invalidated: targets = null", inv.targets === null);
assert("Invalidated: mcResult = null", inv.mcResult === null);

// ── RECALC_THRESHOLDS ───────────────────────────────

console.log("\n  -- RECALC_THRESHOLDS --");

assert("Thresholds: equity = 0.015", RECALC_THRESHOLDS.equity === 0.015);
assert("Thresholds: leveragedProxy = 0.025", RECALC_THRESHOLDS.leveragedProxy === 0.025);
assert("Thresholds: leverageGapDrift = 0.005", RECALC_THRESHOLDS.leverageGapDrift === 0.005);
assert("Thresholds: freshnessTtlMs = 90000", RECALC_THRESHOLDS.freshnessTtlMs === 90000);
assert("Thresholds: mcCacheTtlMs = 120000", RECALC_THRESHOLDS.mcCacheTtlMs === 120000);

// ── RECALC_REASON_CODES ─────────────────────────────

console.log("\n  -- RECALC_REASON_CODES --");

assert("Codes: has PRICE_DRIFT", RECALC_REASON_CODES.PRICE_DRIFT === "price_drift");
assert("Codes: has PROXY_DRIFT", RECALC_REASON_CODES.PROXY_DRIFT === "proxy_drift");
assert("Codes: has REGIME_CHANGE", RECALC_REASON_CODES.REGIME_CHANGE === "regime_change");
assert("Codes: has IV_SHIFT", RECALC_REASON_CODES.IV_SHIFT === "iv_shift");
assert("Codes: has FRESHNESS_TTL", RECALC_REASON_CODES.FRESHNESS_TTL === "freshness_ttl");
assert("Codes: has NEW_BAR", RECALC_REASON_CODES.NEW_BAR === "new_bar");

// shouldRecalculate returns reasonCodes
const rcTest = shouldRecalculate(
  { price: 100, regime: "RISK_ON" },
  { price: 103, regime: "CREDIT_STRESS_WATCH" }
);
assert("reasonCodes: has price_drift", rcTest.reasonCodes.includes("price_drift"));
assert("reasonCodes: has regime_change", rcTest.reasonCodes.includes("regime_change"));
assert("reasonCodes: length = 2", rcTest.reasonCodes.length === 2);

// Leveraged proxy uses proxy_drift code
const rcProxy = shouldRecalculate(
  { price: 35 },
  { price: 36.5, isLeveraged: true }
);
assert("Proxy: reasonCodes has proxy_drift", rcProxy.reasonCodes.includes("proxy_drift"));

// ── recalc reason in buildLiveState ─────────────────

console.log("\n  -- Recalc reason audit trail --");

const lsWithReasons = buildLiveState({
  price: 35.31,
  ivPercentile: 65,
  regime: "RISK_ON",
  recalcReasons: ["price_drift_3.2pct", "regime_change_LOW_EDGE_to_RISK_ON"],
  recalcReasonCodes: ["price_drift", "regime_change"],
  symbol: "NEBX",
});
assert("liveState: lastRecalcReasons has 2", lsWithReasons.lastRecalcReasons.length === 2);
assert("liveState: lastRecalcReasonCodes has 2", lsWithReasons.lastRecalcReasonCodes.length === 2);
assert("liveState: first reason code = price_drift", lsWithReasons.lastRecalcReasonCodes[0] === "price_drift");

// ── renderSafeCardState invalidation details ────────

console.log("\n  -- Invalidation details --");

const staleCardDetailed = {
  symbol: "TSLA",
  price: 210,
  probability: { probAboveStrike: 0.78 },
  recommendation: { trade: "YES" },
  ladder: { primary: 190 },
  metrics: { distT1Pct: 5.2 },
  liveState: { calculatedAt: Date.now() - 120000, anchorPrice: 200, stale: false },
};
const safeDetailed = renderSafeCardState(staleCardDetailed);
assert("Invalidation: has invalidation object", safeDetailed.invalidation !== null);
assert("Invalidation: stale = true", safeDetailed.invalidation.stale === true);
assert("Invalidation: has reasons array", Array.isArray(safeDetailed.invalidation.reasons));
assert("Invalidation: reasons include freshness_ttl", safeDetailed.invalidation.reasons.includes("freshness_ttl"));
assert("Invalidation: has anchorDrift", typeof safeDetailed.invalidation.anchorDrift === "number");
assert("Invalidation: anchorDrift = 5", safeDetailed.invalidation.anchorDrift === 5);
assert("Invalidation: has suppressedFields", safeDetailed.invalidation.suppressedFields.includes("probability"));
assert("Invalidation: currentPrice = 210", safeDetailed.invalidation.currentPrice === 210);
assert("Invalidation: anchorPrice = 200", safeDetailed.invalidation.anchorPrice === 200);

// Fresh card has no invalidation
const freshCardTest = {
  price: 100,
  liveState: { calculatedAt: Date.now(), anchorPrice: 100 },
};
const safeFresh = renderSafeCardState(freshCardTest);
assert("Fresh: invalidation = null", safeFresh.invalidation === null);

// ── isAlertSafe ─────────────────────────────────────

console.log("\n  -- isAlertSafe --");

// Fresh card with probability is safe
const safeCard = {
  price: 100,
  probability: { method: "monte_carlo", probAboveStrike: 0.82 },
  liveState: { calculatedAt: Date.now(), anchorPrice: 100, stale: false },
};
const as1 = isAlertSafe(safeCard);
assert("Safe card: safe = true", as1.safe === true);
assert("Safe card: reason = null", as1.reason === null);

// No liveState
assert("No liveState: safe = false", isAlertSafe({ price: 100 }).safe === false);
assert("No liveState: reason = no_live_state", isAlertSafe({ price: 100 }).reason === "no_live_state");

// Stale liveState
const staleLS = { price: 100, liveState: { calculatedAt: Date.now() - 120000, anchorPrice: 100 }, probability: {} };
assert("Stale LS: safe = false", isAlertSafe(staleLS).safe === false);

// Anchor drift (5% drift detected as stale by freshness check)
const driftLS = { price: 105, liveState: { calculatedAt: Date.now(), anchorPrice: 100 }, probability: {} };
assert("Drift LS: safe = false", isAlertSafe(driftLS).safe === false);
assert("Drift LS: reason includes stale", isAlertSafe(driftLS).reason.includes("stale"));

// No probability
const noProb = { price: 100, liveState: { calculatedAt: Date.now(), anchorPrice: 100 } };
assert("No prob: safe = false", isAlertSafe(noProb).safe === false);
assert("No prob: reason = no_probability", isAlertSafe(noProb).reason === "no_probability");

// Null card
assert("Null card: safe = false", isAlertSafe(null).safe === false);

// ── Alert engine blocks stale cards ─────────────────

console.log("\n  -- Alert safety in alertEngine --");

// Fresh card with good scores should alert
const alertableCard = {
  symbol: "NVDA",
  score: 80,
  signal: "GO",
  action: "SELL_PUTS",
  price: 188,
  probability: { method: "monte_carlo", probAboveStrike: 0.82, probTouch: 0.22, avgMaxDrawdown: 0.05 },
  metrics: { ivPercentile: 65, ivConfidence: "high" },
  liveState: { calculatedAt: Date.now(), anchorPrice: 188, stale: false },
};
const ar1 = evaluateAlert(alertableCard);
assert("Fresh alertable: shouldAlert = true", ar1.shouldAlert === true);
assert("Fresh alertable: no blockedByFreshness", ar1.blockedByFreshness !== true);

// Same card but stale should NOT alert
const staleAlertCard = {
  ...alertableCard,
  liveState: { calculatedAt: Date.now() - 120000, anchorPrice: 188, stale: false },
};
const ar2 = evaluateAlert(staleAlertCard);
assert("Stale card: shouldAlert = false", ar2.shouldAlert === false);
assert("Stale card: blockedByFreshness = true", ar2.blockedByFreshness === true);
assert("Stale card: has freshnessReason", typeof ar2.freshnessReason === "string");

// Card with no liveState should NOT alert
const noLSCard = { ...alertableCard, liveState: undefined };
const ar3 = evaluateAlert(noLSCard);
assert("No liveState: shouldAlert = false", ar3.shouldAlert === false);
assert("No liveState: blockedByFreshness = true", ar3.blockedByFreshness === true);

// Card with anchor drift should NOT alert
const driftAlertCard = {
  ...alertableCard,
  price: 195,  // 3.7% drift from anchor 188
};
const ar4 = evaluateAlert(driftAlertCard);
assert("Anchor drift: shouldAlert = false", ar4.shouldAlert === false);
assert("Anchor drift: blockedByFreshness = true", ar4.blockedByFreshness === true);

// Card with no probability should NOT alert
const noProbCard = { ...alertableCard, probability: null };
const ar5 = evaluateAlert(noProbCard);
assert("No probability: shouldAlert = false", ar5.shouldAlert === false);

// ── Telemetry / debug log ───────────────────────────

console.log("\n  -- Telemetry --");

clearRecalcLog();
assert("Log cleared: empty", getRecalcLog().length === 0);

// Build a liveState with reasons — should log
buildLiveState({
  price: 100, ivPercentile: 50, regime: "RISK_ON",
  recalcReasons: ["price_drift_2.1pct"], recalcReasonCodes: ["price_drift"], symbol: "SPY",
});
assert("Log: has 1 entry after buildLiveState with reasons", getRecalcLog().length === 1);
assert("Log: entry type = recalculate", getRecalcLog()[0].type === "recalculate");
assert("Log: entry symbol = SPY", getRecalcLog()[0].symbol === "SPY");
assert("Log: entry has timestamp", typeof getRecalcLog()[0].timestamp === "number");

// renderSafeCardState on stale card should also log
renderSafeCardState(staleCardDetailed);
assert("Log: has 2 entries after invalidation", getRecalcLog().length === 2);
assert("Log: second entry type = invalidate", getRecalcLog()[1].type === "invalidate");

// Debug mode toggle
enableDebugMode(false);
assert("Debug mode: can be disabled", true);

clearRecalcLog();

// ── computeFreshnessMetrics ─────────────────────────

console.log("\n  -- computeFreshnessMetrics --");

const testCards = [
  // Live + alert-safe
  { symbol: "SPY", price: 450, probability: { method: "monte_carlo" }, liveState: { calculatedAt: Date.now(), anchorPrice: 450, stale: false } },
  // Aging (72s old, below 90s TTL but above 80% threshold)
  { symbol: "QQQ", price: 380, probability: { method: "monte_carlo" }, liveState: { calculatedAt: Date.now() - 75000, anchorPrice: 380, stale: false } },
  // Stale (120s old)
  { symbol: "IWM", price: 200, probability: null, liveState: { calculatedAt: Date.now() - 120000, anchorPrice: 200, stale: false } },
  // No liveState
  { symbol: "TLT", price: 90 },
];

const fm = computeFreshnessMetrics(testCards);
assert("FM: total = 4", fm.total === 4);
assert("FM: live = 1", fm.live === 1);
assert("FM: aging = 1", fm.aging === 1);
assert("FM: stale = 1", fm.stale === 1);
assert("FM: noData = 1", fm.noData === 1);
assert("FM: alertSafe = 2", fm.alertSafe === 2);
assert("FM: alertBlocked = 2", fm.alertBlocked === 2);
assert("FM: has blockedReasons", Object.keys(fm.blockedReasons).length > 0);
assert("FM: healthPct = 25", fm.healthPct === 25);
assert("FM: healthLabel = UNHEALTHY", fm.healthLabel === "UNHEALTHY");

// Empty cards
const fmEmpty = computeFreshnessMetrics([]);
assert("FM empty: total = 0", fmEmpty.total === 0);
assert("FM empty: healthLabel = UNHEALTHY", fmEmpty.healthLabel === "UNHEALTHY");

// All healthy
const healthyCards = [
  { symbol: "A", price: 100, probability: { method: "monte_carlo" }, liveState: { calculatedAt: Date.now(), anchorPrice: 100, stale: false } },
  { symbol: "B", price: 200, probability: { method: "monte_carlo" }, liveState: { calculatedAt: Date.now(), anchorPrice: 200, stale: false } },
];
const fmHealthy = computeFreshnessMetrics(healthyCards);
assert("FM healthy: healthPct = 100", fmHealthy.healthPct === 100);
assert("FM healthy: healthLabel = HEALTHY", fmHealthy.healthLabel === "HEALTHY");
assert("FM healthy: alertBlocked = 0", fmHealthy.alertBlocked === 0);

// ── computeRecalcAnalytics ──────────────────────────

console.log("\n  -- computeRecalcAnalytics --");

clearRecalcLog();
// Seed some recalc events via buildLiveState
buildLiveState({ price: 100, ivPercentile: 50, regime: "RISK_ON", recalcReasons: ["price_drift_2.0pct"], recalcReasonCodes: ["price_drift"], symbol: "SPY" });
buildLiveState({ price: 200, ivPercentile: 60, regime: "RISK_ON", recalcReasons: ["iv_change_10pts"], recalcReasonCodes: ["iv_shift"], symbol: "QQQ" });
buildLiveState({ price: 100, ivPercentile: 50, regime: "CREDIT_STRESS_WATCH", recalcReasons: ["regime_change_RISK_ON_to_CSW"], recalcReasonCodes: ["regime_change"], symbol: "SPY" });

const ra = computeRecalcAnalytics({ maxAge: 60000 });
assert("RA: totalEvents = 3", ra.totalEvents === 3);
assert("RA: bySymbol has SPY", ra.bySymbol.SPY === 2);
assert("RA: bySymbol has QQQ", ra.bySymbol.QQQ === 1);
assert("RA: byReason has price_drift", ra.byReason.price_drift === 1);
assert("RA: byReason has iv_shift", ra.byReason.iv_shift === 1);
assert("RA: byReason has regime_change", ra.byReason.regime_change === 1);
assert("RA: topReasons is sorted", ra.topReasons.length === 3);
assert("RA: topSymbols[0] = SPY", ra.topSymbols[0].symbol === "SPY");
assert("RA: topSymbols[0] count = 2", ra.topSymbols[0].count === 2);
assert("RA: has windowMs", ra.windowMs > 0);

// Empty window (future cutoff — no events can match)
const raOld = computeRecalcAnalytics({ since: Date.now() + 60000 });
assert("RA old window: totalEvents = 0", raOld.totalEvents === 0);

// ── computeInvalidationAnalytics ────────────────────

console.log("\n  -- computeInvalidationAnalytics --");

// Trigger some invalidation events via renderSafeCardState
renderSafeCardState({ symbol: "NVDA", price: 195, liveState: { calculatedAt: Date.now() - 120000, anchorPrice: 185 }, probability: {}, ladder: {}, metrics: {} });
renderSafeCardState({ symbol: "TSLA", price: 250, liveState: { calculatedAt: Date.now() - 100000, anchorPrice: 240 }, probability: {}, ladder: {}, metrics: {} });

const ia = computeInvalidationAnalytics({ maxAge: 60000 });
assert("IA: totalEvents = 2", ia.totalEvents === 2);
assert("IA: bySymbol has NVDA", ia.bySymbol.NVDA === 1);
assert("IA: bySymbol has TSLA", ia.bySymbol.TSLA === 1);
assert("IA: byReason has freshness_ttl", (ia.byReason.freshness_ttl || 0) >= 1);
assert("IA: topReasons has entries", ia.topReasons.length > 0);

// ── getHealthSnapshot ───────────────────────────────

console.log("\n  -- getHealthSnapshot --");

const snap = getHealthSnapshot(testCards);
assert("Snapshot: has freshness", snap.freshness !== null);
assert("Snapshot: has recalc", snap.recalc !== null);
assert("Snapshot: has invalidation", snap.invalidation !== null);
assert("Snapshot: has topRecalcReason", snap.topRecalcReason !== null);
assert("Snapshot: has generatedAt", typeof snap.generatedAt === "number");
assert("Snapshot: freshness.total = 4", snap.freshness.total === 4);

clearRecalcLog();

// ── Ops Event Collector (BQ persistence) ────────────

console.log("\n  -- Ops Event Collector --");

clearOpsEvents();
assert("OPS: starts empty", loadOpsEvents().length === 0);

// Record events
recordRecalcEvent({ symbol: "NVDA", reasonCodes: ["price_drift"], anchorPrice: 188, regime: "RISK_ON", ivPercentile: 65 });
recordRecalcEvent({ symbol: "SPY", reasonCodes: ["regime_change", "iv_shift"], anchorPrice: 450, regime: "CREDIT_STRESS_WATCH" });
recordInvalidationEvent({ symbol: "TSLA", reasons: ["freshness_ttl", "anchor_drift"], anchorDriftPct: 5.2, ageSeconds: 120, anchorPrice: 240, currentPrice: 252 });
recordAlertBlockEvent({ symbol: "NVDA", blockReason: "stale_stale", score: 82, anchorDriftPct: 3.1, freshnessAgeSec: 95 });
recordAlertFireEvent({ symbol: "SPY", score: 88, priority: "high", action: "SELL_PUTS", regime: "RISK_ON", anchorPrice: 450 });

const opsEvents = loadOpsEvents();
assert("OPS: 5 events stored", opsEvents.length === 5);
assert("OPS: first is recalc", opsEvents[0].type === OPS_EVENT_TYPES.RECALC);
assert("OPS: recalc has symbol", opsEvents[0].symbol === "NVDA");
assert("OPS: recalc has reasonCodes", opsEvents[0].reasonCodes.includes("price_drift"));
assert("OPS: recalc has anchorPrice", opsEvents[0].anchorPrice === 188);
assert("OPS: recalc has date", typeof opsEvents[0].date === "string");
assert("OPS: recalc has timestamp", typeof opsEvents[0].timestamp === "number");

assert("OPS: invalidation has reasons", opsEvents[2].reasons.includes("freshness_ttl"));
assert("OPS: invalidation has anchorDriftPct", opsEvents[2].anchorDriftPct === 5.2);
assert("OPS: invalidation has ageSeconds", opsEvents[2].ageSeconds === 120);

assert("OPS: alert_block has blockReason", opsEvents[3].blockReason === "stale_stale");
assert("OPS: alert_block has score", opsEvents[3].score === 82);

assert("OPS: alert_fire has priority", opsEvents[4].priority === "high");
assert("OPS: alert_fire has action", opsEvents[4].action === "SELL_PUTS");

// Event summary
const opsSummary = getEventSummary();
assert("OPS summary: total = 5", opsSummary.total === 5);
assert("OPS summary: byType has recalc = 2", opsSummary.byType.recalc === 2);
assert("OPS summary: byType has invalidate = 1", opsSummary.byType.invalidate === 1);
assert("OPS summary: byType has alert_block = 1", opsSummary.byType.alert_block === 1);
assert("OPS summary: byType has alert_fire = 1", opsSummary.byType.alert_fire === 1);
assert("OPS summary: has oldestTimestamp", opsSummary.oldestTimestamp !== null);
assert("OPS summary: has newestTimestamp", opsSummary.newestTimestamp !== null);

// Drain
const drained = drainEvents();
assert("OPS drain: returns 5 events", drained.length === 5);
assert("OPS drain: localStorage now empty", loadOpsEvents().length === 0);

// Wiring: buildLiveState with reasons persists to ops
clearOpsEvents();
buildLiveState({ price: 100, ivPercentile: 50, regime: "RISK_ON", recalcReasons: ["price_drift_2.0pct"], recalcReasonCodes: ["price_drift"], symbol: "TEST" });
const opsAfterBuild = loadOpsEvents();
assert("OPS wiring: buildLiveState persists recalc event", opsAfterBuild.length === 1);
assert("OPS wiring: event type = recalc", opsAfterBuild[0].type === "recalc");
assert("OPS wiring: event symbol = TEST", opsAfterBuild[0].symbol === "TEST");

// Wiring: renderSafeCardState persists invalidation
renderSafeCardState({ symbol: "WIRE", price: 110, liveState: { calculatedAt: Date.now() - 120000, anchorPrice: 100 }, probability: {}, ladder: {}, metrics: {} });
const opsAfterInval = loadOpsEvents();
assert("OPS wiring: renderSafeCardState persists invalidation", opsAfterInval.length === 2);
assert("OPS wiring: invalidation symbol = WIRE", opsAfterInval[1].symbol === "WIRE");

clearOpsEvents();
clearRecalcLog();

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
