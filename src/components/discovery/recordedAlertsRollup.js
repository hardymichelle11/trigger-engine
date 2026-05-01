// =====================================================
// RECORDED ALERTS ROLLUP (Phase 4.3)
// =====================================================
// Visibility-only counters derived from the SANITIZED
// projectAlertHistory output from Phase 4.2. Returns
// exactly four counters and nothing else.
//
// Hard rules:
//   - INPUT must be the projected rows from Phase 4.2's
//     recordedAlertsView. This module DOES NOT import
//     loadAlertHistory and DOES NOT touch raw alertHistory.
//   - Pure function. Same input + same `now` → same output.
//   - Tolerates null / non-array / malformed input safely.
//   - Output shape is locked to { today, thisWeek, newBest,
//     displaced }. No averages, rates, streaks, or other
//     analytics.
//   - Time windows are ROLLING from injected `now`:
//       today    = (now − 24h, now]
//       thisWeek = (now − 7d,  now]
//   - Event counts are totals across the projected rows
//     (which Phase 4.2 already capped at 8). They are not
//     time-windowed.
// =====================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const EVENT_NEW_BEST = "new_best_opportunity";
const EVENT_DISPLACED = "trade_displaced_by_better_opportunity";

/**
 * @typedef {object} AlertsRollup
 * @property {number} today        rows with timestamp inside the rolling 24h window
 * @property {number} thisWeek     rows with timestamp inside the rolling 7-day window
 * @property {number} newBest      rows where event === "new_best_opportunity"
 * @property {number} displaced    rows where event === "trade_displaced_by_better_opportunity"
 */

const ZERO = Object.freeze({ today: 0, thisWeek: 0, newBest: 0, displaced: 0 });

/**
 * Compute the four-count rollup from already-sanitized projection rows.
 *
 * @param {unknown} projectedRows                output of projectAlertHistory()
 * @param {object} [options]
 * @param {number} [options.now]                 epoch ms; defaults to Date.now()
 * @returns {AlertsRollup}
 */
export function computeAlertsRollup(projectedRows, options = {}) {
  if (!Array.isArray(projectedRows) || projectedRows.length === 0) {
    return { ...ZERO };
  }

  const nowMs = Number.isFinite(Number(options?.now)) ? Number(options.now) : Date.now();
  const todayFloor = nowMs - DAY_MS;
  const weekFloor = nowMs - WEEK_MS;

  let today = 0;
  let thisWeek = 0;
  let newBest = 0;
  let displaced = 0;

  for (const row of projectedRows) {
    if (!row || typeof row !== "object") continue;

    // Strict null check: Number(null) === 0 would otherwise sneak through
    // isFinite() and pretend null is a valid epoch.
    const tsRaw = row.timestamp;
    const ts = (tsRaw != null && Number.isFinite(Number(tsRaw))) ? Number(tsRaw) : null;
    if (ts != null && ts <= nowMs) {
      if (ts >= todayFloor) today += 1;
      if (ts >= weekFloor) thisWeek += 1;
    }

    if (row.event === EVENT_NEW_BEST) newBest += 1;
    else if (row.event === EVENT_DISPLACED) displaced += 1;
  }

  return { today, thisWeek, newBest, displaced };
}

// --------------------------------------------------
// LABELS — used by the chip render
// --------------------------------------------------

export const ROLLUP_CHIP_LABEL = Object.freeze({
  today: "24h",
  thisWeek: "7d",
  newBest: "new best",
  displaced: "displaced",
});
