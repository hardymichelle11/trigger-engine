// =====================================================
// DISCOVERY ALERT WIRE-UP (Phase 4)
// =====================================================
// Routes scannerStateStore events through the
// discoveryAlertBridge into the existing alertHistory
// (recordAlert) without modifying alertEngine.js or
// alertHistory.js.
//
// Hard rules:
//   - Suppresses no_change events (no alert storm).
//   - Preserves bridge dedup (default 15 min window).
//   - alertHistory.recordAlert is dependency-injected so
//     tests can capture without touching localStorage.
//   - Outcomes are returned, not just emitted, so callers
//     can measure "how often did the scanner produce a
//     new best opportunity?" — the start of measurement.
// =====================================================

import { createScannerStateStore } from "./scannerStateStore.js";
import { createDiscoveryAlertBridge } from "./discoveryAlertBridge.js";
import { SCANNER_STATE_EVENT } from "./types.js";

/**
 * @typedef {object} WireupOptions
 * @property {ReturnType<typeof createScannerStateStore>} [store]   defaults to a fresh in-memory store
 * @property {ReturnType<typeof createDiscoveryAlertBridge>} [bridge] defaults to a fresh bridge
 * @property {(alert: object) => void} [recordAlertFn]               DI for alertHistory.recordAlert
 * @property {() => number} [now]                                     injectable clock
 */

/**
 * Build a wire-up that pumps scan results into the alert pipeline.
 *
 * @param {WireupOptions} [options]
 * @returns {{
 *   route: (scanResult: object) => { event: string, alert: object|null, recorded: boolean },
 *   stats: () => { totalScans: number, totalAlerts: number, byEvent: Record<string, number> },
 *   reset: () => void,
 * }}
 */
export function createDiscoveryAlertWireup(options = {}) {
  const store = options.store || createScannerStateStore();
  const bridge = options.bridge || createDiscoveryAlertBridge({ now: options.now });
  const recordAlertFn = typeof options.recordAlertFn === "function"
    ? options.recordAlertFn : null;
  const now = typeof options.now === "function" ? options.now : () => Date.now();

  let totalScans = 0;
  let totalAlerts = 0;
  const byEvent = Object.create(null);

  /**
   * @param {object} scanResult                runMarketDiscoveryScan() output
   */
  function route(scanResult) {
    totalScans += 1;
    if (!scanResult || typeof scanResult !== "object") {
      return { event: SCANNER_STATE_EVENT.NO_CHANGE, alert: null, recorded: false };
    }

    // Extract the top candidate the discovery layer endorsed as
    // "best use of capital." Without one, no alert fires.
    const top = scanResult.bestUseOfCapital
      || (Array.isArray(scanResult.ranked) ? scanResult.ranked.find(r => r?.bestUseOfCapital) : null)
      || (Array.isArray(scanResult.ranked) && scanResult.ranked.length > 0 ? scanResult.ranked[0] : null);

    const evt = store.recordScan({
      topCandidate: top ? {
        symbol: top.symbol,
        lethalScore: top.lethalScore,
        rank: top.rank,
      } : null,
      now: now(),
    });

    byEvent[evt.event] = (byEvent[evt.event] || 0) + 1;

    if (evt.event === SCANNER_STATE_EVENT.NO_CHANGE) {
      // Suppression is intentional — keeps the alert pipeline quiet
      // when nothing material has changed between scans.
      return { event: evt.event, alert: null, recorded: false };
    }

    const alert = bridge.bridge({
      event: evt.event,
      prev: evt.prev,
      next: evt.next,
      ranked: scanResult.ranked,
    });

    if (!alert) {
      // Bridge suppressed (dedup window or empty payload) — also no record.
      return { event: evt.event, alert: null, recorded: false };
    }

    let recorded = false;
    if (recordAlertFn) {
      try {
        recordAlertFn(alert);
        recorded = true;
      } catch {
        // Failure to persist must not break the wire-up.
        recorded = false;
      }
    }
    if (recorded) totalAlerts += 1;
    return { event: evt.event, alert, recorded };
  }

  function stats() {
    return { totalScans, totalAlerts, byEvent: { ...byEvent } };
  }

  function reset() {
    store.clear();
    bridge.reset();
    totalScans = 0;
    totalAlerts = 0;
    for (const k of Object.keys(byEvent)) delete byEvent[k];
  }

  return { route, stats, reset };
}
