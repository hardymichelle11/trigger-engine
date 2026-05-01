// =====================================================
// DISCOVERY ALERT BRIDGE (Phase 3)
// =====================================================
// Thin translator: converts scannerStateStore events into
// alertEngine-compatible alert objects. The bridge is
// stateless except for an internal dedup window — it never
// modifies the existing alert engine.
//
// Hard rules:
//   - Only fires on meaningful state transitions:
//       * new_best_opportunity
//       * trade_displaced_by_better_opportunity
//   - no_change events return null (suppressed).
//   - Dedup window prevents storms when the same event
//     repeats within a short time for the same symbol.
//   - Alert payload exposes USER-FACING fields only —
//     no scoreBreakdown, no engine internals.
// =====================================================

import { SCANNER_STATE_EVENT, ACTION, safeNum } from "./types.js";

const DEFAULT_DEDUP_WINDOW_MS = 15 * 60 * 1000;   // matches existing alertEngine default

/**
 * @typedef {object} BridgeOptions
 * @property {number} [dedupWindowMs]    suppress repeat events within this window
 * @property {() => number} [now]         injectable clock (default Date.now)
 */

/**
 * Build a stateful bridge instance. Use one per scanner session.
 *
 * @param {BridgeOptions} [options]
 * @returns {{
 *   bridge: (input: object) => object|null,
 *   reset: () => void,
 *   peekRecent: () => Array<{ key: string, ts: number }>,
 * }}
 */
export function createDiscoveryAlertBridge(options = {}) {
  const dedupWindowMs = Number.isFinite(Number(options.dedupWindowMs))
    ? Number(options.dedupWindowMs) : DEFAULT_DEDUP_WINDOW_MS;
  const now = typeof options.now === "function" ? options.now : (() => Date.now());

  /** @type {Map<string, number>} */
  const recent = new Map();

  /**
   * @param {object} input
   * @param {string} input.event                          from scannerStateStore.recordScan
   * @param {object} input.next                           snapshot of the new top candidate
   * @param {object} [input.prev]                         snapshot of the previous top candidate
   * @param {Array<object>} [input.ranked]                full ranked list (optional, enriches alert)
   * @returns {object|null}
   */
  function bridge(input) {
    if (!input || typeof input !== "object") return null;
    const { event, prev, next, ranked } = input;

    // Suppress non-events
    if (event === SCANNER_STATE_EVENT.NO_CHANGE) return null;
    if (event !== SCANNER_STATE_EVENT.NEW_BEST_OPPORTUNITY
        && event !== SCANNER_STATE_EVENT.TRADE_DISPLACED) {
      return null;
    }

    const symbol = next?.previousTopSymbol;
    if (!symbol) return null;

    // Dedup
    const t = now();
    const dedupKey = `${event}:${symbol}`;
    const lastTs = recent.get(dedupKey);
    if (lastTs != null && (t - lastTs) < dedupWindowMs) return null;
    recent.set(dedupKey, t);

    // Pull only safe, user-facing fields off the ranked row
    const top = Array.isArray(ranked) ? ranked.find(r => r?.symbol === symbol) : null;
    const safeCard = top ? {
      symbol: top.symbol,
      rank: top.rank,
      action: top.action,
      score: top.lethalScore,                     // top-line only — no breakdown
      capitalFit: top.capitalFit,
      premiumSource: top.premiumSource,
      bundles: Array.isArray(top.bundles) ? top.bundles.slice(0, 3) : [],
      primaryType: top.primaryType,
      regimeAlignment: top.regimeAlignment,
      // NB: scoreBreakdown intentionally omitted
    } : { symbol, action: ACTION.DEEP_SCAN };

    const summary = buildSummary(event, prev, next, top);
    const priority = pickPriority(event, top);

    return {
      shouldAlert: true,
      priority,
      source: "discovery_state_change",
      eventType: event,
      symbol,
      passedGates: [event],
      failedGates: [],
      card: safeCard,
      summary,
      timestamp: t,
    };
  }

  function reset() { recent.clear(); }
  function peekRecent() {
    return Array.from(recent.entries()).map(([key, ts]) => ({ key, ts }));
  }

  return { bridge, reset, peekRecent };
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function buildSummary(event, prev, next, top) {
  const sym = next?.previousTopSymbol || "?";
  if (event === SCANNER_STATE_EVENT.NEW_BEST_OPPORTUNITY) {
    if (top) {
      return `New best use of capital: ${sym} · ${top.action} · score ${safeNum(top.lethalScore)} · fit ${top.capitalFit}`;
    }
    return `New best opportunity surfaced: ${sym}`;
  }
  if (event === SCANNER_STATE_EVENT.TRADE_DISPLACED) {
    const from = prev?.previousTopSymbol || "?";
    if (top) {
      return `${sym} displaced ${from} as best use of capital · score ${safeNum(top.lethalScore)} (was ${safeNum(prev?.previousTopScore)})`;
    }
    return `${sym} displaced ${from} as best use of capital`;
  }
  return `Discovery event: ${event}`;
}

function pickPriority(event, top) {
  // High priority for displacement (existing capital allocation may need review).
  if (event === SCANNER_STATE_EVENT.TRADE_DISPLACED) return "high";
  if (event === SCANNER_STATE_EVENT.NEW_BEST_OPPORTUNITY) {
    if (top && top.action === ACTION.OPTION_CANDIDATE) return "high";
    if (top && top.action === ACTION.STOCK_CANDIDATE) return "high";
    return "medium";
  }
  return "low";
}

export const DEFAULT_BRIDGE_DEDUP_WINDOW_MS = DEFAULT_DEDUP_WINDOW_MS;
