// =====================================================
// STACK REVERSAL BACKTEST — NVDA thesis validation
// =====================================================
// Replays historical NVDA reversal events and measures:
// - Power sector confirmation timing
// - Follower lag behavior (NBIS vs NEBX)
// - Target hit rates by stage (EARLY/MID/LATE)
// - Max favorable/adverse excursion
// - Time to target
//
// Input: array of StackReversalEvent objects
// Output: per-event outcomes + aggregate summary
// =====================================================

// --------------------------------------------------
// EVENT SHAPE
// --------------------------------------------------

/**
 * @typedef {object} StackReversalEvent
 * @property {string} date — ISO date of reversal trigger
 * @property {string} stage — EARLY, MID, LATE
 * @property {number} leaderPrice — NVDA at trigger
 * @property {number} leaderMomentum — NVDA % change at trigger
 * @property {number} powerStrength — fraction of power group turning up
 * @property {number} followerLag — follower avg momentum vs leader
 * @property {string} bestFollower — "NBIS" or "NEBX"
 * @property {number} nbisEntryPrice — NBIS price at trigger
 * @property {number} nebxEntryPrice — NEBX price at trigger
 * @property {number[]} targets — [T1, T2, T3] for follower
 * @property {number} stop — stop price for follower
 * @property {number[]} nbisForwardPrices — NBIS daily closes from trigger (length >= 5)
 * @property {number[]} nebxForwardPrices — NEBX daily closes from trigger
 * @property {number[]} nvdaForwardPrices — NVDA daily closes from trigger
 * @property {number} score — evaluator score at trigger
 */

// --------------------------------------------------
// SINGLE EVENT OUTCOME
// --------------------------------------------------

/**
 * Evaluate a single stack reversal event.
 * @param {StackReversalEvent} event
 * @returns {object} outcome
 */
export function evaluateStackEvent(event) {
  const nbisResult = _evaluateFollower("NBIS", event.nbisEntryPrice, event.nbisForwardPrices, event.targets, event.stop);
  const nebxResult = _evaluateFollower("NEBX", event.nebxEntryPrice, event.nebxForwardPrices, event.targets, event.stop);

  // NVDA (leader) forward path
  const nvdaMove = event.nvdaForwardPrices && event.nvdaForwardPrices.length > 1
    ? _r4((event.nvdaForwardPrices[event.nvdaForwardPrices.length - 1] - event.leaderPrice) / event.leaderPrice)
    : 0;

  // Which follower performed better?
  const winnerFollower = nbisResult.hitT1 && !nebxResult.hitT1 ? "NBIS"
    : !nbisResult.hitT1 && nebxResult.hitT1 ? "NEBX"
    : nbisResult.maxFavPct > nebxResult.maxFavPct ? "NBIS"
    : "NEBX";

  return {
    date: event.date,
    stage: event.stage,
    score: event.score,
    leaderPrice: event.leaderPrice,
    leaderMomentum: event.leaderMomentum,
    powerStrength: event.powerStrength,
    nvdaForwardMove: nvdaMove,
    bestFollowerPicked: event.bestFollower,
    actualBetterFollower: winnerFollower,
    pickedCorrectly: event.bestFollower === winnerFollower,
    nbis: nbisResult,
    nebx: nebxResult,
  };
}

function _evaluateFollower(symbol, entryPrice, forwardPrices, targets, stop) {
  if (!forwardPrices || forwardPrices.length < 2 || !entryPrice) {
    return _emptyFollowerResult(symbol, entryPrice);
  }

  let hitT1 = false, hitT2 = false, hitT3 = false;
  let hitStop = false;
  let dayToT1 = null, dayToT2 = null, dayToT3 = null;
  let maxFav = 0, maxAdv = 0;

  for (let i = 1; i < forwardPrices.length; i++) {
    const price = forwardPrices[i];
    const movePct = (price - entryPrice) / entryPrice;

    if (movePct > maxFav) maxFav = movePct;
    if (movePct < maxAdv) maxAdv = movePct;

    // Check targets
    if (!hitT1 && targets[0] && price >= targets[0]) { hitT1 = true; dayToT1 = i; }
    if (!hitT2 && targets[1] && price >= targets[1]) { hitT2 = true; dayToT2 = i; }
    if (!hitT3 && targets[2] && price >= targets[2]) { hitT3 = true; dayToT3 = i; }

    // Check stop
    if (!hitStop && stop && price <= stop) { hitStop = true; }
  }

  const finalPrice = forwardPrices[forwardPrices.length - 1];
  const finalMovePct = (finalPrice - entryPrice) / entryPrice;

  let result = "FLAT";
  if (hitT1 && !hitStop) result = "WIN";
  else if (hitStop && !hitT1) result = "LOSS";
  else if (hitT1 && hitStop) result = "WIN_WITH_TOUCH"; // hit target before or despite stop
  else if (finalMovePct > 0.01) result = "SMALL_WIN";
  else if (finalMovePct < -0.01) result = "SMALL_LOSS";

  return {
    symbol,
    entryPrice: _r2(entryPrice),
    finalPrice: _r2(finalPrice),
    result,
    hitT1, hitT2, hitT3, hitStop,
    dayToT1, dayToT2, dayToT3,
    maxFavPct: _r4(maxFav),
    maxAdvPct: _r4(maxAdv),
    finalMovePct: _r4(finalMovePct),
    bars: forwardPrices.length - 1,
  };
}

function _emptyFollowerResult(symbol, entryPrice) {
  return {
    symbol, entryPrice: _r2(entryPrice || 0), finalPrice: 0,
    result: "NO_DATA",
    hitT1: false, hitT2: false, hitT3: false, hitStop: false,
    dayToT1: null, dayToT2: null, dayToT3: null,
    maxFavPct: 0, maxAdvPct: 0, finalMovePct: 0, bars: 0,
  };
}

// --------------------------------------------------
// BATCH BACKTEST
// --------------------------------------------------

/**
 * Run backtest on multiple stack reversal events.
 * @param {StackReversalEvent[]} events
 * @returns {object[]} outcomes
 */
export function runStackBacktest(events) {
  return events.map(evaluateStackEvent);
}

// --------------------------------------------------
// SUMMARY REPORTER
// --------------------------------------------------

/**
 * Summarize stack reversal backtest outcomes.
 * @param {object[]} outcomes
 * @returns {object}
 */
export function summarizeStackBacktest(outcomes) {
  if (!outcomes || outcomes.length === 0) return _emptySummary();

  // By stage
  const stages = {};
  for (const stage of ["EARLY", "MID", "LATE"]) {
    const inStage = outcomes.filter(o => o.stage === stage);
    if (inStage.length === 0) continue;
    stages[stage] = _summarizeGroup(inStage);
  }

  // By follower
  const nbisAll = outcomes.map(o => o.nbis).filter(f => f.result !== "NO_DATA");
  const nebxAll = outcomes.map(o => o.nebx).filter(f => f.result !== "NO_DATA");

  // Follower picker accuracy
  const pickerCorrect = outcomes.filter(o => o.pickedCorrectly).length;

  return {
    totalEvents: outcomes.length,
    byStage: stages,
    nbis: _summarizeFollowerGroup(nbisAll),
    nebx: _summarizeFollowerGroup(nebxAll),
    followerPickerAccuracy: _r2(pickerCorrect / outcomes.length),
    avgLeaderForwardMove: _r4(_avg(outcomes.map(o => o.nvdaForwardMove))),
    avgScore: _r2(_avg(outcomes.map(o => o.score))),
  };
}

function _summarizeGroup(outcomes) {
  const nbisWins = outcomes.filter(o => o.nbis.hitT1).length;
  const nebxWins = outcomes.filter(o => o.nebx.hitT1).length;

  return {
    count: outcomes.length,
    nbisT1Rate: _r2(nbisWins / outcomes.length),
    nebxT1Rate: _r2(nebxWins / outcomes.length),
    avgScore: _r2(_avg(outcomes.map(o => o.score))),
    avgLeaderMove: _r4(_avg(outcomes.map(o => o.nvdaForwardMove))),
  };
}

function _summarizeFollowerGroup(results) {
  if (results.length === 0) return { count: 0, t1Rate: 0, t2Rate: 0, t3Rate: 0, stopRate: 0, avgMFE: 0, avgMAE: 0, avgDayToT1: null };

  const t1Hits = results.filter(r => r.hitT1);
  const t2Hits = results.filter(r => r.hitT2);
  const t3Hits = results.filter(r => r.hitT3);
  const stopHits = results.filter(r => r.hitStop);

  return {
    count: results.length,
    t1Rate: _r2(t1Hits.length / results.length),
    t2Rate: _r2(t2Hits.length / results.length),
    t3Rate: _r2(t3Hits.length / results.length),
    stopRate: _r2(stopHits.length / results.length),
    avgMFE: _r4(_avg(results.map(r => r.maxFavPct))),
    avgMAE: _r4(_avg(results.map(r => r.maxAdvPct))),
    avgDayToT1: t1Hits.length > 0 ? _r2(_avg(t1Hits.map(r => r.dayToT1))) : null,
    winRate: _r2(results.filter(r => r.result === "WIN" || r.result === "WIN_WITH_TOUCH").length / results.length),
  };
}

/**
 * Format stack backtest summary as human-readable report.
 * @param {object} summary
 * @returns {string}
 */
export function formatStackReport(summary) {
  const lines = [
    `\n  Stack Reversal Backtest Report`,
    `  ──────────────────────────────`,
    `  Events: ${summary.totalEvents}`,
    `  Avg score at trigger: ${summary.avgScore}`,
    `  Avg NVDA forward move: ${(summary.avgLeaderForwardMove * 100).toFixed(2)}%`,
    `  Follower picker accuracy: ${(summary.followerPickerAccuracy * 100).toFixed(0)}%`,
  ];

  if (Object.keys(summary.byStage).length > 0) {
    lines.push("");
    lines.push("  By stage:");
    for (const [stage, stats] of Object.entries(summary.byStage)) {
      lines.push(`    ${stage}: ${stats.count} events, NBIS T1 ${(stats.nbisT1Rate * 100).toFixed(0)}%, NEBX T1 ${(stats.nebxT1Rate * 100).toFixed(0)}%, avg NVDA ${(stats.avgLeaderMove * 100).toFixed(1)}%`);
    }
  }

  lines.push("");
  lines.push("  NBIS vs NEBX comparison:");
  for (const [sym, stats] of [["NBIS", summary.nbis], ["NEBX", summary.nebx]]) {
    if (stats.count === 0) continue;
    lines.push(`    ${sym}: ${stats.count} trades, T1 ${(stats.t1Rate * 100).toFixed(0)}%, T2 ${(stats.t2Rate * 100).toFixed(0)}%, T3 ${(stats.t3Rate * 100).toFixed(0)}%, stop ${(stats.stopRate * 100).toFixed(0)}%`);
    lines.push(`      MFE +${(stats.avgMFE * 100).toFixed(1)}%, MAE ${(stats.avgMAE * 100).toFixed(1)}%, avg days to T1: ${stats.avgDayToT1 ?? "—"}, win rate: ${(stats.winRate * 100).toFixed(0)}%`);
  }

  lines.push("");
  return lines.join("\n");
}

function _emptySummary() {
  return { totalEvents: 0, byStage: {}, nbis: { count: 0 }, nebx: { count: 0 }, followerPickerAccuracy: 0, avgLeaderForwardMove: 0, avgScore: 0 };
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function _r2(n) { return Math.round(n * 100) / 100; }
function _r4(n) { return Math.round(n * 10000) / 10000; }
function _avg(arr) { return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
