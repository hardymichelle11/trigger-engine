#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.5B tests
// Run: npm run test:discovery-phase4-5b
// =====================================================
//
// Verifies the Trade Construction Snapshot Shell:
//   - selected symbol found returns safe context
//   - selected symbol missing returns null
//   - missing price/ATR/support does not crash
//   - unavailable premium renders safely
//   - hostile fields are stripped
//   - no forbidden engine internals pass through
//   - JSX validity for both LethalBoard.jsx and TradeConstructionSection.jsx
//   - Phase 4.5B never sets premiumSource = "live"
//   - LethalBoardPage forwards tradeContext to LethalBoard
// =====================================================

import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";

import {
  buildTradeConstructionContext,
  TRADE_CONSTRUCTION_PREMIUM_SOURCE,
  TRADE_CONSTRUCTION_VERIFY_WARNING,
} from "../src/components/discovery/tradeConstructionContext.js";

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
// FIXTURES — synthetic scan results
// --------------------------------------------------

function makeScanResult({ candidates }) {
  return {
    scannerMode: "neutral",
    regimeContext: { detectedRegime: "RISK_ON" },
    accountStateSummary: {},
    universeStats: {},
    ranked: [],
    rejected: [],
    warnings: [],
    candidates,
  };
}

function fullCandidate(symbol = "NVDA") {
  return {
    symbol, price: 110.5,
    previousClose: 108, percentChange: 2.31,
    volume: 35_000_000, avgVolume: 20_000_000, dollarVolume: 3_900_000_000,
    distanceToSupportPct: 1.5,
    atr: 2.4,
    classification: { primaryType: "breakout_candidate", confidence: 0.7, reasons: [], disqualifiers: [] },
    primaryType: "breakout_candidate",
    bundles: ["semiconductors", "ai_infrastructure"],
    primaryBundle: "semiconductors",
    concentrationTags: ["AI_THEME"],
    probabilityStatus: "unavailable",
    premiumSource: "estimated",
    premiumScore: 6,
    premiumEstimate: {
      method: "iv_estimated",
      preferredStrike: 105,
      preferredDte: 14,
      estimatedPremium: 1.45,
      collateralRequired: 10_500,
      liquidityGrade: "unknown",
      spreadRisk: "unknown",
      confidence: "medium",
      premiumSource: "estimated",
    },
    catalogStatus: "cataloged",
    catalogMeta: {},
  };
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.5B");
console.log("  ════════════════════════════════════════════");

// =================================================================
// 1. Selected symbol found → safe whitelisted context
// =================================================================
group("found candidate → safe context shape");
{
  const scan = makeScanResult({ candidates: [fullCandidate("NVDA")] });
  const ctx = buildTradeConstructionContext({ scanResult: scan, selectedSymbol: "NVDA" });

  assert("returns object (not null)", !!ctx);
  assert("symbol uppercase = NVDA", ctx.symbol === "NVDA");
  assert("currentPrice = 110.5", ctx.currentPrice === 110.5);
  assert("suggestedStrike = 105", ctx.suggestedStrike === 105);
  assert("expirationDte = 14", ctx.expirationDte === 14);
  assert("expirationLabel = '14 DTE'", ctx.expirationLabel === "14 DTE");
  assert("premiumSource = 'estimated' (Phase 4.5B never live)",
    ctx.premiumSource === TRADE_CONSTRUCTION_PREMIUM_SOURCE.ESTIMATED);
  assert("estimatedPremium = 1.45", ctx.estimatedPremium === 1.45);
  assert("estimatedCollateral = 10500", ctx.estimatedCollateral === 10500);
  assert("atr = 2.4", ctx.atr === 2.4);
  assert("verifyWarning is the canonical string",
    ctx.verifyWarning === TRADE_CONSTRUCTION_VERIFY_WARNING);
  assert("ctx is frozen (immutable)", Object.isFrozen(ctx));

  // Distance math
  // price 110.5, strike 105 → diff = 5.5, pct = 4.98%
  assert("distanceFromPriceToStrike ≈ 5.5",
    Math.abs(ctx.distanceFromPriceToStrike - 5.5) < 0.01);
  assert("distanceFromPriceToStrikePct ≈ 4.98",
    Math.abs(ctx.distanceFromPriceToStrikePct - 4.98) < 0.05);

  // ATR distance: |110.5 - 105| / 2.4 ≈ 2.29
  assert("atrDistanceFromStrike ≈ 2.29",
    Math.abs(ctx.atrDistanceFromStrike - 2.29) < 0.01);

  // Support/R1/R2 = null when chartContextBySymbol not supplied
  assert("support = null (no chart context)", ctx.support === null);
  assert("r1 = null", ctx.r1 === null);
  assert("r2 = null", ctx.r2 === null);
  assert("distanceFromSupportToStrike = null", ctx.distanceFromSupportToStrike === null);

  // Live chain fields = null in Phase 4.5B
  assert("bid = null (no chain snapshot)", ctx.bid === null);
  assert("ask = null", ctx.ask === null);
  assert("mid = null", ctx.mid === null);
  assert("last = null", ctx.last === null);
}

// =================================================================
// 2. Selected symbol missing → null
// =================================================================
group("selected symbol missing → null");
{
  const scan = makeScanResult({ candidates: [fullCandidate("NVDA")] });
  const ctx = buildTradeConstructionContext({ scanResult: scan, selectedSymbol: "AMD" });
  assert("AMD not in candidates → null", ctx === null);

  const ctxEmpty = buildTradeConstructionContext({ scanResult: { candidates: [] }, selectedSymbol: "NVDA" });
  assert("empty candidates → null", ctxEmpty === null);

  const ctxNoScan = buildTradeConstructionContext({ scanResult: null, selectedSymbol: "NVDA" });
  assert("null scanResult → null", ctxNoScan === null);

  const ctxNoSym = buildTradeConstructionContext({ scanResult: makeScanResult({ candidates: [fullCandidate("NVDA")] }), selectedSymbol: null });
  assert("null selectedSymbol → null", ctxNoSym === null);
}

// =================================================================
// 3. Missing price/ATR/support — no crash, em-dash via null
// =================================================================
group("missing data does not crash; renders as null");
{
  const minimal = {
    symbol: "ZZZ",
    // no price, no atr, no premiumEstimate
  };
  const scan = makeScanResult({ candidates: [minimal] });
  let threw = false;
  let ctx;
  try { ctx = buildTradeConstructionContext({ scanResult: scan, selectedSymbol: "ZZZ" }); }
  catch (e) { threw = true; failureLines.push("threw: " + e.message); }
  assert("missing fields: does not throw", !threw);
  assert("symbol still surfaces", ctx?.symbol === "ZZZ");
  assert("currentPrice null", ctx?.currentPrice === null);
  assert("suggestedStrike null", ctx?.suggestedStrike === null);
  assert("atr null", ctx?.atr === null);
  assert("estimatedPremium null", ctx?.estimatedPremium === null);
  assert("estimatedCollateral null", ctx?.estimatedCollateral === null);
  assert("expirationDte null", ctx?.expirationDte === null);
  assert("expirationLabel null", ctx?.expirationLabel === null);
  assert("premiumSource = 'unavailable'", ctx?.premiumSource === "unavailable");
  assert("distance fields null when inputs missing",
    ctx?.distanceFromPriceToStrike === null
    && ctx?.distanceFromPriceToStrikePct === null
    && ctx?.atrDistanceFromStrike === null);
  assert("verifyWarning still present", typeof ctx?.verifyWarning === "string" && ctx.verifyWarning.length > 0);
}

// =================================================================
// 4. Unavailable premium — Phase 4.5B fallback
// =================================================================
group("unavailable premium renders safely");
{
  const c = fullCandidate("NVDA");
  c.premiumEstimate = { method: "insufficient_data", preferredStrike: null, preferredDte: null };
  const scan = makeScanResult({ candidates: [c] });
  const ctx = buildTradeConstructionContext({ scanResult: scan, selectedSymbol: "NVDA" });
  assert("insufficient_data → premiumSource = unavailable",
    ctx.premiumSource === "unavailable");
  assert("estimatedPremium null when unavailable",
    ctx.estimatedPremium === null);
  assert("UI never sees a 'live' label here",
    ctx.premiumSource !== "live");
}

// =================================================================
// 5. Hostile fields are stripped
// =================================================================
group("hostile candidate fields are NOT passed through");
{
  const hostile = {
    ...fullCandidate("NVDA"),
    // Inject every banned field on the candidate
    scoreBreakdown: { capitalFitScore: 25, opportunityScore: 18 },
    weights: { x: 1, y: 2 },
    probability: { probAboveStrike: 0.71, probTouch: 0.20 },
    probAboveStrike: 0.71,
    touchProbability: 0.20,
    avgMaxDrawdown: 0.05,
    ivPercentile: 65,
    ivSource: "polygon",
    ivConfidence: "high",
    monteCarloPaths: 1000,
    expectedMove: 6.5,
    debug: "internal",
    p10: 100, p25: 105, p50: 110, p75: 115, p90: 120,
  };
  const scan = makeScanResult({ candidates: [hostile] });
  const ctx = buildTradeConstructionContext({ scanResult: scan, selectedSymbol: "NVDA" });

  for (const banned of [
    "scoreBreakdown", "weights",
    "probability", "probAboveStrike", "touchProbability",
    "avgMaxDrawdown",
    "ivPercentile", "ivSource", "ivConfidence",
    "monteCarloPaths", "expectedMove",
    "debug",
    "p10", "p25", "p50", "p75", "p90",
  ]) {
    assert(`tradeContext does NOT expose '${banned}'`, !(banned in ctx));
  }
  // Output keys are exactly the documented whitelist — no surprise extras.
  // Phase 4.5C+1 added five resolvedExpiration* fields; whitelist updated.
  const expectedKeys = new Set([
    "symbol", "currentPrice", "suggestedStrike", "expirationDte", "expirationLabel",
    "resolvedExpiration", "resolvedExpirationDte", "resolvedExpirationLabel",
    "resolvedExpirationMatched", "resolvedExpirationReason",
    "premiumSource", "estimatedPremium", "estimatedCollateral", "atr",
    "support", "r1", "r2",
    "distanceFromPriceToStrike", "distanceFromPriceToStrikePct",
    "distanceFromSupportToStrike", "distanceFromSupportToStrikePct",
    "atrDistanceFromStrike",
    "bid", "ask", "mid", "last",
    "liquidityGrade", "spreadRisk", "spreadWidthLabel", "liquidityWarning",
    "verifyWarning",
  ]);
  const actualKeys = new Set(Object.keys(ctx));
  for (const k of actualKeys) {
    assert(`output key '${k}' is whitelisted`, expectedKeys.has(k));
  }
  assert(`output key count matches whitelist (${expectedKeys.size})`,
    actualKeys.size === expectedKeys.size);
}

// =================================================================
// 6. Hostile premiumEstimate fields are stripped
// =================================================================
group("hostile premiumEstimate fields stripped");
{
  const c = fullCandidate("NVDA");
  c.premiumEstimate = {
    ...c.premiumEstimate,
    // Inject hostile fields on the premium estimate side
    scoreBreakdown: { x: 1 },
    probability: { probAboveStrike: 0.7 },
    monteCarloPaths: 1000,
    rawIv: 0.32,
  };
  const scan = makeScanResult({ candidates: [c] });
  const ctx = buildTradeConstructionContext({ scanResult: scan, selectedSymbol: "NVDA" });
  for (const banned of ["scoreBreakdown", "probability", "monteCarloPaths", "rawIv"]) {
    assert(`hostile premiumEstimate field '${banned}' NOT in tradeContext`,
      !(banned in ctx));
  }
}

// =================================================================
// 7. Chart context provides support/R1/R2 when supplied
// =================================================================
group("chart context populates support / R1 / R2");
{
  const scan = makeScanResult({ candidates: [fullCandidate("NVDA")] });
  const ctx = buildTradeConstructionContext({
    scanResult: scan, selectedSymbol: "NVDA",
    chartContextBySymbol: {
      NVDA: { support: 100, r1: 115, r2: 122 },
    },
  });
  assert("support = 100", ctx.support === 100);
  assert("r1 = 115", ctx.r1 === 115);
  assert("r2 = 122", ctx.r2 === 122);
  // distanceFromSupportToStrike: 100 - 105 = -5; pct = -5%
  assert("distanceFromSupportToStrike = -5", ctx.distanceFromSupportToStrike === -5);
  assert("distanceFromSupportToStrikePct = -5",
    Math.abs(ctx.distanceFromSupportToStrikePct + 5) < 0.01);
}

// =================================================================
// 8. Phase 4.5B never sets premiumSource = "live"
// =================================================================
group("Phase 4.5B never claims live premium");
{
  // Even if the candidate's premiumEstimate.method is "chain_based" — a
  // real chain row was used during the estimation step — the UI label
  // remains "estimated" until a live optionChainSnapshot is actually
  // passed (Phase 4.5C). This is the safety boundary.
  const c = fullCandidate("NVDA");
  c.premiumEstimate.method = "chain_based";
  c.premiumEstimate.premiumSource = "live";    // even if this is set internally,
                                                // the helper does not promote it
                                                // without a live snapshot.
  const scan = makeScanResult({ candidates: [c] });
  const ctx = buildTradeConstructionContext({ scanResult: scan, selectedSymbol: "NVDA" });
  assert("chain_based method WITHOUT optionChainSnapshot → 'estimated'",
    ctx.premiumSource === "estimated");

  // With a live snapshot present and valid bid/ask, premiumSource WILL be "live".
  // This test pre-validates the Phase 4.5C path will work.
  const ctxLive = buildTradeConstructionContext({
    scanResult: scan, selectedSymbol: "NVDA",
    optionChainSnapshot: { status: "live", bid: 1.40, ask: 1.50, mid: 1.45 },
  });
  assert("live snapshot present + status=live + valid quotes → 'live'",
    ctxLive.premiumSource === "live");
  assert("live snapshot bid surfaces", ctxLive.bid === 1.40);
  assert("live snapshot ask surfaces", ctxLive.ask === 1.50);
  assert("live snapshot mid surfaces", ctxLive.mid === 1.45);

  // Snapshot WITHOUT live status falls back to estimated even if quotes exist
  const ctxNotLive = buildTradeConstructionContext({
    scanResult: scan, selectedSymbol: "NVDA",
    optionChainSnapshot: { status: "unavailable", bid: 1.40, ask: 1.50 },
  });
  assert("snapshot status=unavailable → still 'estimated'",
    ctxNotLive.premiumSource === "estimated");
}

// =================================================================
// 9. Liquidity warnings
// =================================================================
group("liquidity warnings (Phase 4.5C readiness)");
{
  const scan = makeScanResult({ candidates: [fullCandidate("NVDA")] });
  // Wide spread → warning
  const wide = buildTradeConstructionContext({
    scanResult: scan, selectedSymbol: "NVDA",
    optionChainSnapshot: { status: "live", bid: 1.00, ask: 1.50, mid: 1.25 },
  });
  assert("wide bid/ask spread → spreadWidthLabel='wide'",
    wide.spreadWidthLabel === "wide");
  assert("wide spread → liquidityWarning surfaces",
    typeof wide.liquidityWarning === "string"
    && /wide bid\/ask|verify before entry/i.test(wide.liquidityWarning));

  // Tight spread → no warning
  const tight = buildTradeConstructionContext({
    scanResult: scan, selectedSymbol: "NVDA",
    optionChainSnapshot: { status: "live", bid: 1.45, ask: 1.46, mid: 1.455 },
  });
  assert("tight spread → no liquidityWarning",
    tight.liquidityWarning === null);

  // Bid/ask missing
  const missing = buildTradeConstructionContext({
    scanResult: scan, selectedSymbol: "NVDA",
    optionChainSnapshot: { status: "live", bid: 1.45, ask: null },
  });
  assert("bid OR ask missing → warning",
    typeof missing.liquidityWarning === "string"
    && /missing|incomplete/i.test(missing.liquidityWarning));
}

// =================================================================
// 10. JSX validity for both component files
// =================================================================
group("JSX validity (LethalBoard.jsx + TradeConstructionSection.jsx)");
{
  for (const file of [
    "src/components/discovery/LethalBoard.jsx",
    "src/components/discovery/TradeConstructionSection.jsx",
  ]) {
    const src = readFileSync(file, "utf8");
    let ok = true; let err = null;
    try { await transformWithOxc(src, file, { lang: "jsx" }); }
    catch (e) { ok = false; err = e?.message || String(e); }
    assert(`${file} parses as valid JSX`, ok, err);
  }
}

// =================================================================
// 11. Wire-through audits
// =================================================================
group("wire-through — placeholder removed, props plumbed end-to-end");
{
  const board = readFileSync("src/components/discovery/LethalBoard.jsx", "utf8");
  const codeOnly = stripComments(board);

  assert("LethalBoard imports TradeConstructionSection",
    /import\s+TradeConstructionSection\s+from\s+["'][^"']*TradeConstructionSection\.jsx["']/.test(board));
  assert("LethalBoard accepts tradeContext prop",
    /tradeContext\s*=\s*null/.test(codeOnly) || /tradeContext\s*,/.test(codeOnly));
  assert("LethalBoard threads tradeContext to DetailPanel",
    /<DetailPanel[^>]*tradeContext\s*=\s*\{\s*tradeContext\s*\}/.test(codeOnly));
  assert("LethalBoard renders <TradeConstructionSection />",
    /<TradeConstructionSection[\s\S]*?tradeContext\s*=\s*\{/.test(codeOnly));
  assert("LethalBoard no longer references TradeConstructionPlaceholder",
    !/TradeConstructionPlaceholder/.test(codeOnly));

  const page = readFileSync("src/components/discovery/LethalBoardPage.jsx", "utf8");
  const pageCode = stripComments(page);
  assert("LethalBoardPage imports buildTradeConstructionContext",
    /buildTradeConstructionContext/.test(pageCode));
  // Phase 4.7: per-symbol tradeContextBySymbol map built via useMemo and
  // passed to LethalBoardCockpit. The Phase 4.4 single-context-per-render
  // shape is also accepted for backward-compat.
  assert("LethalBoardPage builds trade context (single tradeContext or per-symbol map) from buildTradeConstructionContext",
    /tradeContext\s*=\s*\{\s*buildTradeConstructionContext\s*\(/.test(pageCode)
      || /tradeContextBySymbol\s*=\s*useMemo\([\s\S]*buildTradeConstructionContext/.test(pageCode));
  assert("LethalBoardPage passes trade context to LethalBoard or LethalBoardCockpit",
    /<LethalBoard[\s\S]*?tradeContext\s*=\s*\{\s*buildTradeConstructionContext/.test(pageCode)
      || /<LethalBoardCockpit[\s\S]*?tradeContextBySymbol\s*=\s*\{\s*tradeContextBySymbol\s*\}/.test(pageCode));
  // No NEW fetch added; helper takes existing in-memory state.
  // Existing loadAlertHistory references stay at 2 (Phase 4.2 contract).
  const loadHits = (pageCode.match(/loadAlertHistory/g) || []).length;
  assert("LethalBoardPage has not added new alertHistory references",
    loadHits === 2, `got ${loadHits}`);
}

// =================================================================
// 12. tradeConstructionContext.js purity audit
// =================================================================
group("helper purity — no UI / engine / persistence imports");
{
  const src = readFileSync("src/components/discovery/tradeConstructionContext.js", "utf8");
  const codeOnly = stripComments(src);
  for (const banned of [
    "alertHistory", "recordedAlertsRollup", "recordedAlertsView",
    "setupScoring", "signalEngine", "calibrationTracker",
    "capitalAwareRanker", "rankCandidates",
    "LethalBoard", "polygonProxy", "localStorage",
    "fetch(",
  ]) {
    assert(`tradeConstructionContext does NOT reference ${banned}`,
      !new RegExp(banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(codeOnly));
  }
  assert("exports buildTradeConstructionContext",
    /export\s+function\s+buildTradeConstructionContext/.test(src));
  assert("exports TRADE_CONSTRUCTION_PREMIUM_SOURCE",
    /export\s+const\s+TRADE_CONSTRUCTION_PREMIUM_SOURCE/.test(src));
}

// =================================================================
// 13. Frozen-files regression
// =================================================================
group("frozen files unchanged");
{
  for (const [name, src] of [
    ["recordedAlertsRollup.js", readFileSync("src/components/discovery/recordedAlertsRollup.js", "utf8")],
    ["recordedAlertsView.js",   readFileSync("src/components/discovery/recordedAlertsView.js", "utf8")],
    ["alertHistory.js",          readFileSync("src/lib/alerts/alertHistory.js", "utf8")],
  ]) {
    assert(`${name} does NOT reference tradeContext`,
      !/tradeContext/.test(src));
    assert(`${name} does NOT reference TradeConstructionSection`,
      !/TradeConstructionSection/.test(src));
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
  // Demo
  const scan = makeScanResult({ candidates: [fullCandidate("NVDA")] });
  const demo = buildTradeConstructionContext({
    scanResult: scan, selectedSymbol: "NVDA",
    chartContextBySymbol: { NVDA: { support: 100, r1: 115, r2: 122 } },
  });
  console.log("\n  Example trade construction context:");
  console.log(`    symbol            ${demo.symbol}`);
  console.log(`    currentPrice      $${demo.currentPrice}`);
  console.log(`    suggestedStrike   $${demo.suggestedStrike}`);
  console.log(`    expiration        ${demo.expirationLabel}`);
  console.log(`    premiumSource     ${demo.premiumSource}`);
  console.log(`    estimatedPremium  $${demo.estimatedPremium}`);
  console.log(`    estCollateral     $${demo.estimatedCollateral}`);
  console.log(`    atr               ${demo.atr}`);
  console.log(`    support           $${demo.support}`);
  console.log(`    r1 / r2           $${demo.r1} / $${demo.r2}`);
  console.log(`    price→strike      $${demo.distanceFromPriceToStrike} (${demo.distanceFromPriceToStrikePct}%)`);
  console.log(`    support→strike    $${demo.distanceFromSupportToStrike} (${demo.distanceFromSupportToStrikePct}%)`);
  console.log(`    atrDistance       ${demo.atrDistanceFromStrike}×`);
  console.log(`    bid / ask / mid   ${demo.bid} / ${demo.ask} / ${demo.mid}    (Phase 4.5C will populate)`);
  console.log(`    ⚠ ${demo.verifyWarning}`);
  process.exit(0);
}
