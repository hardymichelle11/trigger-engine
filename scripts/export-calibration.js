#!/usr/bin/env node
// =====================================================
// Export calibration data to JSON, CSV, and quarterly report.
// Usage: npm run calibration:export
// =====================================================

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { getCalibrationStats, getQuarterlyCalibrationReport, formatCalibrationReport } from "../src/lib/calibration/calibrationTracker.js";
import { getExportData, loadObservations } from "../src/lib/calibration/calibrationStorage.js";

const OUT_DIR = "logs/calibration";

// Ensure output directory
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const obs = loadObservations();

if (obs.length === 0) {
  console.log("\n  No calibration data to export.\n  Run the scanner first to generate observations.\n");
  process.exit(0);
}

// 1. JSON export
const jsonPath = `${OUT_DIR}/calibration-log.json`;
writeFileSync(jsonPath, JSON.stringify(getExportData(), null, 2));
console.log(`  Exported ${obs.length} observations to ${jsonPath}`);

// 2. CSV export (includes regime columns when present)
const csvPath = `${OUT_DIR}/calibration-log.csv`;
const headers = "id,date,symbol,setupType,baselineScore,enhancedScore,delta,hadAtrPenalty,hadPositiveBonus,alertFired,sessionsOut,outcome,justified,notes,regime,regimeBias,regimeScore,regimeConfidence,vixState,earlyStress";
const rows = obs.map(o => {
  const rc = o.regimeContext || {};
  return `${o.id},${o.date},${o.symbol},${o.setupType},${o.baselineScore},${o.enhancedScore},${o.delta},${o.hadAtrPenalty},${o.hadPositiveBonus},${o.alertFired},${o.sessionsOut || ""},${o.outcome || ""},${o.justified || ""},${(o.notes || "").replace(/,/g, ";")},${rc.regime || ""},${rc.bias || ""},${rc.regimeScore ?? ""},${rc.confidence || ""},${rc.vixState || ""},${rc.earlyStress ?? ""}`;
});
writeFileSync(csvPath, [headers, ...rows].join("\n"));
console.log(`  Exported CSV to ${csvPath}`);

// 3. Quarterly report
const report = getQuarterlyCalibrationReport();
const reportText = formatCalibrationReport(report);
const reportPath = `${OUT_DIR}/quarterly-report.txt`;
writeFileSync(reportPath, reportText);
console.log(`  Quarterly report saved to ${reportPath}`);
console.log(reportText);
