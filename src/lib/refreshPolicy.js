// =====================================================================
// Refresh policy — per-session quote and analytics cadences
// =====================================================================
// Premarket has distorted liquidity, so we update quotes fast but
// recompute conviction analytics on a slower beat. Regular session is
// the standard cadence. Replay-only sessions disable auto-refresh by
// returning null intervals.
//
// Hard rules:
//   - Pure data, no I/O.
//   - Returning a null interval means "don't auto-refresh on this
//     cadence in this session". The hook treats null as paused.
// =====================================================================

import { SESSION_STATES } from "./sessionState.js";

/**
 * @typedef {Object} RefreshPolicy
 * @property {number|null} quoteIntervalMs      ticker quote refresh
 * @property {number|null} analyticsIntervalMs  full scan / analytics recompute
 * @property {string} reason                    why these values, for the UI tooltip
 */

const POLICIES = Object.freeze({
  PREMARKET: {
    quoteIntervalMs:     15_000,   // 15s — quotes update fast
    analyticsIntervalMs: 90_000,   // 90s — premarket liquidity is distorted; recompute slower
    reason: "Premarket: quotes refresh fast, conviction analytics recompute on a slower beat to avoid noise.",
  },
  REGULAR: {
    quoteIntervalMs:     15_000,
    analyticsIntervalMs: 60_000,
    reason: "Regular session: standard 15s quote / 60s analytics cadence.",
  },
  AFTERHOURS: {
    quoteIntervalMs:     30_000,
    analyticsIntervalMs: 120_000,
    reason: "After-hours: thinner liquidity — slower cadence on both quotes and analytics.",
  },
  WEEKEND_REPLAY: {
    quoteIntervalMs:     null,
    analyticsIntervalMs: null,
    reason: "Weekend replay: auto-refresh paused — feed is not live.",
  },
  CLOSED: {
    quoteIntervalMs:     null,
    analyticsIntervalMs: null,
    reason: "Market closed: auto-refresh paused — feed is not live.",
  },
});

/**
 * @param {string} session   one of SESSION_STATES
 * @returns {RefreshPolicy}
 */
export function refreshPolicyForSession(session) {
  return POLICIES[session] || POLICIES.CLOSED;
}

/**
 * Convenience: the most-aggressive cadence still in effect for a
 * session. Returns null when both intervals are null (replay-only).
 */
export function effectiveCadenceMs(session) {
  const p = refreshPolicyForSession(session);
  if (p.quoteIntervalMs == null && p.analyticsIntervalMs == null) return null;
  // Use the analytics cadence as the master tick — quote updates are a
  // strict subset of what an analytics tick produces today.
  return p.analyticsIntervalMs ?? p.quoteIntervalMs;
}

export const REFRESH_POLICIES = POLICIES;
export { SESSION_STATES };
