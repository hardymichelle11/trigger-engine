#!/usr/bin/env node
// =====================================================
// Tests for calibration tracker + storage.
// Run: npm run test:calibration
// =====================================================

import { recordCalibrationSnapshot, getCalibrationStats, getQuarterlyCalibrationReport, formatCalibrationReport, recordOutcomeUpdate } from "../src/lib/calibration/calibrationTracker.js";
import { loadObservations, clearCalibrationData, appendObservations, updateObservation, getExportData } from "../src/lib/calibration/calibrationStorage.js";

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    failed++;
  }
}

console.log("\n  Calibration Tests");
console.log("  ─────────────────\n");

// Clean state
clearCalibrationData();

// 1. Empty state
assert("Empty: loadObservations returns []", loadObservations().length === 0);
const emptyStats = getCalibrationStats();
assert("Empty: stats.total = 0", emptyStats.total === 0);
assert("Empty: stats.pctAtrPenalty = 0", emptyStats.pctAtrPenalty === 0);

// 2. Record observations from mock cards
const mockCards = [
  {
    symbol: "NVDA", category: "HIGH_IV", score: 85, baselineScore: 90,
    scoreTrace: [
      { pts: 20, reason: "Regime: RISK_ON", source: "scoring" },
      { pts: -5, reason: "ATR context: near plus 1 atr", source: "chart_context" },
    ],
  },
  {
    symbol: "TSLA", category: "HIGH_IV", score: 75, baselineScore: 70,
    scoreTrace: [
      { pts: 5, reason: "Resistance: clear air to T1", source: "chart_context" },
    ],
  },
  {
    symbol: "ARCC", category: "CREDIT", score: 60, baselineScore: 60,
    scoreTrace: [],
  },
];

recordCalibrationSnapshot(mockCards, { scanTime: Date.now() - 1000 });

const obs = loadObservations();
assert("Record: 3 observations stored", obs.length === 3);

// 3. Observation shape
const nvdaObs = obs.find(o => o.symbol === "NVDA");
assert("NVDA: has id", typeof nvdaObs.id === "string");
assert("NVDA: has date", typeof nvdaObs.date === "string");
assert("NVDA: baselineScore = 90", nvdaObs.baselineScore === 90);
assert("NVDA: enhancedScore = 85", nvdaObs.enhancedScore === 85);
assert("NVDA: delta = -5", nvdaObs.delta === -5);
assert("NVDA: hadAtrPenalty = true", nvdaObs.hadAtrPenalty === true);
assert("NVDA: hadPositiveBonus = false", nvdaObs.hadPositiveBonus === false);
assert("NVDA: alertFired = false", nvdaObs.alertFired === false);
assert("NVDA: outcome = null", nvdaObs.outcome === null);
assert("NVDA: chartAdjustments length = 1", nvdaObs.chartAdjustments.length === 1);

const tslaObs = obs.find(o => o.symbol === "TSLA");
assert("TSLA: hadAtrPenalty = false", tslaObs.hadAtrPenalty === false);
assert("TSLA: hadPositiveBonus = true", tslaObs.hadPositiveBonus === true);
assert("TSLA: delta = 5", tslaObs.delta === 5);

const arccObs = obs.find(o => o.symbol === "ARCC");
assert("ARCC: delta = 0 (no chart context)", arccObs.delta === 0);

// 4. Stats
const stats = getCalibrationStats();
assert("Stats: total = 3", stats.total === 3);
assert("Stats: atrPenaltyCount = 1", stats.atrPenaltyCount === 1);
assert("Stats: positiveBonusCount = 1", stats.positiveBonusCount === 1);
assert("Stats: pctAtrPenalty ~0.33", stats.pctAtrPenalty >= 0.3 && stats.pctAtrPenalty <= 0.34);
assert("Stats: pctPositiveBonus ~0.33", stats.pctPositiveBonus >= 0.3 && stats.pctPositiveBonus <= 0.34);
assert("Stats: avgDelta is number", typeof stats.avgDelta === "number");
assert("Stats: has topPenalties", Array.isArray(stats.topPenalties));
assert("Stats: has topBonuses", Array.isArray(stats.topBonuses));

// 5. Dedup — same cards within 5 min should not duplicate
recordCalibrationSnapshot(mockCards, { scanTime: Date.now() });
const afterDedup = loadObservations();
assert("Dedup: still 3 observations (not 6)", afterDedup.length === 3);

// 6. Outcome update
const updated = updateObservation(nvdaObs.id, {
  sessionsOut: 3,
  outcome: "HIT_T1",
  justified: "YES",
  notes: "Clean move to target",
});
assert("Outcome update: returns true", updated === true);

const updatedObs = loadObservations().find(o => o.id === nvdaObs.id);
assert("Outcome: sessionsOut = 3", updatedObs.sessionsOut === 3);
assert("Outcome: outcome = HIT_T1", updatedObs.outcome === "HIT_T1");
assert("Outcome: justified = YES", updatedObs.justified === "YES");
assert("Outcome: notes set", updatedObs.notes === "Clean move to target");

// 7. Update non-existent
const badUpdate = updateObservation("nonexistent_id", { outcome: "FAILED" });
assert("Bad update: returns false", badUpdate === false);

// 8. Stats after outcome
const statsAfter = getCalibrationStats();
assert("Stats after outcome: reviewed = 1", statsAfter.reviewed === 1);
assert("Stats after outcome: outcomeBreakdown has HIT_T1", statsAfter.outcomeBreakdown.HIT_T1 === 1);
assert("Stats after outcome: justifiedBreakdown has YES", statsAfter.justifiedBreakdown.YES === 1);

// 9. Quarterly report
const report = getQuarterlyCalibrationReport();
assert("Report: has recommendation", typeof report.recommendation === "string");
assert("Report: has generatedAt", typeof report.generatedAt === "string");
assert("Report: has dateRange", typeof report.dateRange === "object");

// 10. Format report
const formatted = formatCalibrationReport(report);
assert("Formatted report: is string", typeof formatted === "string");
assert("Formatted report: contains observation count", formatted.includes("3"));

// 11. Export data shape
const exported = getExportData();
assert("Export: has version", exported.version === 1);
assert("Export: has exportedAt", typeof exported.exportedAt === "string");
assert("Export: has observations array", Array.isArray(exported.observations));
assert("Export: observations count matches", exported.observations.length === 3);

// 12. Clear data
clearCalibrationData();
assert("After clear: empty", loadObservations().length === 0);

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
