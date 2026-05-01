// =====================================================
// SCANNER STATE STORE
// =====================================================
// Tiny stateful layer that remembers only the previous
// top-1 candidate so the discovery scanner can emit a
// "displaced by better opportunity" event.
//
// The main alertEngine stays stateless. Wire the events
// returned here into your alert pipeline if desired.
//
// Storage adapter is pluggable so node tests can run
// in-memory and the browser can use localStorage.
// =====================================================

import { SCANNER_STATE_EVENT, safeNum } from "./types.js";

const EMPTY_SNAPSHOT = Object.freeze({
  lastScanTimestamp: null,
  previousTopSymbol: null,
  previousTopSetupId: null,
  previousTopRank: null,
  previousTopScore: null,
});

/**
 * Default in-memory adapter (node-friendly).
 * @returns {{get: () => any, set: (s: any) => void, clear: () => void}}
 */
function createMemoryAdapter() {
  let value = null;
  return {
    get: () => value,
    set: (v) => { value = v; },
    clear: () => { value = null; },
  };
}

/**
 * Optional localStorage adapter (browser only).
 * Falls back to memory if localStorage is unavailable.
 * @param {string} [key]
 */
export function createLocalStorageAdapter(key = "discovery_scanner_state_v1") {
  try {
    if (typeof localStorage === "undefined") return createMemoryAdapter();
    return {
      get: () => {
        try {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      },
      set: (v) => {
        try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota */ }
      },
      clear: () => {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
      },
    };
  } catch {
    return createMemoryAdapter();
  }
}

/**
 * Build a scanner state store.
 *
 * @param {object} [options]
 * @param {{get: () => any, set: (s: any) => void, clear: () => void}} [options.storage]
 * @param {number} [options.scoreNoiseThreshold]   below this delta, treat as no_change
 */
export function createScannerStateStore(options = {}) {
  const storage = options.storage || createMemoryAdapter();
  const noiseThreshold = Number.isFinite(Number(options.scoreNoiseThreshold))
    ? Number(options.scoreNoiseThreshold)
    : 1.0;

  /**
   * Snapshot of the last persisted state.
   * @returns {import("./types.js").ScannerStateSnapshot}
   */
  function getState() {
    const v = storage.get();
    if (!v || typeof v !== "object") return { ...EMPTY_SNAPSHOT };
    return {
      lastScanTimestamp: v.lastScanTimestamp ?? null,
      previousTopSymbol: v.previousTopSymbol ?? null,
      previousTopSetupId: v.previousTopSetupId ?? null,
      previousTopRank: v.previousTopRank ?? null,
      previousTopScore: v.previousTopScore ?? null,
    };
  }

  /**
   * Record a scan and emit the appropriate event.
   * Only the top-1 candidate is persisted.
   *
   * @param {object} args
   * @param {object|null} args.topCandidate         { symbol, setupId?, rank?, lethalScore }
   * @param {number} [args.now]                     epoch ms (override for tests)
   * @returns {{event: string, prev: import("./types.js").ScannerStateSnapshot, next: import("./types.js").ScannerStateSnapshot}}
   */
  function recordScan(args = {}) {
    const { topCandidate, now } = args;
    const prev = getState();
    const ts = Number.isFinite(Number(now)) ? Number(now) : Date.now();

    if (!topCandidate || !topCandidate.symbol) {
      // No top candidate this cycle. Don't move state — preserve last-known.
      return {
        event: SCANNER_STATE_EVENT.NO_CHANGE,
        prev,
        next: prev,
      };
    }

    const nextSym = String(topCandidate.symbol).toUpperCase();
    const nextScore = safeNum(topCandidate.lethalScore);
    const nextRank = Number.isFinite(Number(topCandidate.rank)) ? Number(topCandidate.rank) : 1;
    const nextSetupId = topCandidate.setupId ?? topCandidate.id ?? null;

    let event = SCANNER_STATE_EVENT.NO_CHANGE;

    if (prev.previousTopSymbol == null) {
      event = SCANNER_STATE_EVENT.NEW_BEST_OPPORTUNITY;
    } else if (prev.previousTopSymbol !== nextSym) {
      event = SCANNER_STATE_EVENT.TRADE_DISPLACED;
    } else if (Math.abs(nextScore - safeNum(prev.previousTopScore)) <= noiseThreshold) {
      event = SCANNER_STATE_EVENT.NO_CHANGE;
    } else {
      // Same symbol, score moved meaningfully — still treat as no displacement.
      event = SCANNER_STATE_EVENT.NO_CHANGE;
    }

    const next = {
      lastScanTimestamp: ts,
      previousTopSymbol: nextSym,
      previousTopSetupId: nextSetupId,
      previousTopRank: nextRank,
      previousTopScore: nextScore,
    };
    storage.set(next);

    return { event, prev, next };
  }

  function clear() {
    storage.clear();
  }

  return { getState, recordScan, clear };
}
