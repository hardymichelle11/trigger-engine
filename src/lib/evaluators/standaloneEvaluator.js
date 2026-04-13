// =====================================================
// STANDALONE EVALUATOR — single instrument + regime
// =====================================================
// Enhanced with market classification (RANGE/MOMENTUM/
// HYBRID/INCOME), trade narrative, target validation,
// and timing-aware scoring.
// =====================================================

import { validateInstrument, pctChange, computeRealizedVolFromRange } from "./shared.js";

// --------------------------------------------------
// MARKET TYPE CLASSIFICATION
// --------------------------------------------------

function classifyMarketType({ trendStrength, atrExpansion, setupBehavior }) {
  // If setup has explicit behavior override, use it
  if (setupBehavior === "INCOME") return "INCOME";
  if (setupBehavior === "MOMENTUM") return "MOMENTUM";
  if (setupBehavior === "RANGE") return "RANGE";

  // Dynamic classification from price action
  if (trendStrength > 0.6 && atrExpansion > 0.5) return "MOMENTUM";
  if (trendStrength < 0.4 && atrExpansion > 0.4) return "RANGE";
  return "HYBRID";
}

function getTradeStrategy(marketType) {
  switch (marketType) {
    case "MOMENTUM": return "BREAKOUT / BUY CALLS / FOLLOW LEADER";
    case "RANGE":    return "SELL PUTS AT SUPPORT / MEAN REVERSION";
    case "HYBRID":   return "BUY DIP + SELL PREMIUM";
    case "INCOME":   return "COVERED CALLS / DIVIDEND CAPTURE — AVOID ACTIVE OPTIONS SELLING";
    default:         return "NO TRADE";
  }
}

// --------------------------------------------------
// TRADE NARRATIVE BUILDER
// --------------------------------------------------

function buildNarrative({ symbol, marketType, strategy, change, vol, regime, price, targets, distT1Pct }) {
  const lines = [];

  lines.push(`${symbol}: classified as ${marketType}.`);
  lines.push(`Strategy: ${strategy}.`);

  if (change > 0.02) lines.push(`Strong momentum today (+${(change * 100).toFixed(1)}%).`);
  else if (change > 0) lines.push(`Modest upside (+${(change * 100).toFixed(1)}%).`);
  else if (change < -0.02) lines.push(`Under pressure (${(change * 100).toFixed(1)}%).`);
  else lines.push(`Flat price action (${(change * 100).toFixed(1)}%).`);

  if (vol > 0.03) lines.push("Elevated intraday volatility — wider ranges expected.");
  else if (vol > 0.015) lines.push("Normal volatility — standard positioning.");
  else lines.push("Low volatility — tight ranges, consider patience.");

  if (targets && targets.length > 0 && distT1Pct != null) {
    if (distT1Pct > 3) lines.push(`T1 at $${targets[0]} is ${distT1Pct.toFixed(1)}% away — early stage, room to enter.`);
    else if (distT1Pct > 1) lines.push(`T1 at $${targets[0]} is ${distT1Pct.toFixed(1)}% away — mid stage.`);
    else if (distT1Pct > 0) lines.push(`T1 at $${targets[0]} is ${distT1Pct.toFixed(1)}% away — approaching target.`);
    else lines.push(`Price has passed T1 ($${targets[0]}) — consider taking profit.`);
  }

  if (marketType === "INCOME") {
    lines.push("Low premium environment — avoid active put selling unless collateral return justifies it.");
  }

  if (regime === "RISK-OFF") lines.push("Risk-off regime — reduced positioning recommended.");
  else if (regime === "RISK-ON") lines.push("Risk-on regime supports entry.");

  return lines.join(" ");
}

// --------------------------------------------------
// MAIN EVALUATOR
// --------------------------------------------------

export function evaluateStandaloneSetup(setup, quotes, marketRegime, calibrated) {
  const sym = setup.leader.symbol;
  const leader = quotes[sym];
  if (!leader) return { kind: "standalone", setup: sym, state: "NO TRADE", error: "Missing feed", score: 0 };

  const check = validateInstrument(leader, setup.leader);
  if (!check.valid) return { kind: "standalone", setup: sym, state: "NO TRADE", error: "Bad feed", score: 0 };

  const vol = calibrated?.symbols?.[sym]?.vol ?? computeRealizedVolFromRange(leader.high, leader.low, leader.last);
  const change = pctChange(leader);
  const price = leader.last;
  const regime = marketRegime.state;

  // ATR expansion proxy
  const dayRange = (leader.high || price) - (leader.low || price);
  const prevRange = leader.prevClose ? leader.prevClose * 0.015 : dayRange; // rough ATR proxy
  const atrExpansion = prevRange > 0 ? dayRange / prevRange : 1;

  // Trend strength: how strongly price is moving relative to range
  const rangePosition = (leader.high && leader.low && leader.high > leader.low)
    ? (price - leader.low) / (leader.high - leader.low)
    : 0.5;
  const trendStrength = Math.abs(change) > 0.01
    ? Math.min(1, Math.abs(change) / 0.03 * 0.5 + rangePosition * 0.5)
    : rangePosition * 0.6;

  // Market type classification
  const marketType = classifyMarketType({
    trendStrength,
    atrExpansion,
    setupBehavior: setup.setupBehavior,
  });
  const strategy = getTradeStrategy(marketType);

  // Distance to target
  const targets = setup.targets || null;
  let distT1Pct = null;
  if (targets && targets.length > 0 && price > 0) {
    distT1Pct = ((targets[0] - price) / price) * 100;
  }

  // ── SCORING ────────────────────────────────────
  let score = 50;

  // Volatility contribution
  if (vol > 0.002) score += 10;
  if (vol > 0.03) score += 5;  // bonus for elevated vol

  // Price action
  if (change > 0.01) score += 15;
  else if (change > 0) score += 5;
  else if (change < -0.02) score -= 10;

  // Regime
  if (regime === "RISK-ON") score += 15;
  else if (regime === "NEUTRAL") score += 5;
  else if (regime === "RISK-OFF") score -= 20;

  // Market type adjustments
  if (marketType === "MOMENTUM" && change > 0.015) score += 10;
  if (marketType === "RANGE" && rangePosition < 0.3) score += 10; // near support = good for range
  if (marketType === "RANGE" && rangePosition > 0.8) score -= 5;  // near resistance = caution
  if (marketType === "INCOME") score -= 10; // income setups rarely score high

  // Target distance
  if (distT1Pct != null) {
    if (distT1Pct > 3 && distT1Pct <= 8) score += 5;  // EARLY = favorable
    if (distT1Pct <= 0) score -= 10;  // past target = take profit
  }

  score = Math.max(0, Math.min(100, score));

  // ── STATE ──────────────────────────────────────
  let state = "NO TRADE";
  if (marketType === "INCOME") {
    state = score >= 60 ? "WATCH" : "NO TRADE"; // income rarely gets GO
  } else if (score >= 70 && regime !== "RISK-OFF") {
    state = "GO";
  } else if (score >= 50) {
    state = "WATCH";
  }

  // ── NARRATIVE ──────────────────────────────────
  const narrative = buildNarrative({
    symbol: sym, marketType, strategy, change, vol, regime, price, targets, distT1Pct,
  });

  return {
    kind: "standalone",
    setup: sym,
    state,
    score,
    leaderPrice: price,
    change,
    vol,
    marketRegime: regime,
    // New fields
    marketType,
    strategy,
    narrative,
    targets,
    stop: setup.stop || null,
    distT1Pct: distT1Pct != null ? Math.round(distT1Pct * 100) / 100 : null,
    trendStrength: Math.round(trendStrength * 100) / 100,
    atrExpansion: Math.round(atrExpansion * 100) / 100,
    rangePosition: Math.round(rangePosition * 100) / 100,
  };
}
