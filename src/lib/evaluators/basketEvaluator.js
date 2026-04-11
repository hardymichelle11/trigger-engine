// =====================================================
// BASKET EVALUATOR — leader ETF vs driver components
// =====================================================

import { validateInstrument, pctChange } from "./shared.js";

export function evaluateBasketSetup(setup, quotes, marketRegime, calibrated) {
  const leader = quotes[setup.leader.symbol];
  if (!leader) return { setup: setup.leader.symbol, state: "NO TRADE", error: "Missing feed", score: 0 };
  const check = validateInstrument(leader, setup.leader);
  if (!check.valid) return { kind: "basket", setup: setup.leader.symbol, state: "NO TRADE", error: "Bad feed", score: 0 };

  const driverChanges = setup.drivers.map(sym => quotes[sym]).filter(Boolean).map(d => pctChange(d));
  const avgDriverChange = driverChanges.length > 0 ? driverChanges.reduce((a, b) => a + b, 0) / driverChanges.length : 0;
  const leaderChange = pctChange(leader);

  let score = 50;
  if (avgDriverChange > 0.005 && leaderChange < avgDriverChange) score += 20;
  if (avgDriverChange < -0.005) score -= 20;
  if (marketRegime.state === "RISK-ON") score += 15;
  if (marketRegime.state === "RISK-OFF") score -= 20;
  score = Math.max(0, Math.min(100, score));

  let state = "NO TRADE";
  if (score >= 70 && marketRegime.state !== "RISK-OFF") state = "GO";
  else if (score >= 50) state = "WATCH";

  return { kind: "basket", setup: setup.leader.symbol, state, score, leaderPrice: leader.last, leaderChange, avgDriverChange, drivers: setup.drivers, marketRegime: marketRegime.state };
}
