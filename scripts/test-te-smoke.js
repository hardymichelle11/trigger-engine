#!/usr/bin/env node
// =====================================================
// Trigger Engine (TE) — runtime smoke check
// Run: npm run test:te-smoke
//
// Localizes whether a render regression exists in the four top-level
// pages of the TE app (App / LethalBoardPage / CreditVolScanner /
// TickerSetupBuilder) plus the freshness-chip / cockpit components
// touched by the recent quote-only-refresh and freshness-tone work.
//
// What this catches:
//   1. Stale or missing import paths (module graph fails to resolve).
//   2. Undefined prop destructuring that crashes during initial render.
//   3. Missing named exports introduced by the freshness/quote split.
//   4. Empty/loading-state renders that should not throw.
//
// What this does NOT catch:
//   - Async-only crashes after data arrives (those need a browser).
//   - Layout / CSS regressions.
// =====================================================

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { register } from "node:module";

// Install the JSX-aware loader so .jsx component files (App, CreditVolScanner,
// LethalBoardPage, FreshnessChip, …) can be imported in plain Node without
// running vite. Must run before any dynamic import() of those files.
register("./jsx-hooks.mjs", import.meta.url);

// ---------------------------------------------------------------------
// Browser-API stubs — most app code calls localStorage / matchMedia /
// document at module-load or first render. Stub them BEFORE importing
// React or any app module so the module graph evaluates cleanly.
// ---------------------------------------------------------------------

const memoryStore = new Map();
const noopStorage = {
  getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
  setItem: (k, v) => { memoryStore.set(k, String(v)); },
  removeItem: (k) => { memoryStore.delete(k); },
  clear: () => memoryStore.clear(),
  get length() { return memoryStore.size; },
  key: (i) => Array.from(memoryStore.keys())[i] ?? null,
};

const noopEvent = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
};

if (typeof globalThis.window === "undefined") {
  globalThis.window = {
    ...noopEvent,
    localStorage: noopStorage,
    sessionStorage: noopStorage,
    matchMedia: () => ({ matches: false, media: "", ...noopEvent }),
    location: { href: "", origin: "", pathname: "/" },
    navigator: { userAgent: "node-smoke" },
    document: undefined, // wired below
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
  };
}
if (typeof globalThis.document === "undefined") {
  globalThis.document = {
    ...noopEvent,
    hidden: false,
    visibilityState: "visible",
    title: "",
    body: { ...noopEvent },
    documentElement: { ...noopEvent, style: {}, classList: { add: () => {}, remove: () => {} } },
    createElement: () => ({ ...noopEvent, style: {}, setAttribute: () => {}, appendChild: () => {} }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  globalThis.window.document = globalThis.document;
}
if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = noopStorage;
}
if (typeof globalThis.AbortSignal === "undefined") {
  globalThis.AbortSignal = { timeout: () => ({ aborted: false, ...noopEvent }) };
}
if (typeof globalThis.fetch === "undefined") {
  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
}
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
}

// ---------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, cond, detail = "") {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${detail ? "  →  " + detail : ""}`); failures.push(`${name}${detail ? " — " + detail : ""}`); failed++; }
}
function group(label) {
  console.log(`\n  ${label}\n  ${"─".repeat(Math.max(20, label.length))}`);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function safeImport(rel) {
  const url = "file://" + resolve(root, rel).replace(/\\/g, "/");
  try {
    const mod = await import(url);
    return { ok: true, mod };
  } catch (err) {
    return { ok: false, err };
  }
}

// ---------------------------------------------------------------------
// [1] Module-import smoke — does the module graph resolve cleanly?
// ---------------------------------------------------------------------

group("[1] module-import smoke (stale paths / missing exports)");

const PAGES = [
  ["App",                       "src/App.jsx"],
  ["CreditVolScanner",          "src/CreditVolScanner.jsx"],
  ["LethalBoardPage",           "src/components/discovery/LethalBoardPage.jsx"],
  ["LethalBoardCockpit",        "src/components/discovery/LethalBoardCockpit.jsx"],
  ["TickerSetupBuilder",        "src/TickerSetupBuilder.jsx"],
  ["LandingPage",               "src/LandingPage.jsx"],
];

const COCKPIT = [
  ["FreshnessChip",            "src/components/discovery/cockpit/FreshnessChip.jsx"],
  ["OpportunityCard",          "src/components/discovery/cockpit/OpportunityCard.jsx"],
  ["OpportunityDetailPanel",   "src/components/discovery/cockpit/OpportunityDetailPanel.jsx"],
  ["TopPicksGrid",             "src/components/discovery/cockpit/TopPicksGrid.jsx"],
  ["RankedCandidatesPanel",    "src/components/discovery/cockpit/RankedCandidatesPanel.jsx"],
  ["RefreshStatusBar",         "src/components/discovery/cockpit/RefreshStatusBar.jsx"],
];

const LIBS = [
  ["marketFreshness",          "src/lib/marketFreshness.js"],
  ["quoteFetch",               "src/lib/quoteFetch.js"],
  ["sessionState",             "src/lib/sessionState.js"],
  ["refreshPolicy",            "src/lib/refreshPolicy.js"],
  ["autoRefreshPreference",    "src/lib/autoRefreshPreference.js"],
  ["useAutoRefresh",           "src/lib/useAutoRefresh.js"],
];

const allModules = [...PAGES, ...COCKPIT, ...LIBS];
const importResults = {};

for (const [name, rel] of allModules) {
  // eslint-disable-next-line no-await-in-loop
  const r = await safeImport(rel);
  importResults[name] = r;
  assert(`imports cleanly: ${name}`, r.ok, r.ok ? "" : (r.err?.message || String(r.err)));
}

// Cross-checks: no stale named imports introduced by the freshness/quote
// changes. These are the symbols app code expects from each lib.
group("[2] stale-import cross-checks");

const REQUIRED_NAMED_EXPORTS = {
  marketFreshness:        ["FRESHNESS", "freshnessForCandidate", "humanizeAge", "freshnessFromAge"],
  quoteFetch:             ["fetchQuotes", "mergeQuotes"],
  sessionState:           ["resolveSessionState", "SESSION_STATES", "isLiveSession"],
  refreshPolicy:          ["refreshPolicyForSession", "effectiveCadenceMs"],
  autoRefreshPreference:  ["useAutoRefreshPreference", "getAutoRefreshPreference", "setAutoRefreshPreferencePersist"],
  useAutoRefresh:         ["useAutoRefresh", "useClockTick"],
};
for (const [libName, names] of Object.entries(REQUIRED_NAMED_EXPORTS)) {
  const r = importResults[libName];
  if (!r?.ok) continue;
  for (const n of names) {
    assert(
      `${libName}.${n} is exported`,
      typeof r.mod[n] !== "undefined",
    );
  }
}

const REQUIRED_DEFAULT_EXPORTS = [
  "App", "CreditVolScanner", "LethalBoardPage",
  "LethalBoardCockpit", "TickerSetupBuilder", "LandingPage",
  "FreshnessChip", "OpportunityCard", "OpportunityDetailPanel",
  "TopPicksGrid", "RankedCandidatesPanel", "RefreshStatusBar",
];
for (const name of REQUIRED_DEFAULT_EXPORTS) {
  const r = importResults[name];
  if (!r?.ok) continue;
  assert(
    `${name} has a default export`,
    typeof r.mod.default === "function",
  );
}

// ---------------------------------------------------------------------
// [3] Empty / loading-state render — undefined-prop destructuring guard
// ---------------------------------------------------------------------

group("[3] empty/loading-state render (renderToStaticMarkup)");

let renderToStaticMarkup;
try {
  ({ renderToStaticMarkup } = await import("react-dom/server"));
} catch (err) {
  console.log(`  ! react-dom/server unavailable — skipping render checks (${err.message})`);
}

let createElement;
try {
  ({ createElement } = await import("react"));
} catch (err) {
  console.log(`  ! react unavailable — skipping render checks (${err.message})`);
}

function renderSafe(name, Component, props) {
  if (!renderToStaticMarkup || !createElement) return { ok: true, skipped: true };
  try {
    const html = renderToStaticMarkup(createElement(Component, props));
    return { ok: typeof html === "string", html };
  } catch (err) {
    return { ok: false, err };
  }
}

// FreshnessChip with no props — should not throw.
if (importResults.FreshnessChip?.ok) {
  const Cmp = importResults.FreshnessChip.mod.default;
  const r = renderSafe("FreshnessChip {}", Cmp, {});
  assert("FreshnessChip renders with empty props", r.ok, r.err?.message);
  const r2 = renderSafe("FreshnessChip with both ages", Cmp, { quoteAgeMs: 5000, analyticsAgeMs: 70000 });
  assert("FreshnessChip renders with both ages", r2.ok, r2.err?.message);
}

// OpportunityDetailPanel with row=null — must early-return the empty
// "select a candidate" placeholder, NOT crash on undefined destructuring.
if (importResults.OpportunityDetailPanel?.ok) {
  const Cmp = importResults.OpportunityDetailPanel.mod.default;
  const r = renderSafe("OpportunityDetailPanel row=null", Cmp, { row: null });
  assert(
    "OpportunityDetailPanel renders empty state when row is null",
    r.ok,
    r.err?.message,
  );
  if (r.ok && !r.skipped) {
    assert(
      "OpportunityDetailPanel empty state mentions 'Select a candidate'",
      /select a candidate/i.test(r.html || ""),
    );
  }
}

// TopPicksGrid with empty rows — should render the "no opportunities" placeholder.
if (importResults.TopPicksGrid?.ok) {
  const Cmp = importResults.TopPicksGrid.mod.default;
  const r = renderSafe("TopPicksGrid rows=[]", Cmp, { rows: [] });
  assert("TopPicksGrid renders with no rows", r.ok, r.err?.message);
}

// LethalBoardCockpit with no scanResult — should render "Cockpit standing by".
if (importResults.LethalBoardCockpit?.ok) {
  const Cmp = importResults.LethalBoardCockpit.mod.default;
  const r = renderSafe("LethalBoardCockpit scanResult=null", Cmp, {
    scanResult: null,
    onRunSamplePreview: () => {},
    onRunLivePreview: () => {},
    onRunLiveCommit: () => {},
    onEditCapital: () => {},
    onToggleHideBalances: () => {},
    capitalCtx: {},
  });
  assert("LethalBoardCockpit renders pre-scan empty state", r.ok, r.err?.message);
  if (r.ok && !r.skipped) {
    assert(
      "Cockpit empty state mentions 'standing by'",
      /standing by/i.test(r.html || ""),
    );
  }
}

// LandingPage — pure presentational; should always render.
if (importResults.LandingPage?.ok) {
  const Cmp = importResults.LandingPage.mod.default;
  const r = renderSafe("LandingPage minimal", Cmp, {
    onOpenDashboard: () => {},
    onOpenLethal: () => {},
  });
  assert("LandingPage renders with handlers stubbed", r.ok, r.err?.message);
}

// ---------------------------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
