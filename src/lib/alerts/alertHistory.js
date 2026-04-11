// =====================================================
// ALERT HISTORY — localStorage persistence + dedup
// =====================================================

const STORAGE_KEY = "creditVol_alertHistory";
const SCHEMA_VERSION = 1;
const MAX_HISTORY = 100;

// In-memory recent alert set for dedup (symbol:timestamp pairs)
const _recentAlerts = new Set();

/**
 * Record an alert (for dedup and history).
 * @param {object} alert — AlertResult
 */
export function recordAlert(alert) {
  const key = `${alert.card.symbol}:${alert.timestamp}`;
  _recentAlerts.add(key);

  // Persist to history
  const history = loadAlertHistory();
  history.unshift({
    symbol: alert.card.symbol,
    action: alert.card.action,
    score: alert.card.score,
    priority: alert.priority,
    summary: alert.summary,
    probability: alert.card.probability?.probAboveStrike ?? null,
    touchProb: alert.card.probability?.probTouch ?? null,
    ivPercentile: alert.card.metrics?.ivPercentile ?? null,
    ivSource: alert.card.metrics?.ivSource ?? null,
    passedGates: alert.passedGates.length,
    timestamp: alert.timestamp,
    dateStr: new Date(alert.timestamp).toLocaleString(),
  });

  // Trim to max
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  _saveHistory(history);
}

/**
 * Get the recent alerts set (for dedup in alertEngine).
 * @returns {Set}
 */
export function getRecentAlerts() {
  return _recentAlerts;
}

/**
 * Load alert history from localStorage.
 * @returns {object[]}
 */
export function loadAlertHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw);
    if (!stored || stored._version !== SCHEMA_VERSION || !Array.isArray(stored.alerts)) return [];
    return stored.alerts;
  } catch {
    return [];
  }
}

function _saveHistory(alerts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      _version: SCHEMA_VERSION,
      _savedAt: new Date().toISOString(),
      alerts,
    }));
  } catch {
    // Storage full
  }
}

/**
 * Clear all alert history.
 */
export function clearAlertHistory() {
  _recentAlerts.clear();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * Get alert history stats.
 */
export function alertHistoryStats() {
  const history = loadAlertHistory();
  const last24h = history.filter(a => Date.now() - a.timestamp < 24 * 60 * 60 * 1000);
  return {
    total: history.length,
    last24h: last24h.length,
    highPriority: last24h.filter(a => a.priority === "high").length,
  };
}
