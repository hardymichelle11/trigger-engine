#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.7.4 tests
// Run: npm run test:discovery-phase4-7-4
// =====================================================
//
// Verifies the bottom-action-bar wiring:
//   - cockpitActions lib persists per-user (watch / candidate / price alert)
//   - useCockpitActions hook exposes the documented surface
//   - OpportunityDetailPanel renders DetailActionBar with real onClick handlers
//   - Watch button toggles, shows "Watching" when active
//   - Candidate button toggles, shows "Candidate ✓" when active
//   - Simulate opens an inline panel with derived stats
//   - Alert opens an inline form with target/direction inputs
//   - LethalBoardCockpit threads cockpitActions through to detail panel
//   - LethalBoardPage uses useCockpitActions and passes it down
//   - Privacy: action lib does not log capital values or symbols
// =====================================================

import { readFileSync, existsSync } from "node:fs";
import { transformWithOxc } from "vite";

import {
  loadWatchList, toggleWatch, isWatching,
  loadCandidates, toggleCandidate, isCandidate,
  loadPriceAlerts, setPriceAlert, getPriceAlert, clearPriceAlert,
  COCKPIT_ACTION_KEYS,
} from "../src/lib/cockpit/cockpitActions.js";

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

function read(p) { return readFileSync(p, "utf8"); }
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.7.4");
console.log("  ═════════════════════════════════════════════");

// =================================================================
// 1. Files exist + JSX validity
// =================================================================
group("files exist + JSX validity");

const FILES = [
  "src/lib/cockpit/cockpitActions.js",
  "src/lib/cockpit/useCockpitActions.js",
  "src/components/discovery/cockpit/OpportunityDetailPanel.jsx",
  "src/components/discovery/LethalBoardCockpit.jsx",
  "src/components/discovery/LethalBoardPage.jsx",
];
for (const path of FILES) {
  assert(`${path} exists`, existsSync(path));
}
for (const path of FILES.filter(p => p.endsWith(".jsx"))) {
  try {
    const code = read(path);
    await transformWithOxc(code, path, { loader: "jsx" });
    assert(`${path} JSX valid`, true);
  } catch (e) {
    assert(`${path} JSX valid`, false, e?.message || String(e));
  }
}

// =================================================================
// 2. cockpitActions — per-user persistence
// =================================================================
group("cockpitActions — per-user persistence");
{
  // In-memory mock for Node test environment
  const store = {};
  globalThis.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { for (const k of Object.keys(store)) delete store[k]; },
  };

  // Watch list
  assert("watch list starts empty", loadWatchList("u-A").length === 0);
  toggleWatch("NVDA", "u-A");
  assert("toggleWatch adds NVDA", isWatching("NVDA", "u-A"));
  toggleWatch("NVDA", "u-A");
  assert("toggleWatch removes NVDA", !isWatching("NVDA", "u-A"));
  toggleWatch("BE", "u-A");
  toggleWatch("CRWV", "u-A");
  assert("watch list contains both", loadWatchList("u-A").length === 2);

  // Different user does not see u-A's list
  assert("u-B watch list independent", loadWatchList("u-B").length === 0);

  // Candidates
  toggleCandidate("NVDA", "u-A", { score: 87, action: "Option candidate", capitalFit: "Excellent" });
  assert("candidate added", isCandidate("NVDA", "u-A"));
  const cands = loadCandidates("u-A");
  assert("candidate snapshot has score", cands[0].score === 87);
  assert("candidate snapshot has action", cands[0].action === "Option candidate");
  assert("candidate has promotedAt timestamp",
    typeof cands[0].promotedAt === "string");
  toggleCandidate("NVDA", "u-A");
  assert("candidate removed on second toggle", !isCandidate("NVDA", "u-A"));

  // Price alerts
  setPriceAlert("NVDA", { target: 220, direction: "below" }, "u-A");
  const alert = getPriceAlert("NVDA", "u-A");
  assert("price alert target persisted", alert?.target === 220);
  assert("price alert direction persisted", alert?.direction === "below");
  assert("price alert createdAt set", typeof alert?.createdAt === "string");
  setPriceAlert("NVDA", { target: 215, direction: "above" }, "u-A");
  assert("price alert overwrites", getPriceAlert("NVDA", "u-A").target === 215);
  clearPriceAlert("NVDA", "u-A");
  assert("price alert cleared", getPriceAlert("NVDA", "u-A") === null);

  // Bad inputs are rejected
  setPriceAlert("NVDA", { target: -5 }, "u-A");
  assert("negative target rejected", getPriceAlert("NVDA", "u-A") === null);
  setPriceAlert("NVDA", { target: "garbage" }, "u-A");
  assert("non-numeric target rejected", getPriceAlert("NVDA", "u-A") === null);

  // Storage key shape lethalBoard.{type}.{userId}
  toggleWatch("AAPL", "u-X");
  assert("watch key shape lethalBoard.watchList.u-X",
    Object.keys(store).includes(COCKPIT_ACTION_KEYS.WATCH + "u-X"));
  toggleCandidate("AAPL", "u-X");
  assert("candidate key shape lethalBoard.candidates.u-X",
    Object.keys(store).includes(COCKPIT_ACTION_KEYS.CANDIDATE + "u-X"));
  setPriceAlert("AAPL", { target: 200 }, "u-X");
  assert("alert key shape lethalBoard.priceAlerts.u-X",
    Object.keys(store).includes(COCKPIT_ACTION_KEYS.ALERT + "u-X"));
}

// =================================================================
// 3. useCockpitActions hook surface
// =================================================================
group("useCockpitActions — hook surface");
{
  const src = read("src/lib/cockpit/useCockpitActions.js");
  for (const symbol of [
    "userId", "watchList", "candidates", "priceAlerts",
    "isWatching", "isCandidate", "getAlert",
    "toggleWatch", "toggleCandidate", "setAlert", "clearAlert",
  ]) {
    assert(`hook returns ${symbol}`,
      new RegExp(`\\b${symbol}\\b`).test(src));
  }
  assert("hook subscribes to storage event for cross-tab sync",
    /addEventListener\(\s*["']storage["']/.test(src));
}

// =================================================================
// 4. OpportunityDetailPanel — buttons have real handlers
// =================================================================
group("OpportunityDetailPanel — action bar wired");
{
  const src = read("src/components/discovery/cockpit/OpportunityDetailPanel.jsx");
  const stripped = stripComments(src);

  // Accepts the action props
  for (const prop of [
    "isWatching", "isCandidate", "getAlert",
    "onToggleWatch", "onToggleCandidate", "onSetAlert", "onClearAlert",
  ]) {
    assert(`detail panel accepts ${prop} prop`,
      new RegExp(`\\b${prop}\\b`).test(stripped));
  }

  // Action buttons now have onClick handlers (not just title tooltips)
  assert("ActionButton receives onClick", /onClick=/.test(stripped));
  // Watch button shows "Watching" when active
  assert(`Watch label flips to "Watching" when active`,
    /watching\s*\?\s*["']Watching/.test(stripped));
  // Candidate label flips
  assert(`Candidate label flips when active`,
    /candidate\s*\?\s*["']Candidate/.test(stripped));
  // Simulate panel exists
  assert("SimulatePanel renders inline", /SimulatePanel/.test(stripped));
  // Alert form exists
  assert("AlertPanel renders inline", /AlertPanel/.test(stripped));
  // The alert form has target / direction inputs
  assert("alert form has direction selector", /["']above["'][\s\S]{0,200}["']below["']/.test(stripped));
  assert("alert form has target price input", /placeholder=["']Target price["']/.test(stripped));
  // Simulate panel surfaces derived stats
  for (const label of ["Strike", "Mid (premium)", "Bid / ask", "DTE",
                       "Collateral", "Credit / contract", "ROI on collateral",
                       "Annualized ROI", "Breakeven"]) {
    assert(`SimulatePanel surfaces "${label}"`, stripped.includes(label));
  }
}

// =================================================================
// 5. Cockpit threads actions, page wires the hook
// =================================================================
group("cockpit + page wiring");
{
  const cockpit = read("src/components/discovery/LethalBoardCockpit.jsx");
  assert("Cockpit accepts cockpitActions prop",
    /cockpitActions/.test(cockpit));
  for (const k of [
    "isWatching", "isCandidate", "getAlert",
    "toggleWatch", "toggleCandidate", "setAlert", "clearAlert",
  ]) {
    assert(`Cockpit threads ${k} to OpportunityDetailPanel`,
      new RegExp(`\\b${k}\\b`).test(cockpit));
  }

  const page = read("src/components/discovery/LethalBoardPage.jsx");
  assert("Page imports useCockpitActions", /useCockpitActions/.test(page));
  assert("Page calls useCockpitActions()", /useCockpitActions\s*\(\s*\)/.test(page));
  assert("Page passes cockpitActions to LethalBoardCockpit",
    /cockpitActions\s*=\s*\{cockpitActions\}/.test(page));
}

// =================================================================
// 6. Privacy — no logging of symbols / targets
// =================================================================
group("privacy — actions are local and not logged");
{
  const action = read("src/lib/cockpit/cockpitActions.js");
  const hook   = read("src/lib/cockpit/useCockpitActions.js");
  for (const [name, src] of [["cockpitActions.js", action], ["useCockpitActions.js", hook]]) {
    const stripped = stripComments(src);
    assert(`${name}: no console.log of symbol`,
      !/console\.log\([^)]*symbol/.test(stripped));
    assert(`${name}: no fetch of personal data`,
      !/\bfetch\s*\(/.test(stripped));
  }
}

// =================================================================
// SUMMARY
// =================================================================
console.log("\n  ════════════════════════════════════════════");
console.log(`  Phase 4.7.4: ${passed} passed, ${failed} failed (total ${passed + failed})`);
if (failed > 0) {
  console.log("\n  Failures:");
  for (const line of failureLines) console.log("    ✗ " + line);
  process.exit(1);
}
process.exit(0);
