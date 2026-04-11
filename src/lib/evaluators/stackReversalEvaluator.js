// =====================================================
// STACK REVERSAL EVALUATOR — NVDA → power → followers
// =====================================================

import { pctChange, avg, isTurningUp, groupStrength, getStage } from "./shared.js";

// Per-session state for tracking reversal flip time
const _stackState = {};

export function evaluateStackReversalSetup(setup, quotes, marketRegime, calibrated, SETUPS) {
  const leader = quotes[setup.leader.symbol];
  if (!leader || !leader.last) return { kind: "stack_reversal", setup: "NVDA_POWER_STACK", state: "NO TRADE", error: "Missing leader", score: 0 };

  const leaderMomentum = pctChange(leader);

  // Trend data from bars_1m (attached during calibration, may be absent)
  const trendData = calibrated?.trendData || {};

  // 1. DETECT STACK REVERSAL (uses real slope when available)
  const leaderUp = isTurningUp(leader, trendData[setup.leader.symbol]);

  const powerFeeds = setup.sector.map(s => quotes[s]).filter(Boolean);
  const powerStr = groupStrength(powerFeeds, trendData);

  const infraFeeds = setup.followers.map(s => quotes[s]).filter(Boolean);
  const infraStr = groupStrength(infraFeeds, trendData);

  const stackReversal = leaderUp && powerStr >= 0.5 && infraStr >= 0.5;

  const powerAvgMom = avg(powerFeeds.filter(f => f.prevClose > 0).map(f => pctChange(f)));
  const followerAvgMom = avg(infraFeeds.filter(f => f.prevClose > 0).map(f => pctChange(f)));

  // 2. DISTANCE-BASED STATE
  const nebx = quotes["NEBX"];
  const nbisNebxSetup = SETUPS?.NBIS_NEBX;
  let distToT1 = 0;
  if (nebx && nebx.last > 0 && nbisNebxSetup?.targets?.[0]) {
    distToT1 = ((nbisNebxSetup.targets[0] - nebx.last) / nebx.last) * 100;
  }

  const stage = stackReversal ? getStage(distToT1) : "NO SIGNAL";

  // 3. SCORING
  let score = 0;
  if (leaderUp) score += 40;
  else if (leaderMomentum > 0) score += 15;
  if (powerStr >= 0.5) score += 30;
  else if (powerStr > 0) score += 10;
  const lagSignal = followerAvgMom <= 0 || followerAvgMom < leaderMomentum * 0.5;
  if (lagSignal) score += 30;

  let scoreBoost = 0;
  if (stackReversal) scoreBoost += 20;
  if (stage === "EARLY") scoreBoost += 15;
  if (stage === "MID") scoreBoost += 5;
  if (stage === "LATE") scoreBoost -= 10;
  if (marketRegime.state === "RISK-ON") scoreBoost += 10;
  if (marketRegime.state === "RISK-OFF") scoreBoost -= 25;

  score = Math.max(0, Math.min(100, score + scoreBoost));

  // 4. ACTION
  let action = "WAIT";
  if (stackReversal && stage === "EARLY") action = "ENTER_AGGRESSIVE";
  else if (stackReversal && stage === "MID") action = "ENTER_NORMAL";
  else if (stackReversal && stage === "LATE") action = "TAKE_PROFIT_OR_SKIP";

  const targetWeights = {
    EARLY:       { t1: 1.0, t2: 1.0, t3: 1.0 },
    MID:         { t1: 1.0, t2: 0.85, t3: 0.65 },
    LATE:        { t1: 0.8, t2: 0.5, t3: 0.2 },
    "NO SIGNAL": { t1: 0, t2: 0, t3: 0 },
  }[stage];

  // 5. STATE
  let state = "NO TRADE";
  if (score >= 75) state = "GO";
  else if (score >= 60) state = "WATCH";

  // Flip time tracking
  const stateKey = setup.leader.symbol + "_flip";
  const now = Date.now();
  if (stackReversal && !_stackState[stateKey]) _stackState[stateKey] = now;
  if (!stackReversal && !leaderUp) _stackState[stateKey] = null;
  const flipTime = _stackState[stateKey];
  const minutesSinceFlip = flipTime ? Math.round((now - flipTime) / 60000) : null;

  // Best follower
  let bestFollower = null;
  let bestFollowerReason = "";
  const nebxFeed = quotes["NEBX"];
  const nbisFeed = quotes["NBIS"];
  if (nebxFeed && nbisFeed) {
    const nebxLag = leaderMomentum - pctChange(nebxFeed);
    const nbisLag = leaderMomentum - pctChange(nbisFeed);
    if (nebxLag > nbisLag) {
      bestFollower = "NEBX";
      bestFollowerReason = "lag + high beta + confirmed stack";
    } else {
      bestFollower = "NBIS";
      bestFollowerReason = "lag + direct exposure";
    }
  }

  const label = stackReversal ? `STACK_REVERSAL_${stage}` : "NO_STACK_SIGNAL";

  // Trend metadata for display
  const leaderTrend = trendData[setup.leader.symbol];
  const slopeSource = leaderTrend?.available ? "bars_1m" : "intraday_proxy";

  return {
    kind: "stack_reversal", setup: "NVDA_POWER_STACK", state, score, stage, action, label,
    stackReversal, scoreBoost,
    leaderPrice: leader.last, leaderMomentum, leaderSignal: leaderUp,
    powerStrength: powerStr, sectorStrength: powerAvgMom, sectorSignal: powerStr >= 0.5,
    sectorSymbols: setup.sector,
    followerAvg: followerAvgMom, lagSignal, followers: setup.followers,
    distToT1, minutesSinceFlip, targetWeights,
    bestFollower, bestFollowerReason,
    marketRegime: marketRegime.state, change: leaderMomentum,
    slopeSource,
    leaderSlope: leaderTrend?.slope ?? null,
    leaderSlopeR2: leaderTrend?.r2 ?? null,
    leaderSlopeConfidence: leaderTrend?.confidence ?? null,
  };
}
