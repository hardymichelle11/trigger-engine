// =====================================================================
// Ticker Universe — types + enums
// =====================================================================
// The universe layer separates symbols by their source so TE / CV / LB
// can analyze any valid Polygon ticker without requiring it to live in
// the static catalog. This file is PURE constants — no I/O, no React.
//
//   STATIC_CATALOG        — trusted core universe (existing watchlist /
//                           setup registry). Source of truth for premium
//                           assumptions, wheel suit, spread quality.
//   DYNAMIC_BASKET        — operator-managed opportunity universe.
//                           Persisted in localStorage; promotable to
//                           scanner.
//   AD_HOC_SIMULATION     — temporary research layer. A symbol typed in
//                           the search box that is not in the catalog.
//                           Always available for one-shot analysis.
//   LETHAL_BOARD_PROSPECT — surfaces from LB discovery that haven't been
//                           promoted yet.
//
// Resolution priority when a symbol exists in multiple sources:
//   STATIC_CATALOG > DYNAMIC_BASKET > LETHAL_BOARD_PROSPECT > AD_HOC_SIMULATION
// =====================================================================

export const TICKER_SOURCE_TYPES = Object.freeze({
  STATIC_CATALOG:            "static_catalog",
  DYNAMIC_BASKET:            "dynamic_basket",
  AD_HOC_SIMULATION:         "ad_hoc_simulation",
  LETHAL_BOARD_PROSPECT:     "lethal_board_prospect",
  CIO_BASKET_ACTIVE_UNIVERSE:"cio_basket_active_universe",
});

export const CATALOG_STATUS = Object.freeze({
  CATALOGED:   "cataloged",
  UNCATALOGED: "uncataloged",
  PROMOTED:    "promoted",
  PROSPECT:    "prospect",
});

export const ANALYSIS_MODES = Object.freeze({
  CATALOG_PROFILE:           "catalog_profile",
  AD_HOC_TE_SIMULATION:      "ad_hoc_te_simulation",
  AD_HOC_CREDIT_SIMULATION:  "ad_hoc_credit_simulation",
  LIMITED_CREDIT_VIEW:       "limited_credit_view",
  DYNAMIC_BASKET_SCAN:       "dynamic_basket_scan",
});

// Numeric priority — higher beats lower when a symbol is registered in
// multiple source types. The resolver picks the highest-priority source
// for the canonical record but keeps the others on the `appearances`
// list so the UI can show full provenance.
export const SOURCE_PRIORITY = Object.freeze({
  [TICKER_SOURCE_TYPES.STATIC_CATALOG]:             4,
  [TICKER_SOURCE_TYPES.DYNAMIC_BASKET]:             3,
  [TICKER_SOURCE_TYPES.CIO_BASKET_ACTIVE_UNIVERSE]: 3,  // co-equal with DYNAMIC_BASKET
  [TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT]:      2,
  [TICKER_SOURCE_TYPES.AD_HOC_SIMULATION]:          1,
});

// Symbol normalization — used by every store/resolver so "  aapl  " and
// "AAPL" hit the same record. Keep this strict and predictable: trim,
// uppercase, strip whitespace, drop trailing punctuation. Reject empty
// and non-string inputs.
export function normalizeSymbol(raw) {
  if (raw == null) return null;
  if (typeof raw !== "string") {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      raw = String(raw);
    } else {
      return null;
    }
  }
  const trimmed = raw.trim().replace(/\s+/g, "").replace(/[.,;:]+$/g, "").toUpperCase();
  if (trimmed.length === 0) return null;
  // Polygon symbols accept alpha + a few punctuation marks (BRK.B, BF.B).
  // Reject anything that's clearly not a ticker (numbers only, weird chars).
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * @typedef {Object} TickerRecord
 * @property {string} symbol
 * @property {string} sourceType                       one of TICKER_SOURCE_TYPES
 * @property {string} catalogStatus                    one of CATALOG_STATUS
 * @property {boolean} promoted
 * @property {boolean} scannerEligible
 * @property {string[]} basketTags
 * @property {number} addedAt                          epoch ms
 * @property {string|null} addedReason
 * @property {number|null} lastSimulatedAt             epoch ms
 * @property {string|null} notes
 * @property {Object} engineEligibility
 * @property {boolean} engineEligibility.triggerEngine
 * @property {boolean} engineEligibility.creditView
 * @property {boolean} engineEligibility.lethalBoard
 * @property {Object} dataAvailability
 * @property {boolean} dataAvailability.polygonQuote
 * @property {boolean} dataAvailability.polygonBars
 * @property {boolean} dataAvailability.optionsChain
 * @property {boolean} dataAvailability.news
 * @property {Array<{ sourceType: string, addedAt: number }>} [appearances]
 */

/**
 * Build a fresh TickerRecord with sensible defaults. Callers override
 * the fields they actually know — never use this output as the final
 * record without overlaying real provenance.
 */
export function makeTickerRecord(overrides = {}) {
  return {
    symbol: null,
    sourceType: TICKER_SOURCE_TYPES.AD_HOC_SIMULATION,
    catalogStatus: CATALOG_STATUS.UNCATALOGED,
    promoted: false,
    scannerEligible: false,
    basketTags: [],
    addedAt: Date.now(),
    addedReason: null,
    lastSimulatedAt: null,
    notes: null,
    engineEligibility: {
      triggerEngine: true,
      creditView: false,
      lethalBoard: false,
    },
    dataAvailability: {
      polygonQuote: false,
      polygonBars: false,
      optionsChain: false,
      news: false,
    },
    appearances: [],
    catalogMeta: null,
    ...overrides,
  };
}
