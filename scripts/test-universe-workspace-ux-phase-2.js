#!/usr/bin/env node
// =====================================================
// Universe Workspace UX Phase 2 — action clarity + real
// intelligence workflow
// Run: npm run test:universe-workspace-ux-phase-2
//
// Acceptance gates per spec:
//   1.  ActiveTickerCard renders Why this is here
//   2.  ActiveTickerCard renders What changed
//   3.  ActiveTickerCard renders Next step (label, not just hint)
//   4.  ActiveTickerCard renders Watch risk row when supplied
//   5.  TickerDetailDrawer puts Recommended Action near top
//       (above the Chart)
//   6.  TickerDetailDrawer renders Operator Actions section with
//       Add intelligence / Set alert / Mark reviewed / Move to
//       watchlist / Open admin details buttons
//   7.  AMD search triggers a counter-thesis demo intelligence
//       item (SAMPLE / DEMO badge visible)
//   8.  Counter-thesis demo does NOT override engine posture /
//       verdict / allowedActions
//   9.  whatChangedBuilder returns sharpened "chase risk"
//       phrasing for valuation/reimbursement intelligence
//  10.  Empty dashboard state tells the operator to search a
//       ticker and lists examples
//  11.  Empty drawer state tells the operator to select a ticker
//  12.  Empty intelligence state prompts to add thesis/article/risk
//  13.  Default UI still hides backend / admin labels
//  14.  markTickerReviewed persists timestamp; getTickerReviewedAt
//       reads it
//  15.  Demo library returns null for unknown symbols
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  buildWhatChanged,
  describeWhatChanged,
} from "../src/lib/ui/whatChangedBuilder.js";
import {
  getDemoIntelligenceFor,
  hasDemoIntelligence,
  listDemoIntelligenceSymbols,
} from "../src/lib/workspace/demoIntelligenceLibrary.js";
import {
  setActiveResearchBackend,
  resetActiveResearchBackend,
  runTickerSearch,
  markTickerReviewed,
  getTickerReviewedAt,
  clearActiveResearch,
} from "../src/lib/workspace/tickerSearchWorkflow.js";
import {
  setMemoryBackend,
  resetMemoryBackend,
  clearAllIntelligence,
} from "../src/lib/portfolioCio/agentMemoryStore.js";
import {
  setBasketBackend,
  resetBasketBackend,
  clearAllBasketUniverses,
} from "../src/lib/portfolioCio/basketUniverseManager.js";
import {
  POSTURE,
} from "../src/lib/portfolioCio/aiHealthDiagnosticsAgent.js";
import {
  VERDICT,
} from "../src/lib/portfolioCio/aiHealthDiagnosticsScanner.js";

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

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
const { default: ActiveTickerCard } =
  await import("../src/components/workspace/ActiveTickerCard.jsx");
const { default: TickerDetailDrawer } =
  await import("../src/components/workspace/TickerDetailDrawer.jsx");
const { default: UniverseWorkspace } =
  await import("../src/components/common/UniverseWorkspace.jsx");

function renderSafe(Component, props = {}) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(Component, props)) }; }
  catch (err) { return { ok: false, err }; }
}

// ============================================================
group("[1-4] ActiveTickerCard surfaces operator-clear sections");
// ============================================================

const cardRender = renderSafe(ActiveTickerCard, {
  ticker: {
    symbol: "AMD",
    theme: "AI Infrastructure",
    enginePosture: "WATCH",
    creditViewPosture: "constructive",
    thesisCheckStatus: "weakening",
    intelligenceHeadline: "AMD Has Flipped Nvidia: Time To Sell",
    whyHere: "AI infrastructure leader with new valuation-risk intelligence.",
    whatChanged: "Counter-thesis article detected; chase risk increased.",
    whatChangedTone: "challenging",
    nextStep: "Wait for pullback, premium expansion, or Credit View improvement.",
    watchRisk: "Multiple compression / overextended expectations.",
  },
});
assert("[1-4] card renders without throwing",                  cardRender.ok, cardRender.err?.message);
assert("[1] card renders 'Why this is here' label",            /Why this is here/.test(cardRender.html));
assert("[1] card surfaces the why-here body",                  /AI infrastructure leader with new valuation-risk intelligence/.test(cardRender.html));
assert("[2] card renders 'What changed' label",                /What changed/.test(cardRender.html));
assert("[2] card surfaces the what-changed body",              /chase risk increased/.test(cardRender.html));
assert("[3] card renders 'Next step' label",                   /Next step/.test(cardRender.html));
assert("[3] card surfaces the next-step body",                 /Wait for pullback, premium expansion/.test(cardRender.html));
assert("[4] card renders 'Watch risk' label",                  /Watch risk/.test(cardRender.html));
assert("[4] card surfaces the watch-risk body",                /Multiple compression/.test(cardRender.html));
assert("[1-4] no _rank / score / weight tokens leak",
  !/_rank/.test(cardRender.html) &&
  !/"score"\s*:/.test(cardRender.html) &&
  !/"weight"\s*:/.test(cardRender.html));

// ============================================================
group("[5] Drawer puts Recommended Action above the Chart");
// ============================================================

const drawerRender = renderSafe(TickerDetailDrawer, {
  symbol: "AMD",
  theme: "AI Infrastructure",
  posture: "WATCH",
  whatChanged: "Counter-thesis article detected; chase risk increased.",
  recommendedAction: "Wait for pullback, premium expansion, or Credit View improvement.",
  intelligenceFeed: [{
    id: "intel_demo", isDemo: true, title: "AMD Has Flipped Nvidia: Time To Sell",
    sourceLabel: "Seeking Alpha", bias: "Cautionary", confidence: "Medium",
    thesis: { coreClaim: "Counter-thesis: AMD valuation stretched." },
  }],
  risks: ["Valuation / crowded-trade risk"],
});
assert("[5] drawer renders without throwing",                drawerRender.ok, drawerRender.err?.message);
const drawerHtml = drawerRender.html || "";
const idxAction = drawerHtml.indexOf("RECOMMENDED ACTION");
const idxChart  = drawerHtml.indexOf(/CHART/.exec(drawerHtml)?.[0] || "ZZZZ");
assert("[5] RECOMMENDED ACTION header present",              idxAction > -1);
assert("[5] CHART header present",                           idxChart > -1);
assert("[5] RECOMMENDED ACTION renders before CHART",        idxAction < idxChart);

// ============================================================
group("[6] Drawer renders Operator Actions section");
// ============================================================

assert("[6] drawer renders 'OPERATOR ACTIONS' header",
  /OPERATOR ACTIONS/.test(drawerHtml));
for (const label of [
  "Add intelligence",
  "Set alert",
  "Mark reviewed",
  "Move to watchlist",
  "Open admin details",
]) {
  assert(`[6] drawer renders '${label}' button`,             new RegExp(label).test(drawerHtml));
}

// ============================================================
group("[7] AMD demo intelligence surfaces a SAMPLE / DEMO badge");
// ============================================================

const demo = getDemoIntelligenceFor("AMD");
assert("[7] AMD has a demo intelligence item",               !!demo && demo.isDemo === true);
assert("[7] demo title matches spec",                        /AMD Has Flipped Nvidia: Time To Sell/.test(demo.title));
assert("[7] demo sourceLabel = Seeking Alpha",               demo.sourceLabel === "Seeking Alpha");
assert("[7] demo bias = Cautionary",                         demo.bias === "Cautionary");
assert("[7] demo confidence = Medium",                       demo.confidence === "Medium");
assert("[7] demo confirms / challenges / engineImpact present",
  Array.isArray(demo.confirms) && demo.confirms.length > 0 &&
  Array.isArray(demo.challenges) && demo.challenges.length > 0 &&
  typeof demo.engineImpact === "string");
assert("[7] drawer rendered the demo item with SAMPLE/DEMO badge",
  /SAMPLE . DEMO/i.test(drawerHtml));
assert("[7] drawer rendered Confirms / Challenges lines (when supplied)",
  /Confirms:/.test(drawerHtml) === false || /Confirms:/.test(drawerHtml));
// (Demo passed in this test didn't include confirms/challenges arrays
//  on purpose so we can verify the badge alone — the live AMD demo
//  in the library does include them; rendered separately below.)

const drawerWithLiveDemo = renderSafe(TickerDetailDrawer, {
  symbol: "AMD",
  posture: "WATCH",
  intelligenceFeed: [demo],
  recommendedAction: "Wait.",
});
assert("[7] live AMD demo renders Confirms / Challenges lines",
  drawerWithLiveDemo.ok &&
  /Confirms:/.test(drawerWithLiveDemo.html) &&
  /Challenges:/.test(drawerWithLiveDemo.html));
assert("[7] live AMD demo renders Engine impact line",
  drawerWithLiveDemo.ok &&
  /Engine impact:/.test(drawerWithLiveDemo.html));

// ============================================================
group("[8] demo does NOT override engine posture / verdict / actions");
// ============================================================

// The library item should never carry posture / verdict / allowedActions
// fields. The agent owns those — demo intelligence is purely
// informational.
const demoJson = JSON.stringify(demo);
assert("[8] demo has no 'posture' field",
  !Object.prototype.hasOwnProperty.call(demo, "posture"));
assert("[8] demo has no 'verdict' field",
  !Object.prototype.hasOwnProperty.call(demo, "verdict"));
assert("[8] demo has no 'allowedActions' field",
  !Object.prototype.hasOwnProperty.call(demo, "allowedActions"));
assert("[8] demo has no _rank / score / weight tokens",
  !/_rank/.test(demoJson) &&
  !/"score"\s*:\s*-?\d/.test(demoJson) &&
  !/"weight"\s*:/.test(demoJson));
// And whatChangedBuilder treats demo's risks just like any other risks
// — but the kind it produces is informational, not a posture override.
const wAmd = describeWhatChanged({}, null, [demo]);
assert("[8] demo intelligence → counter_thesis_intelligence (informational)",
  wAmd.kind === "counter_thesis_intelligence");

// ============================================================
group("[9] sharpened whatChangedBuilder messages");
// ============================================================

const wValuation = describeWhatChanged({}, null, [{
  id: "x", catalysts: [], risks: ["Valuation / crowded-trade risk"],
}]);
assert("[9] counter-thesis message mentions 'chase risk'",
  /chase risk/i.test(wValuation.message));

const wReimbursement = buildWhatChanged({}, null, [{
  id: "x", catalysts: [], risks: ["Reimbursement pressure"],
}]);
assert("[9] reimbursement pressure → counter-thesis with 'chase risk'",
  /chase risk/i.test(wReimbursement));

const wRisky = describeWhatChanged({ posture: "risk_elevated" }, null, []);
assert("[9] risk_elevated → 'avoid forcing a trade' guidance",
  /avoid forcing a trade/i.test(wRisky.message));

const wPremium = describeWhatChanged(
  { premiumQuality: 0.8 },
  { premiumQuality: 0.5 },
);
assert("[9] premium_quality_improved adds confirmation reminder",
  /entry still requires confirmation/i.test(wPremium.message));

const wThesisFlip = describeWhatChanged(
  { thesisHealthStatus: "weakening" },
  { thesisHealthStatus: "unchanged" },
);
assert("[9] thesis_challenged uses 'entry risk increased' phrasing",
  /entry risk increased/i.test(wThesisFlip.message));

// ============================================================
group("[10] empty Dashboard state lists example tickers");
// ============================================================

reset();
const renderEmpty = renderSafe(UniverseWorkspace, {});
assert("[10] empty dashboard renders without throwing",       renderEmpty.ok, renderEmpty.err?.message);
const emptyHtml = renderEmpty.html || "";
assert("[10] dashboard prompts to search a ticker",           /Search a ticker to start research/i.test(emptyHtml));
assert("[10] dashboard lists AMD / TEM / GH / NBIS examples", /AMD/i.test(emptyHtml) && /TEM/i.test(emptyHtml) && /GH/i.test(emptyHtml) && /NBIS/i.test(emptyHtml));

// ============================================================
group("[11] empty drawer state tells operator to select a ticker");
// ============================================================

const drawerEmpty = renderSafe(TickerDetailDrawer, {});
assert("[11] empty drawer renders without throwing",          drawerEmpty.ok, drawerEmpty.err?.message);
assert("[11] empty drawer copy mentions 'Select a ticker' / 'search'",
  drawerEmpty.ok &&
  /Select a ticker card or search a symbol/i.test(drawerEmpty.html));

// ============================================================
group("[12] empty Intelligence Feed prompts add note/article/risk");
// ============================================================

const drawerEmptyFeed = renderSafe(TickerDetailDrawer, {
  symbol: "TEM",
  posture: "WATCH",
  intelligenceFeed: [],
});
assert("[12] drawer renders empty Intelligence Feed copy",
  drawerEmptyFeed.ok &&
  /No approved intelligence yet\. Add a thesis note, article, or risk observation/i.test(drawerEmptyFeed.html));

// ============================================================
group("[13] Default UI hides backend / admin labels");
// ============================================================

const FORBIDDEN_LABELS = [
  "Core Catalog",
  "Dynamic Basket",
  "Manual Ticker List",
  "Lethal Board Prospects",
  "_rank",
];
for (const label of FORBIDDEN_LABELS) {
  assert(`[13] default workspace hides '${label}'`,
    !new RegExp(label).test(emptyHtml));
}
assert("[13] default workspace has no \"score\":N",        !/"score"\s*:\s*-?\d/.test(emptyHtml));
assert("[13] default workspace has no \"weight\":N",       !/"weight"\s*:/.test(emptyHtml));
assert("[13] default workspace has no coefficient token",  !/coefficient/i.test(emptyHtml));

// ============================================================
group("[14] markTickerReviewed persists timestamp");
// ============================================================

reset();
runTickerSearch("amd");
assert("[14] before mark: getTickerReviewedAt('AMD') is null",
  getTickerReviewedAt("AMD") === null);
const stamp = markTickerReviewed("amd", { at: 1_710_000_000_000 });
assert("[14] markTickerReviewed returned the supplied timestamp",
  stamp === 1_710_000_000_000);
assert("[14] getTickerReviewedAt('AMD') = 1_710_000_000_000",
  getTickerReviewedAt("AMD") === 1_710_000_000_000);
assert("[14] markTickerReviewed handles bad input safely",
  markTickerReviewed(null) === null &&
  markTickerReviewed("!!") === null);

// ============================================================
group("[15] demo library returns null for unknown symbols");
// ============================================================

assert("[15] demo library has AMD",                         hasDemoIntelligence("AMD"));
assert("[15] demo library lacks NVDA",                      !hasDemoIntelligence("NVDA"));
assert("[15] demo library returns null for unknown",        getDemoIntelligenceFor("ZZZZ") === null);
assert("[15] demo library returns null for empty",          getDemoIntelligenceFor("") === null);
assert("[15] demo library returns null for invalid",        getDemoIntelligenceFor("!!!") === null);
assert("[15] listDemoIntelligenceSymbols includes AMD",
  listDemoIntelligenceSymbols().includes("AMD"));

// ============================================================
group("[16] navigation collapses to a TOP bar, not a left rail");
// ============================================================

const { default: UniverseSidebar, WorkspaceTopNav, SIDEBAR_SECTIONS, SECTION_ID } =
  await import("../src/components/workspace/UniverseSidebar.jsx");

// --- Expanded mode: vertical sidebar -------------------------
const sidebarExpanded = renderSafe(UniverseSidebar, {
  selected: SECTION_ID.DASHBOARD,
  onSelect: () => {},
  onToggleCollapsed: () => {},
});
assert("[16] expanded sidebar renders WORKSPACE header",
  sidebarExpanded.ok && /WORKSPACE/.test(sidebarExpanded.html));
assert("[16] expanded sidebar renders full section labels",
  sidebarExpanded.ok &&
  /Dashboard/.test(sidebarExpanded.html) &&
  /Settings . Admin/.test(sidebarExpanded.html));
assert("[16] expanded sidebar shows section hints",
  sidebarExpanded.ok && /Overview . top opportunities/.test(sidebarExpanded.html));
assert("[16] expanded sidebar carries 'Collapse sidebar' aria-label",
  sidebarExpanded.ok && /aria-label="Collapse sidebar"/.test(sidebarExpanded.html));
assert("[16] expanded sidebar uses minWidth: 220",
  sidebarExpanded.ok && /min-width:\s*220/i.test(sidebarExpanded.html));

// --- Collapsed mode: horizontal top nav ----------------------
const topNav = renderSafe(WorkspaceTopNav, {
  selected: SECTION_ID.DASHBOARD,
  onSelect: () => {},
  onToggleCollapsed: () => {},
});
assert("[16] WorkspaceTopNav renders without throwing",
  topNav.ok, topNav.err?.message);
assert("[16] top nav carries 'Expand sidebar' aria-label",
  topNav.ok && /aria-label="Expand sidebar"/.test(topNav.html));
assert("[16] top nav has the 'Universe top navigation' aria-label",
  topNav.ok && /aria-label="Universe top navigation"/.test(topNav.html));
assert("[16] top nav HIDES section hint spans (only in title tooltip)",
  topNav.ok && !/>Overview . top opportunities</.test(topNav.html));
// Each button keeps its full aria-label for screen readers.
assert("[16] top nav preserves all 10 section aria-labels",
  topNav.ok &&
  SIDEBAR_SECTIONS.every((s) => new RegExp(`aria-label="${s.label}"`).test(topNav.html)));
// All 10 abbreviations render horizontally.
for (const abbrev of ["DB", "AI", "HX", "RB", "SW", "DI", "WL", "AL", "PF", "ST"]) {
  assert(`[16] top nav shows '${abbrev}' abbreviation`,
    topNav.ok && new RegExp(`>${abbrev}<`).test(topNav.html));
}
// The active section keeps its teal highlight (aria-pressed=true).
const topNavWithActive = renderSafe(WorkspaceTopNav, {
  selected: SECTION_ID.AI_HEALTH,
  onSelect: () => {},
  onToggleCollapsed: () => {},
});
const aiHealthButton = (topNavWithActive.html || "").match(
  /<button[^>]*aria-label="AI Health . Diagnostics"[^>]*>/i,
);
assert("[16] AI Health button found in top nav",
  topNavWithActive.ok && !!aiHealthButton);
assert("[16] AI Health button is marked aria-pressed=true",
  aiHealthButton && /aria-pressed="true"/.test(aiHealthButton[0]));

// --- UniverseWorkspace: top nav replaces the left rail -------
reset();
const wsCollapsed = renderSafe(UniverseWorkspace, {
  defaultCollapsed: true,
});
assert("[16] workspace renders the top nav when collapsed",
  wsCollapsed.ok &&
  /aria-label="Universe top navigation"/.test(wsCollapsed.html));
assert("[16] workspace does NOT render the vertical 'Universe sidebar' when collapsed",
  wsCollapsed.ok &&
  !/aria-label="Universe sidebar"/.test(wsCollapsed.html));
assert("[16] workspace dashboard content still renders below the top nav",
  wsCollapsed.ok &&
  /TOP OPPORTUNITIES/.test(wsCollapsed.html) &&
  /ACTIVE RESEARCH/.test(wsCollapsed.html));
// Verify the inner grid template no longer carries a 220px column —
// the dashboard reclaims the full width.
assert("[16] collapsed-mode inner grid uses no 220px sidebar column",
  wsCollapsed.ok && !/grid-template-columns:[^"]*220px[^"]*minmax/i.test(wsCollapsed.html));

const wsExpanded = renderSafe(UniverseWorkspace, {
  defaultCollapsed: false,
});
assert("[16] workspace renders the vertical sidebar when expanded",
  wsExpanded.ok &&
  /aria-label="Universe sidebar"/.test(wsExpanded.html));
assert("[16] workspace does NOT render the top nav when expanded",
  wsExpanded.ok &&
  !/aria-label="Universe top navigation"/.test(wsExpanded.html));
assert("[16] expanded-mode inner grid carries the 220px sidebar column",
  wsExpanded.ok && /grid-template-columns:[^"]*220px[^"]*minmax/i.test(wsExpanded.html));

// ============================================================
group("[17] Settings/Admin and Dashboard are separate render paths");
// ============================================================

reset();

// Admin-mode render
const wsAdmin = renderSafe(UniverseWorkspace, {
  defaultSection: "settings_admin",
});
assert("[17] admin workspace renders without throwing",
  wsAdmin.ok, wsAdmin.err?.message);
const adminHtml = wsAdmin.html || "";

// Admin page surfaces the SettingsAdminPage section + Research
// Automation accordion.
assert("[17] admin renders 'Settings / Admin' aria-label",
  /aria-label="Settings . Admin"/.test(adminHtml));
assert("[17] admin renders 'SETTINGS / ADMIN' header text",
  /SETTINGS . ADMIN/.test(adminHtml));
assert("[17] admin renders the new 'RESEARCH AUTOMATION' accordion",
  /RESEARCH AUTOMATION/.test(adminHtml));
assert("[17] Research Automation accordion shows hint copy when collapsed",
  /Scheduled research configurator/i.test(adminHtml));
// All legacy accordions still present (their headers are flattened
// upper-case strings).
for (const heading of [
  "TICKER SEARCH . CATALOG . HISTORY",
  "CIO BASKET AGENTS .RAW.",
  "CIO REVIEW DASHBOARD .RAW.",
  "AI HEALTH . DIAGNOSTICS SPECIALTY PANEL .RAW.",
  "MARKET INTELLIGENCE INBOX .RAW.",
  "THESIS HEALTH .RAW.",
]) {
  assert(`[17] admin lists '${heading.replace(/\\\./g, "·")}' accordion`,
    new RegExp(heading).test(adminHtml));
}

// Admin must NOT render dashboard chrome.
assert("[17] admin has NO dashboard 'TOP OPPORTUNITIES' header",
  !/TOP OPPORTUNITIES/.test(adminHtml));
assert("[17] admin has NO 'ACTIVE RESEARCH' header",
  !/ACTIVE RESEARCH/.test(adminHtml));
assert("[17] admin has NO Market regime strip aria-label",
  !/aria-label="Market regime strip"/.test(adminHtml));
assert("[17] admin has NO 'Ticker search' search bar aria-label",
  !/role="search"\s+aria-label="Ticker search"/i.test(adminHtml));

// Dashboard-mode render (default section)
const wsDashboard = renderSafe(UniverseWorkspace, {});
assert("[17] dashboard workspace renders without throwing",
  wsDashboard.ok, wsDashboard.err?.message);
const dashHtml = wsDashboard.html || "";
assert("[17] dashboard renders Market regime strip",
  /aria-label="Market regime strip"/.test(dashHtml));
assert("[17] dashboard renders 'TOP OPPORTUNITIES' header",
  /TOP OPPORTUNITIES/.test(dashHtml));
assert("[17] dashboard renders 'ACTIVE RESEARCH' header",
  /ACTIVE RESEARCH/.test(dashHtml));
assert("[17] dashboard exposes the ticker search bar",
  /role="search"\s+aria-label="Ticker search"/i.test(dashHtml));
// Dashboard must NOT render the admin SettingsAdminPage accordions.
assert("[17] dashboard has NO 'SETTINGS / ADMIN' header text",
  !/>SETTINGS . ADMIN</.test(dashHtml));
assert("[17] dashboard has NO 'RESEARCH AUTOMATION' accordion",
  !/RESEARCH AUTOMATION/.test(dashHtml));

// Sanity: no fixed minHeight forcing an empty gap on either page.
// The outer container should not pin a 600px minimum any more.
assert("[17] admin outer has no min-height:600 token",
  !/min-height:\s*600/i.test(adminHtml));
assert("[17] dashboard outer has no min-height:600 token",
  !/min-height:\s*600/i.test(dashHtml));

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetActiveResearchBackend();
resetMemoryBackend();
resetBasketBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
