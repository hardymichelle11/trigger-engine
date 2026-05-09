#!/usr/bin/env node
// =====================================================
// Basket Agent Panel UI tests
// Run: npm run test:basket-agent-panel
//
// Acceptance gates per spec:
//   1.  BasketAgentPanel renders all 12 basket choices.
//   2.  Selecting Storage / Memory shows SNDK baseline reference.
//   3.  Selecting Cooling / HVAC shows CARR baseline reference.
//   4.  Active universe starts empty.
//   5.  Manual symbol entry adds normalized active symbols.
//   6.  Seed selected baseline leaders adds only selected names.
//   7.  Seed all baseline leaders adds all baseline names.
//   8.  Moving active symbol to watchlist updates UI.
//   9.  Moving symbol to excluded updates UI.
//  10.  Restoring symbol to active updates UI.
//  11.  Removing symbol removes from all lists.
//  12.  Notes / tags render after update.
//  13.  Leadership table renders insufficient evidence when no manager
//       inputs exist.
//  14.  Excluded symbols do not appear in leader bucket.
//  15.  No raw score / weight / coefficient tokens appear in rendered HTML.
//  16.  Existing tests remain green (verified separately).
//  17.  Production build clean (verified separately).
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  setBasketBackend,
  resetBasketBackend,
  upsertBasketSymbol,
  removeBasketSymbol,
  moveToWatchlist,
  moveToExcluded,
  restoreToActive,
  updateBasketSymbolNote,
  addBasketSymbolTag,
  clearAllBasketUniverses,
  getBasketUniverse,
  seedBaselineLeaders,
} from "../src/lib/portfolioCio/basketUniverseManager.js";
import { listBasketAgents, getBasketAgent } from "../src/lib/portfolioCio/basketAgentRegistry.js";
import { buildBasketLeadershipRead } from "../src/lib/portfolioCio/basketLeadershipEngine.js";
import { STANCE } from "../src/lib/portfolioCio/managerAssessmentTypes.js";
// parseSymbolList is exported from a .jsx file — must be dynamic-imported
// after the register() call above so the JSX loader handles it.
const { parseSymbolList } = await import(
  "../src/components/portfolioCio/BasketUniverseEditor.jsx"
);

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
  setBasketBackend(makeMemoryBackend());
  clearAllBasketUniverses();
}

// ---------------------------------------------------------------------
// Component imports — done at runtime under the JSX loader
// ---------------------------------------------------------------------

const { default: BasketAgentPanel } =
  await import("../src/components/portfolioCio/BasketAgentPanel.jsx");
const { default: BasketMandateCard } =
  await import("../src/components/portfolioCio/BasketMandateCard.jsx");
const { default: BasketUniverseEditor } =
  await import("../src/components/portfolioCio/BasketUniverseEditor.jsx");
const { default: BasketLeadershipTable } =
  await import("../src/components/portfolioCio/BasketLeadershipTable.jsx");
const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");

function renderSafe(name, Component, props) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(Component, props)) }; }
  catch (err) { return { ok: false, err }; }
}

// ============================================================
group("[1] BasketAgentPanel renders all 12 basket choices");
// ============================================================
reset();

const panel1 = renderSafe("BasketAgentPanel default", BasketAgentPanel, {});
assert("[1] panel renders without throwing",          panel1.ok, panel1.err?.message);
const html1 = panel1.html || "";
const baskets = listBasketAgents();
assert("[1] basket count = 12",                       baskets.length === 12);
for (const b of baskets) {
  assert(`[1] HTML mentions ${b.basketName}`,         html1.includes(b.basketName));
}
assert("[1] HTML contains 'CIO BASKET AGENTS' header",
  /CIO BASKET AGENTS/.test(html1));
assert("[1] HTML mentions 'living mandate'",
  /living mandate/i.test(html1));

// ============================================================
group("[2] Selecting Storage / Memory shows SNDK baseline");
// ============================================================
reset();

const panel2 = renderSafe("Storage / Memory default", BasketAgentPanel, {
  defaultBasketId: "storage_memory_data_movement",
});
assert("[2] Storage panel renders",                   panel2.ok, panel2.err?.message);
const html2 = panel2.html || "";
assert("[2] HTML lists 'Storage / Memory / Data Movement'",
  /Storage \/ Memory \/ Data Movement/.test(html2));
assert("[2] HTML shows SNDK baseline button",
  />SNDK<\/button>|SNDK[\s\S]{0,40}<\/button>/.test(html2));
assert("[2] HTML labels baseline section as 'REFERENCE ANCHORS ONLY'",
  /REFERENCE ANCHORS ONLY/.test(html2));
assert("[2] HTML mentions 'Baseline leaders are reference anchors, not active membership'",
  /Baseline leaders are reference anchors, not active membership/.test(html2));

// ============================================================
group("[3] Selecting Cooling / HVAC shows CARR baseline");
// ============================================================
reset();

const panel3 = renderSafe("Cooling / HVAC default", BasketAgentPanel, {
  defaultBasketId: "cooling_hvac_building",
});
assert("[3] Cooling panel renders",                   panel3.ok, panel3.err?.message);
const html3 = panel3.html || "";
assert("[3] HTML lists 'Cooling / HVAC / Building Systems'",
  /Cooling \/ HVAC \/ Building Systems/.test(html3));
assert("[3] HTML shows CARR baseline button",
  /CARR/.test(html3));
assert("[3] HTML shows VRT baseline button",
  /VRT/.test(html3));

// ============================================================
group("[4] active universe starts empty");
// ============================================================
reset();

const panel4 = renderSafe("Storage / Memory empty default", BasketAgentPanel, {
  defaultBasketId: "storage_memory_data_movement",
});
const html4 = panel4.html || "";
assert("[4] active universe shows empty message",
  /No active names\. Use the input above or seed baseline leaders\./.test(html4));
assert("[4] watchlist shows empty message",
  /No watchlist names yet/.test(html4));
assert("[4] excluded shows empty message",
  /No excluded names/.test(html4));
const u4 = getBasketUniverse("storage_memory_data_movement");
assert("[4] store-level activeUniverse is empty",     u4.activeUniverse.length === 0);
assert("[4] store-level watchlist is empty",          u4.watchlist.length === 0);
assert("[4] store-level excluded is empty",           u4.excludedSymbols.length === 0);

// ============================================================
group("[5] manual symbol entry parses + normalizes");
// ============================================================

// parseSymbolList is the same helper the editor uses on Enter / click.
// "world!" → "WORLD!" → format-invalid (drops). "hello" → "HELLO" passes
// the format regex (the normalizer doesn't check the exchange — that
// happens later when we hit Polygon). Empty entries between commas
// are dropped.
const parsed = parseSymbolList("SNDK, wdc , carr,, TEM, tsla, hello world!, AAA");
assert("[5] parses 7 symbols (empty + 'world!' dropped, 'hello' kept)",
  Array.isArray(parsed) && parsed.length === 7);
assert("[5] uppercased + deduped (SNDK / WDC / CARR / TEM / TSLA / AAA all present)",
  parsed.includes("SNDK") && parsed.includes("WDC") && parsed.includes("CARR") &&
  parsed.includes("TEM") && parsed.includes("TSLA") && parsed.includes("AAA"));
assert("[5] 'world!' dropped (not in result)",
  !parsed.includes("WORLD!") && !parsed.includes("WORLD"));

// Verify the editor renders + reflects added symbols. We drive the
// store directly to simulate what the editor's onAddActive callback
// performs in the panel.
reset();
upsertBasketSymbol("storage_memory_data_movement", "SNDK", { addedReason: "manual_add" });
upsertBasketSymbol("storage_memory_data_movement", "WDC",  { addedReason: "manual_add" });
const editor5 = renderSafe("Editor with 2 active", BasketUniverseEditor, {
  universe: getBasketUniverse("storage_memory_data_movement"),
  onAddActive: () => {},
  onMoveToWatchlist: () => {},
  onMoveToExcluded: () => {},
  onRestoreToActive: () => {},
  onRemove: () => {},
});
const html5 = editor5.html || "";
assert("[5] editor renders without throwing",         editor5.ok, editor5.err?.message);
assert("[5] active universe shows SNDK",              />\s*▸ SNDK/.test(html5) || /SNDK/.test(html5));
assert("[5] active universe shows WDC",               /WDC/.test(html5));
assert("[5] active count = 2",
  /Active universe[\s\S]*?<span[^>]*>\s*2\s*</.test(html5));

// ============================================================
group("[6] seed selected baseline leaders adds only selected names");
// ============================================================
reset();

// Simulate "Seed Selected" by upserting only the selected names.
const selected = ["SNDK", "WDC"];
for (const sym of selected) {
  upsertBasketSymbol("storage_memory_data_movement", sym, {
    addedReason: "baseline_anchor",
    source: "registry_baseline",
  });
}
const u6 = getBasketUniverse("storage_memory_data_movement");
assert("[6] active universe length = 2",              u6.activeUniverse.length === 2);
assert("[6] active universe contains SNDK + WDC",
  u6.activeUniverse.some((r) => r.symbol === "SNDK") &&
  u6.activeUniverse.some((r) => r.symbol === "WDC"));
assert("[6] active universe does NOT contain MU",
  !u6.activeUniverse.some((r) => r.symbol === "MU"));

// ============================================================
group("[7] seed all baseline leaders adds all baseline names");
// ============================================================
reset();

const profile7 = getBasketAgent("storage_memory_data_movement");
seedBaselineLeaders("storage_memory_data_movement");
const u7 = getBasketUniverse("storage_memory_data_movement");
assert("[7] active universe length = baselineLeaders length",
  u7.activeUniverse.length === profile7.baselineLeaders.length);
for (const sym of profile7.baselineLeaders) {
  assert(`[7] active contains ${sym}`,
    u7.activeUniverse.some((r) => r.symbol === sym));
}
// Render the panel and confirm baseline names show up in the active
// list (not just as baseline reference chips).
const panel7 = renderSafe("Storage / Memory after Seed All", BasketAgentPanel, {
  defaultBasketId: "storage_memory_data_movement",
});
const html7 = panel7.html || "";
assert("[7] panel HTML mentions SNDK in active list (▸ SNDK)",
  /▸\s*SNDK/.test(html7));

// ============================================================
group("[8] moving active symbol to watchlist updates UI");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "WDC", {});
moveToWatchlist("storage_memory_data_movement", "WDC", "needs_confirmation");
const u8 = getBasketUniverse("storage_memory_data_movement");
assert("[8] WDC removed from activeUniverse",
  !u8.activeUniverse.some((r) => r.symbol === "WDC"));
assert("[8] WDC present on watchlist",
  u8.watchlist.some((r) => r.symbol === "WDC"));
const editor8 = renderSafe("Editor with WDC on watchlist", BasketUniverseEditor, {
  universe: u8,
  onAddActive: () => {}, onMoveToWatchlist: () => {}, onMoveToExcluded: () => {},
  onRestoreToActive: () => {}, onRemove: () => {},
});
const html8 = editor8.html || "";
assert("[8] watchlist column renders WDC",
  /Watchlist[\s\S]*?WDC/.test(html8));

// ============================================================
group("[9] moving symbol to excluded updates UI");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "MU", {});
moveToExcluded("storage_memory_data_movement", "MU", "concentration_risk");
const u9 = getBasketUniverse("storage_memory_data_movement");
assert("[9] MU not in activeUniverse",
  !u9.activeUniverse.some((r) => r.symbol === "MU"));
assert("[9] MU on excludedSymbols",
  u9.excludedSymbols.some((r) => r.symbol === "MU"));
const editor9 = renderSafe("Editor with MU excluded", BasketUniverseEditor, {
  universe: u9,
  onAddActive: () => {}, onMoveToWatchlist: () => {}, onMoveToExcluded: () => {},
  onRestoreToActive: () => {}, onRemove: () => {},
});
const html9 = editor9.html || "";
assert("[9] excluded column renders MU",
  /Excluded[\s\S]*?MU/.test(html9));

// ============================================================
group("[10] restoring symbol to active updates UI");
// ============================================================

restoreToActive("storage_memory_data_movement", "MU");
const u10 = getBasketUniverse("storage_memory_data_movement");
assert("[10] MU back in activeUniverse",
  u10.activeUniverse.some((r) => r.symbol === "MU"));
assert("[10] MU not in excludedSymbols",
  !u10.excludedSymbols.some((r) => r.symbol === "MU"));

// ============================================================
group("[11] removing symbol removes from all lists");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "WDC", {});
removeBasketSymbol("storage_memory_data_movement", "WDC");
const u11 = getBasketUniverse("storage_memory_data_movement");
assert("[11] WDC absent from activeUniverse",     !u11.activeUniverse.some((r) => r.symbol === "WDC"));
assert("[11] WDC absent from watchlist",           !u11.watchlist.some((r) => r.symbol === "WDC"));
assert("[11] WDC absent from excludedSymbols",     !u11.excludedSymbols.some((r) => r.symbol === "WDC"));

// ============================================================
group("[12] notes / tags render after update");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "PSTG", {});
updateBasketSymbolNote("storage_memory_data_movement", "PSTG", "watching guidance");
addBasketSymbolTag("storage_memory_data_movement", "PSTG", "earnings");
const u12 = getBasketUniverse("storage_memory_data_movement");
assert("[12] PSTG note saved",
  u12.activeUniverse.find((r) => r.symbol === "PSTG").notes === "watching guidance");
assert("[12] PSTG tag saved",
  u12.activeUniverse.find((r) => r.symbol === "PSTG").tags.includes("earnings"));
const editor12 = renderSafe("Editor with note + tag", BasketUniverseEditor, {
  universe: u12,
  onAddActive: () => {}, onMoveToWatchlist: () => {}, onMoveToExcluded: () => {},
  onRestoreToActive: () => {}, onRemove: () => {},
  onAddTag: () => {}, onRemoveTag: () => {}, onUpdateNote: () => {},
});
const html12 = editor12.html || "";
assert("[12] editor renders note text",
  /watching guidance/.test(html12));
assert("[12] editor renders tag chip",
  /earnings/.test(html12));

// ============================================================
group("[13] leadership table renders insufficient evidence when no managers");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
const profile13 = getBasketAgent("storage_memory_data_movement");
const universe13 = getBasketUniverse("storage_memory_data_movement");
const read13 = buildBasketLeadershipRead({
  basketProfile: profile13,
  basketUniverse: universe13,
  managerAssessmentsBySymbol: {}, // no manager data
});
const table13 = renderSafe("LeadershipTable no managers", BasketLeadershipTable, {
  read: read13,
  universe: universe13,
  managerAssessmentsBySymbol: {},
});
assert("[13] table renders without throwing",         table13.ok, table13.err?.message);
const html13 = table13.html || "";
assert("[13] HTML mentions 'Insufficient manager evidence'",
  /Insufficient manager evidence/.test(html13));
assert("[13] HTML mentions 'leadership requires TE / CV / MI assessment'",
  /leadership requires TE \/ CV \/ MI assessment/i.test(html13));
assert("[13] HTML mentions 'Use Ad Hoc Simulation to generate manager reads'",
  /Use Ad Hoc Simulation to generate manager reads/i.test(html13));

// ============================================================
group("[14] excluded symbols do not appear in leader bucket");
// ============================================================
reset();

upsertBasketSymbol("storage_memory_data_movement", "SNDK", {});
moveToExcluded("storage_memory_data_movement", "SNDK", "concentration_risk");
const universe14 = getBasketUniverse("storage_memory_data_movement");
const ma14 = {
  SNDK: {
    trigger_engine: { stance: STANCE.CONSTRUCTIVE },
    credit_view:    { stance: STANCE.CONSTRUCTIVE },
    market_intel:   { stance: STANCE.CONSTRUCTIVE },
  },
};
const read14 = buildBasketLeadershipRead({
  basketProfile: getBasketAgent("storage_memory_data_movement"),
  basketUniverse: universe14,
  managerAssessmentsBySymbol: ma14,
});
assert("[14] read.leaders does NOT include SNDK",
  !read14.leaders.some((l) => l.symbol === "SNDK"));
const table14 = renderSafe("LeadershipTable excluded", BasketLeadershipTable, {
  read: read14,
  universe: universe14,
  managerAssessmentsBySymbol: ma14,
});
const html14 = table14.html || "";
assert("[14] table membership column shows 'Excluded' for SNDK row",
  /SNDK[\s\S]*?Excluded/.test(html14));
assert("[14] table does not classify SNDK as 'Leader'",
  !/SNDK[\s\S]{0,200}Leader<\/span>/.test(html14));

// ============================================================
group("[15] no raw scores / weights / coefficients in rendered HTML");
// ============================================================

// Render the full panel with a populated universe + manager data.
reset();
seedBaselineLeaders("storage_memory_data_movement");
const ma15 = {
  SNDK: { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
          credit_view:    { stance: STANCE.CONSTRUCTIVE },
          market_intel:   { stance: STANCE.CONSTRUCTIVE } },
  WDC:  { trigger_engine: { stance: STANCE.CAUTIOUS },
          credit_view:    { stance: STANCE.CAUTIOUS },
          market_intel:   { stance: STANCE.CONSTRUCTIVE } },
};
const panel15 = renderSafe("Full panel render", BasketAgentPanel, {
  defaultBasketId: "storage_memory_data_movement",
  managerAssessmentsBySymbol: ma15,
});
assert("[15] panel renders without throwing",         panel15.ok, panel15.err?.message);
const html15 = panel15.html || "";
assert("[15] no raw \"score\":N in HTML",             !/"score"\s*:\s*-?\d/.test(html15));
assert("[15] no raw \"weight\":N in HTML",            !/"weight"\s*:/.test(html15));
assert("[15] no \"coefficient\" token in HTML",        !/coefficient/i.test(html15));
assert("[15] no \"w_\" prefix in HTML",                !/"w_/.test(html15));

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetBasketBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
