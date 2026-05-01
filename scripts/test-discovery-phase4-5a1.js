#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.5A1 tests
// Run: npm run test:discovery-phase4-5a1
// =====================================================
//
// Verifies session-aware freshness policy:
//   - Lookup table: regular/premarket/postmarket/closed × {conservative,neutral,aggressive}
//   - Conservative tighter than neutral; aggressive wider than neutral (regular)
//   - Premarket / postmarket use 21600s
//   - Closed disables freshness rejection entirely
//   - Mode-default fallback when session unspecified (back-compat)
//   - Scanner accepts 22-min-old data in regular/neutral (was rejected at 900s)
//   - Scanner rejects 28-min-old in regular/neutral (exceeds 1500s)
//   - Conservative still tighter than neutral
//   - Premarket accepts 4h-old data, rejects 7h-old
//   - Closed accepts 3-day-old data without staleness rejection
//   - Prior-session safeguard fires for regular session > 6h
//   - Page forwards session from bundle metadata
//   - No UI file hardcodes a freshness threshold value
// =====================================================

import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";

import {
  resolveFreshnessPolicy,
  isPriorSessionTimestamp,
  PRIOR_SESSION_SAFEGUARD_SEC,
  FRESHNESS_POLICY,
  getModeDefault,
} from "../src/engines/discovery/freshnessPolicy.js";

import {
  runMarketDiscoveryScan,
  REJECTION,
} from "../src/engines/discovery/marketDiscoveryScanner.js";

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

const NOW = 1_756_000_000_000;
const ACCT = {
  totalAccountValue: 60_000, availableCash: 50_000,
  maxDeployedPct: 0.65, reservedCashBufferPct: 0.20, marketMode: "neutral",
};

function makeRow({ symbol, ageSec, dollarVolume = 100_000_000, change = 1.5 }) {
  return {
    symbol,
    price: 100,
    previousClose: 100 * (1 - change / 100),
    percentChange: change,
    volume: 5_000_000,
    avgVolume: 4_000_000,
    dollarVolume,
    timestamp: NOW - ageSec * 1000,
    near20DayHigh: true,
    distanceToSupportPct: 1.5,
    detectedRegime: "RISK_ON",
  };
}

function runScan({ session, scannerMode, ageSec, symbol = "AAA" }) {
  return runMarketDiscoveryScan({
    symbols: [symbol],
    marketDataBySymbol: {
      [symbol]: makeRow({ symbol, ageSec }),
    },
    accountState: ACCT,
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode,
    session,
    now: NOW,
  });
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.5A1");
console.log("  ════════════════════════════════════════════");

// =================================================================
// 1. Lookup table — explicit values per session × mode
// =================================================================
group("freshnessPolicy — explicit lookup values");
{
  // Regular session
  assert("regular/conservative = 1080s",
    resolveFreshnessPolicy({ session: "regular", scannerMode: "conservative" }).maxStaleSec === 1080);
  assert("regular/neutral = 1500s",
    resolveFreshnessPolicy({ session: "regular", scannerMode: "neutral" }).maxStaleSec === 1500);
  assert("regular/aggressive = 3600s",
    resolveFreshnessPolicy({ session: "regular", scannerMode: "aggressive" }).maxStaleSec === 3600);

  // Premarket
  assert("premarket/conservative = 21600s",
    resolveFreshnessPolicy({ session: "premarket", scannerMode: "conservative" }).maxStaleSec === 21600);
  assert("premarket/neutral = 21600s",
    resolveFreshnessPolicy({ session: "premarket", scannerMode: "neutral" }).maxStaleSec === 21600);
  assert("premarket/aggressive = 21600s",
    resolveFreshnessPolicy({ session: "premarket", scannerMode: "aggressive" }).maxStaleSec === 21600);

  // Postmarket
  assert("postmarket/neutral = 21600s",
    resolveFreshnessPolicy({ session: "postmarket", scannerMode: "neutral" }).maxStaleSec === 21600);

  // Closed → disabled
  const closedNeu = resolveFreshnessPolicy({ session: "closed", scannerMode: "neutral" });
  assert("closed/neutral disabled=true", closedNeu.disabled === true);
  assert("closed/neutral has no maxStaleSec", closedNeu.maxStaleSec === undefined);
  const closedAgg = resolveFreshnessPolicy({ session: "closed", scannerMode: "aggressive" });
  assert("closed/aggressive disabled=true", closedAgg.disabled === true);

  // Source labeling
  assert("regular result source=session",
    resolveFreshnessPolicy({ session: "regular", scannerMode: "neutral" }).source === "session");
  assert("regular result has justification string",
    typeof resolveFreshnessPolicy({ session: "regular", scannerMode: "neutral" }).justification === "string");
}

// =================================================================
// 2. Conservative tighter than neutral; aggressive wider (regular)
// =================================================================
group("freshnessPolicy — mode ordering within regular session");
{
  const c = resolveFreshnessPolicy({ session: "regular", scannerMode: "conservative" }).maxStaleSec;
  const n = resolveFreshnessPolicy({ session: "regular", scannerMode: "neutral" }).maxStaleSec;
  const a = resolveFreshnessPolicy({ session: "regular", scannerMode: "aggressive" }).maxStaleSec;
  assert("regular: conservative < neutral", c < n, `${c} >= ${n}`);
  assert("regular: aggressive > neutral", a > n, `${a} <= ${n}`);
}

// =================================================================
// 3. Mode-default fallback when session is missing
// =================================================================
group("freshnessPolicy — mode-default back-compat");
{
  const noSess = resolveFreshnessPolicy({ scannerMode: "neutral" });
  assert("no session: source=mode_default",
    noSess.source === "mode_default");
  assert("no session: maxStaleSec = 900 (legacy neutral)",
    noSess.maxStaleSec === 900);
  assert("no session conservative = 300 (legacy)",
    resolveFreshnessPolicy({ scannerMode: "conservative" }).maxStaleSec === 300);
  assert("no session aggressive = 3600 (legacy)",
    resolveFreshnessPolicy({ scannerMode: "aggressive" }).maxStaleSec === 3600);
  assert("getModeDefault('neutral') = 900",
    getModeDefault("neutral") === 900);

  // Unknown session falls back to mode default
  const unknown = resolveFreshnessPolicy({ session: "lunch_break", scannerMode: "neutral" });
  assert("unknown session falls back to mode default (900)",
    unknown.maxStaleSec === 900 && unknown.source === "mode_default");
}

// =================================================================
// 4. Prior-session safeguard predicate
// =================================================================
group("freshnessPolicy — prior-session safeguard");
{
  assert("PRIOR_SESSION_SAFEGUARD_SEC = 21600s (6h)",
    PRIOR_SESSION_SAFEGUARD_SEC === 21600);
  assert("regular + 25h-old → prior_session=true",
    isPriorSessionTimestamp(25 * 3600, "regular") === true);
  assert("regular + 5h-old → prior_session=false",
    isPriorSessionTimestamp(5 * 3600, "regular") === false);
  assert("premarket + 25h-old → prior_session=false (only regular)",
    isPriorSessionTimestamp(25 * 3600, "premarket") === false);
  assert("postmarket + 25h-old → prior_session=false (only regular)",
    isPriorSessionTimestamp(25 * 3600, "postmarket") === false);
  assert("closed + 25h-old → prior_session=false (only regular)",
    isPriorSessionTimestamp(25 * 3600, "closed") === false);
  assert("undefined session + 25h-old → prior_session=false",
    isPriorSessionTimestamp(25 * 3600, undefined) === false);
}

// =================================================================
// 5. Scanner integration — regular session thresholds
// =================================================================
group("scanner — regular/neutral accepts 22-min-old data");
{
  // 22 min = 1320s, threshold 1500s → accepted
  const r = runScan({ session: "regular", scannerMode: "neutral", ageSec: 22 * 60 });
  const stale = r.rejected.find(j => j.symbol === "AAA" && j.reason === REJECTION.STALE_DATA);
  assert("AAA NOT rejected for staleness (22min < 1500s)",
    !stale, stale && stale.detail);
  // It may still be rejected for other reasons (volume, classification) — what
  // matters is it is NOT a stale_data rejection.
}
group("scanner — regular/neutral rejects 28-min-old data");
{
  // 28 min = 1680s, threshold 1500s → rejected as stale
  const r = runScan({ session: "regular", scannerMode: "neutral", ageSec: 28 * 60 });
  const stale = r.rejected.find(j => j.symbol === "AAA" && j.reason === REJECTION.STALE_DATA);
  assert("AAA rejected as stale_data (28min > 1500s)",
    !!stale, stale ? stale.detail : "no stale rejection");
  assert("rejection detail mentions session=regular",
    stale && /session=regular/.test(stale.detail));
}

group("scanner — regular/conservative tighter than neutral");
{
  // 17 min = 1020s, conservative threshold 1080s → accepted
  const r17c = runScan({ session: "regular", scannerMode: "conservative", ageSec: 17 * 60 });
  assert("conservative accepts 17min (< 1080s)",
    !r17c.rejected.find(j => j.reason === REJECTION.STALE_DATA));
  // 22 min = 1320s, conservative threshold 1080s → rejected
  const r22c = runScan({ session: "regular", scannerMode: "conservative", ageSec: 22 * 60 });
  assert("conservative rejects 22min (> 1080s)",
    !!r22c.rejected.find(j => j.reason === REJECTION.STALE_DATA));
  // Same 22min in neutral → accepted (1500s threshold)
  const r22n = runScan({ session: "regular", scannerMode: "neutral", ageSec: 22 * 60 });
  assert("neutral accepts the same 22min that conservative rejects",
    !r22n.rejected.find(j => j.reason === REJECTION.STALE_DATA));
}

// =================================================================
// 6. Scanner integration — premarket/postmarket extended threshold
// =================================================================
group("scanner — premarket accepts 4h-old, rejects 7h-old");
{
  // 4h = 14400s, threshold 21600s → accepted
  const r4 = runScan({ session: "premarket", scannerMode: "neutral", ageSec: 4 * 3600 });
  assert("premarket accepts 4h-old (< 21600s)",
    !r4.rejected.find(j => j.reason === REJECTION.STALE_DATA));
  // 7h = 25200s, threshold 21600s → rejected
  const r7 = runScan({ session: "premarket", scannerMode: "neutral", ageSec: 7 * 3600 });
  const stale = r7.rejected.find(j => j.reason === REJECTION.STALE_DATA);
  assert("premarket rejects 7h-old (> 21600s)", !!stale);
  assert("premarket rejection detail mentions session=premarket",
    stale && /session=premarket/.test(stale.detail));
}

group("scanner — postmarket accepts 4h-old data");
{
  const r = runScan({ session: "postmarket", scannerMode: "neutral", ageSec: 4 * 3600 });
  assert("postmarket accepts 4h-old (< 21600s)",
    !r.rejected.find(j => j.reason === REJECTION.STALE_DATA));
}

// =================================================================
// 7. Scanner integration — closed session does not reject for staleness
// =================================================================
group("scanner — closed session does not reject for quote age");
{
  // 3 days old — clearly "stale" in any other context
  const r = runScan({ session: "closed", scannerMode: "neutral", ageSec: 3 * 24 * 3600 });
  const staleRejections = r.rejected.filter(j => j.reason === REJECTION.STALE_DATA);
  assert("closed: 0 stale_data rejections even at 3-day-old data",
    staleRejections.length === 0,
    `got ${staleRejections.length}`);
}

// =================================================================
// 8. Prior-session safeguard catches yesterday's regular-session quote
// =================================================================
group("scanner — prior-session safeguard for regular");
{
  // 25h old during regular session — should fire the safeguard regardless
  // of mode threshold. Aggressive regular = 3600s, but safeguard = 21600s.
  const r = runScan({ session: "regular", scannerMode: "aggressive", ageSec: 25 * 3600 });
  const stale = r.rejected.find(j => j.reason === REJECTION.STALE_DATA);
  assert("regular/aggressive + 25h-old rejected via safeguard",
    !!stale, stale ? stale.detail : "no rejection");
  assert("rejection detail tagged prior_session_timestamp",
    stale && /prior_session_timestamp/.test(stale.detail));
}

// =================================================================
// 9. Session metadata propagates: args.session vs regimeContext.session
// =================================================================
group("scanner — session arrives via args.session OR regimeContext.session");
{
  // Via args.session
  const viaArg = runMarketDiscoveryScan({
    symbols: ["AAA"],
    marketDataBySymbol: { AAA: makeRow({ symbol: "AAA", ageSec: 22 * 60 }) },
    accountState: ACCT,
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode: "neutral",
    session: "regular",
    now: NOW,
  });
  assert("args.session=regular: 22min accepted (uses 1500s policy)",
    !viaArg.rejected.find(j => j.reason === REJECTION.STALE_DATA));

  // Via regimeContext.session
  const viaCtx = runMarketDiscoveryScan({
    symbols: ["AAA"],
    marketDataBySymbol: { AAA: makeRow({ symbol: "AAA", ageSec: 22 * 60 }) },
    accountState: ACCT,
    regimeContext: { detectedRegime: "RISK_ON", session: "regular" },
    scannerMode: "neutral",
    now: NOW,
  });
  assert("regimeContext.session=regular: 22min accepted (uses 1500s policy)",
    !viaCtx.rejected.find(j => j.reason === REJECTION.STALE_DATA));

  // No session at all → back-compat mode-default 900s → 22min REJECTED
  const noSess = runMarketDiscoveryScan({
    symbols: ["AAA"],
    marketDataBySymbol: { AAA: makeRow({ symbol: "AAA", ageSec: 22 * 60 }) },
    accountState: ACCT,
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode: "neutral",
    now: NOW,
  });
  assert("no session: 22min rejected (back-compat 900s)",
    !!noSess.rejected.find(j => j.reason === REJECTION.STALE_DATA));
}

// =================================================================
// 10. LethalBoardPage forwards session from bundle metadata
// =================================================================
group("LethalBoardPage forwards session via metadata, no hardcoded threshold");
{
  const src = readFileSync("src/components/discovery/LethalBoardPage.jsx", "utf8");
  let ok = true; let err = null;
  try { await transformWithOxc(src, "LethalBoardPage.jsx", { lang: "jsx" }); }
  catch (e) { ok = false; err = e?.message || String(e); }
  assert("LethalBoardPage.jsx parses as valid JSX", ok, err);

  const codeOnly = stripComments(src);
  // Forwarding line present
  assert("forwards session: bundle.metadata.universe.session into runMarketDiscoveryScan",
    /session\s*:\s*bundle\.metadata\??\.?universe\??\.?session/.test(codeOnly)
    || /session\s*:\s*bundle\.metadata\?\.universe\?\.session/.test(codeOnly));

  // No hardcoded threshold values in any UI source
  for (const file of [
    "src/components/discovery/LethalBoardPage.jsx",
    "src/components/discovery/LethalBoard.jsx",
    "src/components/discovery/lethalBoardViewModel.js",
  ]) {
    const s = stripComments(readFileSync(file, "utf8"));
    assert(`${file}: no maxStaleSec literal`,
      !/maxStaleSec/.test(s));
    // Magic-number sweep: the policy's threshold values should not appear in UI code
    for (const v of ["1080", "1500", "3600", "21600"]) {
      assert(`${file}: does not hardcode ${v} (freshness threshold)`,
        !new RegExp(`\\b${v}\\b`).test(s), v);
    }
  }
}

// =================================================================
// 11. freshnessPolicy.js is pure (no UI / scoring / persistence imports)
// =================================================================
group("freshnessPolicy.js — pure helper (no forbidden imports)");
{
  const src = readFileSync("src/engines/discovery/freshnessPolicy.js", "utf8");
  const codeOnly = stripComments(src);
  for (const banned of [
    "alertHistory", "recordedAlertsRollup", "recordedAlertsView",
    "setupScoring", "signalEngine", "calibrationTracker",
    "capitalAwareRanker", "rankCandidates",
    "LethalBoard", "polygonProxy",
  ]) {
    assert(`freshnessPolicy.js does NOT reference ${banned}`,
      !new RegExp(banned).test(codeOnly));
  }
  assert("FRESHNESS_POLICY exports are frozen",
    Object.isFrozen(FRESHNESS_POLICY));
}

// =================================================================
// 12. Phase 4 regression — Phase 4 STALE fixture still rejected
// =================================================================
group("Phase 4 regression — 2h-old data still rejected without session");
{
  // The Phase 4 fixture used a 2h-old timestamp with neutral mode (no session).
  // Back-compat path uses 900s threshold; 2h = 7200s > 900s → still rejected.
  const r = runMarketDiscoveryScan({
    symbols: ["STALE"],
    marketDataBySymbol: {
      STALE: { symbol: "STALE", price: 60, previousClose: 59,
               volume: 5_000_000, avgVolume: 5_000_000, dollarVolume: 300_000_000,
               timestamp: NOW - 2 * 3600 * 1000 },
    },
    accountState: ACCT,
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode: "neutral",
    now: NOW,
  });
  const stale = r.rejected.find(j => j.symbol === "STALE" && j.reason === REJECTION.STALE_DATA);
  assert("Phase 4 STALE fixture (2h, no session) still rejected (back-compat)",
    !!stale);
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
  // Demo
  console.log("\n  Example policy resolutions:");
  for (const sess of ["regular", "premarket", "postmarket", "closed"]) {
    for (const mode of ["conservative", "neutral", "aggressive"]) {
      const p = resolveFreshnessPolicy({ session: sess, scannerMode: mode });
      const value = p.disabled ? "disabled" : `${p.maxStaleSec}s`;
      console.log(`    ${sess.padEnd(11)} / ${mode.padEnd(13)} → ${value}`);
    }
  }
  process.exit(0);
}
