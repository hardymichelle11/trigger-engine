// =====================================================================
// Manager Assessment Memory Store
// =====================================================================
// Per-symbol, localStorage-backed snapshot of the most recent CIO
// Manager Assessment Tape result. Powers the basket leadership table
// so it can classify active names instead of always showing
// "Insufficient manager evidence".
//
// Hard rules:
//   - Trader-facing fields only — score / weight / coefficient style
//     fields are stripped on write (defense in depth; the tape's
//     normalizer already drops them upstream).
//   - localStorage-backed; tolerant of Incognito + corrupted JSON.
//   - Capped at MAX_RECORDS (default 250). Oldest evicted first.
//   - Symbols normalized on read + write via the universe-layer rule.
// =====================================================================

import { normalizeSymbol } from "../universe/tickerUniverseTypes.js";

const STORAGE_KEY = "te.cio.manager_memory.v1";
const DEFAULT_MAX_RECORDS = 250;
let MAX_RECORDS = DEFAULT_MAX_RECORDS;

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
  } catch { /* SSR / sandbox */ }
  return null;
}
export function setManagerMemoryBackend(b) { backend = b; memoryCache = null; }
export function resetManagerMemoryBackend() { backend = null; memoryCache = null; }
export function setManagerMemoryMaxRecords(n) {
  if (Number.isFinite(n) && n > 0) MAX_RECORDS = Math.floor(n);
}
export function resetManagerMemoryMaxRecords() { MAX_RECORDS = DEFAULT_MAX_RECORDS; }

// ---------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------

function loadAll() {
  if (memoryCache && typeof memoryCache === "object" && !Array.isArray(memoryCache)) return memoryCache;
  const b = getBackend();
  if (!b || !b.getItem) { memoryCache = {}; return memoryCache; }
  try {
    const raw = b.getItem(STORAGE_KEY);
    if (!raw) { memoryCache = {}; return memoryCache; }
    const parsed = JSON.parse(raw);
    memoryCache = (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      ? parsed
      : {};
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
// Sanitization — keep only the trader-facing manager fields, drop any
// raw score / weight / coefficient that may have slipped through.
// ---------------------------------------------------------------------

const ALLOWED_ASSESSMENT_FIELDS = [
  "agentId", "agentName", "agentRole",
  "assessmentLabel", "stance", "confidenceLabel",
  "evidenceSummary", "supportingEvidence", "concernFlags",
  "missingEvidence", "recommendedAction", "routeRecommendation",
  "timeHorizonBias", "calibrationFlag", "lastUpdatedAt",
];

function sanitizeAssessment(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const key of ALLOWED_ASSESSMENT_FIELDS) {
    if (key in raw) out[key] = raw[key];
  }
  // Defensive: arrays of strings only.
  if (Array.isArray(out.supportingEvidence)) {
    out.supportingEvidence = out.supportingEvidence.filter((s) => typeof s === "string");
  }
  if (Array.isArray(out.concernFlags)) {
    out.concernFlags = out.concernFlags.filter((s) => typeof s === "string");
  }
  if (Array.isArray(out.missingEvidence)) {
    out.missingEvidence = out.missingEvidence.filter((s) => typeof s === "string");
  }
  return out;
}

function sanitizeConflict(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    conflictType: raw.conflictType || null,
    conflict: raw.conflict || null,
    agentsInConflict: Array.isArray(raw.agentsInConflict)
      ? raw.agentsInConflict.filter((s) => typeof s === "string")
      : [],
    cioInterpretation: raw.cioInterpretation || null,
    suggestedCalibrationCheck: raw.suggestedCalibrationCheck || null,
  };
}

function sanitizeCalibrationWatch(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    calibrationNeeded: !!raw.calibrationNeeded,
    calibrationReason: typeof raw.calibrationReason === "string" ? raw.calibrationReason : null,
    watchMetric:       typeof raw.watchMetric       === "string" ? raw.watchMetric : null,
    reviewAfter:       typeof raw.reviewAfter       === "string" ? raw.reviewAfter : null,
    clueFromHistory:   typeof raw.clueFromHistory   === "string" ? raw.clueFromHistory : null,
  };
}

// Tally usable assessments — at least one available stance means the
// tape carries real information. We never persist a snapshot whose
// assessments are 100% unavailable.
function countUsableAssessments(assessmentsByAgent) {
  let n = 0;
  for (const a of Object.values(assessmentsByAgent || {})) {
    if (a && a.stance && a.stance !== "unavailable") n++;
  }
  return n;
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Persist a sanitized snapshot of a Manager Assessment Tape result for
 * a single symbol. No-op (returns null) when the tape carries no
 * usable assessment.
 *
 * @param {object} input
 * @param {string} input.symbol
 * @param {object} input.tapeResult — output of buildManagerAssessmentTape
 * @param {string} [input.source="ad_hoc_simulation"]
 * @param {object|null} [input.historyOutcome]   { status: "..." }
 * @param {string|null} [input.notes]
 */
export function recordManagerAssessmentSnapshot(input = {}) {
  const sym = normalizeSymbol(input.symbol);
  if (!sym) return null;
  const tape = input.tapeResult || null;
  if (!tape || !Array.isArray(tape.assessments)) return null;

  // Re-key the assessments array by agentId + sanitize each in place.
  const assessmentsByAgent = {};
  for (const a of tape.assessments) {
    if (!a || !a.agentId) continue;
    const clean = sanitizeAssessment(a);
    if (clean) assessmentsByAgent[a.agentId] = clean;
  }

  // Skip when nothing usable was captured.
  if (countUsableAssessments(assessmentsByAgent) === 0) return null;

  const conflicts = Array.isArray(tape.managerConflicts)
    ? tape.managerConflicts.map(sanitizeConflict).filter(Boolean)
    : [];

  const record = {
    symbol: sym,
    updatedAt: Date.now(),
    source: typeof input.source === "string" && input.source ? input.source : "ad_hoc_simulation",
    assessments: assessmentsByAgent,
    managerConsensus: typeof tape.managerConsensus === "string" ? tape.managerConsensus : null,
    managerConflicts: conflicts,
    calibrationWatch: sanitizeCalibrationWatch(tape.calibrationWatch),
    historyOutcome: input.historyOutcome && typeof input.historyOutcome === "object"
      ? { status: typeof input.historyOutcome.status === "string" ? input.historyOutcome.status : null }
      : null,
    notes: typeof input.notes === "string" ? input.notes : null,
  };

  const records = loadAll();
  records[sym] = record;

  // Cap to MAX_RECORDS; evict oldest by updatedAt.
  const keys = Object.keys(records);
  if (keys.length > MAX_RECORDS) {
    const sorted = keys
      .map((k) => [k, records[k]?.updatedAt || 0])
      .sort((a, b) => a[1] - b[1]);                 // oldest first
    const toRemove = sorted.slice(0, keys.length - MAX_RECORDS);
    for (const [k] of toRemove) delete records[k];
  }
  flush(records);
  return record;
}

/** Get the latest snapshot for a single symbol; null when absent. */
export function getLatestManagerAssessmentSnapshot(rawSymbol) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym) return null;
  const records = loadAll();
  const rec = records[sym] || null;
  return rec ? cloneRecord(rec) : null;
}

/** All snapshots, newest first. */
export function listManagerAssessmentSnapshots() {
  const records = loadAll();
  return Object.values(records)
    .map(cloneRecord)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function deleteManagerAssessmentSnapshot(rawSymbol) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym) return false;
  const records = loadAll();
  if (!records[sym]) return false;
  delete records[sym];
  flush(records);
  return true;
}

export function clearManagerAssessmentMemory() { flush({}); }

/**
 * Bulk read for the leadership engine. Returns BOTH the
 * managerAssessmentsBySymbol map and the historyBySymbol map shaped to
 * what buildBasketLeadershipRead expects.
 *
 * @param {string[]} symbols
 * @returns {{
 *   managerAssessmentsBySymbol: Record<string, Record<string, object>>,
 *   historyBySymbol: Record<string, { outcome: { status: string } }>
 * }}
 */
export function getManagerAssessmentsBySymbols(symbols) {
  const out = { managerAssessmentsBySymbol: {}, historyBySymbol: {} };
  if (!Array.isArray(symbols)) return out;
  const records = loadAll();
  for (const raw of symbols) {
    const sym = normalizeSymbol(raw);
    if (!sym) continue;
    const rec = records[sym];
    if (!rec) continue;
    if (rec.assessments && typeof rec.assessments === "object") {
      out.managerAssessmentsBySymbol[sym] = cloneRecord(rec.assessments);
    }
    if (rec.historyOutcome && typeof rec.historyOutcome === "object") {
      out.historyBySymbol[sym] = { outcome: { ...(rec.historyOutcome || {}) } };
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function cloneRecord(r) {
  return JSON.parse(JSON.stringify(r));
}
