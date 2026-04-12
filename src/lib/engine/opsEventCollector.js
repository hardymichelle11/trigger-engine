// =====================================================
// OPS EVENT COLLECTOR — persisted operational metrics
// =====================================================
// Collects summarized events for BQ persistence:
//   - recalculation events
//   - invalidation events
//   - alert-block events
//   - alert-fire events
//
// Storage: localStorage with in-memory fallback.
// Flush: scripts/flush-ops-metrics.js reads and inserts to BQ.
// Rolling: max 5000 events, oldest dropped.
// =====================================================

const STORAGE_KEY = "ops_events";
const MAX_EVENTS = 5000;

// In-memory fallback for Node.js tests
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

// --------------------------------------------------
// EVENT TYPES
// --------------------------------------------------

export const OPS_EVENT_TYPES = {
  RECALC:     "recalc",
  INVALIDATE: "invalidate",
  ALERT_BLOCK:"alert_block",
  ALERT_FIRE: "alert_fire",
};

// --------------------------------------------------
// LOAD / SAVE
// --------------------------------------------------

export function loadOpsEvents() {
  try {
    const raw = _storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function _save(events) {
  try {
    const trimmed = events.slice(-MAX_EVENTS);
    _storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* storage full */ }
}

// --------------------------------------------------
// RECORD EVENTS
// --------------------------------------------------

/**
 * Record a recalculation event.
 * @param {object} params — { symbol, setupType, reasonCodes, anchorPrice, regime, ivPercentile }
 */
export function recordRecalcEvent(params) {
  const events = loadOpsEvents();
  events.push({
    type: OPS_EVENT_TYPES.RECALC,
    timestamp: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    symbol: params.symbol || "unknown",
    setupType: params.setupType || "unknown",
    reasonCodes: params.reasonCodes || [],
    anchorPrice: params.anchorPrice ?? null,
    regime: params.regime || null,
    ivPercentile: params.ivPercentile ?? null,
  });
  _save(events);
}

/**
 * Record an invalidation event.
 * @param {object} params — { symbol, setupType, reasons, anchorDriftPct, ageSeconds, anchorPrice, currentPrice }
 */
export function recordInvalidationEvent(params) {
  const events = loadOpsEvents();
  events.push({
    type: OPS_EVENT_TYPES.INVALIDATE,
    timestamp: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    symbol: params.symbol || "unknown",
    setupType: params.setupType || "unknown",
    reasons: params.reasons || [],
    anchorDriftPct: params.anchorDriftPct ?? null,
    ageSeconds: params.ageSeconds ?? null,
    anchorPrice: params.anchorPrice ?? null,
    currentPrice: params.currentPrice ?? null,
  });
  _save(events);
}

/**
 * Record an alert-block event.
 * @param {object} params — { symbol, blockReason, score, anchorDriftPct, freshnessAgeSec }
 */
export function recordAlertBlockEvent(params) {
  const events = loadOpsEvents();
  events.push({
    type: OPS_EVENT_TYPES.ALERT_BLOCK,
    timestamp: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    symbol: params.symbol || "unknown",
    blockReason: params.blockReason || "unknown",
    score: params.score ?? null,
    anchorDriftPct: params.anchorDriftPct ?? null,
    freshnessAgeSec: params.freshnessAgeSec ?? null,
  });
  _save(events);
}

/**
 * Record an alert-fire event.
 * @param {object} params — { symbol, score, priority, action, regime, anchorPrice }
 */
export function recordAlertFireEvent(params) {
  const events = loadOpsEvents();
  events.push({
    type: OPS_EVENT_TYPES.ALERT_FIRE,
    timestamp: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    symbol: params.symbol || "unknown",
    score: params.score ?? null,
    priority: params.priority || "low",
    action: params.action || "unknown",
    regime: params.regime || null,
    anchorPrice: params.anchorPrice ?? null,
  });
  _save(events);
}

// --------------------------------------------------
// QUERY HELPERS
// --------------------------------------------------

/**
 * Get events by type within a time range.
 * @param {string} type — OPS_EVENT_TYPES value
 * @param {object} [options] — { since, until }
 * @returns {object[]}
 */
export function getEventsByType(type, options = {}) {
  const events = loadOpsEvents();
  return events.filter(e => {
    if (e.type !== type) return false;
    if (options.since && e.timestamp < options.since) return false;
    if (options.until && e.timestamp > options.until) return false;
    return true;
  });
}

/**
 * Get summary counts by type and date.
 * @returns {object}
 */
export function getEventSummary() {
  const events = loadOpsEvents();
  const byType = {};
  const byDate = {};

  for (const e of events) {
    byType[e.type] = (byType[e.type] || 0) + 1;
    const key = `${e.date}_${e.type}`;
    byDate[key] = (byDate[key] || 0) + 1;
  }

  return {
    total: events.length,
    byType,
    byDate,
    oldestTimestamp: events[0]?.timestamp || null,
    newestTimestamp: events[events.length - 1]?.timestamp || null,
  };
}

/**
 * Get all events for BQ export, then clear.
 * @returns {object[]}
 */
export function drainEvents() {
  const events = loadOpsEvents();
  clearOpsEvents();
  return events;
}

/**
 * Clear all ops events.
 */
export function clearOpsEvents() {
  try { _storage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
