#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.5C+1 tests
// Run: npm run test:discovery-phase4-5c1
// =====================================================
//
// Verifies the Real Expiration Resolver:
//   - resolver picks nearest expiration >= today + targetDte
//   - falls back to nearest future expiration when no preferred match
//   - returns reason "no_expirations_available" on empty list
//   - returns reason "no_future_expirations" when all are past
//   - tolerates malformed entries silently
//   - injectable clock works for deterministic tests
//   - ThetaData provider's parseThetaDataExpirationsPayload handles
//     positional, flat, and shape-mismatched payloads
//   - ThetaData fetchExpirations returns null when health is bad
//   - Trade construction context surfaces resolvedExpiration*
//   - Trade construction context drops hostile resolver fields
//   - Trade construction whitelist matches Phase 4.5C+1 keys
//   - LethalBoardPage wires fetchExpirations + resolver into snapshot
// =====================================================

import { readFileSync } from "node:fs";

import {
  resolveNearestExpiration,
  EXPIRATION_RESOLVER_REASON,
  EXPIRATION_RESOLVER_MATCHED,
} from "../src/providers/options/expirationResolver.js";

import {
  createThetaDataProvider,
  parseThetaDataExpirationsPayload,
} from "../src/providers/options/thetaDataProvider.js";

import {
  createOptionsChainProvider,
} from "../src/providers/options/optionsChainProvider.js";

import {
  buildTradeConstructionContext,
} from "../src/components/discovery/tradeConstructionContext.js";

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

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.5C+1");
console.log("  ══════════════════════════════════════════════");

// Reference clock — 2026-05-01 UTC midnight.
const NOW = Date.UTC(2026, 4, 1);
const D = (y, m, d) => Date.UTC(y, m - 1, d);

// =================================================================
// 1. Resolver — preferred match logic
// =================================================================
group("resolver — preferred match");
{
  // Available: 2026-05-08 (7d), 2026-05-15 (14d), 2026-06-19 (49d).
  // Target 14 → nearest >= 14d is 2026-05-15.
  const r = resolveNearestExpiration({
    availableExpirations: ["20260508", "20260515", "20260619"],
    targetDte: 14,
    now: NOW,
  });
  assert("expiration = 2026-05-15", r.expiration === "2026-05-15");
  assert("dte = 14", r.dte === 14);
  assert("matched = preferred", r.matched === EXPIRATION_RESOLVER_MATCHED.PREFERRED);
  assert("reason = null on success", r.reason === null);
  assert("targetDte echoed = 14", r.targetDte === 14);
}

{
  // Target 5 → nearest >= 5d is 2026-05-08 (7d).
  const r = resolveNearestExpiration({
    availableExpirations: ["20260508", "20260515", "20260619"],
    targetDte: 5,
    now: NOW,
  });
  assert("target 5 → 2026-05-08", r.expiration === "2026-05-08");
  assert("dte = 7", r.dte === 7);
  assert("matched = preferred (closest >= target)",
    r.matched === EXPIRATION_RESOLVER_MATCHED.PREFERRED);
}

{
  // Target 0 → today; first future-or-today match is 2026-05-08.
  const r = resolveNearestExpiration({
    availableExpirations: ["20260508", "20260515"],
    targetDte: 0,
    now: NOW,
  });
  assert("target 0 → 2026-05-08", r.expiration === "2026-05-08");
  assert("matched = preferred", r.matched === EXPIRATION_RESOLVER_MATCHED.PREFERRED);
}

// =================================================================
// 2. Resolver — fallback when no expiration >= target
// =================================================================
group("resolver — fallback path");
{
  // Available: 2026-05-08 (7d), 2026-05-15 (14d). Target 30 → no preferred.
  // Fallback = smallest future >= today = 2026-05-08.
  const r = resolveNearestExpiration({
    availableExpirations: ["20260508", "20260515"],
    targetDte: 30,
    now: NOW,
  });
  assert("fallback expiration = 2026-05-08", r.expiration === "2026-05-08");
  assert("fallback dte = 7", r.dte === 7);
  assert("matched = fallback", r.matched === EXPIRATION_RESOLVER_MATCHED.FALLBACK);
  assert("reason = null on fallback success", r.reason === null);
  assert("targetDte echoed = 30", r.targetDte === 30);
}

// =================================================================
// 3. Resolver — empty / past-only / invalid lists
// =================================================================
group("resolver — empty + invalid");
{
  const r = resolveNearestExpiration({
    availableExpirations: [],
    targetDte: 14,
    now: NOW,
  });
  assert("empty list → expiration null", r.expiration === null);
  assert("empty list reason", r.reason === EXPIRATION_RESOLVER_REASON.EMPTY_LIST);
  assert("empty list matched null", r.matched === null);
}

{
  const r = resolveNearestExpiration({
    availableExpirations: ["20250101", "20250215"],   // both past
    targetDte: 14,
    now: NOW,
  });
  assert("past-only → expiration null", r.expiration === null);
  assert("past-only reason no_future_expirations",
    r.reason === EXPIRATION_RESOLVER_REASON.NO_FUTURE);
}

{
  const r = resolveNearestExpiration({
    availableExpirations: null,
    targetDte: 14,
    now: NOW,
  });
  assert("null list tolerated → empty_list", r.expiration === null);
  assert("null list reason no_expirations_available",
    r.reason === EXPIRATION_RESOLVER_REASON.EMPTY_LIST);
}

{
  const r = resolveNearestExpiration({
    availableExpirations: ["20260515"],
    targetDte: "garbage",
    now: NOW,
  });
  assert("invalid targetDte falls back to nearest future",
    r.expiration === "2026-05-15");
  assert("invalid targetDte reason invalid_target_dte",
    r.reason === EXPIRATION_RESOLVER_REASON.INVALID_TARGET);
  assert("matched = fallback when target invalid",
    r.matched === EXPIRATION_RESOLVER_MATCHED.FALLBACK);
  assert("targetDte = null when invalid", r.targetDte === null);
}

// =================================================================
// 4. Resolver — malformed entries dropped silently
// =================================================================
group("resolver — malformed entries dropped");
{
  const r = resolveNearestExpiration({
    availableExpirations: [
      null,
      undefined,
      "not_a_date",
      "20260",                 // numeric but invalid
      {},
      [],
      "2026-05-15",
      "20260619",
    ],
    targetDte: 14,
    now: NOW,
  });
  assert("malformed dropped, picks 2026-05-15",
    r.expiration === "2026-05-15");
  assert("matched preferred", r.matched === EXPIRATION_RESOLVER_MATCHED.PREFERRED);
}

{
  const r = resolveNearestExpiration({
    availableExpirations: ["2026-05-15", "20260515", "2026-05-15"],   // duplicates
    targetDte: 14,
    now: NOW,
  });
  assert("duplicate inputs deduplicated", r.expiration === "2026-05-15");
}

// =================================================================
// 5. Resolver — output shape and immutability
// =================================================================
group("resolver — output shape");
{
  const r = resolveNearestExpiration({
    availableExpirations: ["20260515"],
    targetDte: 14,
    now: NOW,
  });
  const expectedKeys = new Set(["expiration", "dte", "matched", "reason", "targetDte"]);
  const actualKeys = new Set(Object.keys(r));
  let allWhitelisted = true;
  for (const k of actualKeys) {
    if (!expectedKeys.has(k)) allWhitelisted = false;
  }
  assert("output keys match whitelist", allWhitelisted);
  assert("output has all 5 keys", actualKeys.size === 5);
  assert("output is frozen", Object.isFrozen(r));
}

// =================================================================
// 6. ThetaData payload parser — positional / flat / mismatched
// =================================================================
group("parseThetaDataExpirationsPayload");
{
  // Canonical positional shape.
  const out1 = parseThetaDataExpirationsPayload({
    header: { format: ["expiration"] },
    response: [[20260117], [20260214], [20260321]],
  });
  assert("positional → 3 ISO strings",
    Array.isArray(out1) && out1.length === 3);
  assert("positional[0] = 2026-01-17", out1[0] === "2026-01-17");
  assert("positional[2] = 2026-03-21", out1[2] === "2026-03-21");
}

{
  // Flat shape (some terminals emit this for single-column rows).
  const out = parseThetaDataExpirationsPayload({
    response: [20260117, 20260214],
  });
  assert("flat → 2 ISO strings",
    Array.isArray(out) && out.length === 2);
  assert("flat[0] = 2026-01-17", out[0] === "2026-01-17");
}

{
  // Mismatched / null payloads.
  assert("null payload → null",
    parseThetaDataExpirationsPayload(null) === null);
  assert("missing response → null",
    parseThetaDataExpirationsPayload({ header: { format: ["expiration"] } }) === null);
  const empty = parseThetaDataExpirationsPayload({ response: [] });
  assert("empty response → []",
    Array.isArray(empty) && empty.length === 0);
}

{
  // Mixed valid + malformed entries dropped silently.
  const out = parseThetaDataExpirationsPayload({
    response: [[20260117], [null], ["garbage"], [20260214]],
  });
  assert("mixed shape preserves valid entries",
    Array.isArray(out) && out.length === 2);
  assert("dedup preserves order",
    out[0] === "2026-01-17" && out[1] === "2026-02-14");
}

// =================================================================
// 7. ThetaData fetchExpirations — gated on health
// =================================================================
group("ThetaData fetchExpirations — health gate");
{
  // Provider not enabled → fetchExpirations returns null.
  const provider = createThetaDataProvider({
    enabled: false,
    baseUrl: "http://127.0.0.1:25503",
  });
  const result = await provider.fetchExpirations("NVDA");
  assert("disabled provider returns null", result === null);
}

{
  // Provider enabled with mock fetcher that returns expirations.
  const calls = [];
  const fetcher = async (path) => {
    calls.push(path);
    // Phase 4.5C+2: health probe canary AND fetchExpirations both hit
    // /v3/option/list/expirations — distinguish by `symbol=` value.
    if (path.startsWith("/v3/option/list/expirations") && path.includes("symbol=SPY")) {
      return { response: [{ expiration: 20260101 }] };   // canary; non-empty + non-410 ⇒ alive
    }
    if (path.startsWith("/v3/option/list/expirations") && path.includes("symbol=NVDA")) {
      return {
        response: [[20260515], [20260619], [20260717]],
      };
    }
    return null;
  };
  const provider = createThetaDataProvider({
    enabled: true,
    baseUrl: "http://127.0.0.1:25503",
    fetcher,
  });
  const out = await provider.fetchExpirations("NVDA");
  assert("healthy provider returns expirations",
    Array.isArray(out) && out.length === 3);
  assert("expirations sorted/normalized",
    out[0] === "2026-05-15");
  assert("fetchExpirations called the right path (v3, symbol=NVDA, format=json)",
    calls.some(p => p.startsWith("/v3/option/list/expirations")
                 && p.includes("symbol=NVDA")
                 && p.includes("format=json")));
}

{
  // Provider rejects empty/blank symbol.
  const fetcher = async () => ({ header: {}, response: [] });
  const provider = createThetaDataProvider({
    enabled: true,
    baseUrl: "http://127.0.0.1:25503",
    fetcher,
  });
  // Force health to be available first
  await provider.checkHealth();
  const out = await provider.fetchExpirations("");
  assert("empty symbol returns null", out === null);
}

{
  // Fetcher throws → fetchExpirations swallows and returns null.
  let calls = 0;
  const fetcher = async (path) => {
    calls++;
    if (path.startsWith("/v3/option/list/expirations") && path.includes("symbol=SPY")) {
      return { header: {}, response: [[1]] };
    }
    throw new Error("boom");
  };
  const provider = createThetaDataProvider({
    enabled: true,
    baseUrl: "http://127.0.0.1:25503",
    fetcher,
  });
  const out = await provider.fetchExpirations("NVDA");
  assert("fetcher error returns null (no throw)", out === null);
  assert("fetcher was actually called", calls >= 1);
}

// =================================================================
// 8. createOptionsChainProvider — fetchExpirations is callable
// =================================================================
group("provider dispatcher — fetchExpirations exists");
{
  // No env → unavailable provider, fetchExpirations resolves to null.
  const provider = createOptionsChainProvider({ env: {} });
  assert("unavailable.fetchExpirations exists",
    typeof provider.fetchExpirations === "function");
  const out = await provider.fetchExpirations("NVDA");
  assert("unavailable.fetchExpirations → null", out === null);
}

{
  const provider = createOptionsChainProvider({
    env: {
      VITE_THETADATA_ENABLED: "true",
      VITE_THETADATA_BASE_URL: "http://127.0.0.1:25503",
    },
    fetcher: async () => null,
  });
  assert("enabled.fetchExpirations exists",
    typeof provider.fetchExpirations === "function");
}

// =================================================================
// 9. tradeConstructionContext surfaces resolvedExpiration*
// =================================================================
group("tradeConstructionContext — resolved expiration");

function makeScanResult(candidates) {
  return {
    scannerMode: "neutral",
    regimeContext: { detectedRegime: "RISK_ON" },
    accountStateSummary: {},
    universeStats: {},
    ranked: [],
    rejected: [],
    warnings: [],
    candidates,
  };
}

function fullCandidate(symbol = "NVDA") {
  return {
    symbol, price: 110.5, atr: 2.4,
    classification: { primaryType: "breakout_candidate", confidence: 0.7 },
    primaryType: "breakout_candidate",
    premiumSource: "estimated", premiumScore: 6,
    premiumEstimate: {
      method: "iv_estimated",
      preferredStrike: 105, preferredDte: 14,
      estimatedPremium: 1.45, collateralRequired: 10_500,
      liquidityGrade: "unknown", spreadRisk: "unknown",
    },
  };
}

{
  // No resolvedExpiration provided → all resolved* fields null.
  const ctx = buildTradeConstructionContext({
    scanResult: makeScanResult([fullCandidate("NVDA")]),
    selectedSymbol: "NVDA",
  });
  assert("ctx.resolvedExpiration null when no input",
    ctx.resolvedExpiration === null);
  assert("ctx.resolvedExpirationDte null", ctx.resolvedExpirationDte === null);
  assert("ctx.resolvedExpirationLabel null", ctx.resolvedExpirationLabel === null);
  assert("ctx.resolvedExpirationMatched null", ctx.resolvedExpirationMatched === null);
  assert("ctx.resolvedExpirationReason null", ctx.resolvedExpirationReason === null);
}

{
  // Successful resolver output → fields surface.
  const resolvedInput = {
    expiration: "2026-05-15",
    dte: 14,
    matched: "preferred",
    reason: null,
  };
  const ctx = buildTradeConstructionContext({
    scanResult: makeScanResult([fullCandidate("NVDA")]),
    selectedSymbol: "NVDA",
    resolvedExpiration: resolvedInput,
  });
  assert("resolvedExpiration = 2026-05-15",
    ctx.resolvedExpiration === "2026-05-15");
  assert("resolvedExpirationDte = 14", ctx.resolvedExpirationDte === 14);
  assert("resolvedExpirationLabel = '14 DTE (2026-05-15)'",
    ctx.resolvedExpirationLabel === "14 DTE (2026-05-15)");
  assert("resolvedExpirationMatched = preferred",
    ctx.resolvedExpirationMatched === "preferred");
  assert("resolvedExpirationReason null on success",
    ctx.resolvedExpirationReason === null);
}

{
  // Failure case with reason surfaces gracefully.
  const ctx = buildTradeConstructionContext({
    scanResult: makeScanResult([fullCandidate("NVDA")]),
    selectedSymbol: "NVDA",
    resolvedExpiration: {
      expiration: null, dte: null, matched: null, reason: "no_expirations_available",
    },
  });
  assert("expiration null", ctx.resolvedExpiration === null);
  assert("reason surfaces", ctx.resolvedExpirationReason === "no_expirations_available");
  assert("label null when expiration null",
    ctx.resolvedExpirationLabel === null);
}

{
  // Hostile resolver fields stripped — extra keys never reach output.
  const hostile = {
    expiration: "2026-05-15", dte: 14, matched: "preferred", reason: null,
    apiKey: "sk_live_secret", debug: { internal: true }, scoreBreakdown: { x: 1 },
  };
  const ctx = buildTradeConstructionContext({
    scanResult: makeScanResult([fullCandidate("NVDA")]),
    selectedSymbol: "NVDA",
    resolvedExpiration: hostile,
  });
  assert("apiKey not surfaced", !("apiKey" in ctx));
  assert("debug not surfaced", !("debug" in ctx));
  assert("scoreBreakdown not surfaced", !("scoreBreakdown" in ctx));
  assert("legitimate field still present",
    ctx.resolvedExpiration === "2026-05-15");
}

{
  // Malformed expiration string → all resolved* fields null.
  const ctx = buildTradeConstructionContext({
    scanResult: makeScanResult([fullCandidate("NVDA")]),
    selectedSymbol: "NVDA",
    resolvedExpiration: {
      expiration: "May 15 2026",   // wrong format → rejected
      dte: 14, matched: "preferred",
    },
  });
  assert("malformed expiration → null",
    ctx.resolvedExpiration === null);
  assert("malformed expiration → no label",
    ctx.resolvedExpirationLabel === null);
}

{
  // Bad matched value rejected.
  const ctx = buildTradeConstructionContext({
    scanResult: makeScanResult([fullCandidate("NVDA")]),
    selectedSymbol: "NVDA",
    resolvedExpiration: {
      expiration: "2026-05-15", dte: 14, matched: "imaginary_value",
    },
  });
  assert("invalid matched → null", ctx.resolvedExpirationMatched === null);
  assert("expiration still surfaces", ctx.resolvedExpiration === "2026-05-15");
}

// =================================================================
// 10. Whitelist count — Phase 4.5C+1 keys
// =================================================================
group("tradeContext — Phase 4.5C+1 whitelist");
{
  const ctx = buildTradeConstructionContext({
    scanResult: makeScanResult([fullCandidate("NVDA")]),
    selectedSymbol: "NVDA",
  });
  const expectedKeys = new Set([
    "symbol", "currentPrice", "suggestedStrike", "expirationDte", "expirationLabel",
    "resolvedExpiration", "resolvedExpirationDte", "resolvedExpirationLabel",
    "resolvedExpirationMatched", "resolvedExpirationReason",
    "premiumSource", "estimatedPremium", "estimatedCollateral", "atr",
    "support", "r1", "r2",
    "distanceFromPriceToStrike", "distanceFromPriceToStrikePct",
    "distanceFromSupportToStrike", "distanceFromSupportToStrikePct",
    "atrDistanceFromStrike",
    "bid", "ask", "mid", "last",
    "liquidityGrade", "spreadRisk", "spreadWidthLabel", "liquidityWarning",
    "verifyWarning",
  ]);
  const actualKeys = new Set(Object.keys(ctx));
  let allKnown = true;
  let allPresent = true;
  for (const k of actualKeys) if (!expectedKeys.has(k)) allKnown = false;
  for (const k of expectedKeys) if (!actualKeys.has(k)) allPresent = false;
  assert("every output key in whitelist", allKnown);
  assert("every whitelisted key present", allPresent);
  assert(`output count = ${expectedKeys.size}`,
    actualKeys.size === expectedKeys.size);
}

// =================================================================
// 11. LethalBoardPage source check — wires resolver + fetchExpirations
// =================================================================
group("LethalBoardPage source — wiring");
{
  const src = readFileSync("src/components/discovery/LethalBoardPage.jsx", "utf8");
  assert("imports resolveNearestExpiration",
    /resolveNearestExpiration/.test(src));
  assert("calls provider.fetchExpirations",
    /fetchExpirations\(/.test(src));
  assert("passes resolvedExpiration into buildTradeConstructionContext",
    /resolvedExpiration:/.test(src));
  assert("no longer constructs naive `today + DTE` calendar guess for the chain fetch",
    !/Date\.now\(\)\s*\+\s*Number\(est\.preferredDte\)\s*\*\s*86_400_000/.test(src));
}

// =================================================================
// SUMMARY
// =================================================================
console.log("\n  ════════════════════════════════════════════");
console.log(`  Phase 4.5C+1: ${passed} passed, ${failed} failed (total ${passed + failed})`);
if (failed > 0) {
  console.log("\n  Failures:");
  for (const line of failureLines) console.log("    ✗ " + line);
  process.exit(1);
}
process.exit(0);
