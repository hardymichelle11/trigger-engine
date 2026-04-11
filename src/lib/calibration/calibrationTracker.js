// =====================================================
// CALIBRATION TRACKER — live observation recording + stats
// =====================================================
// Inspects scored cards after each scan and records
// calibration observations. Supports quarterly review.
//
// Safety: logging only — never modifies scoring weights.
// =====================================================

import { appendObservations, loadObservations, saveObservations, getObservationsInRange, updateObservation } from "./calibrationStorage.js";

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 min dedup window
const _recentIds = new Set();

// --------------------------------------------------
// RECORD OBSERVATIONS FROM SCAN RESULTS
// --------------------------------------------------

/**
 * Record calibration observations from a set of scanner cards.
 * Call this after each scan cycle with the built cards.
 *
 * @param {object[]} cards — from buildScannerState / buildUiCard output
 * @param {object} [meta] — { scanTime, sessionId }
 */
export function recordCalibrationSnapshot(cards, meta = {}) {
  if (!cards || cards.length === 0) return;

  const scanTime = meta.scanTime || Date.now();
  const sessionId = meta.sessionId || _sessionId();
  const date = new Date(scanTime).toISOString().slice(0, 10);

  const observations = [];

  for (const card of cards) {
    // Need both baseline and enhanced scores
    const baselineScore = card.baselineScore ?? card.score;
    const enhancedScore = card.score;
    const delta = enhancedScore - baselineScore;

    // Extract chart context adjustments
    const chartTrace = (card.scoreTrace || []).filter(t => t.source === "chart_context");
    const hadAtrPenalty = chartTrace.some(t => t.reason?.toLowerCase().includes("atr") && t.pts < 0);
    const hadPositiveBonus = chartTrace.some(t => t.pts > 0);

    // Dedup: skip if same symbol recorded within window
    const dedupKey = `${card.symbol}:${Math.floor(scanTime / DEDUP_WINDOW_MS)}`;
    if (_recentIds.has(dedupKey)) continue;
    _recentIds.add(dedupKey);

    const id = `${card.symbol}_${scanTime}_${sessionId}`;

    observations.push({
      id,
      date,
      timestamp: scanTime,
      symbol: card.symbol,
      setupType: card.category || "UNKNOWN",
      baselineScore,
      enhancedScore,
      delta,
      hadAtrPenalty,
      hadPositiveBonus,
      chartAdjustments: chartTrace.map(t => ({ pts: t.pts, reason: t.reason })),
      alertFired: false, // caller can update if alert engine ran
      sessionsOut: null,
      outcome: null,
      justified: null,
      notes: "",
    });
  }

  if (observations.length > 0) {
    appendObservations(observations);
  }
}

/**
 * Mark observations as alert-fired for a set of symbols.
 * Call after alert evaluation.
 * @param {string[]} alertedSymbols
 * @param {number} [scanTime]
 */
export function markAlertsFired(alertedSymbols, scanTime) {
  if (!alertedSymbols || alertedSymbols.length === 0) return;

  const obs = loadObservations();
  const symSet = new Set(alertedSymbols);
  const time = scanTime || Date.now();
  const window = DEDUP_WINDOW_MS;

  let changed = false;
  for (const o of obs) {
    if (symSet.has(o.symbol) && Math.abs(o.timestamp - time) < window && !o.alertFired) {
      o.alertFired = true;
      changed = true;
    }
  }

  if (changed) {
    saveObservations(obs);
  }
}

// --------------------------------------------------
// OUTCOME UPDATES (manual review)
// --------------------------------------------------

/**
 * Update outcome for a specific observation.
 * @param {string} observationId
 * @param {object} outcome — { sessionsOut, outcome, justified, notes }
 * @returns {boolean}
 */
export function recordOutcomeUpdate(observationId, outcome) {
  return updateObservation(observationId, outcome);
}

// --------------------------------------------------
// ROLLING STATS
// --------------------------------------------------

/**
 * Get calibration statistics for a date range.
 * @param {object} [options] — { from, to }
 * @returns {object}
 */
export function getCalibrationStats(options = {}) {
  const obs = options.from || options.to
    ? getObservationsInRange(options.from, options.to)
    : loadObservations();

  if (obs.length === 0) return _emptyStats();

  const total = obs.length;
  const atrPenaltyCount = obs.filter(o => o.hadAtrPenalty).length;
  const positiveBonusCount = obs.filter(o => o.hadPositiveBonus).length;
  const alertFiredCount = obs.filter(o => o.alertFired).length;
  const deltas = obs.map(o => o.delta);
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / total;

  // Baseline vs enhanced alert rates
  const baselineGoCount = obs.filter(o => o.baselineScore >= 75).length;
  const enhancedGoCount = obs.filter(o => o.enhancedScore >= 75).length;

  // Outcome tracking
  const reviewed = obs.filter(o => o.outcome !== null);
  const outcomeBreakdown = {};
  const justifiedBreakdown = {};
  for (const o of reviewed) {
    outcomeBreakdown[o.outcome] = (outcomeBreakdown[o.outcome] || 0) + 1;
    if (o.justified) justifiedBreakdown[o.justified] = (justifiedBreakdown[o.justified] || 0) + 1;
  }

  // Most common adjustments
  const adjCounts = {};
  for (const o of obs) {
    for (const a of o.chartAdjustments || []) {
      const key = a.reason?.split(":")[0]?.trim() || "unknown";
      if (!adjCounts[key]) adjCounts[key] = { count: 0, totalPts: 0 };
      adjCounts[key].count++;
      adjCounts[key].totalPts += a.pts;
    }
  }

  const topPenalties = Object.entries(adjCounts)
    .filter(([, v]) => v.totalPts < 0)
    .sort((a, b) => a[1].totalPts - b[1].totalPts)
    .slice(0, 5)
    .map(([k, v]) => ({ type: k, count: v.count, totalPts: v.totalPts }));

  const topBonuses = Object.entries(adjCounts)
    .filter(([, v]) => v.totalPts > 0)
    .sort((a, b) => b[1].totalPts - a[1].totalPts)
    .slice(0, 5)
    .map(([k, v]) => ({ type: k, count: v.count, totalPts: v.totalPts }));

  // Symbol rollups: ATR penalty count and bonus count per symbol
  const symbolRollup = {};
  for (const o of obs) {
    if (!symbolRollup[o.symbol]) symbolRollup[o.symbol] = { total: 0, atrPenalty: 0, bonus: 0, totalDelta: 0 };
    symbolRollup[o.symbol].total++;
    if (o.hadAtrPenalty) symbolRollup[o.symbol].atrPenalty++;
    if (o.hadPositiveBonus) symbolRollup[o.symbol].bonus++;
    symbolRollup[o.symbol].totalDelta += o.delta;
  }

  const topAtrPenaltySymbols = Object.entries(symbolRollup)
    .sort((a, b) => b[1].atrPenalty - a[1].atrPenalty)
    .slice(0, 5)
    .map(([sym, s]) => ({ symbol: sym, count: s.atrPenalty, pct: _r2(s.atrPenalty / s.total) }));

  const topBonusSymbols = Object.entries(symbolRollup)
    .sort((a, b) => b[1].bonus - a[1].bonus)
    .slice(0, 5)
    .map(([sym, s]) => ({ symbol: sym, count: s.bonus, pct: _r2(s.bonus / s.total) }));

  // Setup type rollups: avg delta per setup type
  const typeRollup = {};
  for (const o of obs) {
    if (!typeRollup[o.setupType]) typeRollup[o.setupType] = { total: 0, totalDelta: 0 };
    typeRollup[o.setupType].total++;
    typeRollup[o.setupType].totalDelta += o.delta;
  }

  const avgDeltaByType = Object.fromEntries(
    Object.entries(typeRollup).map(([type, s]) => [type, _r2(s.totalDelta / s.total)])
  );

  // Needs review: unreviewed, prioritized by alert-fired first, then largest |delta|
  const needsReview = obs
    .filter(o => o.sessionsOut === null)
    .sort((a, b) => {
      if (a.alertFired !== b.alertFired) return b.alertFired - a.alertFired;
      return Math.abs(b.delta) - Math.abs(a.delta);
    })
    .slice(0, 20);

  return {
    total,
    atrPenaltyCount,
    positiveBonusCount,
    pctAtrPenalty: _r2(atrPenaltyCount / total),
    pctPositiveBonus: _r2(positiveBonusCount / total),
    avgDelta: _r2(avgDelta),
    avgBaselineScore: _r2(obs.reduce((s, o) => s + o.baselineScore, 0) / total),
    avgEnhancedScore: _r2(obs.reduce((s, o) => s + o.enhancedScore, 0) / total),
    alertFiredCount,
    alertRateBaseline: _r2(baselineGoCount / total),
    alertRateEnhanced: _r2(enhancedGoCount / total),
    reviewed: reviewed.length,
    outcomeBreakdown,
    justifiedBreakdown,
    topPenalties,
    topBonuses,
    topAtrPenaltySymbols,
    topBonusSymbols,
    avgDeltaByType,
    needsReviewCount: needsReview.length,
  };
}

/**
 * Get the priority review queue (unreviewed, alert-fired first, largest delta first).
 * @param {object} [options] — { from, to, limit }
 * @returns {object[]}
 */
export function getNeedsReview(options = {}) {
  const obs = options.from || options.to
    ? getObservationsInRange(options.from, options.to)
    : loadObservations();

  const limit = options.limit || 20;

  return obs
    .filter(o => o.sessionsOut === null)
    .sort((a, b) => {
      if (a.alertFired !== b.alertFired) return b.alertFired - a.alertFired;
      return Math.abs(b.delta) - Math.abs(a.delta);
    })
    .slice(0, limit);
}

// --------------------------------------------------
// QUARTERLY REPORT
// --------------------------------------------------

/**
 * Generate a quarterly calibration report.
 * @param {object} [options] — { from, to, quarter }
 * @returns {object}
 */
export function getQuarterlyCalibrationReport(options = {}) {
  const stats = getCalibrationStats(options);

  // Recommendation
  let recommendation = "keep weights";
  if (stats.pctAtrPenalty > 0.8) recommendation = "reduce ATR penalty (firing > 80% of setups)";
  else if (stats.pctPositiveBonus < 0.1 && stats.total > 20) recommendation = "increase positive bonus weight (< 10% getting bonuses)";
  else if (Math.abs(stats.avgDelta) > 8) recommendation = "review weight balance (avg delta > ±8)";

  return {
    ...stats,
    recommendation,
    generatedAt: new Date().toISOString(),
    dateRange: { from: options.from || "all", to: options.to || "now" },
  };
}

/**
 * Format quarterly report as readable text.
 * @param {object} report
 * @returns {string}
 */
export function formatCalibrationReport(report) {
  const lines = [
    `\n  Quarterly Calibration Report`,
    `  ────────────────────────────`,
    `  Date range: ${report.dateRange.from} to ${report.dateRange.to}`,
    `  Generated: ${report.generatedAt}`,
    ``,
    `  Observations: ${report.total}`,
    `  ATR penalty rate: ${(report.pctAtrPenalty * 100).toFixed(1)}% (${report.atrPenaltyCount} of ${report.total})`,
    `  Positive bonus rate: ${(report.pctPositiveBonus * 100).toFixed(1)}% (${report.positiveBonusCount} of ${report.total})`,
    ``,
    `  Avg baseline score: ${report.avgBaselineScore}`,
    `  Avg enhanced score: ${report.avgEnhancedScore}`,
    `  Avg delta: ${report.avgDelta > 0 ? "+" : ""}${report.avgDelta}`,
    ``,
    `  Alert rate baseline: ${(report.alertRateBaseline * 100).toFixed(1)}%`,
    `  Alert rate enhanced: ${(report.alertRateEnhanced * 100).toFixed(1)}%`,
  ];

  if (report.reviewed > 0) {
    lines.push(``, `  Reviewed: ${report.reviewed}`);
    lines.push(`  Outcomes: ${JSON.stringify(report.outcomeBreakdown)}`);
    lines.push(`  Justified: ${JSON.stringify(report.justifiedBreakdown)}`);
  }

  if (report.topPenalties.length > 0) {
    lines.push(``, `  Top penalties:`);
    for (const p of report.topPenalties) {
      lines.push(`    ${p.type}: ${p.count}x, total ${p.totalPts}pts`);
    }
  }

  if (report.topBonuses.length > 0) {
    lines.push(``, `  Top bonuses:`);
    for (const b of report.topBonuses) {
      lines.push(`    ${b.type}: ${b.count}x, total +${b.totalPts}pts`);
    }
  }

  // Symbol rollups
  if (report.topAtrPenaltySymbols?.length > 0) {
    lines.push(``, `  Top ATR penalty symbols:`);
    for (const s of report.topAtrPenaltySymbols) {
      lines.push(`    ${s.symbol}: ${s.count}x (${(s.pct * 100).toFixed(0)}% of its observations)`);
    }
  }

  if (report.topBonusSymbols?.length > 0) {
    lines.push(``, `  Top bonus symbols:`);
    for (const s of report.topBonusSymbols) {
      lines.push(`    ${s.symbol}: ${s.count}x (${(s.pct * 100).toFixed(0)}% of its observations)`);
    }
  }

  // Setup type rollups
  if (report.avgDeltaByType && Object.keys(report.avgDeltaByType).length > 0) {
    lines.push(``, `  Avg delta by setup type:`);
    for (const [type, delta] of Object.entries(report.avgDeltaByType)) {
      lines.push(`    ${type}: ${delta > 0 ? "+" : ""}${delta}`);
    }
  }

  // Needs review
  if (report.needsReviewCount > 0) {
    lines.push(``, `  Needs review: ${report.needsReviewCount} observations pending outcome`);
  }

  lines.push(``, `  Recommendation: ${report.recommendation}`, ``);
  return lines.join("\n");
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

let _sid = null;
function _sessionId() {
  if (!_sid) _sid = `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return _sid;
}

function _r2(n) { return Math.round(n * 100) / 100; }

function _emptyStats() {
  return {
    total: 0, atrPenaltyCount: 0, positiveBonusCount: 0,
    pctAtrPenalty: 0, pctPositiveBonus: 0, avgDelta: 0,
    avgBaselineScore: 0, avgEnhancedScore: 0,
    alertFiredCount: 0, alertRateBaseline: 0, alertRateEnhanced: 0,
    reviewed: 0, outcomeBreakdown: {}, justifiedBreakdown: {},
    topPenalties: [], topBonuses: [],
  };
}
