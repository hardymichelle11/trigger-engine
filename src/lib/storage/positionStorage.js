// =====================================================
// POSITION STORAGE — localStorage adapter for short put positions
// =====================================================
// Persists user workflow data only: symbol, strike, credit,
// currentPrice, id. Roll plans and profit targets are
// recomputed live from current market data.
// =====================================================

const STORAGE_KEY = "creditVol_positions";
const SCHEMA_VERSION = 1;

/**
 * Load positions from localStorage.
 * Returns empty array on missing, corrupt, or version-mismatched data.
 */
export function loadPositions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const stored = JSON.parse(raw);
    if (!stored || stored._version !== SCHEMA_VERSION || !Array.isArray(stored.positions)) {
      return [];
    }

    // Validate each position has required fields
    return stored.positions.filter(p =>
      p && typeof p.symbol === "string" && p.symbol.length > 0 &&
      typeof p.strike === "number" && p.strike > 0 &&
      typeof p.credit === "number" && p.credit > 0 &&
      typeof p.id !== "undefined"
    );
  } catch {
    return [];
  }
}

/**
 * Save positions to localStorage.
 * Only persists user-entered workflow data, not computed fields.
 */
export function savePositions(positions) {
  try {
    const toStore = (positions || []).map(p => ({
      id: p.id,
      symbol: p.symbol,
      strike: p.strike,
      credit: p.credit,
      currentPrice: p.currentPrice,
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      _version: SCHEMA_VERSION,
      _savedAt: new Date().toISOString(),
      positions: toStore,
    }));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Clear all stored positions.
 */
export function clearPositions() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
