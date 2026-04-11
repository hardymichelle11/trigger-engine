// =====================================================
// PAIR EVALUATOR — leader/follower with 2x leverage
// =====================================================

import { validateInstrument, validateCrossAsset, getDistancePct, scoreDistance, runPairMonteCarlo, computeKellyLite } from "./shared.js";

export function evaluatePairSetup(setup, quotes, marketRegime, calibrated) {
  const leader = quotes[setup.leader.symbol];
  const follower = quotes[setup.follower.symbol];
  if (!leader || !follower) return { setup: setup.leader.symbol, state: "NO TRADE", error: "Missing feed" };

  const leaderCheck = validateInstrument(leader, setup.leader);
  const followerCheck = validateInstrument(follower, setup.follower);
  if (!leaderCheck.valid) return { kind: "pair", setup: `${setup.leader.symbol}/${setup.follower.symbol}`, state: "NO TRADE", error: "Bad leader", score: 0 };
  if (!followerCheck.valid) return { kind: "pair", setup: `${setup.leader.symbol}/${setup.follower.symbol}`, state: "NO TRADE", error: "Bad follower", score: 0 };

  const cross = validateCrossAsset(leader, follower);
  const leaderAbove = leader.last > (setup.leaderThreshold || 0);
  const distT1 = getDistancePct(follower.last, setup.targets[0]);
  const distStop = (follower.last - setup.stop) / follower.last;
  const leaderVol = calibrated?.symbols?.[setup.leader.symbol]?.vol ?? 0.065;

  let score = 0;
  if (leaderAbove) score += 25;
  if (cross.valid) score += 15;
  score += scoreDistance(distT1) * 25;
  if (leaderVol > 0.003) score += 10;
  if (marketRegime.state === "RISK-ON") score += 15;
  if (marketRegime.state === "RISK-OFF") score -= 20;
  score = Math.max(0, Math.min(100, score));

  const sim = runPairMonteCarlo(leader.last, follower.last, setup.targets, setup.stop, leaderVol);
  const kelly = computeKellyLite(sim.winProb);

  let state = "NO TRADE";
  if (score >= 75 && distT1 > 0 && marketRegime.state !== "RISK-OFF") state = "GO";
  else if (score >= 50) state = "WATCH";

  return {
    kind: "pair", setup: `${setup.leader.symbol}/${setup.follower.symbol}`, state, score,
    leaderPrice: leader.last, followerPrice: follower.last, leaderAbove, distT1, distStop,
    cross, ladderProbs: sim.ladderProbs, winProb: sim.winProb,
    suggestedSize: setup.capital * kelly, targets: setup.targets, stop: setup.stop,
    marketRegime: marketRegime.state, leaderVol,
  };
}
