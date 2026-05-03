#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.7.3 tests
// Run: npm run test:discovery-phase4-7-3
// =====================================================
//
// Verifies the Fidelity-style visual refinement:
//   - cockpitTheme module exports the documented palette tokens
//   - root CSS forces no horizontal scroll on html / body / #root
//   - LethalBoardCockpit applies width: 100vw + max-width: 100vw + overflow: hidden
//   - All grid containers have min-width: 0 (no horizontal overflow)
//   - OpportunityCard no longer uses neon "best" / "selected" glow
//     (border-emerald-500/30 etc. retired); selected uses teal accent line
//   - RankedCandidatesPanel is now a positions-table layout with
//     header row + alternating rows + selected row tint
//   - OpportunityDetailPanel has Fidelity-style quote header,
//     ATR range bar, and bottom Watch / Candidate / Simulate / Alert action bar
//   - All cockpit panels reference cockpitTheme tokens (panelBg / border / etc.)
// =====================================================

import { readFileSync, existsSync } from "node:fs";

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

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.7.3");
console.log("  ═════════════════════════════════════════════");

// =================================================================
// 1. cockpitTheme module exists with documented palette
// =================================================================
group("cockpitTheme — palette tokens");
{
  const path = "src/components/discovery/cockpit/cockpitTheme.js";
  assert("cockpitTheme.js exists", existsSync(path));
  const src = read(path);
  for (const token of [
    "pageBg",      "consoleBg",   "workspaceBg", "stripBg",
    "panelBg",     "nestedBg",    "inputBg",     "border",
    "text",        "textDim",
    "accentGreen", "accentRed",   "accentAmber", "accentTeal",
  ]) {
    assert(`COCKPIT_PALETTE.${token} declared`, new RegExp(`\\b${token}\\b`).test(src));
  }
  // Specific spec colors must be present
  for (const literal of [
    "#050607", "#0b0d10", "#151719", "#202225",
    "#303236", "#2b2f34", "#9ca3af", "#f3f4f6",
    "#22c55e", "#f59e0b", "#ef4444", "#14b8a6",
  ]) {
    assert(`COCKPIT_PALETTE contains literal ${literal}`, src.includes(literal));
  }
  assert("exports COCKPIT_PALETTE",  /export\s+const\s+COCKPIT_PALETTE\b/.test(src));
  assert("exports COCKPIT_SCROLL_CLASS", /export\s+const\s+COCKPIT_SCROLL_CLASS\b/.test(src));
}

// =================================================================
// 2. Root CSS forces no horizontal scroll
// =================================================================
group("root CSS — no horizontal scroll");
{
  const css = read("src/index.css");
  assert("html, body, #root rule present",
    /html\s*,\s*body\s*,\s*#root\s*\{/.test(css));
  assert("overflow-x: hidden on root", /overflow-x:\s*hidden/.test(css));
  assert("width: 100% on root rule", /width:\s*100%/.test(css));
  assert("scrollbar hover/track styling present",
    /::-webkit-scrollbar/.test(css));
}

// =================================================================
// 3. LethalBoardCockpit container guards against overflow
// =================================================================
group("LethalBoardCockpit — strict 100vw / overflow hidden");
{
  const src = read("src/components/discovery/LethalBoardCockpit.jsx");
  assert("container width: 100vw", /width:\s*["']100vw["']/.test(src));
  assert("container maxWidth: 100vw", /maxWidth:\s*["']100vw["']/.test(src));
  assert("container overflow: hidden", /overflow:\s*["']hidden["']/.test(src));
  assert("uses 280px minmax(0, 1fr) sidebar grid",
    /gridTemplateColumns:\s*["']280px\s+minmax\(0,\s*1fr\)["']/.test(src));
  assert("imports COCKPIT_PALETTE", /COCKPIT_PALETTE/.test(src));
  assert("page background uses pageBg token",
    /background:\s*COCKPIT_PALETTE\.pageBg/.test(src));
  // No horizontal overflow should be possible — every grid item gets minWidth: 0.
  // The page sets it on minmax(0, 1fr) for the second col; main / lower-workspace /
  // top-picks-grid each declare minWidth: 0 inline. Spot-check those.
  const minWidthHits = (src.match(/minWidth:\s*0/g) || []).length;
  assert(`cockpit declares minWidth: 0 in multiple grid items (≥ 4)`,
    minWidthHits >= 4, `got ${minWidthHits}`);
}

// =================================================================
// 4. OpportunityCard — neon retired
// =================================================================
group("OpportunityCard — no whole-card glow");
{
  const src = read("src/components/discovery/cockpit/OpportunityCard.jsx");
  const stripped = stripComments(src);
  assert("imports COCKPIT_PALETTE", /COCKPIT_PALETTE/.test(stripped));
  // The Phase 4.7.1 / 4.7.2 versions used these emerald glow classes; they
  // must be gone in 4.7.3.
  assert("no border-emerald-400/60 (selected glow retired)",
    !/border-emerald-400\/60/.test(stripped));
  assert("no bg-emerald-500/[0.04] (whole-card wash retired)",
    !/bg-emerald-500\/\[0\.04\]/.test(stripped));
  assert("no border-emerald-500/30 (best-glow retired)",
    !/border-emerald-500\/30/.test(stripped));
  // Selected state now uses an explicit teal accent border-left.
  assert("selected state uses teal accent border-left",
    /borderLeft[\s\S]{0,80}accentTeal/.test(stripped));
}

// =================================================================
// 5. RankedCandidatesPanel — positions table layout
// =================================================================
group("RankedCandidatesPanel — table layout");
{
  const src = read("src/components/discovery/cockpit/RankedCandidatesPanel.jsx");
  const stripped = stripComments(src);
  assert("imports COCKPIT_PALETTE", /COCKPIT_PALETTE/.test(src));
  // Header row with column labels (exists as a grid with column headings)
  for (const heading of ["Symbol", "Action / fit", "Score", "Premium", "Mid", "Spread"]) {
    assert(`table header column "${heading}" present`,
      stripped.includes(heading));
  }
  // Selected row uses teal accent border-left
  assert("selected row uses teal accent border-left",
    /borderLeft\s*=?\s*[\s\S]{0,120}accentTeal/.test(stripped)
      || /accentTeal[\s\S]{0,40}borderLeft/.test(stripped));
  // Alternating row backgrounds
  assert("alternating row backgrounds (idx % 2)",
    /idx\s*%\s*2/.test(stripped));
  // No more thick neon card borders on rows
  assert("no border-emerald-* card classes on rows",
    !/border-emerald-\d{3}\/30/.test(stripped));
}

// =================================================================
// 6. OpportunityDetailPanel — Fidelity quote layout
// =================================================================
group("OpportunityDetailPanel — quote layout + range bars + actions");
{
  const src = read("src/components/discovery/cockpit/OpportunityDetailPanel.jsx");
  const stripped = stripComments(src);
  assert("imports COCKPIT_PALETTE", /COCKPIT_PALETTE/.test(src));
  assert("renders QuoteHeader",       /QuoteHeader/.test(stripped));
  assert("renders SectionRangeBars",  /SectionRangeBars/.test(stripped));
  assert("renders DetailActionBar",   /DetailActionBar/.test(stripped));
  // Bottom action bar buttons (per spec). Phase 4.7.4 made the labels
  // state-aware (e.g. label={watching ? "Watching" : "Watch"}), so we
  // accept either the literal `label="Watch"` form OR a ternary that
  // mentions the canonical label.
  for (const label of ["Watch", "Candidate", "Simulate", "Alert"]) {
    const literal = new RegExp(`label\\s*=\\s*["']${label}["']`).test(stripped);
    const ternary = new RegExp(`["']${label}["']`).test(stripped);
    assert(`bottom action "${label}" present`, literal || ternary);
  }
  // Range bar surfaces
  assert("ATR range label", /ATR range/.test(stripped));
  assert("Bid / ask label", /Bid \/ ask/.test(stripped));
  // Symbol rendered with accentTeal
  assert("symbol rendered in accentTeal",
    /accentTeal[\s\S]{0,200}row\.symbol|row\.symbol[\s\S]{0,200}accentTeal/.test(stripped));
}

// =================================================================
// 7. Sidebar / strip / panels reference theme tokens
// =================================================================
group("panels reference theme tokens (no ad-hoc Tailwind dark classes for surfaces)");
{
  const files = [
    "src/components/discovery/cockpit/CapitalCommandBar.jsx",
    "src/components/discovery/cockpit/OperatorConsole.jsx",
    "src/components/discovery/cockpit/MarketIntelligencePanel.jsx",
    "src/components/discovery/cockpit/AlertsPanel.jsx",
    "src/components/discovery/cockpit/RankedCandidatesPanel.jsx",
    "src/components/discovery/cockpit/OpportunityDetailPanel.jsx",
  ];
  for (const path of files) {
    const src = read(path);
    assert(`${path}: imports COCKPIT_PALETTE`,
      /COCKPIT_PALETTE/.test(src));
    // The earlier zinc-950/60 etc. backgrounds should be gone on the
    // top-level panel surface. Spot-check that we no longer outline
    // panels with `bg-zinc-900/40` (the old default) — at least one
    // explicit theme reference must replace it.
    const stripped = stripComments(src);
    const hasThemeBackground = /background:\s*COCKPIT_PALETTE/.test(stripped);
    assert(`${path}: top-level surface uses theme palette background`,
      hasThemeBackground);
  }
}

// =================================================================
// 8. Privacy / safety regressions still hold
// =================================================================
group("safety regressions — still no engine internals in cockpit");
{
  const banned = ["scoreBreakdown", "weights", "probabilityInternals",
                  "monteCarlo", "mcPaths", "ivPercentileRaw", "_engineDebug"];
  const cockpitFiles = [
    "src/components/discovery/LethalBoardCockpit.jsx",
    "src/components/discovery/cockpit/CapitalCommandBar.jsx",
    "src/components/discovery/cockpit/OperatorConsole.jsx",
    "src/components/discovery/cockpit/TopPicksGrid.jsx",
    "src/components/discovery/cockpit/OpportunityCard.jsx",
    "src/components/discovery/cockpit/RankedCandidatesPanel.jsx",
    "src/components/discovery/cockpit/OpportunityDetailPanel.jsx",
    "src/components/discovery/cockpit/MarketIntelligencePanel.jsx",
    "src/components/discovery/cockpit/AlertsPanel.jsx",
    "src/components/discovery/cockpit/CapitalSettingsModal.jsx",
    "src/components/discovery/cockpit/HideBalancesToggle.jsx",
    "src/components/discovery/cockpit/cockpitTheme.js",
  ];
  for (const path of cockpitFiles) {
    const stripped = stripComments(read(path));
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
console.log(`  Phase 4.7.3: ${passed} passed, ${failed} failed (total ${passed + failed})`);
if (failed > 0) {
  console.log("\n  Failures:");
  for (const line of failureLines) console.log("    ✗ " + line);
  process.exit(1);
}
process.exit(0);
