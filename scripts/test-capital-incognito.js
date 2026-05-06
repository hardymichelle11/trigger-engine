// Regression: capital edits must not wipe prior fields when localStorage
// is unreliable (Incognito quota, sandboxed iframe, security policy).
//
// Symptom we're guarding against:
//   1. user types Start = $5000, blurs (saveContext fires)
//   2. user types Deployable = $3000, blurs (saveContext fires)
//   3. UI shows Start = $0 (wiped), Deployable = $3000.
//
// Root cause (pre-fix): saveCapitalContext re-loaded "current" from
// storage every call. When setItem silently failed, the load returned
// defaults, and every subsequent patch was merged onto those defaults.
//
// Fix: saveCapitalContext accepts a `current` arg; the React hook passes
// its live state as the merge base.

import {
  saveCapitalContext,
  loadCapitalContext,
  defaultCapitalContext,
} from "../src/lib/capital/capitalContext.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.error("  ✗", msg);
  } else {
    console.log("  ✓", msg);
  }
}
const close = (a, b) => Math.abs(a - b) < 0.01;

const userId = "regression-test";

console.log("\n[1] In Node (no localStorage), without `current` arg, save loses prior fields");
const a = saveCapitalContext({ startingCapital: 5000 }, userId);
assert(a.startingCapital === 5000, "first save returns startingCapital=5000");

const b = saveCapitalContext({ deployableCapital: 3000 }, userId);
assert(b.deployableCapital === 3000, "second save returns deployableCapital=3000");
// Without `current`, this DOES lose the prior field — that's the bug we're
// guarding against. Confirm the regression is reproducible.
assert(b.startingCapital === 0,
  "REGRESSION: without `current` arg in unreliable-storage env, startingCapital is wiped");

console.log("\n[2] With `current` arg, save preserves prior fields (the fix)");
const c = saveCapitalContext({ startingCapital: 5000 }, userId);
assert(c.startingCapital === 5000, "first save with `current` undefined: start=5000");

// Simulate what the React hook does: pass the previous state as merge base.
const d = saveCapitalContext({ deployableCapital: 3000 }, userId, c);
assert(d.startingCapital === 5000,
  "FIX: with `current` arg, startingCapital is preserved across saves (got " + d.startingCapital + ")");
assert(d.deployableCapital === 3000, "deployableCapital correctly merged");

console.log("\n[3] Chain of saves (e.g. user fills 4 fields one by one)");
let state = defaultCapitalContext(userId);
state = saveCapitalContext({ startingCapital: 50000 }, userId, state);
state = saveCapitalContext({ availableCash: 30000 }, userId, state);
state = saveCapitalContext({ deployableCapital: 20000 }, userId, state);
state = saveCapitalContext({ marketMode: "risk_on" }, userId, state);
assert(state.startingCapital === 50000, "after 4 saves: start preserved (50000)");
assert(state.availableCash === 30000, "after 4 saves: availableCash preserved (30000)");
assert(state.deployableCapital === 20000, "after 4 saves: deployable preserved (20000)");
assert(state.marketMode === "risk_on", "after 4 saves: marketMode preserved (risk_on)");

console.log("\n[4] Backward compat — single-call usage without `current` still works");
const single = saveCapitalContext({ startingCapital: 100, marketMode: "neutral" }, userId);
assert(single.startingCapital === 100, "single-call save: start=100");
assert(single.marketMode === "neutral", "single-call save: mode=neutral");

console.log(`\n${failures === 0 ? "✓ all capital tests passed" : "✗ " + failures + " test(s) failed"}\n`);
process.exit(failures > 0 ? 1 : 0);
