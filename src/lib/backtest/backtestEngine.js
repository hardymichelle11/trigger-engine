// =====================================================
// BACKTEST ENGINE — replay historical setups + measure outcomes
// =====================================================
// Takes a historical alert snapshot (symbol, price, strike, DTE,
// credit, alert gates) and a forward price series, then measures
// what actually happened. Pure functions — no side effects.
//
// v1 scope: alert-driven backtesting only.
// Future: BQ query for real bars, multi-day position tracking.
// =====================================================

// --------------------------------------------------
// TRADE OUTCOME EVALUATION
// --------------------------------------------------

/**
 * @typedef {object} TradeSetup
 * @property {string} symbol
 * @property {number} entryPrice — stock price at alert time
 * @property {number} strike — put strike sold
 * @property {number} credit — premium received per contract
 * @property {number} dte — days to expiration at entry
 * @property {number} score — scanner score at alert time
 * @property {string} action — SELL_PUTS, BUY_SHARES, etc.
 * @property {object} [alertResult] — full AlertResult for gate analysis
 * @property {object} [probability] — MC output at entry
 * @property {string} [entryDate] — ISO date
 */

/**
 * @typedef {object} TradeOutcome
 * @property {string} symbol
 * @property {string} result — "WIN" | "LOSS" | "SCRATCH" | "OPEN"
 * @property {boolean} expiredAboveStrike — price > strike at expiry
 * @property {boolean} touchedStrike — price touched strike during DTE
 * @property {number} touchDay — day (0-based) when strike was first touched, or -1
 * @property {number} maxFavorableExcursion — best unrealized gain (as % of entry)
 * @property {number} maxAdverseExcursion — worst drawdown (as % of entry)
 * @property {number} finalPrice — price at expiry
 * @property {number} pnlPct — % P&L based on credit vs max loss
 * @property {number|null} daysToProfitTarget — days until 50% profit, or null
 * @property {number} dteAtEntry
 * @property {object} setup — original TradeSetup
 */

/**
 * Evaluate a single trade outcome given forward price bars.
 *
 * @param {TradeSetup} setup — the trade at alert time
 * @param {number[]} forwardPrices — daily close prices from entry through expiry (length = DTE + 1, index 0 = entry day)
 * @param {object} [options]
 * @param {number} [options.profitTargetPct] — BTC target as % of credit (default 0.5 = 50%)
 * @returns {TradeOutcome}
 */
export function evaluateTradeOutcome(setup, forwardPrices, options = {}) {
  const profitTargetPct = options.profitTargetPct ?? 0.5;

  if (!forwardPrices || forwardPrices.length < 2) {
    return _openResult(setup);
  }

  const entryPrice = setup.entryPrice;
  const strike = setup.strike;
  const credit = setup.credit || 0;

  let touchedStrike = false;
  let touchDay = -1;
  let maxFav = 0;   // best case: stock goes UP (away from strike)
  let maxAdv = 0;   // worst case: stock goes DOWN (toward strike)
  let daysToProfitTarget = null;

  for (let i = 1; i < forwardPrices.length; i++) {
    const price = forwardPrices[i];
    const movePct = (price - entryPrice) / entryPrice;

    // For put selling: favorable = price moves UP (away from strike)
    if (movePct > maxFav) maxFav = movePct;
    // Adverse = price moves DOWN (toward strike)
    if (movePct < maxAdv) maxAdv = movePct;

    // Strike touch
    if (!touchedStrike && price <= strike) {
      touchedStrike = true;
      touchDay = i;
    }

    // Profit target: price moved far enough above entry that put decayed ~50%
    // Approximate: stock up > 2% from entry within first half of DTE = premium decayed significantly
    if (daysToProfitTarget === null && movePct > 0.02 && i < forwardPrices.length * 0.6) {
      daysToProfitTarget = i;
    }
  }

  const finalPrice = forwardPrices[forwardPrices.length - 1];
  const expiredAboveStrike = finalPrice > strike;

  // P&L: for put selling
  // Win = keep credit (expired above strike)
  // Loss = (strike - finalPrice) - credit (assigned below strike)
  let pnlPct;
  if (expiredAboveStrike) {
    pnlPct = credit > 0 ? 1.0 : 0; // kept full premium
  } else {
    const intrinsicLoss = strike - finalPrice;
    pnlPct = credit > 0 ? (credit - intrinsicLoss) / credit : -1;
  }

  let result;
  if (expiredAboveStrike) result = "WIN";
  else if (pnlPct > -0.1) result = "SCRATCH";
  else result = "LOSS";

  return {
    symbol: setup.symbol,
    result,
    expiredAboveStrike,
    touchedStrike,
    touchDay,
    maxFavorableExcursion: _r4(maxFav),
    maxAdverseExcursion: _r4(maxAdv),
    finalPrice: _r2(finalPrice),
    pnlPct: _r4(pnlPct),
    daysToProfitTarget,
    dteAtEntry: setup.dte,
    setup,
  };
}

// --------------------------------------------------
// BATCH BACKTEST
// --------------------------------------------------

/**
 * Run backtest on multiple trade setups.
 *
 * @param {object[]} trades — array of { setup: TradeSetup, forwardPrices: number[] }
 * @param {object} [options] — { profitTargetPct }
 * @returns {TradeOutcome[]}
 */
export function runBacktest(trades, options = {}) {
  return trades.map(t => evaluateTradeOutcome(t.setup, t.forwardPrices, options));
}

// --------------------------------------------------
// ALERT GATE REPLAY
// --------------------------------------------------
// Re-evaluates whether alert gates would have fired on
// historical data, without needing the full scanner pipeline.

/**
 * Check if a historical setup would have triggered an alert.
 *
 * @param {object} historicalCard — card-shaped object with score, action, probability, metrics
 * @param {object} [thresholds] — alert thresholds (uses DEFAULT if omitted)
 * @returns {{ wouldAlert: boolean, gateResults: object }}
 */
export function replayAlertGates(historicalCard, thresholds = {}) {
  const t = {
    minScore: 75,
    minScoreWatch: 60,
    minProbAboveStrike: 0.65,
    maxTouchProb: 0.40,
    maxAvgDrawdown: 0.08,
    minIvPercentile: 50,
    alertActions: ["SELL_PUTS", "SELL_PUTS_CONSERVATIVE", "BUY_SHARES"],
    ...thresholds,
  };

  const gates = {};
  gates.score = historicalCard.score >= t.minScoreWatch;
  gates.action = t.alertActions.includes(historicalCard.action);

  const prob = historicalCard.probability;
  if (prob && prob.method === "monte_carlo") {
    gates.probAbove = prob.probAboveStrike >= t.minProbAboveStrike;
    gates.touchProb = prob.probTouch <= t.maxTouchProb;
    gates.drawdown = prob.avgMaxDrawdown == null || prob.avgMaxDrawdown <= t.maxAvgDrawdown;
  } else {
    gates.probAbove = true;
    gates.touchProb = true;
    gates.drawdown = true;
  }

  gates.ivLevel = (historicalCard.metrics?.ivPercentile ?? 0) >= t.minIvPercentile;
  gates.ivConfidence = historicalCard.metrics?.ivConfidence !== "none";

  const wouldAlert = Object.values(gates).every(Boolean);

  return { wouldAlert, gateResults: gates };
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function _r2(n) { return Math.round(n * 100) / 100; }
function _r4(n) { return Math.round(n * 10000) / 10000; }

function _openResult(setup) {
  return {
    symbol: setup.symbol,
    result: "OPEN",
    expiredAboveStrike: false,
    touchedStrike: false,
    touchDay: -1,
    maxFavorableExcursion: 0,
    maxAdverseExcursion: 0,
    finalPrice: setup.entryPrice,
    pnlPct: 0,
    daysToProfitTarget: null,
    dteAtEntry: setup.dte,
    setup,
  };
}
