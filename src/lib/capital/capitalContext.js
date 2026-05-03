// =====================================================
// CAPITAL CONTEXT (Phase 4.7.2)
// =====================================================
// Per-user, per-browser persistence for the operator's
// capital settings. Drives:
//   - capital-fit calculations on every scanned ticker
//   - the Capital Command Bar's at-a-glance values
//   - the Operator Console's capital section
//   - opportunity-cost language in the Detail Panel
//
// Hard rules:
//   - PRIVATE TO THE USER. The userId is generated per
//     browser and stored locally; no capital value is
//     ever transmitted, logged, or written into shared
//     state (mock data, alerts, screenshots).
//   - PURE FUNCTIONS where possible. The hook in
//     useCapitalContext.js wraps these helpers with React
//     state + localStorage I/O.
//   - SAFE DEFAULTS when no settings exist (zeros for
//     dollar amounts; the UI prompts the user to configure).
//   - MASK helpers blank dollar values when hideBalances
//     is true so the same dataset can be screen-shared.
// =====================================================

const USER_KEY = "lethalBoard.userId";
const CAPITAL_KEY_PREFIX = "lethalBoard.capitalContext.";

const MARKET_MODES = Object.freeze([
  "defensive",
  "neutral",
  "risk_on",
  "opportunistic",
]);

const PRESSURE_TOLERANCES = Object.freeze(["low", "medium", "high"]);

// --------------------------------------------------
// USER ID — per browser, stable across reloads
// --------------------------------------------------

/**
 * Resolve a stable per-browser user id. Generated on first call,
 * persisted to localStorage, and re-used on every subsequent call.
 * If localStorage is unavailable (private browsing, SSR), returns
 * an in-memory id valid for the current session.
 *
 * Future: replace with the actual authenticated user id when an
 * auth layer lands. The capital storage key shape is intentionally
 * `lethalBoard.capitalContext.{userId}` so the migration is trivial.
 *
 * @returns {string}
 */
let _memoryUserId = null;
export function resolveUserId() {
  try {
    if (typeof localStorage === "undefined") {
      return _memoryUserId || (_memoryUserId = generateUuid());
    }
    let id = localStorage.getItem(USER_KEY);
    if (!id) {
      id = generateUuid();
      localStorage.setItem(USER_KEY, id);
    }
    return id;
  } catch {
    return _memoryUserId || (_memoryUserId = generateUuid());
  }
}

function generateUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts.
  return "u-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
}

// --------------------------------------------------
// DEFAULTS + VALIDATION
// --------------------------------------------------

/**
 * Safe defaults when no settings exist. All dollar values are 0
 * so the UI knows to prompt the user to configure capital before
 * trusting the rankings.
 *
 * @param {string} userId
 * @returns {CapitalContext}
 */
export function defaultCapitalContext(userId) {
  return Object.freeze({
    userId: userId || "",
    startingCapital: 0,
    availableCash: 0,
    deployableCapital: 0,
    reservedCashBufferPct: 0.20,
    maxDeployedPct: 0.65,
    maxSingleTradePct: 0.10,
    marketMode: "neutral",
    pressureTolerance: "medium",
    hideBalances: false,
    updatedAt: new Date(0).toISOString(),
  });
}

/**
 * Coerce / validate an arbitrary input into a clean CapitalContext.
 * Used both on load (when reading possibly-stale localStorage) and
 * on save (after the user submits the modal).
 *
 * @param {object} raw
 * @param {string} userId
 * @returns {CapitalContext}
 */
export function normalizeCapitalContext(raw, userId) {
  const safe = (raw && typeof raw === "object") ? raw : {};
  const num = (n, fallback) => {
    const v = Number(n);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };
  const pct = (n, fallback) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(0, Math.min(1, v));
  };
  const oneOf = (s, list, fallback) => list.includes(s) ? s : fallback;

  return Object.freeze({
    userId: typeof safe.userId === "string" && safe.userId ? safe.userId : (userId || ""),
    startingCapital: num(safe.startingCapital, 0),
    availableCash: num(safe.availableCash, 0),
    deployableCapital: num(safe.deployableCapital, 0),
    reservedCashBufferPct: pct(safe.reservedCashBufferPct, 0.20),
    maxDeployedPct: pct(safe.maxDeployedPct, 0.65),
    maxSingleTradePct: pct(safe.maxSingleTradePct, 0.10),
    marketMode: oneOf(safe.marketMode, MARKET_MODES, "neutral"),
    pressureTolerance: oneOf(safe.pressureTolerance, PRESSURE_TOLERANCES, "medium"),
    hideBalances: safe.hideBalances === true,
    updatedAt: typeof safe.updatedAt === "string" ? safe.updatedAt : new Date().toISOString(),
  });
}

/**
 * Returns true when the user clearly has not configured capital
 * yet (all dollar fields are zero). The UI uses this to nudge them
 * into the modal.
 */
export function isCapitalContextUnconfigured(ctx) {
  if (!ctx) return true;
  return (Number(ctx.startingCapital) || 0) === 0
      && (Number(ctx.availableCash) || 0) === 0
      && (Number(ctx.deployableCapital) || 0) === 0;
}

// --------------------------------------------------
// LOAD / SAVE — scoped by userId
// --------------------------------------------------

function storageKey(userId) {
  return CAPITAL_KEY_PREFIX + (userId || "anonymous");
}

/**
 * Load this user's capital context from localStorage. Returns the
 * default context when nothing is stored, the data is malformed,
 * or storage is unavailable. Never throws.
 *
 * @param {string} userId
 * @returns {CapitalContext}
 */
export function loadCapitalContext(userId) {
  const id = userId || resolveUserId();
  try {
    if (typeof localStorage === "undefined") return defaultCapitalContext(id);
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return defaultCapitalContext(id);
    const parsed = JSON.parse(raw);
    return normalizeCapitalContext(parsed, id);
  } catch {
    return defaultCapitalContext(id);
  }
}

/**
 * Persist this user's capital context to localStorage. Returns the
 * normalized context that was stored. Stamps `updatedAt` to now.
 * Never throws — silently no-ops when storage is unavailable.
 *
 * @param {object} patch                values to merge over the existing context
 * @param {string} [userId]
 * @returns {CapitalContext}
 */
export function saveCapitalContext(patch, userId) {
  const id = userId || resolveUserId();
  const current = loadCapitalContext(id);
  const merged = normalizeCapitalContext(
    { ...current, ...(patch || {}), updatedAt: new Date().toISOString(), userId: id },
    id,
  );
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey(id), JSON.stringify(merged));
    }
  } catch { /* swallow — storage may be full or denied */ }
  return merged;
}

// --------------------------------------------------
// MASKING — applied at the render layer, not at storage
// --------------------------------------------------

/**
 * Mask a dollar amount for display. When hide is true, returns
 * "•••••" — never the underlying value. Otherwise formats as a
 * compact dollar string ("$60,000").
 *
 * @param {number|null|undefined} value
 * @param {boolean} hide
 * @returns {string}
 */
export function maskMoney(value, hide) {
  if (hide) return "•••••";
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return "$" + Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/**
 * Mask a percent for display. Hide-state shows "•••" (shorter than
 * money so it doesn't dominate). Otherwise formats as e.g. "65%".
 */
export function maskPercent(value, hide) {
  if (hide) return "•••";
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Math.round(Number(value) * 100) + "%";
}

/**
 * Translate the user's capital context into the `accountState`
 * shape the discovery scanner expects. Pure projection; engine
 * vocabulary is preserved.
 *
 * @param {CapitalContext} ctx
 * @returns {object}
 */
export function toAccountState(ctx) {
  const c = ctx || {};
  return Object.freeze({
    totalAccountValue: Number(c.startingCapital) || 0,
    availableCash: Number(c.availableCash) || 0,
    deployableCapital: Number(c.deployableCapital) || 0,
    maxDeployedPct: Number(c.maxDeployedPct) || 0.65,
    reservedCashBufferPct: Number(c.reservedCashBufferPct) || 0.20,
    maxSingleTradePct: Number(c.maxSingleTradePct) || 0.10,
    marketMode: c.marketMode || "neutral",
    pressureTolerance: c.pressureTolerance || "medium",
  });
}

// --------------------------------------------------
// EXPORTED CONSTANTS
// --------------------------------------------------

export const CAPITAL_MARKET_MODES = MARKET_MODES;
export const CAPITAL_PRESSURE_TOLERANCES = PRESSURE_TOLERANCES;
export const CAPITAL_STORAGE_KEY_PREFIX = CAPITAL_KEY_PREFIX;
export const CAPITAL_USER_KEY = USER_KEY;

// --------------------------------------------------
// JSDoc TYPEDEFS — kept here so consumers can import them
// --------------------------------------------------

/**
 * @typedef {object} CapitalContext
 * @property {string} userId
 * @property {number} startingCapital
 * @property {number} availableCash
 * @property {number} deployableCapital
 * @property {number} reservedCashBufferPct
 * @property {number} maxDeployedPct
 * @property {number} maxSingleTradePct
 * @property {"defensive"|"neutral"|"risk_on"|"opportunistic"} marketMode
 * @property {"low"|"medium"|"high"} pressureTolerance
 * @property {boolean} hideBalances
 * @property {string} updatedAt        ISO timestamp
 */
