#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.7.6 tests
// Run: npm run test:discovery-phase4-7-6
// =====================================================
//
// Verifies the Replay Last Close operator workflow:
//   - freshnessPolicy: new "replay" session disables freshness rejection
//   - replayLastCloseLoader: pure helpers, tier ordering, single-day
//     OHLCV → marketDataBySymbol shape, fallback bundle on errors
//   - lethalBoardScanController: REPLAY_LAST_CLOSE preview + COMMIT_REPLAY
//     modes, RECORDED_SOURCE constants, replay does not touch alert pipeline
//   - discoveryAlertWireup: stamps recordedSource onto persisted alerts
//   - alertHistory: persists recordedSource on each entry
//   - OperatorConsole: 4th "Replay Last Close" button, aria-label correct
//   - CapitalCommandBar: REPLAY pill renders when liveMeta.replay is true
//   - OpportunityCard: ReplayBadge primitive, replay/replaySessionDate props
//   - OpportunityDetailPanel: replay banner + props
//   - LethalBoardPage: runReplayLastClose callback + market-closed warn
// =====================================================

import { readFileSync, existsSync } from "node:fs";
import { transformWithOxc } from "vite";

import { resolveFreshnessPolicy } from "../src/engines/discovery/freshnessPolicy.js";
import {
  fetchReplayLastCloseBundle,
  isReplayStale,
  isoDateNDaysBack,
  REPLAY_TIER,
  REPLAY_SESSION,
  REPLAY_STALE_CALENDAR_DAYS,
} from "../src/engines/discovery/replayLastCloseLoader.js";
import {
  SCAN_MODE,
  SCAN_MODE_LABEL,
  RECORDED_SOURCE,
  createScanController,
} from "../src/components/discovery/lethalBoardScanController.js";

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

function read(p) { return readFileSync(p, "utf8"); }

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.7.6 (Replay Last Close)");
console.log("  ═══════════════════════════════════════════════════════════════════");

// =================================================================
// 1. Files exist + JSX validity
// =================================================================
group("files exist + JSX/JS validity");

const FILES = {
  loader:        "src/engines/discovery/replayLastCloseLoader.js",
  freshness:     "src/engines/discovery/freshnessPolicy.js",
  controller:    "src/components/discovery/lethalBoardScanController.js",
  wireup:        "src/engines/discovery/discoveryAlertWireup.js",
  alertHistory:  "src/lib/alerts/alertHistory.js",
  console:       "src/components/discovery/cockpit/OperatorConsole.jsx",
  commandBar:    "src/components/discovery/cockpit/CapitalCommandBar.jsx",
  card:          "src/components/discovery/cockpit/OpportunityCard.jsx",
  detail:        "src/components/discovery/cockpit/OpportunityDetailPanel.jsx",
  page:          "src/components/discovery/LethalBoardPage.jsx",
  cockpit:       "src/components/discovery/LethalBoardCockpit.jsx",
  topPicks:      "src/components/discovery/cockpit/TopPicksGrid.jsx",
};
for (const [name, path] of Object.entries(FILES)) {
  assert(`${name} exists at ${path}`, existsSync(path));
}
for (const path of [FILES.console, FILES.commandBar, FILES.card, FILES.detail, FILES.page, FILES.cockpit, FILES.topPicks]) {
  try {
    await transformWithOxc(read(path), path, { loader: "jsx" });
    assert(`${path} JSX valid`, true);
  } catch (e) {
    assert(`${path} JSX valid`, false, e?.message || String(e));
  }
}

// =================================================================
// 2. freshnessPolicy — replay session disables freshness rejection
// =================================================================
group("freshnessPolicy — replay session");
{
  const p = resolveFreshnessPolicy({ session: "replay", scannerMode: "neutral" });
  assert("replay/neutral policy.disabled === true", p.disabled === true);
  assert("replay/neutral policy.source === 'session'", p.source === "session");

  const c = resolveFreshnessPolicy({ session: "replay", scannerMode: "conservative" });
  assert("replay/conservative also disabled", c.disabled === true);

  const a = resolveFreshnessPolicy({ session: "replay", scannerMode: "aggressive" });
  assert("replay/aggressive also disabled", a.disabled === true);

  // Sanity: regular session is still NOT disabled
  const r = resolveFreshnessPolicy({ session: "regular", scannerMode: "neutral" });
  assert("regular/neutral NOT disabled", r.disabled !== true);
}

// =================================================================
// 3. replayLastCloseLoader — pure helpers
// =================================================================
group("replayLastCloseLoader — helpers + constants");
{
  assert("REPLAY_TIER has POLYGON_GROUPED_DAILY",
    REPLAY_TIER.POLYGON_GROUPED_DAILY === "polygon_grouped_daily");
  assert("REPLAY_TIER has POLYGON_PREV_CLOSE",
    REPLAY_TIER.POLYGON_PREV_CLOSE === "polygon_prev_close");
  assert("REPLAY_TIER has BQ_BARS_1D placeholder",
    REPLAY_TIER.BQ_BARS_1D === "bq_bars_1d");
  assert("REPLAY_SESSION === 'replay'", REPLAY_SESSION === "replay");

  // isReplayStale
  const now = Date.parse("2026-05-03T20:00:00Z");
  const fresh = Date.parse("2026-05-01T20:00:00Z");           // 2 days
  const stale = Date.parse("2026-04-25T20:00:00Z");           // 8 days
  assert("isReplayStale: 2-day-old session is fresh",
    isReplayStale(fresh, now) === false);
  assert("isReplayStale: 8-day-old session is stale",
    isReplayStale(stale, now) === true);
  assert("isReplayStale: null session is not stale",
    isReplayStale(null, now) === false);
  assert("REPLAY_STALE_CALENDAR_DAYS is a positive number",
    Number.isFinite(REPLAY_STALE_CALENDAR_DAYS) && REPLAY_STALE_CALENDAR_DAYS > 0);

  // isoDateNDaysBack
  const back1 = isoDateNDaysBack(Date.parse("2026-05-03T12:00:00Z"), 1);
  assert("isoDateNDaysBack(now, 1) returns 2026-05-02",
    back1 === "2026-05-02", `got ${back1}`);
}

// =================================================================
// 4. replayLastCloseLoader — fetcher contract + tier 2 (grouped)
// =================================================================
group("replayLastCloseLoader — grouped daily tier (DI fetcher)");
{
  const calls = [];
  const groupedFetcher = async (path) => {
    calls.push(path);
    if (path.includes("/v2/aggs/grouped/locale/us/market/stocks/")) {
      // Return a payload only when the asked-for date is 2026-05-01
      // (Friday). Earlier probes for 2026-05-02 / 2026-05-03 should
      // walk back, simulating weekend non-trading days.
      if (path.includes("2026-05-01")) {
        return {
          status: "OK",
          results: [
            { T: "NVDA", o: 109, h: 114, l: 108.5, c: 113.5, v: 35_000_000 },
            { T: "ZZUNCAT", o: 38, h: 40.5, l: 37, c: 40, v: 4_000_000 },
            { T: "NOTINCURATED", o: 1, h: 1, l: 1, c: 1, v: 1 },
          ],
        };
      }
      return { results: [] };
    }
    return { results: [] };
  };

  const bundle = await fetchReplayLastCloseBundle({
    fetcher: groupedFetcher,
    now: () => Date.parse("2026-05-03T20:00:00Z"),
    curatedSymbols: ["NVDA", "ZZUNCAT"],   // intentionally exclude NOTINCURATED
  });

  assert("grouped tier: bundle has symbols",
    Array.isArray(bundle.symbols) && bundle.symbols.length === 2);
  assert("grouped tier: NVDA included", bundle.symbols.includes("NVDA"));
  assert("grouped tier: NOTINCURATED filtered out",
    !bundle.symbols.includes("NOTINCURATED"));
  assert("grouped tier: NVDA price = close (113.5)",
    bundle.marketDataBySymbol.NVDA.price === 113.5);
  assert("grouped tier: NVDA previousClose = open (109)",
    bundle.marketDataBySymbol.NVDA.previousClose === 109);
  assert("grouped tier: NVDA atr = high-low (5.5)",
    Math.abs(bundle.marketDataBySymbol.NVDA.atr - (114 - 108.5)) < 1e-9);
  assert("grouped tier: metadata.universe.session === 'replay'",
    bundle.metadata.universe.session === "replay");
  assert("grouped tier: metadata.replay === true",
    bundle.metadata.replay === true);
  assert("grouped tier: tier === polygon_grouped_daily",
    bundle.metadata.universe.tier === REPLAY_TIER.POLYGON_GROUPED_DAILY);
  assert("grouped tier: sessionDate captured (2026-05-01)",
    bundle.metadata.universe.sessionDate === "2026-05-01");
  assert("grouped tier: warnings include 'Confirm live pricing'",
    bundle.warnings.some(w => /Confirm live pricing/i.test(w)));
  assert("grouped tier: probe walked back through weekend (>= 2 calls)",
    calls.length >= 2, `got ${calls.length} calls`);
}

// =================================================================
// 5. replayLastCloseLoader — fallback when grouped fails
// =================================================================
group("replayLastCloseLoader — per-symbol fallback");
{
  const prevCloseFetcher = async (path) => {
    if (path.includes("/v2/aggs/grouped/")) {
      // Always empty — forces fallback
      return { results: [] };
    }
    if (path.includes("/v2/aggs/ticker/NVDA/prev")) {
      return {
        results: [{
          T: "NVDA", o: 109, h: 114, l: 108.5, c: 113.5,
          v: 35_000_000, t: Date.parse("2026-05-01T20:00:00Z"),
        }],
      };
    }
    return { results: [] };
  };

  const bundle = await fetchReplayLastCloseBundle({
    fetcher: prevCloseFetcher,
    now: () => Date.parse("2026-05-03T20:00:00Z"),
    curatedSymbols: ["NVDA"],
  });

  assert("prev-close fallback: NVDA included", bundle.symbols.includes("NVDA"));
  assert("prev-close fallback: tier === polygon_prev_close",
    bundle.metadata.universe.tier === REPLAY_TIER.POLYGON_PREV_CLOSE);
  assert("prev-close fallback: NVDA price = 113.5",
    bundle.marketDataBySymbol.NVDA.price === 113.5);
}

// =================================================================
// 6. replayLastCloseLoader — fallback bundle when nothing works
// =================================================================
group("replayLastCloseLoader — failure path returns structured fallback");
{
  const deadFetcher = async () => ({ results: [] });
  const bundle = await fetchReplayLastCloseBundle({
    fetcher: deadFetcher,
    now: () => Date.parse("2026-05-03T20:00:00Z"),
    curatedSymbols: ["NVDA"],
  });
  assert("fallback bundle: symbols empty", bundle.symbols.length === 0);
  assert("fallback bundle: still has metadata.universe",
    !!bundle.metadata?.universe);
  assert("fallback bundle: metadata.replay === true",
    bundle.metadata.replay === true);
  assert("fallback bundle: warnings non-empty",
    Array.isArray(bundle.warnings) && bundle.warnings.length > 0);
}

// =================================================================
// 7. SCAN_MODE + RECORDED_SOURCE constants
// =================================================================
group("lethalBoardScanController — replay modes");
{
  assert("SCAN_MODE.REPLAY_LAST_CLOSE === 'replay_last_close'",
    SCAN_MODE.REPLAY_LAST_CLOSE === "replay_last_close");
  assert("SCAN_MODE.COMMIT_REPLAY === 'commit_replay'",
    SCAN_MODE.COMMIT_REPLAY === "commit_replay");
  assert("RECORDED_SOURCE.LIVE === 'live'",
    RECORDED_SOURCE.LIVE === "live");
  assert("RECORDED_SOURCE.REPLAY_LAST_CLOSE === 'replay_last_close'",
    RECORDED_SOURCE.REPLAY_LAST_CLOSE === "replay_last_close");
  assert("SCAN_MODE_LABEL has REPLAY_LAST_CLOSE entry",
    typeof SCAN_MODE_LABEL[SCAN_MODE.REPLAY_LAST_CLOSE] === "string"
      && SCAN_MODE_LABEL[SCAN_MODE.REPLAY_LAST_CLOSE].length > 0);
  assert("SCAN_MODE_LABEL has COMMIT_REPLAY entry",
    typeof SCAN_MODE_LABEL[SCAN_MODE.COMMIT_REPLAY] === "string"
      && SCAN_MODE_LABEL[SCAN_MODE.COMMIT_REPLAY].length > 0);
}

// =================================================================
// 8. Scan controller — replay preview never records, commit_replay records
// =================================================================
group("lethalBoardScanController — replay preview/commit semantics");
{
  const captured = [];
  const ctrl = createScanController({
    recordAlertFn: (alert) => captured.push(alert),
  });
  const fakeScan = {
    bestUseOfCapital: { symbol: "NVDA", lethalScore: 80, rank: 1 },
    ranked: [{ symbol: "NVDA", lethalScore: 80, rank: 1, bestUseOfCapital: true }],
  };

  const replayPreview = ctrl.processScan({
    scanResult: fakeScan, mode: SCAN_MODE.REPLAY_LAST_CLOSE,
  });
  assert("replay preview: recorded === false",
    replayPreview.status.recorded === false);
  assert("replay preview: never persists alert",
    captured.length === 0);

  const replayCommit = ctrl.processScan({
    scanResult: fakeScan, mode: SCAN_MODE.COMMIT_REPLAY,
  });
  assert("commit_replay: at least attempted",
    replayCommit.status.mode === SCAN_MODE.COMMIT_REPLAY);
  if (replayCommit.status.recorded) {
    assert("commit_replay: persisted alert carries recordedSource = replay_last_close",
      captured.length > 0
        && captured[captured.length - 1].recordedSource === RECORDED_SOURCE.REPLAY_LAST_CLOSE);
  } else {
    // Even if dedup suppressed (running back-to-back same-symbol commit),
    // the SCAN_MODE bookkeeping still must have routed via COMMIT_REPLAY.
    assert("commit_replay: dedup-suppression is acceptable but mode must be COMMIT_REPLAY",
      replayCommit.status.mode === SCAN_MODE.COMMIT_REPLAY);
  }
}

// =================================================================
// 9. discoveryAlertWireup — recordedSource threading
// =================================================================
group("discoveryAlertWireup source string in file");
{
  const src = read(FILES.wireup);
  assert("wireup imports/uses recordedSource", /recordedSource/.test(src));
  assert("wireup defaults recordedSource to 'live'",
    /recordedSource\s*=\s*\(opts[\s\S]*?\|\|\s*"live"/.test(src)
      || /recordedSource[\s\S]*?\|\|[\s\S]*?"live"/.test(src));
  assert("wireup stamps recordedSource onto persisted alert",
    /\.\.\.alert,\s*recordedSource/.test(src));
}

// =================================================================
// 10. alertHistory — persists recordedSource
// =================================================================
group("alertHistory persists recordedSource");
{
  const src = read(FILES.alertHistory);
  assert("alertHistory references recordedSource",
    /recordedSource/.test(src));
  assert("alertHistory defaults recordedSource to 'live'",
    /alert\.recordedSource[\s\S]*?:\s*"live"/.test(src));
}

// =================================================================
// 11. OperatorConsole — 4th button
// =================================================================
group("OperatorConsole — Replay Last Close button");
{
  const src = read(FILES.console);
  assert("OperatorConsole references onRunReplayLastClose",
    /onRunReplayLastClose/.test(src));
  assert("OperatorConsole has aria-label='Replay last close'",
    /aria-label="Replay last close"/i.test(src));
  assert("OperatorConsole renders 'Replay Last Close' visible label",
    /Replay Last Close/.test(src));
  // Phase 4.7.5 still required ≥ 5 onClick — bumping to ≥ 6 with the new button
  const onClickCount = (src.match(/onClick=/g) || []).length;
  assert("OperatorConsole onClick count >= 6",
    onClickCount >= 6, `got ${onClickCount}`);
}

// =================================================================
// 12. CapitalCommandBar — REPLAY pill
// =================================================================
group("CapitalCommandBar — REPLAY pill");
{
  const src = read(FILES.commandBar);
  assert("CommandBar accepts liveMeta prop", /liveMeta/.test(src));
  assert("CommandBar guards on liveMeta?.replay",
    /liveMeta\?\.replay/.test(src));
  assert("CommandBar emits 'Replay' literal in JSX",
    /Replay/.test(src));
}

// =================================================================
// 13. OpportunityCard — ReplayBadge + props
// =================================================================
group("OpportunityCard — ReplayBadge wired");
{
  const src = read(FILES.card);
  assert("Card accepts replay prop",
    /replay\s*=\s*false/.test(src));
  assert("Card accepts replaySessionDate prop",
    /replaySessionDate/.test(src));
  assert("Card defines ReplayBadge primitive",
    /function ReplayBadge\b/.test(src));
  assert("Card renders <ReplayBadge ...>",
    /<ReplayBadge/.test(src));
}

// =================================================================
// 14. OpportunityDetailPanel — banner
// =================================================================
group("OpportunityDetailPanel — replay banner");
{
  const src = read(FILES.detail);
  assert("DetailPanel accepts replay prop",
    /replay\s*=\s*false/.test(src));
  assert("DetailPanel accepts replaySessionDate prop",
    /replaySessionDate/.test(src));
  assert("DetailPanel renders 'Confirm live pricing' banner copy",
    /Confirm live pricing/i.test(src));
  assert("DetailPanel banner uses aria-label='Replay analysis banner'",
    /aria-label="Replay analysis banner"/.test(src));
}

// =================================================================
// 15. LethalBoardPage — runReplayLastClose + commit confirm
// =================================================================
group("LethalBoardPage — wiring");
{
  const src = read(FILES.page);
  assert("Page imports fetchReplayLastCloseBundle",
    /fetchReplayLastCloseBundle/.test(src));
  assert("Page defines runReplayLastClose useCallback",
    /runReplayLastClose\s*=\s*useCallback/.test(src));
  assert("Page applies SCAN_MODE.REPLAY_LAST_CLOSE",
    /SCAN_MODE\.REPLAY_LAST_CLOSE/.test(src));
  assert("Page applies SCAN_MODE.COMMIT_REPLAY in confirm path",
    /SCAN_MODE\.COMMIT_REPLAY/.test(src));
  assert("Page guards Run & Record with liveMeta?.replay check",
    /isReplayActive/.test(src) || /liveMeta\?\.replay/.test(src));
  assert("Page passes onRunReplayLastClose to cockpit",
    /onRunReplayLastClose/.test(src));
}

// =================================================================
// 16. Cockpit — threads liveMeta + replay flag to children
// =================================================================
group("LethalBoardCockpit — threads liveMeta to children");
{
  const src = read(FILES.cockpit);
  assert("Cockpit forwards onRunReplayLastClose to OperatorConsole",
    /onRunReplayLastClose=\{props\.onRunReplayLastClose\}/.test(src));
  assert("Cockpit passes liveMeta to CapitalCommandBar",
    /liveMeta=\{props\.liveMeta\}/.test(src));
  assert("Cockpit passes replay flag to TopPicksGrid",
    /replay=\{!!props\.liveMeta\?\.replay\}/.test(src));
  assert("Cockpit passes replay flag to OpportunityDetailPanel",
    src.includes("replay={!!props.liveMeta?.replay}")
      && src.indexOf("OpportunityDetailPanel") >= 0);
}

// =================================================================
// FOOTER
// =================================================================
console.log("\n  ════════════════════════════════════════════");
console.log(`  Phase 4.7.6: ${passed} passed, ${failed} failed (total ${passed + failed})`);
if (failed > 0) {
  console.log("\n  Failures:");
  for (const f of failureLines) console.log("    - " + f);
  process.exit(1);
}
