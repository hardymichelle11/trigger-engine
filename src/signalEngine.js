// =====================================================
// CREDIT-VOLATILITY OPTIONS ENGINE — barrel file
// Re-exports all modules. Orchestrators live here.
// =====================================================

// Re-export config + utils
export { CONFIG, pctChange, round2, safeNumber, midpoint } from "./lib/engine/config.js";

// Re-export modules
export { evaluateMarketRegime, evaluateMarketRegimeV2, getTradingWindow } from "./lib/engine/macroRegime.js";
export { classifyTiming, scoreSetup, interpretSentiment, chooseAction } from "./lib/engine/setupScoring.js";
export { selectPutLadder } from "./lib/engine/strikeSelection.js";
export { buildProfitPlan } from "./lib/engine/profitManagement.js";
export { buildRollPlan } from "./lib/engine/defenseLogic.js";
export { estimateProbability, monteCarloEstimate } from "./lib/engine/probabilityLayer.js";

// Re-export live state engine
export { shouldRecalculate, getFreshnessStatus, renderSafeCardState, buildLiveState, mcCacheValid, extractLiveMarketState, buildDynamicTargets, isAlertSafe, enableDebugMode, getRecalcLog, clearRecalcLog, RECALC_THRESHOLDS, RECALC_REASON_CODES } from "./lib/engine/liveStateEngine.js";
export { computeFreshnessMetrics, computeRecalcAnalytics, computeInvalidationAnalytics, getHealthSnapshot } from "./lib/engine/recalcMonitor.js";

// Local imports for orchestrators
import { CONFIG, round2, safeNumber, midpoint } from "./lib/engine/config.js";
import { evaluateMarketRegime, getTradingWindow } from "./lib/engine/macroRegime.js";
import { scoreSetup, interpretSentiment, chooseAction } from "./lib/engine/setupScoring.js";
import { selectPutLadder } from "./lib/engine/strikeSelection.js";
import { estimateProbability } from "./lib/engine/probabilityLayer.js";
import { buildLiveState } from "./lib/engine/liveStateEngine.js";

// --------------------------------------------------
// SECTION 12: TRADE RECOMMENDATION OUTPUT
// --------------------------------------------------

export function buildTradeRecommendation(setup, market) {
  const scored = scoreSetup(setup, market);
  const actionResult = chooseAction(setup, scored, market);
  const ladder = selectPutLadder(setup);
  const tradingWindow = getTradingWindow();
  const sentiment = interpretSentiment({
    putCallRatio: setup.putCallRatio,
    ivPercentile: setup.ivPercentile,
    creditStress: market.creditStress,
  });

  const prob = ladder.primary ? estimateProbability({
    price: setup.price,
    strike: ladder.primary,
    dte: 7,
    ivPercentile: setup.ivPercentile,
    atrExpansionMultiple: setup.atrExpansionMultiple,
  }) : null;

  let riskLevel = "LOW";
  if (market.creditStress || scored.timing.stage === "LATE") riskLevel = "MED";
  if (market.creditStress && market.fearSpike) riskLevel = "HIGH";
  if (scored.timing.stage === "EXHAUSTED") riskLevel = "HIGH";

  let finalAction = actionResult.action;
  if (finalAction === "SELL_PUTS" && prob && !prob.passesFilter) {
    finalAction = "WAIT";
    actionResult.reason += ` (probability ${(prob.probAboveStrike * 100).toFixed(0)}% below ${CONFIG.setup.minProbability * 100}% threshold)`;
  }

  return {
    trade: finalAction === "SELL_PUTS" ? "YES" : "NO",
    action: finalAction,
    strike: ladder.primary,
    strikeAlt: ladder.secondary,
    expiration: `${CONFIG.execution.dteMin}-${CONFIG.execution.dteMax} DTE`,
    premium: midpoint(setup.bid, setup.ask),
    probability: prob ? `${(prob.probAboveStrike * 100).toFixed(1)}%` : "N/A",
    riskLevel,
    reason: actionResult.reason,
    sentiment: sentiment.interpretation,
    window: tradingWindow.window,
  };
}

// --------------------------------------------------
// NARRATIVE BUILDER
// --------------------------------------------------

function buildNarrative(setup, market, scored, actionResult, ladder) {
  const lines = [];

  lines.push(`${setup.symbol}: score ${scored.score} (${scored.signal})`);
  lines.push(`Stage: ${scored.timing.stage}`);
  lines.push(`Regime: ${market.mode}`);
  lines.push(`Leader ${scored.diagnostics.leaderTurningUp ? "turning up" : "not confirmed"}`);
  lines.push(`Power ${scored.diagnostics.powerConfirm ? "confirmed" : "not confirmed"}`);

  if (scored.timing.stage === "EXHAUSTED") {
    lines.push("WARNING: overextended move — do not chase.");
  }

  if (actionResult.action === "SELL_PUTS" && ladder.primary && ladder.secondary) {
    lines.push(`Best action: sell put ladder ${ladder.secondary}/${ladder.primary}.`);
  } else {
    lines.push(`Action: ${actionResult.action}. ${actionResult.reason}`);
  }

  return lines.join(" ");
}

// --------------------------------------------------
// UI CARD BUILDER
// --------------------------------------------------

export function buildUiCard(setup, market) {
  const scored = scoreSetup(setup, market);
  const actionResult = chooseAction(setup, scored, market);
  const ladder = selectPutLadder(setup);
  const narrative = buildNarrative(setup, market, scored, actionResult, ladder);
  const recommendation = buildTradeRecommendation(setup, market);

  const prob = ladder.primary ? estimateProbability({
    price: setup.price,
    strike: ladder.primary,
    dte: 7,
    ivPercentile: setup.ivPercentile,
    atrExpansionMultiple: setup.atrExpansionMultiple,
  }) : null;

  // Chart context integration: if setup carries chartContext, merge its adjustments
  const chartCtx = setup.chartContext || null;
  let finalScore = scored.score;
  let combinedTrace = [...(scored.scoreTrace || [])];

  if (chartCtx && chartCtx.enabled && chartCtx.chartScoreAdjustments !== 0) {
    finalScore = Math.max(0, Math.min(100, scored.score + chartCtx.chartScoreAdjustments));
    combinedTrace = [...combinedTrace, ...chartCtx.scoreTrace];
  }

  // Re-evaluate signal if chart context shifted the score
  let finalSignal = scored.signal;
  if (finalScore !== scored.score) {
    if (finalScore >= 75) finalSignal = "GO";
    else if (finalScore >= 55) finalSignal = "WATCH";
    else finalSignal = "NO_TRADE";
  }

  // Market type classification from setupBehavior or category
  const marketType = setup.setupBehavior || (setup.category === "CREDIT" ? "INCOME" : setup.category === "ETF" ? "RANGE" : null);
  const strategyMap = { MOMENTUM: "Breakout / follow trend", RANGE: "Sell puts at support / mean reversion", INCOME: "Covered calls / dividend — avoid active selling", HYBRID: "Buy dip + sell premium", FOLLOWER: "Lag entry after leader confirms" };
  const strategy = marketType ? (strategyMap[marketType] || null) : null;

  return {
    id: `${setup.symbol}_${Date.now()}`,
    symbol: setup.symbol,
    name: setup.name || setup.symbol,
    category: setup.category || "HIGH_IV",
    marketType: marketType || null,
    strategy: strategy || null,
    price: round2(setup.price),
    score: finalScore,
    baselineScore: scored.score,
    signal: finalSignal,
    stage: scored.timing.stage,
    regime: market.mode,
    action: actionResult.action,
    reason: actionResult.reason,
    ladder,
    recommendation,
    probability: prob,
    watchlist: scored.watchlist,
    chartContext: chartCtx ? {
      nearestSupportPct: chartCtx.nearestSupportPct,
      nearestResistancePct: chartCtx.nearestResistancePct,
      insideDemandZone: chartCtx.insideDemandZone,
      insideSupplyZone: chartCtx.insideSupplyZone,
      atrExtension: chartCtx.atrContext?.extensionState,
      trendBias: chartCtx.swingStructure?.trendBias,
      structureEvent: chartCtx.swingStructure?.lastStructureEvent,
      adjustments: chartCtx.chartScoreAdjustments,
      confidence: chartCtx.confidence,
      roomToTarget: chartCtx.roomToTarget,
    } : null,
    metrics: {
      atrExpansionMultiple: round2(setup.atrExpansionMultiple),
      ivPercentile: safeNumber(setup.ivPercentile),
      ivSource: setup.ivSource || "unknown",
      ivConfidence: setup.ivConfidence || "low",
      distT1Pct: round2(setup.distT1Pct),
      leaderMovePct: round2(setup.leaderMovePct),
      powerMovePct: round2(setup.powerMovePct),
      followerMovePct: round2(setup.followerMovePct),
      midpoint: midpoint(setup.bid, setup.ask),
      putCallRatio: safeNumber(setup.putCallRatio),
    },
    diagnostics: scored.diagnostics,
    scoreTrace: combinedTrace,
    narrative,
    // Regime context for calibration tracking (V2 fields)
    regimeContext: market.engineVersion === 2 ? {
      regime: market.mode,
      bias: market.sellPutsAction || market.bias,
      regimeScore: market.regimeScore,
      confidence: typeof market.confidence === "object" ? market.confidence.label : market.confidence,
      vixState: market.vixState,
      earlyStress: market.flags?.earlyStress ?? false,
      componentScores: market.componentScores || null,
    } : null,
    // Live state — recalibration metadata for freshness tracking
    liveState: buildLiveState({
      price: setup.price,
      leaderPrice: setup.leaderPrice || setup.price,
      ivPercentile: setup.ivPercentile,
      atrExpansion: setup.atrExpansionMultiple,
      regime: market.mode,
      regimeScore: market.regimeScore,
      vixState: market.vixState,
      staticTargets: setup.targets || null,
      staticStop: setup.stop || null,
      isLeveraged: setup.isLeveraged || false,
      leverageGap: setup.leverageGap ?? null,
    }),
  };
}

// --------------------------------------------------
// MAIN ENGINE
// --------------------------------------------------

export function buildScannerState({ marketInputs, setups }) {
  const market = evaluateMarketRegime(marketInputs);
  const tradingWindow = getTradingWindow();
  const cards = (setups || []).map((s) => buildUiCard(s, market));

  cards.sort((a, b) => b.score - a.score);

  const goCards = cards.filter((c) => c.signal === "GO");
  const watchCards = cards.filter((c) => c.signal === "WATCH");

  return {
    market,
    tradingWindow,
    summary: {
      totalSetups: cards.length,
      go: goCards.length,
      watch: watchCards.length,
      noTrade: cards.filter((c) => c.signal === "NO_TRADE").length,
      topAction: goCards.length > 0 ? goCards[0].action : "WAIT",
    },
    cards,
  };
}
