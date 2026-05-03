#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.1 tests
// Run: npm run test:discovery-phase4-1
// =====================================================
//
// Verifies controlled alert persistence:
//   - preview scans NEVER call recordAlert
//   - commit scans call recordAlert for new_best_opportunity
//   - no_change is suppressed
//   - duplicate event within dedup window is suppressed
//   - throwing recordAlertFn does not crash the flow
//   - LethalBoardPage.jsx still parses (JSX validation)
// =====================================================

import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";

import {
  createScanController,
  SCAN_MODE,
  SCAN_MODE_LABEL,
  SUPPRESSED_REASON,
  SUPPRESSED_REASON_LABEL,
} from "../src/components/discovery/lethalBoardScanController.js";

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

// --------------------------------------------------
// FIXTURE — synthetic scan result with a single best
// --------------------------------------------------

function fakeScanResult(symbol, score) {
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

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.1");
console.log("  ════════════════════════════════════════════");

// =================================================================
// 1. PREVIEW scans never call recordAlert
// =================================================================
group("preview scans never call recordAlert");
{
  const recorded = [];
  const ctl = createScanController({ recordAlertFn: (a) => recorded.push(a) });

  const samplePreview = ctl.processScan({ scanResult: fakeScanResult("NVDA", 80), mode: SCAN_MODE.PREVIEW_SAMPLE });
  assert("PREVIEW_SAMPLE: status.recorded=false",
    samplePreview.status.recorded === false);
  assert("PREVIEW_SAMPLE: status.event=null",
    samplePreview.status.event === null);
  assert("PREVIEW_SAMPLE: suppressedReason=preview_mode",
    samplePreview.status.suppressedReason === SUPPRESSED_REASON.PREVIEW_MODE);

  const livePreview = ctl.processScan({ scanResult: fakeScanResult("AMD", 82), mode: SCAN_MODE.PREVIEW_LIVE });
  assert("PREVIEW_LIVE: status.recorded=false",
    livePreview.status.recorded === false);
  assert("PREVIEW_LIVE: suppressedReason=preview_mode",
    livePreview.status.suppressedReason === SUPPRESSED_REASON.PREVIEW_MODE);

  assert("recordAlertFn never called for preview scans",
    recorded.length === 0);

  // After two previews, the wireup state remains pristine —
  // no scan was committed, so a subsequent commit emits new_best_opportunity.
  const stats = ctl.stats();
  assert("controller stats reflect 0 alerts",
    stats.totalAlerts === 0);
  assert("controller stats reflect 0 scans through wireup",
    stats.totalScans === 0);
}

// =================================================================
// 2. COMMIT scan records new_best_opportunity
// =================================================================
group("commit scan records new_best_opportunity");
{
  let clock = 1_000;
  const recorded = [];
  const ctl = createScanController({
    recordAlertFn: (a) => recorded.push(a),
    now: () => clock,
  });

  const out = ctl.processScan({
    scanResult: fakeScanResult("NVDA", 80),
    mode: SCAN_MODE.COMMIT_LIVE,
  });
  assert("COMMIT first scan: event=new_best_opportunity",
    out.status.event === SCANNER_STATE_EVENT.NEW_BEST_OPPORTUNITY);
  assert("COMMIT first scan: recorded=true",
    out.status.recorded === true);
  assert("COMMIT first scan: suppressedReason=null",
    out.status.suppressedReason === null);
  assert("recordAlertFn called once",
    recorded.length === 1);
  assert("recorded alert references the right symbol",
    recorded[0].card?.symbol === "NVDA");
  assert("recorded alert priority is high",
    recorded[0].priority === "high");
  assert("recorded alert exposes only safe top-line fields (no scoreBreakdown)",
    !("scoreBreakdown" in recorded[0].card));
}

// =================================================================
// 3. no_change is suppressed
// =================================================================
group("no_change is suppressed");
{
  let clock = 1_000;
  const recorded = [];
  const ctl = createScanController({
    recordAlertFn: (a) => recorded.push(a),
    now: () => clock,
  });

  // First commit registers NVDA
  ctl.processScan({ scanResult: fakeScanResult("NVDA", 80), mode: SCAN_MODE.COMMIT_LIVE });
  assert("first commit recorded", recorded.length === 1);

  // Second commit with same symbol + similar score → no_change
  clock += 1_000_000;   // far past dedup window so dedup itself doesn't fire
  const out = ctl.processScan({
    scanResult: fakeScanResult("NVDA", 80.2),
    mode: SCAN_MODE.COMMIT_LIVE,
  });
  assert("same-top second commit: event=no_change",
    out.status.event === SCANNER_STATE_EVENT.NO_CHANGE);
  assert("same-top second commit: recorded=false",
    out.status.recorded === false);
  assert("same-top second commit: suppressedReason=no_change",
    out.status.suppressedReason === SUPPRESSED_REASON.NO_CHANGE);
  assert("no additional alert recorded",
    recorded.length === 1);
}

// =================================================================
// 4. Duplicate event within dedup window is suppressed
// =================================================================
group("duplicate event within dedup window is deduped");
{
  let clock = 1_000;
  const recorded = [];
  const ctl = createScanController({
    recordAlertFn: (a) => recorded.push(a),
    now: () => clock,
  });

  // First commit — NVDA wins
  ctl.processScan({ scanResult: fakeScanResult("NVDA", 80), mode: SCAN_MODE.COMMIT_LIVE });
  assert("dedup test: first commit recorded", recorded.length === 1);

  // Second commit — different symbol → trade_displaced, fires through bridge
  clock += 60_000;     // 1 min later, well within bridge dedup window (15 min default)
  ctl.processScan({ scanResult: fakeScanResult("AMD", 85), mode: SCAN_MODE.COMMIT_LIVE });
  assert("dedup test: TRADE_DISPLACED recorded once",
    recorded.length === 2);

  // Third commit — back to AMD with similar score → store says no_change
  clock += 60_000;
  const noChange = ctl.processScan({ scanResult: fakeScanResult("AMD", 85.1), mode: SCAN_MODE.COMMIT_LIVE });
  assert("dedup test: same-top third commit → no_change",
    noChange.status.event === SCANNER_STATE_EVENT.NO_CHANGE
    && noChange.status.recorded === false);

  // Fourth commit — back to NVDA quickly → trade_displaced AGAIN, but the bridge
  // dedup remembers TRADE_DISPLACED for NVDA (well, the dedup key is event:symbol
  // where symbol is the new top, so this is a fresh combination).
  clock += 60_000;
  const flip = ctl.processScan({ scanResult: fakeScanResult("NVDA", 90), mode: SCAN_MODE.COMMIT_LIVE });
  assert("dedup test: flipped winner emits TRADE_DISPLACED",
    flip.status.event === SCANNER_STATE_EVENT.TRADE_DISPLACED);
  assert("dedup test: that flip was recorded (different dedup key)",
    flip.status.recorded === true);

  // Fifth commit — flip BACK to AMD again right away — now bridge has seen
  // TRADE_DISPLACED:AMD before. We are inside the bridge's 15-min dedup window
  // for that combo, so the alert is suppressed.
  clock += 60_000;
  const suppressed = ctl.processScan({ scanResult: fakeScanResult("AMD", 92), mode: SCAN_MODE.COMMIT_LIVE });
  assert("dedup test: repeated TRADE_DISPLACED:AMD inside dedup window → not recorded",
    suppressed.status.event === SCANNER_STATE_EVENT.TRADE_DISPLACED
    && suppressed.status.recorded === false);
  assert("dedup test: suppressedReason=dedup_window",
    suppressed.status.suppressedReason === SUPPRESSED_REASON.DEDUP_WINDOW);
}

// =================================================================
// 5. Throwing recordAlertFn does not crash the flow
// =================================================================
group("throwing recordAlertFn must not crash the controller");
{
  const ctl = createScanController({
    recordAlertFn: () => { throw new Error("alertHistory_disk_full"); },
  });
  let result;
  let threw = false;
  try {
    result = ctl.processScan({
      scanResult: fakeScanResult("NVDA", 80),
      mode: SCAN_MODE.COMMIT_LIVE,
    });
  } catch (e) { threw = true; failureLines.push("processScan threw: " + e.message); }
  assert("processScan does not throw", !threw);
  assert("event still surfaces (NEW_BEST)",
    result.status.event === SCANNER_STATE_EVENT.NEW_BEST_OPPORTUNITY);
  assert("status.recorded=false when recordAlert threw",
    result.status.recorded === false);
  assert("suppressedReason=record_failed",
    result.status.suppressedReason === SUPPRESSED_REASON.RECORD_FAILED);
}

// =================================================================
// 6. Edge cases
// =================================================================
group("edge cases");
{
  const ctl = createScanController({ recordAlertFn: () => {} });
  const noScan = ctl.processScan({ scanResult: null, mode: SCAN_MODE.COMMIT_LIVE });
  assert("null scanResult: recorded=false",
    noScan.status.recorded === false);
  assert("null scanResult: suppressedReason=no_scan_result",
    noScan.status.suppressedReason === SUPPRESSED_REASON.NO_SCAN_RESULT);

  // Mode label table
  assert("SCAN_MODE_LABEL covers preview_sample",
    typeof SCAN_MODE_LABEL[SCAN_MODE.PREVIEW_SAMPLE] === "string");
  assert("SCAN_MODE_LABEL covers commit_live",
    typeof SCAN_MODE_LABEL[SCAN_MODE.COMMIT_LIVE] === "string");
  assert("SUPPRESSED_REASON_LABEL covers preview_mode",
    typeof SUPPRESSED_REASON_LABEL[SUPPRESSED_REASON.PREVIEW_MODE] === "string");

  // Reset clears state
  const recorded = [];
  const c2 = createScanController({ recordAlertFn: (a) => recorded.push(a) });
  c2.processScan({ scanResult: fakeScanResult("NVDA", 80), mode: SCAN_MODE.COMMIT_LIVE });
  assert("before reset: 1 alert recorded", recorded.length === 1);
  c2.reset();
  c2.processScan({ scanResult: fakeScanResult("NVDA", 80), mode: SCAN_MODE.COMMIT_LIVE });
  assert("after reset: NEW_BEST fires again (state cleared)",
    recorded.length === 2);
}

// =================================================================
// 7. LethalBoardPage.jsx still parses + uses the controller
// =================================================================
group("LethalBoardPage.jsx wired correctly");
{
  const src = readFileSync("src/components/discovery/LethalBoardPage.jsx", "utf8");
  let ok = true; let err = null;
  try { await transformWithOxc(src, "LethalBoardPage.jsx", { lang: "jsx" }); }
  catch (e) { ok = false; err = e?.message || String(e); }
  assert("LethalBoardPage.jsx parses as valid JSX", ok, err);

  assert("LethalBoardPage imports recordAlert from alertHistory",
    /from\s+["'][^"']*alerts\/alertHistory(\.js)?["']/.test(src)
    && /import\s*\{[^}]*\brecordAlert\b[^}]*\}/.test(src));
  assert("LethalBoardPage imports createScanController",
    /createScanController/.test(src));
  assert("LethalBoardPage exposes Run & record button",
    /Run\s*&amp;\s*record|Run\s*&\s*record/.test(src));
  assert("LethalBoardPage uses COMMIT_LIVE mode",
    /COMMIT_LIVE/.test(src));
  assert("LethalBoardPage uses PREVIEW_LIVE mode",
    /PREVIEW_LIVE/.test(src));
  assert("LethalBoardPage uses PREVIEW_SAMPLE mode",
    /PREVIEW_SAMPLE/.test(src));
  // Phase 4.7: ScanStatusPanel was retired as a direct child of LethalBoardPage;
  // its functionality now lives in AdminSidebar.ScanStatusBlock, fed via the
  // `scanStatus` prop on <LethalBoardCockpit>. Accept either shape.
  assert("LethalBoardPage surfaces scan status (ScanStatusPanel or cockpit prop)",
    /ScanStatusPanel/.test(src) || /scanStatus\s*=\s*\{?\s*scanStatus\s*\}?/.test(src));
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
  // Demo: preview vs recorded status
  let clock = 1_000;
  const recorded = [];
  const ctl = createScanController({
    recordAlertFn: (a) => recorded.push(a),
    now: () => clock,
  });

  const preview = ctl.processScan({
    scanResult: fakeScanResult("NVDA", 80), mode: SCAN_MODE.PREVIEW_LIVE,
  });
  console.log("\n  Example PREVIEW status:");
  console.log("   ", JSON.stringify(preview.status, null, 2).split("\n").join("\n    "));

  const commit = ctl.processScan({
    scanResult: fakeScanResult("NVDA", 80), mode: SCAN_MODE.COMMIT_LIVE,
  });
  console.log("\n  Example RECORDED status:");
  console.log("   ", JSON.stringify(commit.status, null, 2).split("\n").join("\n    "));
  console.log(`\n  alertHistory.recordAlert called: ${recorded.length} time(s)`);
  console.log(`  Last persisted card: ${recorded[0]?.card?.symbol} · ${recorded[0]?.card?.action} · score ${recorded[0]?.card?.score}`);

  process.exit(0);
}
