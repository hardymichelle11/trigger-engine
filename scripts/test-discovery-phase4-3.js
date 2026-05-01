#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.3 tests
// Run: npm run test:discovery-phase4-3
// =====================================================
//
// Verifies the Recorded Alerts rollup chip:
//   - rollup is computed from the SANITIZED Phase 4.2
//     projection (not from raw alertHistory)
//   - rolling 24h / 7d windows from injected `now`
//   - newBest / displaced are total event counts
//   - empty / null / non-array inputs return zero counts
//   - timestamp = null is excluded from windows but still
//     contributes to event counts
//   - future timestamps are not counted in windows
//   - output keys are exactly {today, thisWeek, newBest, displaced}
//   - LethalBoardPage.jsx wires the chip without widening
//     the data source
// =====================================================

import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";

import {
  computeAlertsRollup,
  ROLLUP_CHIP_LABEL,
} from "../src/components/discovery/recordedAlertsRollup.js";

import {
  projectAlertHistory,
} from "../src/components/discovery/recordedAlertsView.js";

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

// Strip line + block comments so source audits don't false-flag on doc text
// that mentions banned identifiers.
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const NOW = 1_756_000_000_000;
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

// --------------------------------------------------
// FIXTURES
// --------------------------------------------------

function projectedRow({ symbol, event = "new_best_opportunity", timestamp = NOW,
                        action = "option_candidate", score = 80, displacedFrom = null }) {
  return {
    timestamp,
    timestampLabel: typeof timestamp === "number" ? new Date(timestamp).toLocaleString() : "—",
    symbol,
    action,
    score,
    priority: "high",
    summary: event === "trade_displaced_by_better_opportunity"
      ? `${symbol} displaced ${displacedFrom || "PRIOR"} as best use of capital · score ${score}`
      : `New best use of capital: ${symbol} · ${action} · score ${score}`,
    event,
    displacedFrom,
    bestUseOfCapital: true,
  };
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.3");
console.log("  ════════════════════════════════════════════");

// =================================================================
// 1. Empty / null / malformed → all zeros, never crashes
// =================================================================
group("safety — empty / null / non-array → zero counts");
{
  const empty = computeAlertsRollup([], { now: NOW });
  assert("empty array → today=0", empty.today === 0);
  assert("empty array → thisWeek=0", empty.thisWeek === 0);
  assert("empty array → newBest=0", empty.newBest === 0);
  assert("empty array → displaced=0", empty.displaced === 0);

  const nullIn = computeAlertsRollup(null, { now: NOW });
  assert("null input → all zeros", nullIn.today === 0 && nullIn.thisWeek === 0
    && nullIn.newBest === 0 && nullIn.displaced === 0);

  const undef = computeAlertsRollup(undefined, { now: NOW });
  assert("undefined input → all zeros",
    undef.today === 0 && undef.thisWeek === 0 && undef.newBest === 0 && undef.displaced === 0);

  const wrongType = computeAlertsRollup({ wat: true }, { now: NOW });
  assert("non-array input → all zeros",
    wrongType.today === 0 && wrongType.thisWeek === 0
    && wrongType.newBest === 0 && wrongType.displaced === 0);

  // Malformed entries inside an array — must not crash, must skip
  let threw = false;
  let malformed;
  try {
    malformed = computeAlertsRollup([
      null, undefined, "not_an_object", { wat: true },
      projectedRow({ symbol: "NVDA", timestamp: NOW - ONE_HOUR }),
    ], { now: NOW });
  } catch (e) { threw = true; failureLines.push("crashed: " + e.message); }
  assert("malformed entries do not throw", !threw);
  assert("malformed entries: only valid row counted",
    malformed.today === 1 && malformed.thisWeek === 1 && malformed.newBest === 1);
}

// =================================================================
// 2. Output shape — exactly four keys, nothing else
// =================================================================
group("output shape — locked to four counters");
{
  const out = computeAlertsRollup([], { now: NOW });
  const keys = Object.keys(out).sort();
  assert("output has exactly 4 keys",
    keys.length === 4);
  assert("output keys = today, thisWeek, newBest, displaced",
    JSON.stringify(keys) === JSON.stringify(["displaced", "newBest", "thisWeek", "today"]));
  // No leakage of analytics fields
  for (const banned of ["averages", "rates", "streak", "topSymbol", "scoreBreakdown",
                        "weights", "probability", "ivPercentile", "ivSource", "debug"]) {
    assert(`output does NOT include '${banned}'`, !(banned in out));
  }
}

// =================================================================
// 3. Rolling 24h "today" window
// =================================================================
group("today — rolling 24h from injected now");
{
  const rows = [
    projectedRow({ symbol: "A", timestamp: NOW - 1 * ONE_HOUR }),         // inside 24h
    projectedRow({ symbol: "B", timestamp: NOW - 23 * ONE_HOUR }),        // inside 24h (just)
    projectedRow({ symbol: "C", timestamp: NOW - ONE_DAY }),              // exactly 24h ago — at boundary, included
    projectedRow({ symbol: "D", timestamp: NOW - ONE_DAY - 1 }),          // just outside 24h
    projectedRow({ symbol: "E", timestamp: NOW - 6 * ONE_DAY }),          // outside 24h, inside 7d
    projectedRow({ symbol: "F", timestamp: NOW - 8 * ONE_DAY }),          // outside both
  ];
  const r = computeAlertsRollup(rows, { now: NOW });
  // Inside 24h: A, B, C  (D is 1ms past the boundary)
  // Inside 7d:  A, B, C, D, E  (F is 8d ago)
  assert("today counts entries within (now − 24h, now]",
    r.today === 3, `got ${r.today}`);
  assert("thisWeek counts entries within (now − 7d, now]",
    r.thisWeek === 5, `got ${r.thisWeek}`);
}

// =================================================================
// 4. Rolling 7d "this week" window
// =================================================================
group("thisWeek — rolling 7 days from injected now");
{
  const rows = [
    projectedRow({ symbol: "A", timestamp: NOW - 1 * ONE_DAY }),
    projectedRow({ symbol: "B", timestamp: NOW - 5 * ONE_DAY }),
    projectedRow({ symbol: "C", timestamp: NOW - 7 * ONE_DAY }),          // exactly 7d ago — included
    projectedRow({ symbol: "D", timestamp: NOW - 7 * ONE_DAY - 1 }),      // just outside
    projectedRow({ symbol: "E", timestamp: NOW - 30 * ONE_DAY }),
  ];
  const r = computeAlertsRollup(rows, { now: NOW });
  assert("thisWeek inclusive at exact 7d boundary",
    r.thisWeek === 3, `got ${r.thisWeek}`);
  assert("today excludes anything older than 24h",
    r.today === 1, `got ${r.today}`);
}

// =================================================================
// 5. Future timestamps are NOT counted in time windows
// =================================================================
group("future timestamps excluded from windows");
{
  const rows = [
    projectedRow({ symbol: "FUT", timestamp: NOW + ONE_HOUR }),           // future
    projectedRow({ symbol: "OK",  timestamp: NOW - ONE_HOUR }),
  ];
  const r = computeAlertsRollup(rows, { now: NOW });
  assert("future timestamp not counted in today",
    r.today === 1, `got ${r.today}`);
  assert("future timestamp not counted in thisWeek",
    r.thisWeek === 1, `got ${r.thisWeek}`);
  // But it still contributes to event count
  assert("future timestamp still counted in event total",
    r.newBest === 2, `got ${r.newBest}`);
}

// =================================================================
// 6. timestamp=null excluded from windows, still counts events
// =================================================================
group("timestamp=null — excluded from windows, still counted by event");
{
  // Spread-overwrite to defeat the projectedRow() default-param trap:
  // passing `timestamp: undefined` would otherwise resolve to NOW.
  const rows = [
    { ...projectedRow({ symbol: "A" }), timestamp: null },
    { ...projectedRow({ symbol: "B" }), timestamp: undefined },
    { ...projectedRow({ symbol: "C" }), timestamp: "not-a-number" },
    projectedRow({ symbol: "D", timestamp: NOW - ONE_HOUR }),
  ];
  const r = computeAlertsRollup(rows, { now: NOW });
  assert("today only counts row with valid timestamp",
    r.today === 1, `got ${r.today}`);
  assert("thisWeek only counts row with valid timestamp",
    r.thisWeek === 1, `got ${r.thisWeek}`);
  assert("event count includes ALL rows regardless of timestamp validity",
    r.newBest === 4, `got ${r.newBest}`);
  assert("displaced=0 when no displacement events",
    r.displaced === 0);
}

// =================================================================
// 7. newBest / displaced counts (totals, not time-windowed)
// =================================================================
group("event counts — totals across projection rows");
{
  const rows = [
    projectedRow({ symbol: "NVDA", event: "new_best_opportunity", timestamp: NOW - ONE_HOUR }),
    projectedRow({ symbol: "AMD",  event: "trade_displaced_by_better_opportunity",
                   timestamp: NOW - 2 * ONE_HOUR, displacedFrom: "NVDA" }),
    projectedRow({ symbol: "CRWV", event: "new_best_opportunity",
                   timestamp: NOW - 10 * ONE_DAY }),                      // OLD — outside both windows
    projectedRow({ symbol: "BE",   event: "trade_displaced_by_better_opportunity",
                   timestamp: NOW - 9 * ONE_DAY, displacedFrom: "CRWV" }),// OLD
    projectedRow({ symbol: "QQQ",  event: null,                            // unrecognized
                   timestamp: NOW - 1 * ONE_HOUR }),
  ];
  const r = computeAlertsRollup(rows, { now: NOW });
  assert("newBest totals across all rows (incl. older entries)",
    r.newBest === 2, `got ${r.newBest}`);
  assert("displaced totals across all rows (incl. older entries)",
    r.displaced === 2, `got ${r.displaced}`);
  assert("event=null does not contribute to either event count",
    r.newBest + r.displaced === 4);
  assert("today = recent rows in the 24h window",
    r.today === 3, `got ${r.today}`);
  assert("thisWeek = recent rows in the 7d window",
    r.thisWeek === 3, `got ${r.thisWeek}`);
}

// =================================================================
// 8. Determinism — pure function
// =================================================================
group("determinism — pure function");
{
  const rows = [
    projectedRow({ symbol: "NVDA", timestamp: NOW - ONE_HOUR }),
    projectedRow({ symbol: "AMD",  event: "trade_displaced_by_better_opportunity",
                   timestamp: NOW - 2 * ONE_DAY, displacedFrom: "NVDA" }),
  ];
  const a = computeAlertsRollup(rows, { now: NOW });
  const b = computeAlertsRollup(rows, { now: NOW });
  assert("identical input + same now → identical output",
    JSON.stringify(a) === JSON.stringify(b));

  // Counter values are non-negative integers
  for (const key of ["today", "thisWeek", "newBest", "displaced"]) {
    assert(`${key} is a non-negative integer`,
      Number.isInteger(a[key]) && a[key] >= 0);
  }
}

// =================================================================
// 9. Integration with Phase 4.2 projection — chain works end-to-end
// =================================================================
group("integration — projectAlertHistory output flows into rollup");
{
  // Simulate persisted alertHistory rows (the shape recordAlert writes)
  const persisted = [
    {
      symbol: "AMD", action: "option_candidate", score: 84, priority: "high",
      summary: "AMD displaced NVDA as best use of capital · score 84 (was 80)",
      timestamp: NOW - 60_000,
      probability: null, touchProb: null, ivPercentile: null, ivSource: null,
      passedGates: 1, dateStr: "x",
    },
    {
      symbol: "NVDA", action: "option_candidate", score: 80, priority: "high",
      summary: "New best use of capital: NVDA · option_candidate · score 80 · fit good",
      timestamp: NOW - 6 * ONE_DAY,
      probability: null, touchProb: null, ivPercentile: null, ivSource: null,
      passedGates: 1, dateStr: "x",
    },
  ];
  const projection = projectAlertHistory(persisted);
  const rollup = computeAlertsRollup(projection, { now: NOW });

  assert("integration: today counts AMD only",
    rollup.today === 1);
  assert("integration: thisWeek counts both",
    rollup.thisWeek === 2);
  assert("integration: newBest=1 (NVDA)",
    rollup.newBest === 1);
  assert("integration: displaced=1 (AMD)",
    rollup.displaced === 1);
}

// =================================================================
// 10. Phase 4.2 regression — projection still drops internals.
//     If hostile internals were on the persisted row, they MUST NOT
//     appear on the projected rows that feed the rollup.
// =================================================================
group("regression — projection still strips internals when row is hostile");
{
  const hostile = [{
    symbol: "NVDA", action: "option_candidate", score: 80, priority: "high",
    summary: "New best use of capital: NVDA · option_candidate · score 80",
    timestamp: NOW - ONE_HOUR,
    probability: 0.71, touchProb: 0.20, ivPercentile: 65, ivSource: "polygon",
    passedGates: 1, dateStr: "x",
    // hostile fields the rollup must never see:
    scoreBreakdown: { capitalFitScore: 25 }, weights: { x: 1 }, debug: "secret",
  }];
  const projection = projectAlertHistory(hostile);
  for (const banned of ["scoreBreakdown", "weights", "debug",
                        "probability", "ivPercentile", "ivSource"]) {
    assert(`projection drops '${banned}' before reaching the rollup`,
      !(banned in projection[0]));
  }
  // The rollup itself takes the projection — no second source of truth.
  const rollup = computeAlertsRollup(projection, { now: NOW });
  for (const banned of ["scoreBreakdown", "weights", "debug",
                        "probability", "ivPercentile", "ivSource"]) {
    assert(`rollup output does NOT include '${banned}'`,
      !(banned in rollup));
  }
}

// =================================================================
// 11. Helper does NOT import loadAlertHistory or alertHistory
// =================================================================
group("source code audit — helper does not widen data source");
{
  const rawSrc = readFileSync("src/components/discovery/recordedAlertsRollup.js", "utf8");
  const codeOnly = stripComments(rawSrc);
  assert("rollup helper does NOT import loadAlertHistory (code, ignoring comments)",
    !/loadAlertHistory/.test(codeOnly));
  assert("rollup helper does NOT reference alertHistory (code, ignoring comments)",
    !/alertHistory/.test(codeOnly));
  assert("rollup helper does NOT reference localStorage",
    !/localStorage/.test(codeOnly));
  assert("rollup helper exports computeAlertsRollup",
    /export\s+function\s+computeAlertsRollup/.test(rawSrc));
  assert("rollup helper exports ROLLUP_CHIP_LABEL",
    /export\s+const\s+ROLLUP_CHIP_LABEL/.test(rawSrc));
}

// =================================================================
// 12. LethalBoardPage.jsx wires the chip without widening the source
// =================================================================
group("LethalBoardPage.jsx — chip wired correctly");
{
  const src = readFileSync("src/components/discovery/LethalBoardPage.jsx", "utf8");
  let ok = true; let err = null;
  try { await transformWithOxc(src, "LethalBoardPage.jsx", { lang: "jsx" }); }
  catch (e) { ok = false; err = e?.message || String(e); }
  assert("LethalBoardPage.jsx parses as valid JSX", ok, err);

  assert("imports computeAlertsRollup",
    /computeAlertsRollup/.test(src));
  assert("imports ROLLUP_CHIP_LABEL",
    /ROLLUP_CHIP_LABEL/.test(src));
  assert("renders RecordedAlertsRollupChip",
    /<RecordedAlertsRollupChip/.test(src));
  // Chip computed from the panel's existing `alerts` prop / `safe` array,
  // not from a new fetch:
  assert("chip computed from existing in-memory rows (no extra fetch added in chip path)",
    /computeAlertsRollup\(safe\)/.test(src));
  // Phase 4.2 protections still hold:
  assert("does not render scoreBreakdown anywhere",
    !/scoreBreakdown/.test(src));
  // Make sure we didn't accidentally double-load or re-fetch in the chip:
  // the only loadAlertHistory references in CODE (not comments) should be
  // the existing Phase 4.2 import + one helper call.
  const codeOnly = stripComments(src);
  const loadHits = (codeOnly.match(/loadAlertHistory/g) || []).length;
  assert("loadAlertHistory referenced exactly twice in code (import + Phase 4.2 helper call)",
    loadHits === 2, `got ${loadHits}`);
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
  const demo = [
    projectedRow({ symbol: "AMD", event: "trade_displaced_by_better_opportunity",
                   timestamp: NOW - ONE_HOUR, displacedFrom: "NVDA" }),
    projectedRow({ symbol: "NVDA", timestamp: NOW - 6 * ONE_DAY }),
    projectedRow({ symbol: "CRWV", event: "trade_displaced_by_better_opportunity",
                   timestamp: NOW - 10 * ONE_DAY, displacedFrom: "AMD" }),
  ];
  const r = computeAlertsRollup(demo, { now: NOW });
  console.log("\n  Example chip values:");
  console.log(`    ${ROLLUP_CHIP_LABEL.today}: ${r.today}`);
  console.log(`    ${ROLLUP_CHIP_LABEL.thisWeek}: ${r.thisWeek}`);
  console.log(`    ${ROLLUP_CHIP_LABEL.newBest}: ${r.newBest}`);
  console.log(`    ${ROLLUP_CHIP_LABEL.displaced}: ${r.displaced}`);
  process.exit(0);
}
