// =====================================================================
// Ad Hoc Simulation Service — orchestrates Polygon fetch + TE/CV runs
// for any uncataloged ticker.
// =====================================================================
// Returns a structured result the UI can render section-by-section:
//
//   {
//     symbol,
//     analysisMode,                  // ANALYSIS_MODES.AD_HOC_*
//     dataAvailability,
//     triggerEngine: { ok, result, reason },
//     creditView:    { ok, result, reason, limited },
//     fetchedAt,
//   }
//
// Hard rules:
//   - Pure orchestration. Never mutates the static catalog.
//   - Tolerant: a missing options chain produces a "limited" Credit
//     View, not a crash. Missing quote/bars produces a graceful TE
//     skip.
//   - Trader-facing language only — never expose raw scores or
//     internal weights.
// =====================================================================

import { fetchQuotes } from "../quoteFetch.js";
import { buildCreditViewNarrative } from "../engine/creditViewNarrative.js";
import {
  ANALYSIS_MODES,
  TICKER_SOURCE_TYPES,
  CATALOG_STATUS,
  normalizeSymbol,
} from "./tickerUniverseTypes.js";
import { resolveTickerUniverse } from "./resolveTickerUniverse.js";
import { upsertDynamicTicker, getDynamicTicker } from "./dynamicUniverseStore.js";

/**
 * Run an ad-hoc simulation for a single symbol. Always returns a
 * result object; never throws.
 *
 * @param {string} rawSymbol
 * @param {object} [opts]
 * @param {object} [opts.providers]              hooks for testability
 * @param {(syms: string[]) => Promise<object>} [opts.providers.fetchQuotes]
 * @param {(s: string) => Promise<object|null>} [opts.providers.fetchBars]
 * @param {(s: string) => Promise<object|null>} [opts.providers.fetchOptionsChain]
 * @param {boolean} [opts.persist=true]          upsert into dynamic store
 * @param {string}  [opts.addedReason]
 */
export async function simulateAdHoc(rawSymbol, opts = {}) {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) {
    return failure(rawSymbol, "Invalid ticker symbol");
  }

  const providers = opts.providers || {};
  const persist = opts.persist !== false;

  // Existing universe record so we know whether this is genuinely
  // ad-hoc or just a re-simulation of a dynamic basket entry.
  const universe = resolveTickerUniverse(symbol);

  // 1. Fetch a quote — also functions as a "is this a real ticker?" probe.
  const quoteFn = providers.fetchQuotes || fetchQuotes;
  let quote = null;
  try {
    const map = await quoteFn([symbol]);
    quote = (map && map[symbol]) || null;
  } catch { quote = null; }

  // 2. Bars (history) — optional. Some uncataloged symbols won't have
  //    bars on the public proxy; TE handles this gracefully.
  let bars = null;
  if (typeof providers.fetchBars === "function") {
    try { bars = await providers.fetchBars(symbol); } catch { bars = null; }
  }

  // 3. Options chain — optional. If missing, CV is in "limited" mode.
  let optionsChain = null;
  if (typeof providers.fetchOptionsChain === "function") {
    try { optionsChain = await providers.fetchOptionsChain(symbol); } catch { optionsChain = null; }
  }

  const dataAvailability = {
    polygonQuote: !!quote,
    polygonBars:  !!bars,
    optionsChain: !!optionsChain,
    news:         false,
  };

  // 4. TE simulation. We don't have the full engine surface (scoreSetup
  //    expects a setup pre-built by the catalog), so the ad-hoc TE
  //    output is a structural snapshot derived from quote + bars. The
  //    UI labels it "Ad Hoc TE Simulation".
  const triggerEngine = buildAdHocTriggerEngineResult({ symbol, quote, bars });

  // 5. CV simulation. The narrative builder accepts a flat input bag
  //    and never requires the catalog. We feed it whatever the chain
  //    + quote gave us; missing fields gracefully degrade.
  const creditView = buildAdHocCreditViewResult({
    symbol, quote, bars, optionsChain, universe,
  });

  // 6. Persist a record so the operator's "Add to Dynamic Basket" /
  //    "Promote to Scanner" actions have something to attach to.
  if (persist) {
    try {
      upsertDynamicTicker({
        symbol,
        sourceType: universe.sourceType === TICKER_SOURCE_TYPES.STATIC_CATALOG
          ? TICKER_SOURCE_TYPES.STATIC_CATALOG
          : (getDynamicTicker(symbol)?.sourceType || TICKER_SOURCE_TYPES.AD_HOC_SIMULATION),
        addedReason: opts.addedReason || "ad_hoc_simulation",
        lastSimulatedAt: Date.now(),
        engineEligibility: {
          triggerEngine: triggerEngine.ok,
          creditView: !!optionsChain || universe.engineEligibility?.creditView,
          lethalBoard: universe.engineEligibility?.lethalBoard || false,
        },
        dataAvailability,
      });
    } catch { /* persistence is best-effort */ }
  }

  return {
    symbol,
    analysisMode: optionsChain
      ? ANALYSIS_MODES.AD_HOC_CREDIT_SIMULATION
      : ANALYSIS_MODES.AD_HOC_TE_SIMULATION,
    sourceType: universe.sourceType,
    catalogStatus: universe.catalogStatus,
    fetchedAt: Date.now(),
    dataAvailability,
    triggerEngine,
    creditView,
  };
}

// ---------------------------------------------------------------------
// TE — ad-hoc structural snapshot
// ---------------------------------------------------------------------

function buildAdHocTriggerEngineResult({ symbol, quote, bars }) {
  if (!quote && (!bars || !Array.isArray(bars) || bars.length === 0)) {
    return {
      ok: false,
      reason: "Polygon quote and bars unavailable — no structural data to score.",
      result: null,
      label: "Ad Hoc TE Simulation",
      limited: true,
    };
  }

  const closes = Array.isArray(bars) ? bars.filter(Number.isFinite) : [];
  const price = numeric(quote?.price);
  const previousClose = numeric(quote?.previousClose);
  const percentChange = numeric(quote?.percentChange);

  const atr = closes.length >= 14 ? estimateAtrFromCloses(closes) : null;
  const support = closes.length > 0 ? Math.min(...closes.slice(-30)) : null;
  const resistance = closes.length > 0 ? Math.max(...closes.slice(-30)) : null;
  const trendBias = inferTrendBias(closes);
  const supportPct = (price != null && support != null && price > 0)
    ? Math.max(0, (price - support) / price)
    : null;
  const resistancePct = (price != null && resistance != null && price > 0)
    ? Math.max(0, (resistance - price) / price)
    : null;

  return {
    ok: true,
    label: "Ad Hoc TE Simulation",
    limited: bars == null,                 // no bars → only quote-level info
    result: {
      symbol,
      price,
      previousClose,
      percentChange,
      structure: {
        support,
        resistance,
        atr,
        trendBias,
        supportPct,
        resistancePct,
        windowSize: closes.length,
      },
      note: "No static catalog profile found. Analysis is based on available Polygon market structure.",
    },
    reason: null,
  };
}

function estimateAtrFromCloses(closes) {
  if (!Array.isArray(closes) || closes.length < 2) return null;
  let sum = 0;
  let n = 0;
  for (let i = 1; i < closes.length; i++) {
    const r = Math.abs(closes[i] - closes[i - 1]);
    if (Number.isFinite(r)) { sum += r; n++; }
  }
  return n === 0 ? null : sum / n;
}

function inferTrendBias(closes) {
  if (!Array.isArray(closes) || closes.length < 5) return null;
  const recent = closes.slice(-10);
  const older  = closes.slice(-20, -10);
  if (older.length === 0) return null;
  const avgRecent = avg(recent);
  const avgOlder  = avg(older);
  if (avgRecent > avgOlder * 1.02) return "BULLISH";
  if (avgRecent < avgOlder * 0.98) return "BEARISH";
  return "NEUTRAL";
}

function avg(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

// ---------------------------------------------------------------------
// CV — limited / full per options-data availability
// ---------------------------------------------------------------------

function buildAdHocCreditViewResult({ symbol, quote, bars, optionsChain, universe }) {
  // No options data → limited mode, structural-only commentary.
  if (!optionsChain) {
    return {
      ok: true,
      limited: true,
      reason: "Credit View limited: options chain data unavailable. Price structure can be reviewed, but premium recommendation requires option data.",
      label: "Ad Hoc Credit Simulation (limited)",
      result: null,
    };
  }

  const closes = Array.isArray(bars) ? bars : [];
  const support = closes.length > 0 ? Math.min(...closes.slice(-30)) : null;
  const supportPct = (quote?.price != null && support != null && quote.price > 0)
    ? Math.max(0, (quote.price - support) / quote.price)
    : null;

  const cv = buildCreditViewNarrative({
    symbol,
    price: quote?.price ?? null,
    ivPercentile: optionsChain?.ivPercentile ?? null,
    bid: optionsChain?.bid ?? null,
    ask: optionsChain?.ask ?? null,
    spreadQuality: optionsChain?.spreadQuality ?? "—",
    wheelSuit: universe?.catalogMeta?.wheelSuit ?? "—",
    signal: "WATCH",
    action: "WAIT",
    timingStage: "UNKNOWN",
    vix: optionsChain?.vix ?? null,
    nearestSupportPct: supportPct,
    minuteOfDay: optionsChain?.minuteOfDay ?? null,
    primaryStrike: optionsChain?.primaryStrike ?? null,
    secondaryStrike: optionsChain?.secondaryStrike ?? null,
  });

  return {
    ok: true,
    limited: false,
    reason: null,
    label: "Ad Hoc Credit Simulation",
    result: cv,
  };
}

// ---------------------------------------------------------------------
// Failure helper
// ---------------------------------------------------------------------

function failure(rawSymbol, reason) {
  return {
    symbol: rawSymbol,
    analysisMode: ANALYSIS_MODES.AD_HOC_TE_SIMULATION,
    sourceType: TICKER_SOURCE_TYPES.AD_HOC_SIMULATION,
    catalogStatus: CATALOG_STATUS.UNCATALOGED,
    fetchedAt: Date.now(),
    dataAvailability: {
      polygonQuote: false, polygonBars: false, optionsChain: false, news: false,
    },
    triggerEngine: {
      ok: false, limited: true, reason,
      label: "Ad Hoc TE Simulation",
      result: null,
    },
    creditView: {
      ok: false, limited: true,
      reason: "Credit View unavailable — invalid ticker.",
      label: "Ad Hoc Credit Simulation (limited)",
      result: null,
    },
  };
}

function numeric(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
