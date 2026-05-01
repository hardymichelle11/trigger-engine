// =====================================================
// BUNDLE CLASSIFIER
// =====================================================
// Map a symbol to one or more thematic bundles.
//
// Resolution order:
//   1. Explicit BUNDLE_MAP entry (works for uncataloged symbols too)
//   2. Tag-based enrichment from tickerCatalog (when present)
//   3. Sector/industry hints supplied by caller
//   4. Fallback to ["unknown"]
//
// A stock can belong to multiple bundles. Order in the
// returned bundles[] array reflects descending relevance,
// and bundles[0] is exposed as `primaryBundle`.
// =====================================================

import { BUNDLE, CATALOG_STATUS } from "./types.js";
import { TICKER_CATALOG } from "../../tickerCatalog.js";

// --------------------------------------------------
// EXPLICIT SYMBOL → BUNDLES MAP
// Covers known names in the trigger-engine universe
// plus several uncataloged adjacencies (e.g. NEE).
// Order matters: first bundle is the primary.
// --------------------------------------------------

const BUNDLE_MAP = Object.freeze({
  // AI infrastructure / datacenter
  NVDA: [BUNDLE.SEMICONDUCTORS, BUNDLE.AI_INFRASTRUCTURE],
  AMD:  [BUNDLE.SEMICONDUCTORS, BUNDLE.AI_INFRASTRUCTURE],
  SMCI: [BUNDLE.AI_INFRASTRUCTURE, BUNDLE.DATACENTER_POWER],
  NBIS: [BUNDLE.AI_INFRASTRUCTURE, BUNDLE.DATACENTER_POWER],
  NEBX: [BUNDLE.AI_INFRASTRUCTURE],
  CRWV: [BUNDLE.AI_INFRASTRUCTURE, BUNDLE.DATACENTER_POWER],
  CORZ: [BUNDLE.AI_INFRASTRUCTURE, BUNDLE.CRYPTO_BETA, BUNDLE.DATACENTER_POWER],
  IREN: [BUNDLE.AI_INFRASTRUCTURE, BUNDLE.CRYPTO_BETA, BUNDLE.DATACENTER_POWER],
  PLTR: [BUNDLE.AI_INFRASTRUCTURE],

  // Cloud hyperscalers
  MSFT:  [BUNDLE.CLOUD_HYPERSCALERS, BUNDLE.AI_INFRASTRUCTURE],
  GOOG:  [BUNDLE.CLOUD_HYPERSCALERS, BUNDLE.AI_INFRASTRUCTURE],
  GOOGL: [BUNDLE.CLOUD_HYPERSCALERS, BUNDLE.AI_INFRASTRUCTURE],
  AMZN:  [BUNDLE.CLOUD_HYPERSCALERS, BUNDLE.AI_INFRASTRUCTURE],
  META:  [BUNDLE.CLOUD_HYPERSCALERS, BUNDLE.AI_INFRASTRUCTURE],

  // Datacenter / power / grid
  VRT:  [BUNDLE.AI_INFRASTRUCTURE, BUNDLE.DATACENTER_POWER],
  ETN:  [BUNDLE.DATACENTER_POWER, BUNDLE.ENERGY_GRID],
  POWL: [BUNDLE.DATACENTER_POWER, BUNDLE.ENERGY_GRID],
  BE:   [BUNDLE.AI_INFRASTRUCTURE, BUNDLE.DATACENTER_POWER, BUNDLE.ENERGY_GRID],
  CEG:  [BUNDLE.DATACENTER_POWER, BUNDLE.ENERGY_GRID, BUNDLE.DEFENSIVE_DIVIDEND],
  GEV:  [BUNDLE.DATACENTER_POWER, BUNDLE.ENERGY_GRID],
  NEE:  [BUNDLE.DATACENTER_POWER, BUNDLE.ENERGY_GRID, BUNDLE.DEFENSIVE_DIVIDEND],
  BAM:  [BUNDLE.DATACENTER_POWER, BUNDLE.FINANCIALS_CREDIT],
  BEPC: [BUNDLE.DATACENTER_POWER, BUNDLE.ENERGY_GRID, BUNDLE.DEFENSIVE_DIVIDEND],

  // Energy
  OXY: [BUNDLE.ENERGY_GRID],
  XLE: [BUNDLE.ENERGY_GRID, BUNDLE.BROAD_MARKET_ETF],

  // Crypto-beta vehicles
  COIN: [BUNDLE.CRYPTO_BETA],
  MSTR: [BUNDLE.CRYPTO_BETA],
  BTDR: [BUNDLE.CRYPTO_BETA, BUNDLE.AI_INFRASTRUCTURE],

  // Financials / credit
  BX:   [BUNDLE.FINANCIALS_CREDIT],
  APO:  [BUNDLE.FINANCIALS_CREDIT],
  ARCC: [BUNDLE.FINANCIALS_CREDIT, BUNDLE.DEFENSIVE_DIVIDEND],
  OWL:  [BUNDLE.FINANCIALS_CREDIT],
  OBDC: [BUNDLE.FINANCIALS_CREDIT, BUNDLE.DEFENSIVE_DIVIDEND],
  HOOD: [BUNDLE.FINANCIALS_CREDIT, BUNDLE.CONSUMER_MOMENTUM],
  XLF:  [BUNDLE.FINANCIALS_CREDIT, BUNDLE.BROAD_MARKET_ETF],
  HYG:  [BUNDLE.FINANCIALS_CREDIT, BUNDLE.BROAD_MARKET_ETF],
  KRE:  [BUNDLE.FINANCIALS_CREDIT, BUNDLE.BROAD_MARKET_ETF],
  LQD:  [BUNDLE.FINANCIALS_CREDIT, BUNDLE.BROAD_MARKET_ETF],

  // Defensive / income
  JEPI: [BUNDLE.DEFENSIVE_DIVIDEND, BUNDLE.BROAD_MARKET_ETF],
  JEPQ: [BUNDLE.DEFENSIVE_DIVIDEND, BUNDLE.BROAD_MARKET_ETF],

  // Consumer / megacap
  AAPL: [BUNDLE.CONSUMER_MOMENTUM, BUNDLE.CLOUD_HYPERSCALERS],
  TSLA: [BUNDLE.CONSUMER_MOMENTUM, BUNDLE.AI_INFRASTRUCTURE],

  // Broad index / commodity ETFs
  SPY:  [BUNDLE.BROAD_MARKET_ETF],
  QQQ:  [BUNDLE.BROAD_MARKET_ETF, BUNDLE.AI_INFRASTRUCTURE],
  QQQM: [BUNDLE.BROAD_MARKET_ETF, BUNDLE.AI_INFRASTRUCTURE],
  SPX:  [BUNDLE.BROAD_MARKET_ETF],
  IWM:  [BUNDLE.BROAD_MARKET_ETF],
  VIX:  [BUNDLE.BROAD_MARKET_ETF],
  TLT:  [BUNDLE.BROAD_MARKET_ETF],
  SLV:  [BUNDLE.BROAD_MARKET_ETF],
  GLD:  [BUNDLE.BROAD_MARKET_ETF],
  FXI:  [BUNDLE.BROAD_MARKET_ETF],
});

// --------------------------------------------------
// CONCENTRATION TAGS — coarse theme groupings derived
// from bundles. Used by the ranker to detect crowded
// books at a higher level than bundles.
// --------------------------------------------------

const BUNDLE_TO_CONCENTRATION = Object.freeze({
  [BUNDLE.AI_INFRASTRUCTURE]:  "AI_THEME",
  [BUNDLE.SEMICONDUCTORS]:     "AI_THEME",
  [BUNDLE.DATACENTER_POWER]:   "AI_THEME",
  [BUNDLE.CLOUD_HYPERSCALERS]: "AI_THEME",
  [BUNDLE.ROBOTICS_ENABLERS]:  "AI_THEME",
  [BUNDLE.CRYPTO_BETA]:        "CRYPTO_THEME",
  [BUNDLE.FINANCIALS_CREDIT]:  "FINANCIALS_THEME",
  [BUNDLE.ENERGY_GRID]:        "ENERGY_THEME",
  [BUNDLE.DEFENSIVE_DIVIDEND]: "DEFENSIVE_THEME",
  [BUNDLE.CONSUMER_MOMENTUM]:  "CONSUMER_THEME",
  [BUNDLE.BROAD_MARKET_ETF]:   "BROAD_INDEX",
  [BUNDLE.UNKNOWN]:            "OTHER",
});

// Cataloged symbol set (cheap O(1) lookup)
const CATALOG_SET = new Set(TICKER_CATALOG.map(t => (t.symbol || "").toUpperCase()));
const CATALOG_BY_SYMBOL = Object.fromEntries(
  TICKER_CATALOG.map(t => [(t.symbol || "").toUpperCase(), t])
);

// --------------------------------------------------
// TAG-BASED ENRICHMENT — when symbol exists in
// tickerCatalog but is not in BUNDLE_MAP.
// --------------------------------------------------

function enrichFromCatalog(catalogEntry) {
  if (!catalogEntry) return [];
  const tags = new Set((catalogEntry.tags || []).map(t => String(t).toLowerCase()));
  const cat = String(catalogEntry.category || "").toLowerCase();
  const sub = String(catalogEntry.subcategory || "").toLowerCase();
  const out = new Set();

  if (tags.has("datacenter")) out.add(BUNDLE.DATACENTER_POWER);
  if (tags.has("gpu")) { out.add(BUNDLE.SEMICONDUCTORS); out.add(BUNDLE.AI_INFRASTRUCTURE); }
  if (tags.has("cloud")) { out.add(BUNDLE.CLOUD_HYPERSCALERS); out.add(BUNDLE.AI_INFRASTRUCTURE); }
  if (tags.has("crypto") || tags.has("bitcoin_mining")) out.add(BUNDLE.CRYPTO_BETA);
  if (tags.has("credit_signal") || tags.has("bdc")) out.add(BUNDLE.FINANCIALS_CREDIT);
  if (tags.has("income")) out.add(BUNDLE.DEFENSIVE_DIVIDEND);
  if (tags.has("renewable") || tags.has("power") || tags.has("grid")) out.add(BUNDLE.ENERGY_GRID);
  // CONSUMER_MOMENTUM is intentionally NOT inferred from the megacap tag —
  // it's too broad (NVDA/MSFT/etc. all carry "megacap"). Explicit BUNDLE_MAP
  // entries cover the genuine consumer_momentum names (AAPL, TSLA, HOOD).

  if (cat === "ai" && sub.includes("ai infrastructure")) out.add(BUNDLE.AI_INFRASTRUCTURE);
  if (cat === "ai" && sub.includes("semiconductor")) out.add(BUNDLE.SEMICONDUCTORS);
  if (cat === "infra") out.add(BUNDLE.DATACENTER_POWER);
  if (cat === "etf" || cat === "index") out.add(BUNDLE.BROAD_MARKET_ETF);
  if (cat === "credit") out.add(BUNDLE.FINANCIALS_CREDIT);
  if (cat === "income") out.add(BUNDLE.DEFENSIVE_DIVIDEND);
  if (cat === "energy") out.add(BUNDLE.ENERGY_GRID);

  return Array.from(out);
}

// --------------------------------------------------
// SECTOR / INDUSTRY hints (supplied by caller)
// --------------------------------------------------

function enrichFromSectorHints(sector = "", industry = "") {
  const s = String(sector || "").toLowerCase();
  const i = String(industry || "").toLowerCase();
  const out = new Set();
  if (s.includes("technology") || i.includes("semiconductor")) out.add(BUNDLE.SEMICONDUCTORS);
  if (i.includes("semiconductor")) out.add(BUNDLE.AI_INFRASTRUCTURE);
  if (i.includes("software")) out.add(BUNDLE.CLOUD_HYPERSCALERS);
  if (s.includes("energy") || i.includes("oil") || i.includes("gas")) out.add(BUNDLE.ENERGY_GRID);
  if (i.includes("utilities") || i.includes("electric")) {
    out.add(BUNDLE.ENERGY_GRID);
    out.add(BUNDLE.DEFENSIVE_DIVIDEND);
  }
  if (s.includes("financial") || i.includes("bank") || i.includes("capital markets")) {
    out.add(BUNDLE.FINANCIALS_CREDIT);
  }
  if (s.includes("consumer") && i.includes("discretionary")) out.add(BUNDLE.CONSUMER_MOMENTUM);
  if (i.includes("real estate investment trust")) out.add(BUNDLE.DEFENSIVE_DIVIDEND);
  if (i.includes("etf") || i.includes("index")) out.add(BUNDLE.BROAD_MARKET_ETF);
  return Array.from(out);
}

// --------------------------------------------------
// PUBLIC: classifyBundles
// --------------------------------------------------

/**
 * Classify a symbol into thematic bundles.
 *
 * @param {string} symbol
 * @param {object} [hints]                 caller-supplied enrichment
 * @param {string} [hints.sector]
 * @param {string} [hints.industry]
 * @returns {import("./types.js").BundleResult}
 */
export function classifyBundles(symbol, hints = {}) {
  const sym = String(symbol || "").toUpperCase().trim();
  if (!sym) {
    return {
      symbol: "",
      bundles: [BUNDLE.UNKNOWN],
      primaryBundle: BUNDLE.UNKNOWN,
      concentrationTags: [BUNDLE_TO_CONCENTRATION[BUNDLE.UNKNOWN]],
      relatedSymbols: [],
    };
  }

  // 1. Explicit map (works for uncataloged symbols)
  const explicit = BUNDLE_MAP[sym];

  // 2. Catalog enrichment
  const catalogEntry = CATALOG_BY_SYMBOL[sym];
  const catalogBundles = enrichFromCatalog(catalogEntry);

  // 3. Sector hints from caller
  const hintBundles = enrichFromSectorHints(hints.sector, hints.industry);

  // Merge in priority order: explicit → catalog → hints
  const seen = new Set();
  const ordered = [];
  const push = (b) => {
    if (!b) return;
    if (seen.has(b)) return;
    seen.add(b);
    ordered.push(b);
  };
  (explicit || []).forEach(push);
  catalogBundles.forEach(push);
  hintBundles.forEach(push);

  if (ordered.length === 0) ordered.push(BUNDLE.UNKNOWN);

  const concentrationTags = Array.from(
    new Set(ordered.map(b => BUNDLE_TO_CONCENTRATION[b] || "OTHER"))
  );

  return {
    symbol: sym,
    bundles: ordered,
    primaryBundle: ordered[0],
    concentrationTags,
    relatedSymbols: getRelatedSymbols(sym, ordered[0]),
  };
}

/**
 * Symbols that share the same primary bundle, excluding self.
 * Capped to 12 for compactness.
 *
 * @param {string} symbol
 * @param {string} primaryBundle
 * @returns {string[]}
 */
export function getRelatedSymbols(symbol, primaryBundle) {
  if (!primaryBundle || primaryBundle === BUNDLE.UNKNOWN) return [];
  const out = [];
  for (const [sym, bundles] of Object.entries(BUNDLE_MAP)) {
    if (sym === symbol) continue;
    if (bundles[0] === primaryBundle) out.push(sym);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Quick check: is this symbol present in the local tickerCatalog?
 * Discovery layer treats this as enrichment metadata, not gating.
 * @param {string} symbol
 * @returns {import("./types.js").CatalogStatus}
 */
export function getCatalogStatus(symbol) {
  return CATALOG_SET.has(String(symbol || "").toUpperCase())
    ? CATALOG_STATUS.CATALOGED
    : CATALOG_STATUS.UNCATALOGED;
}

/**
 * Build the standard CatalogMeta block. Returns the uncataloged
 * shape required by spec for unknown symbols.
 * @param {string} symbol
 * @returns {import("./types.js").CatalogMeta}
 */
export function getCatalogMeta(symbol) {
  const sym = String(symbol || "").toUpperCase();
  const entry = CATALOG_BY_SYMBOL[sym];
  if (!entry) {
    return {
      sector: "unknown_sector",
      category: "unknown_category",
      tags: [],
      catalogStatus: CATALOG_STATUS.UNCATALOGED,
    };
  }
  return {
    sector: entry.subcategory || entry.category || "unknown_sector",
    category: entry.category || "unknown_category",
    tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
    catalogStatus: CATALOG_STATUS.CATALOGED,
  };
}
