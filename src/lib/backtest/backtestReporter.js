// =====================================================
// BACKTEST REPORTER — aggregate outcomes into stats
// =====================================================

/**
 * @typedef {object} BacktestSummary
 * @property {number} totalTrades
 * @property {number} wins
 * @property {number} losses
 * @property {number} scratches
 * @property {number} winRate
 * @property {number} avgPnlPct
 * @property {number} avgMaxFavExcursion
 * @property {number} avgMaxAdvExcursion
 * @property {number} touchRate — % of trades where strike was touched
 * @property {number} avgDaysToProfitTarget — avg days to 50% profit (trades that hit it)
 * @property {object} bySymbol — { symbol: summary }
 */

/**
 * Generate summary statistics from backtest outcomes.
 * @param {import('./backtestEngine.js').TradeOutcome[]} outcomes
 * @returns {BacktestSummary}
 */
export function summarizeBacktest(outcomes) {
  if (!outcomes || outcomes.length === 0) {
    return _emptySummary();
  }

  const completed = outcomes.filter(o => o.result !== "OPEN");
  if (completed.length === 0) return _emptySummary();

  const wins = completed.filter(o => o.result === "WIN");
  const losses = completed.filter(o => o.result === "LOSS");
  const scratches = completed.filter(o => o.result === "SCRATCH");
  const touched = completed.filter(o => o.touchedStrike);
  const profitHits = completed.filter(o => o.daysToProfitTarget !== null);

  return {
    totalTrades: completed.length,
    wins: wins.length,
    losses: losses.length,
    scratches: scratches.length,
    winRate: _r2(wins.length / completed.length),
    avgPnlPct: _r4(_avg(completed.map(o => o.pnlPct))),
    avgMaxFavExcursion: _r4(_avg(completed.map(o => o.maxFavorableExcursion))),
    avgMaxAdvExcursion: _r4(_avg(completed.map(o => o.maxAdverseExcursion))),
    touchRate: _r2(touched.length / completed.length),
    avgDaysToProfitTarget: profitHits.length > 0 ? _r2(_avg(profitHits.map(o => o.daysToProfitTarget))) : null,
    bySymbol: _groupBySymbol(completed),
  };
}

/**
 * Compare two backtest runs (e.g., different thresholds).
 * @param {BacktestSummary} baseline
 * @param {BacktestSummary} variant
 * @returns {object} delta comparison
 */
export function compareBacktests(baseline, variant) {
  return {
    totalTradesDelta: variant.totalTrades - baseline.totalTrades,
    winRateDelta: _r4(variant.winRate - baseline.winRate),
    avgPnlDelta: _r4(variant.avgPnlPct - baseline.avgPnlPct),
    touchRateDelta: _r4(variant.touchRate - baseline.touchRate),
    avgDDDelta: _r4(variant.avgMaxAdvExcursion - baseline.avgMaxAdvExcursion),
    tradeCountChange: `${baseline.totalTrades} → ${variant.totalTrades}`,
    winRateChange: `${(baseline.winRate * 100).toFixed(1)}% → ${(variant.winRate * 100).toFixed(1)}%`,
  };
}

/**
 * Format summary as a human-readable report string.
 * @param {BacktestSummary} summary
 * @param {string} [label]
 * @returns {string}
 */
export function formatReport(summary, label = "Backtest") {
  const lines = [
    `\n  ${label} Report`,
    `  ${"─".repeat(label.length + 7)}`,
    `  Trades: ${summary.totalTrades} (${summary.wins}W / ${summary.losses}L / ${summary.scratches}S)`,
    `  Win rate: ${(summary.winRate * 100).toFixed(1)}%`,
    `  Avg P&L: ${(summary.avgPnlPct * 100).toFixed(2)}%`,
    `  Touch rate: ${(summary.touchRate * 100).toFixed(1)}%`,
    `  Avg max favorable: +${(summary.avgMaxFavExcursion * 100).toFixed(2)}%`,
    `  Avg max adverse: ${(summary.avgMaxAdvExcursion * 100).toFixed(2)}%`,
  ];

  if (summary.avgDaysToProfitTarget != null) {
    lines.push(`  Avg days to profit target: ${summary.avgDaysToProfitTarget}`);
  }

  // Per-symbol breakdown
  if (summary.bySymbol && Object.keys(summary.bySymbol).length > 1) {
    lines.push("");
    lines.push("  Per symbol:");
    for (const [sym, stats] of Object.entries(summary.bySymbol)) {
      lines.push(`    ${sym}: ${stats.totalTrades} trades, ${(stats.winRate * 100).toFixed(0)}% win, ${(stats.touchRate * 100).toFixed(0)}% touch`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function _avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function _r2(n) { return Math.round(n * 100) / 100; }
function _r4(n) { return Math.round(n * 10000) / 10000; }

function _groupBySymbol(outcomes) {
  const groups = {};
  for (const o of outcomes) {
    if (!groups[o.symbol]) groups[o.symbol] = [];
    groups[o.symbol].push(o);
  }

  const result = {};
  for (const [sym, trades] of Object.entries(groups)) {
    const wins = trades.filter(t => t.result === "WIN");
    const touched = trades.filter(t => t.touchedStrike);
    result[sym] = {
      totalTrades: trades.length,
      wins: wins.length,
      losses: trades.filter(t => t.result === "LOSS").length,
      winRate: _r2(wins.length / trades.length),
      touchRate: _r2(touched.length / trades.length),
      avgPnlPct: _r4(_avg(trades.map(t => t.pnlPct))),
    };
  }
  return result;
}

function _emptySummary() {
  return {
    totalTrades: 0, wins: 0, losses: 0, scratches: 0,
    winRate: 0, avgPnlPct: 0,
    avgMaxFavExcursion: 0, avgMaxAdvExcursion: 0,
    touchRate: 0, avgDaysToProfitTarget: null,
    bySymbol: {},
  };
}
