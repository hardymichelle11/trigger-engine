// =====================================================
// CALIBRATION STORAGE — localStorage + exportable JSON
// =====================================================
// Persists calibration observations for quarterly review.
// Schema versioned. Max 2000 observations (rolling).
// =====================================================

const STORAGE_KEY = "calibration_observations";
const SCHEMA_VERSION = 1;
const MAX_OBSERVATIONS = 2000;

// In-memory fallback for environments without localStorage (Node.js tests)
const _memStore = {};
const _storage = {
  getItem(key) {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
    return _memStore[key] || null;
  },
  setItem(key, value) {
    if (typeof localStorage !== "undefined") { localStorage.setItem(key, value); return; }
    _memStore[key] = value;
  },
  removeItem(key) {
    if (typeof localStorage !== "undefined") { localStorage.removeItem(key); return; }
    delete _memStore[key];
  },
};

/**
 * @typedef {object} CalibrationObservation
 * @property {string} id — unique ID
 * @property {string} date — ISO date
 * @property {number} timestamp
 * @property {string} symbol
 * @property {string} setupType — "HIGH_IV", "CREDIT", "ETF", etc.
 * @property {number} baselineScore — score without chart context
 * @property {number} enhancedScore — score with chart context
 * @property {number} delta — enhancedScore - baselineScore
 * @property {boolean} hadAtrPenalty
 * @property {boolean} hadPositiveBonus
 * @property {object[]} chartAdjustments — [{ pts, reason, source }]
 * @property {boolean} alertFired
 * @property {number|null} sessionsOut — 1-5 (filled later)
 * @property {string|null} outcome — IMPROVED, NEUTRAL, WORSE, HIT_T1, FAILED, UNKNOWN
 * @property {string|null} justified — YES, NO, MIXED
 * @property {string} notes
 */

/**
 * Load all observations from localStorage.
 * @returns {CalibrationObservation[]}
 */
export function loadObservations() {
  try {
    const raw = _storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw);
    if (!stored || stored._version !== SCHEMA_VERSION || !Array.isArray(stored.observations)) return [];
    return stored.observations;
  } catch {
    return [];
  }
}

/**
 * Save observations to localStorage.
 * @param {CalibrationObservation[]} observations
 */
export function saveObservations(observations) {
  try {
    // Trim to max
    const trimmed = observations.slice(-MAX_OBSERVATIONS);
    _storage.setItem(STORAGE_KEY, JSON.stringify({
      _version: SCHEMA_VERSION,
      _savedAt: new Date().toISOString(),
      observations: trimmed,
    }));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Append new observations (deduped by id).
 * @param {CalibrationObservation[]} newObs
 */
export function appendObservations(newObs) {
  const existing = loadObservations();
  const existingIds = new Set(existing.map(o => o.id));
  const unique = newObs.filter(o => !existingIds.has(o.id));
  saveObservations([...existing, ...unique]);
}

/**
 * Update an observation by id (for outcome tracking).
 * @param {string} id
 * @param {object} patch — { sessionsOut, outcome, justified, notes }
 * @returns {boolean} true if found and updated
 */
export function updateObservation(id, patch) {
  const obs = loadObservations();
  const idx = obs.findIndex(o => o.id === id);
  if (idx === -1) return false;

  obs[idx] = { ...obs[idx], ...patch };
  saveObservations(obs);
  return true;
}

/**
 * Get observations for a date range.
 * @param {string} [from] — ISO date (inclusive)
 * @param {string} [to] — ISO date (inclusive)
 * @returns {CalibrationObservation[]}
 */
export function getObservationsInRange(from, to) {
  const obs = loadObservations();
  return obs.filter(o => {
    if (from && o.date < from) return false;
    if (to && o.date > to) return false;
    return true;
  });
}

/**
 * Get the full exportable data shape.
 * @returns {object}
 */
export function getExportData() {
  return {
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    observations: loadObservations(),
  };
}

/**
 * Clear all calibration data.
 */
export function clearCalibrationData() {
  try { _storage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
