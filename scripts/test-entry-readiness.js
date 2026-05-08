#!/usr/bin/env node
// =====================================================
// Entry Readiness — tests
// Run: npm run test:entry-readiness
// =====================================================
//
// Pins the operator-safety gate's behavior so it cannot
// silently regress to "ready" when data isn't actually
// ready. The four states + reasons + operatorInstruction
// are part of the contract.
// =====================================================

import { buildEntryReadiness, ENTRY_READINESS } from "../src/lib/entryReadiness.js";

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, cond, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? "  →  " + detail : ""}`);
    failures.push(name);
    failed++;
  }
}
function group(label) {
  console.log(`\n  ${label}\n  ${"─".repeat(Math.max(20, label.length))}`);
}

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

const verifiedIncome = {
  symbol: "GTLB",
  actionCode: "option_candidate",
  capitalFitCode: "excellent",
  regimeAlignment: "aligned",
  signalState: "verified",
  score: 89,
  price: 30,
};

const liveProvenance = {
  currentPrice: 30,
  suggestedStrike: 28.5,
  premiumSource: "live",
  resolvedExpiration: "2026-05-15",
  resolvedExpirationMatched: "preferred",
  resolvedExpirationReason: null,
  spreadWidthLabel: "tight",
  marketDataAgeMs: 30 * 1000,         // 30s — fresh
  marketFreshness: "LIVE",
};

const beStyleProvenance = {
  // Mirrors the screenshot: estimated premium, no expirations,
  // no resolver match, no support/r1/r2 — but spot+strike present.
  currentPrice: 30,
  suggestedStrike: 28.5,
  premiumSource: "estimated",
  resolvedExpiration: null,
  resolvedExpirationMatched: null,
  resolvedExpirationReason: "no_expirations_available",
  spreadWidthLabel: null,
  support: null,
  r1: null,
  r2: null,
  marketDataAgeMs: 60 * 1000,
  marketFreshness: "LIVE",
};

const unverifiedEstimatedProvenance = {
  // Verified-or-not is a candidate field, but the chain itself is
  // present — just at fallback expiration with estimated premium.
  currentPrice: 30,
  suggestedStrike: 28.5,
  premiumSource: "estimated",
  resolvedExpiration: "2026-05-15",
  resolvedExpirationMatched: "fallback",
  resolvedExpirationReason: null,
  spreadWidthLabel: "moderate",
  marketDataAgeMs: 60 * 1000,
  marketFreshness: "LIVE",
};

const skipRow = {
  ...verifiedIncome,
  actionCode: "skip_low_signal",
};

const notAffordableRow = {
  ...verifiedIncome,
  capitalFitCode: "not_affordable",
};

const regimeMismatchRow = {
  ...verifiedIncome,
  regimeAlignment: "mismatch",
};

const unverifiedRow = {
  ...verifiedIncome,
  signalState: "unverified",
};

// ---------------------------------------------------------------------
// 1. Happy path
// ---------------------------------------------------------------------
group("[1] verified candidate + live chain → ready_to_review");

const r1 = buildEntryReadiness(verifiedIncome, liveProvenance);
assert("readiness === ready_to_review", r1.readiness === ENTRY_READINESS.STATES.READY);
assert("severity === green", r1.severity === "green");
assert("label === 'Ready to review'", r1.label === "Ready to review");
assert("reasons is an array", Array.isArray(r1.reasons));
assert("reasons capped at 3", r1.reasons.length <= 3);
assert("operatorInstruction non-empty", typeof r1.operatorInstruction === "string" && r1.operatorInstruction.length > 10);

// ---------------------------------------------------------------------
// 2. unverified signal + estimated premium → verify_first
// ---------------------------------------------------------------------
group("[2] unverified signal + estimated premium → verify_first");

const r2 = buildEntryReadiness(unverifiedRow, unverifiedEstimatedProvenance);
assert("readiness === verify_first", r2.readiness === ENTRY_READINESS.STATES.VERIFY);
assert("severity === amber", r2.severity === "amber");
assert("reasons mention 'verified'",
  r2.reasons.some((r) => /verified/i.test(r)));
assert("reasons mention 'estimated' premium",
  r2.reasons.some((r) => /estimated/i.test(r)));

// ---------------------------------------------------------------------
// 3. BE-style: no expirations available → wait_for_chain
// ---------------------------------------------------------------------
group("[3] no expirations / chain missing → wait_for_chain");

const r3 = buildEntryReadiness(unverifiedRow, beStyleProvenance);
assert("readiness === wait_for_chain", r3.readiness === ENTRY_READINESS.STATES.WAIT_CHAIN,
  `got ${r3.readiness}`);
assert("severity === amber", r3.severity === "amber");
assert("first reason mentions expirations",
  /expiration/i.test(r3.reasons[0] || ""));
assert("operatorInstruction tells operator NOT to enter",
  /not enter|do not enter|wait/i.test(r3.operatorInstruction));

// Also verify that premium-unavailable forces wait_for_chain by itself.
const r3b = buildEntryReadiness(verifiedIncome, {
  ...liveProvenance,
  premiumSource: "unavailable",
});
assert("premium=unavailable alone → wait_for_chain",
  r3b.readiness === ENTRY_READINESS.STATES.WAIT_CHAIN);

// ---------------------------------------------------------------------
// 4. Avoid posture → do_not_trade
// ---------------------------------------------------------------------
group("[4] avoid / skip / unaffordable / regime-mismatch → do_not_trade");

const r4a = buildEntryReadiness(skipRow, liveProvenance);
assert("skip_* action → do_not_trade", r4a.readiness === ENTRY_READINESS.STATES.DO_NOT_TRADE);
assert("severity === red", r4a.severity === "red");

const r4b = buildEntryReadiness(notAffordableRow, liveProvenance);
assert("not_affordable → do_not_trade", r4b.readiness === ENTRY_READINESS.STATES.DO_NOT_TRADE);
assert("not_affordable reason mentions cash",
  r4b.reasons.some((r) => /cash|afford|exceeds/i.test(r)));

const r4c = buildEntryReadiness(regimeMismatchRow, liveProvenance);
assert("regime mismatch → do_not_trade", r4c.readiness === ENTRY_READINESS.STATES.DO_NOT_TRADE);

// ---------------------------------------------------------------------
// 5. Stale market data → do_not_trade; aging → verify_first
// ---------------------------------------------------------------------
group("[5] stale → do_not_trade; aging → verify_first");

const r5a = buildEntryReadiness(verifiedIncome, {
  ...liveProvenance,
  marketDataAgeMs: 60 * 60 * 1000,    // 1 hour
  marketFreshness: "STALE",
});
assert("explicit STALE → do_not_trade", r5a.readiness === ENTRY_READINESS.STATES.DO_NOT_TRADE);
assert("STALE reason mentions stale", r5a.reasons.some((r) => /stale/i.test(r)));

const r5b = buildEntryReadiness(verifiedIncome, {
  ...liveProvenance,
  marketDataAgeMs: 10 * 60 * 1000,    // 10 minutes — aging
  marketFreshness: "AGING",
});
assert("aging (10m) → verify_first", r5b.readiness === ENTRY_READINESS.STATES.VERIFY);
assert("aging reason surfaces", r5b.reasons.some((r) => /aging|older/i.test(r)));

// ---------------------------------------------------------------------
// 6. Defensive — null inputs
// ---------------------------------------------------------------------
group("[6] null candidate / null provenance → safe defaults");

const r6a = buildEntryReadiness(null, null);
assert("null + null → do_not_trade (safe default)",
  r6a.readiness === ENTRY_READINESS.STATES.DO_NOT_TRADE);

const r6b = buildEntryReadiness(verifiedIncome, null);
assert("null provenance → do_not_trade (no price = no trade)",
  r6b.readiness === ENTRY_READINESS.STATES.DO_NOT_TRADE);

const r6c = buildEntryReadiness(null, liveProvenance);
assert("null candidate + live provenance → ready_to_review",
  r6c.readiness === ENTRY_READINESS.STATES.READY,
  "candidate is empty so no engine-block fires; provenance is fully clean → READY");

// ---------------------------------------------------------------------
// 7. Missing critical price → do_not_trade
// ---------------------------------------------------------------------
group("[7] missing/invalid price fields → do_not_trade");

const r7 = buildEntryReadiness(verifiedIncome, {
  ...liveProvenance,
  currentPrice: null,
});
assert("currentPrice missing → do_not_trade", r7.readiness === ENTRY_READINESS.STATES.DO_NOT_TRADE);
assert("reason mentions price", r7.reasons.some((r) => /price/i.test(r)));

// ---------------------------------------------------------------------
// 8. Wide spread + fallback expiration → verify_first
// ---------------------------------------------------------------------
group("[8] wide spread + fallback expiration → verify_first");

const r8 = buildEntryReadiness(verifiedIncome, {
  ...liveProvenance,
  resolvedExpirationMatched: "fallback",
  spreadWidthLabel: "wide",
});
assert("verify_first when caveats present", r8.readiness === ENTRY_READINESS.STATES.VERIFY);
assert("at least 2 reasons surface",
  r8.reasons.length >= 2);
assert("fallback reason present", r8.reasons.some((r) => /fallback/i.test(r)));
assert("spread reason present", r8.reasons.some((r) => /spread/i.test(r)));

// ---------------------------------------------------------------------
// 9. Privacy — no raw weights or internal flags ever leak
// ---------------------------------------------------------------------
group("[9] no internal flags / weights / raw integers leak");

const allFixtures = [r1, r2, r3, r3b, r4a, r4b, r4c, r5a, r5b, r6a, r6b, r6c, r7, r8];

for (const r of allFixtures) {
  const allText = [r.label, r.operatorInstruction, ...(r.reasons || [])].join(" | ");
  assert(`text has no scoreAdjustment substring (${r.readiness})`,
    !/scoreAdjustment/i.test(allText));
  assert(`text has no raw signed-int leak (${r.readiness})`,
    !/[+\-]\d{1,3}\b/.test(allText));
  assert(`text has no engine-internal field names (${r.readiness})`,
    !/_internals|weight|coefficient/i.test(allText));
  // Severity is one of the three published values.
  assert(`severity is one of green|amber|red (${r.readiness})`,
    ["green", "amber", "red"].includes(r.severity));
  // Readiness is one of the four published values.
  assert(`readiness is one of the four published states (${r.readiness})`,
    Object.values(ENTRY_READINESS.STATES).includes(r.readiness));
}

// ---------------------------------------------------------------------
// 10. Reasons are capped at 3 even with many caveats
// ---------------------------------------------------------------------
group("[10] reasons capped at 3");

const r10 = buildEntryReadiness(unverifiedRow, {
  currentPrice: 30,
  suggestedStrike: 28.5,
  premiumSource: "estimated",
  resolvedExpiration: "2026-05-15",
  resolvedExpirationMatched: "fallback",
  spreadWidthLabel: "wide",
  marketDataAgeMs: 10 * 60 * 1000,
  marketFreshness: "AGING",
});
assert("verify_first under many caveats", r10.readiness === ENTRY_READINESS.STATES.VERIFY);
assert("reasons capped at 3 even when 5+ caveats present",
  r10.reasons.length <= 3);

// ---------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  Failures:\n  ${failures.map((f) => "  • " + f).join("\n")}`);
  process.exit(1);
}
