// =====================================================================
// Ticker Search Workflow
// =====================================================================
// Helpers for the redesigned operator workspace search flow:
//   - normalize a typed ticker
//   - record the symbol into the operator's "active research" list
//   - persist that list in localStorage so it survives page reloads
//
// localStorage-backed with overridable backend for tests. Mirrors the
// agentMemoryStore / basketUniverseManager corruption-tolerance pattern.
// =====================================================================

import { normalizeSymbol } from "../portfolioCio/basketAgentTypes.js";

const STORAGE_KEY = "te.workspace.activeResearch.v1";
const MAX_ACTIVE_TICKERS = 24;

let memoryCache = null;

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
export function setActiveResearchBackend(b) { backend = b; memoryCache = null; }
export function resetActiveResearchBackend() { backend = null; memoryCache = null; }

// ---------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------

/**
 * Normalize a typed ticker. Returns the uppercase, trimmed symbol or
 * null when the input is not a valid ticker pattern.
 */
export function normalizeTickerInput(raw) {
  return normalizeSymbol(raw);
}

/**
 * Run the operator-search workflow:
 *   - normalize input
 *   - if invalid, return { ok: false, reason }
 *   - prepend symbol to the active research list (most-recent first)
 *   - dedupe; cap at MAX_ACTIVE_TICKERS
 *   - persist to backend
 *   - return { ok: true, symbol, activeTickers }
 *
 * This routine is the single entry point used by the workspace search
 * box. It does NOT call any engine — the rest of the chrome reads the
 * persisted symbol and pulls its data on render.
 *
 * @param {string} raw
 * @returns {{ ok: boolean, symbol?: string, activeTickers?: string[], reason?: string }}
 */
export function runTickerSearch(raw) {
  const symbol = normalizeSymbol(raw);
  if (!symbol) return { ok: false, reason: "invalid_ticker" };
  const list = loadList();
  const next = [symbol, ...list.filter((s) => s !== symbol)].slice(0, MAX_ACTIVE_TICKERS);
  flushList(next);
  return { ok: true, symbol, activeTickers: next };
}

/** Most-recent-first list of active research tickers. */
export function listActiveResearchTickers() {
  return loadList().slice();
}

/** Remove a ticker from the active research list. */
export function removeActiveResearchTicker(raw) {
  const symbol = normalizeSymbol(raw);
  if (!symbol) return false;
  const list = loadList();
  const next = list.filter((s) => s !== symbol);
  if (next.length === list.length) return false;
  flushList(next);
  return true;
}

/** Wipe the active research list (operator action). */
export function clearActiveResearch() { flushList([]); }

// ---------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------

function loadList() {
  if (memoryCache && Array.isArray(memoryCache)) return memoryCache;
  const b = getBackend();
  if (!b || !b.getItem) { memoryCache = []; return memoryCache; }
  try {
    const raw = b.getItem(STORAGE_KEY);
    if (!raw) { memoryCache = []; return memoryCache; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) { memoryCache = []; return memoryCache; }
    memoryCache = parsed
      .map((s) => normalizeSymbol(s))
      .filter(Boolean)
      .slice(0, MAX_ACTIVE_TICKERS);
  } catch {
    memoryCache = [];
  }
  return memoryCache;
}

function flushList(list) {
  memoryCache = Array.isArray(list) ? list.slice() : [];
  const b = getBackend();
  if (!b || !b.setItem) return;
  try {
    b.setItem(STORAGE_KEY, JSON.stringify(memoryCache));
  } catch { /* tolerate quota / disabled storage */ }
}
