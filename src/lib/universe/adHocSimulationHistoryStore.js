// =====================================================================
// Ad Hoc Simulation History Store
// =====================================================================
// Lightweight, append-only log of ad-hoc ticker simulations the operator
// has run. Captures snapshot data at simulation time + promotion state
// + outcome calibration so the operator can review what was simulated,
// whether it was promoted, and whether it played out.
//
// Hard rules:
//   - localStorage-backed; tolerant of Incognito + corrupted JSON.
//     A storage failure never breaks the UI.
//   - Capped at MAX_RECORDS (default 250) — oldest entries fall off.
//   - Newest record first when listed.
//   - Append-only by intent: existing records are mutated only via the
//     dedicated update* helpers, never reordered.
//   - PURE: no React, no fetch, no engine internals.
// =====================================================================

const STORAGE_KEY = "te.adhoc.history.v1";
const DEFAULT_MAX_RECORDS = 250;
let MAX_RECORDS = DEFAULT_MAX_RECORDS;

let memoryCache = null;

// ---------------------------------------------------------------------
// Outcome enum — mirrors the spec.
// ---------------------------------------------------------------------

export const HISTORY_OUTCOMES = Object.freeze({
  UNREVIEWED:        "unreviewed",
  WATCH:             "watch",
  PROFITABLE:        "profitable",
  MISSED_WINNER:     "missed_winner",
  INVALIDATED:       "invalidated",
  AVOIDED_CORRECTLY: "avoided_correctly",
  POOR_LIQUIDITY:    "poor_liquidity",
  NO_FOLLOW_THROUGH: "no_follow_through",
  PROMOTED:          "promoted",
});

const VALID_OUTCOMES = new Set(Object.values(HISTORY_OUTCOMES));

// ---------------------------------------------------------------------
// Storage backend (overridable for tests + future remote sync).
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
export function setHistoryBackend(b) { backend = b; memoryCache = null; }
export function resetHistoryBackend() { backend = null; memoryCache = null; }
export function setHistoryMaxRecords(n) {
  if (Number.isFinite(n) && n > 0) MAX_RECORDS = Math.floor(n);
}
export function resetHistoryMaxRecords() { MAX_RECORDS = DEFAULT_MAX_RECORDS; }

// ---------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------

function loadAll() {
  if (Array.isArray(memoryCache)) return memoryCache;
  const b = getBackend();
  if (!b || !b.getItem) { memoryCache = []; return memoryCache; }
  try {
    const raw = b.getItem(STORAGE_KEY);
    if (!raw) { memoryCache = []; return memoryCache; }
    const parsed = JSON.parse(raw);
    memoryCache = Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupted JSON or storage exception — never propagate to the UI.
    memoryCache = [];
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

/**
 * Persist a single ad-hoc simulation result. Returns the stored record
 * (with id + createdAt assigned). Returns null when the input lacks a
 * symbol — never throws.
 *
 * @param {object} simResult — output of simulateAdHoc()
 * @param {object} [opts]
 * @param {number} [opts.createdAt]
 * @param {string} [opts.id]
 * @param {string} [opts.notes]
 */
export function recordSimulation(simResult, opts = {}) {
  if (!simResult || typeof simResult !== "object") return null;
  const symbol = typeof simResult.symbol === "string" ? simResult.symbol : null;
  if (!symbol) return null;

  const createdAt = Number.isFinite(opts.createdAt) ? opts.createdAt : Date.now();
  const id = opts.id || makeId(symbol, createdAt);

  const teResult = simResult.triggerEngine?.result || null;
  const teSnapshot = {
    available:      simResult.triggerEngine?.ok === true,
    price:          numericOrNull(teResult?.price),
    previousClose:  numericOrNull(teResult?.previousClose),
    percentChange:  numericOrNull(teResult?.percentChange),
    trend:          teResult?.structure?.trendBias ?? null,
    support:        numericOrNull(teResult?.structure?.support),
    resistance:     numericOrNull(teResult?.structure?.resistance),
    atr:            numericOrNull(teResult?.structure?.atr),
    dataQuality:    simResult.triggerEngine?.dataQuality ?? null,
  };

  const cv = simResult.creditView || null;
  const cvResult = cv?.result || null;
  const cvSnapshot = {
    available:           cv?.limited === false,
    recommendationLabel: cvResult?.recommendation?.label ?? null,
    creditViewBadge:     simResult.creditViewBadge ?? cv?.badge ?? null,
    preferredStrike:     numericOrNull(cv?.candidate?.strike),
    secondaryStrike:     numericOrNull(cvResult?.bestStrikeZone?.low),
    expiration:          cv?.candidate?.expiration ?? null,
    premiumMid:          numericOrNull(cv?.candidate?.mid),
    premiumFloor:        numericOrNull(cvResult?.minimumPremium?.value),
    spreadClass:         cv?.candidate?.spreadClass ?? null,
    spreadGrade:         cv?.candidate?.spreadGrade ?? null,
    confirmationSentence: cvResult?.confirmation?.sentence ?? null,
    invalidationSentence: cvResult?.invalidation?.sentence ?? null,
    managementNote:      cvResult?.managementNote ?? null,
  };

  const record = {
    id,
    symbol,
    createdAt,
    sourceType:     simResult.sourceType ?? null,
    catalogStatus:  simResult.catalogStatus ?? null,
    simulationType: simResult.analysisMode ?? null,
    dataAvailability: { ...(simResult.dataAvailability || {}) },
    teSnapshot,
    cvSnapshot,
    promotionState: {
      addedToBasket:     false,
      promotedToScanner: false,
      sentToTE:          false,
      sentToCV:          false,
    },
    outcome: {
      status:         HISTORY_OUTCOMES.UNREVIEWED,
      reviewedAt:     null,
      priceAtReview:  null,
      premiumAtReview: null,
      maxDrawdown:    null,
      profitCapture:  null,
      notes:          null,
    },
    tags:  [],
    notes: typeof opts.notes === "string" ? opts.notes : null,
    warnings: Array.isArray(simResult.creditView?.warnings)
      ? [...simResult.creditView.warnings]
      : [],
  };

  const records = loadAll();
  records.unshift(record);
  if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
  flush(records);
  return record;
}

/**
 * List history records, newest first. Optional filters.
 *
 * @param {object} [opts]
 * @param {string} [opts.symbol]
 * @param {string} [opts.status]              one of HISTORY_OUTCOMES values
 * @param {string} [opts.sourceType]
 * @param {number} [opts.limit]
 * @returns {object[]}
 */
export function listHistory(opts = {}) {
  let records = [...loadAll()];
  if (opts.symbol) {
    const s = String(opts.symbol).trim().toUpperCase();
    records = records.filter((r) => r.symbol === s);
  }
  if (opts.status) {
    records = records.filter((r) => r.outcome?.status === opts.status);
  }
  if (opts.sourceType) {
    records = records.filter((r) => r.sourceType === opts.sourceType);
  }
  if (Number.isFinite(opts.limit) && opts.limit > 0) {
    records = records.slice(0, Math.floor(opts.limit));
  }
  return records;
}

/** Single record by id; null when absent. */
export function getHistoryById(id) {
  if (!id) return null;
  const records = loadAll();
  return records.find((r) => r.id === id) || null;
}

/**
 * Patch the promotionState of a single record. Patch fields:
 *   addedToBasket | promotedToScanner | sentToTE | sentToCV
 * Returns the updated record or null when not found.
 */
export function updatePromotion(id, patch = {}) {
  return mutateRecord(id, (r) => {
    r.promotionState = { ...(r.promotionState || {}), ...sanitizePromotionPatch(patch) };
  });
}

/**
 * Patch the outcome of a single record. Sets reviewedAt automatically
 * unless the caller passes explicit reviewedAt.
 */
export function updateOutcome(id, patch = {}) {
  return mutateRecord(id, (r) => {
    const sanitized = sanitizeOutcomePatch(patch);
    if (!("reviewedAt" in sanitized)) {
      sanitized.reviewedAt = Date.now();
    }
    r.outcome = { ...(r.outcome || {}), ...sanitized };
  });
}

/** Set a free-text note on a record. */
export function setNotes(id, notes) {
  return mutateRecord(id, (r) => {
    r.notes = typeof notes === "string" ? notes : null;
  });
}

/** Add/remove tags. */
export function addTag(id, tag) {
  if (!tag || typeof tag !== "string") return null;
  return mutateRecord(id, (r) => {
    const t = tag.trim();
    if (!t) return;
    const set = new Set([...(r.tags || []), t]);
    r.tags = Array.from(set);
  });
}
export function removeTag(id, tag) {
  return mutateRecord(id, (r) => {
    r.tags = (r.tags || []).filter((t) => t !== tag);
  });
}

/** Remove a single record. Returns true when something was removed. */
export function deleteHistory(id) {
  if (!id) return false;
  const records = loadAll();
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  records.splice(idx, 1);
  flush(records);
  return true;
}

/** Wipe all history (operator action). */
export function clearHistory() { flush([]); }

/**
 * Convenience accessor for the latest history record matching a symbol —
 * useful when the search panel needs to attach promotion-state updates
 * to the just-finished simulation without tracking the id explicitly.
 */
export function getLatestForSymbol(rawSymbol) {
  if (!rawSymbol) return null;
  const sym = String(rawSymbol).trim().toUpperCase();
  if (!sym) return null;
  const records = loadAll();
  return records.find((r) => r.symbol === sym) || null;
}

/**
 * Calibration summary — manual-review counts so the operator can see
 * how their judgment is tracking. Keeps it small on purpose; this is
 * not analytics, it's the gut-check chip strip.
 */
export function getCalibrationSummary(opts = {}) {
  let records = loadAll();
  if (Number.isFinite(opts.since)) {
    records = records.filter((r) => Number.isFinite(r.createdAt) && r.createdAt >= opts.since);
  }
  const counts = {
    total:               records.length,
    optionsAvailable:    0,
    addedToBasket:       0,
    promotedToScanner:   0,
    profitable:          0,
    missedWinner:        0,
    invalidated:         0,
    avoidedCorrectly:    0,
    poorLiquidity:       0,
    noFollowThrough:     0,
    unreviewed:          0,
  };
  for (const r of records) {
    if (r.dataAvailability?.optionsChain) counts.optionsAvailable++;
    if (r.promotionState?.addedToBasket)      counts.addedToBasket++;
    if (r.promotionState?.promotedToScanner)  counts.promotedToScanner++;
    switch (r.outcome?.status) {
      case HISTORY_OUTCOMES.PROFITABLE:        counts.profitable++; break;
      case HISTORY_OUTCOMES.MISSED_WINNER:     counts.missedWinner++; break;
      case HISTORY_OUTCOMES.INVALIDATED:       counts.invalidated++; break;
      case HISTORY_OUTCOMES.AVOIDED_CORRECTLY: counts.avoidedCorrectly++; break;
      case HISTORY_OUTCOMES.POOR_LIQUIDITY:    counts.poorLiquidity++; break;
      case HISTORY_OUTCOMES.NO_FOLLOW_THROUGH: counts.noFollowThrough++; break;
      case HISTORY_OUTCOMES.UNREVIEWED:        counts.unreviewed++; break;
      default: break;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------

function mutateRecord(id, mutator) {
  if (!id || typeof mutator !== "function") return null;
  const records = loadAll();
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  // Clone the record to avoid mutating the cache reference before flush.
  const next = JSON.parse(JSON.stringify(records[idx]));
  mutator(next);
  records[idx] = next;
  flush(records);
  return next;
}

function sanitizePromotionPatch(patch) {
  const out = {};
  for (const key of ["addedToBasket", "promotedToScanner", "sentToTE", "sentToCV"]) {
    if (key in patch) out[key] = !!patch[key];
  }
  return out;
}

function sanitizeOutcomePatch(patch) {
  const out = {};
  if ("status" in patch) {
    out.status = VALID_OUTCOMES.has(patch.status) ? patch.status : HISTORY_OUTCOMES.UNREVIEWED;
  }
  for (const key of ["priceAtReview", "premiumAtReview", "maxDrawdown", "profitCapture"]) {
    if (key in patch) out[key] = numericOrNull(patch[key]);
  }
  if ("notes" in patch) out.notes = typeof patch.notes === "string" ? patch.notes : null;
  if ("reviewedAt" in patch) out.reviewedAt = Number.isFinite(patch.reviewedAt) ? patch.reviewedAt : Date.now();
  return out;
}

function makeId(symbol, createdAt) {
  return `${symbol}_${createdAt}_${Math.random().toString(36).slice(2, 8)}`;
}

function numericOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
