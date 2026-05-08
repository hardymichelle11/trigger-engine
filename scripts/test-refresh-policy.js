#!/usr/bin/env node
// =====================================================
// Refresh policy / session / freshness — tests
// Run: npm run test:refresh-policy
//
// Pins behavior of:
//   - sessionState.resolveSessionState
//   - refreshPolicy.refreshPolicyForSession
//   - autoRefreshPreference (default ON, persisted)
//   - marketFreshness.{freshnessFromAge, freshnessForCandidate}
// =====================================================

import {
  resolveSessionState,
  isLiveSession,
  isReplayOnlySession,
  SESSION_STATES,
} from "../src/lib/sessionState.js";
import {
  refreshPolicyForSession,
  effectiveCadenceMs,
} from "../src/lib/refreshPolicy.js";
import {
  getAutoRefreshPreference,
  setAutoRefreshPreferencePersist,
  AUTO_REFRESH_KEY,
} from "../src/lib/autoRefreshPreference.js";
import {
  freshnessFromAge,
  freshnessForCandidate,
  humanizeAge,
  FRESHNESS,
} from "../src/lib/marketFreshness.js";

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

// 2026-05-04 (Mon) is the reference week. May = EDT, so ET = UTC−4.
function et(weekdayOffsetFromMon, hour, minute) {
  const day = String(4 + weekdayOffsetFromMon).padStart(2, "0");
  return new Date(`2026-05-${day}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00-04:00`);
}

// =====================================================
group("[1] sessionState — US equity windows (DST-aware)");
// =====================================================

assert("Mon 04:30 ET → PREMARKET",   resolveSessionState(et(0, 4, 30))  === SESSION_STATES.PREMARKET);
assert("Mon 09:29 ET → PREMARKET",   resolveSessionState(et(0, 9, 29))  === SESSION_STATES.PREMARKET);
assert("Mon 09:30 ET → REGULAR",     resolveSessionState(et(0, 9, 30))  === SESSION_STATES.REGULAR);
assert("Mon 12:00 ET → REGULAR",     resolveSessionState(et(0, 12, 0))  === SESSION_STATES.REGULAR);
assert("Mon 15:59 ET → REGULAR",     resolveSessionState(et(0, 15, 59)) === SESSION_STATES.REGULAR);
assert("Mon 16:00 ET → AFTERHOURS",  resolveSessionState(et(0, 16, 0))  === SESSION_STATES.AFTERHOURS);
assert("Mon 19:59 ET → AFTERHOURS",  resolveSessionState(et(0, 19, 59)) === SESSION_STATES.AFTERHOURS);
assert("Mon 20:00 ET → CLOSED",      resolveSessionState(et(0, 20, 0))  === SESSION_STATES.CLOSED);
assert("Mon 03:59 ET → CLOSED",      resolveSessionState(et(0, 3, 59))  === SESSION_STATES.CLOSED);
assert("Sat 12:00 ET → WEEKEND_REPLAY", resolveSessionState(et(5, 12, 0)) === SESSION_STATES.WEEKEND_REPLAY);
assert("Sun 12:00 ET → WEEKEND_REPLAY", resolveSessionState(et(6, 12, 0)) === SESSION_STATES.WEEKEND_REPLAY);

// Predicates
assert("isLiveSession(REGULAR)",      isLiveSession(SESSION_STATES.REGULAR));
assert("isLiveSession(PREMARKET)",    isLiveSession(SESSION_STATES.PREMARKET));
assert("isLiveSession(AFTERHOURS)",   isLiveSession(SESSION_STATES.AFTERHOURS));
assert("!isLiveSession(WEEKEND_REPLAY)", !isLiveSession(SESSION_STATES.WEEKEND_REPLAY));
assert("!isLiveSession(CLOSED)",      !isLiveSession(SESSION_STATES.CLOSED));
assert("isReplayOnlySession(WEEKEND_REPLAY)", isReplayOnlySession(SESSION_STATES.WEEKEND_REPLAY));
assert("isReplayOnlySession(CLOSED)",         isReplayOnlySession(SESSION_STATES.CLOSED));
assert("!isReplayOnlySession(REGULAR)",      !isReplayOnlySession(SESSION_STATES.REGULAR));

// =====================================================
group("[2] refreshPolicy — per-session cadences");
// =====================================================

const pPre = refreshPolicyForSession(SESSION_STATES.PREMARKET);
assert("PREMARKET quote = 15s",     pPre.quoteIntervalMs === 15_000);
assert("PREMARKET analytics = 90s", pPre.analyticsIntervalMs === 90_000);
assert("PREMARKET reason mentions premarket", /premarket/i.test(pPre.reason));

const pReg = refreshPolicyForSession(SESSION_STATES.REGULAR);
assert("REGULAR quote = 15s",     pReg.quoteIntervalMs === 15_000);
assert("REGULAR analytics = 60s", pReg.analyticsIntervalMs === 60_000);

const pAft = refreshPolicyForSession(SESSION_STATES.AFTERHOURS);
assert("AFTERHOURS quote = 30s",     pAft.quoteIntervalMs === 30_000);
assert("AFTERHOURS analytics = 120s", pAft.analyticsIntervalMs === 120_000);

const pWk = refreshPolicyForSession(SESSION_STATES.WEEKEND_REPLAY);
assert("WEEKEND_REPLAY paused (null intervals)",
  pWk.quoteIntervalMs === null && pWk.analyticsIntervalMs === null);
assert("WEEKEND_REPLAY reason mentions paused", /paused/i.test(pWk.reason));

const pCl = refreshPolicyForSession(SESSION_STATES.CLOSED);
assert("CLOSED paused (null intervals)",
  pCl.quoteIntervalMs === null && pCl.analyticsIntervalMs === null);

assert("effectiveCadenceMs(REGULAR) = 60s",
  effectiveCadenceMs(SESSION_STATES.REGULAR) === 60_000);
assert("effectiveCadenceMs(WEEKEND_REPLAY) = null",
  effectiveCadenceMs(SESSION_STATES.WEEKEND_REPLAY) === null);
assert("effectiveCadenceMs(CLOSED) = null",
  effectiveCadenceMs(SESSION_STATES.CLOSED) === null);

// =====================================================
group("[3] autoRefreshPreference — default ON, persisted, tolerant");
// =====================================================

// Stub localStorage so the helper can write/read.
const _store = new Map();
const stub = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
  clear: () => _store.clear(),
};
globalThis.localStorage = stub;

assert("first read → default TRUE", getAutoRefreshPreference() === true);

setAutoRefreshPreferencePersist(false);
assert("after persist(false) → FALSE", getAutoRefreshPreference() === false);
assert("storage uses public key", stub.getItem(AUTO_REFRESH_KEY) === "false");

setAutoRefreshPreferencePersist(true);
assert("after persist(true) → TRUE", getAutoRefreshPreference() === true);

// Tolerant of broken localStorage.
const broken = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
  removeItem: () => {},
  clear: () => {},
};
globalThis.localStorage = broken;
assert("getAutoRefreshPreference() returns TRUE when storage throws",
  getAutoRefreshPreference() === true);

let didThrow = false;
try { setAutoRefreshPreferencePersist(false); } catch { didThrow = true; }
assert("setAutoRefreshPreferencePersist swallows errors", !didThrow);

globalThis.localStorage = stub;

// =====================================================
group("[4] marketFreshness — age buckets + RECALCULATING");
// =====================================================

assert("ageMs 5s → LIVE",          freshnessFromAge(5_000)        === FRESHNESS.LIVE);
assert("ageMs 59s → LIVE",         freshnessFromAge(59_000)       === FRESHNESS.LIVE);
assert("ageMs 60s → AGING",        freshnessFromAge(60_000)       === FRESHNESS.AGING);
assert("ageMs 4m → AGING",         freshnessFromAge(4 * 60_000)   === FRESHNESS.AGING);
assert("ageMs 5m → STALE",         freshnessFromAge(5 * 60_000)   === FRESHNESS.STALE);
assert("ageMs 25m → STALE",        freshnessFromAge(25 * 60_000)  === FRESHNESS.STALE);
assert("ageMs 31m → VERY_STALE",   freshnessFromAge(31 * 60_000)  === FRESHNESS.VERY_STALE);
assert("ageMs null → UNKNOWN",     freshnessFromAge(null)         === FRESHNESS.UNKNOWN);
assert("ageMs negative → UNKNOWN", freshnessFromAge(-1)           === FRESHNESS.UNKNOWN);

// Combined freshness
assert("quote LIVE + analytics LIVE → LIVE",
  freshnessForCandidate({ quoteAgeMs: 5_000, analyticsAgeMs: 5_000 }) === FRESHNESS.LIVE);
assert("quote LIVE + analytics 2m → RECALCULATING (analytics lagging quote)",
  freshnessForCandidate({ quoteAgeMs: 5_000, analyticsAgeMs: 120_000 }) === FRESHNESS.RECALCULATING);
assert("quote 6m + analytics 6m → STALE (worst-of)",
  freshnessForCandidate({ quoteAgeMs: 6 * 60_000, analyticsAgeMs: 6 * 60_000 }) === FRESHNESS.STALE);
assert("quote null → UNKNOWN dominates",
  freshnessForCandidate({ quoteAgeMs: null, analyticsAgeMs: 5_000 }) === FRESHNESS.UNKNOWN);
// Lag of 20s < 30s tolerance → no RECALCULATING; worst-of is AGING.
assert("quote 50s + analytics 70s (lag 20s) → AGING worst-of (no RECALC)",
  freshnessForCandidate({ quoteAgeMs: 50_000, analyticsAgeMs: 70_000 }) === FRESHNESS.AGING);

// humanize
assert("humanizeAge(5000) === '5s ago'",     humanizeAge(5_000) === "5s ago");
assert("humanizeAge(120_000) === '2m ago'",  humanizeAge(120_000) === "2m ago");
assert("humanizeAge(7_200_000) === '2h ago'", humanizeAge(7_200_000) === "2h ago");
assert("humanizeAge(null) === '—'",          humanizeAge(null) === "—");

// =====================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  Failures:\n  ${failures.map((f) => "  • " + f).join("\n")}`);
  process.exit(1);
}
