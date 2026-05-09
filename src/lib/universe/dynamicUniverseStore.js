// =====================================================================
// Dynamic Universe Store — localStorage-backed CRUD for non-catalog tickers
// =====================================================================
// Owns the operator's mutable opportunity universe (DYNAMIC_BASKET,
// LETHAL_BOARD_PROSPECT, AD_HOC_SIMULATION). The static catalog stays
// untouched; this store is purely additive.
//
// Hard rules:
//   - Tolerant of failures (Incognito / disabled localStorage). A
//     storage write that throws never propagates to the UI; we fall
//     back to in-memory state for the session.
//   - Symbols are normalized before any read or write, so "aapl",
//     " AAPL ", "AAPL" all hit the same record.
//   - The store is BACKEND-READY: every mutation goes through the
//     same flush() abstraction so a future remote write can swap in
//     without changing call sites.
// =====================================================================

import {
  TICKER_SOURCE_TYPES,
  CATALOG_STATUS,
  SOURCE_PRIORITY,
  normalizeSymbol,
  makeTickerRecord,
} from "./tickerUniverseTypes.js";

const STORAGE_KEY = "te.universe.dynamic.v1";

// In-memory mirror so we serve consistent data even when storage fails.
let memoryCache = null;

// ---------------------------------------------------------------------
// Storage backend (overridable for tests + future remote sync)
// ---------------------------------------------------------------------

let backend = null;
function getBackend() {
  if (backend) return backend;
  try {
    if (typeof globalThis.localStorage !== "undefined") {
      backend = globalThis.localStorage;
      return backend;
    }
  } catch { /* sandbox / SSR */ }
  return null;
}

/** Replace the storage backend. Tests pass a Map-like object. */
export function setUniverseBackend(b) { backend = b; memoryCache = null; }
export function resetUniverseBackend() { backend = null; memoryCache = null; }

// ---------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------

function loadAll() {
  if (memoryCache) return memoryCache;
  const b = getBackend();
  if (!b) { memoryCache = {}; return memoryCache; }
  try {
    const raw = b.getItem ? b.getItem(STORAGE_KEY) : null;
    if (!raw) { memoryCache = {}; return memoryCache; }
    const parsed = JSON.parse(raw);
    memoryCache = parsed && typeof parsed === "object" ? parsed : {};
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

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/** Get all dynamic records keyed by normalized symbol. */
export function listDynamicTickers() {
  return { ...loadAll() };
}

/** Get a single record by symbol; null when absent. */
export function getDynamicTicker(rawSymbol) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym) return null;
  const all = loadAll();
  return all[sym] || null;
}

/**
 * Insert or update a dynamic record. Merges into any existing record
 * for the same symbol so multi-source provenance is preserved on the
 * `appearances` list. Returns the upserted record.
 */
export function upsertDynamicTicker(input) {
  const sym = normalizeSymbol(input?.symbol);
  if (!sym) return null;
  const all = loadAll();
  const prior = all[sym] || null;

  const sourceType = input.sourceType || prior?.sourceType || TICKER_SOURCE_TYPES.AD_HOC_SIMULATION;
  const merged = {
    ...(prior || makeTickerRecord({ symbol: sym, sourceType })),
    ...input,
    symbol: sym,
    // Preserve addedAt from the prior record if any.
    addedAt: prior?.addedAt ?? input.addedAt ?? Date.now(),
    appearances: mergeAppearances(prior?.appearances, sourceType),
    engineEligibility: {
      ...(prior?.engineEligibility || makeTickerRecord().engineEligibility),
      ...(input.engineEligibility || {}),
    },
    dataAvailability: {
      ...(prior?.dataAvailability || makeTickerRecord().dataAvailability),
      ...(input.dataAvailability || {}),
    },
    basketTags: dedupeStrings(input.basketTags ?? prior?.basketTags ?? []),
  };

  // sourceType normalization: the highest-priority appearance wins as
  // the canonical sourceType, so a ticker that was AD_HOC and now lives
  // in the dynamic basket reads as DYNAMIC_BASKET.
  merged.sourceType = pickHighestPriorityAppearance(merged.appearances);
  merged.catalogStatus = catalogStatusForSource(merged.sourceType, merged.promoted);

  all[sym] = merged;
  flush(all);
  return merged;
}

/** Remove a single record. Returns true when something was removed. */
export function removeDynamicTicker(rawSymbol) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym) return false;
  const all = loadAll();
  if (!all[sym]) return false;
  delete all[sym];
  flush(all);
  return true;
}

/** Wipe the whole dynamic universe (operator action). */
export function clearDynamicUniverse() { flush({}); }

/**
 * Mark a ticker as scanner-eligible. Used by the "Promote to Scanner"
 * action; the basket scan reads `scannerEligible: true`.
 */
export function setScannerEligible(rawSymbol, eligible = true) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym) return null;
  const existing = getDynamicTicker(sym);
  if (!existing) return null;
  return upsertDynamicTicker({
    ...existing,
    scannerEligible: !!eligible,
    promoted: !!eligible || existing.promoted,
  });
}

/**
 * Add a basket tag (e.g. "earnings", "vol-rich", custom name).
 * Idempotent — duplicates are dropped.
 */
export function addBasketTag(rawSymbol, tag) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym || !tag || typeof tag !== "string") return null;
  const existing = getDynamicTicker(sym);
  if (!existing) return null;
  return upsertDynamicTicker({
    ...existing,
    basketTags: dedupeStrings([...(existing.basketTags || []), tag.trim()]),
  });
}

export function removeBasketTag(rawSymbol, tag) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym || !tag) return null;
  const existing = getDynamicTicker(sym);
  if (!existing) return null;
  return upsertDynamicTicker({
    ...existing,
    basketTags: (existing.basketTags || []).filter((t) => t !== tag),
  });
}

/** Filter records by sourceType. */
export function listBySource(sourceType) {
  const all = loadAll();
  return Object.values(all).filter((r) => r.sourceType === sourceType);
}

/** Records flagged scanner-eligible. */
export function listScannerEligible() {
  const all = loadAll();
  return Object.values(all).filter((r) => r.scannerEligible === true);
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function mergeAppearances(prior, sourceType) {
  const seen = new Map();
  for (const ap of (prior || [])) {
    if (ap && ap.sourceType) seen.set(ap.sourceType, ap);
  }
  if (!seen.has(sourceType)) {
    seen.set(sourceType, { sourceType, addedAt: Date.now() });
  }
  return Array.from(seen.values());
}

function pickHighestPriorityAppearance(appearances) {
  if (!Array.isArray(appearances) || appearances.length === 0) {
    return TICKER_SOURCE_TYPES.AD_HOC_SIMULATION;
  }
  let best = appearances[0];
  let bestPri = SOURCE_PRIORITY[best.sourceType] ?? 0;
  for (let i = 1; i < appearances.length; i++) {
    const pri = SOURCE_PRIORITY[appearances[i].sourceType] ?? 0;
    if (pri > bestPri) { best = appearances[i]; bestPri = pri; }
  }
  return best.sourceType;
}

function catalogStatusForSource(sourceType, promoted) {
  if (sourceType === TICKER_SOURCE_TYPES.STATIC_CATALOG) return CATALOG_STATUS.CATALOGED;
  if (sourceType === TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT) return CATALOG_STATUS.PROSPECT;
  if (promoted) return CATALOG_STATUS.PROMOTED;
  return CATALOG_STATUS.UNCATALOGED;
}

function dedupeStrings(arr) {
  if (!Array.isArray(arr)) return [];
  return Array.from(new Set(arr.map((s) => String(s || "").trim()).filter(Boolean)));
}
