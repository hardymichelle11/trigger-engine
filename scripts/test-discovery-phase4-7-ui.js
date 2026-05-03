#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.7 UI tests
// Run: npm run test:discovery-phase4-7-ui
// =====================================================
//
// Verifies the trader cockpit UI redesign:
//
//   - cockpit + sub-component files exist with valid JSX
//   - LethalBoardCockpit composes AdminSidebar + TopOpportunityGrid
//     + RankedWorkspace + DetailSidePanel + MarketNewsPanel
//   - LethalBoardPage now renders the cockpit (not the old board)
//   - TradeConstructionSection is still rendered (preserved)
//   - filter row exposes the documented filter labels
//   - frozen surfaces are NOT modified
//   - safety: no scoreBreakdown / weights / probability internals /
//     debug fields / Monte Carlo internals leak into UI source
//   - safety: no fake news headlines hardcoded as real
//   - safety: no scraping URLs added to UI
//   - safety: no auto-trading / order placement language
//   - safety: no direct WebSocket connection to ThetaData from UI
// =====================================================

import { readFileSync, existsSync } from "node:fs";
import { transformWithOxc } from "vite";

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
    assert(`${name} — JSX is valid`, true);
  } catch (e) {
    assert(`${name} — JSX is valid`, false, e?.message || String(e));
  }
}

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.7 UI");
console.log("  ══════════════════════════════════════════════");

// =================================================================
// 1. Cockpit files exist
// =================================================================
group("cockpit files exist");

// Phase 4.7.2 renamed every cockpit component. The Phase 4.7 test
// keeps its assertion shape but points at the new file names.
const COCKPIT_FILES = {
  cockpit: "src/components/discovery/LethalBoardCockpit.jsx",
  page:    "src/components/discovery/LethalBoardPage.jsx",
  primitives: "src/components/discovery/cockpit/cockpitPrimitives.jsx",
  adminSidebar: "src/components/discovery/cockpit/OperatorConsole.jsx",
  commandBar: "src/components/discovery/cockpit/CapitalCommandBar.jsx",
  topGrid: "src/components/discovery/cockpit/TopPicksGrid.jsx",
  ranked:  "src/components/discovery/cockpit/RankedCandidatesPanel.jsx",
  detail:  "src/components/discovery/cockpit/OpportunityDetailPanel.jsx",
  news:    "src/components/discovery/cockpit/MarketIntelligencePanel.jsx",
  recentAlerts: "src/components/discovery/cockpit/AlertsPanel.jsx",
  chart:   "src/components/discovery/cockpit/TradingViewChartPlaceholder.jsx",
};

for (const [name, path] of Object.entries(COCKPIT_FILES)) {
  assert(`${name} (${path}) exists`, existsSync(path));
}

// =================================================================
// 2. JSX validity for every cockpit file
// =================================================================
group("JSX validity");

for (const [name, path] of Object.entries(COCKPIT_FILES)) {
  await assertJsxValid(name, path);
}

// =================================================================
// 3. Cockpit composes the documented sub-components
// =================================================================
group("LethalBoardCockpit composes the right sub-components");
{
  const src = readFileSync(COCKPIT_FILES.cockpit, "utf8");
  // Phase 4.7.2 renames — assert by NEW names. The mapping is:
  //   AdminSidebar         → OperatorConsole
  //   CommandBar           → CapitalCommandBar
  //   TopOpportunityGrid   → TopPicksGrid
  //   RankedWorkspace      → RankedCandidatesPanel
  //   DetailSidePanel      → OpportunityDetailPanel
  //   MarketNewsPanel      → MarketIntelligencePanel
  //   RecentAlertsPanel    → AlertsPanel
  for (const name of [
    "OperatorConsole",
    "CapitalCommandBar",
    "TopPicksGrid",
    "RankedCandidatesPanel",
    "OpportunityDetailPanel",
    "MarketIntelligencePanel",
    "AlertsPanel",
  ]) {
    assert(`Cockpit imports/uses ${name}`,
      new RegExp(`\\b${name}\\b`).test(src));
  }
}

// =================================================================
// 4. LethalBoardPage renders the cockpit (not the old board layout)
// =================================================================
group("LethalBoardPage wires the cockpit");
{
  const src = readFileSync(COCKPIT_FILES.page, "utf8");
  assert("Page imports LethalBoardCockpit",
    /import\s+LethalBoardCockpit\s+from\s+["'].\/LethalBoardCockpit\.jsx["']/.test(src));
  assert("Page renders <LethalBoardCockpit ...>",
    /<LethalBoardCockpit\b/.test(src));
  assert("Page builds tradeContextBySymbol via useMemo",
    /tradeContextBySymbol\s*=\s*useMemo\(/.test(src));
  // The old <LethalBoard /> component should no longer be the active render.
  assert("Page no longer imports './LethalBoard.jsx' (old layout retired in this page)",
    !/import\s+LethalBoard\s+from\s+["']\.\/LethalBoard\.jsx["']/.test(src));
}

// =================================================================
// 5. TradeConstructionSection is preserved within the detail panel
// =================================================================
group("TradeConstructionSection still rendered");
{
  const src = readFileSync(COCKPIT_FILES.detail, "utf8");
  assert("DetailSidePanel imports TradeConstructionSection",
    /TradeConstructionSection/.test(src));
  assert("DetailSidePanel renders <TradeConstructionSection .../>",
    /<TradeConstructionSection\b/.test(src));
}

// =================================================================
// 6. Filter row exposes documented labels
// =================================================================
group("RankedWorkspace filter row");
{
  const src = readFileSync(COCKPIT_FILES.ranked, "utf8");
  for (const label of [
    "All",
    "Option candidates",
    "Watch",
    "ETFs",
    "AI infrastructure",
    "High premium",
    "Live premium",
    "Estimated/unavailable",
  ]) {
    assert(`Filter "${label}" present`, src.includes(label));
  }
}

// =================================================================
// 7. Frozen surfaces are NOT modified
// =================================================================
group("frozen surfaces unchanged");
{
  // Phase 4.4 / Phase 1–4.3 frozen files: discovery should not modify these.
  // Read them and assert content is non-empty (i.e. they exist as-is). The
  // strongest signal (file unchanged byte-for-byte) lives in git, not here;
  // these are a sanity check.
  for (const path of [
    "src/components/discovery/recordedAlertsRollup.js",
    "src/components/discovery/recordedAlertsView.js",
    "src/lib/alerts/alertHistory.js",
  ]) {
    assert(`${path} present and non-empty`,
      existsSync(path) && readFileSync(path, "utf8").length > 100);
  }

  // LethalBoard.jsx (Phase 4.4 surface) is preserved untouched alongside
  // the new cockpit. The page just stops importing it; the file itself
  // should still render the legacy layout if anyone wants to use it.
  const lb = readFileSync("src/components/discovery/LethalBoard.jsx", "utf8");
  assert("LethalBoard.jsx still exports default and renders BestOpportunityCard etc.",
    /export\s+default\s+function\s+LethalBoard/.test(lb)
    && /BestOpportunityCard/.test(lb));
}

// =================================================================
// 8. Safety — no engine internals leak into cockpit UI source
// =================================================================
group("safety — no engine internals in cockpit UI");
{
  const banned = [
    "scoreBreakdown",
    "weights",
    "probabilityInternals",
    "monteCarlo",
    "mcPaths",
    "ivPercentileRaw",
    "debugInternals",
    "_engineDebug",
  ];
  for (const path of [
    COCKPIT_FILES.cockpit,
    COCKPIT_FILES.adminSidebar,
    COCKPIT_FILES.commandBar,
    COCKPIT_FILES.topGrid,
    COCKPIT_FILES.ranked,
    COCKPIT_FILES.detail,
    COCKPIT_FILES.primitives,
    COCKPIT_FILES.news,
    COCKPIT_FILES.recentAlerts,
    COCKPIT_FILES.chart,
  ]) {
    const stripped = stripComments(readFileSync(path, "utf8"));
    for (const b of banned) {
      assert(`${path}: does NOT reference ${b}`,
        !new RegExp(`\\b${b}\\b`).test(stripped));
    }
  }
}

// =================================================================
// 9. Safety — no fake news hardcoded as real
// =================================================================
group("safety — no fake news hardcoded as real in MarketNewsPanel");
{
  const src = readFileSync(COCKPIT_FILES.news, "utf8");
  // Placeholder banner must be present so the operator never mistakes
  // the placeholder rows for a real feed.
  assert("MarketNewsPanel renders a placeholder banner when items are absent",
    /placeholder · no live feed wired/i.test(src));
  // Source / timestamp default to "—", not a fabricated real-looking source.
  assert("MarketNewsPanel default rows use '—' for source/timestamp",
    /timestamp:\s*"—"/.test(src) && /source:\s*"—"/.test(src));
  // No hardcoded brand name asserted as a real source in the placeholder rows.
  for (const brand of ["bloomberg.com", "cnbc.com", "investing.com", "marketwatch.com"]) {
    assert(`MarketNewsPanel does NOT hardcode ${brand} as a real source`,
      !new RegExp(`source:\\s*["'][^"']*${brand}`, "i").test(src));
  }
}

// =================================================================
// 10. Safety — no scraping URLs / no auto-trading / no WS to Theta
// =================================================================
group("safety — no scraping / auto-trading / direct WebSocket");
{
  const cockpitSources = [
    COCKPIT_FILES.cockpit,
    COCKPIT_FILES.adminSidebar,
    COCKPIT_FILES.commandBar,
    COCKPIT_FILES.topGrid,
    COCKPIT_FILES.ranked,
    COCKPIT_FILES.detail,
    COCKPIT_FILES.primitives,
    COCKPIT_FILES.news,
    COCKPIT_FILES.recentAlerts,
    COCKPIT_FILES.chart,
  ].map(p => ({ path: p, src: stripComments(readFileSync(p, "utf8")) }));

  // No literal scraping/news URLs from the brands the operator listed
  // as future targets. Phase 4.9 will introduce a proper adapter.
  for (const url of [
    "https://www.bloomberg.com",
    "https://www.cnbc.com",
    "https://www.investing.com",
    "https://www.marketwatch.com",
    "https://www.tradingview.com",
  ]) {
    for (const { path, src } of cockpitSources) {
      assert(`${path}: does NOT contain hardcoded URL ${url}`,
        !src.includes(url));
    }
  }

  // No order-placement / auto-trading language.
  const tradeBan = [
    "placeOrder",
    "submitOrder",
    "executeTrade",
    "broker.submit",
    "autoTrade",
    "auto_trade",
  ];
  for (const { path, src } of cockpitSources) {
    for (const t of tradeBan) {
      assert(`${path}: does NOT include order/auto-trade hook ${t}`,
        !new RegExp(`\\b${t}\\b`).test(src));
    }
  }

  // No direct WebSocket open from cockpit UI files.
  for (const { path, src } of cockpitSources) {
    assert(`${path}: does NOT open a WebSocket directly`,
      !/new\s+WebSocket\s*\(/.test(src));
    assert(`${path}: does NOT reference ThetaData WebSocket port 25520`,
      !/25520/.test(src));
  }
}

// =================================================================
// 11. AdminSidebar surfaces required admin info
// =================================================================
group("OperatorConsole exposes scan controls + status surfaces");
{
  const src = readFileSync(COCKPIT_FILES.adminSidebar, "utf8");
  for (const fragment of [
    "Run sample scan",
    "Run live preview",
    "Run & record",
    "Polygon universe",
    "ThetaData options",
    "Last scan",
    "Recorded alerts",
  ]) {
    assert(`OperatorConsole contains "${fragment}"`,
      src.includes(fragment));
  }
}

// =================================================================
// 12. TopOpportunityGrid: top 3 columns + chart placeholder
// =================================================================
group("TopPicksGrid: 3-column top picks with chart slot");
{
  // Phase 4.7.2: chart rendering moved into the extracted OpportunityCard
  // component, which TopPicksGrid composes. The chart-dominant height check
  // now reads the card source.
  const gridSrc = readFileSync(COCKPIT_FILES.topGrid, "utf8");
  const cardSrc = readFileSync("src/components/discovery/cockpit/OpportunityCard.jsx", "utf8");
  assert("OpportunityCard renders a TradingViewChartPlaceholder",
    /TradingViewChartPlaceholder/.test(cardSrc));
  assert("TopPicksGrid composes OpportunityCard",
    /OpportunityCard/.test(gridSrc));
  assert("default topN is 3", /topN\s*=\s*3/.test(gridSrc));
  assert("renders a 3-equal-column grid (xl:grid-cols-3 OR repeat-auto-fit OR repeat-3)",
    /xl:grid-cols-3/.test(gridSrc)
      || /gridTemplateColumns:\s*["']repeat\(\s*auto-fit/.test(gridSrc)
      || /gridTemplateColumns:\s*["']repeat\(\s*3\s*,/.test(gridSrc));
  assert("chart placeholder height ≥ 180px (chart-dominant)",
    (() => {
      const m = cardSrc.match(/chartHeight\s*=\s*(\d+)/)
            || cardSrc.match(/<TradingViewChartPlaceholder[^/]*height=\{(\d+)\}/);
      return m ? Number(m[1]) >= 180 : false;
    })());
}

// =================================================================
// 13. DetailSidePanel sections match the spec (A–G)
// =================================================================
group("DetailSidePanel sections");
{
  const src = readFileSync(COCKPIT_FILES.detail, "utf8");
  for (const sectionName of [
    "Summary",
    "Trade construction",
    "Capital impact",
    "Practical insights",
    "Technical context",
    "News / market insight",
    "Why this ranks high",
    "Risks to verify",
  ]) {
    assert(`DetailSidePanel section "${sectionName}" present`,
      src.includes(sectionName));
  }
}

// =================================================================
// 14. CommandBar surfaces 5 trading-context items
// =================================================================
group("CapitalCommandBar — top horizontal bar");
{
  const src = readFileSync(COCKPIT_FILES.commandBar, "utf8");
  for (const label of [
    "Market mode",
    "Regime",
    "Deployable",
    "Pressure",
    "Best",
  ]) {
    assert(`CapitalCommandBar surfaces "${label}"`, src.includes(label));
  }
}

// =================================================================
// 15. Cockpit lower split: 60/40
// =================================================================
group("Cockpit lower split — 60/40");
{
  // Phase 4.7.2: cockpit went strict 100vh; the 60/40 split is now applied
  // unconditionally via inline JSX style (no media query). The Phase 4.7.1
  // @media-query approach was retired in favor of the simpler always-on
  // desktop grid the spec calls for.
  const src = readFileSync(COCKPIT_FILES.cockpit, "utf8");
  assert("cockpit applies an explicit 60/40 grid",
    /grid-template-columns:\s*60%\s+40%/.test(src)
      || /gridTemplateColumns:\s*["']60%\s+40%["']/.test(src));
}

// =================================================================
// SUMMARY
// =================================================================
console.log("\n  ════════════════════════════════════════════");
console.log(`  Phase 4.7 UI: ${passed} passed, ${failed} failed (total ${passed + failed})`);
if (failed > 0) {
  console.log("\n  Failures:");
  for (const line of failureLines) console.log("    ✗ " + line);
  process.exit(1);
}
process.exit(0);
