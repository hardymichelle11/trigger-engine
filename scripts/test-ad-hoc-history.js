#!/usr/bin/env node
// =====================================================
// Ad Hoc Simulation History — store + outcome calibration tests
// Run: npm run test:ad-hoc-history
//
// Acceptance gates per spec:
//   1. history record created after simulation completes.
//   2. capped max history length.
//   3. newest records first.
//   4. update promotion state.
//   5. update outcome state.
//   6. delete record.
//   7. corrupted localStorage does not crash.
//   8. TE limited records still persist.
//   9. CV limited records still persist.
//  10. simulation history does not write to dynamic basket.
//  11. static catalog behavior remains unchanged.
//
// Plus: calibration summary counts statuses correctly.
// =====================================================

import {
  setHistoryBackend,
  resetHistoryBackend,
  setHistoryMaxRecords,
  resetHistoryMaxRecords,
  recordSimulation,
  listHistory,
  getHistoryById,
  updatePromotion,
  updateOutcome,
  setNotes,
  deleteHistory,
  clearHistory,
  getCalibrationSummary,
  HISTORY_OUTCOMES,
} from "../src/lib/universe/adHocSimulationHistoryStore.js";
import {
  setUniverseBackend,
  resetUniverseBackend,
  clearDynamicUniverse,
  listScannerEligible,
  listBySource,
  listDynamicTickers,
} from "../src/lib/universe/dynamicUniverseStore.js";
import { TICKER_SOURCE_TYPES } from "../src/lib/universe/tickerUniverseTypes.js";
import { getWatchlistEntry, isInScanUniverse } from "../src/optionsWatchlist.js";

let passed = 0;
let failed = 0;
const failures = [];
function assert(name, cond, detail = "") {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${detail ? "  →  " + detail : ""}`); failures.push(name); failed++; }
}
function group(label) {
  console.log(`\n  ${label}\n  ${"─".repeat(Math.max(20, label.length))}`);
}

function makeMemoryBackend() {
  const map = new Map();
  return {
    getItem: (k) => map.has(k) ? map.get(k) : null,
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    _map: map,
  };
}
function reset() {
  setHistoryBackend(makeMemoryBackend());
  setUniverseBackend(makeMemoryBackend());
  clearHistory();
  clearDynamicUniverse();
  resetHistoryMaxRecords();
}

// Build a fully-populated sim result (bars + chain) so the snapshot
// extraction has every field to capture.
function fullSimResult({ symbol = "TEST", at = Date.now() } = {}) {
  return {
    symbol,
    sourceType: TICKER_SOURCE_TYPES.AD_HOC_SIMULATION,
    catalogStatus: "uncataloged",
    analysisMode: "ad_hoc_credit_simulation",
    fetchedAt: at,
    dataAvailability: { polygonQuote: true, polygonBars: true, optionsChain: true, news: false },
    dataAvailabilityLabel: "Quote + bars",
    creditViewBadge: "Options available",
    noMarketData: false,
    triggerEngine: {
      ok: true, label: "Ad Hoc TE Simulation", limited: false,
      barsAvailable: true, dataQuality: "quote_and_bars",
      result: {
        symbol, price: 100, previousClose: 99, percentChange: 1.01,
        structure: { support: 95, resistance: 110, atr: 1.5, trendBias: "BULLISH",
                     supportPct: 0.05, resistancePct: 0.10, windowSize: 30, ohlcAvailable: true },
        note: "No static catalog profile found. Analysis is based on available Polygon market structure.",
      },
      reason: null,
    },
    creditView: {
      ok: true, limited: false, reason: null,
      label: "Ad Hoc Credit Simulation", badge: "Options available",
      candidate: { symbol: "O:TESTP00095", strike: 95, expiration: "2026-06-19",
                   bid: 0.55, ask: 0.65, mid: 0.60, spreadClass: "acceptable",
                   spreadGrade: "B", impliedVolatility: 0.30, delta: -0.18 },
      warnings: [],
      result: {
        recommendation:    { code: "WAIT_FOR_PREMIUM", label: "Wait for Better Premium" },
        confirmation:      { sentence: "Entry requires price holds above $95.00, …" },
        invalidation:      { sentence: "Avoid if price breaks below $94.05, …" },
        bestStrikeZone:    { low: 92, high: 95, label: "$92.00–$95.00 put" },
        minimumPremium:    { value: 0.51, label: "$0.51 credit or better" },
        managementNote:    "Acceptable only if willing to own shares near $92.00–$95.00.",
        riskNarrative:     "Below-norm premium creates poor risk/reward for a credit sale, but this remains a valid accumulation candidate …",
      },
    },
  };
}
function tELimitedSimResult({ symbol = "BLNK" } = {}) {
  return {
    symbol,
    sourceType: TICKER_SOURCE_TYPES.AD_HOC_SIMULATION,
    catalogStatus: "uncataloged",
    analysisMode: "ad_hoc_te_simulation",
    fetchedAt: Date.now(),
    dataAvailability: { polygonQuote: false, polygonBars: false, optionsChain: false, news: false },
    dataAvailabilityLabel: "No market data",
    creditViewBadge: "Credit limited",
    noMarketData: true,
    triggerEngine: {
      ok: false, label: "Ad Hoc TE Simulation", limited: true,
      barsAvailable: false, reason: "Polygon quote and bars unavailable — no structural data to score.",
      result: null,
    },
    creditView: {
      ok: true, limited: true, reason: "Credit View limited: options chain data unavailable. …",
      label: "Ad Hoc Credit Simulation (limited)", badge: "Credit limited",
      candidate: null, warnings: ["empty_chain"], result: null,
    },
  };
}
function cvLimitedSimResult({ symbol = "ZZNEW" } = {}) {
  const r = fullSimResult({ symbol });
  r.creditView = {
    ok: true, limited: true, reason: "Credit View limited: options chain data unavailable. …",
    label: "Ad Hoc Credit Simulation (limited)", badge: "Credit limited",
    candidate: null, warnings: [], result: null,
  };
  r.dataAvailability.optionsChain = false;
  r.creditViewBadge = "Credit limited";
  r.analysisMode = "ad_hoc_te_simulation";
  return r;
}

// ============================================================
group("[1] history record created after simulation");
// ============================================================
reset();

const sim = fullSimResult({ symbol: "TEST" });
const rec = recordSimulation(sim);
assert("recordSimulation returned a record",     !!rec && !!rec.id);
assert("record.symbol = TEST",                    rec.symbol === "TEST");
assert("record.createdAt is a number",            Number.isFinite(rec.createdAt));
assert("record.simulationType captured",          rec.simulationType === "ad_hoc_credit_simulation");
assert("record.sourceType captured",
  rec.sourceType === TICKER_SOURCE_TYPES.AD_HOC_SIMULATION);
assert("record.catalogStatus captured",           rec.catalogStatus === "uncataloged");
assert("teSnapshot.available = true",             rec.teSnapshot.available === true);
assert("teSnapshot.price = 100",                  rec.teSnapshot.price === 100);
assert("teSnapshot.support = 95",                 rec.teSnapshot.support === 95);
assert("teSnapshot.atr captured",                 rec.teSnapshot.atr === 1.5);
assert("teSnapshot.dataQuality = quote_and_bars", rec.teSnapshot.dataQuality === "quote_and_bars");
assert("cvSnapshot.available = true",             rec.cvSnapshot.available === true);
assert("cvSnapshot.recommendationLabel captured",
  rec.cvSnapshot.recommendationLabel === "Wait for Better Premium");
assert("cvSnapshot.creditViewBadge captured",     rec.cvSnapshot.creditViewBadge === "Options available");
assert("cvSnapshot.preferredStrike = 95",         rec.cvSnapshot.preferredStrike === 95);
assert("cvSnapshot.expiration captured",          rec.cvSnapshot.expiration === "2026-06-19");
assert("cvSnapshot.spreadGrade = B",              rec.cvSnapshot.spreadGrade === "B");
assert("cvSnapshot.confirmationSentence captured",
  /price holds above \$95/.test(rec.cvSnapshot.confirmationSentence || ""));
assert("cvSnapshot.invalidationSentence captured",
  /price breaks below/.test(rec.cvSnapshot.invalidationSentence || ""));
assert("promotionState defaults to all-false",
  rec.promotionState.addedToBasket === false &&
  rec.promotionState.promotedToScanner === false &&
  rec.promotionState.sentToTE === false &&
  rec.promotionState.sentToCV === false);
assert("outcome.status defaults to unreviewed",
  rec.outcome.status === HISTORY_OUTCOMES.UNREVIEWED);

// listHistory finds the record.
const listed = listHistory();
assert("listHistory returns one record",  listed.length === 1);
assert("listHistory[0].id matches",       listed[0].id === rec.id);

// ============================================================
group("[2] capped max history length");
// ============================================================
reset();
setHistoryMaxRecords(5);

for (let i = 0; i < 12; i++) {
  recordSimulation(fullSimResult({ symbol: "T" + i, at: 1_700_000_000_000 + i }));
}
const cappedList = listHistory();
assert("listHistory length capped to 5",  cappedList.length === 5);
assert("cap evicts oldest first",
  cappedList.every((r) => !["T0", "T1", "T2", "T3", "T4", "T5", "T6"].includes(r.symbol)));

resetHistoryMaxRecords();

// ============================================================
group("[3] newest records first");
// ============================================================
reset();

const r1 = recordSimulation(fullSimResult({ symbol: "ONE",   at: 1_700_000_000_000 }));
const r2 = recordSimulation(fullSimResult({ symbol: "TWO",   at: 1_700_000_001_000 }));
const r3 = recordSimulation(fullSimResult({ symbol: "THREE", at: 1_700_000_002_000 }));
const order = listHistory();
assert("newest first: THREE",  order[0].id === r3.id);
assert("middle:      TWO",     order[1].id === r2.id);
assert("oldest:      ONE",     order[2].id === r1.id);

// ============================================================
group("[4] update promotion state");
// ============================================================
reset();

const recP = recordSimulation(fullSimResult({ symbol: "TEST" }));
const after1 = updatePromotion(recP.id, { addedToBasket: true });
assert("addedToBasket flipped true",        after1.promotionState.addedToBasket === true);
assert("other flags untouched",
  after1.promotionState.promotedToScanner === false &&
  after1.promotionState.sentToTE === false);

const after2 = updatePromotion(recP.id, { promotedToScanner: true, sentToCV: true });
assert("promotedToScanner true",            after2.promotionState.promotedToScanner === true);
assert("sentToCV true",                     after2.promotionState.sentToCV === true);
assert("addedToBasket still true (merged)", after2.promotionState.addedToBasket === true);

// updatePromotion on missing id returns null.
assert("missing id → null",                 updatePromotion("does-not-exist", { addedToBasket: true }) === null);

// ============================================================
group("[5] update outcome state");
// ============================================================
reset();

const recO = recordSimulation(fullSimResult({ symbol: "TEST" }));
const before = Date.now();
const out1 = updateOutcome(recO.id, { status: HISTORY_OUTCOMES.PROFITABLE, profitCapture: 0.42 });
assert("status -> profitable",              out1.outcome.status === HISTORY_OUTCOMES.PROFITABLE);
assert("profitCapture = 0.42",              Math.abs(out1.outcome.profitCapture - 0.42) < 1e-9);
assert("reviewedAt set automatically",      Number.isFinite(out1.outcome.reviewedAt) && out1.outcome.reviewedAt >= before);

// Invalid status falls back to unreviewed.
const out2 = updateOutcome(recO.id, { status: "weird_status" });
assert("invalid status falls back to unreviewed", out2.outcome.status === HISTORY_OUTCOMES.UNREVIEWED);

// Notes via setNotes.
const out3 = setNotes(recO.id, "good fade setup");
assert("setNotes updates record",           out3.notes === "good fade setup");

// ============================================================
group("[6] delete record");
// ============================================================
reset();

const recD = recordSimulation(fullSimResult({ symbol: "TEST" }));
assert("delete returns true",     deleteHistory(recD.id) === true);
assert("record gone after delete", getHistoryById(recD.id) === null);
assert("delete unknown id returns false", deleteHistory("nope") === false);

// ============================================================
group("[7] corrupted localStorage does not crash");
// ============================================================
reset();

const corrupted = makeMemoryBackend();
corrupted.setItem("te.adhoc.history.v1", "{not valid json");
setHistoryBackend(corrupted);

const safeList = listHistory();
assert("listHistory returns []",                  Array.isArray(safeList) && safeList.length === 0);
const safeRec = recordSimulation(fullSimResult({ symbol: "TEST" }));
assert("recordSimulation still works after corruption", !!safeRec && safeRec.id);

// ============================================================
group("[8] TE limited records still persist");
// ============================================================
reset();

const limTE = tELimitedSimResult({ symbol: "BLNK" });
const recTE = recordSimulation(limTE);
assert("TE-limited record persists",              !!recTE && recTE.symbol === "BLNK");
assert("teSnapshot.available = false",            recTE.teSnapshot.available === false);
assert("teSnapshot.price is null",                recTE.teSnapshot.price === null);
assert("dataAvailability.polygonQuote = false",   recTE.dataAvailability.polygonQuote === false);
assert("listHistory finds it",                    listHistory().length === 1);

// ============================================================
group("[9] CV limited records still persist");
// ============================================================
reset();

const limCV = cvLimitedSimResult({ symbol: "ZZNEW" });
const recCV = recordSimulation(limCV);
assert("CV-limited record persists",                     !!recCV && recCV.symbol === "ZZNEW");
assert("cvSnapshot.available = false",                   recCV.cvSnapshot.available === false);
assert("cvSnapshot.recommendationLabel is null",         recCV.cvSnapshot.recommendationLabel === null);
assert("cvSnapshot.creditViewBadge = 'Credit limited'",  recCV.cvSnapshot.creditViewBadge === "Credit limited");
assert("teSnapshot still populated for CV-only-limited", recCV.teSnapshot.available === true);

// ============================================================
group("[10] simulation history does NOT write to dynamic basket");
// ============================================================
reset();

assert("dynamic store empty before recording",   Object.keys(listDynamicTickers()).length === 0);
recordSimulation(fullSimResult({ symbol: "TEST" }));
recordSimulation(tELimitedSimResult({ symbol: "BLNK" }));
recordSimulation(cvLimitedSimResult({ symbol: "ZZNEW" }));

assert("history wrote 3 entries",                listHistory().length === 3);
assert("dynamic store still empty",              Object.keys(listDynamicTickers()).length === 0);
assert("listScannerEligible still empty",        listScannerEligible().length === 0);
assert("no DYNAMIC_BASKET entries",
  listBySource(TICKER_SOURCE_TYPES.DYNAMIC_BASKET).length === 0);
assert("no LETHAL_BOARD_PROSPECT entries",
  listBySource(TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT).length === 0);

// ============================================================
group("[11] static catalog behavior unchanged");
// ============================================================
reset();

const aaplBefore = getWatchlistEntry("AAPL");
const aaplInUniverseBefore = isInScanUniverse("AAPL");

recordSimulation(fullSimResult({ symbol: "AAPL" }));     // catalog symbol
recordSimulation(fullSimResult({ symbol: "TEST" }));     // uncataloged

const aaplAfter = getWatchlistEntry("AAPL");
assert("AAPL watchlist entry byte-identical",
  aaplBefore === aaplAfter || JSON.stringify(aaplBefore) === JSON.stringify(aaplAfter));
assert("AAPL still in scan universe",  isInScanUniverse("AAPL") === aaplInUniverseBefore);

// ============================================================
group("[12] calibration summary counts statuses correctly");
// ============================================================
reset();

const a = recordSimulation(fullSimResult({ symbol: "AAA", at: 1_700_000_000_000 }));
const b = recordSimulation(fullSimResult({ symbol: "BBB", at: 1_700_000_001_000 }));
const c = recordSimulation(fullSimResult({ symbol: "CCC", at: 1_700_000_002_000 }));
const d = recordSimulation(cvLimitedSimResult({ symbol: "DDD" }));

updateOutcome(a.id, { status: HISTORY_OUTCOMES.PROFITABLE });
updateOutcome(b.id, { status: HISTORY_OUTCOMES.MISSED_WINNER });
updateOutcome(c.id, { status: HISTORY_OUTCOMES.AVOIDED_CORRECTLY });
updatePromotion(a.id, { addedToBasket: true, promotedToScanner: true });
updatePromotion(b.id, { addedToBasket: true });

const sum = getCalibrationSummary();
assert("total = 4",                  sum.total === 4);
assert("optionsAvailable = 3",       sum.optionsAvailable === 3);  // a, b, c (full); d is limited
assert("addedToBasket = 2",          sum.addedToBasket === 2);
assert("promotedToScanner = 1",      sum.promotedToScanner === 1);
assert("profitable = 1",             sum.profitable === 1);
assert("missedWinner = 1",           sum.missedWinner === 1);
assert("avoidedCorrectly = 1",       sum.avoidedCorrectly === 1);
assert("invalidated = 0",            sum.invalidated === 0);
assert("unreviewed = 1 (DDD)",       sum.unreviewed === 1);

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetHistoryBackend();
resetUniverseBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
