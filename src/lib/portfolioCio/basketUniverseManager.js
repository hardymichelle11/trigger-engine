// =====================================================================
// Basket Universe Manager
// =====================================================================
// localStorage-backed CRUD for the operator's per-basket active /
// watchlist / excluded membership. Mirrors the dynamicUniverseStore
// pattern: corruption tolerant, backend-overridable for tests, every
// public mutator is idempotent and side-effect free on failure.
//
// Mutual-exclusivity invariant: a single symbol is on at most one of
// {activeUniverse, watchlist, excludedSymbols} per basket. The setter
// helpers enforce this — moving to one list always removes from the
// other two.
// =====================================================================

import {
  normalizeSymbol,
  makeBasketUniverse,
  makeBasketSymbolRecord,
} from "./basketAgentTypes.js";
import { getBasketAgent } from "./basketAgentRegistry.js";

const STORAGE_KEY = "te.basket.universe.v1";
let memoryCache = null;

// ---------------------------------------------------------------------
// Storage backend (overridable for tests).
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
export function setBasketBackend(b) { backend = b; memoryCache = null; }
export function resetBasketBackend() { backend = null; memoryCache = null; }

// ---------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------

function loadAll() {
  if (memoryCache && typeof memoryCache === "object") return memoryCache;
  const b = getBackend();
  if (!b || !b.getItem) { memoryCache = {}; return memoryCache; }
  try {
    const raw = b.getItem(STORAGE_KEY);
    if (!raw) { memoryCache = {}; return memoryCache; }
    const parsed = JSON.parse(raw);
    memoryCache = (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  } catch {
    memoryCache = {};
  }
  return memoryCache;
}

function flush(records) {
  memoryCache = records;
  const b = getBackend();
  if (!b || !b.setItem) return;
  try {
    b.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch { /* tolerate quota / disabled storage */ }
}

function bumpUpdated(basket) {
  basket.lastUpdatedAt = Date.now();
}

function ensureBasket(records, basketId) {
  if (typeof basketId !== "string" || !basketId) return null;
  if (!records[basketId]) {
    records[basketId] = makeBasketUniverse(basketId);
  }
  // Defensive normalization — the on-disk record may have been written
  // by an older version that lacked one of the lists.
  const u = records[basketId];
  if (!Array.isArray(u.activeUniverse))   u.activeUniverse = [];
  if (!Array.isArray(u.watchlist))         u.watchlist = [];
  if (!Array.isArray(u.excludedSymbols))   u.excludedSymbols = [];
  return u;
}

// ---------------------------------------------------------------------
// Public read helpers
// ---------------------------------------------------------------------

/**
 * Get a basket's universe record. Always returns a populated object —
 * an unknown basket id yields a fresh, empty BasketUniverse so callers
 * never need a null-check.
 */
export function getBasketUniverse(basketId) {
  if (typeof basketId !== "string" || !basketId) return null;
  const records = loadAll();
  if (!records[basketId]) return makeBasketUniverse(basketId);
  return cloneBasket(records[basketId]);
}

/** All basket universes keyed by basketId. Cloned so callers can't mutate cache. */
export function listBasketUniverses() {
  const records = loadAll();
  const out = {};
  for (const [id, u] of Object.entries(records)) {
    out[id] = cloneBasket(u);
  }
  return out;
}

// ---------------------------------------------------------------------
// Public mutators
// ---------------------------------------------------------------------

/**
 * Insert or update a symbol on a basket's active universe. Removes the
 * symbol from watchlist + excluded so the mutual-exclusivity invariant
 * is preserved.
 *
 * @param {string} basketId
 * @param {string} rawSymbol
 * @param {object} [metadata]   addedReason / source / notes / tags
 * @returns {object|null}       the updated record, or null on bad input
 */
export function upsertBasketSymbol(basketId, rawSymbol, metadata = {}) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym || !basketId) return null;
  const records = loadAll();
  const basket = ensureBasket(records, basketId);
  if (!basket) return null;

  const existing = findSymbol(basket.activeUniverse, sym);
  let record;
  if (existing) {
    record = applyMetadata(existing, metadata);
  } else {
    // Pull from watchlist if present so we don't lose history (notes,
    // tags, addedAt). Otherwise create a fresh record.
    const fromWatch = removeFromList(basket.watchlist, sym);
    const fromExcluded = removeFromList(basket.excludedSymbols, sym);
    const carry = fromWatch || fromExcluded || null;
    record = applyMetadata(
      carry || makeBasketSymbolRecord({ symbol: sym, addedAt: Date.now() }),
      metadata,
    );
    record.symbol = sym;
    basket.activeUniverse.push(record);
  }
  bumpUpdated(basket);
  flush(records);
  return cloneRecord(record);
}

/** Remove a symbol from active. Returns true when something was removed. */
export function removeBasketSymbol(basketId, rawSymbol) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym || !basketId) return false;
  const records = loadAll();
  const basket = ensureBasket(records, basketId);
  if (!basket) return false;
  const removed = removeFromList(basket.activeUniverse, sym);
  if (removed) {
    bumpUpdated(basket);
    flush(records);
    return true;
  }
  return false;
}

export function moveToWatchlist(basketId, rawSymbol, reason = null) {
  return moveTo(basketId, rawSymbol, "watchlist", reason);
}

export function moveToExcluded(basketId, rawSymbol, reason = null) {
  return moveTo(basketId, rawSymbol, "excludedSymbols", reason);
}

/** Restore a symbol back to the active universe from watchlist or excluded. */
export function restoreToActive(basketId, rawSymbol) {
  return moveTo(basketId, rawSymbol, "activeUniverse", "restored_to_active");
}

export function updateBasketSymbolNote(basketId, rawSymbol, note) {
  return mutateRecord(basketId, rawSymbol, (rec) => {
    rec.notes = typeof note === "string" ? note : null;
  });
}

export function addBasketSymbolTag(basketId, rawSymbol, tag) {
  if (typeof tag !== "string" || !tag.trim()) return null;
  return mutateRecord(basketId, rawSymbol, (rec) => {
    const t = tag.trim();
    rec.tags = Array.from(new Set([...(rec.tags || []), t]));
  });
}

export function removeBasketSymbolTag(basketId, rawSymbol, tag) {
  return mutateRecord(basketId, rawSymbol, (rec) => {
    rec.tags = (rec.tags || []).filter((t) => t !== tag);
  });
}

/** Wipe a single basket's universe. */
export function clearBasketUniverse(basketId) {
  if (typeof basketId !== "string" || !basketId) return false;
  const records = loadAll();
  if (!records[basketId]) return false;
  delete records[basketId];
  flush(records);
  return true;
}

/** Wipe the whole store (operator action). */
export function clearAllBasketUniverses() { flush({}); }

/**
 * Rehydrate baseline leaders into a basket's active universe. Useful
 * when bootstrapping a fresh install. Caller-driven — never automatic.
 */
export function seedBaselineLeaders(basketId, opts = {}) {
  const profile = getBasketAgent(basketId);
  if (!profile) return null;
  const reason = opts.addedReason || "baseline_anchor";
  const source = opts.source || "registry_baseline";
  for (const sym of profile.baselineLeaders) {
    upsertBasketSymbol(basketId, sym, { addedReason: reason, source });
  }
  return getBasketUniverse(basketId);
}

// ---------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------

const VALID_LISTS = new Set(["activeUniverse", "watchlist", "excludedSymbols"]);

function moveTo(basketId, rawSymbol, targetList, reason) {
  if (!VALID_LISTS.has(targetList)) return null;
  const sym = normalizeSymbol(rawSymbol);
  if (!sym || !basketId) return null;
  const records = loadAll();
  const basket = ensureBasket(records, basketId);
  if (!basket) return null;

  // Pull the existing record from whichever list it's in (so notes /
  // tags carry over). Then enforce mutual exclusivity by removing from
  // the other two before inserting.
  let record =
    removeFromList(basket.activeUniverse, sym) ||
    removeFromList(basket.watchlist, sym) ||
    removeFromList(basket.excludedSymbols, sym) ||
    makeBasketSymbolRecord({ symbol: sym });

  record.symbol = sym;
  if (typeof reason === "string" && reason.length > 0) {
    record.addedReason = reason;
  }
  record.addedAt = record.addedAt || Date.now();
  basket[targetList].push(record);
  bumpUpdated(basket);
  flush(records);
  return cloneRecord(record);
}

function mutateRecord(basketId, rawSymbol, mutator) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym || !basketId || typeof mutator !== "function") return null;
  const records = loadAll();
  const basket = ensureBasket(records, basketId);
  if (!basket) return null;
  for (const list of ["activeUniverse", "watchlist", "excludedSymbols"]) {
    const idx = basket[list].findIndex((r) => r && r.symbol === sym);
    if (idx >= 0) {
      const next = JSON.parse(JSON.stringify(basket[list][idx]));
      mutator(next);
      basket[list][idx] = next;
      bumpUpdated(basket);
      flush(records);
      return cloneRecord(next);
    }
  }
  return null;
}

function applyMetadata(rec, meta = {}) {
  const out = { ...rec };
  if (typeof meta.addedReason === "string") out.addedReason = meta.addedReason;
  if (typeof meta.source === "string")      out.source = meta.source;
  if (typeof meta.notes === "string")       out.notes = meta.notes;
  if (Number.isFinite(meta.lastReviewedAt)) out.lastReviewedAt = meta.lastReviewedAt;
  if (Array.isArray(meta.tags)) {
    const existing = Array.isArray(out.tags) ? out.tags : [];
    const incoming = meta.tags.filter((t) => typeof t === "string" && t.length);
    out.tags = Array.from(new Set([...existing, ...incoming]));
  }
  return out;
}

function findSymbol(list, sym) {
  if (!Array.isArray(list)) return null;
  return list.find((r) => r && r.symbol === sym) || null;
}

function removeFromList(list, sym) {
  if (!Array.isArray(list)) return null;
  const idx = list.findIndex((r) => r && r.symbol === sym);
  if (idx < 0) return null;
  const [removed] = list.splice(idx, 1);
  return removed;
}

function cloneBasket(b) {
  return JSON.parse(JSON.stringify(b));
}
function cloneRecord(r) {
  return JSON.parse(JSON.stringify(r));
}
