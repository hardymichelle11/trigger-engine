// =====================================================
// LETHAL BOARD SCAN CONTROLLER (Phase 4.1)
// =====================================================
// Tiny pure-ish dispatcher that decides whether a scan
// result should be persisted to alert history (commit) or
// shown without persistence (preview).
//
// Hard rules:
//   - Preview mode NEVER calls recordAlert.
//   - Commit mode delegates to discoveryAlertWireup, which
//     suppresses no_change events and respects the bridge
//     dedup window.
//   - The controller carries a single wireup instance so
//     dedup state survives across calls in the same session.
//   - Status output is enough for the UI to explain why an
//     alert was or wasn't persisted.
// =====================================================

import { createDiscoveryAlertWireup } from "../../engines/discovery/discoveryAlertWireup.js";
import { SCANNER_STATE_EVENT } from "../../engines/discovery/types.js";

export const SCAN_MODE = Object.freeze({
  PREVIEW_SAMPLE: "preview_sample",
  PREVIEW_LIVE: "preview_live",
  COMMIT_LIVE: "commit_live",
});

export const SUPPRESSED_REASON = Object.freeze({
  PREVIEW_MODE: "preview_mode",
  NO_SCAN_RESULT: "no_scan_result",
  NO_CHANGE: "no_change",
  DEDUP_WINDOW: "dedup_window",
  RECORD_FAILED: "record_failed",
});

/**
 * @typedef {object} ScanStatus
 * @property {string} mode                 SCAN_MODE value
 * @property {string|null} event           SCANNER_STATE_EVENT value or null
 * @property {boolean} recorded            true if recordAlertFn was called and succeeded
 * @property {string|null} suppressedReason SUPPRESSED_REASON value or null when recorded
 */

/**
 * Build a controller. Use one per page session so the bridge dedup
 * state persists across consecutive scans.
 *
 * @param {object} [options]
 * @param {(alert: object) => void} [options.recordAlertFn]   DI for alertHistory.recordAlert
 * @param {() => number} [options.now]                         injectable clock
 * @param {ReturnType<typeof createDiscoveryAlertWireup>} [options.wireup]   override (mostly for tests)
 */
export function createScanController(options = {}) {
  const wireup = options.wireup || createDiscoveryAlertWireup({
    recordAlertFn: options.recordAlertFn,
    now: options.now,
  });

  /**
   * @param {object} args
   * @param {object|null} args.scanResult     runMarketDiscoveryScan() output
   * @param {string} args.mode                SCAN_MODE value
   * @returns {{ mode: string, scanResult: object|null, status: ScanStatus }}
   */
  function processScan(args) {
    const mode = args?.mode || SCAN_MODE.PREVIEW_LIVE;
    const scanResult = args?.scanResult || null;

    if (!scanResult) {
      return {
        mode,
        scanResult: null,
        status: {
          mode, event: null, recorded: false,
          suppressedReason: SUPPRESSED_REASON.NO_SCAN_RESULT,
        },
      };
    }

    if (mode !== SCAN_MODE.COMMIT_LIVE) {
      // PREVIEW_SAMPLE and PREVIEW_LIVE: never touch the alert pipeline.
      return {
        mode,
        scanResult,
        status: {
          mode, event: null, recorded: false,
          suppressedReason: SUPPRESSED_REASON.PREVIEW_MODE,
        },
      };
    }

    // Commit path
    const r = wireup.route(scanResult);
    let suppressedReason = null;
    if (!r.recorded) {
      if (r.event === SCANNER_STATE_EVENT.NO_CHANGE) suppressedReason = SUPPRESSED_REASON.NO_CHANGE;
      else if (r.alert == null) suppressedReason = SUPPRESSED_REASON.DEDUP_WINDOW;
      else suppressedReason = SUPPRESSED_REASON.RECORD_FAILED;
    }
    return {
      mode,
      scanResult,
      status: {
        mode,
        event: r.event,
        recorded: r.recorded,
        suppressedReason,
      },
    };
  }

  function stats() { return wireup.stats(); }
  function reset() { wireup.reset(); }

  return { processScan, stats, reset };
}

// --------------------------------------------------
// HUMAN LABELS — used by the status panel
// --------------------------------------------------

export const SCAN_MODE_LABEL = Object.freeze({
  [SCAN_MODE.PREVIEW_SAMPLE]: "preview (sample)",
  [SCAN_MODE.PREVIEW_LIVE]: "preview (live)",
  [SCAN_MODE.COMMIT_LIVE]: "recorded (live)",
});

export const SUPPRESSED_REASON_LABEL = Object.freeze({
  [SUPPRESSED_REASON.PREVIEW_MODE]: "preview mode — alert not persisted",
  [SUPPRESSED_REASON.NO_SCAN_RESULT]: "no scan result",
  [SUPPRESSED_REASON.NO_CHANGE]: "no change since last commit",
  [SUPPRESSED_REASON.DEDUP_WINDOW]: "dedup window — same event recently fired",
  [SUPPRESSED_REASON.RECORD_FAILED]: "record_alert threw — not persisted",
});
