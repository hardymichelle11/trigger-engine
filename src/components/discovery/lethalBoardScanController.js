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
  // Phase 4.7.6: Replay Last Close — real previous-session market data
  // played back through the same scanner/ranker, with freshness checks
  // disabled (session = "replay"). Preview-only by default; record paths
  // tag the alert with recordedSource: "replay_last_close" so committed
  // replay alerts are not confused with live alerts.
  REPLAY_LAST_CLOSE: "replay_last_close",
  COMMIT_REPLAY: "commit_replay",
});

// Phase 4.7.6: alert audit tag for replay-sourced commits.
export const RECORDED_SOURCE = Object.freeze({
  LIVE: "live",
  REPLAY_LAST_CLOSE: "replay_last_close",
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

    if (mode !== SCAN_MODE.COMMIT_LIVE && mode !== SCAN_MODE.COMMIT_REPLAY) {
      // PREVIEW_SAMPLE / PREVIEW_LIVE / REPLAY_LAST_CLOSE: never touch the
      // alert pipeline. Replay preview is loud about its source on the UI
      // (badge + banner + mode label) but does not persist anything.
      return {
        mode,
        scanResult,
        status: {
          mode, event: null, recorded: false,
          suppressedReason: SUPPRESSED_REASON.PREVIEW_MODE,
        },
      };
    }

    // Commit path. recordedSource is forwarded so the persisted alert
    // carries an honest live/replay tag (Phase 4.7.6).
    const recordedSource = mode === SCAN_MODE.COMMIT_REPLAY
      ? RECORDED_SOURCE.REPLAY_LAST_CLOSE
      : RECORDED_SOURCE.LIVE;
    const r = wireup.route(scanResult, { recordedSource });
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
  [SCAN_MODE.REPLAY_LAST_CLOSE]: "replay — last close",
  [SCAN_MODE.COMMIT_REPLAY]: "recorded (replay)",
});

export const SUPPRESSED_REASON_LABEL = Object.freeze({
  [SUPPRESSED_REASON.PREVIEW_MODE]: "preview mode — alert not persisted",
  [SUPPRESSED_REASON.NO_SCAN_RESULT]: "no scan result",
  [SUPPRESSED_REASON.NO_CHANGE]: "no change since last commit",
  [SUPPRESSED_REASON.DEDUP_WINDOW]: "dedup window — same event recently fired",
  [SUPPRESSED_REASON.RECORD_FAILED]: "record_alert threw — not persisted",
});
