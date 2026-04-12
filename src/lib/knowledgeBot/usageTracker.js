// =====================================================
// USAGE TRACKER — request counting + cost estimation
// =====================================================
// Vendor-agnostic. Tracks request counts and estimated
// cost by day and month. Rolling window with localStorage.
// =====================================================

const STORAGE_KEY = "knowledgeBot_usage";
const MAX_LOG_ENTRIES = 5000;

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
 * @typedef {object} UsageEntry
 * @property {number} timestamp
 * @property {string} date — YYYY-MM-DD
 * @property {string} month — YYYY-MM
 * @property {string} mode — mode at time of request
 * @property {number} estimatedCostUsd — estimated cost of this request
 */

/**
 * Load usage log from localStorage.
 * @returns {UsageEntry[]}
 */
export function loadUsageLog() {
  try {
    const raw = _storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function _saveLog(log) {
  try {
    const trimmed = log.slice(-MAX_LOG_ENTRIES);
    _storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* storage full */ }
}

/**
 * Record a usage event.
 * @param {object} entry — { mode, estimatedCostUsd }
 */
export function recordUsage(entry = {}) {
  const now = new Date();
  const log = loadUsageLog();
  log.push({
    timestamp: now.getTime(),
    date: now.toISOString().slice(0, 10),
    month: now.toISOString().slice(0, 7),
    mode: entry.mode || "FULL_CHAT",
    estimatedCostUsd: entry.estimatedCostUsd || 0,
  });
  _saveLog(log);
}

/**
 * Get usage summary for the current month.
 * @param {object} config — knowledgeBotConfig
 * @returns {object}
 */
export function getMonthlyUsage(config) {
  const log = loadUsageLog();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthEntries = log.filter(e => e.month === currentMonth);

  const totalCostUsd = monthEntries.reduce((s, e) => s + (e.estimatedCostUsd || 0), 0);
  const requestCount = monthEntries.length;
  const monthPct = config.monthlyBudgetUsd > 0
    ? totalCostUsd / config.monthlyBudgetUsd
    : 0;

  return {
    currentMonth,
    requestCount,
    totalCostUsd: Math.round(totalCostUsd * 100) / 100,
    monthPct: Math.round(monthPct * 1000) / 1000,
    budgetUsd: config.monthlyBudgetUsd,
    remainingUsd: Math.round((config.monthlyBudgetUsd - totalCostUsd) * 100) / 100,
  };
}

/**
 * Get usage summary for today.
 * @returns {object}
 */
export function getDailyUsage() {
  const log = loadUsageLog();
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = log.filter(e => e.date === today);

  return {
    date: today,
    requestCount: todayEntries.length,
    totalCostUsd: Math.round(todayEntries.reduce((s, e) => s + (e.estimatedCostUsd || 0), 0) * 100) / 100,
  };
}

/**
 * Check if daily request limit is exceeded.
 * @param {object} config
 * @returns {boolean}
 */
export function isDailyLimitExceeded(config) {
  const daily = getDailyUsage();
  return daily.requestCount >= config.maxRequestsPerDay;
}

/**
 * Check if monthly request limit is exceeded.
 * @param {object} config
 * @returns {boolean}
 */
export function isMonthlyLimitExceeded(config) {
  const monthly = getMonthlyUsage(config);
  return monthly.requestCount >= config.maxRequestsPerMonth;
}

/**
 * Clear all usage data.
 */
export function clearUsageData() {
  try { _storage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
