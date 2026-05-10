// =====================================================================
// Agent Research Settings Store
// =====================================================================
// localStorage-backed CRUD for the Research Automation configurator.
// Each record describes what an agent should monitor for a given
// basket, how often it should run, and where new findings should land.
// Mirrors the agentMemoryStore pattern: corruption tolerant, backend-
// overridable for tests, idempotent public mutators that no-op on bad
// input.
//
// Hard rules:
//   - This is a SETTINGS layer only. Saving settings does not run
//     research, schedule jobs, or ingest sources. The store records
//     intent; downstream agents read the record when they decide what
//     to scan.
//   - requireApproval defaults to true. Even when explicitly false,
//     the settings record cannot override engine verdicts, Credit
//     View risk, Trigger posture, stale-data warnings, capital fit,
//     or allowedActions — those are owned by the engines.
//   - JSON-safe shape. No raw scoring tokens, no cron syntax, no
//     internal queue ids.
// =====================================================================

const STORAGE_KEY = "te.agent.research.settings.v1";
let memoryCache = null;

// ---------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------

export const RESEARCH_FREQUENCY = Object.freeze({
  MANUAL_ONLY:   "manual_only",
  DAILY:         "daily",
  WEEKLY:        "weekly",
  ON_MAJOR_NEWS: "on_major_news",
});

export const RESEARCH_SOURCE = Object.freeze({
  SEC_FILINGS:           "sec_filings",
  EARNINGS_RELEASES:     "earnings_releases",
  COMPANY_RELEASES:      "company_releases",
  FDA_UPDATES:           "fda_updates",
  MEDICARE_REIMBURSEMENT:"medicare_reimbursement",
  ARK_HOLDINGS:          "ark_holdings",
  PARTNERSHIPS:          "partnerships",
  MA_NEWS:               "ma_news",
  ANALYST_CHANGES:       "analyst_changes",
  OPTIONS_IV:            "options_iv",
  CREDIT_MARKET_STRESS:  "credit_market_stress",
  INSIDER_ACTIVITY:      "insider_activity",
});

export const RESEARCH_OUTPUT = Object.freeze({
  PROPOSED_INTELLIGENCE: "proposed_intelligence",
  THESIS_CHECK_UPDATE:   "thesis_check_update",
  MANAGER_REVIEW:        "manager_review",
  ALERT_CANDIDATE:       "alert_candidate",
  ACTIVE_RESEARCH_CARD:  "active_research_card",
});

const VALID_FREQUENCIES = new Set(Object.values(RESEARCH_FREQUENCY));
const VALID_SOURCES     = new Set(Object.values(RESEARCH_SOURCE));
const VALID_OUTPUTS     = new Set(Object.values(RESEARCH_OUTPUT));

// ---------------------------------------------------------------------
// Basket-aware defaults
// ---------------------------------------------------------------------

const DEFAULT_BASKET_SOURCES = Object.freeze({
  ai_health_diagnostics: [
    RESEARCH_SOURCE.EARNINGS_RELEASES,
    RESEARCH_SOURCE.COMPANY_RELEASES,
    RESEARCH_SOURCE.FDA_UPDATES,
    RESEARCH_SOURCE.MEDICARE_REIMBURSEMENT,
    RESEARCH_SOURCE.ARK_HOLDINGS,
    RESEARCH_SOURCE.PARTNERSHIPS,
    RESEARCH_SOURCE.MA_NEWS,
    RESEARCH_SOURCE.ANALYST_CHANGES,
    RESEARCH_SOURCE.OPTIONS_IV,
  ],
  ai_infrastructure: [
    RESEARCH_SOURCE.EARNINGS_RELEASES,
    RESEARCH_SOURCE.COMPANY_RELEASES,
    RESEARCH_SOURCE.PARTNERSHIPS,
    RESEARCH_SOURCE.MA_NEWS,
    RESEARCH_SOURCE.ANALYST_CHANGES,
    RESEARCH_SOURCE.OPTIONS_IV,
  ],
  robotics: [
    RESEARCH_SOURCE.EARNINGS_RELEASES,
    RESEARCH_SOURCE.COMPANY_RELEASES,
    RESEARCH_SOURCE.PARTNERSHIPS,
    RESEARCH_SOURCE.MA_NEWS,
    RESEARCH_SOURCE.ANALYST_CHANGES,
  ],
  saas_harvest: [
    RESEARCH_SOURCE.EARNINGS_RELEASES,
    RESEARCH_SOURCE.COMPANY_RELEASES,
    RESEARCH_SOURCE.ANALYST_CHANGES,
    RESEARCH_SOURCE.OPTIONS_IV,
  ],
  dividend_income: [
    RESEARCH_SOURCE.EARNINGS_RELEASES,
    RESEARCH_SOURCE.ANALYST_CHANGES,
    RESEARCH_SOURCE.INSIDER_ACTIVITY,
    RESEARCH_SOURCE.CREDIT_MARKET_STRESS,
  ],
  watchlist: [
    RESEARCH_SOURCE.EARNINGS_RELEASES,
    RESEARCH_SOURCE.COMPANY_RELEASES,
    RESEARCH_SOURCE.ANALYST_CHANGES,
    RESEARCH_SOURCE.OPTIONS_IV,
  ],
});

const DEFAULT_BASKET_SYMBOLS = Object.freeze({
  ai_health_diagnostics: ["TEM", "GH", "NTRA", "RHHBY", "ABT", "TMO", "NVDA"],
  ai_infrastructure:     [],
  robotics:              [],
  saas_harvest:          [],
  dividend_income:       [],
  watchlist:             [],
});

const DEFAULT_OUTPUTS = Object.freeze([
  RESEARCH_OUTPUT.PROPOSED_INTELLIGENCE,
  RESEARCH_OUTPUT.THESIS_CHECK_UPDATE,
]);

// ---------------------------------------------------------------------
// Storage backend (overridable for tests)
// ---------------------------------------------------------------------

let backend = null;
function getBackend() {
  if (backend) return backend;
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      backend = globalThis.localStorage;
      return backend;
    }
  } catch { /* SSR / sandbox */ }
  return null;
}
export function setResearchSettingsBackend(b) { backend = b; memoryCache = null; }
export function resetResearchSettingsBackend() { backend = null; memoryCache = null; }

// ---------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------

/**
 * Build a default settings record for a basket + agent. Operator-
 * driven from the configurator UI's initial state.
 *
 * @param {object} input
 * @param {string} input.basketId
 * @param {string} input.agentId
 * @returns {object} settings record (not persisted)
 */
export function getDefaultAgentResearchSettings({ basketId, agentId } = {}) {
  const safeBasket = typeof basketId === "string" && basketId
    ? basketId : "ai_health_diagnostics";
  const safeAgent  = typeof agentId === "string" && agentId
    ? agentId : "aiHealthDiagnosticsAgent";
  const sources = DEFAULT_BASKET_SOURCES[safeBasket]
    ? DEFAULT_BASKET_SOURCES[safeBasket].slice()
    : [];
  const symbols = DEFAULT_BASKET_SYMBOLS[safeBasket]
    ? DEFAULT_BASKET_SYMBOLS[safeBasket].slice()
    : [];
  const at = Date.now();
  return {
    id: makeId(safeBasket, safeAgent),
    basketId: safeBasket,
    agentId:  safeAgent,
    frequency: RESEARCH_FREQUENCY.MANUAL_ONLY,
    sources,
    outputs: DEFAULT_OUTPUTS.slice(),
    symbols,
    requireApproval: true,
    enabled: true,
    createdAt: at,
    updatedAt: at,
  };
}

// ---------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------

function loadAll() {
  if (memoryCache && Array.isArray(memoryCache)) return memoryCache;
  const b = getBackend();
  if (!b || !b.getItem) { memoryCache = []; return memoryCache; }
  try {
    const raw = b.getItem(STORAGE_KEY);
    if (!raw) { memoryCache = []; return memoryCache; }
    const parsed = JSON.parse(raw);
    memoryCache = Array.isArray(parsed) ? parsed : [];
  } catch {
    memoryCache = [];
  }
  return memoryCache;
}

function flush(items) {
  memoryCache = Array.isArray(items) ? items : [];
  const b = getBackend();
  if (!b || !b.setItem) return;
  try {
    b.setItem(STORAGE_KEY, JSON.stringify(memoryCache));
  } catch { /* tolerate quota / disabled storage */ }
}

/**
 * Get the saved settings for a basket + agent. Returns null when
 * nothing has been saved (caller should fall back to defaults).
 */
export function getAgentResearchSettings({ basketId, agentId } = {}) {
  if (typeof basketId !== "string" || typeof agentId !== "string") return null;
  const items = loadAll();
  const found = items.find(
    (it) => it && it.basketId === basketId && it.agentId === agentId,
  );
  return found ? clone(found) : null;
}

/**
 * Persist a settings record. Sanitises the input — invalid sources /
 * outputs / frequencies are silently dropped. Returns the stored
 * record (cloned) or null on bad input.
 */
export function saveAgentResearchSettings(input = {}) {
  const sanitised = sanitiseSettingsInput(input);
  if (!sanitised) return null;

  const items = loadAll();
  const idx = items.findIndex(
    (it) => it && it.basketId === sanitised.basketId && it.agentId === sanitised.agentId,
  );
  const at = Date.now();
  if (idx >= 0) {
    const prev = items[idx];
    const merged = {
      ...prev,
      ...sanitised,
      id: prev.id,
      createdAt: prev.createdAt,
      updatedAt: at,
    };
    items[idx] = merged;
    flush(items);
    return clone(merged);
  }
  const record = {
    ...sanitised,
    id: makeId(sanitised.basketId, sanitised.agentId),
    createdAt: at,
    updatedAt: at,
  };
  items.push(record);
  flush(items);
  return clone(record);
}

/** All saved settings (cloned). */
export function listAgentResearchSettings() {
  return loadAll().map(clone);
}

/**
 * Restore the basket-aware default for a basket + agent. Persists
 * the default and returns it.
 */
export function resetAgentResearchSettings({ basketId, agentId } = {}) {
  if (typeof basketId !== "string" || typeof agentId !== "string") return null;
  const items = loadAll();
  const idx = items.findIndex(
    (it) => it && it.basketId === basketId && it.agentId === agentId,
  );
  const fresh = getDefaultAgentResearchSettings({ basketId, agentId });
  if (idx >= 0) {
    items[idx] = { ...fresh, createdAt: items[idx].createdAt, updatedAt: Date.now() };
  } else {
    items.push(fresh);
  }
  flush(items);
  return clone(items.find(
    (it) => it && it.basketId === basketId && it.agentId === agentId,
  ));
}

/** Test-only wipe. */
export function clearAgentResearchSettingsForTests() { flush([]); }

// ---------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------

function sanitiseSettingsInput(input) {
  if (!input || typeof input !== "object") return null;
  const basketId = typeof input.basketId === "string" && input.basketId
    ? input.basketId : null;
  const agentId  = typeof input.agentId === "string" && input.agentId
    ? input.agentId : null;
  if (!basketId || !agentId) return null;

  const frequency = typeof input.frequency === "string" && VALID_FREQUENCIES.has(input.frequency)
    ? input.frequency
    : RESEARCH_FREQUENCY.MANUAL_ONLY;

  const sources = Array.isArray(input.sources)
    ? Array.from(new Set(input.sources.filter((s) => VALID_SOURCES.has(s))))
    : [];

  const outputs = Array.isArray(input.outputs)
    ? Array.from(new Set(input.outputs.filter((o) => VALID_OUTPUTS.has(o))))
    : DEFAULT_OUTPUTS.slice();

  // If no symbols given, fall back to basket defaults when known.
  let symbols = Array.isArray(input.symbols)
    ? input.symbols.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim().toUpperCase())
    : [];
  if (symbols.length === 0 && DEFAULT_BASKET_SYMBOLS[basketId]) {
    symbols = DEFAULT_BASKET_SYMBOLS[basketId].slice();
  }
  // Cap at 64 to stay JSON-safe + UI-manageable.
  symbols = Array.from(new Set(symbols)).slice(0, 64);

  const requireApproval = typeof input.requireApproval === "boolean"
    ? input.requireApproval : true;
  const enabled = typeof input.enabled === "boolean"
    ? input.enabled : true;

  return {
    basketId,
    agentId,
    frequency,
    sources,
    outputs,
    symbols,
    requireApproval,
    enabled,
  };
}

function makeId(basketId, agentId) {
  return `research_${basketId}__${agentId}`;
}

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}
