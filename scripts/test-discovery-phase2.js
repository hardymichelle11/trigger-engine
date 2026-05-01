#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 2 tests
// Run: npm run test:discovery-phase2
// =====================================================
//
// Covers marketDiscoveryScanner orchestrator, the
// discoveryScoreAdapter, and estimatedPremiumEngine,
// including the scanner-mode behavior.
// =====================================================

import {
  runMarketDiscoveryScan,
  REJECTION,
  SCAN_MODE_RULES,
} from "../src/engines/discovery/marketDiscoveryScanner.js";

import {
  adaptExistingSignal,
  adaptAll,
} from "../src/engines/discovery/discoveryScoreAdapter.js";

import {
  estimatePremium,
  PREMIUM_SCANNER_MODE_DEFAULTS,
} from "../src/engines/discovery/estimatedPremiumEngine.js";

import {
  PREMIUM_SOURCE,
  PROBABILITY_STATUS,
  ACTION,
  CAPITAL_FIT,
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

const FIXED_NOW = 1_756_000_000_000;     // injectable epoch ms — keeps tests deterministic

function freshTs(secsAgo = 60) { return FIXED_NOW - secsAgo * 1000; }
function staleTs(secsAgo = 7200) { return FIXED_NOW - secsAgo * 1000; }

function chainFor(strikeBase) {
  const strikes = [strikeBase * 0.95, strikeBase * 0.93, strikeBase * 0.90, strikeBase * 0.88];
  const rows = [];
  for (const k of strikes) {
    for (const dte of [7, 14, 21, 30]) {
      const mid = Math.max(0.05, (strikeBase * 0.01) * (dte / 21));
      const half = mid * 0.005;     // 1% spread → "low" risk per gradeSpread()
      rows.push({
        type: "put",
        strike: Math.round(k * 100) / 100,
        dte,
        bid: Math.max(0.01, mid - half),
        ask: mid + half,
        openInterest: 1500,
        volume: 800,
      });
    }
  }
  return rows;
}

function makeAccount() {
  return {
    totalAccountValue: 60_000,
    availableCash: 50_000,
    maxDeployedPct: 0.65,
    reservedCashBufferPct: 0.20,
    marketMode: "neutral",
  };
}

function makeMarketData() {
  return {
    NVDA: {
      symbol: "NVDA", price: 110, previousClose: 108,
      volume: 35_000_000, avgVolume: 20_000_000, dollarVolume: 3_850_000_000,
      atr: 2.4, iv: 35, ivPercentile: 65,
      near20DayHigh: true, distanceToSupportPct: 1.5, atrExpansion: 1.6,
      timestamp: freshTs(60),
    },
    CRWV: {
      symbol: "CRWV", price: 95, previousClose: 96,
      volume: 12_000_000, avgVolume: 8_000_000, dollarVolume: 1_140_000_000,
      atr: 2.0, iv: 50, ivPercentile: 75,
      distanceToSupportPct: 1.0, atrExpansion: 1.4,
      timestamp: freshTs(60),
    },
    BE: {
      symbol: "BE", price: 30, previousClose: 29.5,
      volume: 8_000_000, avgVolume: 6_000_000, dollarVolume: 240_000_000,
      atr: 0.9, iv: 55, ivPercentile: 70,
      distanceToSupportPct: 0.8, atrExpansion: 1.2,
      timestamp: freshTs(60),
    },
    INTC: {
      symbol: "INTC", price: 32, previousClose: 31.7,
      volume: 25_000_000, avgVolume: 30_000_000, dollarVolume: 800_000_000,
      atr: 0.8, iv: 28, ivPercentile: 35,
      timestamp: freshTs(60),
    },
    ZZUNCAT: {
      symbol: "ZZUNCAT", price: 40, previousClose: 38,
      volume: 4_000_000, avgVolume: 2_000_000, dollarVolume: 160_000_000,
      atr: 1.0,
      timestamp: freshTs(60),
      sector: "Technology", industry: "Software",
    },
    STALE: {
      symbol: "STALE", price: 60, previousClose: 59,
      volume: 5_000_000, avgVolume: 5_000_000, dollarVolume: 300_000_000,
      timestamp: staleTs(2 * 60 * 60),     // 2h old
    },
    TINYVOL: {
      symbol: "TINYVOL", price: 20, previousClose: 19.9,
      volume: 50_000, avgVolume: 40_000, dollarVolume: 1_000_000,
      timestamp: freshTs(60),
    },
    HIGHPRICE: {
      symbol: "HIGHPRICE", price: 75_000, previousClose: 74_500,
      volume: 100_000, avgVolume: 90_000, dollarVolume: 7_500_000_000,
      timestamp: freshTs(60),
    },
  };
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 2");
console.log("  ════════════════════════════════════════════");

// =================================================================
// 1. estimatedPremiumEngine
// =================================================================
group("estimatedPremiumEngine — chain / IV / ATR / insufficient");
{
  const chainResult = estimatePremium({
    symbol: "NVDA", price: 110,
    optionsChain: chainFor(110),
    scannerMode: "neutral",
  });
  assert("chain present → method=chain_based", chainResult.method === "chain_based",
    `got ${chainResult.method}`);
  assert("chain → premiumSource=live", chainResult.premiumSource === PREMIUM_SOURCE.LIVE);
  assert("chain → confidence ∈ {high, medium}",
    chainResult.confidence === "high" || chainResult.confidence === "medium");
  assert("chain → preferredStrike close to OTM",
    chainResult.preferredStrike <= 110 && chainResult.preferredStrike >= 95);
  assert("chain → estimatedPremium > 0", chainResult.estimatedPremium > 0);
  assert("chain → liquidityGrade is graded",
    ["A+", "A", "B+", "B", "C", "D"].includes(chainResult.liquidityGrade));

  const ivResult = estimatePremium({
    symbol: "CRWV", price: 95, iv: 50, ivPercentile: 75,
    scannerMode: "neutral",
  });
  assert("no chain + iv present → method=iv_estimated", ivResult.method === "iv_estimated");
  assert("iv → premiumSource=estimated", ivResult.premiumSource === PREMIUM_SOURCE.ESTIMATED);
  assert("iv → estimatedPremium > 0", ivResult.estimatedPremium > 0);

  const atrResult = estimatePremium({
    symbol: "ZZUNCAT", price: 40, atr: 1.0,
    scannerMode: "neutral",
  });
  assert("no chain, no iv, atr only → method=atr_estimated", atrResult.method === "atr_estimated");
  assert("atr → confidence=low", atrResult.confidence === "low");

  const noneResult = estimatePremium({ symbol: "ZZNONE", price: 50, scannerMode: "neutral" });
  assert("no chain, no iv, no atr → method=insufficient_data",
    noneResult.method === "insufficient_data");
  assert("insufficient → premiumSource=unavailable",
    noneResult.premiumSource === PREMIUM_SOURCE.UNAVAILABLE);
  assert("insufficient → confidence=low", noneResult.confidence === "low");
  assert("insufficient → estimatedPremium=0", noneResult.estimatedPremium === 0);

  // Determinism
  const a = estimatePremium({ symbol: "NVDA", price: 110, iv: 35, scannerMode: "neutral" });
  const b = estimatePremium({ symbol: "NVDA", price: 110, iv: 35, scannerMode: "neutral" });
  assert("estimatePremium deterministic", JSON.stringify(a) === JSON.stringify(b));
}

// =================================================================
// 2. discoveryScoreAdapter
// =================================================================
group("discoveryScoreAdapter — normalization and immutability");
{
  // Spec #5: does not mutate source
  const sourceBefore = {
    score: 80,
    probability: { probAboveStrike: 0.72, probTouch: 0.20, avgMaxDrawdown: 0.04 },
    metrics: { ivPercentile: 65 },
    watchlist: { spreadQuality: "A" },
    regime: "RISK_ON",
    liveState: { ageSec: 30, anchorDriftPct: 0.005 },
  };
  const snapshot = JSON.parse(JSON.stringify(sourceBefore));
  const out = adaptExistingSignal(sourceBefore);
  assert("adapter does not mutate source",
    JSON.stringify(sourceBefore) === JSON.stringify(snapshot));

  // Spec #8: rewards strong setup + probability
  assert("strong score → signalQuality=strong", out.signalQuality === "strong",
    `got ${out.signalQuality}`);
  assert("strong score → normalizedScore > 20", out.normalizedScore > 20,
    `got ${out.normalizedScore}`);
  assert("strong score → probabilityScore > 8", out.probabilityScore > 8);
  assert("strong source → usableForDiscovery", out.usableForDiscovery === true);

  // Spec #6: missing fields safe
  const empty = adaptExistingSignal(null);
  assert("null source → hasExistingSignal=false", empty.hasExistingSignal === false);
  assert("null source → signalQuality=none", empty.signalQuality === "none");
  assert("null source → usableForDiscovery=false", empty.usableForDiscovery === false);

  const partial = adaptExistingSignal({ score: 60 });   // only score, no probability
  assert("partial source → hasExistingSignal=true", partial.hasExistingSignal === true);
  assert("partial source → no crash, finite scores",
    Number.isFinite(partial.normalizedScore) && Number.isFinite(partial.probabilityScore));

  // Spec #7: penalizes stale
  const stale = adaptExistingSignal({
    score: 80,
    probability: { probAboveStrike: 0.72 },
    liveState: { ageSec: 60 * 60, anchorDriftPct: 0.10 },  // 10% drift, 1h old
  });
  assert("stale source → signalQuality=stale", stale.signalQuality === "stale",
    `got ${stale.signalQuality}`);
  assert("stale source → freshnessPenalty < 0", stale.freshnessPenalty < 0);
  assert("stale source → usableForDiscovery=false", stale.usableForDiscovery === false);

  // Risk penalty when probTouch > 0.45
  const risky = adaptExistingSignal({
    score: 70,
    probability: { probAboveStrike: 0.55, probTouch: 0.55, avgMaxDrawdown: 0.10 },
  });
  assert("high touch + drawdown → riskPenalty < 0", risky.riskPenalty < 0);

  const all = adaptAll({ NVDA: sourceBefore, EMPTY: null });
  assert("adaptAll returns map keyed by symbol",
    !!all.NVDA && !!all.EMPTY);
}

// =================================================================
// 3. marketDiscoveryScanner — broad-market run
// =================================================================
group("marketDiscoveryScanner — orchestrator end-to-end");
{
  const universe = ["NVDA", "CRWV", "BE", "INTC", "ZZUNCAT", "STALE", "TINYVOL", "HIGHPRICE", "MISSDATA"];
  const md = makeMarketData();
  const optionsData = { NVDA: { chain: chainFor(110) } };
  const existingSetups = {
    NVDA: {
      score: 78, probability: { probAboveStrike: 0.70, probTouch: 0.25, avgMaxDrawdown: 0.05 },
      watchlist: { spreadQuality: "A" }, regime: "RISK_ON",
      liveState: { ageSec: 30, anchorDriftPct: 0.002 },
    },
  };
  const result = runMarketDiscoveryScan({
    symbols: universe,
    marketDataBySymbol: md,
    optionsDataBySymbol: optionsData,
    existingSetupOutputsBySymbol: existingSetups,
    openPositions: [{ symbol: "BE", strategy: "short_put", strike: 30, contracts: 2 }],
    accountState: makeAccount(),
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode: "neutral",
    now: FIXED_NOW,
  });

  // Spec #15: universeStats included
  assert("output has universeStats", !!result.universeStats);
  assert("totalSymbolsScanned matches deduped input",
    result.universeStats.totalSymbolsScanned === universe.length);

  // Spec #1: scans cataloged + uncataloged
  assert("catalogedCount > 0", result.universeStats.catalogedCount > 0);
  assert("uncatalogedCount > 0", result.universeStats.uncatalogedCount > 0);

  // Spec #2: uncataloged not rejected solely for being uncataloged
  const uncatRejected = result.rejected.find(r => r.symbol === "ZZUNCAT");
  assert("uncataloged ZZUNCAT not in rejected (or rejected for non-catalog reason)",
    !uncatRejected || !/catalog/i.test(uncatRejected.reason));

  // Spec #3: missing market data → rejected
  const miss = result.rejected.find(r => r.symbol === "MISSDATA");
  assert("MISSDATA rejected with missing_market_data",
    miss && miss.reason === REJECTION.MISSING_MARKET_DATA);

  // Spec #4: stale data → rejected (in neutral mode 15min limit, 2h is way stale)
  const stale = result.rejected.find(r => r.symbol === "STALE");
  assert("STALE rejected with stale_data",
    stale && stale.reason === REJECTION.STALE_DATA);

  // Insufficient liquidity rejection
  const tiny = result.rejected.find(r => r.symbol === "TINYVOL");
  assert("TINYVOL rejected with insufficient_liquidity",
    tiny && tiny.reason === REJECTION.INSUFFICIENT_LIQUIDITY);

  // Price outside budget rejection
  const huge = result.rejected.find(r => r.symbol === "HIGHPRICE");
  assert("HIGHPRICE rejected with price_outside_budget",
    huge && huge.reason === REJECTION.PRICE_OUTSIDE_BUDGET);

  // Spec #12: capital policy applied (accountStateSummary surfaces it)
  assert("accountStateSummary present",
    !!result.accountStateSummary && typeof result.accountStateSummary.deployableCash === "number");
  assert("deployableCash = availableCash × maxDeployedPct",
    result.accountStateSummary.deployableCash === 50_000 * 0.65);

  // Spec #13: bestUseOfCapital exactly one
  const winners = result.ranked.filter(r => r.bestUseOfCapital);
  assert("exactly one bestUseOfCapital winner", winners.length === 1,
    `got ${winners.length}`);
  assert("bestUseOfCapital field matches ranked winner",
    !!result.bestUseOfCapital && result.bestUseOfCapital.symbol === winners[0].symbol);

  // Spec #14: displaced references winner symbol
  const winnerSym = result.bestUseOfCapital.symbol;
  const allDisplaced = result.displaced;
  if (allDisplaced.length > 0) {
    assert("all displaced rows reference the winner",
      allDisplaced.every(r => r.displacedBy === winnerSym));
  } else {
    console.log("  · no displaced rows in this scenario (acceptable)");
    passed++;   // count as informational pass
  }

  // Determinism
  const result2 = runMarketDiscoveryScan({
    symbols: universe,
    marketDataBySymbol: md,
    optionsDataBySymbol: optionsData,
    existingSetupOutputsBySymbol: existingSetups,
    openPositions: [{ symbol: "BE", strategy: "short_put", strike: 30, contracts: 2 }],
    accountState: makeAccount(),
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode: "neutral",
    now: FIXED_NOW,
  });
  assert("orchestrator deterministic — identical ranked",
    JSON.stringify(result.ranked) === JSON.stringify(result2.ranked));
}

// =================================================================
// 4. scannerMode behavior
// =================================================================
group("scannerMode — conservative vs neutral vs aggressive");
{
  // Build a candidate that's borderline — modest dollar volume, no chain
  const borderline = {
    BORDER: {
      symbol: "BORDER", price: 25, previousClose: 24.5,
      volume: 200_000, avgVolume: 100_000, dollarVolume: 5_000_000, // exactly at neutral floor
      atr: 0.7, iv: 30, ivPercentile: 50,
      timestamp: freshTs(60),
    },
  };
  const account = makeAccount();
  const conservative = runMarketDiscoveryScan({
    symbols: ["BORDER"], marketDataBySymbol: borderline,
    accountState: account, scannerMode: "conservative", now: FIXED_NOW,
  });
  const neutral = runMarketDiscoveryScan({
    symbols: ["BORDER"], marketDataBySymbol: borderline,
    accountState: account, scannerMode: "neutral", now: FIXED_NOW,
  });
  const aggressive = runMarketDiscoveryScan({
    symbols: ["BORDER"], marketDataBySymbol: borderline,
    accountState: account, scannerMode: "aggressive", now: FIXED_NOW,
  });

  // Spec #16: scannerMode changes thresholds
  assert("conservative mode rejects BORDER (5M < 10M)",
    conservative.rejected.some(r => r.symbol === "BORDER" && r.reason === REJECTION.INSUFFICIENT_LIQUIDITY));

  // Spec #17: aggressive accepts what conservative rejects
  assert("aggressive accepts BORDER (5M ≥ 2M)",
    aggressive.candidates.some(c => c.symbol === "BORDER")
    || aggressive.ranked.some(r => r.symbol === "BORDER"));

  // mode rules surface intuitively
  assert("conservative thresholds stricter than neutral",
    SCAN_MODE_RULES.conservative.minDollarVolume > SCAN_MODE_RULES.neutral.minDollarVolume);
  assert("aggressive thresholds looser than neutral",
    SCAN_MODE_RULES.aggressive.minDollarVolume < SCAN_MODE_RULES.neutral.minDollarVolume);

  // Stale tolerance also varies
  assert("conservative stale tolerance < neutral",
    SCAN_MODE_RULES.conservative.maxStaleSec < SCAN_MODE_RULES.neutral.maxStaleSec);
  assert("aggressive stale tolerance > neutral",
    SCAN_MODE_RULES.aggressive.maxStaleSec > SCAN_MODE_RULES.neutral.maxStaleSec);
}

// =================================================================
// 5. Non-mutation of existing setup outputs across full run
// =================================================================
group("Existing setup outputs are not mutated by the scanner");
{
  const md = makeMarketData();
  const existingBefore = {
    NVDA: {
      score: 78,
      probability: { probAboveStrike: 0.70, probTouch: 0.25, avgMaxDrawdown: 0.05 },
      watchlist: { spreadQuality: "A" }, regime: "RISK_ON",
      liveState: { ageSec: 30, anchorDriftPct: 0.002 },
    },
  };
  const snap = JSON.parse(JSON.stringify(existingBefore));
  runMarketDiscoveryScan({
    symbols: ["NVDA"], marketDataBySymbol: md,
    existingSetupOutputsBySymbol: existingBefore,
    accountState: makeAccount(),
    scannerMode: "neutral",
    now: FIXED_NOW,
  });
  assert("existing setup output unmodified after scan",
    JSON.stringify(existingBefore) === JSON.stringify(snap));
}

// =================================================================
// 6. Capital state pulled through to candidates
// =================================================================
group("Capital fit annotated on each ranked row");
{
  const result = runMarketDiscoveryScan({
    symbols: ["NVDA", "CRWV", "BE"],
    marketDataBySymbol: makeMarketData(),
    accountState: makeAccount(),
    scannerMode: "neutral",
    now: FIXED_NOW,
  });
  for (const r of result.ranked) {
    assert(`${r.symbol}: capitalFit is a known enum`,
      Object.values(CAPITAL_FIT).includes(r.capitalFit),
      `got ${r.capitalFit}`);
    assert(`${r.symbol}: action is a known enum`,
      Object.values(ACTION).includes(r.action));
    assert(`${r.symbol}: probabilityStatus surfaces`,
      Object.values(PROBABILITY_STATUS).includes(r.probabilityStatus));
    assert(`${r.symbol}: premiumSource surfaces`,
      Object.values(PREMIUM_SOURCE).includes(r.premiumSource));
  }
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
  // Example broad-market scanner output
  console.log("\n  Example broad-market scanner output (neutral mode):\n");
  const md = makeMarketData();
  const result = runMarketDiscoveryScan({
    symbols: ["NVDA", "CRWV", "BE", "INTC", "ZZUNCAT", "STALE", "TINYVOL", "HIGHPRICE", "MISSDATA"],
    marketDataBySymbol: md,
    optionsDataBySymbol: { NVDA: { chain: chainFor(110) } },
    existingSetupOutputsBySymbol: {
      NVDA: { score: 78, probability: { probAboveStrike: 0.70 }, regime: "RISK_ON",
              liveState: { ageSec: 30, anchorDriftPct: 0.002 } },
    },
    openPositions: [{ symbol: "BE", strategy: "short_put", strike: 30, contracts: 2 }],
    accountState: makeAccount(),
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode: "neutral",
    now: FIXED_NOW,
  });

  console.log(`  scannerMode: ${result.scannerMode} · regime: ${result.regimeContext.detectedRegime}`);
  console.log(`  account: avail $${result.accountStateSummary.availableCash} · deployable $${result.accountStateSummary.deployableCash} · pressure ${result.accountStateSummary.capitalPressureLevel}`);
  console.log("  universeStats:", result.universeStats);
  console.log();
  console.log("  Top 3 ranked:");
  for (const r of result.ranked.slice(0, 3)) {
    const star = r.bestUseOfCapital ? " ★" : "";
    console.log(`   #${r.rank} ${r.symbol}${star}  score=${r.lethalScore}  fit=${r.capitalFit}  action=${r.action}  premium=${r.premiumSource}`);
  }
  console.log();
  console.log("  Rejected:");
  for (const j of result.rejected) {
    console.log(`   - ${j.symbol}: ${j.reason}  (${j.detail})`);
  }
  process.exit(0);
}
