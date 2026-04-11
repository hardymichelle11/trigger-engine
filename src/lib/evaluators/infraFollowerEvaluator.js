// =====================================================
// INFRA FOLLOWER EVALUATOR — BE lags AI + infra cluster
// =====================================================

import { pctChange, avg, runBEInfraMonteCarlo, computeKellyLite } from "./shared.js";

export function evaluateInfraFollowerSetup(setup, quotes, marketRegime, calibrated) {
  const be = quotes[setup.follower.symbol];
  if (!be || !be.last) return { kind: "infra_follower", setup: "BE_INFRA", state: "NO TRADE", error: "Missing feed", score: 0 };

  // Trend data from bars_1m (may be absent)
  const trendData = calibrated?.trendData || {};

  const aiFeeds = setup.aiLeaders.map(s => quotes[s]).filter(Boolean);
  const infraFeeds = setup.infraDrivers.map(s => quotes[s]).filter(Boolean);
  const partnerFeeds = (setup.strategicPartners || []).map(s => quotes[s]).filter(Boolean);

  const aiChanges = aiFeeds.filter(f => f.prevClose > 0).map(f => pctChange(f));
  const infraChanges = infraFeeds.filter(f => f.prevClose > 0).map(f => pctChange(f));
  const partnerChanges = partnerFeeds.filter(f => f.prevClose > 0).map(f => pctChange(f));

  const aiStrength = avg(aiChanges);
  const infraStrength = avg(infraChanges);
  const partnerStrength = partnerChanges.length ? avg(partnerChanges) : 0;
  const beMove = pctChange(be);

  const clusterStrength = avg([aiStrength, infraStrength, partnerStrength].filter(x => Number.isFinite(x)));
  const lagAmount = clusterStrength - beMove;
  const lagging = lagAmount >= (setup.lagThreshold || 0.0075);

  const beTargets = (setup.targetsPct || [0.04, 0.07, 0.10]).map(p => be.last * (1 + p));
  const beStop = be.last * (1 - (setup.stopPct || 0.04));

  let score = 0;
  if (aiStrength > 0.01) score += 25;
  else if (aiStrength > 0.003) score += 10;
  if (infraStrength > 0.01) score += 25;
  else if (infraStrength > 0.003) score += 10;
  if (lagging) score += 25;
  else if (lagAmount > 0) score += 10;
  if (marketRegime.state === "RISK-ON") score += 15;
  if (marketRegime.state === "RISK-OFF") score -= 20;

  // Trend-based bonus: if AI leaders have confirmed uptrend from bars_1m,
  // the lag thesis is stronger — cluster is genuinely moving, not just noise
  const aiTrendConfirmed = setup.aiLeaders.some(sym => {
    const t = trendData[sym];
    return t?.available && t.turningUp && t.confidence !== "low";
  });
  if (aiTrendConfirmed) score += 5;

  score = Math.max(0, Math.min(100, score));

  const sim = runBEInfraMonteCarlo(be.last, aiStrength, infraStrength, setup.targetsPct || [0.04, 0.07, 0.10], setup.stopPct || 0.04);
  const kelly = computeKellyLite(sim.winProb);

  let state = "NO TRADE";
  if (score >= 70 && marketRegime.state !== "RISK-OFF") state = "GO";
  else if (score >= 50) state = "WATCH";

  // Trend metadata
  const beTrend = trendData[setup.follower.symbol];
  const slopeSource = beTrend?.available ? "bars_1m" : "none";

  return {
    kind: "infra_follower", setup: "BE_INFRA", state, score,
    leaderPrice: be.last, change: beMove,
    aiStrength, infraStrength, partnerStrength, clusterStrength,
    lagAmount, lagging, targets: beTargets, stop: beStop,
    ladderProbs: sim.ladderProbs, winProb: sim.winProb,
    suggestedSize: setup.capital * kelly,
    aiLeaders: setup.aiLeaders, infraDrivers: setup.infraDrivers,
    marketRegime: marketRegime.state,
    aiTrendConfirmed,
    slopeSource,
    followerSlope: beTrend?.slope ?? null,
  };
}
