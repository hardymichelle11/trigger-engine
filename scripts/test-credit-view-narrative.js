#!/usr/bin/env node
// =====================================================
// Credit View narrative — tests
// Run: npm run test:credit-view-narrative
//
// Pins behavior of:
//   - buildCreditViewNarrative({ ... }) → trader-readable paragraph
//     concatenating conservativeConcern + accumulationInterpretation
//     + confirmation + invalidation gates.
//   - Required fields are always present.
//   - executionReadiness mapping covers ready / wait / 3 avoid states.
//   - oldModelWouldHaveBlocked flips when conservative model would have
//     killed a setup but accumulation model retains it.
// =====================================================

import {
  buildCreditViewNarrative,
  CREDIT_VIEW_READINESS,
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
  "recommendationLabel",
  "riskNarrative",
  "conservativeConcern",
  "accumulationInterpretation",
  "confirmationSentence",
  "invalidationSentence",
  "executionReadiness",
  "oldModelWouldHaveBlocked",
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
  "minimal executionReadiness defaults to wait",
  minimal.executionReadiness === CREDIT_VIEW_READINESS.WAIT,
);

// ============================================================
group("[2] late-session + elevated VIX → wait + accumulation candidate");
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
});

assert(
  "late-session executionReadiness = wait_for_confirmation",
  lateSession.executionReadiness === CREDIT_VIEW_READINESS.WAIT,
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

assert(
  "confirmation sentence quotes price level",
  /price to hold above \$\d+\.\d{2}/.test(lateSession.confirmationSentence),
);
assert(
  "confirmation sentence quotes VIX",
  /VIX to remain above \d+\.\d/.test(lateSession.confirmationSentence),
);
assert(
  "confirmation sentence quotes premium floor",
  /premium to stay above \$\d+\.\d{2}/.test(lateSession.confirmationSentence),
);

assert(
  "invalidation sentence quotes break level",
  /price breaks below \$\d+\.\d{2}/.test(lateSession.invalidationSentence),
);
assert(
  "invalidation sentence references fresh lower low after 2pm",
  /fresh lower low forms after 2pm/i.test(lateSession.invalidationSentence),
);

assert(
  "narrative concatenates conservativeConcern → accumulation",
  lateSession.riskNarrative.startsWith(lateSession.conservativeConcern),
);
assert(
  "narrative includes confirmation + invalidation sentences",
  lateSession.riskNarrative.includes(lateSession.confirmationSentence)
    && lateSession.riskNarrative.includes(lateSession.invalidationSentence),
);
assert(
  "old model would have blocked late-session + VIX elevation",
  lateSession.oldModelWouldHaveBlocked === true,
);
assert(
  "recommendationLabel is WAIT FOR CONFIRMATION",
  lateSession.recommendationLabel === "WAIT FOR CONFIRMATION",
);

// ============================================================
group("[3] readiness mapping — ready / avoid states");
// ============================================================

const ready = buildCreditViewNarrative({
  signal: "GO", action: "SELL_PUTS", timingStage: "PEAK",
  ivPercentile: 75, spreadQuality: "A+", wheelSuit: "High",
  vix: 16, price: 100, bid: 0.50, ask: 0.55,
  nearestSupportPct: 0.02, primaryStrike: 95,
  minuteOfDay: 11 * 60,
});
assert(
  "PEAK + GO + clean tape → ready_if_confirmed",
  ready.executionReadiness === CREDIT_VIEW_READINESS.READY,
);
assert(
  "ready label is ACCUMULATION CANDIDATE",
  ready.recommendationLabel === "ACCUMULATION CANDIDATE",
);

const exhausted = buildCreditViewNarrative({
  signal: "GO", action: "SELL_PUTS", timingStage: "EXHAUSTED",
  ivPercentile: 70, spreadQuality: "A", wheelSuit: "High",
  vix: 22, price: 100, bid: 0.50, ask: 0.55,
});
assert(
  "EXHAUSTED stage → avoid_invalidated",
  exhausted.executionReadiness === CREDIT_VIEW_READINESS.AVOID_INVALID,
);
assert(
  "exhausted accumulation interpretation says NOT a valid candidate",
  /not a valid accumulation candidate/i.test(exhausted.accumulationInterpretation),
);

const wideSpread = buildCreditViewNarrative({
  signal: "GO", action: "SELL_PUTS", timingStage: "PEAK",
  ivPercentile: 70, spreadQuality: "C", wheelSuit: "High",
  vix: 18, price: 100, bid: 0.40, ask: 0.80,
});
assert(
  "C spread → avoid_poor_liquidity",
  wideSpread.executionReadiness === CREDIT_VIEW_READINESS.AVOID_LIQUIDITY,
);

const lowPremium = buildCreditViewNarrative({
  signal: "GO", action: "SELL_PUTS", timingStage: "PEAK",
  ivPercentile: 25, spreadQuality: "A", wheelSuit: "High",
  vix: 16, price: 100, bid: 0.10, ask: 0.12,
});
assert(
  "ivPercentile<40 → avoid_premium_collapse",
  lowPremium.executionReadiness === CREDIT_VIEW_READINESS.AVOID_PREMIUM,
);

const watching = buildCreditViewNarrative({
  signal: "WATCH", action: "WAIT", timingStage: "EARLY",
  ivPercentile: 60, spreadQuality: "A", wheelSuit: "High",
  vix: 17, price: 100, bid: 0.30, ask: 0.32,
});
assert(
  "WATCH/EARLY → wait_for_confirmation",
  watching.executionReadiness === CREDIT_VIEW_READINESS.WAIT,
);

// ============================================================
group("[4] no leaks — no raw scores or weights in narrative");
// ============================================================

const probes = [lateSession, ready, exhausted, wideSpread, lowPremium, watching];
for (const cv of probes) {
  const blob = JSON.stringify(cv);
  assert(
    `no "score":N leak in ${cv.recommendationLabel}`,
    !/"score"\s*:\s*-?\d/.test(blob),
  );
  assert(
    `no weight token in ${cv.recommendationLabel}`,
    !/weight|w_/.test(blob),
  );
}

// ============================================================
group("[5] oldModelWouldHaveBlocked semantics");
// ============================================================

assert(
  "clean PEAK + low VIX → old model would NOT have blocked",
  ready.oldModelWouldHaveBlocked === false,
);
assert(
  "exhausted setup is invalidated → old/new agree, oldModelWouldHaveBlocked false",
  exhausted.oldModelWouldHaveBlocked === false,
);
assert(
  "late + VIX elevated but accumulation kept it → oldModelWouldHaveBlocked true",
  lateSession.oldModelWouldHaveBlocked === true,
);

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
