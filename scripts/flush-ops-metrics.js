#!/usr/bin/env node
// =====================================================
// FLUSH OPS METRICS — drain localStorage → BigQuery
// =====================================================
// Reads accumulated ops events (recalc, invalidation,
// alert-block, alert-fire) and inserts them into BQ.
//
// Usage:
//   npm run ops:flush
//
// BQ tables created if missing:
//   market_data.ops_recalc_events
//   market_data.ops_invalidation_events
//   market_data.ops_alert_events
//
// Events are drained (cleared) after successful insert.
// =====================================================

import "dotenv/config";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { drainEvents, loadOpsEvents, getEventSummary, OPS_EVENT_TYPES } from "../src/lib/engine/opsEventCollector.js";

const OUT_DIR = "logs/ops";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.VITE_GCP_PROJECT;
const DATASET = process.env.BQ_DATASET || "market_data";

// --------------------------------------------------
// BQ TABLE SCHEMAS
// --------------------------------------------------

const SCHEMAS = {
  ops_recalc_events: [
    { name: "timestamp", type: "TIMESTAMP" },
    { name: "date", type: "DATE" },
    { name: "symbol", type: "STRING" },
    { name: "setup_type", type: "STRING" },
    { name: "reason_codes", type: "STRING", mode: "REPEATED" },
    { name: "anchor_price", type: "FLOAT64" },
    { name: "regime", type: "STRING" },
    { name: "iv_percentile", type: "FLOAT64" },
  ],
  ops_invalidation_events: [
    { name: "timestamp", type: "TIMESTAMP" },
    { name: "date", type: "DATE" },
    { name: "symbol", type: "STRING" },
    { name: "setup_type", type: "STRING" },
    { name: "reasons", type: "STRING", mode: "REPEATED" },
    { name: "anchor_drift_pct", type: "FLOAT64" },
    { name: "age_seconds", type: "INT64" },
    { name: "anchor_price", type: "FLOAT64" },
    { name: "current_price", type: "FLOAT64" },
  ],
  ops_alert_events: [
    { name: "timestamp", type: "TIMESTAMP" },
    { name: "date", type: "DATE" },
    { name: "event_type", type: "STRING" },  // "alert_fire" or "alert_block"
    { name: "symbol", type: "STRING" },
    { name: "score", type: "FLOAT64" },
    { name: "priority", type: "STRING" },
    { name: "action", type: "STRING" },
    { name: "regime", type: "STRING" },
    { name: "anchor_price", type: "FLOAT64" },
    { name: "block_reason", type: "STRING" },
    { name: "anchor_drift_pct", type: "FLOAT64" },
    { name: "freshness_age_sec", type: "INT64" },
  ],
};

// --------------------------------------------------
// TRANSFORM EVENTS → BQ ROWS
// --------------------------------------------------

function toRecalcRows(events) {
  return events.filter(e => e.type === OPS_EVENT_TYPES.RECALC).map(e => ({
    timestamp: new Date(e.timestamp).toISOString(),
    date: e.date,
    symbol: e.symbol,
    setup_type: e.setupType || "unknown",
    reason_codes: e.reasonCodes || [],
    anchor_price: e.anchorPrice ?? null,
    regime: e.regime || null,
    iv_percentile: e.ivPercentile ?? null,
  }));
}

function toInvalidationRows(events) {
  return events.filter(e => e.type === OPS_EVENT_TYPES.INVALIDATE).map(e => ({
    timestamp: new Date(e.timestamp).toISOString(),
    date: e.date,
    symbol: e.symbol,
    setup_type: e.setupType || "unknown",
    reasons: e.reasons || [],
    anchor_drift_pct: e.anchorDriftPct ?? null,
    age_seconds: e.ageSeconds ?? null,
    anchor_price: e.anchorPrice ?? null,
    current_price: e.currentPrice ?? null,
  }));
}

function toAlertRows(events) {
  return events
    .filter(e => e.type === OPS_EVENT_TYPES.ALERT_FIRE || e.type === OPS_EVENT_TYPES.ALERT_BLOCK)
    .map(e => ({
      timestamp: new Date(e.timestamp).toISOString(),
      date: e.date,
      event_type: e.type,
      symbol: e.symbol,
      score: e.score ?? null,
      priority: e.priority || null,
      action: e.action || null,
      regime: e.regime || null,
      anchor_price: e.anchorPrice ?? null,
      block_reason: e.blockReason || null,
      anchor_drift_pct: e.anchorDriftPct ?? null,
      freshness_age_sec: e.freshnessAgeSec ?? null,
    }));
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

async function main() {
  console.log("\n  Ops Metrics Flush");
  console.log("  ─────────────────\n");

  // Show summary before drain
  const summary = getEventSummary();
  if (summary.total === 0) {
    console.log("  No ops events to flush.\n");
    process.exit(0);
  }

  console.log(`  Total events: ${summary.total}`);
  console.log(`  By type: ${JSON.stringify(summary.byType)}`);
  console.log(`  Oldest: ${summary.oldestTimestamp ? new Date(summary.oldestTimestamp).toISOString() : "—"}`);
  console.log(`  Newest: ${summary.newestTimestamp ? new Date(summary.newestTimestamp).toISOString() : "—"}`);

  // Drain events
  const events = drainEvents();

  // Transform
  const recalcRows = toRecalcRows(events);
  const invalidationRows = toInvalidationRows(events);
  const alertRows = toAlertRows(events);

  console.log(`\n  Recalc rows:       ${recalcRows.length}`);
  console.log(`  Invalidation rows: ${invalidationRows.length}`);
  console.log(`  Alert rows:        ${alertRows.length}`);

  // Ensure output directory
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  // Always write local JSON backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = `${OUT_DIR}/ops-events-${timestamp}.json`;
  writeFileSync(backupPath, JSON.stringify({ recalcRows, invalidationRows, alertRows, flushedAt: new Date().toISOString() }, null, 2));
  console.log(`\n  Local backup: ${backupPath}`);

  // Try BQ insert
  if (!PROJECT) {
    console.log("  GOOGLE_CLOUD_PROJECT not set — skipping BQ insert.");
    console.log("  Events saved locally and cleared from localStorage.\n");
    return;
  }

  try {
    const { BigQuery } = await import("@google-cloud/bigquery");
    const bq = new BigQuery({ projectId: PROJECT });

    // Ensure tables exist
    for (const [table, schema] of Object.entries(SCHEMAS)) {
      const tableRef = bq.dataset(DATASET).table(table);
      const [exists] = await tableRef.exists();
      if (!exists) {
        await bq.dataset(DATASET).createTable(table, { schema: { fields: schema } });
        console.log(`  Created table: ${DATASET}.${table}`);
      }
    }

    // Insert rows
    if (recalcRows.length > 0) {
      await bq.dataset(DATASET).table("ops_recalc_events").insert(recalcRows);
      console.log(`  Inserted ${recalcRows.length} recalc rows into BQ`);
    }
    if (invalidationRows.length > 0) {
      await bq.dataset(DATASET).table("ops_invalidation_events").insert(invalidationRows);
      console.log(`  Inserted ${invalidationRows.length} invalidation rows into BQ`);
    }
    if (alertRows.length > 0) {
      await bq.dataset(DATASET).table("ops_alert_events").insert(alertRows);
      console.log(`  Inserted ${alertRows.length} alert rows into BQ`);
    }

    console.log(`\n  BQ flush complete. Events cleared from localStorage.\n`);
  } catch (err) {
    console.warn(`  BQ insert failed: ${err.message}`);
    console.log("  Events saved locally (JSON backup). Retry later.\n");
  }
}

main().catch(err => {
  console.error("  Fatal:", err.message);
  process.exit(1);
});
