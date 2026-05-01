// =====================================================
// POLYGON GLUE (Phase 4)
// =====================================================
// Glue between the existing polygonProxy (URL + key handling)
// and the Phase 3 Polygon adapters (universe + options).
// Wraps live calls with:
//   - per-call timeout
//   - circuit breaker (open after N consecutive failures)
//   - capability probe for /v3/snapshot/options/{underlying}
//   - structured metadata explaining live/cached/fallback state
//
// Hard rules:
//   - Live failures NEVER throw or freeze the scanner. They
//     resolve to an empty/structured-absence result with a
//     `source: "fallback"` (or "circuit_open") metadata tag
//     and a human-readable `reason`.
//   - DOES NOT fabricate live data. If the chain endpoint is
//     unavailable, premium estimation falls back to iv/atr.
//   - Fetcher is dependency-injected so tests stay offline.
// =====================================================

import {
  fetchUniverse as adapterFetchUniverse,
  buildUniverseFromPolygon,
  UNIVERSE_SOURCE,
} from "./polygonUniverseAdapter.js";
import {
  fetchOptionsChains as adapterFetchOptionsChains,
  buildOptionsDataFromPolygon,
  OPTIONS_STATUS,
} from "./polygonOptionsAdapter.js";
import { buildPolygonUrl, canAccessPolygon } from "../../lib/polygonProxy.js";
import { fetchSessionAwareUniverse } from "./sessionAwareUniverse.js";

// --------------------------------------------------
// CONSTANTS / DEFAULTS
// --------------------------------------------------

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_PROBE_SYMBOL = "AAPL";
const CAPABILITY_TTL_MS = 60 * 60 * 1000;        // re-probe options availability hourly

export const GLUE_SOURCE = Object.freeze({
  LIVE: "live",
  CIRCUIT_OPEN: "circuit_open",
  FALLBACK: "fallback",
  EMPTY: "empty",
  PROXY_UNREACHABLE: "proxy_unreachable",
});

export const OPTIONS_CAPABILITY = Object.freeze({
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
  UNAVAILABLE_PLAN: "unavailable_plan",   // Phase 4.5A: 403 entitlement (e.g. Polygon plan tier)
  UNKNOWN: "unknown",
});

// --------------------------------------------------
// CIRCUIT BREAKER (small, in-memory)
// --------------------------------------------------

function createCircuitBreaker({
  failureThreshold = DEFAULT_FAILURE_THRESHOLD,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  now = () => Date.now(),
} = {}) {
  let consecutiveFailures = 0;
  let openedAt = null;
  let lastReason = null;

  function state() {
    if (openedAt == null) return "closed";
    return (now() - openedAt) >= cooldownMs ? "half_open" : "open";
  }
  function allow() { return state() !== "open"; }
  function recordSuccess() {
    consecutiveFailures = 0;
    openedAt = null;
    lastReason = null;
  }
  function recordFailure(err) {
    consecutiveFailures += 1;
    lastReason = (err && (err.message || String(err))) || "unknown_error";
    if (consecutiveFailures >= failureThreshold) {
      openedAt = now();
    }
  }
  function reset() {
    consecutiveFailures = 0;
    openedAt = null;
    lastReason = null;
  }
  return {
    state, allow, recordSuccess, recordFailure, reset,
    snapshot: () => ({ state: state(), consecutiveFailures, openedAt, lastReason, failureThreshold, cooldownMs }),
  };
}

// --------------------------------------------------
// DEFAULT LIVE FETCHER (uses polygonProxy under the hood)
// Tests inject a mock fetcher instead — this code path
// only runs in a browser/node environment with `fetch`.
// --------------------------------------------------

function buildDefaultFetcher({ timeoutMs }) {
  if (typeof fetch !== "function") return null;
  return async function defaultFetcher(path) {
    const ok = await canAccessPolygon();
    if (!ok) {
      const err = new Error("polygon_proxy_unreachable");
      err.cause = "no_proxy_no_key";
      throw err;
    }
    const url = await buildPolygonUrl(path);
    const ctrl = typeof AbortSignal?.timeout === "function"
      ? AbortSignal.timeout(timeoutMs) : undefined;
    const response = await fetch(url, ctrl ? { signal: ctrl } : undefined);
    if (!response.ok) {
      const err = new Error(`polygon_http_${response.status}`);
      err.status = response.status;
      throw err;
    }
    return await response.json();
  };
}

// --------------------------------------------------
// PUBLIC: createPolygonGlue
// --------------------------------------------------

/**
 * @typedef {object} GlueOptions
 * @property {(path: string) => Promise<object>} [fetcher]   DI fetcher; defaults to live HTTP via polygonProxy
 * @property {() => number} [now]                             injectable clock
 * @property {number} [timeoutMs]
 * @property {object} [circuitOptions]                        { failureThreshold, cooldownMs }
 * @property {string} [probeSymbol]                           default "AAPL"
 * @property {(args: object) => Promise<object>} [universeFetcher]   override adapterFetchUniverse (mostly for tests)
 * @property {(args: object) => Promise<object>} [optionsFetcher]    override adapterFetchOptionsChains
 */

/**
 * @param {GlueOptions} [options]
 */
export function createPolygonGlue(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const breaker = createCircuitBreaker({ now, ...(options.circuitOptions || {}) });
  const probeSymbol = options.probeSymbol || DEFAULT_PROBE_SYMBOL;

  // Resolve fetcher lazily so we can fall through to the default.
  let cachedDefault = null;
  async function resolveFetcher() {
    if (typeof options.fetcher === "function") return options.fetcher;
    if (!cachedDefault) cachedDefault = buildDefaultFetcher({ timeoutMs });
    return cachedDefault;
  }

  const universeFetcher = typeof options.universeFetcher === "function"
    ? options.universeFetcher : adapterFetchUniverse;
  const optionsFetcher = typeof options.optionsFetcher === "function"
    ? options.optionsFetcher : adapterFetchOptionsChains;

  /** @type {{optionsCapability: string, probedAt: number, probeSymbol: string, probeError?: string} | null} */
  let _capabilityCache = null;

  // --------------------------------------------------
  // Universe (gainers / losers / most_active / custom)
  // --------------------------------------------------

  async function fetchUniverseLive({ source, customSymbols, maxStaleMs } = {}) {
    if (!breaker.allow()) {
      return wrapEmptyUniverse({
        source: GLUE_SOURCE.CIRCUIT_OPEN,
        reason: breaker.snapshot().lastReason || "circuit_open",
        breakerState: breaker.snapshot().state,
        generatedAt: now(),
      });
    }
    const fetcher = await resolveFetcher();
    if (typeof fetcher !== "function") {
      return wrapEmptyUniverse({
        source: GLUE_SOURCE.PROXY_UNREACHABLE,
        reason: "no_fetcher_available",
        breakerState: breaker.snapshot().state,
        generatedAt: now(),
      });
    }

    let result;
    try {
      result = await universeFetcher({
        // Phase 4.5A: default is now SESSION_AWARE (the new orchestrator-resolved
        // source). MOST_ACTIVE remains importable but is routed to a
        // deprecation marker by the adapter, not to /most_active.
        source: source || UNIVERSE_SOURCE.SESSION_AWARE,
        fetcher, customSymbols, now: now(), maxStaleMs,
      });
    } catch (err) {
      breaker.recordFailure(err);
      return wrapEmptyUniverse({
        source: GLUE_SOURCE.FALLBACK,
        reason: err?.message || "fetch_failed",
        breakerState: breaker.snapshot().state,
        generatedAt: now(),
      });
    }

    // Phase 4.5A: detect adapter-level retirement. The adapter signals
    // retired/orchestrator-resolved sources via `deprecated_source:*` reasons.
    // No HTTP call was made, so the circuit breaker is NOT incremented.
    const empty = result.metadata.normalizedCount === 0;
    const deprecationReason = (result.metadata.droppedReasons || []).find(d =>
      /^deprecated_source/.test(String(d.reason)));
    if (empty && deprecationReason) {
      return wrapEmptyUniverse({
        ...result,
        source: GLUE_SOURCE.FALLBACK,
        reason: deprecationReason.reason,
        breakerState: breaker.snapshot().state,
        generatedAt: now(),
      });
    }

    // Adapter never throws — but it does signal network failures in
    // droppedReasons. If nothing normalized AND there are network-shaped
    // reasons, count as failure (and increment the breaker).
    const networkReason = (result.metadata.droppedReasons || []).find(d =>
      /missing_fetcher|fetch_failed/.test(String(d.reason)));
    if (empty && networkReason) {
      breaker.recordFailure(new Error(networkReason.reason));
      return wrapEmptyUniverse({
        ...result,
        source: GLUE_SOURCE.FALLBACK,
        reason: networkReason.reason,
        breakerState: breaker.snapshot().state,
        generatedAt: now(),
      });
    }

    breaker.recordSuccess();
    return {
      ...result,
      metadata: {
        ...result.metadata,
        source: GLUE_SOURCE.LIVE,
        breakerState: breaker.snapshot().state,
        generatedAt: now(),
      },
    };
  }

  // --------------------------------------------------
  // Options chains
  // --------------------------------------------------

  async function fetchOptionsLive({ symbols, contractTypes } = {}) {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return wrapEmptyOptions({
        source: GLUE_SOURCE.EMPTY,
        reason: "no_symbols",
        breakerState: breaker.snapshot().state,
        generatedAt: now(),
      });
    }

    if (!breaker.allow()) {
      return wrapEmptyOptions({
        source: GLUE_SOURCE.CIRCUIT_OPEN,
        reason: breaker.snapshot().lastReason || "circuit_open",
        breakerState: breaker.snapshot().state,
        generatedAt: now(),
        symbols,
      });
    }

    // Capability gate — if we know the endpoint is unavailable for any
    // reason, skip the call entirely so estimatedPremiumEngine falls
    // through to iv/atr automatically. Phase 4.5A: also short-circuit on
    // UNAVAILABLE_PLAN so 403-entitlement responses don't end up labelled
    // as `source: "live"` with empty chains.
    const cap = await probeOptionsCapability();
    if (cap.optionsCapability === OPTIONS_CAPABILITY.UNAVAILABLE
        || cap.optionsCapability === OPTIONS_CAPABILITY.UNAVAILABLE_PLAN) {
      return wrapEmptyOptions({
        source: GLUE_SOURCE.FALLBACK,
        reason: `options_capability_${cap.optionsCapability}`,
        capability: cap,
        breakerState: breaker.snapshot().state,
        generatedAt: now(),
        symbols,
      });
    }

    const fetcher = await resolveFetcher();
    if (typeof fetcher !== "function") {
      return wrapEmptyOptions({
        source: GLUE_SOURCE.PROXY_UNREACHABLE,
        reason: "no_fetcher_available",
        capability: cap,
        breakerState: breaker.snapshot().state,
        generatedAt: now(),
        symbols,
      });
    }

    let result;
    try {
      result = await optionsFetcher({
        symbols, fetcher, now: now(), contractTypes,
      });
    } catch (err) {
      breaker.recordFailure(err);
      return wrapEmptyOptions({
        source: GLUE_SOURCE.FALLBACK,
        reason: err?.message || "fetch_failed",
        capability: cap,
        breakerState: breaker.snapshot().state,
        generatedAt: now(),
        symbols,
      });
    }

    breaker.recordSuccess();
    return {
      ...result,
      metadata: {
        ...result.metadata,
        source: GLUE_SOURCE.LIVE,
        capability: cap,
        breakerState: breaker.snapshot().state,
        generatedAt: now(),
      },
    };
  }

  // --------------------------------------------------
  // Capability probe — /v3/snapshot/options/{underlying}
  // --------------------------------------------------

  async function probeOptionsCapability(symbol) {
    const sym = (symbol || probeSymbol).toUpperCase();
    const t = now();
    if (_capabilityCache && (t - _capabilityCache.probedAt) < CAPABILITY_TTL_MS) {
      return _capabilityCache;
    }
    const fetcher = await resolveFetcher();
    if (typeof fetcher !== "function") {
      _capabilityCache = {
        optionsCapability: OPTIONS_CAPABILITY.UNKNOWN,
        probedAt: t,
        probeSymbol: sym,
        probeError: "no_fetcher_available",
      };
      return _capabilityCache;
    }
    try {
      const payload = await fetcher(`/v3/snapshot/options/${encodeURIComponent(sym)}`);
      const ok = !!(payload && (Array.isArray(payload.results) || payload.status === "OK"));
      _capabilityCache = {
        optionsCapability: ok ? OPTIONS_CAPABILITY.AVAILABLE : OPTIONS_CAPABILITY.UNAVAILABLE,
        probedAt: t,
        probeSymbol: sym,
      };
    } catch (err) {
      // Phase 4.5A: distinguish plan-tier denial (403) from generic failure.
      // Polygon returns 403 NOT_AUTHORIZED when the plan does not include
      // the options snapshot endpoint. UI surfaces this as a distinct state
      // so operators know premium will remain `estimated` until a different
      // provider (e.g. ThetaData) is wired in Phase 4.5C.
      const status = Number(err?.status);
      const isPlanError = status === 403;
      _capabilityCache = {
        optionsCapability: isPlanError
          ? OPTIONS_CAPABILITY.UNAVAILABLE_PLAN
          : OPTIONS_CAPABILITY.UNAVAILABLE,
        probedAt: t,
        probeSymbol: sym,
        probeError: err?.message || "probe_failed",
        httpStatus: Number.isFinite(status) ? status : null,
      };
    }
    return _capabilityCache;
  }

  function clearCapabilityCache() { _capabilityCache = null; }
  function getCircuitState() { return breaker.snapshot(); }

  return {
    fetchUniverseLive,
    fetchOptionsLive,
    probeOptionsCapability,
    clearCapabilityCache,
    getCircuitState,
    resetCircuit: () => breaker.reset(),
  };
}

// --------------------------------------------------
// SHAPE BUILDERS
// --------------------------------------------------

function wrapEmptyUniverse(extra) {
  return {
    symbols: [],
    marketDataBySymbol: {},
    metadata: {
      source: extra?.source || GLUE_SOURCE.EMPTY,
      reason: extra?.reason || null,
      snapshotCount: 0,
      normalizedCount: 0,
      droppedCount: 0,
      droppedReasons: [],
      breakerState: extra?.breakerState || "closed",
      generatedAt: extra?.generatedAt || Date.now(),
    },
  };
}

function wrapEmptyOptions(extra) {
  const empty = buildOptionsDataFromPolygon({ snapshotsBySymbol: {} });
  const fallbackEntry = {
    chain: [], asOf: extra?.generatedAt || Date.now(),
    status: OPTIONS_STATUS.NO_CHAIN_DATA, droppedReasons: [],
  };
  const optionsDataBySymbol = {};
  for (const sym of (extra?.symbols || [])) {
    const k = String(sym).toUpperCase();
    optionsDataBySymbol[k] = fallbackEntry;
  }
  return {
    optionsDataBySymbol,
    metadata: {
      ...empty.metadata,
      source: extra?.source || GLUE_SOURCE.EMPTY,
      reason: extra?.reason || null,
      capability: extra?.capability || null,
      breakerState: extra?.breakerState || "closed",
      generatedAt: extra?.generatedAt || Date.now(),
    },
  };
}

// --------------------------------------------------
// CONVENIENCE — combine universe + options into a
// scanner-ready input bundle, with metadata.
// --------------------------------------------------

/**
 * High-level helper: pull universe + options chains for the
 * resulting symbols. Returns the inputs runMarketDiscoveryScan
 * needs, plus structured metadata explaining live/fallback state.
 *
 * @param {object} args
 * @param {ReturnType<typeof createPolygonGlue>} args.glue
 * @param {string} [args.universeSource]
 * @param {string[]} [args.customSymbols]
 * @param {boolean} [args.fetchChains]                         default true
 * @param {string[]} [args.contractTypes]
 * @returns {Promise<{
 *   symbols: string[],
 *   marketDataBySymbol: Record<string, object>,
 *   optionsDataBySymbol: Record<string, object>,
 *   metadata: object,
 * }>}
 */
export async function fetchScannerInputBundle(args) {
  // Phase 4.5A: default source is now SESSION_AWARE. The orchestrator picks
  // gainers+losers (regular), curated bulk-tickers (extended hours), or
  // curated last-known data (closed). MOST_ACTIVE remains an importable
  // value for back-compat but is routed to a deprecation fallback.
  const { glue, universeSource = UNIVERSE_SOURCE.SESSION_AWARE,
          customSymbols, fetchChains = true, contractTypes,
          now: nowOpt, curatedSymbols, filters } = args || {};
  if (!glue) throw new Error("fetchScannerInputBundle: glue is required");

  let universe;
  if (universeSource === UNIVERSE_SOURCE.SESSION_AWARE) {
    universe = await fetchSessionAwareUniverse({
      glue, now: nowOpt, curatedSymbols, filters,
    });
  } else {
    universe = await glue.fetchUniverseLive({ source: universeSource, customSymbols });
  }

  let options = wrapEmptyOptions({ source: GLUE_SOURCE.EMPTY, reason: "fetch_chains_disabled" });
  if (fetchChains && universe.symbols.length > 0) {
    options = await glue.fetchOptionsLive({ symbols: universe.symbols, contractTypes });
  }

  return {
    symbols: universe.symbols,
    marketDataBySymbol: universe.marketDataBySymbol,
    optionsDataBySymbol: options.optionsDataBySymbol,
    metadata: {
      universe: universe.metadata,
      options: options.metadata,
      circuit: glue.getCircuitState(),
    },
  };
}
