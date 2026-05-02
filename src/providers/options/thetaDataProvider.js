// =====================================================
// THETADATA PROVIDER (Phase 4.5C)
// =====================================================
// REST adapter against a locally-running Theta Terminal.
// REST/snapshot only — NO browser WebSocket connection.
//
// Hard rules (carried from spec):
//   - Theta Terminal handles its own auth at startup. The
//     adapter does not hold the user's username/password.
//   - Adapter NEVER throws on missing config or unreachable
//     terminal. Returns a structured HealthResult instead.
//   - Adapter NEVER prints credentials, tokens, or env values
//     in error messages. Reasons are sanitized free-form
//     strings drawn from a known vocabulary.
//   - Adapter NEVER connects to a WebSocket. The single-
//     connection ws://127.0.0.1:25520/v1/events endpoint is
//     reserved for the user's own tooling.
//   - When health is not `available`, fetchSnapshot/fetchChain
//     return null. The Lethal Board's premium label stays
//     `estimated` or `unavailable` — never `live` — until a
//     snapshot is actually retrieved.
//   - Default fetcher uses fetch(); tests inject a mock.
// =====================================================

import {
  HEALTH_STATUS,
  PROVIDER_NAME,
} from "./optionsProviderTypes.js";
import {
  normalizeRow,
  normalizeChain,
  parseThetaDataSnapshotPayload,
} from "./normalizeOptionChain.js";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_HEALTH_TTL = 60_000;          // re-probe terminal at most once per minute

const HEALTH_PATH = "/v2/list/exchanges";   // basic terminal heartbeat
const SNAPSHOT_QUOTE_PATH = "/v2/snapshot/option/quote";

// --------------------------------------------------
// DEFAULT FETCHER (browser/node fetch)
// --------------------------------------------------

function buildDefaultFetcher({ baseUrl, timeoutMs }) {
  if (typeof fetch !== "function") return null;
  if (!baseUrl || typeof baseUrl !== "string") return null;
  return async function defaultFetcher(path) {
    const url = baseUrl.replace(/\/+$/, "") + path;
    const ctrl = typeof AbortSignal?.timeout === "function"
      ? AbortSignal.timeout(timeoutMs) : undefined;
    let response;
    try {
      response = await fetch(url, ctrl ? { signal: ctrl } : undefined);
    } catch (err) {
      // Re-throw with a sanitized message; underlying error.cause may
      // contain credentials in odd middlebox setups, so we strip it.
      const message = String(err?.message || "");
      const sanitized = sanitizeErrorMessage(message);
      const out = new Error(sanitized);
      // Preserve a structural code for the health check classifier.
      if (/abort|timeout/i.test(sanitized)) out.code = "ETIMEDOUT";
      else if (/refused|connection_refused/i.test(sanitized)
               || /failed to fetch/i.test(sanitized)) out.code = "ECONNREFUSED";
      else out.code = "ENETWORK";
      throw out;
    }
    if (!response.ok) {
      const err = new Error(`thetadata_http_${response.status}`);
      err.status = response.status;
      throw err;
    }
    try {
      return await response.json();
    } catch {
      const err = new Error("thetadata_invalid_json");
      err.code = "EPARSE";
      throw err;
    }
  };
}

/**
 * Strip anything that looks like a query-string secret or auth
 * header value from an error message. Defense-in-depth — Theta
 * Terminal calls don't carry credentials, but we never want to
 * surface them through error logs anyway.
 */
function sanitizeErrorMessage(msg) {
  if (typeof msg !== "string") return "unknown_error";
  let out = msg;
  out = out.replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*[\w\-.]+/gi, "$1=***");
  out = out.replace(/Bearer\s+[\w\-.]+/gi, "Bearer ***");
  // Cap length to keep diagnostics small.
  if (out.length > 160) out = out.slice(0, 160) + "…";
  return out;
}

// --------------------------------------------------
// HEALTH CLASSIFIER
// --------------------------------------------------

function classifyError(err) {
  const code = err?.code;
  const status = Number(err?.status);
  if (code === "ECONNREFUSED") {
    return { status: HEALTH_STATUS.TERMINAL_NOT_RUNNING, reason: "connection_refused" };
  }
  if (code === "ETIMEDOUT") {
    return { status: HEALTH_STATUS.UNAVAILABLE, reason: "timeout" };
  }
  if (status === 401 || status === 403) {
    return { status: HEALTH_STATUS.UNAUTHORIZED, reason: `http_${status}` };
  }
  if (status === 402 || status === 451) {
    return { status: HEALTH_STATUS.UNAVAILABLE_PLAN, reason: `http_${status}` };
  }
  if (Number.isFinite(status) && status >= 400) {
    return { status: HEALTH_STATUS.UNAVAILABLE, reason: `http_${status}` };
  }
  if (code === "EPARSE") {
    return { status: HEALTH_STATUS.UNKNOWN_ERROR, reason: "invalid_json" };
  }
  if (code === "ENETWORK") {
    return { status: HEALTH_STATUS.UNAVAILABLE, reason: "network_error" };
  }
  return {
    status: HEALTH_STATUS.UNKNOWN_ERROR,
    reason: sanitizeErrorMessage(err?.message || "unknown"),
  };
}

// --------------------------------------------------
// PROVIDER FACTORY
// --------------------------------------------------

/**
 * Build a ThetaData provider instance.
 *
 * @param {import("./optionsProviderTypes.js").ProviderConfig} [config]
 * @returns {import("./optionsProviderTypes.js").OptionsChainProvider}
 */
export function createThetaDataProvider(config = {}) {
  const enabled = config.enabled === true;
  const credentialsRequired = config.credentialsRequired === true;
  const baseUrl = typeof config.baseUrl === "string" && config.baseUrl.length > 0
    ? config.baseUrl : null;
  const apiKey = typeof config.apiKey === "string" && config.apiKey.length > 0
    ? config.apiKey : null;
  const timeoutMs = Number.isFinite(Number(config.timeoutMs))
    ? Number(config.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const healthTtl = Number.isFinite(Number(config.healthCacheTtlMs))
    ? Number(config.healthCacheTtlMs) : DEFAULT_HEALTH_TTL;
  const now = typeof config.now === "function" ? config.now : () => Date.now();
  const fetcher = typeof config.fetcher === "function"
    ? config.fetcher
    : buildDefaultFetcher({ baseUrl, timeoutMs });

  let cachedHealth = null;

  // ----------------------------------------------
  // Pre-flight credential / config check
  // ----------------------------------------------

  function preflightCheck() {
    if (!enabled) {
      return wrapResult(HEALTH_STATUS.MISSING_CREDENTIALS, "thetadata_not_enabled");
    }
    if (credentialsRequired && !apiKey) {
      return wrapResult(HEALTH_STATUS.MISSING_CREDENTIALS, "api_key_missing");
    }
    if (!baseUrl) {
      return wrapResult(HEALTH_STATUS.MISSING_CREDENTIALS, "base_url_missing");
    }
    if (typeof fetcher !== "function") {
      return wrapResult(HEALTH_STATUS.UNAVAILABLE, "no_fetcher_available");
    }
    return null;
  }

  function wrapResult(status, reason) {
    return Object.freeze({
      provider: PROVIDER_NAME.THETADATA,
      status,
      reason: reason || null,
      checkedAt: now(),
    });
  }

  // ----------------------------------------------
  // Health check
  // ----------------------------------------------

  async function checkHealth() {
    const t = now();
    if (cachedHealth && (t - cachedHealth.checkedAt) < healthTtl) {
      return cachedHealth;
    }
    const pre = preflightCheck();
    if (pre) {
      cachedHealth = pre;
      return cachedHealth;
    }
    try {
      const payload = await fetcher(HEALTH_PATH);
      const ok = !!(payload && (Array.isArray(payload?.response) || payload?.header || payload?.status === "OK"));
      cachedHealth = ok
        ? wrapResult(HEALTH_STATUS.AVAILABLE, null)
        : wrapResult(HEALTH_STATUS.UNKNOWN_ERROR, "unexpected_response_shape");
    } catch (err) {
      const c = classifyError(err);
      cachedHealth = wrapResult(c.status, c.reason);
    }
    return cachedHealth;
  }

  // ----------------------------------------------
  // Snapshot fetch (single contract)
  // ----------------------------------------------

  /**
   * @param {object} args
   * @param {string} args.symbol
   * @param {string} args.expiration                 "YYYY-MM-DD" or "YYYYMMDD"
   * @param {number} args.strike                     dollars (e.g. 140.00)
   * @param {"call"|"put"|"C"|"P"} args.right
   * @param {number} [args.now]                       epoch ms for staleness check
   * @param {number} [args.staleAfterMs]
   * @returns {Promise<import("./optionsProviderTypes.js").NormalizedOptionRow|null>}
   */
  async function fetchSnapshot(args = {}) {
    const health = await checkHealth();
    if (health.status !== HEALTH_STATUS.AVAILABLE) return null;
    if (typeof fetcher !== "function") return null;

    const symbol = String(args.symbol || "").toUpperCase();
    const strikeDollars = Number(args.strike);
    const expIso = String(args.expiration || "");
    const rightUpper = String(args.right || "").toUpperCase();
    if (!symbol || !Number.isFinite(strikeDollars) || strikeDollars <= 0
        || !expIso || (rightUpper !== "C" && rightUpper !== "P"
                       && rightUpper !== "CALL" && rightUpper !== "PUT")) {
      return null;
    }

    // ThetaData wants strike scaled to thousandths and exp YYYYMMDD.
    const expCompact = expIso.replace(/-/g, "");
    const strikeScaled = Math.round(strikeDollars * 1000);
    const rightLetter = (rightUpper === "C" || rightUpper === "CALL") ? "C" : "P";

    const params = new URLSearchParams({
      root: symbol,
      exp: expCompact,
      strike: String(strikeScaled),
      right: rightLetter,
    });

    let payload;
    try {
      payload = await fetcher(`${SNAPSHOT_QUOTE_PATH}?${params.toString()}`);
    } catch {
      return null;
    }

    const positional = parseThetaDataSnapshotPayload(payload);
    if (!positional) return null;
    return normalizeRow(positional, {
      symbol,
      expiration: expIso,
      strike: strikeDollars,
      right: rightLetter,
      now: args.now,
      staleAfterMs: args.staleAfterMs,
    });
  }

  // ----------------------------------------------
  // Chain fetch (multi-row)
  // ----------------------------------------------

  /**
   * Phase 4.5C ships single-snapshot only. Chain (full strike ladder)
   * is reserved for a follow-up; current return is null so callers
   * fall back gracefully.
   */
  async function fetchChain() {
    return null;
  }

  // ----------------------------------------------
  // Public surface
  // ----------------------------------------------

  return Object.freeze({
    name: PROVIDER_NAME.THETADATA,
    checkHealth,
    fetchSnapshot,
    fetchChain,
    getCachedHealth: () => cachedHealth,
    resetHealthCache: () => { cachedHealth = null; },
  });
}

// Exposed for tests + diagnostic UIs that want the same vocabulary.
export { sanitizeErrorMessage, classifyError };
