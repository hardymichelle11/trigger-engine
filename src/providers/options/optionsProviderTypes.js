// =====================================================
// OPTIONS PROVIDER — types + enums (Phase 4.5C)
// =====================================================
// Shared enum tables and JSDoc typedefs for the pluggable
// options-chain provider interface. No runtime logic.
//
// The interface is provider-agnostic so Phase 4.5C-plus can
// swap ThetaData for another vendor without touching the UI
// or the Trade Construction context helper.
// =====================================================

export const PROVIDER_NAME = Object.freeze({
  THETADATA: "thetadata",
  // Future implementations would land here.
});

/**
 * Health states a provider can report.
 *
 * Honesty rules:
 *   - `available`         only when the terminal/endpoint is reachable AND
 *                         a basic snapshot request returns valid data.
 *   - `missing_credentials` configuration is incomplete (env not set, key absent).
 *   - `terminal_not_running` synonymous with `connection_refused`; chosen to
 *                            match user-facing language for ThetaData's local
 *                            terminal model.
 *   - `connection_refused`  raw network result alias for `terminal_not_running`.
 *   - `unauthorized`      reachable but credentials/permissions rejected.
 *   - `unavailable_plan`  reachable but the requested data is not entitled
 *                         on the current plan tier (matches polygonGlue's
 *                         analogous state for Polygon options).
 *   - `unavailable`       generic catch-all when none of the above fit.
 *   - `unknown_error`     unexpected failure (preserve message for diagnostics).
 */
export const HEALTH_STATUS = Object.freeze({
  AVAILABLE: "available",
  MISSING_CREDENTIALS: "missing_credentials",
  TERMINAL_NOT_RUNNING: "terminal_not_running",
  CONNECTION_REFUSED: "connection_refused",
  UNAUTHORIZED: "unauthorized",
  UNAVAILABLE_PLAN: "unavailable_plan",
  UNAVAILABLE: "unavailable",
  UNKNOWN_ERROR: "unknown_error",
});

/**
 * Snapshot status carried on every normalized row.
 *   - `live`        fresh quote from the provider with valid bid/ask.
 *   - `stale`       reachable but the quote is older than freshness threshold.
 *   - `unavailable` the row could not be obtained (used by callers as fallback).
 */
export const SNAPSHOT_STATUS = Object.freeze({
  LIVE: "live",
  STALE: "stale",
  UNAVAILABLE: "unavailable",
});

/**
 * Reasons a provider may report (free-form string). Examples:
 *   "thetadata_not_enabled", "api_key_missing", "base_url_missing",
 *   "connection_refused", "http_401", "http_403", "timeout",
 *   "malformed_response", "invalid_strike", "missing_quote".
 *
 * Reasons are diagnostic only; UI never displays raw reasons that could
 * leak credential-shaped strings. Adapters MUST sanitize.
 */

/**
 * @typedef {object} HealthResult
 * @property {string} status                          one of HEALTH_STATUS
 * @property {string} [reason]
 * @property {number} [checkedAt]                     epoch ms
 * @property {string} provider                        one of PROVIDER_NAME
 */

/**
 * @typedef {object} NormalizedOptionRow
 * @property {string} provider                        e.g. "thetadata"
 * @property {string} status                          one of SNAPSHOT_STATUS
 * @property {string} symbol                          underlying ticker (uppercase)
 * @property {string} expiration                      "YYYY-MM-DD"
 * @property {number} strike                          dollars (e.g. 140.00)
 * @property {"call"|"put"} type
 * @property {number|null} bid
 * @property {number|null} ask
 * @property {number|null} mid
 * @property {number|null} last
 * @property {number|null} volume
 * @property {number|null} openInterest
 * @property {number|null} iv
 * @property {number|null} delta
 * @property {number|null} theta
 * @property {number|null} gamma
 * @property {number|null} vega
 * @property {number|null} lastUpdated                epoch ms or ms-since-midnight (provider-dependent)
 * @property {string|null} rawStatus                  provider-specific status string for diagnostics
 */

/**
 * @typedef {object} OptionsChainProvider
 * @property {string} name                            one of PROVIDER_NAME
 * @property {() => Promise<HealthResult>} checkHealth
 * @property {(args: object) => Promise<NormalizedOptionRow|null>} fetchSnapshot
 * @property {(args: object) => Promise<NormalizedOptionRow[]|null>} fetchChain
 * @property {() => HealthResult|null} [getCachedHealth]
 * @property {() => void} [resetHealthCache]
 */

/**
 * @typedef {object} ProviderConfig
 * @property {boolean} [enabled]                      master enable flag
 * @property {string} [baseUrl]                       base URL for terminal/REST
 * @property {string} [apiKey]                        future direct-cloud API key
 * @property {boolean} [credentialsRequired]          true when apiKey is required
 * @property {(path: string) => Promise<object>} [fetcher]   DI for tests
 * @property {() => number} [now]                     injectable clock
 * @property {number} [timeoutMs]
 * @property {number} [healthCacheTtlMs]              default 60_000
 * @property {number} [snapshotCacheTtlMs]            default 30_000
 */
