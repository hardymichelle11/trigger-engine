// =====================================================
// STANDALONE EVALUATOR — single instrument + regime
// =====================================================

import { validateInstrument, pctChange } from "./shared.js";

export function evaluateStandaloneSetup(setup, quotes, marketRegime, calibrated) {
  const leader = quotes[setup.leader.symbol];
  if (!leader) return { setup: setup.leader.symbol, state: "NO TRADE", error: "Missing feed", score: 0 };
  const check = validateInstrument(leader, setup.leader);
  if (!check.valid) return { kind: "standalone", setup: setup.leader.symbol, state: "NO TRADE", error: "Bad feed", score: 0 };

  const vol = calibrated?.symbols?.[setup.leader.symbol]?.vol ?? 0;
  const change = pctChange(leader);

  let score = 50;
  if (vol > 0.002) score += 10;
  if (change > 0.01) score += 15;
  if (marketRegime.state === "RISK-ON") score += 15;
  if (marketRegime.state === "RISK-OFF") score -= 20;
  score = Math.max(0, Math.min(100, score));

  let state = "NO TRADE";
  if (score >= 70 && marketRegime.state !== "RISK-OFF") state = "GO";
  else if (score >= 50) state = "WATCH";

  return { kind: "standalone", setup: setup.leader.symbol, state, score, leaderPrice: leader.last, change, vol, marketRegime: marketRegime.state };
}
