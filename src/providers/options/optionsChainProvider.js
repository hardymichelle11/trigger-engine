// =====================================================
// OPTIONS CHAIN PROVIDER — interface + factory dispatcher
// =====================================================
// Phase 4.5C+2. Pluggable provider layer between the UI and
// any concrete options data source. Today the only concrete
// implementation is ThetaData v3 local Terminal (REST/snapshot
// against http://127.0.0.1:25503/v3). The interface is
// provider-agnostic so future providers (e.g. broker chain
// APIs) can drop in without touching the UI.
//
// Hard rules:
//   - The dispatcher NEVER imports UI components.
//   - The default no-op provider always reports
//     `missing_credentials` so the app degrades gracefully
//     when no provider is configured.
//   - readProviderConfigFromEnv() does NOT print or log
//     credential values. It only reports presence/absence.
//   - Activation is intentional: VITE_THETADATA_ENABLED=true
//     AND VITE_THETADATA_BASE_URL must both be set in the
//     operator's local .env. There is no automatic default
//     base URL — keeping this explicit avoids surprise
//     localhost calls and matches the security policy.
// =====================================================

import {
  HEALTH_STATUS,
  PROVIDER_NAME,
  PROVIDER_VERSION,
} from "./optionsProviderTypes.js";
import { createThetaDataProvider } from "./thetaDataProvider.js";

// --------------------------------------------------
// NO-OP PROVIDER — always unavailable, never throws.
// Used when no provider is selected or configured.
// --------------------------------------------------

function createUnavailableProvider({ name = "unavailable", reason = "no_provider_configured", now } = {}) {
  const t = typeof now === "function" ? now : () => Date.now();
  const result = Object.freeze({
    provider: name,
    version: PROVIDER_VERSION.V3,
    status: HEALTH_STATUS.MISSING_CREDENTIALS,
    reason,
    checkedAt: t(),
  });
  return Object.freeze({
    name,
    checkHealth: async () => result,
    fetchSnapshot: async () => null,
    fetchChain: async () => null,
    fetchExpirations: async () => null,
    getCachedHealth: () => result,
    resetHealthCache: () => {},
  });
}

// --------------------------------------------------
// CONFIG READER — does NOT log credential values
// --------------------------------------------------

/**
 * Read provider config from a caller-supplied env-shaped object.
 *
 * SECURITY POLICY (Phase 4.5C lock):
 *   This function reads ONLY non-secret, browser-safe configuration
 *   from `VITE_*` variables. Anything prefixed with `VITE_` is bundled
 *   into the public browser JavaScript at build time and is therefore
 *   visible to anyone who loads the app.
 *
 *   Browser-safe (allowed via VITE_):
 *     - VITE_THETADATA_ENABLED        master enable flag
 *     - VITE_THETADATA_BASE_URL       local terminal URL (no auth in URL)
 *     - VITE_THETADATA_TIMEOUT_MS     request timeout
 *
 *   FORBIDDEN as VITE_ (not read here):
 *     - any API key, token, password, secret, OAuth credential
 *     - These must be supplied by a local backend / proxy and reach the
 *       provider via the explicit `apiKey` argument on
 *       createOptionsChainProvider() — never via env in the browser.
 *
 *   Today, Theta Terminal runs locally and handles its own login. The
 *   browser only talks to 127.0.0.1 — no key passes through the bundle.
 *
 * @param {object} [env]                              caller's env-shaped object
 * @returns {{
 *   providerName: string,
 *   enabled: boolean,
 *   baseUrl: string|null,
 *   timeoutMs: number|null,
 * }}
 */
export function readProviderConfigFromEnv(env = {}) {
  const enabledRaw = env.VITE_THETADATA_ENABLED ?? env.THETADATA_ENABLED;
  const enabled = String(enabledRaw || "").toLowerCase() === "true";

  const baseUrlRaw = env.VITE_THETADATA_BASE_URL ?? env.THETADATA_BASE_URL;
  const baseUrl = typeof baseUrlRaw === "string" && baseUrlRaw.length > 0 ? baseUrlRaw : null;

  const timeoutRaw = Number(env.VITE_THETADATA_TIMEOUT_MS ?? env.THETADATA_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : null;

  // Intentionally NO apiKey / token / password / credential reads here.
  // See SECURITY POLICY above.

  return Object.freeze({
    providerName: PROVIDER_NAME.THETADATA,         // only provider today
    enabled,
    baseUrl,
    timeoutMs,
  });
}

// --------------------------------------------------
// FACTORY DISPATCHER
// --------------------------------------------------

/**
 * Create the configured options-chain provider, or a safe no-op
 * fallback if config is incomplete or absent.
 *
 * SECURITY: `apiKey` is accepted ONLY via the explicit
 * `options.apiKey` argument (dependency injection from a local
 * backend / proxy). It is NEVER read from env. This keeps secrets
 * out of the browser bundle.
 *
 * @param {object} [options]
 * @param {object} [options.env]                      env-shaped object for browser/node
 * @param {string} [options.providerName]
 * @param {(path: string) => Promise<object>} [options.fetcher]
 * @param {() => number} [options.now]
 * @param {string} [options.apiKey]                   explicit DI; never from env
 * @param {boolean} [options.credentialsRequired]     explicit DI; never from env
 * @returns {import("./optionsProviderTypes.js").OptionsChainProvider}
 */
export function createOptionsChainProvider(options = {}) {
  const cfg = readProviderConfigFromEnv(options.env || {});
  const providerName = options.providerName || cfg.providerName;

  // SECURITY: apiKey is accepted ONLY as an explicit argument.
  // Never read from env. Browser-safe; future backend/proxy can DI.
  const apiKey = typeof options.apiKey === "string" && options.apiKey.length > 0
    ? options.apiKey : null;
  const credentialsRequired = options.credentialsRequired === true;

  if (providerName !== PROVIDER_NAME.THETADATA) {
    return createUnavailableProvider({
      name: providerName,
      reason: "unknown_provider",
      now: options.now,
    });
  }

  if (!cfg.enabled) {
    return createUnavailableProvider({
      name: PROVIDER_NAME.THETADATA,
      reason: "thetadata_not_enabled",
      now: options.now,
    });
  }
  if (!cfg.baseUrl) {
    return createUnavailableProvider({
      name: PROVIDER_NAME.THETADATA,
      reason: "base_url_missing",
      now: options.now,
    });
  }
  if (credentialsRequired && !apiKey) {
    return createUnavailableProvider({
      name: PROVIDER_NAME.THETADATA,
      reason: "api_key_missing",
      now: options.now,
    });
  }

  return createThetaDataProvider({
    enabled: true,
    baseUrl: cfg.baseUrl,
    apiKey,                                          // from explicit DI only
    credentialsRequired,
    timeoutMs: cfg.timeoutMs ?? undefined,
    fetcher: options.fetcher,
    now: options.now,
  });
}

export {
  createUnavailableProvider,
  HEALTH_STATUS,
  PROVIDER_NAME,
};
