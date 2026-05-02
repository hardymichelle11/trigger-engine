#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.5C tests
// Run: npm run test:discovery-phase4-5c
// =====================================================
//
// Verifies the ThetaData options provider adapter:
//   - health check states (missing_credentials / terminal_not_running /
//     unauthorized / unavailable_plan / available)
//   - strike scaling, expiration normalization, C/P normalization
//   - bid/ask/mid calculation, last fallback
//   - malformed row handling
//   - snapshot positional payload parsing
//   - whitelist output (no hostile fields pass through)
//   - UI does not receive raw ThetaData fields
//   - scanner still works when ThetaData unavailable
//   - no direct browser WebSocket connection in UI files
//   - no credentials/secrets logged or rendered
//   - .env.example placeholders present, .gitignore protects .env
// =====================================================

import { readFileSync } from "node:fs";
import { transformWithOxc } from "vite";

import {
  HEALTH_STATUS,
  SNAPSHOT_STATUS,
  PROVIDER_NAME,
} from "../src/providers/options/optionsProviderTypes.js";

import {
  normalizeStrike,
  normalizeExpiration,
  normalizeRight,
  computeMid,
  normalizeRow,
  normalizeChain,
  parseThetaDataSnapshotPayload,
} from "../src/providers/options/normalizeOptionChain.js";

import {
  createThetaDataProvider,
  sanitizeErrorMessage,
  classifyError,
} from "../src/providers/options/thetaDataProvider.js";

import {
  createOptionsChainProvider,
  createUnavailableProvider,
  readProviderConfigFromEnv,
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

function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.5C");
console.log("  ════════════════════════════════════════════");

// =================================================================
// 1. Field normalizers
// =================================================================
group("normalizers — strike / expiration / right");
{
  // Strike scaling
  assert("strike 140000 → 140.00", normalizeStrike(140000) === 140);
  assert("strike 147500 → 147.50", normalizeStrike(147500) === 147.5);
  assert("strike 0 → null", normalizeStrike(0) === null);
  assert("strike negative → null", normalizeStrike(-100) === null);
  assert("strike non-numeric → null", normalizeStrike("not_a_number") === null);
  assert("strike null → null", normalizeStrike(null) === null);

  // Expiration normalization
  assert("'20260919' → '2026-09-19'", normalizeExpiration("20260919") === "2026-09-19");
  assert("'2026-09-19' passes through", normalizeExpiration("2026-09-19") === "2026-09-19");
  assert("ISO date parsable falls back",
    normalizeExpiration("2026-09-19T16:00:00Z") === "2026-09-19");
  assert("malformed '20260' → null", normalizeExpiration("20260") === null);
  assert("null → null", normalizeExpiration(null) === null);
  assert("empty string → null", normalizeExpiration("") === null);

  // Right normalization
  assert("'C' → 'call'", normalizeRight("C") === "call");
  assert("'P' → 'put'", normalizeRight("P") === "put");
  assert("'call' passes through", normalizeRight("call") === "call");
  assert("'put' passes through", normalizeRight("put") === "put");
  assert("'CALL' (case-insensitive) → 'call'", normalizeRight("CALL") === "call");
  assert("'X' → null", normalizeRight("X") === null);
  assert("null → null", normalizeRight(null) === null);
}

// =================================================================
// 2. Mid calculation
// =================================================================
group("computeMid — bid/ask/last logic");
{
  assert("both bid and ask present → average",
    computeMid({ bid: 1.40, ask: 1.50 }) === 1.45);
  assert("ask < bid → null (invalid)",
    computeMid({ bid: 1.50, ask: 1.40 }) === null);
  assert("missing ask, no last → null",
    computeMid({ bid: 1.40, ask: null }) === null);
  assert("missing bid, no last → null",
    computeMid({ bid: null, ask: 1.50 }) === null);
  assert("missing both, last present → uses last",
    computeMid({ bid: null, ask: null, last: 1.45 }) === 1.45);
  assert("missing both, no last → null",
    computeMid({ bid: null, ask: null }) === null);
  assert("zero bid/ask are valid (not >0 required for bid/ask)",
    computeMid({ bid: 0.0, ask: 0.02 }) === 0.01);
}

// =================================================================
// 3. Full row normalization + whitelist
// =================================================================
group("normalizeRow — output shape and whitelist");
{
  const raw = {
    bid: 1.40, ask: 1.50, last: 1.48,
    volume: 800, open_interest: 1500,
    iv: 0.32, delta: -0.35, theta: -0.08, gamma: 0.04, vega: 0.12,
    lastUpdated: 1_756_000_000_000,
    // Hostile vendor extras that MUST be stripped
    raw_internal_token: "xyz123",
    debug: "something",
    scoreBreakdown: { x: 1 },
    apiKey: "shouldnotappear",
    rawStatus: "ok",
  };
  const row = normalizeRow(raw, {
    symbol: "NVDA", expiration: "20260919", strike: 140, right: "P",
  });
  assert("returns object", !!row);
  assert("provider tag = thetadata", row.provider === "thetadata");
  assert("symbol uppercase", row.symbol === "NVDA");
  assert("expiration normalized", row.expiration === "2026-09-19");
  assert("strike from hint preserved", row.strike === 140);
  assert("type = put", row.type === "put");
  assert("bid = 1.40", row.bid === 1.40);
  assert("ask = 1.50", row.ask === 1.50);
  assert("mid = 1.45", row.mid === 1.45);
  assert("last = 1.48", row.last === 1.48);
  assert("status = live (has quotes, no staleness check)", row.status === "live");
  assert("rawStatus passes through", row.rawStatus === "ok");
  assert("row is frozen (immutable)", Object.isFrozen(row));

  // Hostile fields stripped
  for (const banned of [
    "raw_internal_token", "debug", "scoreBreakdown", "apiKey",
  ]) {
    assert(`row does NOT expose '${banned}'`, !(banned in row));
  }

  // Output keys are exactly the documented whitelist
  const expectedKeys = new Set([
    "provider", "status", "symbol", "expiration", "strike", "type",
    "bid", "ask", "mid", "last",
    "volume", "openInterest", "iv", "delta", "theta", "gamma", "vega",
    "lastUpdated", "rawStatus",
  ]);
  for (const k of Object.keys(row)) {
    assert(`row key '${k}' is whitelisted`, expectedKeys.has(k));
  }
  assert(`row key count matches whitelist (${expectedKeys.size})`,
    Object.keys(row).length === expectedKeys.size);
}

// =================================================================
// 4. Malformed row handling
// =================================================================
group("normalizeRow — malformed input does not crash");
{
  let threw = false;
  try {
    assert("null row → null", normalizeRow(null) === null);
    assert("undefined row → null", normalizeRow(undefined) === null);
    assert("string row → null", normalizeRow("not_an_object") === null);
    assert("missing symbol → null",
      normalizeRow({ bid: 1, ask: 2 }, { expiration: "20260919", strike: 140, right: "P" }) === null);
    assert("missing expiration → null",
      normalizeRow({ bid: 1, ask: 2 }, { symbol: "NVDA", strike: 140, right: "P" }) === null);
    assert("missing strike → null",
      normalizeRow({ bid: 1, ask: 2 }, { symbol: "NVDA", expiration: "20260919", right: "P" }) === null);
    assert("missing right → null",
      normalizeRow({ bid: 1, ask: 2 }, { symbol: "NVDA", expiration: "20260919", strike: 140 }) === null);
    // Quote missing → status = unavailable but row still emitted
    const noQuote = normalizeRow({}, { symbol: "NVDA", expiration: "20260919", strike: 140, right: "P" });
    assert("no quote → status = unavailable",
      noQuote && noQuote.status === SNAPSHOT_STATUS.UNAVAILABLE);
  } catch (e) { threw = true; failureLines.push("crashed: " + e.message); }
  assert("normalizeRow does not throw", !threw);
}

// =================================================================
// 5. Positional ThetaData payload parsing
// =================================================================
group("parseThetaDataSnapshotPayload — positional format");
{
  const payload = {
    header: {
      id: "abc",
      format: ["bid_size", "bid", "ask_size", "ask", "last", "volume", "open_interest", "iv"],
      latency_ms: 100,
      next_page: null,
      error_type: "null",
    },
    response: [[100, 1.40, 100, 1.50, 1.48, 800, 1500, 0.32]],
  };
  const obj = parseThetaDataSnapshotPayload(payload);
  assert("returns object", !!obj);
  assert("bid mapped", obj.bid === 1.40);
  assert("ask mapped", obj.ask === 1.50);
  assert("last mapped", obj.last === 1.48);
  assert("volume mapped", obj.volume === 800);
  assert("open_interest mapped", obj.open_interest === 1500);
  assert("iv mapped", obj.iv === 0.32);
  assert("error_type passes through", obj.error_type === "null");

  // Malformed payloads
  assert("null payload → null", parseThetaDataSnapshotPayload(null) === null);
  assert("missing header → null", parseThetaDataSnapshotPayload({ response: [[1, 2]] }) === null);
  assert("missing response → null", parseThetaDataSnapshotPayload({ header: { format: [] } }) === null);
  assert("empty response array → null",
    parseThetaDataSnapshotPayload({ header: { format: ["bid"] }, response: [] }) === null);
}

// =================================================================
// 6. Health check — missing credentials path
// =================================================================
group("ThetaData provider — missing credentials");
{
  // No config at all
  const p1 = createThetaDataProvider({});
  const h1 = await p1.checkHealth();
  assert("no config → status = missing_credentials",
    h1.status === HEALTH_STATUS.MISSING_CREDENTIALS);
  assert("reason = thetadata_not_enabled",
    h1.reason === "thetadata_not_enabled");

  // Enabled but baseUrl missing
  const p2 = createThetaDataProvider({ enabled: true });
  const h2 = await p2.checkHealth();
  assert("enabled w/o baseUrl → missing_credentials",
    h2.status === HEALTH_STATUS.MISSING_CREDENTIALS);
  assert("reason = base_url_missing",
    h2.reason === "base_url_missing");

  // credentialsRequired but apiKey missing
  const p3 = createThetaDataProvider({
    enabled: true, baseUrl: "http://127.0.0.1:25510",
    credentialsRequired: true,
  });
  const h3 = await p3.checkHealth();
  assert("credentialsRequired w/o apiKey → missing_credentials",
    h3.status === HEALTH_STATUS.MISSING_CREDENTIALS);
  assert("reason = api_key_missing",
    h3.reason === "api_key_missing");

  // fetchSnapshot returns null when health is not available
  const snap = await p1.fetchSnapshot({
    symbol: "NVDA", expiration: "2026-09-19", strike: 140, right: "put",
  });
  assert("fetchSnapshot returns null when missing_credentials", snap === null);
}

// =================================================================
// 7. Health check — terminal_not_running / connection_refused
// =================================================================
group("ThetaData provider — terminal not running");
{
  const refusedFetcher = async () => {
    const err = new Error("Failed to fetch");
    err.code = "ECONNREFUSED";
    throw err;
  };
  const p = createThetaDataProvider({
    enabled: true, baseUrl: "http://127.0.0.1:25510",
    fetcher: refusedFetcher,
  });
  const h = await p.checkHealth();
  assert("ECONNREFUSED → terminal_not_running",
    h.status === HEALTH_STATUS.TERMINAL_NOT_RUNNING);
  assert("reason = connection_refused",
    h.reason === "connection_refused");

  // Snapshot returns null (no live fetch attempted)
  const snap = await p.fetchSnapshot({
    symbol: "NVDA", expiration: "2026-09-19", strike: 140, right: "put",
  });
  assert("fetchSnapshot returns null when terminal_not_running", snap === null);
}

// =================================================================
// 8. Health check — unauthorized
// =================================================================
group("ThetaData provider — unauthorized / unavailable_plan");
{
  const fetch401 = async () => { const e = new Error("http_401"); e.status = 401; throw e; };
  const p401 = createThetaDataProvider({
    enabled: true, baseUrl: "http://127.0.0.1:25510", fetcher: fetch401,
  });
  const h401 = await p401.checkHealth();
  assert("HTTP 401 → unauthorized", h401.status === HEALTH_STATUS.UNAUTHORIZED);

  const fetch403 = async () => { const e = new Error("http_403"); e.status = 403; throw e; };
  const p403 = createThetaDataProvider({
    enabled: true, baseUrl: "http://127.0.0.1:25510", fetcher: fetch403,
  });
  const h403 = await p403.checkHealth();
  assert("HTTP 403 → unauthorized", h403.status === HEALTH_STATUS.UNAUTHORIZED);

  const fetch402 = async () => { const e = new Error("http_402"); e.status = 402; throw e; };
  const p402 = createThetaDataProvider({
    enabled: true, baseUrl: "http://127.0.0.1:25510", fetcher: fetch402,
  });
  const h402 = await p402.checkHealth();
  assert("HTTP 402 → unavailable_plan", h402.status === HEALTH_STATUS.UNAVAILABLE_PLAN);

  const fetch500 = async () => { const e = new Error("http_500"); e.status = 500; throw e; };
  const p500 = createThetaDataProvider({
    enabled: true, baseUrl: "http://127.0.0.1:25510", fetcher: fetch500,
  });
  const h500 = await p500.checkHealth();
  assert("HTTP 500 → unavailable", h500.status === HEALTH_STATUS.UNAVAILABLE);

  const fetchTimeout = async () => { const e = new Error("aborted"); e.code = "ETIMEDOUT"; throw e; };
  const pT = createThetaDataProvider({
    enabled: true, baseUrl: "http://127.0.0.1:25510", fetcher: fetchTimeout,
  });
  const hT = await pT.checkHealth();
  assert("timeout → unavailable", hT.status === HEALTH_STATUS.UNAVAILABLE);
  assert("timeout reason captured", hT.reason === "timeout");
}

// =================================================================
// 9. Health check — available + snapshot fetch path
// =================================================================
group("ThetaData provider — available path + snapshot");
{
  const okFetcher = async (path) => {
    if (path.startsWith("/v2/list/exchanges")) {
      return { header: { format: [] }, response: [], status: "OK" };
    }
    if (path.startsWith("/v2/snapshot/option/quote")) {
      return {
        header: { format: ["bid", "ask", "last", "volume", "open_interest", "iv"], error_type: "null" },
        response: [[1.40, 1.50, 1.48, 800, 1500, 0.32]],
      };
    }
    return null;
  };
  const p = createThetaDataProvider({
    enabled: true, baseUrl: "http://127.0.0.1:25510", fetcher: okFetcher,
  });

  const h = await p.checkHealth();
  assert("ok response → available", h.status === HEALTH_STATUS.AVAILABLE);

  const snap = await p.fetchSnapshot({
    symbol: "NVDA", expiration: "2026-09-19", strike: 140, right: "put",
  });
  assert("snapshot returns normalized row", !!snap);
  assert("snapshot symbol = NVDA", snap?.symbol === "NVDA");
  assert("snapshot strike = 140", snap?.strike === 140);
  assert("snapshot type = put", snap?.type === "put");
  assert("snapshot bid = 1.40", snap?.bid === 1.40);
  assert("snapshot ask = 1.50", snap?.ask === 1.50);
  assert("snapshot mid = 1.45", snap?.mid === 1.45);
  assert("snapshot status = live", snap?.status === SNAPSHOT_STATUS.LIVE);
  assert("snapshot provider = thetadata", snap?.provider === "thetadata");

  // Health is cached — second checkHealth should not refetch
  const h2 = await p.checkHealth();
  assert("health is cached", h.checkedAt === h2.checkedAt);
}

// =================================================================
// 10. fetchSnapshot — invalid arg handling
// =================================================================
group("fetchSnapshot — invalid arguments");
{
  const okFetcher = async () => ({
    header: { format: ["bid", "ask"], error_type: "null" },
    response: [[1.40, 1.50]],
  });
  const p = createThetaDataProvider({
    enabled: true, baseUrl: "http://127.0.0.1:25510", fetcher: okFetcher,
  });
  await p.checkHealth();

  assert("missing symbol → null",
    (await p.fetchSnapshot({ expiration: "2026-09-19", strike: 140, right: "put" })) === null);
  assert("missing strike → null",
    (await p.fetchSnapshot({ symbol: "NVDA", expiration: "2026-09-19", right: "put" })) === null);
  assert("missing right → null",
    (await p.fetchSnapshot({ symbol: "NVDA", expiration: "2026-09-19", strike: 140 })) === null);
  assert("invalid right ('X') → null",
    (await p.fetchSnapshot({ symbol: "NVDA", expiration: "2026-09-19", strike: 140, right: "X" })) === null);
}

// =================================================================
// 11. Error message sanitization (no secret leakage)
// =================================================================
group("error message sanitization");
{
  assert("api_key=abc redacted",
    sanitizeErrorMessage("connection failed: api_key=abc123def") === "connection failed: api_key=***");
  assert("Bearer token redacted",
    sanitizeErrorMessage("auth failed Bearer eyJabc.def.ghi") === "auth failed Bearer ***");
  assert("password=hunter2 redacted",
    sanitizeErrorMessage("ERR password=hunter2 oops") === "ERR password=*** oops");
  assert("normal error preserved",
    sanitizeErrorMessage("connection refused") === "connection refused");
  assert("non-string → fallback",
    sanitizeErrorMessage(null) === "unknown_error");
  // Length cap
  const long = "x".repeat(300);
  assert("over 160 chars → truncated with ellipsis",
    sanitizeErrorMessage(long).length <= 161 && sanitizeErrorMessage(long).endsWith("…"));
}

// =================================================================
// 12. classifyError vocabulary
// =================================================================
group("classifyError — error → health status");
{
  const refused = classifyError({ code: "ECONNREFUSED" });
  assert("ECONNREFUSED → terminal_not_running",
    refused.status === HEALTH_STATUS.TERMINAL_NOT_RUNNING);

  const timeout = classifyError({ code: "ETIMEDOUT" });
  assert("ETIMEDOUT → unavailable + reason=timeout",
    timeout.status === HEALTH_STATUS.UNAVAILABLE && timeout.reason === "timeout");

  const unauthorized = classifyError({ status: 401 });
  assert("status 401 → unauthorized",
    unauthorized.status === HEALTH_STATUS.UNAUTHORIZED);

  const planError = classifyError({ status: 402 });
  assert("status 402 → unavailable_plan",
    planError.status === HEALTH_STATUS.UNAVAILABLE_PLAN);

  const unknown = classifyError({});
  assert("unknown error → unknown_error",
    unknown.status === HEALTH_STATUS.UNKNOWN_ERROR);
}

// =================================================================
// 13. Dispatcher — readProviderConfigFromEnv (security: VITE_ is non-secret only)
// =================================================================
group("readProviderConfigFromEnv — VITE_ is non-secret only");
{
  // Non-secret browser-safe config IS read from VITE_*
  const cfg = readProviderConfigFromEnv({
    VITE_THETADATA_ENABLED: "true",
    VITE_THETADATA_BASE_URL: "http://127.0.0.1:25510",
    VITE_THETADATA_TIMEOUT_MS: "3000",
    // SECURITY: anything below is hostile injection — code MUST ignore it.
    VITE_THETADATA_API_KEY: "super-secret-key",
    VITE_THETADATA_TOKEN: "tok_xyz",
    VITE_THETADATA_PASSWORD: "hunter2",
    VITE_THETADATA_CREDENTIALS_REQUIRED: "true",
  });
  assert("enabled = true", cfg.enabled === true);
  assert("baseUrl preserved", cfg.baseUrl === "http://127.0.0.1:25510");
  assert("timeoutMs parsed", cfg.timeoutMs === 3000);

  // SECURITY: cfg must NOT carry apiKey / token / password — even masked.
  // The function never reads these. They simply do not exist on the output.
  assert("cfg has NO apiKey property", !("apiKey" in cfg));
  assert("cfg has NO hasApiKey property", !("hasApiKey" in cfg));
  assert("cfg has NO credentialsRequired property", !("credentialsRequired" in cfg));
  assert("cfg has NO token property", !("token" in cfg));
  assert("cfg has NO password property", !("password" in cfg));

  // Empty env still returns clean config
  const empty = readProviderConfigFromEnv({});
  assert("empty env → enabled = false", empty.enabled === false);
  assert("empty env → baseUrl = null", empty.baseUrl === null);
  assert("empty env → timeoutMs = null", empty.timeoutMs === null);

  // Output keys are exactly the non-secret whitelist
  const allowedKeys = new Set(["providerName", "enabled", "baseUrl", "timeoutMs"]);
  for (const k of Object.keys(cfg)) {
    assert(`cfg key '${k}' is in non-secret whitelist`, allowedKeys.has(k));
  }
  assert("cfg key count matches whitelist", Object.keys(cfg).length === allowedKeys.size);

  // Source-level grep — serialized config NEVER carries the literal secret
  const json = JSON.stringify(cfg);
  assert("serialized config does NOT contain raw 'super-secret-key'",
    !json.includes("super-secret-key"));
  assert("serialized config does NOT contain 'tok_xyz'",
    !json.includes("tok_xyz"));
  assert("serialized config does NOT contain 'hunter2'",
    !json.includes("hunter2"));
}

// =================================================================
// 13b. Provider factory — VITE_THETADATA_API_KEY is IGNORED
// =================================================================
group("createOptionsChainProvider — ignores VITE_THETADATA_API_KEY");
{
  // Even if the user mistakenly puts a real key in VITE_THETADATA_API_KEY,
  // our code MUST NOT use it. Key is accepted ONLY via explicit options.apiKey.
  const provider = createOptionsChainProvider({
    env: {
      VITE_THETADATA_ENABLED: "true",
      VITE_THETADATA_BASE_URL: "http://127.0.0.1:25510",
      VITE_THETADATA_API_KEY: "would-leak-into-bundle",
    },
    fetcher: async () => ({ header: { format: [] }, response: [], status: "OK" }),
    // No explicit credentialsRequired → defaults to false
  });
  const h = await provider.checkHealth();
  // Provider becomes "available" because Terminal model doesn't need a key.
  // The point: the VITE_-supplied key is never even consulted.
  assert("provider proceeds without VITE_ key", h.status === HEALTH_STATUS.AVAILABLE);

  // When credentialsRequired = true (explicit DI), VITE_ key is STILL ignored.
  // Without explicit options.apiKey, provider must report missing_credentials.
  const strict = createOptionsChainProvider({
    env: {
      VITE_THETADATA_ENABLED: "true",
      VITE_THETADATA_BASE_URL: "http://127.0.0.1:25510",
      VITE_THETADATA_API_KEY: "would-leak-into-bundle",
    },
    credentialsRequired: true,
    // intentionally NO options.apiKey
    fetcher: async () => ({ header: { format: [] }, response: [], status: "OK" }),
  });
  const h2 = await strict.checkHealth();
  assert("credentialsRequired + only VITE_ key → still missing_credentials",
    h2.status === HEALTH_STATUS.MISSING_CREDENTIALS);
  assert("reason = api_key_missing", h2.reason === "api_key_missing");

  // When apiKey is supplied via explicit DI (e.g. from a backend proxy),
  // the provider proceeds normally.
  const ok = createOptionsChainProvider({
    env: {
      VITE_THETADATA_ENABLED: "true",
      VITE_THETADATA_BASE_URL: "http://127.0.0.1:25510",
    },
    credentialsRequired: true,
    apiKey: "supplied-via-backend-DI-only",
    fetcher: async () => ({ header: { format: [] }, response: [], status: "OK" }),
  });
  const h3 = await ok.checkHealth();
  assert("explicit apiKey via DI + credentialsRequired → available",
    h3.status === HEALTH_STATUS.AVAILABLE);
}

// =================================================================
// 13c. Source code audit — optionsChainProvider does NOT read VITE_ secrets
// =================================================================
group("source audit — VITE_ secret reads forbidden");
{
  const src = readFileSync("src/providers/options/optionsChainProvider.js", "utf8");
  const codeOnly = stripComments(src);
  for (const banned of [
    "VITE_THETADATA_API_KEY",
    "VITE_THETADATA_TOKEN",
    "VITE_THETADATA_PASSWORD",
    "VITE_THETADATA_SECRET",
    "VITE_THETADATA_CREDENTIALS_REQUIRED",
  ]) {
    assert(`optionsChainProvider.js code does NOT read '${banned}'`,
      !new RegExp(banned).test(codeOnly), banned);
  }
  // Same audit for thetaDataProvider.js
  const thetaSrc = readFileSync("src/providers/options/thetaDataProvider.js", "utf8");
  const thetaCode = stripComments(thetaSrc);
  for (const banned of [
    "VITE_THETADATA_API_KEY",
    "VITE_THETADATA_TOKEN",
    "VITE_THETADATA_PASSWORD",
    "VITE_THETADATA_SECRET",
    "import.meta.env",
    "process.env",
  ]) {
    assert(`thetaDataProvider.js does NOT read '${banned}'`,
      !new RegExp(banned.replace(/\./g, "\\.")).test(thetaCode), banned);
  }
}

// =================================================================
// 14. Dispatcher — createOptionsChainProvider falls back safely
// =================================================================
group("createOptionsChainProvider — safe fallback");
{
  // No env → unavailable provider
  const noEnv = createOptionsChainProvider({});
  const h1 = await noEnv.checkHealth();
  assert("no env → missing_credentials",
    h1.status === HEALTH_STATUS.MISSING_CREDENTIALS);
  assert("no env reason = thetadata_not_enabled",
    h1.reason === "thetadata_not_enabled");
  assert("no env: fetchSnapshot returns null",
    (await noEnv.fetchSnapshot({})) === null);
  assert("no env: fetchChain returns null",
    (await noEnv.fetchChain()) === null);

  // Enabled but baseUrl missing → unavailable
  const noUrl = createOptionsChainProvider({ env: { VITE_THETADATA_ENABLED: "true" } });
  const h2 = await noUrl.checkHealth();
  assert("enabled w/o baseUrl → missing_credentials",
    h2.status === HEALTH_STATUS.MISSING_CREDENTIALS);
  assert("reason = base_url_missing", h2.reason === "base_url_missing");

  // Fully configured + ok fetcher → available
  const ok = createOptionsChainProvider({
    env: {
      VITE_THETADATA_ENABLED: "true",
      VITE_THETADATA_BASE_URL: "http://127.0.0.1:25510",
    },
    fetcher: async () => ({ header: { format: [] }, response: [], status: "OK" }),
  });
  const h3 = await ok.checkHealth();
  assert("fully configured + ok fetcher → available",
    h3.status === HEALTH_STATUS.AVAILABLE);
}

// =================================================================
// 15. createUnavailableProvider — never throws
// =================================================================
group("createUnavailableProvider — graceful no-op");
{
  const p = createUnavailableProvider({ reason: "test_reason" });
  const h = await p.checkHealth();
  assert("status = missing_credentials", h.status === HEALTH_STATUS.MISSING_CREDENTIALS);
  assert("reason captured", h.reason === "test_reason");
  assert("fetchSnapshot returns null", (await p.fetchSnapshot({})) === null);
  assert("fetchChain returns null", (await p.fetchChain()) === null);
  assert("getCachedHealth returns same result", p.getCachedHealth().reason === "test_reason");
  // resetHealthCache must not throw
  let threw = false;
  try { p.resetHealthCache(); } catch { threw = true; }
  assert("resetHealthCache does not throw", !threw);
}

// =================================================================
// 16. UI source audits — no raw ThetaData fields, no browser WS
// =================================================================
group("UI source audits — secrets, raw fields, WebSocket");
{
  const uiFiles = [
    "src/components/discovery/LethalBoard.jsx",
    "src/components/discovery/LethalBoardPage.jsx",
    "src/components/discovery/lethalBoardViewModel.js",
    "src/components/discovery/TradeConstructionSection.jsx",
    "src/components/discovery/tradeConstructionContext.js",
  ];
  for (const file of uiFiles) {
    const src = readFileSync(file, "utf8");
    const codeOnly = stripComments(src);

    // No direct WebSocket connection in UI files
    assert(`${file}: no new WebSocket(...) call`,
      !/new\s+WebSocket\s*\(/.test(codeOnly));
    assert(`${file}: no ws://127.0.0.1:25520 connection`,
      !/ws:\/\/127\.0\.0\.1:25520/.test(codeOnly));

    // No raw ThetaData column names (positional fields) in UI
    for (const banned of ["bid_size", "ask_size", "ms_of_day", "raw_status",
                          "error_type", "next_page", "latency_ms"]) {
      assert(`${file}: no raw ThetaData field '${banned}'`,
        !new RegExp(`\\b${banned}\\b`).test(codeOnly));
    }

    // No credential strings ever rendered
    for (const banned of ["VITE_THETADATA_API_KEY", "thetadata_api_key", "api_key"]) {
      assert(`${file}: no '${banned}' literal in UI`,
        !new RegExp(banned, "i").test(codeOnly));
    }
  }
}

// =================================================================
// 17. .env.example placeholders + .gitignore protection
// =================================================================
group(".env.example + .gitignore safety");
{
  const envExample = readFileSync(".env.example", "utf8");
  assert(".env.example mentions THETADATA",
    /THETADATA/i.test(envExample));
  // Placeholders should be commented out (not active)
  assert("VITE_THETADATA_ENABLED placeholder is commented",
    /^#\s*VITE_THETADATA_ENABLED/m.test(envExample));
  assert("VITE_THETADATA_BASE_URL placeholder is commented",
    /^#\s*VITE_THETADATA_BASE_URL/m.test(envExample));
  // No actual secrets in the example
  assert(".env.example has no real-looking apiKey value",
    !/VITE_THETADATA_API_KEY\s*=\s*[\w-]{16,}/m.test(envExample));
  // SECURITY: explicit warning about not putting secrets in VITE_ vars
  assert(".env.example contains the literal security warning",
    /Do not place real ThetaData secrets in VITE_ variables/i.test(envExample));
  // Should not include VITE_THETADATA_API_KEY as a placeholder line at all
  assert(".env.example does NOT include VITE_THETADATA_API_KEY placeholder",
    !/^#?\s*VITE_THETADATA_API_KEY\s*=/m.test(envExample));

  const gitignore = readFileSync(".gitignore", "utf8");
  assert(".gitignore protects .env",
    /^\.env(\s|$)/m.test(gitignore) || /^\.env\b/m.test(gitignore));
  assert(".gitignore protects .env.*",
    /^\.env\.\*/m.test(gitignore));
}

// =================================================================
// 18. Scanner regression — works without ThetaData
// =================================================================
group("scanner regression — discovery works without ThetaData");
{
  // Read existing scanner test summary from the wire-through audit
  const board = readFileSync("src/components/discovery/LethalBoard.jsx", "utf8");
  const page = readFileSync("src/components/discovery/LethalBoardPage.jsx", "utf8");
  // The page MAY import the provider but must NOT require it for scanning.
  assert("LethalBoardPage imports the provider factory",
    /createOptionsChainProvider/.test(page));
  // Provider is wired, but scanResult-driven trade-construction only
  // populates live fields when snapshot is non-null. The fallback path
  // is preserved.
  assert("LethalBoardPage passes optionChainSnapshot via tradeContext",
    /optionChainSnapshot:\s*selectedSymbol\s*\?\s*optionSnapshotsBySymbol\[selectedSymbol\]/.test(page));
  // No direct WS in the page
  assert("LethalBoardPage has no new WebSocket(",
    !/new\s+WebSocket\s*\(/.test(stripComments(page)));
  // Board still presentational
  assert("LethalBoard does not import the provider",
    !/createOptionsChainProvider/.test(board));
  assert("LethalBoard does not import thetaDataProvider",
    !/thetaDataProvider/.test(board));
}

// =================================================================
// 19. Frozen files unchanged
// =================================================================
group("frozen files unchanged (Phase 4.2/4.3 lock + Phase 4.4 lock)");
{
  for (const [name, src] of [
    ["recordedAlertsRollup.js", readFileSync("src/components/discovery/recordedAlertsRollup.js", "utf8")],
    ["recordedAlertsView.js",   readFileSync("src/components/discovery/recordedAlertsView.js", "utf8")],
    ["alertHistory.js",          readFileSync("src/lib/alerts/alertHistory.js", "utf8")],
  ]) {
    assert(`${name} does NOT reference ThetaData`,
      !/thetadata|ThetaData|theta_terminal/i.test(src));
    assert(`${name} does NOT import options provider`,
      !/createOptionsChainProvider|createThetaDataProvider/.test(src));
  }
}

// =================================================================
// 20. Provider source code — purity + no UI imports
// =================================================================
group("provider files — purity + no UI imports");
{
  for (const file of [
    "src/providers/options/optionsProviderTypes.js",
    "src/providers/options/normalizeOptionChain.js",
    "src/providers/options/thetaDataProvider.js",
    "src/providers/options/optionsChainProvider.js",
  ]) {
    const src = readFileSync(file, "utf8");
    const codeOnly = stripComments(src);
    for (const banned of [
      "alertHistory", "recordedAlertsRollup", "recordedAlertsView",
      "setupScoring", "signalEngine", "calibrationTracker",
      "LethalBoard", "lethalBoardViewModel",
      "react", "react-dom",
    ]) {
      assert(`${file}: no import of ${banned}`,
        !new RegExp(`from\\s+["'][^"']*${banned}`, "i").test(codeOnly));
    }
    // No browser-only WS connection
    assert(`${file}: no new WebSocket(`,
      !/new\s+WebSocket\s*\(/.test(codeOnly));
  }
}

// =================================================================
// 21. JSX validity (LethalBoardPage was modified)
// =================================================================
group("JSX validity — LethalBoardPage after wire-through");
{
  const src = readFileSync("src/components/discovery/LethalBoardPage.jsx", "utf8");
  let ok = true; let err = null;
  try { await transformWithOxc(src, "LethalBoardPage.jsx", { lang: "jsx" }); }
  catch (e) { ok = false; err = e?.message || String(e); }
  assert("LethalBoardPage.jsx parses as valid JSX", ok, err);
}

// =================================================================
// SUMMARY
// =================================================================
console.log("\n  ────────────────────────────");
console.log(`  ${passed} passed · ${failed} failed`);
console.log("  ────────────────────────────\n");

if (failed > 0) {
  console.log("  Failures:");
  for (const f of failureLines) console.log(`    - ${f}`);
  process.exit(1);
} else {
  // Demo
  console.log("\n  Example provider lifecycle (no env, no terminal):\n");
  const provider = createOptionsChainProvider({});
  const health = await provider.checkHealth();
  console.log(`    name              ${provider.name}`);
  console.log(`    status            ${health.status}`);
  console.log(`    reason            ${health.reason}`);
  console.log(`    fetchSnapshot()   ${(await provider.fetchSnapshot({}))}`);
  console.log(`    fetchChain()      ${await provider.fetchChain()}`);
  console.log("\n  ↑ This is the safe-default state when ThetaData credentials");
  console.log("    are absent. Trade Construction stays in 'estimated'.");
  process.exit(0);
}
