// =====================================================
// INCOME STORAGE — localStorage adapter for weekly income tracker
// =====================================================
// Persists income entries (amount + date) and weekly total.
// Weekly reset is manual — user clicks RESET to start a new week.
// =====================================================

const STORAGE_KEY = "creditVol_income";
const SCHEMA_VERSION = 1;

/**
 * Load income tracker state from localStorage.
 * Returns default state on missing, corrupt, or version-mismatched data.
 */
export function loadIncomeTracker() {
  const defaultState = { weeklyTotal: 0, entries: [] };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;

    const stored = JSON.parse(raw);
    if (!stored || stored._version !== SCHEMA_VERSION) {
      return defaultState;
    }

    const weeklyTotal = typeof stored.weeklyTotal === "number" ? stored.weeklyTotal : 0;
    const entries = Array.isArray(stored.entries)
      ? stored.entries.filter(e =>
          e && typeof e.amount === "number" && e.amount > 0 &&
          typeof e.date === "string" &&
          typeof e.id !== "undefined"
        )
      : [];

    return { weeklyTotal, entries };
  } catch {
    return defaultState;
  }
}

/**
 * Save income tracker state to localStorage.
 */
export function saveIncomeTracker({ weeklyTotal, entries }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      _version: SCHEMA_VERSION,
      _savedAt: new Date().toISOString(),
      weeklyTotal: weeklyTotal || 0,
      entries: (entries || []).map(e => ({
        id: e.id,
        amount: e.amount,
        date: e.date,
      })),
    }));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Clear income tracker storage.
 */
export function clearIncomeTracker() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
