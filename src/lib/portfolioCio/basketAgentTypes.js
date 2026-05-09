// =====================================================================
// Basket Agent — types + enums + factories
// =====================================================================
// PURE constants + helpers shared by the basket registry, the universe
// manager, and the leadership engine. Mirrors the universe-layer
// convention (additive, no raw scores, trader-facing language).
// =====================================================================

export const LEADERSHIP_STATUS = Object.freeze({
  LEADER:           "leader",
  EMERGING_LEADER:  "emerging_leader",
  CHALLENGER:       "challenger",
  LAGGARD:          "laggard",
  FADING_LEADER:    "fading_leader",
  OVEREXTENDED:     "overextended",
  WATCH_ONLY:       "watch_only",
  REMOVED:          "removed",
  UNCLASSIFIED:     "unclassified",
});
const LEADERSHIP_STATUS_VALUES = new Set(Object.values(LEADERSHIP_STATUS));

export const BASKET_MEMBERSHIP = Object.freeze({
  ACTIVE:    "active",
  WATCH:     "watch",
  EXCLUDED:  "excluded",
});

export const REBALANCE_CADENCE = Object.freeze({
  WEEKLY:     "weekly",
  BIWEEKLY:   "biweekly",
  MONTHLY:    "monthly",
  QUARTERLY:  "quarterly",
  ON_DEMAND:  "on_demand",
});

export const MAX_EXPOSURE = Object.freeze({
  CONSERVATIVE: "conservative",
  MODERATE:     "moderate",
  AGGRESSIVE:   "aggressive",
});

export const BASKET_PREFERRED_ROUTES = Object.freeze({
  SEND_TO_TE:        "send_to_TE",
  SEND_TO_CV:        "send_to_CV",
  SEND_TO_TE_AND_CV: "send_to_TE_and_CV",
  PROMOTE_TO_SCANNER:"promote_to_scanner",
  ADD_TO_BASKET:     "add_to_basket",
  MONITOR:           "monitor",
});

// ---------------------------------------------------------------------
// Symbol normalizer — kept local to avoid a cross-package import. Keeps
// "  aapl  " / "AAPL" / "aapl," all reaching the same record.
// ---------------------------------------------------------------------

export function normalizeSymbol(raw) {
  if (raw == null) return null;
  if (typeof raw !== "string") {
    if (typeof raw === "number" && Number.isFinite(raw)) raw = String(raw);
    else return null;
  }
  const trimmed = raw.trim().replace(/\s+/g, "").replace(/[.,;:]+$/g, "").toUpperCase();
  if (trimmed.length === 0) return null;
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(trimmed)) return null;
  return trimmed;
}

// ---------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------

/**
 * @typedef {Object} BasketSymbolRecord
 * @property {string} symbol
 * @property {number} addedAt
 * @property {string|null} addedReason
 * @property {string|null} source
 * @property {string|null} notes
 * @property {string[]} tags
 * @property {number|null} lastReviewedAt
 */

export function makeBasketSymbolRecord(overrides = {}) {
  return {
    symbol:         null,
    addedAt:        Date.now(),
    addedReason:    null,
    source:         null,
    notes:          null,
    tags:           [],
    lastReviewedAt: null,
    ...overrides,
  };
}

/**
 * @typedef {Object} BasketUniverse
 * @property {string} basketId
 * @property {BasketSymbolRecord[]} activeUniverse
 * @property {BasketSymbolRecord[]} watchlist
 * @property {BasketSymbolRecord[]} excludedSymbols
 * @property {string|null} notes
 * @property {number} lastUpdatedAt
 */

export function makeBasketUniverse(basketId, overrides = {}) {
  return {
    basketId,
    activeUniverse:  [],
    watchlist:       [],
    excludedSymbols: [],
    notes:           null,
    lastUpdatedAt:   Date.now(),
    ...overrides,
  };
}

export function isValidLeadershipStatus(s) {
  return LEADERSHIP_STATUS_VALUES.has(s);
}
