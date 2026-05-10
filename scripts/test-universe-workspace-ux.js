#!/usr/bin/env node
// =====================================================
// Universe Workspace UX redesign — sidebar + cards + drawer
// + search workflow + whatChangedBuilder
// Run: npm run test:universe-workspace-ux
//
// Acceptance gates per spec:
//   1.  Sidebar renders all primary sections (10)
//   2.  Default workspace view does NOT expose backend labels
//       (Core Catalog / Dynamic Basket / Manual Ticker List /
//        Lethal Board Prospects)
//   3.  Settings/Admin section can expose advanced controls
//   4.  Search "amd" normalizes to "AMD"
//   5.  Search adds AMD to active research and persists in storage
//   6.  Search workflow returns ok=false on bad input
//   7.  Search dedupes when the same ticker is searched twice
//   8.  ActiveTickerCard renders symbol, theme, posture, why-here,
//       what-changed, action-hint
//   9.  Top area renders 3 opportunity slots (cards or placeholders)
//  10.  TickerDetailDrawer renders chart area, Trigger Engine
//       summary, Credit View summary, Thesis Check, Market
//       Intelligence Context, Recommended action, Risks
//  11.  Drawer surfaces the no-override disclaimer when MI context
//       exists
//  12.  whatChangedBuilder returns counter-thesis message for
//       reimbursement / valuation risk intelligence
//  13.  whatChangedBuilder returns supportive message for
//       pharma partnership intelligence
//  14.  whatChangedBuilder returns risk_elevated when posture is
//       risk_elevated
//  15.  whatChangedBuilder returns no_change for empty inputs
//  16.  No raw _rank / score / weight / coefficient tokens in the
//       default workspace HTML
//  17.  Existing market-intelligence-context, thesis-health-panel,
//       market-intelligence-inbox, and ai-health-diagnostics suites
//       remain green (verified separately)
//  18.  Production build clean (verified separately)
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  buildWhatChanged,
  describeWhatChanged,
} from "../src/lib/ui/whatChangedBuilder.js";
import {
  setActiveResearchBackend,
  resetActiveResearchBackend,
  runTickerSearch,
  listActiveResearchTickers,
  removeActiveResearchTicker,
  clearActiveResearch,
  normalizeTickerInput,
} from "../src/lib/workspace/tickerSearchWorkflow.js";
import {
  setMemoryBackend,
  resetMemoryBackend,
  saveIntelligenceDraft,
  promoteToAgentMemory,
  clearAllIntelligence,
} from "../src/lib/portfolioCio/agentMemoryStore.js";
import {
  setBasketBackend,
  resetBasketBackend,
  clearAllBasketUniverses,
  seedBasketTiers,
} from "../src/lib/portfolioCio/basketUniverseManager.js";

// JSX-bearing imports must be dynamic so the JSX loader is in effect
// when they resolve. (The register() call above only takes effect
// for subsequent imports.)
const { SIDEBAR_SECTIONS, SECTION_ID } =
  await import("../src/components/workspace/UniverseSidebar.jsx");

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

function makeMemoryBackend() {
  const map = new Map();
  return {
    getItem: (k) => map.has(k) ? map.get(k) : null,
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
}
function reset() {
  setActiveResearchBackend(makeMemoryBackend());
  setMemoryBackend(makeMemoryBackend());
  setBasketBackend(makeMemoryBackend());
  clearActiveResearch();
  clearAllIntelligence();
  clearAllBasketUniverses();
}

// ============================================================
group("[1] sidebar renders all 10 primary sections");
// ============================================================

const sectionIds = SIDEBAR_SECTIONS.map((s) => s.id);
assert("[1] sidebar exposes 10 sections",                sectionIds.length === 10);
for (const id of [
  SECTION_ID.DASHBOARD, SECTION_ID.AI_INFRA, SECTION_ID.AI_HEALTH,
  SECTION_ID.ROBOTICS,  SECTION_ID.SAAS_HARVEST, SECTION_ID.DIVIDEND_INCOME,
  SECTION_ID.WATCHLIST, SECTION_ID.ALERTS, SECTION_ID.PORTFOLIO,
  SECTION_ID.SETTINGS_ADMIN,
]) {
  assert(`[1] sidebar includes section: ${id}`, sectionIds.includes(id));
}

// ============================================================
group("[2] default workspace HTML hides backend labels");
// ============================================================

reset();

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
const { default: UniverseWorkspace } =
  await import("../src/components/common/UniverseWorkspace.jsx");

function renderSafe(props = {}) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(UniverseWorkspace, props)) }; }
  catch (err) { return { ok: false, err }; }
}

const renderDefault = renderSafe({});
assert("[2] default workspace renders without throwing",  renderDefault.ok, renderDefault.err?.message);
const defaultHtml = renderDefault.html || "";
const FORBIDDEN_LABELS = [
  "Core Catalog",
  "Dynamic Basket",
  "Manual Ticker List",
  "Lethal Board Prospects",
];
for (const label of FORBIDDEN_LABELS) {
  assert(`[2] default view does NOT expose '${label}'`,
    !new RegExp(label, "i").test(defaultHtml));
}
// Default should land on the Dashboard view; the sidebar nav
// pointers to Settings / Admin should still appear (it's visible in
// the sidebar even though the section isn't selected) — the literal
// section content (Advanced controls etc.) should NOT appear.
assert("[2] default view does NOT expose 'Advanced controls and backend panels' copy",
  !/Advanced controls and backend panels/.test(defaultHtml));
assert("[2] default view DOES show TOP OPPORTUNITIES header",
  /TOP OPPORTUNITIES/.test(defaultHtml));
assert("[2] default view DOES show ACTIVE RESEARCH header",
  /ACTIVE RESEARCH/.test(defaultHtml));

// ============================================================
group("[3] Settings/Admin sidebar entry surfaces advanced copy");
// ============================================================

// We can't programmatically click into the sidebar in a static
// render, but we can confirm the SECTION_ID constant + the
// SIDEBAR_SECTIONS list have the entry.
assert("[3] sidebar lists 'Settings / Admin' entry",
  SIDEBAR_SECTIONS.some((s) => s.id === SECTION_ID.SETTINGS_ADMIN));
assert("[3] settings_admin entry has a hint",
  SIDEBAR_SECTIONS.find((s) => s.id === SECTION_ID.SETTINGS_ADMIN)?.hint?.length > 0);

// ============================================================
group("[4] search 'amd' → 'AMD'");
// ============================================================

reset();
assert("[4] normalizeTickerInput('amd') === 'AMD'",     normalizeTickerInput("amd") === "AMD");
assert("[4] normalizeTickerInput('  TSLA ') === 'TSLA'", normalizeTickerInput("  TSLA ") === "TSLA");
assert("[4] normalizeTickerInput('') is null",          normalizeTickerInput("") === null);
assert("[4] normalizeTickerInput('!!!') is null",       normalizeTickerInput("!!!") === null);

// ============================================================
group("[5] search adds AMD to active research and persists");
// ============================================================

reset();
const r1 = runTickerSearch("amd");
assert("[5] search ok=true for 'amd'",                   r1.ok === true);
assert("[5] search returns symbol = AMD",                r1.symbol === "AMD");
assert("[5] activeTickers contains AMD after search",    r1.activeTickers.includes("AMD"));
assert("[5] listActiveResearchTickers contains AMD",     listActiveResearchTickers().includes("AMD"));

// ============================================================
group("[6] search returns ok=false on bad input");
// ============================================================

const rBad = runTickerSearch("!!");
assert("[6] runTickerSearch('!!') ok=false",             rBad.ok === false);
assert("[6] reason = 'invalid_ticker'",                  rBad.reason === "invalid_ticker");
assert("[6] runTickerSearch(null) ok=false",             runTickerSearch(null).ok === false);

// ============================================================
group("[7] search dedupes when the same ticker is added twice");
// ============================================================

reset();
runTickerSearch("amd");
runTickerSearch("amd");
const list = listActiveResearchTickers();
assert("[7] AMD appears exactly once",
  list.filter((s) => s === "AMD").length === 1);

// Most-recent-first ordering check.
runTickerSearch("nvda");
runTickerSearch("amd");
const list2 = listActiveResearchTickers();
assert("[7] most recent search is at index 0 (AMD)",     list2[0] === "AMD");
assert("[7] previous search NVDA stays in list",         list2.includes("NVDA"));

// removeActiveResearchTicker
removeActiveResearchTicker("AMD");
assert("[7] removeActiveResearchTicker drops AMD",
  !listActiveResearchTickers().includes("AMD"));

// ============================================================
group("[8] ActiveTickerCard renders required fields");
// ============================================================

const { default: ActiveTickerCard } =
  await import("../src/components/workspace/ActiveTickerCard.jsx");
const cardHtml = renderToStaticMarkup(createElement(ActiveTickerCard, {
  ticker: {
    symbol: "TEM",
    theme: "AI Health Bridge",
    enginePosture: "WATCH",
    creditViewPosture: "constructive",
    thesisCheckStatus: "strengthening",
    intelligenceHeadline: "TEM AI Health Bridge thesis",
    whyHere: "AI infrastructure leader under counter-thesis pressure.",
    whatChanged: "New valuation-risk article detected.",
    whatChangedTone: "challenging",
    actionHint: "Wait for pullback or premium expansion.",
  },
}));
assert("[8] card renders the symbol",                    /TEM/.test(cardHtml));
assert("[8] card renders the theme",                     /AI Health Bridge/.test(cardHtml));
assert("[8] card renders the engine posture chip",       /Posture: WATCH/.test(cardHtml));
assert("[8] card renders the why-here line",             /Why this is here/.test(cardHtml) && /AI infrastructure leader/i.test(cardHtml));
assert("[8] card renders the what-changed line",         /What changed/.test(cardHtml) && /valuation-risk/i.test(cardHtml));
assert("[8] card renders the action hint",               /Wait for pullback or premium expansion/.test(cardHtml));
// No raw scoring tokens leak.
assert("[8] card has no _rank / score / weight tokens",
  !/_rank/.test(cardHtml) &&
  !/"score"\s*:/.test(cardHtml) &&
  !/"weight"\s*:/.test(cardHtml));

// ============================================================
group("[9] Top area renders 3 opportunity slots");
// ============================================================

// Default Dashboard renders 3 columns even when the queue is empty.
const topMatches = (defaultHtml.match(/Top opportunity|Best Opportunity|Second Opportunity|Third Opportunity/g) || []);
assert("[9] dashboard exposes 3 top-card slots (placeholders OK)",
  topMatches.length >= 3 ||
  /Waiting for qualifying setup/.test(defaultHtml));
assert("[9] placeholder copy is rendered when no opportunities exist",
  /Waiting for qualifying setup/.test(defaultHtml));

// ============================================================
group("[10] TickerDetailDrawer renders required sections");
// ============================================================

const { default: TickerDetailDrawer } =
  await import("../src/components/workspace/TickerDetailDrawer.jsx");
const drawerHtml = renderToStaticMarkup(createElement(TickerDetailDrawer, {
  symbol: "TEM",
  theme: "AI Health Bridge",
  posture: "WATCH",
  whatChanged: "New counter-thesis article detected.",
  triggerEngine: { posture: "Wait for confirmation", summary: "Engine summary placeholder." },
  creditView: { posture: "constructive", summary: "Credit View placeholder." },
  thesisCheck: {
    status: "strengthening",
    confidenceLabel: "medium",
    summary: "Thesis strengthening — 2 confirming · 1 challenging · 0 neutral",
    recommendation: "Recent intelligence supports the approved thesis.",
  },
  marketIntelligenceContext: {
    basket: "AI Health / Diagnostics",
    agentRead: "TEM is evaluated as an AI-health bridge company.",
    thesisAlignment: "supportive",
    primaryRisk: "Incumbent pressure",
    tradeTranslation: "Approved thesis supports monitoring for premium harvesting only if support, IV, and assignment comfort align.",
    supportingSignals: ["Pharma partnership"],
    challengingSignals: ["Reimbursement pressure"],
    memoryStatus: "approved",
    lastUpdated: 1_710_000_000_000,
  },
  intelligenceFeed: [{
    id: "intel_001",
    title: "TEM thesis baseline",
    thesis: { coreClaim: "TEM may be the bridge layer." },
  }],
  recommendedAction: "Premium candidate — review for scanner promotion.",
  risks: ["Speculative AI-health platform.", "Reimbursement pressure"],
}));
assert("[10] drawer renders chart placeholder",
  /Chart integration pending/i.test(drawerHtml));
assert("[10] drawer renders 'TRIGGER ENGINE SUMMARY'",
  /TRIGGER ENGINE SUMMARY/.test(drawerHtml));
assert("[10] drawer renders 'CREDIT VIEW SUMMARY'",
  /CREDIT VIEW SUMMARY/.test(drawerHtml));
assert("[10] drawer renders 'THESIS CHECK'",
  /THESIS CHECK/.test(drawerHtml));
assert("[10] drawer renders 'MARKET INTELLIGENCE CONTEXT'",
  /MARKET INTELLIGENCE CONTEXT/.test(drawerHtml));
assert("[10] drawer renders 'INTELLIGENCE FEED'",
  /INTELLIGENCE FEED/.test(drawerHtml));
assert("[10] drawer renders 'RECOMMENDED ACTION'",
  /RECOMMENDED ACTION/.test(drawerHtml));
assert("[10] drawer renders 'RISK / INVALIDATION NOTES'",
  /RISK . INVALIDATION NOTES/.test(drawerHtml));
assert("[10] drawer surfaces the operator coreClaim",
  /TEM may be the bridge layer/.test(drawerHtml));
assert("[10] drawer surfaces the recommended action",
  /Premium candidate — review for scanner promotion/.test(drawerHtml));

// ============================================================
group("[11] drawer surfaces the no-override disclaimer");
// ============================================================

assert("[11] drawer carries 'Context only — does not override engine verdict.'",
  /Context only — does not override engine verdict/i.test(drawerHtml));

// ============================================================
group("[12] whatChangedBuilder counter-thesis on valuation/reimbursement");
// ============================================================

const wValuation = describeWhatChanged({}, null, [{
  id: "x", catalysts: [], risks: ["Valuation / crowded-trade risk"],
}]);
assert("[12] valuation risk → counter_thesis_intelligence",
  wValuation.kind === "counter_thesis_intelligence");
assert("[12] message mentions counter-thesis (Phase 2 wording allowed)",
  /counter-thesis article detected/i.test(wValuation.message));
assert("[12] tone = challenging",                          wValuation.tone === "challenging");

const wReimbursement = buildWhatChanged({}, null, [{
  id: "x", catalysts: [], risks: ["Reimbursement pressure"],
}]);
assert("[12] reimbursement pressure → counter-thesis message",
  /counter-thesis article detected/i.test(wReimbursement));

// ============================================================
group("[13] whatChangedBuilder supportive on partnership / adoption");
// ============================================================

const wSupport = describeWhatChanged({}, null, [{
  id: "x", catalysts: ["Pharma partnership", "Hospital adoption / expansion"], risks: [],
}]);
assert("[13] partnership + hospital adoption → supportive_intelligence",
  wSupport.kind === "supportive_intelligence");
assert("[13] message mentions supportive intelligence",
  /supportive intelligence/i.test(wSupport.message));
assert("[13] tone = supportive",                           wSupport.tone === "supportive");

// ============================================================
group("[14] risk_elevated posture wins over supportive intelligence");
// ============================================================

const wRisky = describeWhatChanged(
  { posture: "risk_elevated" }, null,
  [{ id: "x", catalysts: ["Pharma partnership"], risks: [] }],
);
assert("[14] risk_elevated wins priority",                 wRisky.kind === "risk_elevated");
assert("[14] message mentions risk posture elevated",
  /risk posture elevated/i.test(wRisky.message));
assert("[14] tone = challenging",                          wRisky.tone === "challenging");

// ============================================================
group("[15] empty inputs → no_change");
// ============================================================

const wEmpty = describeWhatChanged(null, null, []);
assert("[15] no inputs → no_change",                       wEmpty.kind === "no_change");
assert("[15] message contains 'no major change'",
  /no major change/i.test(wEmpty.message));
assert("[15] tone = neutral",                              wEmpty.tone === "neutral");

// Diff-detection: posture downgrade
const wDowngrade = describeWhatChanged(
  { posture: "wait_for_confirmation" },
  { posture: "premium_candidate" },
);
assert("[15] posture downgrade detected",                  wDowngrade.kind === "posture_downgrade");

// Diff-detection: thesis confirmed
const wConfirmed = describeWhatChanged(
  { thesisHealthStatus: "strengthening" },
  { thesisHealthStatus: "unchanged" },
);
assert("[15] thesis_confirmed when health flips strengthening",
  wConfirmed.kind === "thesis_confirmed");

// ============================================================
group("[16] no raw scoring tokens in default workspace HTML");
// ============================================================

assert("[16] default HTML has no \"score\":N",        !/"score"\s*:\s*-?\d/.test(defaultHtml));
assert("[16] default HTML has no \"weight\":N",       !/"weight"\s*:/.test(defaultHtml));
assert("[16] default HTML has no coefficient token",  !/coefficient/i.test(defaultHtml));
assert("[16] default HTML has no \"w_\" prefix",      !/"w_/.test(defaultHtml));
assert("[16] default HTML has no '_rank' token",      !/_rank/.test(defaultHtml));

// Drawer + card HTML separately (rendered above).
const probes = [drawerHtml, cardHtml];
for (const [i, html] of probes.entries()) {
  assert(`[16] probe[${i}] no \"score\":N`,         !/"score"\s*:\s*-?\d/.test(html));
  assert(`[16] probe[${i}] no \"weight\":N`,        !/"weight"\s*:/.test(html));
  assert(`[16] probe[${i}] no coefficient token`,   !/coefficient/i.test(html));
  assert(`[16] probe[${i}] no \"w_\" prefix`,       !/"w_/.test(html));
  assert(`[16] probe[${i}] no '_rank' token`,       !/_rank/.test(html));
}

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetActiveResearchBackend();
resetMemoryBackend();
resetBasketBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
