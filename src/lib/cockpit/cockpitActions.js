// =====================================================
// COCKPIT ACTIONS (Phase 4.7.4)
// =====================================================
// Per-user persistence for the four bottom-action-bar
// behaviors in OpportunityDetailPanel:
//
//   - Watch     → personal watch list (Set of symbols)
//   - Candidate → list of symbols promoted as trade candidates,
//                 each with a snapshot timestamp + summary fields
//   - Alert     → per-symbol price alert with target + direction
//   - Simulate  → in-memory only (per-symbol open/closed expansion);
//                 not persisted because it's a transient view
//
// Hard rules:
//   - Scoped by per-browser userId (same shape as capitalContext).
//   - PURE helpers; the React hook in useCockpitActions.js wraps
//     load/save with state.
//   - NEVER throws on storage errors; falls back to in-memory.
//   - NEVER logs symbol identifiers or alert targets to console.
//   - Does not mutate the discovery engine, alert history, or any
//     other shared store. These are personal preferences only.
// =====================================================

import { resolveUserId } from "../capital/capitalContext.js";

const WATCH_KEY      = "lethalBoard.watchList.";
const CANDIDATE_KEY  = "lethalBoard.candidates.";
const ALERT_KEY      = "lethalBoard.priceAlerts.";

// --------------------------------------------------
// LOW-LEVEL STORAGE HELPERS
// --------------------------------------------------

function readJson(key, fallback) {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch { return fallback; }
}

function writeJson(key, value) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* swallow — storage may be full / denied */ }
}

function userKey(prefix, userId) {
  return prefix + (userId || "anonymous");
}

// --------------------------------------------------
// WATCH LIST  (Set of symbols, persisted as array)
// --------------------------------------------------

export function loadWatchList(userId) {
  const id = userId || resolveUserId();
  const raw = readJson(userKey(WATCH_KEY, id), []);
  return Array.isArray(raw) ? raw.filter(s => typeof s === "string") : [];
}

export function isWatching(symbol, userId) {
  if (!symbol) return false;
  return loadWatchList(userId).includes(String(symbol).toUpperCase());
}

export function toggleWatch(symbol, userId) {
  if (!symbol) return loadWatchList(userId);
  const sym = String(symbol).toUpperCase();
  const id = userId || resolveUserId();
  const list = loadWatchList(id);
  const next = list.includes(sym) ? list.filter(s => s !== sym) : [...list, sym];
  writeJson(userKey(WATCH_KEY, id), next);
  return next;
}

// --------------------------------------------------
// CANDIDATES  (array of { symbol, promotedAt, score, action })
// --------------------------------------------------

export function loadCandidates(userId) {
  const id = userId || resolveUserId();
  const raw = readJson(userKey(CANDIDATE_KEY, id), []);
  return Array.isArray(raw) ? raw.filter(c => c && typeof c.symbol === "string") : [];
}

export function isCandidate(symbol, userId) {
  if (!symbol) return false;
  const sym = String(symbol).toUpperCase();
  return loadCandidates(userId).some(c => c.symbol === sym);
}

export function toggleCandidate(symbol, userId, snapshot = null) {
  if (!symbol) return loadCandidates(userId);
  const sym = String(symbol).toUpperCase();
  const id = userId || resolveUserId();
  const list = loadCandidates(id);
  const exists = list.some(c => c.symbol === sym);
  let next;
  if (exists) {
    next = list.filter(c => c.symbol !== sym);
  } else {
    // Whitelist a tiny snapshot — never store engine internals.
    const safeSnap = snapshot && typeof snapshot === "object" ? {
      score: snapshot.score ?? null,
      action: snapshot.action ?? null,
      capitalFit: snapshot.capitalFit ?? null,
    } : {};
    next = [...list, { symbol: sym, promotedAt: new Date().toISOString(), ...safeSnap }];
  }
  writeJson(userKey(CANDIDATE_KEY, id), next);
  return next;
}

// --------------------------------------------------
// PRICE ALERTS  (object: { [symbol]: { target, direction, createdAt } })
// --------------------------------------------------

export function loadPriceAlerts(userId) {
  const id = userId || resolveUserId();
  const raw = readJson(userKey(ALERT_KEY, id), {});
  return raw && typeof raw === "object" ? raw : {};
}

export function getPriceAlert(symbol, userId) {
  if (!symbol) return null;
  const sym = String(symbol).toUpperCase();
  const all = loadPriceAlerts(userId);
  return all[sym] || null;
}

/**
 * @param {string} symbol
 * @param {{ target: number, direction: "above"|"below" }} alert
 * @param {string} [userId]
 */
export function setPriceAlert(symbol, alert, userId) {
  if (!symbol || !alert) return loadPriceAlerts(userId);
  const sym = String(symbol).toUpperCase();
  const id = userId || resolveUserId();
  const target = Number(alert.target);
  if (!Number.isFinite(target) || target <= 0) return loadPriceAlerts(id);
  const direction = alert.direction === "below" ? "below" : "above";
  const all = loadPriceAlerts(id);
  const next = { ...all, [sym]: { target, direction, createdAt: new Date().toISOString() } };
  writeJson(userKey(ALERT_KEY, id), next);
  return next;
}

export function clearPriceAlert(symbol, userId) {
  if (!symbol) return loadPriceAlerts(userId);
  const sym = String(symbol).toUpperCase();
  const id = userId || resolveUserId();
  const all = loadPriceAlerts(id);
  if (!(sym in all)) return all;
  const next = { ...all };
  delete next[sym];
  writeJson(userKey(ALERT_KEY, id), next);
  return next;
}

// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

export const COCKPIT_ACTION_KEYS = Object.freeze({
  WATCH: WATCH_KEY,
  CANDIDATE: CANDIDATE_KEY,
  ALERT: ALERT_KEY,
});
