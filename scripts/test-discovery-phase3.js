#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 3 tests
// Run: npm run test:discovery-phase3
// =====================================================
//
// Covers:
//   - polygonUniverseAdapter (gainers/losers/most-active/custom)
//   - polygonOptionsAdapter (chain → optionsDataBySymbol)
//   - integration: chain adapter → premium engine → live path
//   - lethalBoardViewModel (pure helper)
//   - LethalBoard.jsx JSX syntax validation (via Vite)
//   - discoveryAlertBridge (event translation, dedup)
//
// All Polygon I/O is dependency-injected — no live HTTP.
// =====================================================

import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";

import {
  buildUniverseFromPolygon,
  fetchUniverse,
  normalizePolygonRow,
  UNIVERSE_SOURCE,
  UNIVERSE_DROP_REASON,
} from "../src/engines/discovery/polygonUniverseAdapter.js";

import {
  buildOptionsDataFromPolygon,
  fetchOptionsChains,
  normalizeOptionContract,
  OPTIONS_STATUS,
  OPTIONS_DROP_REASON,
} from "../src/engines/discovery/polygonOptionsAdapter.js";

import {
  estimatePremium,
} from "../src/engines/discovery/estimatedPremiumEngine.js";

import {
  runMarketDiscoveryScan,
} from "../src/engines/discovery/marketDiscoveryScanner.js";

import {
  buildLethalBoardViewModel,
  VIEW_LABELS,
} from "../src/components/discovery/lethalBoardViewModel.js";

import {
  createDiscoveryAlertBridge,
  DEFAULT_BRIDGE_DEDUP_WINDOW_MS,
} from "../src/engines/discovery/discoveryAlertBridge.js";

import {
  createScannerStateStore,
} from "../src/engines/discovery/scannerStateStore.js";

import {
  PREMIUM_SOURCE,
  ACTION,
} from "../src/engines/discovery/types.js";

let passed = 0;
let failed = 0;
const failureLines = [];

function assert(name, condition, detail = "") {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${detail ? "  →  " + detail : ""}`);
         failureLines.push(name + (detail ? "  →  " + detail : "")); failed++; }
}

function group(label) {
  console.log("\n  " + label);
  console.log("  " + "─".repeat(Math.max(20, label.length)));
}

// --------------------------------------------------
// FIXTURES
// --------------------------------------------------

const NOW = 1_756_000_000_000;

function polygonGainersFixture() {
  return {
    status: "OK",
    tickers: [
      {
        ticker: "NVDA",
        todaysChange: 4.5,
        todaysChangePerc: 4.13,
        updated: (NOW - 60_000) * 1_000_000,    // ns → 1 min ago
        day: { c: 113.5, h: 114.0, l: 109.0, o: 110.0, v: 35_000_000, vw: 112.0 },
        prevDay: { c: 109.0, v: 30_000_000 },
      },
      {
        ticker: "CRWV",
        todaysChange: 3.2,
        todaysChangePerc: 3.45,
        updated: (NOW - 120_000) * 1_000_000,
        day: { c: 96.0, h: 97.0, l: 92.0, o: 93.0, v: 12_000_000, vw: 95.0 },
        prevDay: { c: 92.8, v: 8_000_000 },
      },
      {
        // Missing day.c → should be dropped
        ticker: "BROKEN",
        todaysChange: 0,
        todaysChangePerc: 0,
        updated: NOW * 1_000_000,
        day: {},
        prevDay: { c: 50, v: 100_000 },
      },
      {
        // Missing ticker → invalid_symbol
        todaysChange: 1,
        todaysChangePerc: 1,
        day: { c: 50, v: 100_000 },
      },
      {
        // Garbage ticker
        ticker: "lower-case-bad",
        day: { c: 10, v: 1000 },
      },
    ],
  };
}

function polygonOptionsChainFixture(price) {
  const exp14 = NOW + 14 * 86_400_000;
  const exp21 = NOW + 21 * 86_400_000;
  const expDate14 = new Date(exp14).toISOString().slice(0, 10);
  const expDate21 = new Date(exp21).toISOString().slice(0, 10);
  return {
    results: [
      {
        details: { contract_type: "put", strike_price: price * 0.95, expiration_date: expDate14 },
        last_quote: { bid: 1.10, ask: 1.12, midpoint: 1.11 },
        implied_volatility: 0.32,
        open_interest: 1500,
        day: { volume: 800 },
      },
      {
        details: { contract_type: "put", strike_price: price * 0.93, expiration_date: expDate21 },
        last_quote: { bid: 1.40, ask: 1.42, midpoint: 1.41 },
        implied_volatility: 0.30,
        open_interest: 1200,
        day: { volume: 600 },
      },
      // Wide spread row — shouldn't be picked but must not crash
      {
        details: { contract_type: "put", strike_price: price * 0.90, expiration_date: expDate14 },
        last_quote: { bid: 0.50, ask: 0.80, midpoint: 0.65 },
        open_interest: 50,
        day: { volume: 10 },
      },
      // Call (should be filtered out by default put-only adapter)
      {
        details: { contract_type: "call", strike_price: price * 1.05, expiration_date: expDate14 },
        last_quote: { bid: 0.50, ask: 0.55, midpoint: 0.525 },
        open_interest: 100,
        day: { volume: 50 },
      },
      // Missing strike — drop
      {
        details: { contract_type: "put", expiration_date: expDate14 },
        last_quote: { bid: 0.5, ask: 0.6 },
      },
      // Expired contract — drop
      {
        details: { contract_type: "put", strike_price: price * 0.95,
                   expiration_date: new Date(NOW - 3 * 86_400_000).toISOString().slice(0, 10) },
        last_quote: { bid: 0.05, ask: 0.10 },
      },
    ],
  };
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 3");
console.log("  ════════════════════════════════════════════");

// =================================================================
// 1. polygonUniverseAdapter
// =================================================================
group("polygonUniverseAdapter — gainers / losers / most-active");
{
  // Gainers
  const gainers = buildUniverseFromPolygon({
    source: UNIVERSE_SOURCE.GAINERS,
    polygonResponse: polygonGainersFixture(),
    now: NOW,
  });
  assert("gainers: produces marketDataBySymbol",
    typeof gainers.marketDataBySymbol === "object" && Object.keys(gainers.marketDataBySymbol).length === 2);
  assert("gainers: NVDA price normalized to day.c",
    gainers.marketDataBySymbol.NVDA?.price === 113.5);
  assert("gainers: NVDA percentChange preserved from todaysChangePerc",
    gainers.marketDataBySymbol.NVDA?.percentChange === 4.13);
  assert("gainers: dollarVolume = vwap × volume",
    gainers.marketDataBySymbol.NVDA?.dollarVolume === 112 * 35_000_000);
  assert("gainers: timestamp converted from ns to ms",
    gainers.marketDataBySymbol.NVDA?.timestamp === NOW - 60_000);
  assert("gainers: source labeled polygon_gainers",
    gainers.marketDataBySymbol.NVDA?.source === "polygon_gainers");

  // Drops
  assert("gainers: BROKEN dropped with missing_price",
    gainers.metadata.droppedReasons.some(d => d.symbol === "BROKEN" && d.reason === UNIVERSE_DROP_REASON.MISSING_PRICE));
  assert("gainers: missing-ticker row dropped with invalid_symbol",
    gainers.metadata.droppedReasons.some(d => d.reason === UNIVERSE_DROP_REASON.INVALID_SYMBOL));

  // Counts add up
  assert("gainers: snapshotCount tracks total",
    gainers.metadata.snapshotCount === 5);
  assert("gainers: normalized + dropped = snapshot count",
    gainers.metadata.normalizedCount + gainers.metadata.droppedCount === gainers.metadata.snapshotCount);

  // Losers and most-active reuse same path
  const losers = buildUniverseFromPolygon({
    source: UNIVERSE_SOURCE.LOSERS,
    polygonResponse: polygonGainersFixture(),
    now: NOW,
  });
  assert("losers: source labeled polygon_losers",
    losers.marketDataBySymbol.NVDA?.source === "polygon_losers");

  const active = buildUniverseFromPolygon({
    source: UNIVERSE_SOURCE.MOST_ACTIVE,
    polygonResponse: polygonGainersFixture(),
    now: NOW,
  });
  assert("most_active: source labeled polygon_most_active",
    active.marketDataBySymbol.NVDA?.source === "polygon_most_active");

  // Custom watchlist filters down
  const custom = buildUniverseFromPolygon({
    source: UNIVERSE_SOURCE.CUSTOM_WATCHLIST,
    polygonResponse: polygonGainersFixture(),
    customSymbols: ["CRWV"],
    now: NOW,
  });
  assert("custom_watchlist: filters to subset",
    Object.keys(custom.marketDataBySymbol).length === 1
    && custom.marketDataBySymbol.CRWV);

  // Stale tolerance
  const stale = buildUniverseFromPolygon({
    source: UNIVERSE_SOURCE.GAINERS,
    polygonResponse: polygonGainersFixture(),
    now: NOW,
    maxStaleMs: 30_000,    // tighter than the 60s/120s timestamps in fixture
  });
  assert("maxStaleMs drops snapshots older than threshold",
    stale.metadata.droppedReasons.some(d => d.reason === UNIVERSE_DROP_REASON.STALE_SNAPSHOT));

  // Empty inputs do not crash
  const empty = buildUniverseFromPolygon({ source: UNIVERSE_SOURCE.GAINERS, polygonResponse: {} });
  assert("empty Polygon response → empty universe, no throw",
    empty.symbols.length === 0 && empty.metadata.snapshotCount === 0);

  // fetchUniverse with no fetcher records reason but never throws
  const noFetch = await fetchUniverse({ source: UNIVERSE_SOURCE.GAINERS });
  assert("fetchUniverse without fetcher → empty + missing_fetcher reason",
    noFetch.symbols.length === 0
    && noFetch.metadata.droppedReasons.some(d => d.reason === "missing_fetcher"));

  // fetchUniverse with throwing fetcher resolves cleanly
  const failedFetch = await fetchUniverse({
    source: UNIVERSE_SOURCE.GAINERS,
    fetcher: async () => { throw new Error("network down"); },
  });
  assert("fetchUniverse: throwing fetcher → empty + fetch_failed reason",
    failedFetch.symbols.length === 0
    && failedFetch.metadata.droppedReasons.some(d => /fetch_failed/.test(d.reason)));

  // fetchUniverse with mock fetcher succeeds
  const mockFetcher = async (path) => {
    assert("fetchUniverse: path is /v2 gainers", /v2\/snapshot\/.*gainers/.test(path));
    return polygonGainersFixture();
  };
  const fetched = await fetchUniverse({
    source: UNIVERSE_SOURCE.GAINERS, fetcher: mockFetcher, now: NOW,
  });
  assert("fetchUniverse: mock fetcher integrates cleanly",
    fetched.symbols.length === 2);
}

// =================================================================
// 2. polygonOptionsAdapter
// =================================================================
group("polygonOptionsAdapter — chain normalization");
{
  const adapted = buildOptionsDataFromPolygon({
    snapshotsBySymbol: { NVDA: polygonOptionsChainFixture(110) },
    now: NOW,
    contractTypes: ["put"],
  });
  const nvda = adapted.optionsDataBySymbol.NVDA;
  assert("NVDA chain status reflects partial drops",
    nvda.status === OPTIONS_STATUS.PARTIAL || nvda.status === OPTIONS_STATUS.CHAIN_AVAILABLE,
    `got ${nvda.status}`);
  assert("NVDA chain contains put rows only",
    nvda.chain.length > 0 && nvda.chain.every(r => r.type === "put"));
  assert("NVDA chain rows include strike, dte, bid, ask",
    nvda.chain.every(r => Number.isFinite(r.strike) && Number.isFinite(r.dte)
      && Number.isFinite(r.bid) && Number.isFinite(r.ask)));
  // Allow ±1 day for timezone rounding between fixture epoch and 20:00 UTC anchor
  assert("NVDA chain DTE inferred from expiration_date",
    nvda.chain.some(r => Math.abs(r.dte - 14) <= 1)
    && nvda.chain.some(r => Math.abs(r.dte - 21) <= 1));

  // Drops
  assert("expired contract dropped with EXPIRED reason",
    nvda.droppedReasons.some(d => d.reason === OPTIONS_DROP_REASON.EXPIRED));
  assert("missing-strike contract dropped with MISSING_STRIKE",
    nvda.droppedReasons.some(d => d.reason === OPTIONS_DROP_REASON.MISSING_STRIKE));

  // Missing chain → structured absence
  const noChain = buildOptionsDataFromPolygon({
    snapshotsBySymbol: { NOPT: { results: [] } }, now: NOW,
  });
  assert("missing chain → status=no_chain_data, empty array",
    noChain.optionsDataBySymbol.NOPT.status === OPTIONS_STATUS.NO_CHAIN_DATA
    && noChain.optionsDataBySymbol.NOPT.chain.length === 0);

  // fetchOptionsChains with throwing fetcher → no throw
  const failedFetch = await fetchOptionsChains({
    symbols: ["NVDA"],
    fetcher: async () => { throw new Error("net"); },
    now: NOW,
  });
  assert("fetchOptionsChains: failure → structured absence",
    failedFetch.optionsDataBySymbol.NVDA.status === OPTIONS_STATUS.NO_CHAIN_DATA);

  // fetchOptionsChains with successful mock fetcher
  const okFetch = await fetchOptionsChains({
    symbols: ["NVDA"],
    fetcher: async (path) => {
      assert("fetchOptionsChains: path is /v3 snapshot", /v3\/snapshot\/options\/NVDA/.test(path));
      return polygonOptionsChainFixture(110);
    },
    now: NOW,
  });
  assert("fetchOptionsChains: success path produces chain",
    okFetch.optionsDataBySymbol.NVDA.chain.length > 0);
}

// =================================================================
// 3. Adapter → premium engine integration
// =================================================================
group("Options adapter → estimatedPremiumEngine = live path");
{
  const adapted = buildOptionsDataFromPolygon({
    snapshotsBySymbol: { NVDA: polygonOptionsChainFixture(110) },
    now: NOW,
  });
  const result = estimatePremium({
    symbol: "NVDA",
    price: 110,
    optionsChain: adapted.optionsDataBySymbol.NVDA.chain,
    scannerMode: "neutral",
  });
  assert("adapter chain → method=chain_based",
    result.method === "chain_based", `got ${result.method}`);
  assert("adapter chain → premiumSource=live",
    result.premiumSource === PREMIUM_SOURCE.LIVE);

  // No chain falls back through estimatePremium without crashing the scanner
  const fallback = estimatePremium({
    symbol: "ZZNONE", price: 50, scannerMode: "neutral",
  });
  assert("no chain, no IV/ATR → method=insufficient_data",
    fallback.method === "insufficient_data");
}

// =================================================================
// 4. lethalBoardViewModel — pure helper
// =================================================================
group("lethalBoardViewModel — labels & accuracy");
{
  // Empty/null guard
  const vmNull = buildLethalBoardViewModel(null);
  assert("null scanResult → empty view model, no throw",
    vmNull.summary === null && vmNull.rows.length === 0);

  // Build a synthetic scan result with mixed premium sources
  const synthetic = {
    scannerMode: "neutral",
    regimeContext: { detectedRegime: "RISK_ON", marketMode: "neutral" },
    accountStateSummary: {
      availableCash: 50_000, deployableCash: 32_500, reservedCash: 10_000,
      currentlyDeployedCash: 6_000, remainingDeployableCash: 26_500,
      capitalPressureLevel: "LOW", sizingBias: "normal", marketMode: "neutral",
      totalAccountValue: 60_000,
    },
    universeStats: {
      totalSymbolsScanned: 5, catalogedCount: 3, uncatalogedCount: 2,
      candidatesGenerated: 3, rejectedCount: 2,
      optionCandidateCount: 2, sharesCandidateCount: 0,
      bestUseOfCapitalSymbol: "NVDA",
    },
    ranked: [
      {
        rank: 1, symbol: "NVDA", action: ACTION.OPTION_CANDIDATE,
        lethalScore: 92, capitalFit: "good", capitalRequired: 10_450,
        bundles: ["semiconductors", "ai_infrastructure"],
        primaryType: "breakout_candidate",
        bestUseOfCapital: true, displacedBy: null,
        regimeAlignment: "aligned", concentrationWarning: null,
        premiumSource: PREMIUM_SOURCE.LIVE,                       // LIVE
        probabilityStatus: "available",
      },
      {
        rank: 2, symbol: "CRWV", action: ACTION.OPTION_CANDIDATE,
        lethalScore: 78, capitalFit: "good", capitalRequired: 9_025,
        bundles: ["ai_infrastructure", "datacenter_power"],
        primaryType: "volume_expansion_candidate",
        bestUseOfCapital: false, displacedBy: "NVDA",
        regimeAlignment: "aligned",
        concentrationWarning: "Open positions already exposed to ai_infrastructure",
        premiumSource: PREMIUM_SOURCE.ESTIMATED,                  // ESTIMATED
        probabilityStatus: "unavailable",
      },
      {
        rank: 3, symbol: "INTC", action: ACTION.WATCH,
        lethalScore: 55, capitalFit: "excellent", capitalRequired: 3_200,
        bundles: ["unknown"],
        primaryType: "watch_only",
        bestUseOfCapital: false, displacedBy: null,
        regimeAlignment: "neutral",
        premiumSource: PREMIUM_SOURCE.UNAVAILABLE,                // UNAVAILABLE
        probabilityStatus: "unavailable",
      },
    ],
    rejected: [
      { symbol: "STALE", reason: "stale_data", detail: "age 7200s exceeds 900s" },
      { symbol: "TINYVOL", reason: "insufficient_liquidity", detail: "1M < 5M" },
    ],
    warnings: ["Defensive mode — sizing reduced"],
  };

  const vm = buildLethalBoardViewModel(synthetic);

  // Summary
  assert("summary has scannerMode + regime", vm.summary.scannerMode === "neutral" && vm.summary.regime === "RISK_ON");
  assert("summary formats currency", vm.summary.availableCash === "$50,000");
  assert("summary surfaces best symbol", vm.summary.bestUseOfCapitalSymbol === "NVDA");

  // Best card
  assert("best card present", !!vm.best);
  assert("best card symbol = NVDA", vm.best.symbol === "NVDA");
  assert("best card premiumIsLive=true for chain_based source",
    vm.best.premiumIsLive === true);
  assert("best card premiumMethod = 'live' for chain_based source",
    vm.best.premiumMethod === "live");

  // Ranked rows: estimated row must be labeled estimated, NOT live
  const crwvRow = vm.rows.find(r => r.symbol === "CRWV");
  assert("CRWV row premiumMethod = 'estimated'",
    crwvRow.premiumMethod === "estimated", `got ${crwvRow.premiumMethod}`);
  assert("CRWV row premiumIsLive = false",
    crwvRow.premiumIsLive === false);

  // Spec safeguard: estimated must NEVER be labeled live
  const anyMislabel = vm.rows.some(r =>
    r.premiumMethod === "live" && r.premiumIsLive === false);
  assert("never labels estimated premium as live", !anyMislabel);

  // Unavailable row labeled honestly
  const intcRow = vm.rows.find(r => r.symbol === "INTC");
  assert("INTC row premiumMethod = 'unavailable'",
    intcRow.premiumMethod === "unavailable");

  // Displaced
  assert("displaced row references winner",
    vm.displaced.length === 1 && vm.displaced[0].symbol === "CRWV"
    && vm.displaced[0].displacedBy === "NVDA");

  // Rejected
  assert("rejected list preserves reason codes",
    vm.rejected.length === 2
    && vm.rejected.find(r => r.reasonCode === "stale_data")
    && vm.rejected.find(r => r.reasonCode === "insufficient_liquidity"));
  assert("rejected reason has human-readable label",
    vm.rejected[0].reasonLabel && vm.rejected[0].reasonLabel.length > 0
    && vm.rejected[0].reasonLabel !== vm.rejected[0].reasonCode);

  // Warnings pass through
  assert("warnings pass through verbatim",
    vm.warnings.length === 1 && /Defensive/i.test(vm.warnings[0]));

  // No internal weights leak into rows
  const sample = vm.rows[0];
  assert("rows do not expose scoreBreakdown",
    !("scoreBreakdown" in sample) && !("weights" in sample));

  // Labels enum exposed for consumers
  assert("VIEW_LABELS is exported and frozen",
    !!VIEW_LABELS && Object.isFrozen(VIEW_LABELS));
}

// =================================================================
// 5. LethalBoard.jsx — JSX syntax validation via Vite
// =================================================================
group("LethalBoard.jsx — JSX validates");
{
  const src = readFileSync("src/components/discovery/LethalBoard.jsx", "utf8");
  let ok = true;
  let err = null;
  try {
    await transformWithOxc(src, "LethalBoard.jsx", { lang: "jsx" });
  } catch (e) {
    ok = false; err = e?.message || String(e);
  }
  assert("LethalBoard.jsx parses as valid JSX (esbuild)", ok, err);
  assert("LethalBoard.jsx has a default export",
    /export\s+default\s+function\s+LethalBoard/.test(src));
  assert("LethalBoard.jsx imports the view model helper",
    /buildLethalBoardViewModel/.test(src));
}

// =================================================================
// 6. discoveryAlertBridge — events, dedup, no storms
// =================================================================
group("discoveryAlertBridge — translation + dedup");
{
  let clock = 1_000;
  const bridge = createDiscoveryAlertBridge({ now: () => clock, dedupWindowMs: 1000 });

  // First scan: NEW_BEST_OPPORTUNITY
  const a1 = bridge.bridge({
    event: "new_best_opportunity",
    prev: { previousTopSymbol: null, previousTopScore: null },
    next: { previousTopSymbol: "NVDA", previousTopScore: 80, previousTopRank: 1 },
    ranked: [{ symbol: "NVDA", rank: 1, action: ACTION.OPTION_CANDIDATE,
                lethalScore: 80, capitalFit: "good",
                premiumSource: PREMIUM_SOURCE.LIVE,
                bundles: ["semiconductors"], primaryType: "breakout_candidate",
                regimeAlignment: "aligned" }],
  });
  assert("NEW_BEST → emits alert", !!a1 && a1.shouldAlert === true);
  assert("NEW_BEST → priority high (option candidate)",
    a1.priority === "high");
  assert("alert card has only safe top-line fields",
    "score" in a1.card && !("scoreBreakdown" in a1.card));
  assert("alert summary mentions symbol + action",
    /NVDA/.test(a1.summary) && /option_candidate/.test(a1.summary));

  // Within dedup window — same event, same symbol → suppressed
  clock += 500;
  const a2 = bridge.bridge({
    event: "new_best_opportunity",
    prev: { previousTopSymbol: "NVDA", previousTopScore: 80 },
    next: { previousTopSymbol: "NVDA", previousTopScore: 80, previousTopRank: 1 },
    ranked: [{ symbol: "NVDA", rank: 1, action: ACTION.OPTION_CANDIDATE,
                lethalScore: 80, premiumSource: PREMIUM_SOURCE.LIVE }],
  });
  assert("same event within dedup window → null", a2 === null);

  // Past dedup window
  clock += 600;       // now > 1100ms past first emit
  const a3 = bridge.bridge({
    event: "new_best_opportunity",
    prev: { previousTopSymbol: "NVDA" },
    next: { previousTopSymbol: "NVDA", previousTopScore: 81, previousTopRank: 1 },
    ranked: [{ symbol: "NVDA", rank: 1, action: ACTION.OPTION_CANDIDATE,
                lethalScore: 81, premiumSource: PREMIUM_SOURCE.LIVE }],
  });
  assert("after dedup window → emits again", a3 !== null && a3.shouldAlert);

  // TRADE_DISPLACED for a different symbol — different dedup key, fires immediately
  clock += 100;
  const a4 = bridge.bridge({
    event: "trade_displaced_by_better_opportunity",
    prev: { previousTopSymbol: "NVDA", previousTopScore: 81 },
    next: { previousTopSymbol: "AMD", previousTopScore: 84, previousTopRank: 1 },
    ranked: [{ symbol: "AMD", rank: 1, action: ACTION.OPTION_CANDIDATE,
                lethalScore: 84, premiumSource: PREMIUM_SOURCE.LIVE }],
  });
  assert("TRADE_DISPLACED → emits", a4 !== null && a4.shouldAlert);
  assert("TRADE_DISPLACED → priority high", a4.priority === "high");
  assert("displaced summary mentions both symbols",
    /AMD/.test(a4.summary) && /NVDA/.test(a4.summary));

  // NO_CHANGE → null
  const a5 = bridge.bridge({
    event: "no_change",
    next: { previousTopSymbol: "AMD", previousTopScore: 84 },
  });
  assert("NO_CHANGE → null (no storm)", a5 === null);

  // No symbol → null
  const a6 = bridge.bridge({ event: "new_best_opportunity", next: { previousTopSymbol: null } });
  assert("missing symbol → null", a6 === null);

  // Bridge dedup state inspectable
  const recent = bridge.peekRecent();
  assert("peekRecent surfaces dedup keys", Array.isArray(recent) && recent.length >= 2);
  bridge.reset();
  assert("reset clears dedup state", bridge.peekRecent().length === 0);

  assert("DEFAULT_BRIDGE_DEDUP_WINDOW_MS exported",
    DEFAULT_BRIDGE_DEDUP_WINDOW_MS === 15 * 60 * 1000);
}

// =================================================================
// 7. End-to-end pipeline using only adapters + scanner + bridge
// =================================================================
group("End-to-end: universe adapter → scanner → bridge");
{
  const universe = buildUniverseFromPolygon({
    source: UNIVERSE_SOURCE.GAINERS,
    polygonResponse: polygonGainersFixture(),
    now: NOW,
  });
  const optionsAdapted = buildOptionsDataFromPolygon({
    snapshotsBySymbol: { NVDA: polygonOptionsChainFixture(113.5) },
    now: NOW,
  });

  // Inject ATR/IV proxies that the universe doesn't provide
  for (const sym of Object.keys(universe.marketDataBySymbol)) {
    const md = universe.marketDataBySymbol[sym];
    md.atrExpansion = 1.4;
    md.distanceToSupportPct = 1.5;
    md.near20DayHigh = true;
    md.detectedRegime = "RISK_ON";
    md.iv = 35;
  }

  const result = runMarketDiscoveryScan({
    symbols: universe.symbols,
    marketDataBySymbol: universe.marketDataBySymbol,
    optionsDataBySymbol: { NVDA: optionsAdapted.optionsDataBySymbol.NVDA },
    accountState: {
      totalAccountValue: 60_000, availableCash: 50_000,
      maxDeployedPct: 0.65, reservedCashBufferPct: 0.20, marketMode: "neutral",
    },
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode: "neutral",
    now: NOW,
  });
  assert("e2e: scanner returns ranked candidates", Array.isArray(result.ranked) && result.ranked.length > 0);
  assert("e2e: NVDA premium source = LIVE (chain reached engine)",
    result.ranked.find(r => r.symbol === "NVDA")?.premiumSource === PREMIUM_SOURCE.LIVE);

  // Wire to scanner state store + bridge
  const store = createScannerStateStore();
  const top = result.ranked[0];
  const scanEvt = store.recordScan({
    topCandidate: { symbol: top.symbol, lethalScore: top.lethalScore, rank: top.rank },
    now: NOW,
  });
  const bridge = createDiscoveryAlertBridge({ now: () => NOW });
  const alert = bridge.bridge({ event: scanEvt.event, prev: scanEvt.prev, next: scanEvt.next, ranked: result.ranked });
  assert("e2e: first scan emits an alert through the bridge", !!alert && alert.shouldAlert);

  // View model end-to-end
  const vm = buildLethalBoardViewModel(result);
  assert("e2e: view model exposes best symbol",
    vm.best && vm.best.symbol === top.symbol);
  assert("e2e: view model labels NVDA premium as live",
    vm.rows.find(r => r.symbol === "NVDA")?.premiumMethod === "live");
}

// =================================================================
// SUMMARY
// =================================================================
console.log("\n  ────────────────────────────");
console.log(`  ${passed} passed · ${failed} failed`);
console.log("  ────────────────────────────\n");

if (failed > 0) {
  console.log("  Failures:");
  for (const f of failureLines) console.log(`    - ${f}`);
  process.exit(1);
} else {
  // Example UI behavior demonstration
  const universe = buildUniverseFromPolygon({
    source: UNIVERSE_SOURCE.GAINERS,
    polygonResponse: polygonGainersFixture(),
    now: NOW,
  });
  const optionsAdapted = buildOptionsDataFromPolygon({
    snapshotsBySymbol: { NVDA: polygonOptionsChainFixture(113.5) },
    now: NOW,
  });
  for (const sym of Object.keys(universe.marketDataBySymbol)) {
    const md = universe.marketDataBySymbol[sym];
    md.atrExpansion = 1.4; md.distanceToSupportPct = 1.5;
    md.near20DayHigh = true; md.detectedRegime = "RISK_ON"; md.iv = 35;
  }
  const result = runMarketDiscoveryScan({
    symbols: universe.symbols,
    marketDataBySymbol: universe.marketDataBySymbol,
    optionsDataBySymbol: { NVDA: optionsAdapted.optionsDataBySymbol.NVDA },
    accountState: {
      totalAccountValue: 60_000, availableCash: 50_000,
      maxDeployedPct: 0.65, reservedCashBufferPct: 0.20, marketMode: "neutral",
    },
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode: "neutral", now: NOW,
  });
  const vm = buildLethalBoardViewModel(result);

  console.log("\n  Lethal Board view model — example output:\n");
  console.log("  Header:");
  console.log(`    mode=${vm.summary.scannerMode}  regime=${vm.summary.regime}  pressure=${vm.summary.capitalPressureLevel}`);
  console.log(`    avail=${vm.summary.availableCash}  deployable=${vm.summary.deployableCash}  bestUse=${vm.summary.bestUseOfCapitalSymbol}`);
  console.log("\n  Best Opportunity:");
  if (vm.best) {
    const livenessTag = vm.best.premiumIsLive ? "[LIVE]" : "[ESTIMATED]";
    console.log(`    ${vm.best.symbol}  ${vm.best.action}  score=${vm.best.score}  fit=${vm.best.capitalFit}  premium=${vm.best.premiumMethod} ${livenessTag}`);
    for (const r of vm.best.keyReasons) console.log(`      + ${r}`);
    for (const r of vm.best.risks) console.log(`      ! ${r}`);
  } else {
    console.log("    (no best use this cycle)");
  }
  console.log("\n  Ranked rows:");
  for (const r of vm.rows.slice(0, 5)) {
    const star = r.isBestUseOfCapital ? "★" : " ";
    console.log(`    ${star} #${r.rank} ${r.symbol}  ${r.action}  score=${r.score}  fit=${r.capitalFit}  premium=${r.premiumMethod}  ${r.reasonSummary}`);
  }
  if (vm.displaced.length > 0) {
    console.log("\n  Displaced:");
    for (const d of vm.displaced) console.log(`    ${d.symbol} → ${d.displacedBy}  (${d.reason})`);
  }
  if (vm.rejected.length > 0) {
    console.log("\n  Rejected:");
    for (const r of vm.rejected) console.log(`    ${r.symbol} · ${r.reasonLabel}  (${r.detail})`);
  }
  if (vm.warnings.length > 0) {
    console.log("\n  Warnings:");
    for (const w of vm.warnings) console.log(`    ${w}`);
  }
  process.exit(0);
}
