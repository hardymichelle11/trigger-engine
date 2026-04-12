// =====================================================
// KNOWLEDGE BOT CONFIG — budget-safe dashboard help bot
// =====================================================
// All configuration is centralized here. No hardcoded
// values in UI or logic modules. Vendor-agnostic.
// =====================================================

/**
 * Bot modes, ordered from most restricted to most capable.
 * OFF:         Bot disabled entirely — no UI shown.
 * FAQ_ONLY:    Static FAQ/glossary only — zero API cost.
 * SEARCH_ONLY: Keyword search across docs — minimal API cost.
 * FULL_CHAT:   Full conversational AI — highest API cost.
 */
export const BOT_MODES = ["OFF", "FAQ_ONLY", "SEARCH_ONLY", "FULL_CHAT"];

/**
 * Mode capability matrix — what each mode can do.
 */
export const MODE_CAPABILITIES = {
  OFF:          { faq: false, search: false, chat: false, label: "Off",          color: "#64748b" },
  FAQ_ONLY:     { faq: true,  search: false, chat: false, label: "FAQ Only",     color: "#f59e0b" },
  SEARCH_ONLY:  { faq: true,  search: true,  chat: false, label: "Search",       color: "#38bdf8" },
  FULL_CHAT:    { faq: true,  search: true,  chat: true,  label: "Full Chat",    color: "#22c55e" },
};

/**
 * Default configuration. Override via loadKnowledgeBotConfig().
 */
export const DEFAULT_CONFIG = {
  enabled: true,
  mode: "FULL_CHAT",
  monthlyBudgetUsd: 200,
  warningThresholdPct: 0.8,
  hardLimitThresholdPct: 0.95,
  maxRequestsPerDay: 500,
  maxRequestsPerMonth: 10000,
};

const STORAGE_KEY = "knowledgeBot_config";

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
};

/**
 * Load config from localStorage, merged with defaults.
 * @returns {object}
 */
export function loadKnowledgeBotConfig() {
  try {
    const raw = _storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const saved = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...saved };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save config to localStorage.
 * @param {object} config
 */
export function saveKnowledgeBotConfig(config) {
  try {
    _storage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* storage full */ }
}

/**
 * Validate that a mode string is valid.
 * @param {string} mode
 * @returns {boolean}
 */
export function isValidMode(mode) {
  return BOT_MODES.includes(mode);
}

/**
 * Get capabilities for a given mode.
 * @param {string} mode
 * @returns {object}
 */
export function getCapabilities(mode) {
  return MODE_CAPABILITIES[mode] || MODE_CAPABILITIES.OFF;
}
