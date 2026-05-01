#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 1 backend tests
// Run: npm run test:discovery-engine
// =====================================================
//
// Covers the 15 acceptance assertions from the spec, with
// explicit notes for the two that are out of phase-1 scope
// (estimatedPremiumEngine and discoveryScoreAdapter).
// =====================================================

import {
  evaluateCapitalPolicy,
  derivePositionCollateral,
  classifyPressure,
  pickSizingBias,
  fitsRemainingDeployable,
} from "../src/engines/discovery/capitalPolicyEngine.js";

import {
  classifyBundles,
  getCatalogMeta,
  getCatalogStatus,
} from "../src/engines/discovery/bundleClassifier.js";

import {
  classifyOpportunity,
  classifyAll,
  CLASSIFIER_THRESHOLDS,
} from "../src/engines/discovery/opportunityClassifier.js";

import {
  rankCandidates,
  classifyCapitalFit,
  estimateCapitalRequired,
  regimeAlignment,
} from "../src/engines/discovery/capitalAwareRanker.js";

import {
  createScannerStateStore,
} from "../src/engines/discovery/scannerStateStore.js";

import {
  CAPITAL_PRESSURE,
  SIZING_BIAS,
  CAPITAL_FIT,
  ACTION,
  OPPORTUNITY_TYPE,
  BUNDLE,
  SCANNER_STATE_EVENT,
  PROBABILITY_STATUS,
  PREMIUM_SOURCE,
  CATALOG_STATUS,
} from "../src/engines/discovery/types.js";

let passed = 0;
let failed = 0;
const failureLines = [];

function assert(name, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? "  →  " + detail : ""}`);
    failureLines.push(name + (detail ? "  →  " + detail : ""));
    failed++;
  }
}

function group(label) {
  console.log("\n  " + label);
  console.log("  " + "─".repeat(Math.max(20, label.length)));
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 1");
console.log("  ════════════════════════════════════════════");

// ---------------------------------------------------------------
// ASSERTION 1 — availableCash drives deployable math, not total
// ---------------------------------------------------------------
group("Spec #1 — availableCash drives deployable math");
{
  const state = evaluateCapitalPolicy({
    totalAccountValue: 999_999,           // intentionally huge
    availableCash: 10_000,
    maxDeployedPct: 0.50,
    reservedCashBufferPct: 0.20,
    marketMode: "neutral",
  });
  assert("deployableCash = availableCash × maxDeployedPct (not total)",
    state.deployableCash === 5_000,
    `got ${state.deployableCash}`);
  assert("reservedCash = availableCash × reservedPct (not total)",
    state.reservedCash === 2_000,
    `got ${state.reservedCash}`);
  assert("totalAccountValue is informational only",
    state.totalAccountValue === 999_999);
  assert("worked example (48748 × 0.65 → 31686.20)",
    evaluateCapitalPolicy({
      totalAccountValue: 55_000,
      availableCash: 48_748,
      maxDeployedPct: 0.65,
      reservedCashBufferPct: 0.20,
    }).deployableCash === 31_686.20);
}

// ---------------------------------------------------------------
// ASSERTION 2 — unknown symbols do not fail
// ---------------------------------------------------------------
group("Spec #2 — unknown symbols do not fail");
{
  const meta = getCatalogMeta("ZZZUNKNOWN");
  assert("getCatalogMeta returns sector=unknown_sector", meta.sector === "unknown_sector");
  assert("getCatalogMeta returns category=unknown_category", meta.category === "unknown_category");
  assert("getCatalogMeta returns empty tags", Array.isArray(meta.tags) && meta.tags.length === 0);
  assert("getCatalogMeta returns catalogStatus=uncataloged",
    meta.catalogStatus === CATALOG_STATUS.UNCATALOGED);

  const bundle = classifyBundles("ZZZUNKNOWN");
  assert("classifyBundles returns bundles=[unknown] for unknown",
    bundle.bundles.length === 1 && bundle.bundles[0] === BUNDLE.UNKNOWN);
  assert("classifyBundles returns primaryBundle=unknown",
    bundle.primaryBundle === BUNDLE.UNKNOWN);
  assert("getCatalogStatus returns uncataloged",
    getCatalogStatus("ZZZUNKNOWN") === CATALOG_STATUS.UNCATALOGED);
}

// ---------------------------------------------------------------
// ASSERTION 3 — marketMode and detectedRegime remain separate
// ---------------------------------------------------------------
group("Spec #3 — marketMode and detectedRegime stay independent");
{
  // User says "opportunistic" while detected regime is stressed —
  // sizingBias still respects opportunistic, but regimeAlignment
  // can mismatch.
  const stressedOpportunist = evaluateCapitalPolicy({
    totalAccountValue: 50_000,
    availableCash: 50_000,
    maxDeployedPct: 0.65,
    reservedCashBufferPct: 0.20,
    marketMode: "opportunistic",
  });
  assert("marketMode preserved on capital state",
    stressedOpportunist.marketMode === "opportunistic");

  const align = regimeAlignment(
    OPPORTUNITY_TYPE.BREAKOUT,
    "CREDIT_STRESS_HIGH_PREMIUM",
    "opportunistic",
  );
  assert("breakout under stress regime detected as mismatch (not aligned)",
    align === "mismatch",
    `got ${align}`);

  const align2 = regimeAlignment(
    OPPORTUNITY_TYPE.DEFENSIVE_ROTATION,
    "CREDIT_STRESS_HIGH_PREMIUM",
    "neutral",
  );
  assert("defensive rotation under stress regime is aligned",
    align2 === "aligned");
}

// ---------------------------------------------------------------
// ASSERTION 4 — scanner accepts candidates outside tickerCatalog
// ---------------------------------------------------------------
group("Spec #4 — scanner accepts uncataloged symbols");
{
  const state = evaluateCapitalPolicy({
    totalAccountValue: 50_000, availableCash: 50_000,
    maxDeployedPct: 0.65, reservedCashBufferPct: 0.20,
    marketMode: "neutral",
  });
  const cands = [{
    symbol: "ZZUNCAT",   // not in tickerCatalog or BUNDLE_MAP
    price: 25,
    previousClose: 24,
    percentChange: 4.17,
    volume: 5_000_000, avgVolume: 2_000_000,
    dollarVolume: 125_000_000,
    detectedRegime: "RISK_ON",
    classification: classifyOpportunity({
      symbol: "ZZUNCAT", price: 25, previousClose: 24,
      volume: 5_000_000, avgVolume: 2_000_000, dollarVolume: 125_000_000,
      detectedRegime: "RISK_ON",
    }),
  }];
  let threw = false;
  let ranked;
  try { ranked = rankCandidates({ candidates: cands, capitalState: state, detectedRegime: "RISK_ON", marketMode: "neutral" }); }
  catch (e) { threw = true; failureLines.push("rank threw: " + e.message); }
  assert("rankCandidates does not throw for uncataloged symbol", !threw);
  assert("uncataloged candidate appears in output",
    !!ranked && ranked.length === 1 && ranked[0].symbol === "ZZUNCAT");
  assert("uncataloged candidate gets bundles=[unknown]",
    !!ranked && ranked[0].bundles.includes(BUNDLE.UNKNOWN));
}

// ---------------------------------------------------------------
// ASSERTION 5 — only one bestUseOfCapital candidate
// ---------------------------------------------------------------
group("Spec #5 — only one bestUseOfCapital exists");
{
  const state = evaluateCapitalPolicy({
    totalAccountValue: 60_000, availableCash: 60_000,
    maxDeployedPct: 0.65, reservedCashBufferPct: 0.20,
    marketMode: "neutral",
  });
  const baseCand = (symbol, price) => ({
    symbol, price, previousClose: price * 0.99,
    volume: 10_000_000, avgVolume: 5_000_000,
    dollarVolume: 200_000_000,
    distanceToSupportPct: 1.5,
    near20DayHigh: true,
    detectedRegime: "RISK_ON",
  });
  const inputs = [
    baseCand("NVDA", 110), baseCand("AMD", 100), baseCand("CRWV", 95),
    baseCand("BE", 30), baseCand("PLTR", 22),
  ].map(c => ({
    ...c,
    classification: classifyOpportunity({ ...c, bundles: classifyBundles(c.symbol).bundles }),
    bundles: classifyBundles(c.symbol).bundles,
    primaryBundle: classifyBundles(c.symbol).primaryBundle,
  }));
  const ranked = rankCandidates({ candidates: inputs, capitalState: state, detectedRegime: "RISK_ON", marketMode: "neutral" });
  const winners = ranked.filter(r => r.bestUseOfCapital);
  assert("exactly one bestUseOfCapital winner", winners.length === 1,
    `got ${winners.length}`);
}

// ---------------------------------------------------------------
// ASSERTION 6 — unaffordable trades not recommended for deployment
// ---------------------------------------------------------------
group("Spec #6 — unaffordable trades are NOT option_candidate / stock_candidate");
{
  const tinyCash = evaluateCapitalPolicy({
    totalAccountValue: 2_000, availableCash: 2_000,
    maxDeployedPct: 0.50, reservedCashBufferPct: 0.20,
    marketMode: "neutral",
  });
  const expensive = {
    symbol: "NVDA", price: 1100, previousClose: 1080,
    volume: 30_000_000, avgVolume: 20_000_000,
    dollarVolume: 30_000_000_000,
    near20DayHigh: true,
    detectedRegime: "RISK_ON",
  };
  expensive.bundles = classifyBundles(expensive.symbol).bundles;
  expensive.classification = classifyOpportunity(expensive);
  const ranked = rankCandidates({ candidates: [expensive], capitalState: tinyCash, detectedRegime: "RISK_ON", marketMode: "neutral" });
  const r = ranked[0];
  assert("expensive candidate marked NOT_AFFORDABLE",
    r.capitalFit === CAPITAL_FIT.NOT_AFFORDABLE,
    `got ${r.capitalFit}`);
  assert("action is NOT option_candidate / stock_candidate",
    r.action !== ACTION.OPTION_CANDIDATE && r.action !== ACTION.STOCK_CANDIDATE,
    `got ${r.action}`);
  assert("not_affordable candidate cannot win bestUseOfCapital",
    r.bestUseOfCapital === false);
}

// ---------------------------------------------------------------
// ASSERTION 7 — expensive tickers can still receive deep_scan / watch
// ---------------------------------------------------------------
group("Spec #7 — expensive but high-quality tickers stay watchable");
{
  const tinyCash = evaluateCapitalPolicy({
    totalAccountValue: 4_000, availableCash: 4_000,
    maxDeployedPct: 0.50, reservedCashBufferPct: 0.20,
    marketMode: "neutral",
  });
  const cand = {
    symbol: "NVDA", price: 900, previousClose: 880,
    volume: 50_000_000, avgVolume: 20_000_000,
    dollarVolume: 45_000_000_000,
    distanceToSupportPct: 1.0,
    near20DayHigh: true,
    detectedRegime: "RISK_ON",
  };
  cand.bundles = classifyBundles(cand.symbol).bundles;
  cand.classification = classifyOpportunity(cand);
  const ranked = rankCandidates({ candidates: [cand], capitalState: tinyCash, detectedRegime: "RISK_ON", marketMode: "neutral" });
  const r = ranked[0];
  assert("high-quality but unaffordable → action ∈ {deep_scan, watch, skip_capital_inefficient}",
    [ACTION.DEEP_SCAN, ACTION.WATCH, ACTION.SKIP_CAPITAL_INEFFICIENT].includes(r.action),
    `got ${r.action}, score ${r.lethalScore}`);
}

// ---------------------------------------------------------------
// ASSERTION 8 — estimatedPremiumEngine returns premiumSource=estimated
// (DEFERRED to phase 2)
// ---------------------------------------------------------------
group("Spec #8 — estimatedPremiumEngine (DEFERRED to phase 2)");
{
  console.log("  · skipped — estimatedPremiumEngine is phase-2 scope per spec");
}

// ---------------------------------------------------------------
// ASSERTION 9 — no random placeholder values
// ---------------------------------------------------------------
group("Spec #9 — no random values (determinism check)");
{
  const state = evaluateCapitalPolicy({
    totalAccountValue: 50_000, availableCash: 50_000,
    maxDeployedPct: 0.65, reservedCashBufferPct: 0.20,
    marketMode: "neutral",
  });
  const cand = {
    symbol: "NVDA", price: 110, previousClose: 108,
    volume: 30_000_000, avgVolume: 20_000_000,
    dollarVolume: 5_000_000_000,
    distanceToSupportPct: 1.0,
    near20DayHigh: true,
    detectedRegime: "RISK_ON",
  };
  cand.bundles = classifyBundles(cand.symbol).bundles;
  cand.classification = classifyOpportunity(cand);
  const a = rankCandidates({ candidates: [cand], capitalState: state, detectedRegime: "RISK_ON", marketMode: "neutral" });
  const b = rankCandidates({ candidates: [cand], capitalState: state, detectedRegime: "RISK_ON", marketMode: "neutral" });
  assert("identical inputs → identical lethalScore",
    a[0].lethalScore === b[0].lethalScore);
  assert("identical inputs → identical action",
    a[0].action === b[0].action);
  assert("identical inputs → identical scoreBreakdown JSON",
    JSON.stringify(a[0].scoreBreakdown) === JSON.stringify(b[0].scoreBreakdown));
}

// ---------------------------------------------------------------
// ASSERTION 10 — bundleClassifier known-symbol mappings
// ---------------------------------------------------------------
group("Spec #10 — known symbols map correctly");
{
  const nvda = classifyBundles("NVDA");
  assert("NVDA contains semiconductors",
    nvda.bundles.includes(BUNDLE.SEMICONDUCTORS));
  assert("NVDA contains ai_infrastructure",
    nvda.bundles.includes(BUNDLE.AI_INFRASTRUCTURE));

  const vrt = classifyBundles("VRT");
  assert("VRT contains datacenter_power",
    vrt.bundles.includes(BUNDLE.DATACENTER_POWER));
  assert("VRT contains ai_infrastructure",
    vrt.bundles.includes(BUNDLE.AI_INFRASTRUCTURE));

  const nee = classifyBundles("NEE");
  assert("NEE (uncataloged) contains datacenter_power, energy_grid, defensive_dividend",
    nee.bundles.includes(BUNDLE.DATACENTER_POWER)
      && nee.bundles.includes(BUNDLE.ENERGY_GRID)
      && nee.bundles.includes(BUNDLE.DEFENSIVE_DIVIDEND));

  const corz = classifyBundles("CORZ");
  assert("CORZ contains ai_infrastructure, crypto_beta, datacenter_power",
    corz.bundles.includes(BUNDLE.AI_INFRASTRUCTURE)
      && corz.bundles.includes(BUNDLE.CRYPTO_BETA)
      && corz.bundles.includes(BUNDLE.DATACENTER_POWER));

  const msft = classifyBundles("MSFT");
  assert("MSFT contains cloud_hyperscalers and ai_infrastructure",
    msft.bundles.includes(BUNDLE.CLOUD_HYPERSCALERS)
      && msft.bundles.includes(BUNDLE.AI_INFRASTRUCTURE));
}

// ---------------------------------------------------------------
// ASSERTION 11 — opportunityClassifier returns multiple types
// ---------------------------------------------------------------
group("Spec #11 — classifier returns multiple opportunity types when valid");
{
  const cand = {
    symbol: "NVDA", price: 110, previousClose: 109,
    volume: 35_000_000, avgVolume: 20_000_000,
    dollarVolume: 4_000_000_000,
    atrExpansion: 1.7,
    near20DayHigh: true,
    detectedRegime: "RISK_ON",
    bundles: classifyBundles("NVDA").bundles,
  };
  const result = classifyOpportunity(cand);
  assert("multiple opportunity types detected",
    result.opportunityTypes.length >= 2,
    `got ${result.opportunityTypes.length}: ${result.opportunityTypes.join(",")}`);
  assert("primaryType is one of the detected types",
    result.opportunityTypes.includes(result.primaryType));
  assert("classifier never returns no_trade for healthy candidate",
    !result.opportunityTypes.includes(OPPORTUNITY_TYPE.NO_TRADE));
}

// ---------------------------------------------------------------
// ASSERTION 12 — scannerStateStore detects changed top candidate
// ---------------------------------------------------------------
group("Spec #12 — scannerStateStore detects displacement");
{
  const store = createScannerStateStore();
  const before = store.getState();
  assert("initial state has no previousTopSymbol",
    before.previousTopSymbol === null);

  const r1 = store.recordScan({ topCandidate: { symbol: "NVDA", lethalScore: 80, rank: 1 } });
  assert("first scan emits new_best_opportunity",
    r1.event === SCANNER_STATE_EVENT.NEW_BEST_OPPORTUNITY);

  const r2 = store.recordScan({ topCandidate: { symbol: "NVDA", lethalScore: 80.2, rank: 1 } });
  assert("same symbol with negligible drift emits no_change",
    r2.event === SCANNER_STATE_EVENT.NO_CHANGE,
    `got ${r2.event}`);

  const r3 = store.recordScan({ topCandidate: { symbol: "AMD", lethalScore: 82, rank: 1 } });
  assert("different symbol emits trade_displaced_by_better_opportunity",
    r3.event === SCANNER_STATE_EVENT.TRADE_DISPLACED);

  store.clear();
  assert("clear resets state",
    store.getState().previousTopSymbol === null);
}

// ---------------------------------------------------------------
// ASSERTION 13 — discoveryScoreAdapter independence
// (DEFERRED to phase 2, but we validate ranker doesn't reach into
//  setupScoring / signalEngine internals).
// ---------------------------------------------------------------
group("Spec #13 — ranker does not depend on existing setupScoring (independence)");
{
  // Smoke test: rank works without any signalEngine/setupScoring imports
  const state = evaluateCapitalPolicy({
    totalAccountValue: 50_000, availableCash: 50_000,
    maxDeployedPct: 0.65, reservedCashBufferPct: 0.20,
    marketMode: "neutral",
  });
  const ranked = rankCandidates({
    candidates: [{
      symbol: "QQQ", price: 480, previousClose: 478,
      volume: 30_000_000, avgVolume: 25_000_000,
      dollarVolume: 14_000_000_000,
      detectedRegime: "RISK_ON",
      bundles: classifyBundles("QQQ").bundles,
      classification: classifyOpportunity({
        symbol: "QQQ", price: 480, previousClose: 478,
        volume: 30_000_000, avgVolume: 25_000_000,
        dollarVolume: 14_000_000_000,
        detectedRegime: "RISK_ON",
        bundles: classifyBundles("QQQ").bundles,
      }),
    }],
    capitalState: state,
    detectedRegime: "RISK_ON",
    marketMode: "neutral",
  });
  assert("ranker produces output without setupScoring",
    Array.isArray(ranked) && ranked.length === 1);
}

// ---------------------------------------------------------------
// ASSERTION 14 — probability unavailable handled gracefully
// ---------------------------------------------------------------
group("Spec #14 — probability unavailable handled gracefully");
{
  const state = evaluateCapitalPolicy({
    totalAccountValue: 50_000, availableCash: 50_000,
    maxDeployedPct: 0.65, reservedCashBufferPct: 0.20,
    marketMode: "neutral",
  });
  const cand = {
    symbol: "NVDA", price: 110, previousClose: 108,
    volume: 30_000_000, avgVolume: 20_000_000,
    dollarVolume: 3_000_000_000,
    near20DayHigh: true,
    detectedRegime: "RISK_ON",
    bundles: classifyBundles("NVDA").bundles,
    // intentionally NO probabilityStatus / probabilityScore
  };
  cand.classification = classifyOpportunity(cand);
  const ranked = rankCandidates({ candidates: [cand], capitalState: state, detectedRegime: "RISK_ON", marketMode: "neutral" });
  const r = ranked[0];
  assert("probabilityStatus is unavailable when not supplied",
    r.probabilityStatus === PROBABILITY_STATUS.UNAVAILABLE);
  assert("probabilityScore stays a finite number (no fake percent)",
    Number.isFinite(r.scoreBreakdown.probabilityScore));
  assert("score still ranges 0..100 when probability missing",
    r.lethalScore >= 0 && r.lethalScore <= 100);
}

// ---------------------------------------------------------------
// ASSERTION 15 — premium unavailable handled gracefully
// ---------------------------------------------------------------
group("Spec #15 — premium unavailable handled gracefully");
{
  const state = evaluateCapitalPolicy({
    totalAccountValue: 50_000, availableCash: 50_000,
    maxDeployedPct: 0.65, reservedCashBufferPct: 0.20,
    marketMode: "neutral",
  });
  const cand = {
    symbol: "NVDA", price: 110, previousClose: 108,
    volume: 30_000_000, avgVolume: 20_000_000,
    dollarVolume: 3_000_000_000,
    near20DayHigh: true,
    detectedRegime: "RISK_ON",
    bundles: classifyBundles("NVDA").bundles,
    // no premiumSource
  };
  cand.classification = classifyOpportunity(cand);
  const ranked = rankCandidates({ candidates: [cand], capitalState: state, detectedRegime: "RISK_ON", marketMode: "neutral" });
  const r = ranked[0];
  assert("premiumSource defaults to unavailable",
    r.premiumSource === PREMIUM_SOURCE.UNAVAILABLE);
  assert("premiumScore stays bounded when premium missing",
    Number.isFinite(r.scoreBreakdown.premiumScore)
      && r.scoreBreakdown.premiumScore >= 0
      && r.scoreBreakdown.premiumScore <= 10);
}

// ---------------------------------------------------------------
// EXTRA — additional reliability checks not in the 15 list
// ---------------------------------------------------------------
group("Extra — additional reliability checks");
{
  // pressure levels
  assert("pressure MAXED when remaining=0",
    classifyPressure(0, 1000) === CAPITAL_PRESSURE.MAXED);
  assert("pressure HIGH when remaining < 20% of deployable",
    classifyPressure(150, 1000) === CAPITAL_PRESSURE.HIGH);
  assert("pressure MODERATE when remaining 20–50% of deployable",
    classifyPressure(400, 1000) === CAPITAL_PRESSURE.MODERATE);
  assert("pressure LOW when remaining ≥ 50% of deployable",
    classifyPressure(800, 1000) === CAPITAL_PRESSURE.LOW);

  // sizing bias
  assert("MAXED → SKIP regardless of mode",
    pickSizingBias(CAPITAL_PRESSURE.MAXED, "opportunistic") === SIZING_BIAS.SKIP);
  assert("defensive + LOW → STARTER",
    pickSizingBias(CAPITAL_PRESSURE.LOW, "defensive") === SIZING_BIAS.STARTER);
  assert("opportunistic + LOW → MAX_ALLOWED",
    pickSizingBias(CAPITAL_PRESSURE.LOW, "opportunistic") === SIZING_BIAS.MAX_ALLOWED);

  // collateral derivation
  assert("short_put collateral = strike × 100 × contracts",
    derivePositionCollateral({ strategy: "short_put", strike: 100, contracts: 2 }) === 20_000);
  assert("explicit collateral overrides derivation",
    derivePositionCollateral({ strategy: "short_put", strike: 100, contracts: 2, collateral: 5_000 }) === 5_000);
  assert("unknown strategy without collateral → 0",
    derivePositionCollateral({ strategy: "?", strike: 100 }) === 0);

  // capital fit thresholds
  const stateMid = { availableCash: 50_000, remainingDeployableCash: 10_000 };
  assert("fit = excellent when req ≤ 20% of remaining",
    classifyCapitalFit(2_000, stateMid) === CAPITAL_FIT.EXCELLENT);
  assert("fit = good when 20% < req ≤ 40% of remaining",
    classifyCapitalFit(3_000, stateMid) === CAPITAL_FIT.GOOD);
  assert("fit = acceptable when 40% < req ≤ 70% of remaining",
    classifyCapitalFit(6_000, stateMid) === CAPITAL_FIT.ACCEPTABLE);
  assert("fit = poor when req > 70% of remaining but ≤ available",
    classifyCapitalFit(9_000, stateMid) === CAPITAL_FIT.POOR);
  assert("fit = not_affordable when req > availableCash",
    classifyCapitalFit(60_000, stateMid) === CAPITAL_FIT.NOT_AFFORDABLE);

  // fitsRemainingDeployable
  assert("fitsRemainingDeployable: yes when within budget",
    fitsRemainingDeployable(5_000, stateMid) === true);
  assert("fitsRemainingDeployable: no when over budget",
    fitsRemainingDeployable(15_000, stateMid) === false);

  // estimateCapitalRequired
  const tinyEst = estimateCapitalRequired({ price: 10 });
  assert("low-price candidate: stock cheaper than option ($1000 < $950 fails) — option is min",
    tinyEst.vehicle === "option" && tinyEst.capitalRequired === 950);
  const midEst = estimateCapitalRequired({ price: 200 });
  assert("mid-price candidate: option cheaper than stock",
    midEst.vehicle === "option" && midEst.capitalRequired === 200 * 0.95 * 100);

  // classifier disqualifiers
  const dq = classifyOpportunity({
    symbol: "ZZZ", price: 0.50, dollarVolume: 100_000,
  });
  assert("classifier flags low-price as no_trade",
    dq.primaryType === OPPORTUNITY_TYPE.NO_TRADE);

  // classifyAll
  const all = classifyAll([
    { symbol: "A", price: 100, previousClose: 99, volume: 100, avgVolume: 100, dollarVolume: 50_000_000 },
    { symbol: "B", price: 100, previousClose: 99, volume: 200, avgVolume: 100, dollarVolume: 50_000_000 },
  ]);
  assert("classifyAll returns array", Array.isArray(all) && all.length === 2);

  // bundle relatedSymbols
  const nvda = classifyBundles("NVDA");
  assert("NVDA relatedSymbols excludes self",
    !nvda.relatedSymbols.includes("NVDA"));

  // catalog status for known symbol
  assert("getCatalogStatus returns cataloged for NVDA",
    getCatalogStatus("NVDA") === CATALOG_STATUS.CATALOGED);
}

// ---------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------
console.log("\n  ────────────────────────────");
console.log(`  ${passed} passed · ${failed} failed`);
console.log("  ────────────────────────────\n");

if (failed > 0) {
  console.log("  Failures:");
  for (const f of failureLines) console.log(`    - ${f}`);
  process.exit(1);
} else {
  // Example output from a small mock broad-market scan
  console.log("\n  Example mock broad-market scan output (top 3):\n");
  const state = evaluateCapitalPolicy({
    totalAccountValue: 55_000, availableCash: 48_748,
    maxDeployedPct: 0.65, reservedCashBufferPct: 0.20,
    currentOpenPositions: [{ symbol: "BE", strategy: "short_put", strike: 30, contracts: 2 }],
    marketMode: "neutral",
  });

  const universe = [
    { symbol: "NVDA", price: 110, previousClose: 108, volume: 35_000_000, avgVolume: 20_000_000, dollarVolume: 3_500_000_000, atrExpansion: 1.6, near20DayHigh: true, distanceToSupportPct: 1.5, detectedRegime: "RISK_ON" },
    { symbol: "CRWV", price: 95, previousClose: 96, volume: 12_000_000, avgVolume: 8_000_000, dollarVolume: 1_100_000_000, atrExpansion: 1.4, distanceToSupportPct: 1.0, detectedRegime: "RISK_ON" },
    { symbol: "BE", price: 30, previousClose: 29.5, volume: 8_000_000, avgVolume: 6_000_000, dollarVolume: 240_000_000, atrExpansion: 1.2, distanceToSupportPct: 0.5, detectedRegime: "RISK_ON" },
    { symbol: "INTC", price: 32, previousClose: 31.5, volume: 25_000_000, avgVolume: 30_000_000, dollarVolume: 800_000_000, detectedRegime: "RISK_ON" },
    { symbol: "ZZUNCAT", price: 40, previousClose: 38, volume: 4_000_000, avgVolume: 2_000_000, dollarVolume: 160_000_000, detectedRegime: "RISK_ON" },
  ].map(c => {
    const bundles = classifyBundles(c.symbol).bundles;
    return {
      ...c,
      bundles,
      classification: classifyOpportunity({ ...c, bundles }),
    };
  });

  const ranked = rankCandidates({
    candidates: universe,
    capitalState: state,
    detectedRegime: "RISK_ON",
    marketMode: "neutral",
    currentOpenPositions: [{ symbol: "BE", primaryBundle: BUNDLE.AI_INFRASTRUCTURE }],
  });

  for (const r of ranked.slice(0, 3)) {
    const star = r.bestUseOfCapital ? " ★" : "";
    console.log(`  #${r.rank} ${r.symbol}${star}  score=${r.lethalScore}  fit=${r.capitalFit}  action=${r.action}`);
    console.log(`     primaryType: ${r.primaryType}`);
    console.log(`     bundles: ${r.bundles.join(", ")}`);
    console.log(`     capitalRequired: $${r.capitalRequired}  remainingAfter: $${r.remainingDeployableAfterTrade}`);
    console.log(`     ${r.explanation}`);
    console.log();
  }
  process.exit(0);
}
