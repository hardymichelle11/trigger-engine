// =====================================================
// API KEY MANAGER — runtime key storage
// =====================================================
// Stores API keys in localStorage at runtime.
// Keys are NEVER baked into the JS bundle.
// On first load, the app prompts for the key.
// =====================================================

const STORAGE_KEY = "triggerEngine_apiKeys";
const SCHEMA_VERSION = 1;

// In-memory cache for current session
let _keys = null;

/**
 * Get the Polygon API key.
 * @returns {string} API key or empty string
 */
export function getPolygonKey() {
  if (_keys === null) _loadKeys();
  return _keys.polygon || "";
}

/**
 * Set the Polygon API key.
 * @param {string} key
 */
export function setPolygonKey(key) {
  if (_keys === null) _loadKeys();
  _keys.polygon = key.trim();
  _saveKeys();
}

/**
 * Check if the Polygon API key is configured.
 * @returns {boolean}
 */
export function hasPolygonKey() {
  return getPolygonKey().length > 0;
}

/**
 * Clear all stored API keys.
 */
export function clearApiKeys() {
  _keys = { polygon: "" };
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// --------------------------------------------------
// INTERNAL
// --------------------------------------------------

function _loadKeys() {
  _keys = { polygon: "" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (stored && stored._version === SCHEMA_VERSION) {
      _keys.polygon = stored.polygon || "";
    }
  } catch {
    // corrupt storage — start fresh
  }
}

function _saveKeys() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      _version: SCHEMA_VERSION,
      polygon: _keys.polygon,
    }));
  } catch {
    // storage full
  }
}
