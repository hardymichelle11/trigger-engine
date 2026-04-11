#!/usr/bin/env node
// =====================================================
// Update calibration observation outcomes (manual review).
// Usage:
//   npm run calibration:update -- --id OBS_ID --outcome HIT_T1 --justified YES --sessions 3
//   npm run calibration:update -- --list           (show recent unreviewed)
//   npm run calibration:update -- --symbol NVDA    (show observations for symbol)
// =====================================================

import { loadObservations, updateObservation } from "../src/lib/calibration/calibrationStorage.js";
import { getNeedsReview } from "../src/lib/calibration/calibrationTracker.js";

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const VALID_OUTCOMES = ["IMPROVED", "NEUTRAL", "WORSE", "HIT_T1", "FAILED", "UNKNOWN"];
const VALID_JUSTIFIED = ["YES", "NO", "MIXED"];

if (args.includes("--list")) {
  const obs = loadObservations();
  const unreviewed = obs.filter(o => o.outcome === null).slice(-20);

  if (unreviewed.length === 0) {
    console.log("\n  No unreviewed observations.\n");
    process.exit(0);
  }

  console.log(`\n  Unreviewed observations (${unreviewed.length} of ${obs.length} total):\n`);
  console.log(`  ${"ID".padEnd(40)} ${"Date".padEnd(12)} ${"Symbol".padEnd(8)} ${"Base".padEnd(6)} ${"Enh".padEnd(6)} ${"Delta".padEnd(6)} ${"ATR?".padEnd(5)} ${"Alert".padEnd(6)}`);
  console.log(`  ${"─".repeat(90)}`);

  for (const o of unreviewed) {
    const shortId = o.id.slice(0, 38);
    console.log(`  ${shortId.padEnd(40)} ${o.date.padEnd(12)} ${o.symbol.padEnd(8)} ${String(o.baselineScore).padEnd(6)} ${String(o.enhancedScore).padEnd(6)} ${String(o.delta).padEnd(6)} ${(o.hadAtrPenalty ? "yes" : "no").padEnd(5)} ${(o.alertFired ? "YES" : "no").padEnd(6)}`);
  }
  console.log("");
  process.exit(0);
}

if (args.includes("--review")) {
  const queue = getNeedsReview({ limit: 15 });

  if (queue.length === 0) {
    console.log("\n  No observations need review.\n");
    process.exit(0);
  }

  console.log(`\n  Priority review queue (${queue.length} items):`);
  console.log(`  Alert-fired first, then largest |delta|\n`);
  console.log(`  ${"Symbol".padEnd(8)} ${"Date".padEnd(12)} ${"Base".padEnd(6)} ${"Enh".padEnd(6)} ${"Delta".padEnd(6)} ${"Alert".padEnd(6)} ${"Type".padEnd(10)}`);
  console.log(`  ${"─".repeat(58)}`);

  for (const o of queue) {
    const deltaColor = o.delta > 0 ? "\x1b[32m" : o.delta < 0 ? "\x1b[31m" : "\x1b[90m";
    const alertMark = o.alertFired ? "\x1b[33mYES\x1b[0m" : "no ";
    console.log(`  ${o.symbol.padEnd(8)} ${o.date.padEnd(12)} ${String(o.baselineScore).padEnd(6)} ${String(o.enhancedScore).padEnd(6)} ${deltaColor}${String(o.delta).padEnd(6)}\x1b[0m ${alertMark.padEnd(6)} ${(o.setupType || "?").padEnd(10)}`);
  }
  console.log(`\n  Use: npm run calibration:update -- --id <ID> --outcome HIT_T1 --justified YES --sessions 3\n`);
  process.exit(0);
}

const symbol = getArg("symbol");
if (symbol) {
  const obs = loadObservations().filter(o => o.symbol === symbol.toUpperCase());
  if (obs.length === 0) {
    console.log(`\n  No observations for ${symbol}.\n`);
    process.exit(0);
  }

  console.log(`\n  Observations for ${symbol} (${obs.length}):\n`);
  for (const o of obs.slice(-10)) {
    const outcome = o.outcome || "—";
    const justified = o.justified || "—";
    console.log(`  ${o.date} | base=${o.baselineScore} enh=${o.enhancedScore} delta=${o.delta} | outcome=${outcome} justified=${justified}`);
    console.log(`    ID: ${o.id}`);
  }
  console.log("");
  process.exit(0);
}

const id = getArg("id");
if (!id) {
  console.log("\n  Usage:");
  console.log("    npm run calibration:update -- --list");
  console.log("    npm run calibration:update -- --symbol NVDA");
  console.log("    npm run calibration:update -- --id OBS_ID --outcome HIT_T1 --justified YES --sessions 3\n");
  process.exit(1);
}

const outcome = getArg("outcome");
const justified = getArg("justified");
const sessions = getArg("sessions");
const notes = getArg("notes");

const patch = {};
if (outcome) {
  if (!VALID_OUTCOMES.includes(outcome.toUpperCase())) {
    console.log(`\n  Invalid outcome. Valid: ${VALID_OUTCOMES.join(", ")}\n`);
    process.exit(1);
  }
  patch.outcome = outcome.toUpperCase();
}
if (justified) {
  if (!VALID_JUSTIFIED.includes(justified.toUpperCase())) {
    console.log(`\n  Invalid justified. Valid: ${VALID_JUSTIFIED.join(", ")}\n`);
    process.exit(1);
  }
  patch.justified = justified.toUpperCase();
}
if (sessions) patch.sessionsOut = parseInt(sessions, 10);
if (notes) patch.notes = notes;

if (Object.keys(patch).length === 0) {
  console.log("\n  No updates provided. Use --outcome, --justified, --sessions, or --notes.\n");
  process.exit(1);
}

const ok = updateObservation(id, patch);
if (ok) {
  console.log(`\n  Updated observation ${id}:`);
  console.log(`  ${JSON.stringify(patch)}\n`);
} else {
  console.log(`\n  Observation not found: ${id}\n`);
  process.exit(1);
}
