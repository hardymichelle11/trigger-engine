// =====================================================
// POLYGON PROXY — routes API calls through proxy or direct
// =====================================================
// In production: calls go through Cloudflare Worker proxy
//   (API key is server-side, users never see it)
// In local dev: falls back to direct Polygon with local key
// =====================================================

import { getPolygonKey } from "./apiKeyManager.js";

// Proxy URL — set via env var at build time, or default to Cloudflare Worker
const PROXY_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_POLYGON_PROXY_URL)
  || "https://polygon-proxy.hardymichelle11.workers.dev";

const POLYGON_DIRECT = "https://api.polygon.io";

/**
 * Check if the proxy is available (quick health check, cached).
 */
let _proxyAvailable = null;

async function checkProxy() {
  if (_proxyAvailable !== null) return _proxyAvailable;

  try {
    const resp = await fetch(`${PROXY_URL}/health`, { signal: AbortSignal.timeout(3000) });
    _proxyAvailable = resp.ok;
  } catch {
    _proxyAvailable = false;
  }
  return _proxyAvailable;
}

/**
 * Get the base URL for Polygon API calls.
 * Returns proxy URL if available, otherwise direct Polygon URL.
 * @returns {Promise<{ baseUrl: string, needsKey: boolean }>}
 */
export async function getPolygonBase() {
  const proxyOk = await checkProxy();

  if (proxyOk) {
    return { baseUrl: PROXY_URL, needsKey: false };
  }

  // Fallback to direct Polygon (needs local API key)
  return { baseUrl: POLYGON_DIRECT, needsKey: true };
}

/**
 * Build a full Polygon API URL with key handling.
 * @param {string} path — e.g. "/v2/snapshot/locale/us/markets/stocks/tickers/NVDA"
 * @param {object} [params] — additional query params
 * @returns {Promise<string>} full URL
 */
export async function buildPolygonUrl(path, params = {}) {
  const { baseUrl, needsKey } = await getPolygonBase();

  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  if (needsKey) {
    const key = getPolygonKey();
    if (key) url.searchParams.set("apiKey", key);
  }

  return url.toString();
}

/**
 * Check if the app can make Polygon API calls (proxy or local key).
 * @returns {Promise<boolean>}
 */
export async function canAccessPolygon() {
  const proxyOk = await checkProxy();
  if (proxyOk) return true;
  return getPolygonKey().length > 0;
}

/**
 * Reset proxy check (for testing or after config change).
 */
export function resetProxyCheck() {
  _proxyAvailable = null;
}

/**
 * Check if using proxy or direct.
 * @returns {boolean|null} true = proxy, false = direct, null = not checked yet
 */
export function isUsingProxy() {
  return _proxyAvailable;
}
