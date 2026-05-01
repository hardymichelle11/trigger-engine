#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.5A tests
// Run: npm run test:discovery-phase4-5a
// =====================================================
//
// Verifies session-aware universe sourcing:
//   - Market-session detector boundaries
//   - Curated watchlist construction (cap, AI-infra first, cash-settled excluded)
//   - polygonUniverseAdapter retires MOST_ACTIVE mapping (no /most_active path)
//   - polygonGlue distinguishes 403 (UNAVAILABLE_PLAN) from generic failure
//   - sessionAwareUniverse picks the right strategy per session
//   - 404 universe failure returns structured fallback safely
//   - LethalBoardPage uses SESSION_AWARE (not MOST_ACTIVE)
//   - No live-chain fields appear when entitlement unavailable
// =====================================================

import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";

import {
  classifyMarketSession,
  isExtendedHours,
  isMarketOpen,
  SESSION,
} from "../src/engines/discovery/marketSession.js";

import {
  buildCuratedWatchlist,
  getCuratedSymbols,
  DEFAULT_CAP,
} from "../src/engines/discovery/extendedHoursWatchlist.js";

import {
  UNIVERSE_SOURCE,
  DEPRECATED_SOURCE_MARKER,
  buildUniverseFromPolygon,
  fetchUniverse,
} from "../src/engines/discovery/polygonUniverseAdapter.js";

import {
  createPolygonGlue,
  fetchScannerInputBundle,
  GLUE_SOURCE,
  OPTIONS_CAPABILITY,
} from "../src/engines/discovery/polygonGlue.js";

import {
  fetchSessionAwareUniverse,
  UNIVERSE_STRATEGY,
} from "../src/engines/discovery/sessionAwareUniverse.js";

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

function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// --------------------------------------------------
// FIXTURES — fixed ET moments via ISO strings with offset
// --------------------------------------------------

// EDT (UTC-4): March 8 → November 1 (approx). Our test dates use mid-May.
// Friday 2026-05-15 EDT (UTC-4)
const FRI_03_59_ET = Date.parse("2026-05-15T03:59:00-04:00");
const FRI_04_00_ET = Date.parse("2026-05-15T04:00:00-04:00");
const FRI_09_29_ET = Date.parse("2026-05-15T09:29:00-04:00");
const FRI_09_30_ET = Date.parse("2026-05-15T09:30:00-04:00");
const FRI_13_30_ET = Date.parse("2026-05-15T13:30:00-04:00");
const FRI_15_59_ET = Date.parse("2026-05-15T15:59:00-04:00");
const FRI_16_00_ET = Date.parse("2026-05-15T16:00:00-04:00");
const FRI_19_59_ET = Date.parse("2026-05-15T19:59:00-04:00");
const FRI_20_00_ET = Date.parse("2026-05-15T20:00:00-04:00");
// Saturday 2026-05-16 EDT
const SAT_13_30_ET = Date.parse("2026-05-16T13:30:00-04:00");
// Sunday 2026-05-17 EDT
const SUN_10_00_ET = Date.parse("2026-05-17T10:00:00-04:00");

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.5A");
console.log("  ════════════════════════════════════════════");

// =================================================================
// 1. Market-session detector
// =================================================================
group("marketSession — boundary classification");
{
  assert("03:59 ET Friday → closed",
    classifyMarketSession({ now: FRI_03_59_ET }).session === SESSION.CLOSED);
  assert("04:00 ET Friday → premarket",
    classifyMarketSession({ now: FRI_04_00_ET }).session === SESSION.PREMARKET);
  assert("09:29 ET Friday → premarket",
    classifyMarketSession({ now: FRI_09_29_ET }).session === SESSION.PREMARKET);
  assert("09:30 ET Friday → regular",
    classifyMarketSession({ now: FRI_09_30_ET }).session === SESSION.REGULAR);
  assert("13:30 ET Friday → regular",
    classifyMarketSession({ now: FRI_13_30_ET }).session === SESSION.REGULAR);
  assert("15:59 ET Friday → regular",
    classifyMarketSession({ now: FRI_15_59_ET }).session === SESSION.REGULAR);
  assert("16:00 ET Friday → postmarket",
    classifyMarketSession({ now: FRI_16_00_ET }).session === SESSION.POSTMARKET);
  assert("19:59 ET Friday → postmarket",
    classifyMarketSession({ now: FRI_19_59_ET }).session === SESSION.POSTMARKET);
  assert("20:00 ET Friday → closed",
    classifyMarketSession({ now: FRI_20_00_ET }).session === SESSION.CLOSED);

  // Weekends always closed
  assert("Saturday 13:30 ET → closed (weekend)",
    classifyMarketSession({ now: SAT_13_30_ET }).session === SESSION.CLOSED);
  assert("Sunday 10:00 ET → closed (weekend)",
    classifyMarketSession({ now: SUN_10_00_ET }).session === SESSION.CLOSED);

  // isWeekend / isHoliday
  const sat = classifyMarketSession({ now: SAT_13_30_ET });
  assert("Saturday isWeekend=true", sat.isWeekend === true);
  assert("isHoliday=false (4.5A defers holiday detection)", sat.isHoliday === false);

  // Determinism
  const a = classifyMarketSession({ now: FRI_13_30_ET });
  const b = classifyMarketSession({ now: FRI_13_30_ET });
  assert("identical now → identical output (deterministic)",
    JSON.stringify(a) === JSON.stringify(b));

  // Frozen output
  assert("output is frozen (immutable)", Object.isFrozen(a));

  // Predicates
  assert("isExtendedHours(premarket) = true", isExtendedHours(SESSION.PREMARKET));
  assert("isExtendedHours(postmarket) = true", isExtendedHours(SESSION.POSTMARKET));
  assert("isExtendedHours(regular) = false", !isExtendedHours(SESSION.REGULAR));
  assert("isMarketOpen(closed) = false", !isMarketOpen(SESSION.CLOSED));
  assert("isMarketOpen(regular) = true", isMarketOpen(SESSION.REGULAR));
}

// =================================================================
// 2. Curated watchlist
// =================================================================
group("extendedHoursWatchlist — curated symbol construction");
{
  const built = buildCuratedWatchlist();
  assert("returns symbols array",
    Array.isArray(built.symbols) && built.symbols.length > 0);
  assert("default cap is 50", DEFAULT_CAP === 50);
  assert("symbols length ≤ cap",
    built.symbols.length <= DEFAULT_CAP);

  // Cash-settled exclusion
  assert("SPX excluded (cash-settled)", !built.symbols.includes("SPX"));
  assert("VIX excluded (cash-settled)", !built.symbols.includes("VIX"));
  assert("droppedCashSettled records exclusions",
    built.metadata.droppedCashSettled.includes("SPX") || built.metadata.droppedCashSettled.includes("VIX"));

  // AI-infra first
  const aiNames = ["NVDA", "AMD", "NBIS", "CRWV", "SMCI", "PLTR"];
  const firstFew = built.symbols.slice(0, 12);
  const aiInFirstChunk = firstFew.filter(s => aiNames.includes(s));
  assert("AI-infra names appear in the leading slice",
    aiInFirstChunk.length >= 2);
  assert("aiInfraCount > 0", built.metadata.aiInfraCount > 0);

  // Custom cap
  const small = buildCuratedWatchlist({ cap: 10 });
  assert("explicit cap=10 caps result", small.symbols.length === 10);

  // Hard cap on absurd input
  const huge = buildCuratedWatchlist({ cap: 9999 });
  assert("cap clamped to ≤ 250 internal hard cap",
    huge.symbols.length <= 250);

  // Extra symbols append + dedupe
  const withExtra = buildCuratedWatchlist({ extraSymbols: ["NVDA", "ZZNEW"], cap: 60 });
  assert("explicit extra symbol included", withExtra.symbols.includes("ZZNEW"));
  assert("duplicate (NVDA) not double-added",
    withExtra.symbols.filter(s => s === "NVDA").length === 1);

  // Convenience export
  assert("getCuratedSymbols returns plain array",
    Array.isArray(getCuratedSymbols()) && getCuratedSymbols().length > 0);

  // Determinism
  const x = buildCuratedWatchlist();
  const y = buildCuratedWatchlist();
  assert("buildCuratedWatchlist deterministic",
    JSON.stringify(x.symbols) === JSON.stringify(y.symbols));
}

// =================================================================
// 3. polygonUniverseAdapter — MOST_ACTIVE retired, new enums valid
// =================================================================
group("polygonUniverseAdapter — MOST_ACTIVE retirement + new enums");
{
  // Adapter does not throw on MOST_ACTIVE; produces structured empty bundle.
  const fake = async () => { throw new Error("should never be called"); };
  let result;
  let threw = false;
  try {
    result = await fetchUniverse({
      source: UNIVERSE_SOURCE.MOST_ACTIVE, fetcher: fake, now: 1_000_000,
    });
  } catch (e) { threw = true; failureLines.push("threw: " + e.message); }
  assert("MOST_ACTIVE → adapter does not throw", !threw);
  assert("MOST_ACTIVE → empty universe", result.symbols.length === 0);
  assert("MOST_ACTIVE → droppedReasons includes deprecated_source",
    result.metadata.droppedReasons.some(d => /^deprecated_source/.test(String(d.reason))));

  // No /most_active path is ever produced.
  // Direct adapter source-code grep — banned literal must be gone from active code.
  const adapterSrc = readFileSync("src/engines/discovery/polygonUniverseAdapter.js", "utf8");
  const codeOnly = stripComments(adapterSrc);
  // The literal "/v2/snapshot/locale/us/markets/stocks/most_active" must NOT
  // appear anywhere in the active code path. It may appear in comments only
  // (documentation).
  assert("polygonUniverseAdapter does NOT emit /most_active path in code",
    !/\/v2\/snapshot\/locale\/us\/markets\/stocks\/most_active/.test(codeOnly));

  assert("DEPRECATED_SOURCE_MARKER is exported",
    typeof DEPRECATED_SOURCE_MARKER === "string" && DEPRECATED_SOURCE_MARKER.length > 0);

  // New enum values present
  assert("UNIVERSE_SOURCE.SESSION_AWARE present",
    UNIVERSE_SOURCE.SESSION_AWARE === "session_aware");
  assert("UNIVERSE_SOURCE.REGULAR_GAINERS present",
    UNIVERSE_SOURCE.REGULAR_GAINERS === "regular_gainers");
  assert("UNIVERSE_SOURCE.REGULAR_LOSERS present",
    UNIVERSE_SOURCE.REGULAR_LOSERS === "regular_losers");
  assert("UNIVERSE_SOURCE.EXTENDED_HOURS_DERIVED present",
    UNIVERSE_SOURCE.EXTENDED_HOURS_DERIVED === "extended_hours_derived");
  assert("UNIVERSE_SOURCE.MOST_ACTIVE preserved (importable)",
    UNIVERSE_SOURCE.MOST_ACTIVE === "most_active");
}

// =================================================================
// 4. Adapter — new sources route to correct paths
// =================================================================
group("polygonUniverseAdapter — new sources hit valid Polygon paths");
{
  // Capture the path the adapter requests.
  let lastPath = null;
  const captureFetcher = async (path) => {
    lastPath = path;
    return { tickers: [] };       // empty but valid payload
  };

  await fetchUniverse({ source: UNIVERSE_SOURCE.GAINERS, fetcher: captureFetcher });
  assert("GAINERS path = /v2/snapshot/locale/us/markets/stocks/gainers",
    lastPath === "/v2/snapshot/locale/us/markets/stocks/gainers");

  await fetchUniverse({ source: UNIVERSE_SOURCE.REGULAR_GAINERS, fetcher: captureFetcher });
  assert("REGULAR_GAINERS path = /v2/.../gainers (alias)",
    lastPath === "/v2/snapshot/locale/us/markets/stocks/gainers");

  await fetchUniverse({ source: UNIVERSE_SOURCE.LOSERS, fetcher: captureFetcher });
  assert("LOSERS path = /v2/snapshot/locale/us/markets/stocks/losers",
    lastPath === "/v2/snapshot/locale/us/markets/stocks/losers");

  await fetchUniverse({ source: UNIVERSE_SOURCE.REGULAR_LOSERS, fetcher: captureFetcher });
  assert("REGULAR_LOSERS path = /v2/.../losers (alias)",
    lastPath === "/v2/snapshot/locale/us/markets/stocks/losers");

  await fetchUniverse({
    source: UNIVERSE_SOURCE.EXTENDED_HOURS_DERIVED,
    fetcher: captureFetcher,
    customSymbols: ["NVDA", "AAPL"],
  });
  assert("EXTENDED_HOURS_DERIVED path uses /tickers?tickers=NVDA,AAPL",
    /\/v2\/snapshot\/locale\/us\/markets\/stocks\/tickers\?tickers=NVDA%2CAAPL/.test(lastPath || ""),
    `got ${lastPath}`);
}

// =================================================================
// 5. polygonGlue — capability probe distinguishes 403
// =================================================================
group("polygonGlue — options capability 403 → unavailable_plan");
{
  // Mock fetcher that throws a 403 with .status (matches default fetcher shape).
  const fetcher403 = async (path) => {
    if (path.includes("/v3/snapshot/options/")) {
      const err = new Error("polygon_http_403");
      err.status = 403;
      throw err;
    }
    return { tickers: [] };
  };
  const glue403 = createPolygonGlue({ fetcher: fetcher403 });
  const cap403 = await glue403.probeOptionsCapability();
  assert("403 → optionsCapability = unavailable_plan",
    cap403.optionsCapability === OPTIONS_CAPABILITY.UNAVAILABLE_PLAN,
    `got ${cap403.optionsCapability}`);
  assert("403 → httpStatus surfaced",
    cap403.httpStatus === 403);

  // 404 → generic UNAVAILABLE
  const fetcher404 = async () => { const e = new Error("polygon_http_404"); e.status = 404; throw e; };
  const glue404 = createPolygonGlue({ fetcher: fetcher404 });
  const cap404 = await glue404.probeOptionsCapability();
  assert("404 → optionsCapability = unavailable",
    cap404.optionsCapability === OPTIONS_CAPABILITY.UNAVAILABLE);

  // 500 → generic UNAVAILABLE
  const fetcher500 = async () => { const e = new Error("polygon_http_500"); e.status = 500; throw e; };
  const glue500 = createPolygonGlue({ fetcher: fetcher500 });
  const cap500 = await glue500.probeOptionsCapability();
  assert("500 → optionsCapability = unavailable",
    cap500.optionsCapability === OPTIONS_CAPABILITY.UNAVAILABLE);

  // Network error (no .status) → UNAVAILABLE
  const fetcherNet = async () => { throw new Error("dns_timeout"); };
  const glueNet = createPolygonGlue({ fetcher: fetcherNet });
  const capNet = await glueNet.probeOptionsCapability();
  assert("network error → optionsCapability = unavailable",
    capNet.optionsCapability === OPTIONS_CAPABILITY.UNAVAILABLE);

  // Successful probe → AVAILABLE
  const fetcherOk = async () => ({ status: "OK", results: [{ details: {} }] });
  const glueOk = createPolygonGlue({ fetcher: fetcherOk });
  const capOk = await glueOk.probeOptionsCapability();
  assert("success → optionsCapability = available",
    capOk.optionsCapability === OPTIONS_CAPABILITY.AVAILABLE);
}

// =================================================================
// 6. polygonGlue — MOST_ACTIVE returns structured fallback (no HTTP)
// =================================================================
group("polygonGlue — MOST_ACTIVE retirement");
{
  let httpCalls = 0;
  const observingFetcher = async (path) => {
    httpCalls += 1;
    if (path.includes("/most_active")) {
      throw new Error("FAIL — should never call /most_active");
    }
    if (path.includes("/v3/snapshot/options/")) {
      const err = new Error("polygon_http_403");
      err.status = 403;
      throw err;
    }
    return { tickers: [] };
  };
  const glue = createPolygonGlue({ fetcher: observingFetcher });
  const result = await glue.fetchUniverseLive({ source: UNIVERSE_SOURCE.MOST_ACTIVE });
  assert("MOST_ACTIVE → universe source = fallback",
    result.metadata.source === GLUE_SOURCE.FALLBACK);
  assert("MOST_ACTIVE → reason indicates deprecation",
    /^deprecated_source/.test(String(result.metadata.reason || "")));
  assert("MOST_ACTIVE → no HTTP call to /most_active",
    httpCalls === 0);

  // Circuit breaker state should NOT increment (config error, not network).
  const circuit = glue.getCircuitState();
  assert("MOST_ACTIVE → circuit consecutiveFailures unchanged",
    circuit.consecutiveFailures === 0);
}

// =================================================================
// 7. sessionAwareUniverse — orchestrator routes by session
// =================================================================
group("sessionAwareUniverse — routes by session");
{
  // Mock glue that records what was requested and returns canned bundles.
  function mockGlue() {
    const calls = [];
    return {
      calls,
      fetchUniverseLive: async ({ source, customSymbols }) => {
        calls.push({ source, customSymbols });
        if (source === UNIVERSE_SOURCE.REGULAR_GAINERS) {
          return {
            symbols: ["NVDA", "AAPL"],
            marketDataBySymbol: {
              NVDA: { symbol: "NVDA", price: 500 },
              AAPL: { symbol: "AAPL", price: 200 },
            },
            metadata: {
              source: "live",
              normalizedCount: 2, snapshotCount: 2, droppedCount: 0, droppedReasons: [],
            },
          };
        }
        if (source === UNIVERSE_SOURCE.REGULAR_LOSERS) {
          return {
            symbols: ["INTC"],
            marketDataBySymbol: { INTC: { symbol: "INTC", price: 32 } },
            metadata: {
              source: "live",
              normalizedCount: 1, snapshotCount: 1, droppedCount: 0, droppedReasons: [],
            },
          };
        }
        if (source === UNIVERSE_SOURCE.EXTENDED_HOURS_DERIVED) {
          return {
            symbols: customSymbols.slice(0, 3),
            marketDataBySymbol: Object.fromEntries(
              customSymbols.slice(0, 3).map(s => [s, { symbol: s, price: 100 }]),
            ),
            metadata: {
              source: "live",
              normalizedCount: customSymbols.length, snapshotCount: customSymbols.length,
              droppedCount: 0, droppedReasons: [],
            },
          };
        }
        return {
          symbols: [], marketDataBySymbol: {},
          metadata: { source: "fallback", reason: "unknown_source" },
        };
      },
      getCircuitState: () => ({ state: "closed", consecutiveFailures: 0 }),
    };
  }

  // Regular session
  const g1 = mockGlue();
  const reg = await fetchSessionAwareUniverse({ glue: g1, now: FRI_13_30_ET });
  assert("regular session: calls REGULAR_GAINERS + REGULAR_LOSERS",
    g1.calls.some(c => c.source === UNIVERSE_SOURCE.REGULAR_GAINERS)
    && g1.calls.some(c => c.source === UNIVERSE_SOURCE.REGULAR_LOSERS));
  assert("regular session: returns merged universe",
    reg.symbols.includes("NVDA") && reg.symbols.includes("INTC"));
  assert("regular session: source = live",
    reg.metadata.source === "live");
  assert("regular session: universeStrategy = regular_snapshot",
    reg.metadata.universeStrategy === UNIVERSE_STRATEGY.REGULAR_SNAPSHOT);
  assert("regular session: session = regular",
    reg.metadata.session === SESSION.REGULAR);

  // Premarket session
  const g2 = mockGlue();
  const pre = await fetchSessionAwareUniverse({ glue: g2, now: FRI_04_00_ET });
  assert("premarket: calls EXTENDED_HOURS_DERIVED",
    g2.calls.some(c => c.source === UNIVERSE_SOURCE.EXTENDED_HOURS_DERIVED));
  assert("premarket: customSymbols supplied (curated list)",
    Array.isArray(g2.calls[0]?.customSymbols) && g2.calls[0].customSymbols.length > 0);
  assert("premarket: source = live",
    pre.metadata.source === "live");
  assert("premarket: universeStrategy = extended_hours_derived",
    pre.metadata.universeStrategy === UNIVERSE_STRATEGY.EXTENDED_HOURS_DERIVED);
  assert("premarket: session = premarket",
    pre.metadata.session === SESSION.PREMARKET);

  // Postmarket session
  const g3 = mockGlue();
  const post = await fetchSessionAwareUniverse({ glue: g3, now: FRI_19_59_ET });
  assert("postmarket: universeStrategy = extended_hours_derived",
    post.metadata.universeStrategy === UNIVERSE_STRATEGY.EXTENDED_HOURS_DERIVED);
  assert("postmarket: session = postmarket",
    post.metadata.session === SESSION.POSTMARKET);

  // Closed session
  const g4 = mockGlue();
  const closed = await fetchSessionAwareUniverse({ glue: g4, now: SAT_13_30_ET });
  assert("closed: universeStrategy = closed_curated",
    closed.metadata.universeStrategy === UNIVERSE_STRATEGY.CLOSED_CURATED);
  assert("closed: session = closed",
    closed.metadata.session === SESSION.CLOSED);
  assert("closed: warnings include Markets closed notice",
    Array.isArray(closed.warnings) && closed.warnings.some(w => /Markets closed/i.test(w)));
}

// =================================================================
// 8. sessionAwareUniverse — 404 fallback safety
// =================================================================
group("sessionAwareUniverse — 404 fallback safety");
{
  // Glue that always returns fallback bundles (simulating 404)
  const failingGlue = {
    fetchUniverseLive: async () => ({
      symbols: [], marketDataBySymbol: {},
      metadata: {
        source: "fallback", reason: "polygon_http_404",
        normalizedCount: 0, snapshotCount: 0, droppedCount: 0, droppedReasons: [],
      },
    }),
    getCircuitState: () => ({ state: "closed", consecutiveFailures: 1 }),
  };

  const reg = await fetchSessionAwareUniverse({ glue: failingGlue, now: FRI_13_30_ET });
  assert("regular fallback: symbols empty",
    reg.symbols.length === 0);
  assert("regular fallback: metadata source surfaces fallback",
    reg.metadata.source === "fallback");
  assert("regular fallback: still labels session/strategy",
    reg.metadata.session === SESSION.REGULAR
    && reg.metadata.universeStrategy === UNIVERSE_STRATEGY.REGULAR_SNAPSHOT);
  assert("regular fallback: warnings indicate failure",
    Array.isArray(reg.warnings) && reg.warnings.length > 0);

  const pre = await fetchSessionAwareUniverse({ glue: failingGlue, now: FRI_04_00_ET });
  assert("premarket fallback: symbols empty",
    pre.symbols.length === 0);
  assert("premarket fallback: source surfaces fallback",
    pre.metadata.source === "fallback");
}

// =================================================================
// 9. fetchScannerInputBundle — SESSION_AWARE end-to-end
// =================================================================
group("fetchScannerInputBundle — SESSION_AWARE dispatch");
{
  // Build an integration glue from the real factory but with a mocked fetcher.
  let optionsHits = 0;
  const fetcher = async (path) => {
    if (path.includes("/v3/snapshot/options/")) {
      optionsHits += 1;
      const err = new Error("polygon_http_403");
      err.status = 403;
      throw err;
    }
    if (path.includes("/v2/snapshot/locale/us/markets/stocks/gainers")) {
      return {
        tickers: [
          { ticker: "NVDA", todaysChangePerc: 2.0,
            day: { c: 500, v: 30_000_000, vw: 500 },
            prevDay: { c: 490, v: 25_000_000 } },
        ],
      };
    }
    if (path.includes("/v2/snapshot/locale/us/markets/stocks/losers")) {
      return {
        tickers: [
          { ticker: "INTC", todaysChangePerc: -3.0,
            day: { c: 32, v: 25_000_000, vw: 32 },
            prevDay: { c: 33, v: 28_000_000 } },
        ],
      };
    }
    return { tickers: [] };
  };

  const glue = createPolygonGlue({ fetcher });
  const bundle = await fetchScannerInputBundle({
    glue,
    universeSource: UNIVERSE_SOURCE.SESSION_AWARE,
    now: FRI_13_30_ET,
  });

  assert("bundle: symbols include NVDA + INTC (gainers ∪ losers)",
    bundle.symbols.includes("NVDA") && bundle.symbols.includes("INTC"));
  assert("bundle: universe source = live",
    bundle.metadata.universe.source === GLUE_SOURCE.LIVE);
  assert("bundle: universe session = regular",
    bundle.metadata.universe.session === SESSION.REGULAR);
  assert("bundle: universe strategy = regular_snapshot",
    bundle.metadata.universe.universeStrategy === UNIVERSE_STRATEGY.REGULAR_SNAPSHOT);
  assert("bundle: optionsCapability surfaces unavailable_plan (from 403)",
    bundle.metadata.options.capability?.optionsCapability === OPTIONS_CAPABILITY.UNAVAILABLE_PLAN);
  assert("bundle: no live chain data (entitlement blocked)",
    Object.values(bundle.optionsDataBySymbol).every(o => Array.isArray(o.chain) && o.chain.length === 0));
}

// =================================================================
// 10. LethalBoardPage uses SESSION_AWARE (not MOST_ACTIVE)
// =================================================================
group("LethalBoardPage — uses SESSION_AWARE");
{
  const src = readFileSync("src/components/discovery/LethalBoardPage.jsx", "utf8");
  let ok = true; let err = null;
  try { await transformWithOxc(src, "LethalBoardPage.jsx", { lang: "jsx" }); }
  catch (e) { ok = false; err = e?.message || String(e); }
  assert("LethalBoardPage.jsx parses as valid JSX", ok, err);

  const codeOnly = stripComments(src);
  assert("LethalBoardPage uses UNIVERSE_SOURCE.SESSION_AWARE",
    /UNIVERSE_SOURCE\.SESSION_AWARE/.test(codeOnly));
  assert("LethalBoardPage no longer uses UNIVERSE_SOURCE.MOST_ACTIVE",
    !/UNIVERSE_SOURCE\.MOST_ACTIVE/.test(codeOnly));
}

// =================================================================
// 11. Frozen files unchanged (file-presence + grep)
// =================================================================
group("frozen files unchanged");
{
  const board = readFileSync("src/components/discovery/LethalBoard.jsx", "utf8");
  const vm = readFileSync("src/components/discovery/lethalBoardViewModel.js", "utf8");
  const rollup = readFileSync("src/components/discovery/recordedAlertsRollup.js", "utf8");
  const view = readFileSync("src/components/discovery/recordedAlertsView.js", "utf8");
  const history = readFileSync("src/lib/alerts/alertHistory.js", "utf8");

  // No mention of session awareness in any frozen file (proves they weren't touched)
  for (const [name, src] of Object.entries({
    "LethalBoard.jsx": board,
    "lethalBoardViewModel.js": vm,
    "recordedAlertsRollup.js": rollup,
    "recordedAlertsView.js": view,
    "alertHistory.js": history,
  })) {
    assert(`${name} does not reference SESSION_AWARE`,
      !/SESSION_AWARE/.test(src));
    assert(`${name} does not reference sessionAwareUniverse`,
      !/sessionAwareUniverse/.test(src));
  }
}

// =================================================================
// 12. No live-chain fields when entitlement unavailable
// =================================================================
group("safety — no live-chain fields when capability is unavailable_plan");
{
  // Build a bundle where capability comes back as unavailable_plan.
  const fetcher = async (path) => {
    if (path.includes("/v3/snapshot/options/")) {
      const e = new Error("polygon_http_403"); e.status = 403; throw e;
    }
    if (path.includes("gainers")) {
      return { tickers: [
        { ticker: "NVDA", todaysChangePerc: 1.0,
          day: { c: 500, v: 30_000_000, vw: 500 }, prevDay: { c: 495, v: 25_000_000 } },
      ] };
    }
    if (path.includes("losers")) {
      return { tickers: [
        { ticker: "AMD", todaysChangePerc: -1.0,
          day: { c: 200, v: 25_000_000, vw: 200 }, prevDay: { c: 202, v: 24_000_000 } },
      ] };
    }
    return { tickers: [] };
  };
  const glue = createPolygonGlue({ fetcher });
  const bundle = await fetchScannerInputBundle({
    glue,
    universeSource: UNIVERSE_SOURCE.SESSION_AWARE,
    now: FRI_13_30_ET,
  });

  for (const [sym, payload] of Object.entries(bundle.optionsDataBySymbol)) {
    assert(`${sym}: chain is empty`, Array.isArray(payload.chain) && payload.chain.length === 0);
    assert(`${sym}: status is no_chain_data`, payload.status === "no_chain_data");
  }
  assert("metadata.options.source != live (entitlement-blocked)",
    bundle.metadata.options.source !== "live");
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
  // Demo: show curated symbol set + session classification
  const session = classifyMarketSession({ now: FRI_13_30_ET });
  console.log("\n  Example session classification (Fri 13:30 ET):");
  console.log(`    session=${session.session} weekend=${session.isWeekend} holiday=${session.isHoliday}`);
  console.log(`    label=${session.sessionLabel}`);

  const curated = buildCuratedWatchlist({ cap: 12 });
  console.log("\n  Example curated watchlist (cap=12, AI-infra first):");
  console.log(`    ${curated.symbols.join(", ")}`);
  console.log(`    AI-infra in this slice: ${curated.metadata.aiInfraCount}`);
  console.log(`    Cash-settled excluded: ${curated.metadata.droppedCashSettled.join(", ") || "(none)"}`);

  process.exit(0);
}
