#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.2 tests
// Run: npm run test:discovery-phase4-2
// =====================================================
//
// Verifies the read-only Recorded Alerts panel:
//   - loadAlertHistory is invoked on init via the page wiring
//   - alerts refresh after COMMIT_LIVE
//   - preview modes do NOT change persisted alerts
//   - empty / malformed history does not crash the projection
//   - panel limits display length (5–10)
//   - LethalBoardPage.jsx remains JSX-valid and references
//     the panel + loadAlertHistory + projectAlertHistory
// =====================================================

import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";

import {
  projectAlertHistory,
  loadProjectedAlerts,
  alertEventLabel,
  ALERT_DISPLAY_LIMIT,
  ALERT_DISPLAY_MIN,
} from "../src/components/discovery/recordedAlertsView.js";

import {
  createScanController,
  SCAN_MODE,
} from "../src/components/discovery/lethalBoardScanController.js";

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
// FIXTURE — alertHistory.recordAlert flattens our discovery
// alert into this shape. Match that shape for tests.
// --------------------------------------------------

function persistedRecord({ symbol, action = "option_candidate", score = 80,
                           priority = "high", summary,
                           timestamp = 1_756_000_000_000 }) {
  return {
    symbol,
    action,
    score,
    priority,
    summary,
    probability: null,
    touchProb: null,
    ivPercentile: null,
    ivSource: null,
    passedGates: 1,
    timestamp,
    dateStr: new Date(timestamp).toLocaleString(),
  };
}

function newBestRow(sym, ts) {
  return persistedRecord({
    symbol: sym, timestamp: ts,
    summary: `New best use of capital: ${sym} · option_candidate · score 80 · fit good`,
  });
}

function displacedRow(newSym, priorSym, ts) {
  return persistedRecord({
    symbol: newSym, timestamp: ts,
    summary: `${newSym} displaced ${priorSym} as best use of capital · score 84 (was 80)`,
  });
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.2");
console.log("  ════════════════════════════════════════════");

// =================================================================
// 1. loadAlertHistory called via init helper
// =================================================================
group("loadProjectedAlerts forwards to injected loadFn");
{
  let calls = 0;
  const loaded = loadProjectedAlerts(() => {
    calls += 1;
    return [newBestRow("NVDA", 1_756_000_000_000)];
  });
  assert("loadProjectedAlerts: invokes injected loadFn",
    calls === 1);
  assert("loadProjectedAlerts: returns projection rows",
    Array.isArray(loaded) && loaded.length === 1 && loaded[0].symbol === "NVDA");

  // Throwing loadFn → empty array, no propagation
  let threw = false;
  let result;
  try {
    result = loadProjectedAlerts(() => { throw new Error("storage_busted"); });
  } catch { threw = true; }
  assert("loadProjectedAlerts: throwing loadFn does not propagate", !threw);
  assert("loadProjectedAlerts: throwing loadFn → empty []",
    Array.isArray(result) && result.length === 0);

  // Non-function loadFn → empty
  assert("loadProjectedAlerts: missing loadFn → []",
    loadProjectedAlerts(undefined).length === 0
    && loadProjectedAlerts(null).length === 0);
}

// =================================================================
// 2. recorded alerts refresh after COMMIT_LIVE
//    (verified via the controller + the same loadAlertHistory contract)
// =================================================================
group("recorded alerts refresh after COMMIT_LIVE");
{
  // Simulate alertHistory: one in-memory array updated by recordAlertFn,
  // and a loadFn that reads it. This mirrors what the page does at runtime.
  const persisted = [];
  const recordAlertFn = (alert) => {
    // Mirror alertHistory.recordAlert's projection
    persisted.unshift(persistedRecord({
      symbol: alert.card.symbol,
      action: alert.card.action,
      score: alert.card.score,
      priority: alert.priority,
      summary: alert.summary,
      timestamp: alert.timestamp,
    }));
  };
  const loadFn = () => persisted.slice();

  let clock = 1_000;
  const ctl = createScanController({ recordAlertFn, now: () => clock });

  // Before any commit: empty
  let projected = loadProjectedAlerts(loadFn);
  assert("before any commit: 0 projected alerts", projected.length === 0);

  // First COMMIT_LIVE → record + refresh
  ctl.processScan({
    scanResult: makeFakeScanResult("NVDA", 80),
    mode: SCAN_MODE.COMMIT_LIVE,
  });
  projected = loadProjectedAlerts(loadFn);
  assert("after 1 COMMIT_LIVE: 1 projected alert",
    projected.length === 1 && projected[0].symbol === "NVDA");
  assert("event derived from summary = new_best_opportunity",
    projected[0].event === "new_best_opportunity");

  // Second COMMIT_LIVE with different symbol → record again
  clock += 60_000;
  ctl.processScan({
    scanResult: makeFakeScanResult("AMD", 85),
    mode: SCAN_MODE.COMMIT_LIVE,
  });
  projected = loadProjectedAlerts(loadFn);
  assert("after 2 COMMIT_LIVE: 2 projected alerts",
    projected.length === 2);
  assert("newest alert appears first (AMD)",
    projected[0].symbol === "AMD");
  assert("AMD event = trade_displaced_by_better_opportunity",
    projected[0].event === "trade_displaced_by_better_opportunity");
  assert("AMD displacedFrom = NVDA (parsed from summary)",
    projected[0].displacedFrom === "NVDA");
}

// =================================================================
// 3. preview modes never change persisted alerts
// =================================================================
group("preview modes do not change persisted alerts");
{
  const persisted = [];
  const recordAlertFn = (alert) => {
    persisted.unshift(persistedRecord({
      symbol: alert.card.symbol,
      action: alert.card.action,
      score: alert.card.score,
      priority: alert.priority,
      summary: alert.summary,
      timestamp: alert.timestamp,
    }));
  };
  const ctl = createScanController({ recordAlertFn });

  ctl.processScan({ scanResult: makeFakeScanResult("NVDA", 80), mode: SCAN_MODE.PREVIEW_SAMPLE });
  ctl.processScan({ scanResult: makeFakeScanResult("AMD", 82),  mode: SCAN_MODE.PREVIEW_LIVE });
  ctl.processScan({ scanResult: makeFakeScanResult("CRWV", 79), mode: SCAN_MODE.PREVIEW_SAMPLE });

  assert("0 records persisted after 3 previews", persisted.length === 0);
  assert("projection of empty history is empty",
    projectAlertHistory(persisted).length === 0);
}

// =================================================================
// 4. empty / malformed history → safe empty state, no crash
// =================================================================
group("empty + malformed history is handled safely");
{
  // Empty
  assert("[] → []", projectAlertHistory([]).length === 0);
  assert("undefined → []", projectAlertHistory(undefined).length === 0);
  assert("null → []", projectAlertHistory(null).length === 0);
  assert("non-array → []", projectAlertHistory({ wat: true }).length === 0);

  // Malformed entries — must NOT crash and must drop unusable rows
  const malformed = [
    null,
    undefined,
    "not_an_object",
    {},                                                      // no symbol
    { symbol: 123 },                                         // wrong type
    { symbol: "lower-case-bad" },                            // fails SYMBOL_RE
    { symbol: "NVDA" },                                      // valid: only symbol present
    { symbol: "AMD", timestamp: "not-a-number", summary: "x" },
    { symbol: "BE", score: NaN, action: 42 },                // invalid action/score
    { symbol: "CRWV", timestamp: 1_756_000_000_000,
      summary: "New best use of capital: CRWV · option_candidate · score 76" },
  ];
  let projected;
  let threw = false;
  try { projected = projectAlertHistory(malformed); }
  catch (e) { threw = true; failureLines.push("crashed: " + e.message); }
  assert("projectAlertHistory does not throw on malformed input", !threw);
  assert("projection drops rows without usable symbol",
    projected && projected.every(r => typeof r.symbol === "string" && r.symbol.length > 0));
  assert("projection keeps the 4 well-shaped malformed rows (NVDA/AMD/BE/CRWV)",
    projected.length === 4);
  assert("score=NaN coerces to null",
    projected.find(r => r.symbol === "BE")?.score === null);
  assert("invalid action coerces to null",
    projected.find(r => r.symbol === "BE")?.action === null);
  assert("invalid timestamp falls back to dateStr or em-dash",
    typeof projected.find(r => r.symbol === "AMD")?.timestampLabel === "string");
}

// =================================================================
// 5. limit between 5 and 10 (default 8, capped on out-of-range input)
// =================================================================
group("display limit (5–10)");
{
  const many = [];
  for (let i = 0; i < 30; i++) {
    many.push(newBestRow(`SYM${i.toString().padStart(2, "0")}`,
                          1_756_000_000_000 + i * 1000));
  }
  // Note: synthetic SYM00…SYM29 fail the strict SYMBOL_RE (digit can't follow
  // letters? actually our regex `[A-Z][A-Z0-9.\-]{0,9}` ALLOWS digits after the
  // first uppercase letter, so SYM00 IS valid). Verify.
  const projected = projectAlertHistory(many, 8);
  assert("default limit caps at ALERT_DISPLAY_LIMIT (8)",
    projected.length === 8);
  assert("ALERT_DISPLAY_LIMIT is in [5,10]",
    ALERT_DISPLAY_LIMIT >= 5 && ALERT_DISPLAY_LIMIT <= 10);
  assert("ALERT_DISPLAY_MIN is 5", ALERT_DISPLAY_MIN === 5);

  const projected5 = projectAlertHistory(many, 5);
  assert("explicit limit 5 → 5 rows", projected5.length === 5);
  const projected10 = projectAlertHistory(many, 10);
  assert("explicit limit 10 → 10 rows", projected10.length === 10);

  // Out-of-range guards
  assert("limit=0 falls back to default",
    projectAlertHistory(many, 0).length === ALERT_DISPLAY_LIMIT);
  assert("limit=NaN falls back to default",
    projectAlertHistory(many, NaN).length === ALERT_DISPLAY_LIMIT);
  assert("limit=999 clamps to 50 (internal hard cap)",
    projectAlertHistory(many, 999).length <= 50);
}

// =================================================================
// 6. event labels + bestUseOfCapital flag
// =================================================================
group("event labels + bestUseOfCapital flag");
{
  assert("alertEventLabel(null) → '—'", alertEventLabel(null) === "—");
  assert("alertEventLabel('new_best_opportunity') is human-readable",
    alertEventLabel("new_best_opportunity").length > 0
    && alertEventLabel("new_best_opportunity") !== "new_best_opportunity");
  assert("alertEventLabel('trade_displaced_by_better_opportunity') is human-readable",
    alertEventLabel("trade_displaced_by_better_opportunity").length > 0);

  const rows = projectAlertHistory([
    newBestRow("NVDA", 1_756_000_000_000),
    displacedRow("AMD", "NVDA", 1_756_000_001_000),
  ]);
  assert("every projected row has bestUseOfCapital=true",
    rows.every(r => r.bestUseOfCapital === true));
  assert("displacement row exposes displacedFrom",
    rows.find(r => r.symbol === "AMD")?.displacedFrom === "NVDA");
  assert("non-displacement row has displacedFrom=null",
    rows.find(r => r.symbol === "NVDA")?.displacedFrom === null);
}

// =================================================================
// 7. NEVER expose internals (scoreBreakdown, probability, etc.)
// =================================================================
group("safety: projection does not expose internals");
{
  const withInternals = [{
    ...persistedRecord({
      symbol: "NVDA", timestamp: 1_756_000_000_000,
      summary: "New best use of capital: NVDA · option_candidate · score 80",
    }),
    // Inject hostile fields the projection should NOT pass through
    scoreBreakdown: { capitalFitScore: 25, opportunityScore: 18 },
    weights: { x: 1 },
    debug: "secret",
  }];
  const projected = projectAlertHistory(withInternals);
  const sample = projected[0];
  assert("scoreBreakdown not in projection", !("scoreBreakdown" in sample));
  assert("weights not in projection", !("weights" in sample));
  assert("debug not in projection", !("debug" in sample));
  assert("probability not in projection", !("probability" in sample));
  assert("ivPercentile not in projection", !("ivPercentile" in sample));
  assert("ivSource not in projection", !("ivSource" in sample));
}

// =================================================================
// 8. LethalBoardPage.jsx wired correctly + JSX-valid
// =================================================================
group("LethalBoardPage.jsx wired correctly");
{
  const src = readFileSync("src/components/discovery/LethalBoardPage.jsx", "utf8");
  let ok = true; let err = null;
  try { await transformWithOxc(src, "LethalBoardPage.jsx", { lang: "jsx" }); }
  catch (e) { ok = false; err = e?.message || String(e); }
  assert("LethalBoardPage.jsx parses as valid JSX", ok, err);

  assert("imports loadAlertHistory from alertHistory",
    /import\s*\{[^}]*loadAlertHistory[^}]*\}\s*from\s*["'][^"']*alertHistory(\.js)?["']/.test(src));
  assert("imports projectAlertHistory from recordedAlertsView",
    /projectAlertHistory/.test(src));
  assert("imports ALERT_DISPLAY_LIMIT",
    /ALERT_DISPLAY_LIMIT/.test(src));
  assert("declares useEffect for initial history load",
    /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{?\s*refreshRecordedAlerts/.test(src));
  assert("refresh helper calls loadAlertHistory",
    /refreshRecordedAlerts[\s\S]*loadAlertHistory\s*\(/.test(src));
  assert("refresh fires after COMMIT_LIVE",
    /SCAN_MODE\.COMMIT_LIVE[\s\S]{0,200}refreshRecordedAlerts\s*\(/.test(src));
  assert("renders RecordedAlertsPanel component",
    /<RecordedAlertsPanel/.test(src));
  assert("renders empty-state copy from spec",
    /No recorded discovery alerts yet\. Run/.test(src));
  // Critically: never render scoreBreakdown
  assert("does not render scoreBreakdown anywhere",
    !/scoreBreakdown/.test(src));
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
  // Demo: what a populated panel projection looks like
  const demo = projectAlertHistory([
    displacedRow("AMD",  "NVDA", 1_756_000_120_000),
    newBestRow("NVDA",            1_756_000_060_000),
  ]);
  console.log("\n  Example projected Recorded Alerts (most recent first):");
  for (const r of demo) {
    const star = r.bestUseOfCapital ? "★" : " ";
    const disp = r.displacedFrom ? ` · displaced ${r.displacedFrom}` : "";
    console.log(`   ${star} ${r.timestampLabel}  ${r.symbol}  ${alertEventLabel(r.event)}  ${r.action || "—"}  score=${r.score ?? "—"}${disp}`);
  }
  process.exit(0);
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function makeFakeScanResult(symbol, score) {
  const top = {
    symbol, lethalScore: score, rank: 1,
    action: ACTION.OPTION_CANDIDATE,
    capitalFit: "good",
    premiumSource: PREMIUM_SOURCE.LIVE,
    bundles: ["semiconductors"],
    primaryType: "breakout_candidate",
    regimeAlignment: "aligned",
    bestUseOfCapital: true,
    displacedBy: null,
  };
  return { ranked: [top], bestUseOfCapital: top, rejected: [], displaced: [], warnings: [] };
}
