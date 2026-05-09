#!/usr/bin/env node
// =====================================================
// Credit View narrative — tests
// Run: npm run test:credit-view-narrative
//
// Pins behavior of:
//   - buildCreditViewNarrative({ ... }) → trader-readable paragraph
//     concatenating conservativeConcern + accumulationInterpretation
//     + confirmation + invalidation gates.
//   - Required structured fields are always present.
//   - 9-state CREDIT_RECOMMENDATIONS mapping covers strong / accumulation
//     / 2PM / late-confirmation / wait-pullback / wait-premium / 3 avoids.
//   - 8 CREDIT_TRIGGERS are detected when underlying conditions are met.
//   - accumulationMode (or marketPhase: "accumulation") flips a setup
//     the conservative model would have blocked into a candidate.
//   - oldModelWouldHaveBlocked flips when conservative model would have
//     killed a setup but the accumulation model retains it.
//   - No raw scores or weights leak into the output.
// =====================================================

import {
  buildCreditViewNarrative,
  CREDIT_VIEW_READINESS,
  CREDIT_RECOMMENDATIONS,
  CREDIT_TRIGGERS,
} from "../src/lib/engine/creditViewNarrative.js";

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, cond, detail = "") {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${detail ? "  →  " + detail : ""}`); failures.push(name); failed++; }
}
function group(label) {
  console.log(`\n  ${label}\n  ${"─".repeat(Math.max(20, label.length))}`);
}

const REQUIRED_FIELDS = [
  // backward-compat
  "recommendationLabel",
  "riskNarrative",
  "conservativeConcern",
  "accumulationInterpretation",
  "confirmationSentence",
  "invalidationSentence",
  "executionReadiness",
  "oldModelWouldHaveBlocked",
  // new structured fields
  "recommendation",
  "triggers",
  "triggerSentence",
  "confirmation",
  "invalidation",
  "bestStrikeZone",
  "minimumPremium",
  "managementNote",
  "marketPhase",
  "accumulationMode",
];

// ============================================================
group("[1] required field shape");
// ============================================================

const minimal = buildCreditViewNarrative({});
for (const f of REQUIRED_FIELDS) {
  assert(`field present: ${f}`, Object.prototype.hasOwnProperty.call(minimal, f));
}
assert(
  "minimal narrative is a non-empty string",
  typeof minimal.riskNarrative === "string" && minimal.riskNarrative.length > 0,
);
assert(
  "minimal recommendation has both code and label",
  minimal.recommendation && minimal.recommendation.code && minimal.recommendation.label,
);
assert(
  "minimal triggers is an array",
  Array.isArray(minimal.triggers),
);

// ============================================================
group("[2] late-session in 2PM window with rich premium → 2PM harvest");
// ============================================================

const lateSession = buildCreditViewNarrative({
  symbol: "AAL",
  price: 25.00,
  ivPercentile: 70,
  bid: 0.50,
  ask: 0.55,
  spreadQuality: "A",
  wheelSuit: "High",
  signal: "GO",
  action: "SELL_PUTS",
  timingStage: "LATE",
  vix: 22.0,
  fearSpike: false,
  creditStress: false,
  nearestSupportPct: 0.024,           // ~2.4% below = $24.40
  minuteOfDay: 14 * 60 + 30,          // 14:30 ET → afternoon
  primaryStrike: 24,
  secondaryStrike: 23.5,
});

assert(
  "late-session recommendation = 2PM Premium Harvest",
  lateSession.recommendation.label === CREDIT_RECOMMENDATIONS.TWO_PM_HARVEST,
);
assert(
  "late-session executionReadiness = ready_if_confirmed",
  lateSession.executionReadiness === CREDIT_VIEW_READINESS.READY,
);
assert(
  "late-session conservativeConcern names execution risk",
  /late-session.*execution risk/i.test(lateSession.conservativeConcern),
);
assert(
  "accumulation interpretation says it remains a valid candidate",
  /valid accumulation candidate/i.test(lateSession.accumulationInterpretation),
);
assert(
  "accumulation reasons mention support",
  /support/i.test(lateSession.accumulationInterpretation),
);
assert(
  "accumulation reasons mention VIX is controlled",
  /controlled/i.test(lateSession.accumulationInterpretation),
);
assert(
  "accumulation reasons mention premium",
  /premium/i.test(lateSession.accumulationInterpretation),
);
assert(
  "accumulation reasons mention spread",
  /spread/i.test(lateSession.accumulationInterpretation),
);
assert(
  "accumulation reasons mention wheel",
  /wheel/i.test(lateSession.accumulationInterpretation),
);

// Confirmation sentence wording (Phase 4 spec):
assert(
  "confirmation sentence quotes price floor",
  /price holds above \$\d+\.\d{2}/.test(lateSession.confirmationSentence),
);
assert(
  "confirmation sentence quotes VIX floor",
  /VIX remains above \d+\.\d/.test(lateSession.confirmationSentence),
);
assert(
  "confirmation sentence quotes premium floor",
  /premium stays above \$\d+\.\d{2}/.test(lateSession.confirmationSentence),
);
assert(
  "confirmation sentence quotes spread ceiling",
  /spread stays below \d+%/.test(lateSession.confirmationSentence),
);
assert(
  "confirmation sentence references no fresh lower low after 2pm",
  /no fresh intraday lower low forms after 2pm/i.test(lateSession.confirmationSentence),
);

// Invalidation sentence wording (Phase 4 spec):
assert(
  "invalidation sentence quotes break level",
  /price breaks below \$\d+\.\d{2}/.test(lateSession.invalidationSentence),
);
assert(
  "invalidation sentence references VIX collapse + premium drop",
  /VIX drops below.*premium collapses/i.test(lateSession.invalidationSentence),
);
assert(
  "invalidation sentence references spread widening",
  /spread widens above \d+%/.test(lateSession.invalidationSentence),
);
assert(
  "invalidation sentence references new intraday low after 2pm",
  /new intraday low after 2pm/i.test(lateSession.invalidationSentence),
);
assert(
  "invalidation sentence references news shock",
  /news shock/i.test(lateSession.invalidationSentence),
);

assert(
  "narrative concatenates conservativeConcern → accumulation",
  lateSession.riskNarrative.startsWith(lateSession.conservativeConcern),
);
assert(
  "narrative includes confirmation + invalidation sentences",
  lateSession.riskNarrative.includes(lateSession.confirmationSentence) &&
  lateSession.riskNarrative.includes(lateSession.invalidationSentence),
);
assert(
  "old model would have blocked late-session + VIX elevation",
  lateSession.oldModelWouldHaveBlocked === true,
);

// ============================================================
group("[3] structured confirmation + invalidation values");
// ============================================================

assert(
  "confirmation.priceFloor is the support level (≈ $24.40)",
  lateSession.confirmation.priceFloor != null &&
    Math.abs(lateSession.confirmation.priceFloor - 24.40) < 0.01,
);
assert(
  "confirmation.vixFloor equals current VIX (22.0)",
  Math.abs(lateSession.confirmation.vixFloor - 22.0) < 0.01,
);
assert(
  "confirmation.premiumFloor is 85% of premium mid",
  Math.abs(lateSession.confirmation.premiumFloor - (0.525 * 0.85)) < 0.001,
);
assert(
  "confirmation.spreadCeilingPct = 0.12 (12%)",
  Math.abs(lateSession.confirmation.spreadCeilingPct - 0.12) < 1e-9,
);
assert(
  "confirmation.requireNoLowerLowAfter2pm = true",
  lateSession.confirmation.requireNoLowerLowAfter2pm === true,
);
assert(
  "confirmation.conditions has at least 5 entries",
  Array.isArray(lateSession.confirmation.conditions) &&
    lateSession.confirmation.conditions.length >= 5,
);

assert(
  "invalidation.priceBreak is 1% below support",
  lateSession.invalidation.priceBreak != null &&
    Math.abs(lateSession.invalidation.priceBreak - (24.40 * 0.99)) < 0.01,
);
assert(
  "invalidation.vixCollapse is current VIX − 1.0",
  Math.abs(lateSession.invalidation.vixCollapse - 21.0) < 0.01,
);
assert(
  "invalidation.premiumCollapse is 60% of premium mid",
  Math.abs(lateSession.invalidation.premiumCollapse - (0.525 * 0.6)) < 0.001,
);
assert(
  "invalidation.spreadCeilingPct = 0.18 (18%)",
  Math.abs(lateSession.invalidation.spreadCeilingPct - 0.18) < 1e-9,
);
assert(
  "invalidation.newLowAfter2pm = true",
  lateSession.invalidation.newLowAfter2pm === true,
);
assert(
  "invalidation.newsShockClause = true",
  lateSession.invalidation.newsShockClause === true,
);

// ============================================================
group("[4] best strike zone + minimum premium + management note");
// ============================================================

assert(
  "bestStrikeZone uses primary + secondary strikes",
  lateSession.bestStrikeZone.low === 23.5 &&
  lateSession.bestStrikeZone.high === 24,
);
assert(
  "bestStrikeZone.label is range with 'put' suffix",
  /\$23\.50.*\$24\.00 put/.test(lateSession.bestStrikeZone.label),
);
assert(
  "minimumPremium.value matches confirmation premium floor",
  Math.abs(lateSession.minimumPremium.value - lateSession.confirmation.premiumFloor) < 1e-9,
);
assert(
  "minimumPremium.label uses 'credit or better'",
  /\$\d+\.\d{2} credit or better/.test(lateSession.minimumPremium.label),
);
assert(
  "managementNote mentions willingness to own shares for High wheel suit",
  /willing to own shares/i.test(lateSession.managementNote),
);

// ============================================================
group("[5] triggers fire when conditions are met");
// ============================================================

const triggerCodes = lateSession.triggers.map((t) => t.code);
assert(
  "PREMIUM_EXPANSION triggers when ivPercentile ≥ 70",
  triggerCodes.includes("PREMIUM_EXPANSION"),
);
assert(
  "SUPPORT_HOLD triggers when supportPct ≤ 2.5%",
  triggerCodes.includes("SUPPORT_HOLD"),
);
assert(
  "VIX_ELEVATED triggers when VIX in [16, panic)",
  triggerCodes.includes("VIX_ELEVATED"),
);
assert(
  "TWO_PM_PREMIUM_WINDOW triggers in 14:00-15:30 window",
  triggerCodes.includes("TWO_PM_PREMIUM_WINDOW"),
);
assert(
  "WHEEL_ACCEPTABLE_PRICE triggers when wheelSuit High + strike present",
  triggerCodes.includes("WHEEL_ACCEPTABLE_PRICE"),
);
assert(
  "triggerSentence joins all triggers as a single sentence",
  /\./.test(lateSession.triggerSentence) &&
    lateSession.triggers.every((t) => lateSession.triggerSentence.toLowerCase().includes(t.label.toLowerCase())),
);

// ============================================================
group("[6] accumulation mode promotes wait → ACCUMULATION_ENTRY");
// ============================================================

const baseInputs = {
  symbol: "AAL", price: 25, ivPercentile: 65,
  bid: 0.40, ask: 0.45, spreadQuality: "A", wheelSuit: "High",
  signal: "GO", action: "SELL_PUTS", timingStage: "LATE",
  vix: 20, nearestSupportPct: 0.02,
  minuteOfDay: 13 * 60 + 30,                          // 13:30 — pre-2PM window
  primaryStrike: 24, secondaryStrike: 23.5,
};

const noAccum = buildCreditViewNarrative(baseInputs);
const withAccum = buildCreditViewNarrative({
  ...baseInputs,
  marketPhase: "accumulation",
});

assert(
  "WITHOUT marketPhase: pre-2PM late-stage → LATE_CONFIRMATION",
  noAccum.recommendation.label === CREDIT_RECOMMENDATIONS.LATE_CONFIRMATION,
);
assert(
  "WITH marketPhase=accumulation: same setup → ACCUMULATION_ENTRY",
  withAccum.recommendation.label === CREDIT_RECOMMENDATIONS.ACCUMULATION_ENTRY,
);
assert(
  "ACCUMULATION_PHASE trigger fires when marketPhase=accumulation",
  withAccum.triggers.some((t) => t.code === "ACCUMULATION_PHASE"),
);
assert(
  "accumulationMode is true on output when marketPhase=accumulation",
  withAccum.accumulationMode === true,
);
assert(
  "marketPhase is echoed in output",
  withAccum.marketPhase === "accumulation",
);
assert(
  "accumulation entry executionReadiness = ready_if_confirmed",
  withAccum.executionReadiness === CREDIT_VIEW_READINESS.READY,
);

// ============================================================
group("[7] readiness mapping — ready / wait / 3 avoid states");
// ============================================================

const strong = buildCreditViewNarrative({
  signal: "GO", action: "SELL_PUTS", timingStage: "PEAK",
  ivPercentile: 75, spreadQuality: "A+", wheelSuit: "High",
  vix: 18, price: 100, bid: 0.50, ask: 0.55,
  nearestSupportPct: 0.02, primaryStrike: 95, secondaryStrike: 92,
  minuteOfDay: 11 * 60,
});
assert(
  "PEAK + GO + clean tape → STRONG_ENTRY",
  strong.recommendation.label === CREDIT_RECOMMENDATIONS.STRONG_ENTRY,
);
assert(
  "STRONG_ENTRY → ready_if_confirmed",
  strong.executionReadiness === CREDIT_VIEW_READINESS.READY,
);

const exhausted = buildCreditViewNarrative({
  signal: "GO", action: "SELL_PUTS", timingStage: "EXHAUSTED",
  ivPercentile: 70, spreadQuality: "A", wheelSuit: "High",
  vix: 22, price: 100, bid: 0.50, ask: 0.55,
});
assert(
  "EXHAUSTED stage → NO_TRADE_INVALIDATED",
  exhausted.recommendation.label === CREDIT_RECOMMENDATIONS.NO_TRADE_INVALIDATED,
);
assert(
  "exhausted readiness = avoid_invalidated",
  exhausted.executionReadiness === CREDIT_VIEW_READINESS.AVOID_INVALID,
);
assert(
  "exhausted accumulation interpretation says NOT a valid candidate",
  /not a valid accumulation candidate/i.test(exhausted.accumulationInterpretation),
);

const breakdown = buildCreditViewNarrative({
  signal: "WATCH", action: "WAIT", timingStage: "LATE",
  ivPercentile: 70, spreadQuality: "A", wheelSuit: "High",
  vix: 24, price: 100, bid: 0.50, ask: 0.55,
  nearestSupportPct: 0.001, trendBias: "BEARISH",
  minuteOfDay: 14 * 60 + 45,
});
assert(
  "BEARISH + at support → AVOID_BREAKDOWN",
  breakdown.recommendation.label === CREDIT_RECOMMENDATIONS.AVOID_BREAKDOWN,
);
assert(
  "AVOID_BREAKDOWN → avoid_invalidated",
  breakdown.executionReadiness === CREDIT_VIEW_READINESS.AVOID_INVALID,
);

const wideSpread = buildCreditViewNarrative({
  signal: "GO", action: "SELL_PUTS", timingStage: "PEAK",
  ivPercentile: 70, spreadQuality: "C", wheelSuit: "High",
  vix: 18, price: 100, bid: 0.40, ask: 0.80,
});
assert(
  "C spread → AVOID_POOR_CREDIT",
  wideSpread.recommendation.label === CREDIT_RECOMMENDATIONS.AVOID_POOR_CREDIT,
);
assert(
  "spread-driven AVOID → avoid_poor_liquidity readiness",
  wideSpread.executionReadiness === CREDIT_VIEW_READINESS.AVOID_LIQUIDITY,
);

const lowPremium = buildCreditViewNarrative({
  signal: "GO", action: "SELL_PUTS", timingStage: "PEAK",
  ivPercentile: 25, spreadQuality: "A", wheelSuit: "High",
  vix: 16, price: 100, bid: 0.10, ask: 0.12,
});
assert(
  "ivPercentile<30 → AVOID_POOR_CREDIT",
  lowPremium.recommendation.label === CREDIT_RECOMMENDATIONS.AVOID_POOR_CREDIT,
);
assert(
  "premium-driven AVOID → avoid_premium_collapse readiness",
  lowPremium.executionReadiness === CREDIT_VIEW_READINESS.AVOID_PREMIUM,
);

const waitPremium = buildCreditViewNarrative({
  signal: "GO", action: "SELL_PUTS", timingStage: "PEAK",
  ivPercentile: 35, spreadQuality: "A", wheelSuit: "High",
  vix: 16, price: 100, bid: 0.20, ask: 0.22,
});
assert(
  "ivPercentile in [30,40) → WAIT_FOR_PREMIUM",
  waitPremium.recommendation.label === CREDIT_RECOMMENDATIONS.WAIT_FOR_PREMIUM,
);
assert(
  "WAIT_FOR_PREMIUM → wait_for_confirmation readiness",
  waitPremium.executionReadiness === CREDIT_VIEW_READINESS.WAIT,
);

const watching = buildCreditViewNarrative({
  signal: "WATCH", action: "WAIT", timingStage: "EARLY",
  ivPercentile: 60, spreadQuality: "A", wheelSuit: "High",
  vix: 17, price: 100, bid: 0.30, ask: 0.32,
});
assert(
  "WATCH/EARLY → LATE_CONFIRMATION (wait)",
  watching.recommendation.label === CREDIT_RECOMMENDATIONS.LATE_CONFIRMATION,
);

// ============================================================
group("[8] no leaks — no raw scores or weights in narrative");
// ============================================================

const probes = [lateSession, strong, exhausted, breakdown, wideSpread, lowPremium, waitPremium, watching, withAccum];
for (const cv of probes) {
  const blob = JSON.stringify(cv);
  assert(
    `no "score":N leak in ${cv.recommendation.label}`,
    !/"score"\s*:\s*-?\d/.test(blob),
  );
  assert(
    `no weight token in ${cv.recommendation.label}`,
    !/"weight"|"w_/.test(blob),
  );
}

// ============================================================
group("[9] oldModelWouldHaveBlocked semantics");
// ============================================================

assert(
  "clean PEAK + low VIX → old model would NOT have blocked",
  strong.oldModelWouldHaveBlocked === false,
);
assert(
  "exhausted setup is invalidated → old/new agree, oldModelWouldHaveBlocked false",
  exhausted.oldModelWouldHaveBlocked === false,
);
assert(
  "late-session 2PM harvest — accumulation kept it → oldModelWouldHaveBlocked true",
  lateSession.oldModelWouldHaveBlocked === true,
);
assert(
  "explicit accumulation entry — old model would have blocked",
  withAccum.oldModelWouldHaveBlocked === true,
);

// ============================================================
group("[10] enum exports");
// ============================================================

assert("CREDIT_RECOMMENDATIONS has 9 states",
  Object.keys(CREDIT_RECOMMENDATIONS).length === 9);
assert("CREDIT_RECOMMENDATIONS.STRONG_ENTRY exists",
  CREDIT_RECOMMENDATIONS.STRONG_ENTRY === "Strong Credit Entry");
assert("CREDIT_RECOMMENDATIONS.ACCUMULATION_ENTRY exists",
  CREDIT_RECOMMENDATIONS.ACCUMULATION_ENTRY === "Accumulation Entry");
assert("CREDIT_RECOMMENDATIONS.TWO_PM_HARVEST exists",
  CREDIT_RECOMMENDATIONS.TWO_PM_HARVEST === "2PM Premium Harvest");
assert("CREDIT_TRIGGERS has 8 codes",
  Object.keys(CREDIT_TRIGGERS).length === 8);
assert("CREDIT_TRIGGERS.PREMIUM_EXPANSION exists",
  CREDIT_TRIGGERS.PREMIUM_EXPANSION === "Premium expansion detected");
assert("CREDIT_TRIGGERS.ACCUMULATION_PHASE exists",
  CREDIT_TRIGGERS.ACCUMULATION_PHASE === "Accumulation behavior detected");

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
