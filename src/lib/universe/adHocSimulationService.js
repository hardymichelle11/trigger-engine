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
  classifyContractSpread,
  spreadGradeFromClass,
  pickCandidatePut,
  pickSecondaryPut,
} from "../marketData/optionsChainProvider.js";
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
 * @param {boolean} [opts.persist=false]         upsert into dynamic store.
 *   Defaults to false so a one-shot simulation never writes to the
 *   dynamic basket — explicit "Add to Basket" / "Promote to Scanner"
 *   actions handle persistence. Pass true when callers (e.g. an
 *   already-basketed symbol's re-sim) want lastSimulatedAt refreshed.
 * @param {string}  [opts.addedReason]
 */
export async function simulateAdHoc(rawSymbol, opts = {}) {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) {
    return failure(rawSymbol, "Invalid ticker symbol");
  }

  const providers = opts.providers || {};
  const persist = opts.persist === true;

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

  // Empty arrays / empty chains are truthy in JS. Resolve availability
  // explicitly so the UI badges reflect the real state.
  const hasBars = Array.isArray(bars) && bars.length > 0;
  const chainContracts = Array.isArray(optionsChain?.contracts)
    ? optionsChain.contracts
    : null;
  const hasChain = Array.isArray(chainContracts) && chainContracts.length > 0;
  const dataAvailability = {
    polygonQuote: !!quote,
    polygonBars:  hasBars,
    optionsChain: hasChain,
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

  // Safe-failure flag: when both quote and bars are unavailable AND no
  // options chain is present, the operator should see a single clear
  // banner rather than two separate "limited" sections.
  const noMarketData = !quote && !hasBars && !hasChain;
  const dataAvailabilityLabel = quote && hasBars
    ? "Quote + bars"
    : quote
      ? "Quote only"
      : hasBars
        ? "Bars only"
        : "No market data";

  // Separate CV badge so the UI can show "Options available" /
  // "Credit limited" independently of the TE data badge.
  const creditViewBadge = hasChain ? "Options available" : "Credit limited";

  return {
    symbol,
    analysisMode: hasChain
      ? ANALYSIS_MODES.AD_HOC_CREDIT_SIMULATION
      : ANALYSIS_MODES.AD_HOC_TE_SIMULATION,
    sourceType: universe.sourceType,
    catalogStatus: universe.catalogStatus,
    fetchedAt: Date.now(),
    dataAvailability,
    dataAvailabilityLabel,
    creditViewBadge,
    noMarketData,
    triggerEngine,
    creditView,
  };
}

// ---------------------------------------------------------------------
// TE — ad-hoc structural snapshot
// ---------------------------------------------------------------------

function buildAdHocTriggerEngineResult({ symbol, quote, bars }) {
  // The bars provider may return OHLC bar objects ({ ts, open, high, low,
  // close, volume }) when daily aggregates are available, or a plain
  // close-price array as a legacy fallback. We normalize both shapes to
  // closes + (when available) full OHLC for a true-range ATR and
  // low/high-based support/resistance.
  const isOhlcBars = Array.isArray(bars) && bars.length > 0 && typeof bars[0] === "object";
  const closes = Array.isArray(bars)
    ? bars
        .map((b) => (typeof b === "number" ? b : numeric(b?.close)))
        .filter(Number.isFinite)
    : [];

  if (!quote && closes.length === 0) {
    return {
      ok: false,
      reason: "Polygon quote and bars unavailable — no structural data to score.",
      result: null,
      label: "Ad Hoc TE Simulation",
      limited: true,
      barsAvailable: false,
    };
  }

  const price = numeric(quote?.price);
  const previousClose = numeric(quote?.previousClose);
  const percentChange = numeric(quote?.percentChange);

  // ATR — true range when OHLC is available, close-to-close fallback
  // when only close prices were provided.
  const atr = closes.length >= 2
    ? (isOhlcBars
        ? estimateAtrFromOhlc(bars)
        : estimateAtrFromCloses(closes))
    : null;

  // Support / resistance — prefer the rolling 30-bar low/high from OHLC
  // when available, else fall back to the close-only min/max.
  const window = isOhlcBars ? bars.slice(-30) : closes.slice(-30);
  const support = isOhlcBars
    ? minBy(window, (b) => numeric(b.low) ?? numeric(b.close))
    : (window.length > 0 ? Math.min(...window) : null);
  const resistance = isOhlcBars
    ? maxBy(window, (b) => numeric(b.high) ?? numeric(b.close))
    : (window.length > 0 ? Math.max(...window) : null);

  const trendBias = inferTrendBias(closes);
  const supportPct = (price != null && support != null && price > 0)
    ? Math.max(0, (price - support) / price)
    : null;
  const resistancePct = (price != null && resistance != null && price > 0)
    ? Math.max(0, (resistance - price) / price)
    : null;

  // Data quality label drives the UI badge ("Quote + bars" / "Quote only"
  // / "No market data") so the operator always knows what produced the
  // numbers below.
  const dataQuality = (quote && closes.length > 0)
    ? "quote_and_bars"
    : (quote ? "quote_only" : "bars_only");
  const dataQualityLabel = dataQuality === "quote_and_bars"
    ? "Quote + bars"
    : dataQuality === "quote_only"
      ? "Quote only"
      : "Bars only";

  return {
    ok: true,
    label: "Ad Hoc TE Simulation",
    limited: closes.length === 0,
    barsAvailable: closes.length > 0,
    dataQuality,
    dataQualityLabel,
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
        ohlcAvailable: isOhlcBars,
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

// True-range ATR (Wilder-style simple average of the last N true ranges).
// True range = max(high-low, |high-prevClose|, |low-prevClose|).
function estimateAtrFromOhlc(bars) {
  if (!Array.isArray(bars) || bars.length < 2) return null;
  const window = bars.slice(-15);    // 14 ranges from 15 bars
  let sum = 0;
  let n = 0;
  for (let i = 1; i < window.length; i++) {
    const high = numeric(window[i].high);
    const low  = numeric(window[i].low);
    const prevClose = numeric(window[i - 1].close);
    if (high == null || low == null || prevClose == null) continue;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );
    if (Number.isFinite(tr)) { sum += tr; n++; }
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

function minBy(arr, getter) {
  let best = null;
  for (const item of arr) {
    const v = getter(item);
    if (!Number.isFinite(v)) continue;
    if (best == null || v < best) best = v;
  }
  return best;
}
function maxBy(arr, getter) {
  let best = null;
  for (const item of arr) {
    const v = getter(item);
    if (!Number.isFinite(v)) continue;
    if (best == null || v > best) best = v;
  }
  return best;
}

// ---------------------------------------------------------------------
// CV — limited / full per options-data availability
// ---------------------------------------------------------------------

function buildAdHocCreditViewResult({ symbol, quote, bars, optionsChain, universe }) {
  // No options chain at all (provider not supplied or returned nothing) →
  // limited mode, structural-only commentary.
  const contracts = Array.isArray(optionsChain?.contracts)
    ? optionsChain.contracts
    : null;
  if (!optionsChain || contracts == null || contracts.length === 0) {
    return {
      ok: true,
      limited: true,
      reason: "Credit View limited: options chain data unavailable. Price structure can be reviewed, but premium recommendation requires option data.",
      label: "Ad Hoc Credit Simulation (limited)",
      badge: "Credit limited",
      result: null,
      candidate: null,
      warnings: optionsChain?.warnings || [],
    };
  }

  // Derive support from bars (OHLC lows or close-only min over the
  // recent window). Used to seed the candidate-strike picker so we
  // prefer puts at or below support.
  const closes = Array.isArray(bars)
    ? bars
        .map((b) => (typeof b === "number" ? b : numeric(b?.close)))
        .filter(Number.isFinite)
    : [];
  const isOhlc = Array.isArray(bars) && bars.length > 0 && typeof bars[0] === "object";
  const recent = isOhlc ? bars.slice(-30) : closes.slice(-30);
  const support = isOhlc
    ? minBy(recent, (b) => numeric(b.low) ?? numeric(b.close))
    : (recent.length > 0 ? Math.min(...recent) : null);
  const supportPct = (quote?.price != null && support != null && quote.price > 0)
    ? Math.max(0, (quote.price - support) / quote.price)
    : null;

  const candidate = pickCandidatePut(contracts, {
    underlyingPrice: quote?.price ?? null,
    supportLevel: support,
  });
  if (!candidate) {
    return {
      ok: true,
      limited: true,
      reason: "Credit View limited: no put contracts in the target zone (≥7 DTE within 10% below price).",
      label: "Ad Hoc Credit Simulation (limited)",
      badge: "Credit limited",
      result: null,
      candidate: null,
      warnings: optionsChain?.warnings || [],
    };
  }
  const secondary = pickSecondaryPut(contracts, candidate);

  // Spread classification — A+/B/C/F vocabulary the narrative builder
  // already understands. Premium-availability proxy: when the chain
  // returns IV, treat IV*100 as a coarse stand-in for IV percentile;
  // the narrative builder's premiumRich/premiumOk thresholds are
  // documented (≥70 / ≥50), so a 0.30 IV maps to "weak", 0.50 to "ok",
  // 0.70 to "rich". We never expose this number raw — the builder
  // converts it into trader-facing language.
  const spreadClass = classifyContractSpread(candidate.bid, candidate.ask, candidate.mid);
  const spreadGrade = spreadGradeFromClass(spreadClass);
  const approxIvPct = candidate.impliedVolatility != null
    ? Math.min(99, Math.max(0, Math.round(candidate.impliedVolatility * 100)))
    : null;

  const cv = buildCreditViewNarrative({
    symbol,
    price: quote?.price ?? null,
    ivPercentile: approxIvPct,
    bid: candidate.bid,
    ask: candidate.ask,
    premiumMid: candidate.mid,
    spreadQuality: spreadGrade,
    wheelSuit: universe?.catalogMeta?.wheelSuit ?? "—",
    signal: "WATCH",
    action: "WAIT",
    timingStage: "UNKNOWN",
    vix: null,
    nearestSupportPct: supportPct,
    minuteOfDay: null,
    primaryStrike: candidate.strike,
    secondaryStrike: secondary?.strike ?? null,
  });

  return {
    ok: true,
    limited: false,
    reason: null,
    label: "Ad Hoc Credit Simulation",
    badge: "Options available",
    candidate: {
      symbol: candidate.symbol,
      expiration: candidate.expiration,
      strike: candidate.strike,
      bid: candidate.bid,
      ask: candidate.ask,
      mid: candidate.mid,
      spreadClass,
      spreadGrade,
      impliedVolatility: candidate.impliedVolatility,
      delta: candidate.delta,
    },
    warnings: optionsChain?.warnings || [],
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
