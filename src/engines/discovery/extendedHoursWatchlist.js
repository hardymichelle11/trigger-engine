// =====================================================
// EXTENDED-HOURS CURATED WATCHLIST (Phase 4.5A)
// =====================================================
// Builds a hybrid curated symbol list used by
// sessionAwareUniverse for premarket / postmarket / closed
// branches. Reads existing static data only — does not
// modify tickerCatalog.js or optionsWatchlist.js.
//
// Hard rules:
//   - Pure function. Same configuration → same output.
//   - Filters out cash-settled instruments (SPX, VIX) so
//     the universe contains only optionable, deliverable
//     names suitable for cash-secured put consideration.
//   - AI-infra names are surfaced first (tags: ai_core,
//     ai_adjacent, gpu, datacenter, hpc; or category "AI").
//   - Capped at a configurable limit (default 50).
// =====================================================

import { TICKER_CATALOG } from "../../tickerCatalog.js";
import { WATCHLIST_2026 } from "../../optionsWatchlist.js";

export const DEFAULT_CAP = 50;

// Cash-settled instruments cannot back a cash-secured put — exclude.
const CASH_SETTLED = new Set(["SPX", "VIX"]);

// Tags / categories that mark a symbol as AI-infrastructure adjacent.
const AI_TAGS = new Set([
  "ai_core",
  "ai_adjacent",
  "gpu",
  "datacenter",
  "hpc",
]);

// --------------------------------------------------
// PREDICATES
// --------------------------------------------------

function isCashSettled(symbol) {
  return CASH_SETTLED.has(String(symbol || "").toUpperCase());
}

function isEnabledCatalogEntry(entry) {
  return !!entry && entry.enabled !== false;
}

function isAiInfraEntry(entry) {
  if (!entry) return false;
  if (String(entry.category || "").toUpperCase() === "AI") return true;
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  return tags.some(t => AI_TAGS.has(String(t).toLowerCase()));
}

// --------------------------------------------------
// SOURCE COLLECTION
// --------------------------------------------------

function collectFromCatalog() {
  const out = [];
  for (const entry of TICKER_CATALOG) {
    if (!isEnabledCatalogEntry(entry)) continue;
    const sym = String(entry.symbol || "").toUpperCase();
    if (!sym || isCashSettled(sym)) continue;
    out.push({ symbol: sym, source: "catalog", aiInfra: isAiInfraEntry(entry) });
  }
  return out;
}

function collectFromWatchlist2026() {
  const out = [];
  for (const entry of WATCHLIST_2026 || []) {
    const sym = String(entry?.symbol || "").toUpperCase();
    if (!sym || isCashSettled(sym)) continue;
    // Exclude entries explicitly marked wheelSuit === "No" (cash-settled or
    // structurally unsuitable for cash-secured puts).
    if (String(entry.wheelSuit || "").toLowerCase() === "no") continue;
    out.push({ symbol: sym, source: "watchlist_2026", aiInfra: false });
  }
  return out;
}

// --------------------------------------------------
// PUBLIC: buildCuratedWatchlist
// --------------------------------------------------

/**
 * @typedef {object} CuratedWatchlistOptions
 * @property {number} [cap]                  default DEFAULT_CAP (50)
 * @property {boolean} [includeCatalog]       default true
 * @property {boolean} [includeWatchlist2026] default true
 * @property {string[]} [extraSymbols]        explicit additions
 */

/**
 * Build the curated symbol list for extended-hours / closed scans.
 *
 * @param {CuratedWatchlistOptions} [options]
 * @returns {{
 *   symbols: string[],
 *   metadata: {
 *     totalSourced: number,
 *     aiInfraCount: number,
 *     droppedCashSettled: string[],
 *     cap: number,
 *   }
 * }}
 */
export function buildCuratedWatchlist(options = {}) {
  const cap = Number.isFinite(Number(options?.cap)) && Number(options.cap) > 0
    ? Math.min(Math.floor(Number(options.cap)), 250)
    : DEFAULT_CAP;
  const includeCatalog = options?.includeCatalog !== false;
  const includeWatchlist2026 = options?.includeWatchlist2026 !== false;
  const extra = Array.isArray(options?.extraSymbols) ? options.extraSymbols : [];

  // Track AI-infra membership from the catalog (definitive source for tags).
  const aiSet = new Set();
  for (const entry of TICKER_CATALOG) {
    const sym = String(entry?.symbol || "").toUpperCase();
    if (isAiInfraEntry(entry) && sym) aiSet.add(sym);
  }

  // Pre-populate dropped list from any cash-settled entries we know about
  // in the data sources we'd be reading. They are filtered before reaching
  // add() below, so we record them here for visibility.
  const dropped = [];
  for (const e of TICKER_CATALOG) {
    const sym = String(e?.symbol || "").toUpperCase();
    if (sym && isCashSettled(sym) && !dropped.includes(sym)) dropped.push(sym);
  }
  for (const e of WATCHLIST_2026 || []) {
    const sym = String(e?.symbol || "").toUpperCase();
    if (sym && isCashSettled(sym) && !dropped.includes(sym)) dropped.push(sym);
  }

  const seen = new Set();
  const collected = [];

  function add(sym, source) {
    const s = String(sym || "").toUpperCase().trim();
    if (!s) return;
    if (isCashSettled(s)) {
      if (!dropped.includes(s)) dropped.push(s);
      return;
    }
    if (seen.has(s)) return;
    seen.add(s);
    collected.push({ symbol: s, source, aiInfra: aiSet.has(s) });
  }

  if (includeCatalog) {
    for (const e of collectFromCatalog()) add(e.symbol, e.source);
  }
  if (includeWatchlist2026) {
    for (const e of collectFromWatchlist2026()) add(e.symbol, e.source);
  }
  for (const s of extra) add(s, "extra");

  // Surface AI-infra first; preserve insertion order otherwise.
  collected.sort((a, b) => {
    if (a.aiInfra && !b.aiInfra) return -1;
    if (!a.aiInfra && b.aiInfra) return 1;
    return 0;
  });

  const capped = collected.slice(0, cap);

  return {
    symbols: capped.map(e => e.symbol),
    metadata: {
      totalSourced: collected.length,
      aiInfraCount: capped.filter(e => e.aiInfra).length,
      droppedCashSettled: dropped,
      cap,
    },
  };
}

/**
 * Convenience: just the symbol list with default options.
 * @returns {string[]}
 */
export function getCuratedSymbols() {
  return buildCuratedWatchlist().symbols;
}
