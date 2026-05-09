// =====================================================================
// Resolve Ticker Universe — single source of truth for "what is this
// ticker, and where did it come from?"
// =====================================================================
// Given a raw symbol, returns a TickerRecord that merges the static
// catalog (existing watchlist + setup registry) with the dynamic store.
// Source priority:
//   STATIC_CATALOG > DYNAMIC_BASKET > LETHAL_BOARD_PROSPECT > AD_HOC_SIMULATION
//
// Hard rules:
//   - Always returns a record. An uncataloged symbol resolves to a
//     synthetic AD_HOC_SIMULATION record with engineEligibility set
//     for TE (always allowed) and CV gated on options data.
//   - Never mutates the static catalog.
//   - Pure (apart from reading the dynamic store and the watchlist).
// =====================================================================

import {
  TICKER_SOURCE_TYPES,
  CATALOG_STATUS,
  SOURCE_PRIORITY,
  normalizeSymbol,
  makeTickerRecord,
} from "./tickerUniverseTypes.js";
import { getDynamicTicker } from "./dynamicUniverseStore.js";
import { getWatchlistEntry, isInScanUniverse } from "../../optionsWatchlist.js";

/**
 * Resolve a single symbol to its canonical TickerRecord.
 *
 * @param {string} rawSymbol
 * @returns {import("./tickerUniverseTypes.js").TickerRecord}
 */
export function resolveTickerUniverse(rawSymbol) {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) {
    return makeTickerRecord({
      symbol: rawSymbol == null ? "" : String(rawSymbol),
      sourceType: TICKER_SOURCE_TYPES.AD_HOC_SIMULATION,
      catalogStatus: CATALOG_STATUS.UNCATALOGED,
      engineEligibility: { triggerEngine: false, creditView: false, lethalBoard: false },
    });
  }

  const catalogEntry = safeWatchlistEntry(symbol);
  const dynamic = getDynamicTicker(symbol);

  // Build the appearance list from both sources.
  const appearances = [];
  if (catalogEntry) {
    appearances.push({
      sourceType: TICKER_SOURCE_TYPES.STATIC_CATALOG,
      addedAt: catalogEntry.addedAt || 0,
    });
  }
  for (const ap of (dynamic?.appearances || [])) {
    if (ap && ap.sourceType && !appearances.some((a) => a.sourceType === ap.sourceType)) {
      appearances.push(ap);
    }
  }
  // Deduplicate, keep highest priority canonical.
  const sourceType = pickHighestPriority(appearances);

  // Engine eligibility: TE is allowed for any valid symbol (it can run
  // ad-hoc on Polygon data); CV needs options data; LB requires the
  // discovery surface to know about the symbol.
  const engineEligibility = {
    triggerEngine: true,
    creditView: !!catalogEntry || !!dynamic?.engineEligibility?.creditView,
    lethalBoard: !!catalogEntry || sourceType === TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT,
  };

  // Data availability: assume the catalog implies a known-good Polygon
  // symbol; for purely dynamic entries we trust whatever the store said.
  const dataAvailability = {
    polygonQuote: dynamic?.dataAvailability?.polygonQuote ?? !!catalogEntry,
    polygonBars:  dynamic?.dataAvailability?.polygonBars  ?? !!catalogEntry,
    optionsChain: dynamic?.dataAvailability?.optionsChain ?? !!catalogEntry,
    news:         dynamic?.dataAvailability?.news         ?? !!catalogEntry,
  };

  if (catalogEntry) {
    return {
      symbol,
      sourceType,
      catalogStatus: CATALOG_STATUS.CATALOGED,
      promoted: dynamic?.promoted === true,
      scannerEligible: dynamic?.scannerEligible === true || isInScanUniverse(symbol),
      basketTags: dynamic?.basketTags || [],
      addedAt: dynamic?.addedAt || 0,
      addedReason: dynamic?.addedReason || "static_catalog",
      lastSimulatedAt: dynamic?.lastSimulatedAt || null,
      notes: dynamic?.notes || null,
      engineEligibility,
      dataAvailability,
      appearances,
      // Pass-through provenance from the catalog so the UI can show
      // tier / spreadQuality / wheelSuit alongside the universe info.
      catalogMeta: {
        tier: catalogEntry.tier ?? null,
        spreadQuality: catalogEntry.spreadQuality ?? null,
        wheelSuit: catalogEntry.wheelSuit ?? null,
        assetType: catalogEntry.assetType ?? null,
      },
    };
  }

  // No catalog entry — return either the dynamic record or a synthetic
  // ad-hoc record for first-time analysis.
  if (dynamic) {
    return {
      ...dynamic,
      symbol,
      sourceType,
      catalogStatus: dynamic.catalogStatus || CATALOG_STATUS.UNCATALOGED,
      engineEligibility,
      dataAvailability,
      appearances,
      catalogMeta: null,
    };
  }

  return makeTickerRecord({
    symbol,
    sourceType: TICKER_SOURCE_TYPES.AD_HOC_SIMULATION,
    catalogStatus: CATALOG_STATUS.UNCATALOGED,
    engineEligibility,
    dataAvailability,
    appearances: [{
      sourceType: TICKER_SOURCE_TYPES.AD_HOC_SIMULATION,
      addedAt: 0,
    }],
    catalogMeta: null,
  });
}

/** Resolve a list of symbols, deduped + normalized. */
export function resolveTickerUniverseBatch(rawSymbols) {
  if (!Array.isArray(rawSymbols)) return [];
  const seen = new Set();
  const out = [];
  for (const r of rawSymbols) {
    const sym = normalizeSymbol(r);
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    out.push(resolveTickerUniverse(sym));
  }
  return out;
}

/**
 * Quick boolean: is this ticker in the static catalog?
 * Existing call sites that read `isInScanUniverse` keep working.
 */
export function isCatalogTicker(rawSymbol) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym) return false;
  return !!safeWatchlistEntry(sym);
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function safeWatchlistEntry(symbol) {
  try {
    return getWatchlistEntry(symbol) || null;
  } catch {
    return null;
  }
}

function pickHighestPriority(appearances) {
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
