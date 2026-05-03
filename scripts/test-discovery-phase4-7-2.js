#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.7.2 tests
// Run: npm run test:discovery-phase4-7-2
// =====================================================
//
// Verifies the production cockpit polish:
//   - rename map applied (8 components)
//   - old files deleted (no stale duplicates)
//   - capitalContext lib: defaults, normalize, mask helpers,
//     load/save/userId scoping, accountState projection
//   - useCapitalContext hook exists with the documented surface
//   - CapitalSettingsModal renders all 8 fields
//   - HideBalancesToggle component exists and accepts hidden + onToggle
//   - CapitalCommandBar contains Edit + Hide controls and masks deployable
//   - OperatorConsole contains Edit + Hide controls and masks all $ fields
//   - OpportunityDetailPanel masks all $ in Capital Impact
//   - LethalBoardCockpit applies strict 100vh layout with internal scrolls
//   - LethalBoardPage wires useCapitalContext + modal state + scanner accountState
//   - Privacy: no logging of capital values; no engine internals leak
//   - Existing Phase 4.x tests still green (other suites)
// =====================================================

import { readFileSync, existsSync } from "node:fs";
import { transformWithOxc } from "vite";

import {
  defaultCapitalContext,
  normalizeCapitalContext,
  loadCapitalContext,
  saveCapitalContext,
  resolveUserId,
  maskMoney,
  maskPercent,
  toAccountState,
  isCapitalContextUnconfigured,
  CAPITAL_MARKET_MODES,
  CAPITAL_PRESSURE_TOLERANCES,
  CAPITAL_STORAGE_KEY_PREFIX,
} from "../src/lib/capital/capitalContext.js";

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

async function assertJsxValid(name, path) {
  try {
    const code = readFileSync(path, "utf8");
    await transformWithOxc(code, path, { loader: "jsx" });
    assert(`${name} — JSX valid`, true);
  } catch (e) {
    assert(`${name} — JSX valid`, false, e?.message || String(e));
  }
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.7.2");
console.log("  ════════════════════════════════════════════");

// =================================================================
// 1. Rename map: new files exist, old files gone
// =================================================================
group("rename map applied — 8 renames + 2 new + extracted card");

const NEW = {
  capitalCommandBar:      "src/components/discovery/cockpit/CapitalCommandBar.jsx",
  operatorConsole:        "src/components/discovery/cockpit/OperatorConsole.jsx",
  topPicksGrid:           "src/components/discovery/cockpit/TopPicksGrid.jsx",
  opportunityCard:        "src/components/discovery/cockpit/OpportunityCard.jsx",
  rankedCandidatesPanel:  "src/components/discovery/cockpit/RankedCandidatesPanel.jsx",
  marketIntelligence:     "src/components/discovery/cockpit/MarketIntelligencePanel.jsx",
  opportunityDetailPanel: "src/components/discovery/cockpit/OpportunityDetailPanel.jsx",
  alertsPanel:            "src/components/discovery/cockpit/AlertsPanel.jsx",
  capitalSettingsModal:   "src/components/discovery/cockpit/CapitalSettingsModal.jsx",
  hideBalancesToggle:     "src/components/discovery/cockpit/HideBalancesToggle.jsx",
  cockpit:                "src/components/discovery/LethalBoardCockpit.jsx",
  page:                   "src/components/discovery/LethalBoardPage.jsx",
};
for (const [name, path] of Object.entries(NEW)) {
  assert(`${name} exists at ${path}`, existsSync(path));
}

const OLD = [
  "src/components/discovery/cockpit/AdminSidebar.jsx",
  "src/components/discovery/cockpit/CommandBar.jsx",
  "src/components/discovery/cockpit/TopOpportunityGrid.jsx",
  "src/components/discovery/cockpit/RankedWorkspace.jsx",
  "src/components/discovery/cockpit/MarketNewsPanel.jsx",
  "src/components/discovery/cockpit/DetailSidePanel.jsx",
  "src/components/discovery/cockpit/RecentAlertsPanel.jsx",
];
for (const path of OLD) {
  assert(`old file removed: ${path}`, !existsSync(path));
}

// =================================================================
// 2. JSX validity for every new file
// =================================================================
group("JSX validity");
for (const path of Object.values(NEW)) {
  await assertJsxValid(path, path);
}

// =================================================================
// 3. capitalContext lib — defaults, normalize, mask, accountState
// =================================================================
group("capitalContext — pure helpers");
{
  const def = defaultCapitalContext("u1");
  assert("defaultCapitalContext userId carried", def.userId === "u1");
  assert("defaults: startingCapital === 0", def.startingCapital === 0);
  assert("defaults: reservedCashBufferPct === 0.20", def.reservedCashBufferPct === 0.20);
  assert("defaults: maxDeployedPct === 0.65", def.maxDeployedPct === 0.65);
  assert("defaults: maxSingleTradePct === 0.10", def.maxSingleTradePct === 0.10);
  assert("defaults: marketMode === 'neutral'", def.marketMode === "neutral");
  assert("defaults: pressureTolerance === 'medium'", def.pressureTolerance === "medium");
  assert("defaults: hideBalances === false", def.hideBalances === false);
  assert("defaults: object frozen", Object.isFrozen(def));
}
{
  // Normalize coerces / clamps
  const n1 = normalizeCapitalContext({
    startingCapital: "60000", availableCash: 50000,
    deployableCapital: -100,           // negative → 0
    reservedCashBufferPct: 1.5,        // > 1 → clamp to 1
    maxDeployedPct: 0.5,
    maxSingleTradePct: "garbage",      // non-numeric → fallback default
    marketMode: "exotic",              // unknown → fallback "neutral"
    pressureTolerance: "extreme",      // unknown → fallback "medium"
    hideBalances: "yes",               // truthy non-true → false
  }, "u1");
  assert("normalize: startingCapital '60000' → 60000", n1.startingCapital === 60000);
  assert("normalize: deployable -100 → 0", n1.deployableCapital === 0);
  assert("normalize: reserved 1.5 → 1", n1.reservedCashBufferPct === 1);
  assert("normalize: maxSingleTradePct 'garbage' → 0.10", n1.maxSingleTradePct === 0.10);
  assert("normalize: unknown marketMode → 'neutral'", n1.marketMode === "neutral");
  assert("normalize: unknown pressureTolerance → 'medium'", n1.pressureTolerance === "medium");
  assert("normalize: hideBalances 'yes' is NOT true (strict ===)", n1.hideBalances === false);
}
{
  assert("isCapitalContextUnconfigured: zeros → true",
    isCapitalContextUnconfigured(defaultCapitalContext("u1")));
  assert("isCapitalContextUnconfigured: configured → false",
    !isCapitalContextUnconfigured({ startingCapital: 1000, availableCash: 500, deployableCapital: 800 }));
}
{
  // Masking
  assert("maskMoney: hidden returns '•••••'", maskMoney(60000, true) === "•••••");
  assert("maskMoney: visible formats", maskMoney(60000, false).startsWith("$"));
  assert("maskMoney: null visible → '—'", maskMoney(null, false) === "—");
  assert("maskPercent: hidden returns '•••'", maskPercent(0.65, true) === "•••");
  assert("maskPercent: visible formats", maskPercent(0.65, false) === "65%");
}
{
  // accountState projection
  const acct = toAccountState({
    startingCapital: 100000, availableCash: 80000, deployableCapital: 60000,
    maxDeployedPct: 0.7, reservedCashBufferPct: 0.25, maxSingleTradePct: 0.12,
    marketMode: "risk_on", pressureTolerance: "high",
  });
  assert("toAccountState: totalAccountValue", acct.totalAccountValue === 100000);
  assert("toAccountState: availableCash", acct.availableCash === 80000);
  assert("toAccountState: deployableCapital", acct.deployableCapital === 60000);
  assert("toAccountState: maxDeployedPct", acct.maxDeployedPct === 0.7);
  assert("toAccountState: reservedCashBufferPct", acct.reservedCashBufferPct === 0.25);
  assert("toAccountState: maxSingleTradePct", acct.maxSingleTradePct === 0.12);
  assert("toAccountState: marketMode passthrough", acct.marketMode === "risk_on");
  assert("toAccountState: pressureTolerance passthrough", acct.pressureTolerance === "high");
  assert("toAccountState: object frozen", Object.isFrozen(acct));
}

// =================================================================
// 4. localStorage scoping (in-memory mock)
// =================================================================
group("capital settings scoped to userId");
{
  // Mock localStorage for the Node test environment.
  const store = {};
  globalThis.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { for (const k of Object.keys(store)) delete store[k]; },
  };

  // Two distinct users have independent settings
  const a = saveCapitalContext({ startingCapital: 100000, availableCash: 90000, deployableCapital: 80000 }, "user-A");
  const b = saveCapitalContext({ startingCapital: 25000, availableCash: 20000, deployableCapital: 18000 }, "user-B");
  assert("user-A startingCapital persisted",
    loadCapitalContext("user-A").startingCapital === 100000);
  assert("user-B startingCapital persisted independently",
    loadCapitalContext("user-B").startingCapital === 25000);
  assert("user-A does NOT see user-B's deployable",
    loadCapitalContext("user-A").deployableCapital !== loadCapitalContext("user-B").deployableCapital);
  assert("storage key shape lethalBoard.capitalContext.{userId}",
    Object.keys(store).some(k => k === CAPITAL_STORAGE_KEY_PREFIX + "user-A"));

  // resolveUserId is stable
  const id1 = resolveUserId();
  const id2 = resolveUserId();
  assert("resolveUserId is stable across calls", id1 === id2);
  assert("resolveUserId stored at lethalBoard.userId",
    store["lethalBoard.userId"] === id1);
}

// =================================================================
// 5. CAPITAL_MARKET_MODES + CAPITAL_PRESSURE_TOLERANCES
// =================================================================
group("capital enums");
{
  for (const m of ["defensive", "neutral", "risk_on", "opportunistic"]) {
    assert(`CAPITAL_MARKET_MODES contains '${m}'`, CAPITAL_MARKET_MODES.includes(m));
  }
  for (const p of ["low", "medium", "high"]) {
    assert(`CAPITAL_PRESSURE_TOLERANCES contains '${p}'`, CAPITAL_PRESSURE_TOLERANCES.includes(p));
  }
}

// =================================================================
// 6. Modal renders all 8 documented fields
// =================================================================
group("CapitalSettingsModal — all fields surfaced");
{
  const src = readFileSync(NEW.capitalSettingsModal, "utf8");
  for (const label of [
    "Starting capital",
    "Available cash",
    "Deployable capital",
    "Reserved buffer",
    "Max deployment",
    "Max single trade",
    "Market mode",
    "Pressure tolerance",
  ]) {
    assert(`Modal field "${label}" present`, src.includes(label));
  }
  assert("Modal exposes Save action", /Save settings/.test(src));
  assert("Modal exposes Cancel/Close action",
    /Close/.test(src) && /Cancel/.test(src));
  assert("Modal supports Esc-to-close", /key === ["']Escape["']/.test(src));
}

// =================================================================
// 7. HideBalancesToggle surface
// =================================================================
group("HideBalancesToggle");
{
  const src = readFileSync(NEW.hideBalancesToggle, "utf8");
  assert("toggle reads `hidden` prop", /props\.hidden|\bhidden\b/.test(src));
  assert("toggle calls onToggle", /\bonToggle\b/.test(src));
  assert("toggle has aria-pressed", /aria-pressed/.test(src));
}

// =================================================================
// 8. CapitalCommandBar — edit + hide + masking
// =================================================================
group("CapitalCommandBar — edit + hide + masking");
{
  const src = readFileSync(NEW.capitalCommandBar, "utf8");
  assert("imports maskMoney", /maskMoney/.test(src));
  assert("renders HideBalancesToggle", /<HideBalancesToggle/.test(src));
  assert("renders Edit capital button", /Edit capital/i.test(src));
  assert("uses capitalCtx prop", /\bcapitalCtx\b/.test(src));
  assert("calls onEditCapital", /onEditCapital/.test(src));
  assert("calls onToggleHideBalances", /onToggleHideBalances/.test(src));
  assert("masks deployable when hideBalances is true",
    /maskMoney\(\s*deployable\s*,\s*hide\s*\)/.test(src));
}

// =================================================================
// 9. OperatorConsole — capital section + masking
// =================================================================
group("OperatorConsole — capital section + masking");
{
  const src = readFileSync(NEW.operatorConsole, "utf8");
  assert("imports maskMoney", /maskMoney/.test(src));
  assert("imports maskPercent", /maskPercent/.test(src));
  assert("Capital settings section title",
    /Capital settings/i.test(src));
  assert("renders HideBalancesToggle", /<HideBalancesToggle/.test(src));
  assert("renders Edit capital button", /Edit capital/i.test(src));
  assert("masks startingCapital", /maskMoney\(\s*safe\.startingCapital/.test(src));
  assert("masks availableCash",   /maskMoney\(\s*safe\.availableCash/.test(src));
  assert("masks deployableCapital", /maskMoney\(\s*safe\.deployableCapital/.test(src));
  assert("masks reservedCashBufferPct", /maskPercent\(\s*safe\.reservedCashBufferPct/.test(src));
  // Old AdminSidebar capital-less control block must be gone
  assert("OperatorConsole has Edit capital control",
    /Edit capital/.test(src));
}

// =================================================================
// 10. OpportunityDetailPanel — capital impact masking
// =================================================================
group("OpportunityDetailPanel — masking + capital prop");
{
  const src = readFileSync(NEW.opportunityDetailPanel, "utf8");
  assert("imports maskMoney", /maskMoney/.test(src));
  assert("accepts capitalCtx prop", /capitalCtx\s*=\s*null/.test(src));
  assert("Capital impact section masks dollar values",
    /maskMoney\([^)]*hide\s*\)/.test(src));
  assert("masks at least 3 dollar fields in capital impact",
    (src.match(/maskMoney\(/g) || []).length >= 3);
}

// =================================================================
// 11. LethalBoardCockpit — strict 100vh + new imports + capital pipe
// =================================================================
group("LethalBoardCockpit — strict 100vh + capital pipe");
{
  const src = readFileSync(NEW.cockpit, "utf8");
  // strict 100vh layout. Phase 4.7.3 widened the right column to
  // `minmax(0, 1fr)` so children can shrink without forcing horizontal
  // overflow; either form is acceptable.
  assert("page-level grid uses 280px sidebar",
    /gridTemplateColumns:\s*["']280px\s+(1fr|minmax\(0,\s*1fr\))["']/.test(src));
  assert("page is height 100vh", /height:\s*["']100vh["']/.test(src));
  assert("page has overflow hidden",
    /overflow:\s*["']hidden["']/.test(src));
  // Phase 4.7.5.3 added a min-height floor on the top picks row so cards
  // never clip on shorter viewports — accept either the original "36%"
  // form or the floored `minmax(<floor>, 36%)` form.
  assert("main workspace uses auto / 36% / 1fr rows",
    /gridTemplateRows:\s*["']auto\s+36%\s+1fr["']/.test(src)
      || /gridTemplateRows:\s*["']auto\s+minmax\(\s*\d+px\s*,\s*36%\s*\)\s+1fr["']/.test(src));
  assert("lower workspace uses 60% / 40% columns",
    /gridTemplateColumns:\s*["']60%\s+40%["']/.test(src));
  // imports the renamed components
  for (const name of [
    "OperatorConsole",
    "CapitalCommandBar",
    "TopPicksGrid",
    "RankedCandidatesPanel",
    "OpportunityDetailPanel",
    "MarketIntelligencePanel",
    "AlertsPanel",
  ]) {
    assert(`Cockpit imports ${name}`, new RegExp(`\\b${name}\\b`).test(src));
  }
  // capital pipe
  for (const prop of ["capitalCtx", "onEditCapital", "onToggleHideBalances"]) {
    assert(`Cockpit threads ${prop}`, new RegExp(`\\b${prop}\\b`).test(src));
  }
  // old import names retired
  for (const old of [
    "AdminSidebar", "CommandBar", "TopOpportunityGrid",
    "RankedWorkspace", "MarketNewsPanel", "DetailSidePanel", "RecentAlertsPanel",
  ]) {
    const stripped = stripComments(src);
    assert(`Cockpit no longer references ${old}`,
      !new RegExp(`\\b${old}\\b`).test(stripped));
  }
}

// =================================================================
// 12. LethalBoardPage — useCapitalContext + modal + accountState
// =================================================================
group("LethalBoardPage — capital wiring");
{
  const src = readFileSync(NEW.page, "utf8");
  assert("imports useCapitalContext", /useCapitalContext/.test(src));
  assert("imports toAccountState", /toAccountState/.test(src));
  assert("imports CapitalSettingsModal", /CapitalSettingsModal/.test(src));
  assert("page hooks useCapitalContext()", /useCapitalContext\s*\(\s*\)/.test(src));
  assert("page state for capital modal open", /capitalModalOpen/.test(src));
  assert("renders <CapitalSettingsModal", /<CapitalSettingsModal\b/.test(src));
  assert("passes onEditCapital to cockpit",
    /onEditCapital\s*=\s*\{[^}]*setCapitalModalOpen/.test(src));
  assert("passes capitalCtx to cockpit", /capitalCtx\s*=\s*\{capitalCtx\}/.test(src));
  // Hardcoded sample numbers retired in scan handlers
  assert("scan handler accountState NOT hardcoded as 60_000",
    !/totalAccountValue:\s*60_000/.test(src));
  assert("scan handler accountState NOT hardcoded as 50_000",
    !/availableCash:\s*50_000/.test(src));
  assert("scans pass toAccountState(capitalCtx)",
    /toAccountState\(\s*capitalCtx\s*\)/.test(src));
}

// =================================================================
// 13. Privacy: no console.log / fetch logging of capital values
// =================================================================
group("privacy — no logging of capital values");
{
  const cap = readFileSync("src/lib/capital/capitalContext.js", "utf8");
  const hook = readFileSync("src/lib/capital/useCapitalContext.js", "utf8");
  for (const [name, src] of [["capitalContext.js", cap], ["useCapitalContext.js", hook]]) {
    const stripped = stripComments(src);
    assert(`${name}: no console.log of capital`,
      !/console\.log\([^)]*startingCapital/.test(stripped)
       && !/console\.log\([^)]*availableCash/.test(stripped)
       && !/console\.log\([^)]*deployableCapital/.test(stripped));
    assert(`${name}: no network fetch of capital`,
      !/\bfetch\s*\(/.test(stripped));
  }
}

// =================================================================
// 14. Safety — engine internals do NOT leak in any cockpit file
// =================================================================
group("safety — no engine internals leak in cockpit UI");
{
  const banned = ["scoreBreakdown", "weights", "probabilityInternals",
                  "monteCarlo", "mcPaths", "ivPercentileRaw", "_engineDebug"];
  const cockpitFiles = [
    NEW.cockpit, NEW.operatorConsole, NEW.capitalCommandBar, NEW.topPicksGrid,
    NEW.opportunityCard, NEW.rankedCandidatesPanel, NEW.opportunityDetailPanel,
    NEW.marketIntelligence, NEW.alertsPanel, NEW.capitalSettingsModal,
    NEW.hideBalancesToggle,
  ];
  for (const path of cockpitFiles) {
    const stripped = stripComments(readFileSync(path, "utf8"));
    for (const b of banned) {
      assert(`${path}: does NOT reference ${b}`,
        !new RegExp(`\\b${b}\\b`).test(stripped));
    }
  }
}

// =================================================================
// SUMMARY
// =================================================================
console.log("\n  ════════════════════════════════════════════");
console.log(`  Phase 4.7.2: ${passed} passed, ${failed} failed (total ${passed + failed})`);
if (failed > 0) {
  console.log("\n  Failures:");
  for (const line of failureLines) console.log("    ✗ " + line);
  process.exit(1);
}
process.exit(0);
