// =====================================================
// RECALC MONITOR — operational monitoring + analytics
// =====================================================
// Aggregates freshness, recalculation, invalidation,
// and alert-block metrics across all active cards.
// =====================================================

import { getFreshnessStatus, isAlertSafe, getRecalcLog, RECALC_THRESHOLDS } from "./liveStateEngine.js";

// --------------------------------------------------
// FRESHNESS METRICS — aggregate across all cards
// --------------------------------------------------

/**
 * Compute freshness metrics for a set of active cards.
 * @param {object[]} cards
 * @returns {object}
 */
export function computeFreshnessMetrics(cards) {
  if (!cards || cards.length === 0) {
    return _emptyFreshness();
  }

  let live = 0, aging = 0, stale = 0, noData = 0;
  let alertSafe = 0, alertBlocked = 0;
  const blockedReasons = {};

  for (const card of cards) {
    const f = getFreshnessStatus(card);
    if (f.label === "LIVE") live++;
    else if (f.label === "AGING") aging++;
    else if (f.label === "STALE") stale++;
    else noData++;

    const safety = isAlertSafe(card);
    if (safety.safe) {
      alertSafe++;
    } else {
      alertBlocked++;
      const reason = safety.reason || "unknown";
      blockedReasons[reason] = (blockedReasons[reason] || 0) + 1;
    }
  }

  const total = cards.length;
  const healthPct = total > 0 ? Math.round((live / total) * 100) : 0;

  return {
    total,
    live,
    aging,
    stale,
    noData,
    alertSafe,
    alertBlocked,
    blockedReasons,
    healthPct,
    healthLabel: healthPct >= 80 ? "HEALTHY" : healthPct >= 50 ? "DEGRADED" : "UNHEALTHY",
  };
}

function _emptyFreshness() {
  return {
    total: 0, live: 0, aging: 0, stale: 0, noData: 0,
    alertSafe: 0, alertBlocked: 0, blockedReasons: {},
    healthPct: 0, healthLabel: "UNHEALTHY",
  };
}

// --------------------------------------------------
// RECALC ANALYTICS — aggregate from telemetry log
// --------------------------------------------------

/**
 * Aggregate recalc events from the telemetry log.
 * @param {object} [options] — { since, maxAge }
 * @returns {object}
 */
export function computeRecalcAnalytics(options = {}) {
  const log = getRecalcLog();
  const since = options.since || 0;
  const maxAge = options.maxAge || 3600000; // 1 hour default
  const cutoff = Math.max(since, Date.now() - maxAge);

  const events = log.filter(e => e.type === "recalculate" && e.timestamp >= cutoff);

  if (events.length === 0) {
    return _emptyRecalcAnalytics();
  }

  // By symbol
  const bySymbol = {};
  // By reason code
  const byReason = {};
  // By hour bucket
  const byHour = {};

  for (const e of events) {
    // Symbol
    const sym = e.symbol || "unknown";
    bySymbol[sym] = (bySymbol[sym] || 0) + 1;

    // Reason codes
    for (const code of (e.reasonCodes || [])) {
      byReason[code] = (byReason[code] || 0) + 1;
    }

    // Hour bucket
    const hour = new Date(e.timestamp).getHours();
    byHour[hour] = (byHour[hour] || 0) + 1;
  }

  // Top recalc drivers sorted by count
  const topReasons = Object.entries(byReason)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }));

  // Top symbols by recalc frequency
  const topSymbols = Object.entries(bySymbol)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([symbol, count]) => ({ symbol, count }));

  return {
    totalEvents: events.length,
    bySymbol,
    byReason,
    byHour,
    topReasons,
    topSymbols,
    windowMs: Date.now() - cutoff,
  };
}

function _emptyRecalcAnalytics() {
  return {
    totalEvents: 0, bySymbol: {}, byReason: {}, byHour: {},
    topReasons: [], topSymbols: [], windowMs: 0,
  };
}

// --------------------------------------------------
// INVALIDATION ANALYTICS — from telemetry log
// --------------------------------------------------

/**
 * Aggregate invalidation events from the telemetry log.
 * @param {object} [options] — { since, maxAge }
 * @returns {object}
 */
export function computeInvalidationAnalytics(options = {}) {
  const log = getRecalcLog();
  const maxAge = options.maxAge || 3600000;
  const cutoff = options.since || (Date.now() - maxAge);

  const events = log.filter(e => e.type === "invalidate" && e.timestamp >= cutoff);

  if (events.length === 0) {
    return { totalEvents: 0, byReason: {}, bySymbol: {}, topReasons: [], topSymbols: [] };
  }

  const byReason = {};
  const bySymbol = {};

  for (const e of events) {
    const sym = e.symbol || "unknown";
    bySymbol[sym] = (bySymbol[sym] || 0) + 1;

    for (const r of (e.reasons || [])) {
      byReason[r] = (byReason[r] || 0) + 1;
    }
  }

  const topReasons = Object.entries(byReason)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }));

  const topSymbols = Object.entries(bySymbol)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([symbol, count]) => ({ symbol, count }));

  return { totalEvents: events.length, byReason, bySymbol, topReasons, topSymbols };
}

// --------------------------------------------------
// COMBINED HEALTH SNAPSHOT — single call for UI
// --------------------------------------------------

/**
 * Get a complete operational health snapshot.
 * @param {object[]} cards — active scanner cards
 * @returns {object}
 */
export function getHealthSnapshot(cards) {
  const freshness = computeFreshnessMetrics(cards);
  const recalc = computeRecalcAnalytics({ maxAge: 3600000 });
  const invalidation = computeInvalidationAnalytics({ maxAge: 3600000 });

  return {
    freshness,
    recalc,
    invalidation,
    topRecalcReason: recalc.topReasons[0]?.reason || null,
    topInvalidationReason: invalidation.topReasons[0]?.reason || null,
    generatedAt: Date.now(),
  };
}
