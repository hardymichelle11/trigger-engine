// =====================================================
// SESSION-AWARE UNIVERSE ORCHESTRATOR (Phase 4.5A)
// =====================================================
// Picks the right Polygon strategy based on the current
// US-equity session and dispatches through polygonGlue.
//
//   regular    → gainers + losers union  (label: regular_snapshot)
//   premarket  → bulk tickers ?tickers=…  (label: extended_hours_derived)
//   postmarket → bulk tickers ?tickers=…  (label: extended_hours_derived)
//   closed     → bulk tickers ?tickers=…  (label: closed_curated, warned)
//
// Hard rules:
//   - All HTTP calls go through the injected glue's
//     fetchUniverseLive — preserves circuit breaker,
//     timeout, and capability-probe behavior.
//   - Never calls /v2/snapshot/locale/us/markets/stocks/most_active.
//   - On any failure, returns a structured fallback bundle.
//   - Adds metadata.universe.session and
//     metadata.universe.universeStrategy without changing
//     metadata.universe.source (which stays as live/fallback
//     so the existing UI live-status check keeps working).
// =====================================================

import { classifyMarketSession, SESSION } from "./marketSession.js";
import { buildCuratedWatchlist } from "./extendedHoursWatchlist.js";
import { UNIVERSE_SOURCE } from "./polygonUniverseAdapter.js";

export const UNIVERSE_STRATEGY = Object.freeze({
  REGULAR_SNAPSHOT:        "regular_snapshot",
  REGULAR_GAINERS:         "regular_gainers",
  REGULAR_LOSERS:          "regular_losers",
  EXTENDED_HOURS_DERIVED:  "extended_hours_derived",
  CLOSED_CURATED:          "closed_curated",
});

/**
 * @param {object} args
 * @param {{ fetchUniverseLive: Function, getCircuitState?: Function }} args.glue
 * @param {number} [args.now]                         injectable epoch ms
 * @param {string[]} [args.curatedSymbols]            override the default curated list
 * @param {object} [args.filters]                     reserved for future tuning (volume/change %)
 * @returns {Promise<{
 *   symbols: string[],
 *   marketDataBySymbol: Record<string, object>,
 *   metadata: object,
 *   warnings?: string[],
 * }>}
 */
export async function fetchSessionAwareUniverse(args = {}) {
  const { glue, now, curatedSymbols, filters } = args;
  if (!glue || typeof glue.fetchUniverseLive !== "function") {
    return wrapFallback({
      session: SESSION.CLOSED,
      universeStrategy: UNIVERSE_STRATEGY.CLOSED_CURATED,
      reason: "missing_glue",
      generatedAt: Number.isFinite(Number(now)) ? Number(now) : Date.now(),
    });
  }

  const sessionInfo = classifyMarketSession({ now });
  const { session } = sessionInfo;

  if (session === SESSION.REGULAR) {
    return await fetchRegular({ glue, sessionInfo });
  }
  if (session === SESSION.PREMARKET || session === SESSION.POSTMARKET) {
    return await fetchExtendedHours({ glue, sessionInfo, curatedSymbols, filters });
  }
  // CLOSED
  return await fetchClosedCurated({ glue, sessionInfo, curatedSymbols });
}

// --------------------------------------------------
// REGULAR SESSION — gainers + losers union
// --------------------------------------------------

async function fetchRegular({ glue, sessionInfo }) {
  const [gainers, losers] = await Promise.all([
    safeFetchUniverse(glue, { source: UNIVERSE_SOURCE.REGULAR_GAINERS }),
    safeFetchUniverse(glue, { source: UNIVERSE_SOURCE.REGULAR_LOSERS }),
  ]);

  const gOk = isLiveBundle(gainers);
  const lOk = isLiveBundle(losers);

  // If both branches failed, surface fallback. The Glue already produced
  // structured fallback bundles for each — pick the first reason.
  if (!gOk && !lOk) {
    return {
      ...gainers,
      metadata: addSessionLabels(gainers.metadata, {
        session: sessionInfo.session,
        universeStrategy: UNIVERSE_STRATEGY.REGULAR_SNAPSHOT,
        sessionLabel: sessionInfo.sessionLabel,
        reason: gainers.metadata.reason || losers.metadata.reason || "regular_fetch_failed",
      }),
      warnings: ["Regular-session fetch failed for both gainers and losers"],
    };
  }

  // Merge. Keep the first occurrence per symbol; gainers take precedence on
  // collision. The result preserves whichever bundle succeeded.
  const merged = {};
  const symbols = [];
  if (gOk) {
    for (const sym of gainers.symbols) {
      if (!(sym in merged)) {
        merged[sym] = gainers.marketDataBySymbol[sym];
        symbols.push(sym);
      }
    }
  }
  if (lOk) {
    for (const sym of losers.symbols) {
      if (!(sym in merged)) {
        merged[sym] = losers.marketDataBySymbol[sym];
        symbols.push(sym);
      }
    }
  }

  // Pick the most descriptive strategy label.
  const strategy = (gOk && lOk)
    ? UNIVERSE_STRATEGY.REGULAR_SNAPSHOT
    : (gOk ? UNIVERSE_STRATEGY.REGULAR_GAINERS : UNIVERSE_STRATEGY.REGULAR_LOSERS);

  return {
    symbols,
    marketDataBySymbol: merged,
    metadata: addSessionLabels(
      pickPrimaryMetadata(gainers, losers, gOk),
      {
        session: sessionInfo.session,
        sessionLabel: sessionInfo.sessionLabel,
        universeStrategy: strategy,
        normalizedCount: symbols.length,
        snapshotCount: (gainers.metadata.snapshotCount || 0) + (losers.metadata.snapshotCount || 0),
      },
    ),
    warnings: [],
  };
}

// --------------------------------------------------
// PREMARKET / POSTMARKET — bulk-tickers via curated list
// --------------------------------------------------

async function fetchExtendedHours({ glue, sessionInfo, curatedSymbols, filters: _filters }) {
  const curated = resolveCuratedSymbols(curatedSymbols);
  if (curated.length === 0) {
    return wrapFallback({
      session: sessionInfo.session,
      sessionLabel: sessionInfo.sessionLabel,
      universeStrategy: UNIVERSE_STRATEGY.EXTENDED_HOURS_DERIVED,
      reason: "no_curated_symbols",
      generatedAt: sessionInfo.asOf,
    });
  }

  const bundle = await safeFetchUniverse(glue, {
    source: UNIVERSE_SOURCE.EXTENDED_HOURS_DERIVED,
    customSymbols: curated,
  });

  return {
    ...bundle,
    metadata: addSessionLabels(bundle.metadata, {
      session: sessionInfo.session,
      sessionLabel: sessionInfo.sessionLabel,
      universeStrategy: UNIVERSE_STRATEGY.EXTENDED_HOURS_DERIVED,
      curatedSymbolCount: curated.length,
    }),
    warnings: [],
  };
}

// --------------------------------------------------
// CLOSED — curated bulk snapshot, last regular session
// --------------------------------------------------

async function fetchClosedCurated({ glue, sessionInfo, curatedSymbols }) {
  const curated = resolveCuratedSymbols(curatedSymbols);
  if (curated.length === 0) {
    return wrapFallback({
      session: sessionInfo.session,
      sessionLabel: sessionInfo.sessionLabel,
      universeStrategy: UNIVERSE_STRATEGY.CLOSED_CURATED,
      reason: "no_curated_symbols",
      generatedAt: sessionInfo.asOf,
    });
  }

  const bundle = await safeFetchUniverse(glue, {
    source: UNIVERSE_SOURCE.EXTENDED_HOURS_DERIVED,
    customSymbols: curated,
  });

  return {
    ...bundle,
    metadata: addSessionLabels(bundle.metadata, {
      session: sessionInfo.session,
      sessionLabel: sessionInfo.sessionLabel,
      universeStrategy: UNIVERSE_STRATEGY.CLOSED_CURATED,
      curatedSymbolCount: curated.length,
    }),
    warnings: ["Markets closed — last regular session data shown. Verify before any operator action."],
  };
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function resolveCuratedSymbols(override) {
  if (Array.isArray(override) && override.length > 0) {
    return override.map(s => String(s || "").toUpperCase()).filter(Boolean);
  }
  const built = buildCuratedWatchlist();
  return built.symbols;
}

async function safeFetchUniverse(glue, request) {
  try {
    return await glue.fetchUniverseLive(request);
  } catch (err) {
    return {
      symbols: [],
      marketDataBySymbol: {},
      metadata: {
        source: "fallback",
        reason: `glue_threw: ${err?.message || "unknown"}`,
        snapshotCount: 0,
        normalizedCount: 0,
        droppedCount: 0,
        droppedReasons: [],
      },
    };
  }
}

function isLiveBundle(b) {
  return !!b
    && typeof b === "object"
    && b.metadata?.source === "live"
    && Array.isArray(b.symbols)
    && b.symbols.length > 0;
}

function pickPrimaryMetadata(gainers, losers, preferGainers) {
  return preferGainers ? gainers.metadata : losers.metadata;
}

function addSessionLabels(meta, labels) {
  return {
    ...(meta || {}),
    session: labels.session,
    sessionLabel: labels.sessionLabel,
    universeStrategy: labels.universeStrategy,
    ...(Number.isFinite(labels.normalizedCount) ? { normalizedCount: labels.normalizedCount } : {}),
    ...(Number.isFinite(labels.snapshotCount) ? { snapshotCount: labels.snapshotCount } : {}),
    ...(labels.curatedSymbolCount != null ? { curatedSymbolCount: labels.curatedSymbolCount } : {}),
    ...(labels.reason ? { reason: labels.reason } : {}),
  };
}

function wrapFallback({ session, sessionLabel, universeStrategy, reason, generatedAt }) {
  return {
    symbols: [],
    marketDataBySymbol: {},
    metadata: {
      source: "fallback",
      reason: reason || "unknown",
      snapshotCount: 0,
      normalizedCount: 0,
      droppedCount: 0,
      droppedReasons: [],
      session,
      sessionLabel,
      universeStrategy,
      generatedAt: generatedAt || Date.now(),
    },
    warnings: [],
  };
}
