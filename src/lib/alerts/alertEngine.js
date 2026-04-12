// =====================================================
// ALERT ENGINE — multi-gate condition evaluator
// =====================================================
// Evaluates scanner cards against configurable thresholds.
// Only fires when multiple quality gates pass simultaneously.
// Produces structured alert objects for any transport layer.
// Alert safety: stale cards are blocked before gate evaluation.
// =====================================================

import { isAlertSafe, getFreshnessStatus } from "../engine/liveStateEngine.js";
import { recordAlertBlockEvent, recordAlertFireEvent } from "../engine/opsEventCollector.js";

// --------------------------------------------------
// DEFAULT THRESHOLDS (configurable per instance)
// --------------------------------------------------

export const DEFAULT_ALERT_THRESHOLDS = {
  // Score gates
  minScore: 75,                    // GO signal threshold
  minScoreWatch: 60,               // WATCH-level alert (lower priority)

  // Monte Carlo gates
  minProbAboveStrike: 0.65,        // >= 65% probability
  maxTouchProb: 0.40,              // <= 40% touch probability
  maxAvgDrawdown: 0.08,            // <= 8% average max drawdown

  // IV gates
  minIvPercentile: 50,             // minimum IV for premium selling interest
  excludeIvConfidence: ["none"],   // don't alert if IV confidence is in this list

  // Action filter
  alertActions: ["SELL_PUTS", "SELL_PUTS_CONSERVATIVE", "BUY_SHARES"],

  // Dedup
  dedupWindowMs: 15 * 60 * 1000,  // 15 minutes between alerts for same symbol
};

// --------------------------------------------------
// ALERT EVALUATION
// --------------------------------------------------

/**
 * @typedef {object} AlertResult
 * @property {boolean} shouldAlert
 * @property {string} priority — "high", "medium", "low"
 * @property {string[]} passedGates — which conditions passed
 * @property {string[]} failedGates — which conditions failed
 * @property {object} card — the scanner card that triggered
 * @property {string} summary — human-readable summary
 */

/**
 * Evaluate a single scanner card against alert thresholds.
 * @param {object} card — from buildUiCard output
 * @param {object} [thresholds] — override DEFAULT_ALERT_THRESHOLDS
 * @param {Set} [recentAlerts] — set of "symbol:timestamp" keys for dedup
 * @returns {AlertResult}
 */
export function evaluateAlert(card, thresholds = {}, recentAlerts = new Set()) {
  const t = { ...DEFAULT_ALERT_THRESHOLDS, ...thresholds };
  const passed = [];
  const failed = [];

  // 0. Freshness safety gate — block stale cards before any evaluation
  const safety = isAlertSafe(card);
  if (!safety.safe) {
    const freshness = getFreshnessStatus(card);
    recordAlertBlockEvent({
      symbol: card.symbol,
      blockReason: safety.reason,
      score: card.score,
      anchorDriftPct: freshness.anchorDrift,
      freshnessAgeSec: freshness.ageSec,
    });
    return {
      shouldAlert: false,
      priority: "low",
      passedGates: [],
      failedGates: [`Freshness: ${safety.reason}`],
      card,
      summary: `${card.symbol}: blocked — ${safety.reason}`,
      timestamp: Date.now(),
      blockedByFreshness: true,
      freshnessReason: safety.reason,
    };
  }

  // 1. Score gate
  if (card.score >= t.minScore) {
    passed.push(`Score ${card.score} >= ${t.minScore} (GO)`);
  } else if (card.score >= t.minScoreWatch) {
    passed.push(`Score ${card.score} >= ${t.minScoreWatch} (WATCH)`);
  } else {
    failed.push(`Score ${card.score} < ${t.minScoreWatch}`);
  }

  // 2. Action gate
  if (t.alertActions.includes(card.action)) {
    passed.push(`Action: ${card.action}`);
  } else {
    failed.push(`Action ${card.action} not in alert list`);
  }

  // 3. Monte Carlo gates (only if MC data available)
  const prob = card.probability;
  if (prob && prob.method === "monte_carlo") {
    if (prob.probAboveStrike >= t.minProbAboveStrike) {
      passed.push(`Prob above: ${(prob.probAboveStrike * 100).toFixed(1)}% >= ${(t.minProbAboveStrike * 100)}%`);
    } else {
      failed.push(`Prob above: ${(prob.probAboveStrike * 100).toFixed(1)}% < ${(t.minProbAboveStrike * 100)}%`);
    }

    if (prob.probTouch <= t.maxTouchProb) {
      passed.push(`Touch: ${(prob.probTouch * 100).toFixed(1)}% <= ${(t.maxTouchProb * 100)}%`);
    } else {
      failed.push(`Touch: ${(prob.probTouch * 100).toFixed(1)}% > ${(t.maxTouchProb * 100)}%`);
    }

    if (prob.avgMaxDrawdown != null && prob.avgMaxDrawdown <= t.maxAvgDrawdown) {
      passed.push(`Max DD: ${(prob.avgMaxDrawdown * 100).toFixed(1)}% <= ${(t.maxAvgDrawdown * 100)}%`);
    } else if (prob.avgMaxDrawdown != null) {
      failed.push(`Max DD: ${(prob.avgMaxDrawdown * 100).toFixed(1)}% > ${(t.maxAvgDrawdown * 100)}%`);
    }
  }

  // 4. IV gate
  const ivPct = card.metrics?.ivPercentile ?? 0;
  if (ivPct >= t.minIvPercentile) {
    passed.push(`IV: ${ivPct}%ile >= ${t.minIvPercentile}`);
  } else {
    failed.push(`IV: ${ivPct}%ile < ${t.minIvPercentile}`);
  }

  const ivConf = card.metrics?.ivConfidence || "none";
  if (!t.excludeIvConfidence.includes(ivConf)) {
    passed.push(`IV confidence: ${ivConf}`);
  } else {
    failed.push(`IV confidence: ${ivConf} (excluded)`);
  }

  // 5. Dedup gate
  const dedupKey = card.symbol;
  let dedupPassed = true;
  for (const key of recentAlerts) {
    const [sym, ts] = key.split(":");
    if (sym === dedupKey && (Date.now() - Number(ts)) < t.dedupWindowMs) {
      dedupPassed = false;
      break;
    }
  }
  if (!dedupPassed) {
    failed.push("Dedup: recent alert exists");
  }

  // Decision: alert if no failed gates (all pass)
  const shouldAlert = failed.length === 0 && passed.length >= 3;

  // Priority: high if score >= GO + all MC gates pass, medium if WATCH-level
  let priority = "low";
  if (shouldAlert && card.score >= t.minScore) priority = "high";
  else if (shouldAlert) priority = "medium";

  // Persist alert-fire event for BQ
  if (shouldAlert) {
    recordAlertFireEvent({
      symbol: card.symbol,
      score: card.score,
      priority,
      action: card.action,
      regime: card.liveState?.regime || card.regime,
      anchorPrice: card.liveState?.anchorPrice || card.price,
    });
  }

  // Summary
  const summary = shouldAlert
    ? `${card.symbol}: ${card.action} — score ${card.score}, prob ${prob ? (prob.probAboveStrike * 100).toFixed(0) + "%" : "N/A"}, IV ${ivPct}%ile (${card.metrics?.ivSource || "?"})`
    : `${card.symbol}: blocked — ${failed[0] || "insufficient gates"}`;

  return {
    shouldAlert,
    priority,
    passedGates: passed,
    failedGates: failed,
    card,
    summary,
    timestamp: Date.now(),
  };
}

/**
 * Evaluate all scanner cards and return alerts.
 * @param {object[]} cards — from buildScannerState output
 * @param {object} [thresholds]
 * @param {Set} [recentAlerts]
 * @returns {AlertResult[]} — only cards that should alert
 */
export function evaluateAlerts(cards, thresholds = {}, recentAlerts = new Set()) {
  return cards
    .map(card => evaluateAlert(card, thresholds, recentAlerts))
    .filter(result => result.shouldAlert);
}
