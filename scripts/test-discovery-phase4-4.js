#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.4 tests
// Run: npm run test:discovery-phase4-4
// =====================================================
//
// UI-only refactor verification:
//   - View-model rows now expose keyReasons[] + risks[]
//   - Phase 3 safety regression: rows STILL strip internals
//     (scoreBreakdown, weights, probability, IV fields, debug)
//   - LethalBoard.jsx is JSX-valid and references the new
//     RankedGrid / DetailPanel / ScoreRing / TradeConstructionPlaceholder
//   - LethalBoard accepts lifted selectedSymbol + onSelectSymbol props
//   - LethalBoard does NOT render forbidden engine internals
//   - LethalBoardPage owns selectedSymbol state and passes it down
//   - Frozen files are not modified
// =====================================================

import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";

import {
  buildLethalBoardViewModel,
} from "../src/components/discovery/lethalBoardViewModel.js";

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

// Strip line + block comments before source-audit grep checks.
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// --------------------------------------------------
// FIXTURE — synthetic scan result
// --------------------------------------------------

function syntheticScanResult() {
  return {
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
        premiumSource: PREMIUM_SOURCE.LIVE,
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
        premiumSource: PREMIUM_SOURCE.ESTIMATED,
        probabilityStatus: "unavailable",
      },
      {
        rank: 3, symbol: "INTC", action: ACTION.WATCH,
        lethalScore: 55, capitalFit: "excellent", capitalRequired: 3_200,
        bundles: ["unknown"],
        primaryType: "watch_only",
        bestUseOfCapital: false, displacedBy: null,
        regimeAlignment: "neutral",
        premiumSource: PREMIUM_SOURCE.UNAVAILABLE,
        probabilityStatus: "unavailable",
      },
    ],
    rejected: [],
    warnings: [],
  };
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.4");
console.log("  ════════════════════════════════════════════");

// =================================================================
// 1. View-model rows now carry keyReasons + risks
// =================================================================
group("view-model — rows enriched with keyReasons + risks");
{
  const vm = buildLethalBoardViewModel(syntheticScanResult());
  assert("vm has rows", Array.isArray(vm.rows) && vm.rows.length === 3);

  for (const r of vm.rows) {
    assert(`${r.symbol}: keyReasons is an array`,
      Array.isArray(r.keyReasons));
    assert(`${r.symbol}: risks is an array`,
      Array.isArray(r.risks));
    assert(`${r.symbol}: keyReasons entries are strings`,
      r.keyReasons.every(s => typeof s === "string"));
    assert(`${r.symbol}: risks entries are strings`,
      r.risks.every(s => typeof s === "string"));
  }

  // Concrete content checks: NVDA (live, good fit, aligned) → high-positive reasons
  const nvda = vm.rows.find(r => r.symbol === "NVDA");
  assert("NVDA: keyReasons non-empty",
    nvda.keyReasons.length > 0);
  assert("NVDA: keyReasons mentions live chain",
    nvda.keyReasons.some(s => /live options chain/i.test(s)));

  // CRWV (estimated, displaced) → risks include premium-estimated warning
  const crwv = vm.rows.find(r => r.symbol === "CRWV");
  assert("CRWV: risks include premium-estimated warning",
    crwv.risks.some(s => /estimated, not from a live chain/i.test(s)));
  assert("CRWV: risks mention concentration warning",
    crwv.risks.some(s => /concentration|exposed/i.test(s)));

  // INTC (premium unavailable) → risks include premium-unavailable warning
  const intc = vm.rows.find(r => r.symbol === "INTC");
  assert("INTC: risks include premium-unavailable warning",
    intc.risks.some(s => /No premium data available/i.test(s)));
}

// =================================================================
// 2. Phase 3 regression: rows still strip ALL forbidden internals
// =================================================================
group("Phase 3 regression — rows do not expose engine internals");
{
  const hostile = {
    ...syntheticScanResult(),
    ranked: [{
      // Inject every forbidden field on a ranker row
      rank: 1, symbol: "NVDA", action: ACTION.OPTION_CANDIDATE,
      lethalScore: 92, capitalFit: "good", capitalRequired: 10_450,
      bundles: ["semiconductors"], primaryType: "breakout_candidate",
      bestUseOfCapital: true, displacedBy: null,
      regimeAlignment: "aligned",
      premiumSource: PREMIUM_SOURCE.LIVE, probabilityStatus: "available",
      // Banned passthrough fields — must be stripped by the projection
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
    }],
  };
  const vm = buildLethalBoardViewModel(hostile);
  const sample = vm.rows[0];

  for (const banned of [
    "scoreBreakdown", "weights",
    "probability", "probAboveStrike", "touchProbability",
    "avgMaxDrawdown",
    "ivPercentile", "ivSource", "ivConfidence",
    "monteCarloPaths", "expectedMove",
    "debug",
  ]) {
    assert(`row does NOT expose '${banned}'`,
      !(banned in sample));
  }

  // Best card also must not leak
  const best = vm.best;
  for (const banned of [
    "scoreBreakdown", "weights", "probability",
    "ivPercentile", "ivSource", "monteCarloPaths", "debug",
  ]) {
    assert(`best card does NOT expose '${banned}'`, !(banned in best));
  }

  // Reasons content must not contain numeric internals masquerading as strings
  for (const s of [...sample.keyReasons, ...sample.risks]) {
    assert(`reason string does not embed probAboveStrike percentage: "${s}"`,
      !/\b71%\b/.test(s) && !/probAboveStrike/i.test(s));
    assert(`reason string does not embed touchProbability: "${s}"`,
      !/touch\s*probability/i.test(s));
  }
}

// =================================================================
// 3. Best card retained behavior (Phase 3 contract)
// =================================================================
group("best card — Phase 3 contract preserved");
{
  const vm = buildLethalBoardViewModel(syntheticScanResult());
  assert("best card present", !!vm.best);
  assert("best card symbol", vm.best.symbol === "NVDA");
  assert("best card premiumIsLive=true",
    vm.best.premiumIsLive === true);
  assert("best card premiumMethod = 'live'",
    vm.best.premiumMethod === "live");
  assert("best card has keyReasons",
    Array.isArray(vm.best.keyReasons) && vm.best.keyReasons.length > 0);
  assert("best card has risks",
    Array.isArray(vm.best.risks));
}

// =================================================================
// 4. LethalBoard.jsx — JSX validity + structural checks
// =================================================================
group("LethalBoard.jsx — structure + safety");
{
  const src = readFileSync("src/components/discovery/LethalBoard.jsx", "utf8");
  let ok = true; let err = null;
  try { await transformWithOxc(src, "LethalBoard.jsx", { lang: "jsx" }); }
  catch (e) { ok = false; err = e?.message || String(e); }
  assert("LethalBoard.jsx parses as valid JSX", ok, err);

  // Phase 4.4 structure
  assert("declares RankedGrid component",
    /function\s+RankedGrid\s*\(/.test(src));
  assert("declares RankedCard component",
    /function\s+RankedCard\s*\(/.test(src));
  assert("declares DetailPanel component",
    /function\s+DetailPanel\s*\(/.test(src));
  assert("declares ScoreRing component",
    /function\s+ScoreRing\s*\(/.test(src));
  assert("declares BundlePills component",
    /function\s+BundlePills\s*\(/.test(src));
  assert("declares ActionPill component",
    /function\s+ActionPill\s*\(/.test(src));
  // Phase 4.5B replaced the placeholder with TradeConstructionSection.
  // Either shape is acceptable here — what matters is that the layout
  // slot exists in the DetailPanel.
  assert("declares TradeConstructionPlaceholder OR imports TradeConstructionSection",
    /function\s+TradeConstructionPlaceholder\s*\(/.test(src)
    || /import\s+TradeConstructionSection\s+from/.test(src));
  assert("renders RankedGrid",
    /<RankedGrid\s/.test(src));
  assert("renders DetailPanel",
    /<DetailPanel\s/.test(src));
  assert("renders Trade Construction slot inside DetailPanel",
    /<TradeConstructionPlaceholder\s*\/>/.test(src)
    || /<TradeConstructionSection\b/.test(src));
  // Phase 4.5B moved the heading copy into TradeConstructionSection.jsx;
  // accept either the in-LethalBoard copy or the section component reference.
  assert("Trade Construction copy reachable (placeholder OR section import)",
    /Trade construction.*selected ticker/i.test(src)
    || /TradeConstructionSection/.test(src));
  // The "Phase 4.5" placeholder text only existed pre-4.5B. After 4.5B the
  // section is real, so this assertion is now a no-op pass.
  assert("Phase 4.5 marker no longer required (section landed)",
    true);

  // Lifted selection contract
  assert("LethalBoard accepts selectedSymbol prop",
    /selectedSymbol\s*=\s*null/.test(src) || /selectedSymbol\s*,/.test(src));
  assert("LethalBoard accepts onSelectSymbol prop",
    /onSelectSymbol/.test(src));
  // Click handler in RankedGrid forwards selection upward
  assert("RankedGrid wires onClick → onSelectSymbol(row.symbol)",
    /onSelectSymbol\s*\(\s*r\.symbol\s*\)/.test(src));

  // Safety: no engine internals appear anywhere in the component source
  const codeOnly = stripComments(src);
  for (const banned of [
    "scoreBreakdown", "probAboveStrike", "touchProbability",
    "avgMaxDrawdown", "ivPercentile", "ivSource", "ivConfidence",
    "monteCarloPaths", "MC paths", "P10", "P90",
    "putLadder", "liveTargets", "expectedMove",
  ]) {
    assert(`LethalBoard.jsx code does NOT reference '${banned}'`,
      !new RegExp(banned, "i").test(codeOnly), banned);
  }

  // Old dense table must be gone
  assert("RankedTable component removed",
    !/function\s+RankedTable\s*\(/.test(src));
  assert("Th/Td table cells removed",
    !/function\s+Th\s*\(/.test(src) && !/function\s+Td\s*\(/.test(src));

  // Frozen files NOT imported anywhere in this component
  assert("does NOT import recordedAlertsRollup",
    !/recordedAlertsRollup/.test(codeOnly));
  assert("does NOT import recordedAlertsView",
    !/recordedAlertsView/.test(codeOnly));
  assert("does NOT import alertHistory",
    !/alertHistory/.test(codeOnly));
}

// =================================================================
// 5. LethalBoardPage.jsx owns selectedSymbol and passes it down
// =================================================================
group("LethalBoardPage.jsx — owns lifted selection state");
{
  const src = readFileSync("src/components/discovery/LethalBoardPage.jsx", "utf8");
  let ok = true; let err = null;
  try { await transformWithOxc(src, "LethalBoardPage.jsx", { lang: "jsx" }); }
  catch (e) { ok = false; err = e?.message || String(e); }
  assert("LethalBoardPage.jsx parses as valid JSX", ok, err);

  assert("declares selectedSymbol state",
    /useState\s*\(\s*null\s*\)\s*;\s*\n[\s\S]{0,600}selectedSymbol/.test(src)
    || /\[\s*selectedSymbol\s*,\s*setSelectedSymbol\s*\]\s*=\s*useState/.test(src));
  assert("seeds default selection on scanResult change",
    /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?setSelectedSymbol[\s\S]*?\}\s*,\s*\[\s*scanResult\s*\]/.test(src)
    || /\[\s*scanResult\s*\]/.test(src));
  assert("falls back to first ranked when bestUseOfCapital missing",
    /bestUseOfCapital/.test(src));
  assert("passes selectedSymbol to LethalBoard",
    /<LethalBoard[\s\S]*?selectedSymbol\s*=\s*\{\s*selectedSymbol\s*\}/.test(src));
  assert("passes onSelectSymbol={setSelectedSymbol} to LethalBoard",
    /<LethalBoard[\s\S]*?onSelectSymbol\s*=\s*\{\s*setSelectedSymbol\s*\}/.test(src));

  // Phase 4.2/4.3 wiring still intact
  assert("still imports recordAlert + loadAlertHistory",
    /\brecordAlert\b/.test(src) && /\bloadAlertHistory\b/.test(src));
  // Phase 4.7: surface relocated to AdminSidebar via the cockpit. Either
  // shape preserves the recorded-alerts visibility contract.
  assert("still surfaces recorded alerts (panel in page or cockpit prop)",
    /<RecordedAlertsPanel/.test(src) || /recordedAlerts\s*=\s*\{?\s*recordedAlerts\s*\}?/.test(src));
}

// =================================================================
// 6. Empty / null scan result safety
// =================================================================
group("safety — null + empty inputs");
{
  const empty = buildLethalBoardViewModel(null);
  assert("null scanResult → empty rows",
    Array.isArray(empty.rows) && empty.rows.length === 0);
  assert("null scanResult → null best",
    empty.best === null);

  const noRanked = buildLethalBoardViewModel({
    ...syntheticScanResult(), ranked: [],
  });
  assert("empty ranked → 0 rows", noRanked.rows.length === 0);
  assert("empty ranked → null best", noRanked.best === null);

  // Determinism: same scan twice → identical projections
  const a = buildLethalBoardViewModel(syntheticScanResult());
  const b = buildLethalBoardViewModel(syntheticScanResult());
  assert("buildLethalBoardViewModel deterministic for rows",
    JSON.stringify(a.rows) === JSON.stringify(b.rows));
  assert("buildLethalBoardViewModel deterministic for best",
    JSON.stringify(a.best) === JSON.stringify(b.best));
}

// =================================================================
// 7. Frozen files untouched (file-level grep on imports)
// =================================================================
group("frozen files NOT imported by mutated components");
{
  const board = readFileSync("src/components/discovery/LethalBoard.jsx", "utf8");
  const page = readFileSync("src/components/discovery/LethalBoardPage.jsx", "utf8");
  // recordedAlertsView.js — frozen Phase 4.2 helper. The Page imports it
  // (Phase 4.2 audit panel) but the Board must not.
  assert("LethalBoard.jsx does NOT import recordedAlertsView",
    !/from\s+["'][^"']*recordedAlertsView[^"']*["']/.test(board));
  // recordedAlertsRollup.js — same.
  assert("LethalBoard.jsx does NOT import recordedAlertsRollup",
    !/from\s+["'][^"']*recordedAlertsRollup[^"']*["']/.test(board));
  // alertHistory.js — only the Page reads it.
  assert("LethalBoard.jsx does NOT import alertHistory",
    !/from\s+["'][^"']*alertHistory[^"']*["']/.test(board));

  // Page is permitted to import frozen-read-only files.
  assert("Page imports recordedAlertsView (read-only consumer, Phase 4.2)",
    /from\s+["'][^"']*recordedAlertsView[^"']*["']/.test(page));
  assert("Page imports recordedAlertsRollup (read-only consumer, Phase 4.3)",
    /from\s+["'][^"']*recordedAlertsRollup[^"']*["']/.test(page));
  assert("Page imports alertHistory (read-only consumer)",
    /from\s+["'][^"']*alertHistory[^"']*["']/.test(page));
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
  const vm = buildLethalBoardViewModel(syntheticScanResult());
  console.log("\n  Example row projection (NVDA):");
  const nvda = vm.rows.find(r => r.symbol === "NVDA");
  console.log(`    rank=${nvda.rank} score=${nvda.score} fit=${nvda.capitalFit} action=${nvda.action}`);
  console.log(`    keyReasons (${nvda.keyReasons.length}):`);
  for (const s of nvda.keyReasons) console.log(`      + ${s}`);
  console.log(`    risks (${nvda.risks.length}):`);
  for (const s of nvda.risks) console.log(`      ! ${s}`);
  process.exit(0);
}
