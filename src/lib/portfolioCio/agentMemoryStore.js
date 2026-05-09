// =====================================================================
// Agent Memory Store
// =====================================================================
// localStorage-backed CRUD for the Market Intelligence Inbox. Each
// record is a structured intelligence item (the operator's thesis +
// extracted entities + risks + catalysts) attached to a basket and an
// assigned agent. Mirrors the basketUniverseManager pattern:
// corruption tolerant, backend-overridable for tests, idempotent
// public mutators that no-op on bad input.
//
// Lifecycle (status transitions are operator-driven — never automatic):
//   draft   →  approved_temporary  (one-scan use, expires)
//   draft   →  approved_memory     (permanent, agent reads it)
//   any     →  archived
//
// Hard rules:
//   - Memory enriches; it never overrides Credit View risk flags,
//     Trigger Engine technical posture, or capital fit constraints.
//   - Trader-facing copy only inside intelligence items. No raw
//     scores / weights / coefficients.
//   - Promoting to memory requires approvedByUser = true.
// =====================================================================

const STORAGE_KEY = "te.agent.memory.v1";
let memoryCache = null;

// ---------------------------------------------------------------------
// Status enum
// ---------------------------------------------------------------------

export const INTELLIGENCE_STATUS = Object.freeze({
  DRAFT:               "draft",
  APPROVED_TEMPORARY:  "approved_temporary",
  APPROVED_MEMORY:     "approved_memory",
  ARCHIVED:            "archived",
});

export const SOURCE_TYPE = Object.freeze({
  USER_DOCUMENT: "user_document",
  USER_NOTES:    "user_notes",
  EXTERNAL_URL:  "external_url",
  IMPORTED_NEWS: "imported_news",
});

export const CONFIDENCE = Object.freeze({
  USER_THESIS:   "user_thesis",
  EXTERNAL:      "external_source",
  MIXED:         "mixed",
});

export const USE_AS = Object.freeze({
  THESIS_MEMORY:        "thesis_memory",
  CATALYST_WATCH:       "catalyst_watch",
  COMPETITOR_MAP:       "competitor_map",
  RISK_FRAMEWORK:       "risk_framework",
  SCANNER_RULE_SEED:    "scanner_rule_seed",
  TEMPORARY_RESEARCH:   "temporary_research_only",
});

// Default expiry for temporary research — operator-driven; tests can
// override by passing expiresAt explicitly to saveIntelligenceDraft.
const TEMPORARY_RESEARCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days

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
export function setMemoryBackend(b) { backend = b; memoryCache = null; }
export function resetMemoryBackend() { backend = null; memoryCache = null; }

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

// ---------------------------------------------------------------------
// Public read helpers
// ---------------------------------------------------------------------

/** All intelligence items (excluding archived by default). */
export function listIntelligenceItems(opts = {}) {
  const includeArchived = !!opts.includeArchived;
  const items = loadAll();
  const out = items
    .filter((it) => includeArchived || it.status !== INTELLIGENCE_STATUS.ARCHIVED)
    .map(clone);
  // Newest first.
  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return out;
}

/** Single item by id, or null. */
export function getIntelligenceItem(id) {
  if (typeof id !== "string" || !id) return null;
  const items = loadAll();
  const found = items.find((it) => it && it.id === id);
  return found ? clone(found) : null;
}

/**
 * Approved, non-expired memory for the given assigned agent. Filters
 * out drafts, archived items, and approved_temporary items past their
 * expiresAt. Returns newest-first.
 */
export function getAgentMemory(agentId) {
  if (typeof agentId !== "string" || !agentId) return [];
  const now = Date.now();
  return loadAll()
    .filter((it) =>
      it &&
      it.assignedAgent === agentId &&
      isStillValid(it, now),
    )
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(clone);
}

/** Same filter as getAgentMemory but keyed by basket. */
export function getBasketMemory(basketId) {
  if (typeof basketId !== "string" || !basketId) return [];
  const now = Date.now();
  return loadAll()
    .filter((it) =>
      it &&
      it.basketId === basketId &&
      isStillValid(it, now),
    )
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(clone);
}

// ---------------------------------------------------------------------
// Public mutators
// ---------------------------------------------------------------------

/**
 * Save an intelligence draft (or update an existing draft if `id` is
 * supplied). Returns the stored record (cloned).
 */
export function saveIntelligenceDraft(input = {}) {
  const sanitized = sanitizeIntelligenceInput(input);
  if (!sanitized) return null;

  const items = loadAll();
  const existingIdx = sanitized.id
    ? items.findIndex((it) => it && it.id === sanitized.id)
    : -1;

  if (existingIdx >= 0) {
    // Preserve immutable fields (createdAt / id / status if not draft).
    const prev = items[existingIdx];
    const merged = {
      ...prev,
      ...sanitized,
      id: prev.id,
      createdAt: prev.createdAt,
      // Keep the previous status unless caller explicitly downgraded
      // back to draft (allowed if operator wants to re-edit).
      status: sanitized.status === INTELLIGENCE_STATUS.DRAFT
        ? INTELLIGENCE_STATUS.DRAFT
        : prev.status,
      updatedAt: Date.now(),
    };
    items[existingIdx] = merged;
    flush(items);
    return clone(merged);
  }

  const record = {
    id: sanitized.id || makeId(),
    sourceType: sanitized.sourceType || SOURCE_TYPE.USER_NOTES,
    title: sanitized.title || "Untitled intelligence",
    basketId: sanitized.basketId || null,
    assignedAgent: sanitized.assignedAgent || null,
    confidence: sanitized.confidence || CONFIDENCE.USER_THESIS,
    status: sanitized.status || INTELLIGENCE_STATUS.DRAFT,
    useAs: Array.isArray(sanitized.useAs) ? sanitized.useAs.slice() : [],
    rawTextExcerpt: sanitized.rawTextExcerpt || null,
    entities: sanitized.entities || { primarySymbols: [], relatedSymbols: [], privateCompanies: [] },
    thesis: sanitized.thesis || { coreClaim: null, marketFrame: null, companyRole: null, basketRole: null },
    risks: Array.isArray(sanitized.risks) ? sanitized.risks.slice() : [],
    catalysts: Array.isArray(sanitized.catalysts) ? sanitized.catalysts.slice() : [],
    scannerTags: Array.isArray(sanitized.scannerTags) ? sanitized.scannerTags.slice() : [],
    approvedByUser: !!sanitized.approvedByUser,
    expiresAt: typeof sanitized.expiresAt === "number" ? sanitized.expiresAt : null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  items.push(record);
  flush(items);
  return clone(record);
}

/**
 * Approve a draft for one-scan-only use. The item gets status
 * approved_temporary and an `expiresAt` (default 7 days). Returns the
 * updated record or null if not found.
 */
export function approveIntelligenceItem(id, opts = {}) {
  return mutate(id, (rec) => {
    rec.status = INTELLIGENCE_STATUS.APPROVED_TEMPORARY;
    rec.approvedByUser = true;
    rec.expiresAt = typeof opts.expiresAt === "number"
      ? opts.expiresAt
      : Date.now() + TEMPORARY_RESEARCH_TTL_MS;
  });
}

/**
 * Promote a draft (or temporary approval) into permanent agent memory.
 * Sets approvedByUser = true and clears expiresAt.
 */
export function promoteToAgentMemory(id) {
  return mutate(id, (rec) => {
    rec.status = INTELLIGENCE_STATUS.APPROVED_MEMORY;
    rec.approvedByUser = true;
    rec.expiresAt = null;
  });
}

/** Archive an intelligence item. The agent stops reading it. */
export function archiveIntelligenceItem(id) {
  return mutate(id, (rec) => {
    rec.status = INTELLIGENCE_STATUS.ARCHIVED;
  });
}

/** Delete an item outright (operator action). */
export function deleteIntelligenceItem(id) {
  if (typeof id !== "string" || !id) return false;
  const items = loadAll();
  const idx = items.findIndex((it) => it && it.id === id);
  if (idx < 0) return false;
  items.splice(idx, 1);
  flush(items);
  return true;
}

/** Wipe the whole intelligence store (operator action). */
export function clearAllIntelligence() { flush([]); }

// ---------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------

function mutate(id, mutator) {
  if (typeof id !== "string" || !id || typeof mutator !== "function") return null;
  const items = loadAll();
  const idx = items.findIndex((it) => it && it.id === id);
  if (idx < 0) return null;
  const next = clone(items[idx]);
  mutator(next);
  next.updatedAt = Date.now();
  items[idx] = next;
  flush(items);
  return clone(next);
}

function isStillValid(it, now) {
  if (!it) return false;
  if (it.status === INTELLIGENCE_STATUS.ARCHIVED) return false;
  if (it.status === INTELLIGENCE_STATUS.DRAFT)    return false;
  if (it.status === INTELLIGENCE_STATUS.APPROVED_TEMPORARY) {
    if (typeof it.expiresAt === "number" && it.expiresAt <= now) return false;
  }
  return true;
}

function sanitizeIntelligenceInput(input) {
  if (!input || typeof input !== "object") return null;
  const out = {};
  if (typeof input.id === "string")            out.id = input.id;
  if (typeof input.sourceType === "string")    out.sourceType = input.sourceType;
  if (typeof input.title === "string")         out.title = input.title.trim().slice(0, 200);
  if (typeof input.basketId === "string")      out.basketId = input.basketId;
  if (typeof input.assignedAgent === "string") out.assignedAgent = input.assignedAgent;
  if (typeof input.confidence === "string")    out.confidence = input.confidence;
  if (typeof input.status === "string")        out.status = input.status;
  if (typeof input.rawTextExcerpt === "string") out.rawTextExcerpt = input.rawTextExcerpt.slice(0, 600);
  if (Array.isArray(input.useAs))              out.useAs = input.useAs.filter(Boolean).slice(0, 12);
  if (typeof input.expiresAt === "number")     out.expiresAt = input.expiresAt;
  if (typeof input.approvedByUser === "boolean") out.approvedByUser = input.approvedByUser;

  if (input.entities && typeof input.entities === "object") {
    out.entities = {
      primarySymbols:  arrStrings(input.entities.primarySymbols),
      relatedSymbols:  arrStrings(input.entities.relatedSymbols),
      privateCompanies: arrStrings(input.entities.privateCompanies),
    };
  }
  if (input.thesis && typeof input.thesis === "object") {
    out.thesis = {
      coreClaim:   typeof input.thesis.coreClaim === "string"   ? input.thesis.coreClaim   : null,
      marketFrame: typeof input.thesis.marketFrame === "string" ? input.thesis.marketFrame : null,
      companyRole: typeof input.thesis.companyRole === "string" ? input.thesis.companyRole : null,
      basketRole:  typeof input.thesis.basketRole === "string"  ? input.thesis.basketRole  : null,
    };
  }
  if (Array.isArray(input.risks))         out.risks = arrStrings(input.risks);
  if (Array.isArray(input.catalysts))     out.catalysts = arrStrings(input.catalysts);
  if (Array.isArray(input.scannerTags))   out.scannerTags = arrStrings(input.scannerTags);
  return out;
}

function arrStrings(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();
  for (const v of input) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.slice(0, 64);
}

function makeId() {
  // Sortable id: timestamp + small random suffix. Deterministic shape,
  // not crypto-grade. Operator-only state so the collision risk is OK.
  const ts = Date.now().toString(36);
  const rnd = Math.floor(Math.random() * 0x10000).toString(36);
  return `intel_${ts}_${rnd}`;
}

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}
