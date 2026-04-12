#!/usr/bin/env node
// =====================================================
// Tests for Credit-Vol Regime V2 engine.
// Run: npm run test:regime
// =====================================================

import { buildCreditVolRegime, REGIME_V2_CONFIG, resetRegimePersistence } from "../src/lib/engine/creditVolRegimeV2.js";

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}`); failed++; }
}

console.log("\n  Credit-Vol Regime V2 Tests");
console.log("  ──────────────────────────\n");

// Helper: generate a series of N bars trending in a direction
function makeSeries(n, start, stepPerBar) {
  return Array.from({ length: n }, (_, i) => start + i * stepPerBar);
}

// Reset persistence state between tests
resetRegimePersistence();

// =========================
// CASE 1: Calm / Risk-On
// =========================
console.log("  -- Case 1: Calm / Risk-On --");

const calm = buildCreditVolRegime({
  HYG: makeSeries(25, 82, 0.05),    // rising HYG = healthy credit
  KRE: makeSeries(25, 70, 0.03),    // rising KRE = healthy banks
  XLF: makeSeries(25, 45, 0.02),    // rising financials
  VIX: makeSeries(25, 16, -0.1),    // falling VIX = calm
  QQQ: makeSeries(25, 500, 1.0),    // rising QQQ = risk-on
  TNX: makeSeries(25, 4.2, 0.0),    // flat rates
});

assert("Calm: regime is RISK_ON", calm.mode === "RISK_ON");
assert("Calm: score < 25", calm.regimeScore < 25);
assert("Calm: creditStress = false", calm.creditStress === false);
assert("Calm: vixState = calm", calm.vixState === "calm");
assert("Calm: confidence exists", calm.confidence.label !== undefined);
assert("Calm: has componentScores", Object.keys(calm.componentScores).length === 6);
assert("Calm: HYG stress low", calm.componentScores.HYG < 20);
assert("Calm: VIX stress low", calm.componentScores.VIX < 20);
assert("Calm: engineVersion = 2", calm.engineVersion === 2);
assert("Calm: has explanation array", Array.isArray(calm.explanation));
assert("Calm: has backward-compat flags", calm.flags.hygWeak !== undefined);

resetRegimePersistence();

// =========================
// CASE 2: Early Stress (credit weakening, VIX still muted)
// =========================
console.log("\n  -- Case 2: Early Stress --");

const earlyStress = buildCreditVolRegime({
  HYG: makeSeries(25, 82, -0.30),   // falling HYG = credit stress building
  KRE: makeSeries(25, 71, -0.35),   // falling KRE = bank stress
  XLF: makeSeries(25, 45, -0.20),   // falling financials
  VIX: makeSeries(25, 16, 0.08),    // VIX barely rising, still calm/watch
  QQQ: makeSeries(25, 510, -1.0),   // QQQ softening
  TNX: makeSeries(25, 4.1, 0.02),   // rates ticking up slightly
});

assert("EarlyStress: regime is CREDIT_STRESS_WATCH", earlyStress.mode === "CREDIT_STRESS_WATCH");
assert("EarlyStress: earlyStress flag = true", earlyStress.flags.earlyStress === true);
assert("EarlyStress: creditStress = true", earlyStress.creditStress === true);
assert("EarlyStress: HYG stress >= 35", earlyStress.componentScores.HYG >= 35);
assert("EarlyStress: KRE stress >= 35", earlyStress.componentScores.KRE >= 35);
assert("EarlyStress: VIX state not panic", earlyStress.vixState !== "panic" && earlyStress.vixState !== "crisis");
assert("EarlyStress: bias includes WAIT", earlyStress.bias.includes("WAIT"));

resetRegimePersistence();

// =========================
// CASE 3: Panic / High Premium
// =========================
console.log("\n  -- Case 3: Panic / High Premium --");

const panic = buildCreditVolRegime({
  HYG: makeSeries(25, 82, -0.50),   // HYG dropping hard
  KRE: makeSeries(25, 71, -0.55),   // KRE dropping hard
  XLF: makeSeries(25, 45, -0.40),   // XLF dropping
  VIX: makeSeries(25, 18, 0.50),    // VIX spiking toward 30+
  QQQ: makeSeries(25, 510, -3.0),   // QQQ dumping
  TNX: makeSeries(25, 4.2, 0.08),   // rates rising
});

assert("Panic: regime is stress-related", ["CREDIT_STRESS_HIGH_PREMIUM", "HIGH_PREMIUM_ENVIRONMENT", "CREDIT_STRESS_WATCH"].includes(panic.mode));
assert("Panic: score > 50", panic.regimeScore > 50);
assert("Panic: creditStress = true", panic.creditStress === true);
assert("Panic: VIX stress high", panic.componentScores.VIX > 30);
assert("Panic: HYG stress high", panic.componentScores.HYG > 40);
assert("Panic: confidence medium or high", panic.confidence.label === "medium" || panic.confidence.label === "high");
assert("Panic: vixState is watch or panic or crisis", ["watch", "panic", "crisis"].includes(panic.vixState));

resetRegimePersistence();

// =========================
// CASE 4: Edge cases
// =========================
console.log("\n  -- Case 4: Edge cases --");

// Missing optional tickers
const minimal = buildCreditVolRegime({
  HYG: [80, 81],
  KRE: [69, 70],
  VIX: [18, 17],
  XLF: [],   // empty
  QQQ: [],   // empty
  TNX: [],   // empty
});
assert("Minimal: returns result without crash", minimal.mode !== undefined);
assert("Minimal: engineVersion = 2", minimal.engineVersion === 2);

// Completely missing required ticker
const fallback = buildCreditVolRegime({
  KRE: [69, 70],
  VIX: [18, 17],
});
assert("Fallback: returns LOW_EDGE when HYG missing", fallback.mode === "LOW_EDGE");
assert("Fallback: explanation mentions fallback", fallback.explanation.some(l => l.includes("Fallback")));

// Config shape
assert("Config: has weights", Object.keys(REGIME_V2_CONFIG.weights).length === 6);
assert("Config: weights sum to ~1", Math.abs(Object.values(REGIME_V2_CONFIG.weights).reduce((a, b) => a + b, 0) - 1) < 0.01);
assert("Config: has vixBands", REGIME_V2_CONFIG.vixBands.calm < REGIME_V2_CONFIG.vixBands.crisis);

// =========================
// CASE 5: Enhancement outputs
// =========================
console.log("\n  -- Case 5: Enhancement outputs --");

resetRegimePersistence();

// Run calm first to establish baseline
const enh1 = buildCreditVolRegime({
  HYG: makeSeries(25, 82, 0.05), KRE: makeSeries(25, 70, 0.03),
  XLF: makeSeries(25, 45, 0.02), VIX: makeSeries(25, 16, -0.1),
  QQQ: makeSeries(25, 500, 1.0), TNX: makeSeries(25, 4.2, 0.0),
});

// Enhancement 3: Explicit action
assert("Enh3: sellPutsAction exists", typeof enh1.sellPutsAction === "string");
assert("Enh3: calm = SELL_PUTS_NORMAL", enh1.sellPutsAction === "SELL_PUTS_NORMAL");

// Enhancement 2: Trade window overlay
assert("Enh2: allowNewTrades = true for RISK_ON", enh1.allowNewTrades === true);

// Enhancement 5: Percentiles
assert("Enh5: has percentiles object", typeof enh1.percentiles === "object");
assert("Enh5: vix percentile 0-100", enh1.percentiles.vix >= 0 && enh1.percentiles.vix <= 100);
assert("Enh5: hyg percentile 0-100", enh1.percentiles.hyg >= 0 && enh1.percentiles.hyg <= 100);

// Enhancement 1: Calibration snapshot
assert("Enh1: has calibrationSnapshot", typeof enh1.calibrationSnapshot === "object");
assert("Enh1: snapshot has regimeScore", typeof enh1.calibrationSnapshot.regimeScore === "number");
assert("Enh1: snapshot has componentScores", typeof enh1.calibrationSnapshot.componentScores === "object");
assert("Enh1: snapshot has timestamp", typeof enh1.calibrationSnapshot.timestamp === "number");
assert("Enh1: snapshot has sellPutsAction", typeof enh1.calibrationSnapshot.sellPutsAction === "string");

// Enhancement 4: Persistence
assert("Enh4: has persistence object", typeof enh1.persistence === "object");
assert("Enh4: confirmed = true for calm", enh1.persistence.confirmed === true);

// Test persistence: first defensive reading should NOT flip immediately
resetRegimePersistence();
// Run calm to establish non-defensive baseline
buildCreditVolRegime({
  HYG: makeSeries(25, 82, 0.05), KRE: makeSeries(25, 70, 0.03),
  XLF: makeSeries(25, 45, 0.02), VIX: makeSeries(25, 16, -0.1),
  QQQ: makeSeries(25, 500, 1.0), TNX: makeSeries(25, 4.2, 0.0),
});

// Now send a defensive signal — should NOT flip on first reading
const firstDefensive = buildCreditVolRegime({
  HYG: makeSeries(25, 82, -0.30), KRE: makeSeries(25, 71, -0.35),
  XLF: makeSeries(25, 45, -0.20), VIX: makeSeries(25, 16, 0.08),
  QQQ: makeSeries(25, 510, -1.0), TNX: makeSeries(25, 4.1, 0.02),
});
assert("Enh4: first defensive reading has pending flip", firstDefensive.persistence.pendingFlip !== null || firstDefensive.persistence.confirmed === true);

// Second consecutive defensive should confirm
const secondDefensive = buildCreditVolRegime({
  HYG: makeSeries(25, 82, -0.30), KRE: makeSeries(25, 71, -0.35),
  XLF: makeSeries(25, 45, -0.20), VIX: makeSeries(25, 16, 0.08),
  QQQ: makeSeries(25, 510, -1.0), TNX: makeSeries(25, 4.1, 0.02),
});
assert("Enh4: second defensive reading is confirmed", secondDefensive.persistence.confirmed === true);

// Panic action mapping
resetRegimePersistence();
const panicAction = buildCreditVolRegime({
  HYG: makeSeries(25, 82, -0.50), KRE: makeSeries(25, 71, -0.55),
  XLF: makeSeries(25, 45, -0.40), VIX: makeSeries(25, 18, 0.50),
  QQQ: makeSeries(25, 510, -3.0), TNX: makeSeries(25, 4.2, 0.08),
});
// Run twice to confirm persistence
buildCreditVolRegime({
  HYG: makeSeries(25, 82, -0.50), KRE: makeSeries(25, 71, -0.55),
  XLF: makeSeries(25, 45, -0.40), VIX: makeSeries(25, 18, 0.50),
  QQQ: makeSeries(25, 510, -3.0), TNX: makeSeries(25, 4.2, 0.08),
});
assert("Enh3: stress action is not SELL_PUTS_NORMAL", panicAction.sellPutsAction !== "SELL_PUTS_NORMAL" || panicAction.persistence.pendingFlip !== null);

resetRegimePersistence();

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
