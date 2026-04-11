#!/usr/bin/env node
// =====================================================
// Smoke test for the credit-vol signal engine.
// Run: npm run test:engine
// =====================================================

import { evaluateMarketRegime, scoreSetup, chooseAction, selectPutLadder, estimateProbability, buildProfitPlan, buildRollPlan, buildScannerState, CONFIG } from "../src/signalEngine.js";

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    failed++;
  }
}

console.log("\n  Signal Engine Tests");
console.log("  ───────────────────\n");

// 1. Market regime
const riskOn = evaluateMarketRegime({ hyg: 82, kre: 70, lqd: 105, vix: 18, vixPrev: 19, atrExpansionMultiple: 1.0 });
assert("Risk-on regime when credit OK + VIX low", riskOn.mode === "RISK_ON");
assert("No credit stress when HYG > 80 and KRE > 68.6", riskOn.creditStress === false);

const stressed = evaluateMarketRegime({ hyg: 78, kre: 67, lqd: 100, vix: 25, vixPrev: 22, atrExpansionMultiple: 1.8 });
assert("High premium when credit stress + vol active", stressed.mode === "HIGH_PREMIUM_ENVIRONMENT");
assert("Credit stress when HYG < 80", stressed.creditStress === true);

// 2. Setup scoring
const mockSetup = {
  symbol: "NVDA", price: 110, prevClose: 105,
  leaderMovePct: 2, powerMovePct: 1.5, followerMovePct: 0.5,
  atrExpansionMultiple: 1.6, ivPercentile: 75, distT1Pct: 5,
  nearSupport: true, putCallRatio: 1.2,
};
const scored = scoreSetup(mockSetup, riskOn);
assert("Score is a number 0-100", scored.score >= 0 && scored.score <= 100);
assert("Signal is GO, WATCH, or NO_TRADE", ["GO", "WATCH", "NO_TRADE"].includes(scored.signal));
assert("Timing has a stage", !!scored.timing.stage);

// 3. Action engine
const action = chooseAction({ ...mockSetup, category: "HIGH_IV" }, scored, riskOn);
assert("Action has action field", !!action.action);
assert("Action has reason field", !!action.reason);

// 4. Strike selection
const ladder = selectPutLadder({ price: 100, strikeCandidates: [98, 95, 92, 90, 88, 85] });
assert("Primary strike exists", ladder.primary !== null);
assert("Secondary strike exists", ladder.secondary !== null);
assert("Primary <= secondary (further OTM)", ladder.primary <= ladder.secondary);

// 5. Probability
const prob = estimateProbability({ price: 100, strike: 90, dte: 7, ivPercentile: 70, atrExpansionMultiple: 1.5 });
assert("Prob above strike is 0-1", prob.probAboveStrike >= 0 && prob.probAboveStrike <= 1);
assert("Expected move is positive", prob.expectedMove > 0);

// 6. Profit plan
const profit = buildProfitPlan({ creditReceived: 3.50 });
assert("30% BTC price < credit", profit.considerClose.btcPrice < 3.50);
assert("70% BTC price < 30% BTC price", profit.alwaysClose.btcPrice < profit.considerClose.btcPrice);

// 7. Roll plan
const roll = buildRollPlan({ creditReceived: 3.50, strike: 90, currentPrice: 100 });
assert("Zone is SAFE when price well above strike", roll.zone === "SAFE");
const rollDanger = buildRollPlan({ creditReceived: 3.50, strike: 90, currentPrice: 89 });
assert("Zone is ACTION when price below strike", rollDanger.zone === "ACTION");

// 8. Full scanner
const state = buildScannerState({
  marketInputs: { hyg: 82, kre: 70, lqd: 105, vix: 18, vixPrev: 19, atrExpansionMultiple: 1.0 },
  setups: [mockSetup],
});
assert("Scanner returns market object", !!state.market);
assert("Scanner returns cards array", Array.isArray(state.cards));
assert("Scanner returns summary", !!state.summary);

// 9. CONFIG integrity
assert("CONFIG has all sections", !!CONFIG.macro && !!CONFIG.setup && !!CONFIG.execution && !!CONFIG.profit && !!CONFIG.roll && !!CONFIG.timing && !!CONFIG.income && !!CONFIG.weights && !!CONFIG.score && !!CONFIG.timingBands);

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
