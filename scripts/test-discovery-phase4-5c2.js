#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.5C+2 tests
// Run: npm run test:discovery-phase4-5c2
// =====================================================
//
// Verifies the v2 → v3 ThetaData adapter migration:
//
//   - PROVIDER_VERSION enum + INCOMPATIBLE_VERSION health status
//     are exported and shaped as expected
//   - HealthResult carries `version: "v3"` from both the unavailable
//     fallback provider and the active ThetaData provider
//   - Active code path emits NO /v2 paths, NO 25510 references,
//     NO root= or exp= params, NO `* 1000` strike scaling
//   - normalizeStrike treats input as dollars (no division by 1000)
//   - HTTP 410 from the Terminal classifies as `incompatible_version`
//     with reason `v2_endpoint_gone`
//   - fetchSnapshot URL contains symbol= / expiration= / right=put|call /
//     strike in dollars / format=json — and explicitly NOT root= / exp= /
//     right=P|C / strike scaled to thousandths
//   - parseThetaDataV3SnapshotPayload tolerates several v3 JSON shapes
//   - terminal_not_running / unauthorized / unavailable_plan / FREE-tier
//     entitlement gaps degrade gracefully (no throws, no live label)
//   - explicit env semantics preserved: provider stays in
//     missing_credentials when VITE_THETADATA_ENABLED is absent
// =====================================================

import { readFileSync } from "node:fs";

import {
  HEALTH_STATUS,
  PROVIDER_NAME,
  PROVIDER_VERSION,
} from "../src/providers/options/optionsProviderTypes.js";

import {
  normalizeStrike,
  normalizeRow,
  parseThetaDataV3SnapshotPayload,
} from "../src/providers/options/normalizeOptionChain.js";

import {
  createThetaDataProvider,
} from "../src/providers/options/thetaDataProvider.js";

import {
  createOptionsChainProvider,
  createUnavailableProvider,
} from "../src/providers/options/optionsChainProvider.js";

let passed = 0;
let failed = 0;
const failureLines = [];

function assert(name, condition, detail = "") {
  if (condition) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${detail ? "  →  " + detail : ""}`);
         failureLines.push(name + (detail ? "  →  " + detail : "")); failed++; }
}

function group(label) {
  console.log("\n  " + label);
  console.log("  " + "─".repeat(Math.max(20, label.length)));
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.5C+2");
console.log("  ══════════════════════════════════════════════");

// =================================================================
// 1. Enum surface — PROVIDER_VERSION + INCOMPATIBLE_VERSION
// =================================================================
group("enums — version + new health status");
{
  assert("PROVIDER_VERSION.V3 = 'v3'", PROVIDER_VERSION.V3 === "v3");
  assert("PROVIDER_VERSION is frozen", Object.isFrozen(PROVIDER_VERSION));
  assert("HEALTH_STATUS.INCOMPATIBLE_VERSION = 'incompatible_version'",
    HEALTH_STATUS.INCOMPATIBLE_VERSION === "incompatible_version");
}

// =================================================================
// 2. normalizeStrike — dollars in, dollars out (no /1000)
// =================================================================
group("normalizeStrike — v3 dollars semantics");
{
  assert("140 → 140",     normalizeStrike(140) === 140);
  assert("140.5 → 140.5", normalizeStrike(140.5) === 140.5);
  assert("0.50 → 0.5",    normalizeStrike(0.5) === 0.5);
  // Anti-test: legacy v2 millicents (140000) must NOT be silently rescaled
  // back to 140 — that would mask a v2-shaped caller as if it worked.
  assert("140000 (legacy v2 shape) is NOT rescaled to 140",
    normalizeStrike(140000) !== 140);
  assert("140000 stays 140000",
    normalizeStrike(140000) === 140000);
  assert("0 → null",      normalizeStrike(0) === null);
  assert("negative → null", normalizeStrike(-100) === null);
  assert("null → null",   normalizeStrike(null) === null);
}

// =================================================================
// 3. parseThetaDataV3SnapshotPayload — tolerant JSON parsing
// =================================================================
group("parseThetaDataV3SnapshotPayload — shape variants");
{
  // Canonical: { response: [{ ... }] }
  const a = parseThetaDataV3SnapshotPayload({
    response: [{ bid: 1.40, ask: 1.50, last: 1.48, volume: 800,
                 open_interest: 1500, iv: 0.32 }],
  });
  assert("array-of-objects: bid", a?.bid === 1.40);
  assert("array-of-objects: ask", a?.ask === 1.50);
  assert("array-of-objects: open_interest", a?.open_interest === 1500);

  // { response: { ... } } single-object
  const b = parseThetaDataV3SnapshotPayload({
    response: { bid: 2.10, ask: 2.15 },
  });
  assert("single-object response: bid", b?.bid === 2.10);
  assert("single-object response: ask", b?.ask === 2.15);

  // Bare object
  const c = parseThetaDataV3SnapshotPayload({ bid: 0.95, ask: 1.00 });
  assert("bare object: bid", c?.bid === 0.95);

  // Bare array
  const d = parseThetaDataV3SnapshotPayload([{ bid: 0.50, ask: 0.55 }]);
  assert("bare array: bid", d?.bid === 0.50);

  // Positional fallback (terminal occasionally still emits this)
  const e = parseThetaDataV3SnapshotPayload({
    header: { format: ["bid_size", "bid", "ask_size", "ask", "last"] },
    response: [[100, 1.10, 100, 1.20, 1.15]],
  });
  assert("positional fallback: bid", e?.bid === 1.10);
  assert("positional fallback: ask", e?.ask === 1.20);

  // v3 contract+data wrapper — verified verbatim against live Terminal v3
  // on 2026-05-02 (NVDA 2026-05-22 $215 put). Quote fields are nested one
  // level deeper than the simpler shapes; the parser must unwrap.
  const wrap = parseThetaDataV3SnapshotPayload({
    response: [{
      contract: { symbol: "NVDA", expiration: "2026-05-22", strike: 215.0, right: "PUT" },
      data: [{
        bid: 18.70, ask: 19.35,
        bid_size: 72, ask_size: 22,
        bid_exchange: 6, ask_exchange: 69,
        bid_condition: 50, ask_condition: 50,
        timestamp: "2026-05-01T16:00:00.000",
      }],
    }],
  });
  assert("v3 wrapper: bid extracted from nested data[0]", wrap?.bid === 18.70);
  assert("v3 wrapper: ask extracted from nested data[0]", wrap?.ask === 19.35);
  assert("v3 wrapper: contract metadata not bleeding through",
    wrap?.symbol === undefined && wrap?.expiration === undefined);

  // Malformed shapes
  assert("null payload → null",
    parseThetaDataV3SnapshotPayload(null) === null);
  assert("number payload → null",
    parseThetaDataV3SnapshotPayload(42) === null);
  assert("empty array → null",
    parseThetaDataV3SnapshotPayload([]) === null);
  assert("response: [] → null",
    parseThetaDataV3SnapshotPayload({ response: [] }) === null);
}

// =================================================================
// 4. ThetaData provider — version stamp on HealthResult
// =================================================================
group("HealthResult.version stamping");
{
  // Disabled provider — preflight short-circuit
  const p1 = createThetaDataProvider({});
  const h1 = await p1.checkHealth();
  assert("disabled: version = v3", h1.version === "v3");
  assert("disabled: status = missing_credentials",
    h1.status === HEALTH_STATUS.MISSING_CREDENTIALS);

  // Enabled, mock returns OK shape
  const fetcher = async (path) => {
    if (path.startsWith("/v3/option/list/expirations") && path.includes("symbol=SPY")) {
      return { response: [{ expiration: 20260101 }] };
    }
    return null;
  };
  const p2 = createThetaDataProvider({
    enabled: true,
    baseUrl: "http://127.0.0.1:25503",
    fetcher,
  });
  const h2 = await p2.checkHealth();
  assert("available: version = v3", h2.version === "v3");
  assert("available: status = available",
    h2.status === HEALTH_STATUS.AVAILABLE);
  assert("available: provider = thetadata",
    h2.provider === PROVIDER_NAME.THETADATA);
}

// =================================================================
// 5. HTTP 410 → incompatible_version
// =================================================================
group("HTTP 410 surface → incompatible_version");
{
  const fetch410 = async () => {
    const e = new Error("thetadata_http_410");
    e.status = 410;
    throw e;
  };
  const p = createThetaDataProvider({
    enabled: true,
    baseUrl: "http://127.0.0.1:25503",
    fetcher: fetch410,
  });
  const h = await p.checkHealth();
  assert("410 → status = incompatible_version",
    h.status === HEALTH_STATUS.INCOMPATIBLE_VERSION);
  assert("410 → reason = v2_endpoint_gone",
    h.reason === "v2_endpoint_gone");
  assert("410 → version still v3 (we ARE v3, the endpoint we hit was wrong)",
    h.version === "v3");
}

// =================================================================
// 6. fetchSnapshot URL composition — v3 params verbatim
// =================================================================
group("fetchSnapshot URL composition (v3)");
{
  const calls = [];
  const fetcher = async (path) => {
    calls.push(path);
    if (path.startsWith("/v3/option/list/expirations") && path.includes("symbol=SPY")) {
      return { response: [{ expiration: 20260101 }] };
    }
    if (path.startsWith("/v3/option/snapshot/quote")) {
      return {
        response: [{
          bid: 1.40, ask: 1.50, last: 1.48,
          volume: 800, open_interest: 1500, iv: 0.32,
        }],
      };
    }
    return null;
  };
  const p = createThetaDataProvider({
    enabled: true,
    baseUrl: "http://127.0.0.1:25503",
    fetcher,
  });
  const snap = await p.fetchSnapshot({
    symbol: "NVDA",
    expiration: "2026-09-19",
    strike: 140.50,
    right: "put",
  });
  assert("fetchSnapshot returned a row", !!snap);
  assert("snap.symbol = NVDA", snap?.symbol === "NVDA");
  assert("snap.strike = 140.5 (dollars)", snap?.strike === 140.5);
  assert("snap.type = put", snap?.type === "put");
  assert("snap.bid = 1.40", snap?.bid === 1.40);
  assert("snap.ask = 1.50", snap?.ask === 1.50);
  assert("snap.mid = 1.45", snap?.mid === 1.45);

  const snapPath = calls.find(p => p.startsWith("/v3/option/snapshot/quote"));
  assert("snapshot path uses /v3/option/snapshot/quote", !!snapPath);
  assert("URL contains symbol=NVDA",      snapPath?.includes("symbol=NVDA"));
  assert("URL contains expiration=20260919",
    snapPath?.includes("expiration=20260919"));
  assert("URL contains strike=140.50 (dollars, not millicents)",
    snapPath?.includes("strike=140.50"));
  assert("URL contains right=put (not P)", snapPath?.includes("right=put"));
  assert("URL contains format=json",       snapPath?.includes("format=json"));

  // Anti-assertions: legacy v2 shape must not leak through
  assert("URL does NOT contain root=",     !snapPath?.includes("root="));
  assert("URL does NOT contain exp=",      !/[?&]exp=/.test(snapPath || ""));
  assert("URL does NOT contain right=P",   !/[?&]right=P(?!UT)/.test(snapPath || ""));
  assert("URL does NOT contain strike=140500 (v2 millicents)",
    !snapPath?.includes("strike=140500"));
}

// =================================================================
// 7. fetchSnapshot — call→put mapping via legacy "C"
// =================================================================
group("right normalization C/P → call/put on the wire");
{
  const calls = [];
  const fetcher = async (path) => {
    calls.push(path);
    if (path.startsWith("/v3/option/list/expirations") && path.includes("symbol=SPY")) {
      return { response: [{ expiration: 20260101 }] };
    }
    if (path.startsWith("/v3/option/snapshot/quote")) {
      return { response: [{ bid: 1.0, ask: 1.1 }] };
    }
    return null;
  };
  const p = createThetaDataProvider({
    enabled: true,
    baseUrl: "http://127.0.0.1:25503",
    fetcher,
  });
  await p.fetchSnapshot({ symbol: "AAPL", expiration: "2026-10-17", strike: 200, right: "C" });
  await p.fetchSnapshot({ symbol: "AAPL", expiration: "2026-10-17", strike: 195, right: "P" });
  const snapCalls = calls.filter(c => c.startsWith("/v3/option/snapshot/quote"));
  assert("legacy 'C' arg → right=call on wire",
    snapCalls.some(c => c.includes("right=call")));
  assert("legacy 'P' arg → right=put on wire",
    snapCalls.some(c => c.includes("right=put")));
  assert("no /v2/ path emitted at all",
    !calls.some(c => c.includes("/v2/")));
}

// =================================================================
// 8. Source audit — no v2 leftovers in active provider files
// =================================================================
group("source audit — active code is v2-free");
{
  const files = [
    "src/providers/options/optionsProviderTypes.js",
    "src/providers/options/optionsChainProvider.js",
    "src/providers/options/thetaDataProvider.js",
    "src/providers/options/normalizeOptionChain.js",
    "src/providers/options/expirationResolver.js",
  ];
  for (const f of files) {
    const src = readFileSync(f, "utf8");

    // Strip comments before grepping for path/port literals so the v3
    // banner can still mention "v2" historically without tripping the audit.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    assert(`${f}: no live "/v2/" path constant`,
      !/["']\/v2\//.test(stripped));
    assert(`${f}: no live 25510 port literal`,
      !/127\.0\.0\.1:25510/.test(stripped));
    assert(`${f}: no live "root=" query param`,
      !/["']root=/.test(stripped));
    assert(`${f}: no live "* 1000" strike scaling`,
      !/\*\s*1000/.test(stripped));
  }
}

// =================================================================
// 9. createOptionsChainProvider — explicit env, no auto-default base URL
// =================================================================
group("explicit env semantics — no surprise localhost calls");
{
  // Empty env → unavailable (missing_credentials), even though Terminal
  // *might* be running on 25503. Activation must be intentional.
  const provider = createOptionsChainProvider({ env: {} });
  const h = await provider.checkHealth();
  assert("empty env → status missing_credentials",
    h.status === HEALTH_STATUS.MISSING_CREDENTIALS);
  assert("empty env → version still v3", h.version === "v3");
  assert("empty env → fetchSnapshot returns null",
    (await provider.fetchSnapshot({})) === null);

  // Enable flag without base URL → still missing_credentials
  const provider2 = createOptionsChainProvider({
    env: { VITE_THETADATA_ENABLED: "true" },
  });
  const h2 = await provider2.checkHealth();
  assert("enabled but no base URL → missing_credentials",
    h2.status === HEALTH_STATUS.MISSING_CREDENTIALS);
  assert("enabled but no base URL → reason = base_url_missing",
    h2.reason === "base_url_missing");

  // Both set + explicit fetcher → real provider, dispatched
  const fetcher = async () => null;     // simulates terminal_not_running
  const provider3 = createOptionsChainProvider({
    env: {
      VITE_THETADATA_ENABLED: "true",
      VITE_THETADATA_BASE_URL: "http://127.0.0.1:25503",
    },
    fetcher,
  });
  assert("provider3 has fetchExpirations method",
    typeof provider3.fetchExpirations === "function");
}

// =================================================================
// 10. Graceful entitlement / unauthorized handling
// =================================================================
group("entitlement degradation — FREE / unauthorized / unavailable_plan");
{
  // 401 / 403 → unauthorized (account valid but options data not allowed)
  const fetch403 = async () => { const e = new Error("thetadata_http_403"); e.status = 403; throw e; };
  const p403 = createThetaDataProvider({
    enabled: true, baseUrl: "http://127.0.0.1:25503", fetcher: fetch403,
  });
  const h403 = await p403.checkHealth();
  assert("403 → unauthorized", h403.status === HEALTH_STATUS.UNAUTHORIZED);

  // 402 / 451 → unavailable_plan (FREE tier or geographic restriction)
  const fetch402 = async () => { const e = new Error("thetadata_http_402"); e.status = 402; throw e; };
  const p402 = createThetaDataProvider({
    enabled: true, baseUrl: "http://127.0.0.1:25503", fetcher: fetch402,
  });
  const h402 = await p402.checkHealth();
  assert("402 → unavailable_plan",
    h402.status === HEALTH_STATUS.UNAVAILABLE_PLAN);

  // ECONNREFUSED → terminal_not_running
  const fetchRefused = async () => { const e = new Error("ECONNREFUSED"); e.code = "ECONNREFUSED"; throw e; };
  const pRef = createThetaDataProvider({
    enabled: true, baseUrl: "http://127.0.0.1:25503", fetcher: fetchRefused,
  });
  const hRef = await pRef.checkHealth();
  assert("ECONNREFUSED → terminal_not_running",
    hRef.status === HEALTH_STATUS.TERMINAL_NOT_RUNNING);

  // None of these branches should ever produce a "live" snapshot
  for (const p of [p403, p402, pRef]) {
    const snap = await p.fetchSnapshot({
      symbol: "NVDA", expiration: "2026-09-19", strike: 140, right: "put",
    });
    assert(`degraded provider returns null snapshot (status=${(await p.checkHealth()).status})`,
      snap === null);
  }
}

// =================================================================
// 11. Unavailable fallback provider also carries version
// =================================================================
group("createUnavailableProvider — v3 stamp");
{
  const p = createUnavailableProvider({ name: "thetadata", reason: "no_provider_configured" });
  const h = await p.checkHealth();
  assert("unavailable: version = v3", h.version === "v3");
  assert("unavailable: status = missing_credentials",
    h.status === HEALTH_STATUS.MISSING_CREDENTIALS);
  assert("unavailable: fetchExpirations resolves to null",
    (await p.fetchExpirations("NVDA")) === null);
}

// =================================================================
// SUMMARY
// =================================================================
console.log("\n  ════════════════════════════════════════════");
console.log(`  Phase 4.5C+2: ${passed} passed, ${failed} failed (total ${passed + failed})`);
if (failed > 0) {
  console.log("\n  Failures:");
  for (const line of failureLines) console.log("    ✗ " + line);
  process.exit(1);
}
process.exit(0);
