#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4 tests
// Run: npm run test:discovery-phase4
// =====================================================
//
// Covers:
//   - polygonGlue: success / fallback / circuit breaker / capability probe
//   - options capability unavailable → never labeled live
//   - main.jsx + App.jsx nav route presence (file inspection)
//   - discoveryAlertWireup: emits state transitions, suppresses no_change
//   - live vs fallback metadata shape
//   - end-to-end with injected fetcher (offline)
// =====================================================

import { readFileSync } from "node:fs";

import {
  createPolygonGlue,
  fetchScannerInputBundle,
  GLUE_SOURCE,
  OPTIONS_CAPABILITY,
} from "../src/engines/discovery/polygonGlue.js";

import {
  UNIVERSE_SOURCE,
} from "../src/engines/discovery/polygonUniverseAdapter.js";

import {
  OPTIONS_STATUS,
} from "../src/engines/discovery/polygonOptionsAdapter.js";

import {
  estimatePremium,
} from "../src/engines/discovery/estimatedPremiumEngine.js";

import {
  runMarketDiscoveryScan,
} from "../src/engines/discovery/marketDiscoveryScanner.js";

import {
  createDiscoveryAlertWireup,
} from "../src/engines/discovery/discoveryAlertWireup.js";

import {
  PREMIUM_SOURCE,
  ACTION,
  SCANNER_STATE_EVENT,
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

const NOW = 1_756_000_000_000;
let mockClock = NOW;
const clock = () => mockClock;

// --------------------------------------------------
// FIXTURES
// --------------------------------------------------

function gainersPayload() {
  return {
    status: "OK",
    tickers: [
      {
        ticker: "NVDA", todaysChange: 4.5, todaysChangePerc: 4.13,
        updated: (NOW - 60_000) * 1_000_000,
        day: { c: 113.5, h: 114.0, l: 109.0, o: 110.0, v: 35_000_000, vw: 112.0 },
        prevDay: { c: 109.0, v: 30_000_000 },
      },
      {
        ticker: "CRWV", todaysChange: 3.2, todaysChangePerc: 3.45,
        updated: (NOW - 120_000) * 1_000_000,
        day: { c: 96.0, v: 12_000_000, vw: 95.0 },
        prevDay: { c: 92.8, v: 8_000_000 },
      },
    ],
  };
}

function optionsPayloadFor(_symbol, basePrice) {
  const exp14 = NOW + 14 * 86_400_000;
  return {
    results: [
      {
        details: { contract_type: "put", strike_price: basePrice * 0.95,
                   expiration_date: new Date(exp14).toISOString().slice(0, 10) },
        last_quote: { bid: 1.10, ask: 1.12, midpoint: 1.11 },
        implied_volatility: 0.32,
        open_interest: 1500,
        day: { volume: 800 },
      },
    ],
  };
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 4");
console.log("  ════════════════════════════════════════════");

// =================================================================
// 1. polygonGlue — success path
// =================================================================
group("polygonGlue — success path");
{
  let calls = 0;
  const mockFetcher = async (path) => {
    calls += 1;
    if (path.includes("/v3/snapshot/options/")) {
      // Capability probe AND fetchOptions both hit this path
      const m = path.match(/\/v3\/snapshot\/options\/([A-Z]+)/);
      const sym = m ? m[1] : "AAPL";
      const basePrice = sym === "NVDA" ? 113.5 : sym === "CRWV" ? 96 : 100;
      return optionsPayloadFor(sym, basePrice);
    }
    if (path.includes("/v2/snapshot/locale/")) {
      return gainersPayload();
    }
    return { status: "OK", results: [] };
  };

  const glue = createPolygonGlue({ fetcher: mockFetcher, now: clock });

  const universe = await glue.fetchUniverseLive({ source: UNIVERSE_SOURCE.GAINERS });
  assert("live universe: source=live",
    universe.metadata.source === GLUE_SOURCE.LIVE);
  assert("live universe: 2 symbols normalized",
    universe.symbols.length === 2);
  assert("live universe: includes generatedAt",
    Number.isFinite(universe.metadata.generatedAt));
  assert("live universe: breaker closed after success",
    universe.metadata.breakerState === "closed");

  const cap = await glue.probeOptionsCapability("AAPL");
  assert("capability probe: AVAILABLE when fetcher returns results",
    cap.optionsCapability === OPTIONS_CAPABILITY.AVAILABLE);

  const opts = await glue.fetchOptionsLive({ symbols: ["NVDA", "CRWV"] });
  assert("live options: source=live",
    opts.metadata.source === GLUE_SOURCE.LIVE);
  assert("live options: NVDA chain has rows",
    opts.optionsDataBySymbol.NVDA.chain.length > 0);
}

// =================================================================
// 2. polygonGlue — fallback when fetcher throws
// =================================================================
group("polygonGlue — fallback when fetcher throws");
{
  const throwingFetcher = async () => { throw new Error("network_down"); };
  const glue = createPolygonGlue({
    fetcher: throwingFetcher,
    now: clock,
    circuitOptions: { failureThreshold: 3, cooldownMs: 60_000 },
  });

  const u1 = await glue.fetchUniverseLive({ source: UNIVERSE_SOURCE.GAINERS });
  assert("throwing fetcher → source=fallback",
    u1.metadata.source === GLUE_SOURCE.FALLBACK,
    `got ${u1.metadata.source}`);
  assert("throwing fetcher → empty marketDataBySymbol",
    Object.keys(u1.marketDataBySymbol).length === 0);
  assert("throwing fetcher → reason captured",
    /network_down|fetch_failed/.test(u1.metadata.reason || ""));

  // After enough failures the circuit should open
  await glue.fetchUniverseLive({ source: UNIVERSE_SOURCE.GAINERS });
  await glue.fetchUniverseLive({ source: UNIVERSE_SOURCE.GAINERS });
  const state = glue.getCircuitState();
  assert("circuit opens after 3 consecutive failures",
    state.state === "open" && state.consecutiveFailures >= 3);

  const u4 = await glue.fetchUniverseLive({ source: UNIVERSE_SOURCE.GAINERS });
  assert("subsequent call short-circuits with circuit_open",
    u4.metadata.source === GLUE_SOURCE.CIRCUIT_OPEN);

  // Advance clock past cooldown → half_open
  mockClock = NOW + 120_000;
  const stateAfter = glue.getCircuitState();
  assert("circuit transitions to half_open after cooldown",
    stateAfter.state === "half_open");
  mockClock = NOW;   // reset for downstream tests
}

// =================================================================
// 3. polygonGlue — capability probe unavailable → no live label
// =================================================================
group("polygonGlue — options capability unavailable");
{
  const fetcherCapFails = async (path) => {
    if (path.includes("/v3/snapshot/options/")) {
      const err = new Error("403 forbidden");
      err.status = 403;
      throw err;
    }
    if (path.includes("/v2/snapshot/locale/")) return gainersPayload();
    return { status: "OK" };
  };
  const glue = createPolygonGlue({ fetcher: fetcherCapFails, now: clock });

  const cap = await glue.probeOptionsCapability();
  assert("capability probe: UNAVAILABLE when /v3 endpoint forbidden",
    cap.optionsCapability === OPTIONS_CAPABILITY.UNAVAILABLE);

  const opts = await glue.fetchOptionsLive({ symbols: ["NVDA"] });
  assert("options fetch with capability=unavailable → source=fallback",
    opts.metadata.source === GLUE_SOURCE.FALLBACK);
  assert("options fetch capability surfaced in metadata",
    opts.metadata.capability?.optionsCapability === OPTIONS_CAPABILITY.UNAVAILABLE);
  assert("optionsDataBySymbol.NVDA has empty chain (no_chain_data)",
    opts.optionsDataBySymbol.NVDA.chain.length === 0
    && opts.optionsDataBySymbol.NVDA.status === OPTIONS_STATUS.NO_CHAIN_DATA);

  // Premium engine receiving an empty chain must NOT label as live.
  const premium = estimatePremium({
    symbol: "NVDA", price: 113.5,
    optionsChain: opts.optionsDataBySymbol.NVDA.chain,
    iv: 35,
    scannerMode: "neutral",
  });
  assert("premium method falls back to iv_estimated (not chain_based)",
    premium.method === "iv_estimated", `got ${premium.method}`);
  assert("premium source is ESTIMATED (never labeled live)",
    premium.premiumSource === PREMIUM_SOURCE.ESTIMATED);
}

// =================================================================
// 4. fetchScannerInputBundle metadata shape
// =================================================================
group("fetchScannerInputBundle — metadata shape");
{
  const okFetcher = async (path) => {
    if (path.includes("/v3/snapshot/options/")) {
      const m = path.match(/\/v3\/snapshot\/options\/([A-Z]+)/);
      const sym = m ? m[1] : "AAPL";
      const basePrice = sym === "NVDA" ? 113.5 : 95;
      return optionsPayloadFor(sym, basePrice);
    }
    if (path.includes("/v2/snapshot/locale/")) return gainersPayload();
    return { status: "OK" };
  };
  const glue = createPolygonGlue({ fetcher: okFetcher, now: clock });
  const bundle = await fetchScannerInputBundle({
    glue, universeSource: UNIVERSE_SOURCE.GAINERS,
  });
  assert("bundle: includes universe metadata", !!bundle.metadata.universe);
  assert("bundle: includes options metadata", !!bundle.metadata.options);
  assert("bundle: includes circuit metadata", !!bundle.metadata.circuit);
  assert("bundle: universe source=live", bundle.metadata.universe.source === GLUE_SOURCE.LIVE);
  assert("bundle: options source=live", bundle.metadata.options.source === GLUE_SOURCE.LIVE);
}

// =================================================================
// 5. Fallback bundle (entirely failed) is structured, not crashed
// =================================================================
group("fetchScannerInputBundle — full failure → structured fallback");
{
  const failingFetcher = async () => { throw new Error("dns_timeout"); };
  const glue = createPolygonGlue({
    fetcher: failingFetcher, now: clock,
    circuitOptions: { failureThreshold: 5, cooldownMs: 60_000 },
  });
  const bundle = await fetchScannerInputBundle({
    glue, universeSource: UNIVERSE_SOURCE.GAINERS,
  });
  assert("failed bundle: symbols list empty", bundle.symbols.length === 0);
  assert("failed bundle: universe source=fallback",
    bundle.metadata.universe.source === GLUE_SOURCE.FALLBACK);
  // Options skipped because no symbols — source=empty
  assert("failed bundle: options source=empty when no symbols",
    bundle.metadata.options.source === GLUE_SOURCE.EMPTY);
}

// =================================================================
// 6. Nav wire-up: main.jsx + App.jsx route presence
// =================================================================
group("Nav wire-up — main.jsx + App.jsx route presence");
{
  const mainSrc = readFileSync("src/main.jsx", "utf8");
  assert("main.jsx imports LethalBoardPage",
    /import\s+LethalBoardPage\s+from\s+['"][^'"]+LethalBoardPage\.jsx['"]/.test(mainSrc));
  assert("main.jsx renders LethalBoardPage on lethal-board route",
    /page\s*===\s*["']lethal-board["']/.test(mainSrc)
    && /<LethalBoardPage/.test(mainSrc));
  assert("main.jsx wires onOpenLethal callback into App",
    /onOpenLethal\s*=\s*\{?\s*\(\s*\)\s*=>\s*setPage\(\s*["']lethal-board["']\s*\)/.test(mainSrc));

  const appSrc = readFileSync("src/App.jsx", "utf8");
  assert("App.jsx accepts onOpenLethal prop",
    /onOpenLethal/.test(appSrc));
  assert("App.jsx renders LETHAL BOARD button (desktop)",
    /LETHAL BOARD/.test(appSrc));
  assert("App.jsx renders LB button (mobile)",
    /onOpenLethal[^]*?>LB</.test(appSrc) || />\s*LB\s*</.test(appSrc));
}

// =================================================================
// 7. discoveryAlertWireup — events, suppression, dedup
// =================================================================
group("discoveryAlertWireup — events + suppression");
{
  const recorded = [];
  const recordAlertFn = (alert) => recorded.push(alert);
  let wireClock = 1_000;
  const wireup = createDiscoveryAlertWireup({
    recordAlertFn,
    now: () => wireClock,
  });

  function fakeScan(symbol, score) {
    return {
      ranked: [{
        symbol, lethalScore: score, rank: 1,
        action: ACTION.OPTION_CANDIDATE,
        capitalFit: "good", premiumSource: PREMIUM_SOURCE.LIVE,
        bundles: ["semiconductors"], primaryType: "breakout_candidate",
        regimeAlignment: "aligned", bestUseOfCapital: true,
      }],
      bestUseOfCapital: { symbol, lethalScore: score, rank: 1, action: ACTION.OPTION_CANDIDATE,
                          capitalFit: "good", premiumSource: PREMIUM_SOURCE.LIVE,
                          bundles: ["semiconductors"], primaryType: "breakout_candidate",
                          regimeAlignment: "aligned" },
    };
  }

  // First scan emits new_best_opportunity and records.
  const r1 = wireup.route(fakeScan("NVDA", 80));
  assert("first scan: event=new_best_opportunity",
    r1.event === SCANNER_STATE_EVENT.NEW_BEST_OPPORTUNITY);
  assert("first scan: recorded=true", r1.recorded === true);
  assert("first scan: alert payload exists", !!r1.alert && r1.alert.shouldAlert);
  assert("first scan: alertHistory received the alert",
    recorded.length === 1 && recorded[0].card.symbol === "NVDA");

  // Same symbol, similar score → no_change → no alert, no record.
  wireClock += 5000;
  const r2 = wireup.route(fakeScan("NVDA", 80.3));
  assert("same symbol same score: event=no_change",
    r2.event === SCANNER_STATE_EVENT.NO_CHANGE);
  assert("same symbol same score: alert=null",
    r2.alert === null);
  assert("same symbol same score: not recorded",
    r2.recorded === false);
  assert("recorded count unchanged", recorded.length === 1);

  // Different symbol → trade_displaced → alert + record.
  wireClock += 5000;
  const r3 = wireup.route(fakeScan("AMD", 85));
  assert("different symbol: event=trade_displaced",
    r3.event === SCANNER_STATE_EVENT.TRADE_DISPLACED);
  assert("different symbol: recorded=true", r3.recorded === true);
  assert("recorded count = 2", recorded.length === 2);

  // Same different-symbol event within bridge dedup window → suppressed.
  wireClock += 5000;
  const r4 = wireup.route(fakeScan("AMD", 86));
  // Bridge dedup is keyed on event:symbol → AMD repeats the no_change branch
  // (state stored AMD on r3, so this is just a small-delta no-change scenario).
  assert("AMD repeated → no_change suppression",
    r4.event === SCANNER_STATE_EVENT.NO_CHANGE && r4.alert === null);

  // Stats
  const s = wireup.stats();
  assert("stats: totalScans=4", s.totalScans === 4);
  assert("stats: totalAlerts=2", s.totalAlerts === 2);
  assert("stats: byEvent['new_best_opportunity']=1",
    s.byEvent[SCANNER_STATE_EVENT.NEW_BEST_OPPORTUNITY] === 1);
  assert("stats: byEvent['trade_displaced_by_better_opportunity']=1",
    s.byEvent[SCANNER_STATE_EVENT.TRADE_DISPLACED] === 1);
  assert("stats: byEvent['no_change']=2",
    s.byEvent[SCANNER_STATE_EVENT.NO_CHANGE] === 2);
}

// =================================================================
// 8. Wire-up tolerates a throwing recordAlertFn
// =================================================================
group("discoveryAlertWireup — recordAlertFn throwing must not crash");
{
  const wireup = createDiscoveryAlertWireup({
    recordAlertFn: () => { throw new Error("disk_full"); },
  });
  const result = wireup.route({
    ranked: [{ symbol: "NVDA", lethalScore: 80, rank: 1, bestUseOfCapital: true,
               action: ACTION.OPTION_CANDIDATE, capitalFit: "good",
               premiumSource: PREMIUM_SOURCE.LIVE, bundles: [], primaryType: "x" }],
  });
  assert("throwing recordAlertFn → recorded=false (not propagated)",
    result.recorded === false);
  assert("throwing recordAlertFn → event still emitted",
    result.event === SCANNER_STATE_EVENT.NEW_BEST_OPPORTUNITY);
  assert("throwing recordAlertFn → alert object still returned",
    !!result.alert && result.alert.shouldAlert);
}

// =================================================================
// 9. End-to-end: glue → scanner → wireup
// =================================================================
group("End-to-end: glue → scanner → wireup → alert");
{
  const okFetcher = async (path) => {
    if (path.includes("/v3/snapshot/options/")) {
      const m = path.match(/\/v3\/snapshot\/options\/([A-Z]+)/);
      const sym = m ? m[1] : "AAPL";
      const basePrice = sym === "NVDA" ? 113.5 : 95;
      return optionsPayloadFor(sym, basePrice);
    }
    if (path.includes("/v2/snapshot/locale/")) return gainersPayload();
    return { status: "OK" };
  };
  const glue = createPolygonGlue({ fetcher: okFetcher, now: clock });
  const bundle = await fetchScannerInputBundle({
    glue, universeSource: UNIVERSE_SOURCE.GAINERS,
  });

  // Inject the missing structural hints the scanner classifier needs
  for (const sym of Object.keys(bundle.marketDataBySymbol)) {
    const md = bundle.marketDataBySymbol[sym];
    md.atrExpansion = 1.4; md.distanceToSupportPct = 1.5;
    md.near20DayHigh = true; md.detectedRegime = "RISK_ON"; md.iv = 35;
  }

  const result = runMarketDiscoveryScan({
    symbols: bundle.symbols,
    marketDataBySymbol: bundle.marketDataBySymbol,
    optionsDataBySymbol: bundle.optionsDataBySymbol,
    accountState: {
      totalAccountValue: 60_000, availableCash: 50_000,
      maxDeployedPct: 0.65, reservedCashBufferPct: 0.20, marketMode: "neutral",
    },
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode: "neutral", now: NOW,
  });

  assert("e2e: at least one ranked candidate", result.ranked.length > 0);
  const top = result.ranked[0];
  assert("e2e: top candidate has live premium source",
    top.premiumSource === PREMIUM_SOURCE.LIVE);

  const recorded = [];
  const wireup = createDiscoveryAlertWireup({
    recordAlertFn: (a) => recorded.push(a),
    now: () => NOW,
  });
  const w1 = wireup.route(result);
  assert("e2e: wire-up emits alert on first scan",
    w1.event === SCANNER_STATE_EVENT.NEW_BEST_OPPORTUNITY && w1.recorded);
  assert("e2e: alert card carries safe top-line fields only",
    !!recorded[0].card.symbol && !("scoreBreakdown" in recorded[0].card));
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
  // Example metadata samples
  console.log("\n  Example LIVE-success metadata:");
  const okFetcher = async (path) => {
    if (path.includes("/v3/snapshot/options/")) {
      const m = path.match(/\/v3\/snapshot\/options\/([A-Z]+)/);
      const sym = m ? m[1] : "AAPL";
      const basePrice = sym === "NVDA" ? 113.5 : 95;
      return optionsPayloadFor(sym, basePrice);
    }
    if (path.includes("/v2/snapshot/locale/")) return gainersPayload();
    return { status: "OK" };
  };
  const glueOk = createPolygonGlue({ fetcher: okFetcher, now: () => NOW });
  const live = await fetchScannerInputBundle({
    glue: glueOk, universeSource: UNIVERSE_SOURCE.GAINERS,
  });
  console.log(JSON.stringify({
    universe: live.metadata.universe,
    options: live.metadata.options,
    circuit: live.metadata.circuit,
  }, null, 2).split("\n").map(s => "  " + s).join("\n"));

  console.log("\n  Example FALLBACK metadata (network down):");
  const failingFetcher = async () => { throw new Error("network_unreachable"); };
  const glueFail = createPolygonGlue({ fetcher: failingFetcher, now: () => NOW });
  const fb = await fetchScannerInputBundle({
    glue: glueFail, universeSource: UNIVERSE_SOURCE.GAINERS,
  });
  console.log(JSON.stringify({
    universe: fb.metadata.universe,
    options: fb.metadata.options,
    circuit: fb.metadata.circuit,
  }, null, 2).split("\n").map(s => "  " + s).join("\n"));
  process.exit(0);
}
