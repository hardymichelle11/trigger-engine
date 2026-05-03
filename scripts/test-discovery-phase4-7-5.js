#!/usr/bin/env node
// =====================================================
// Capital-Aware Discovery Scanner — Phase 4.7.5 tests
// Run: npm run test:discovery-phase4-7-5
// =====================================================
//
// Verifies production functionality completion:
//   - tradingViewSymbolResolver: provider-aware, defensive,
//     never throws, supports operator override / candidate
//     exchange / SYMBOL_META fallback / NASDAQ default
//   - TradingViewMiniChart: real TV embed (not placeholder),
//     "chart unverified" badge when verification fails,
//     SVG sparkline fallback, "Chart unavailable" message
//   - OpportunityCard now renders the real chart, exposes
//     current price, phase badge, contract chips, and the
//     "Option chain not verified" line when chain is missing
//   - OpportunityDetailPanel exposes Probability · IV +
//     What upgrades / What invalidates / Execution plan
//   - Operator Console buttons all wired to handlers
// =====================================================

import { readFileSync, existsSync } from "node:fs";
import { transformWithOxc } from "vite";

import {
  resolveTradingViewSymbol,
  SYMBOL_META,
} from "../src/lib/lethal/tradingViewSymbolResolver.js";

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

console.log("\n  Capital-Aware Discovery Scanner — Phase 4.7.5");
console.log("  ═════════════════════════════════════════════");

// =================================================================
// 1. Files exist + JSX validity
// =================================================================
group("files exist + JSX validity");

const FILES = {
  resolver: "src/lib/lethal/tradingViewSymbolResolver.js",
  chart:    "src/components/lethal/TradingViewMiniChart.jsx",
  card:     "src/components/discovery/cockpit/OpportunityCard.jsx",
  detail:   "src/components/discovery/cockpit/OpportunityDetailPanel.jsx",
  console:  "src/components/discovery/cockpit/OperatorConsole.jsx",
};
for (const [name, path] of Object.entries(FILES)) {
  assert(`${name} exists at ${path}`, existsSync(path));
}
for (const path of [FILES.chart, FILES.card, FILES.detail, FILES.console]) {
  try {
    await transformWithOxc(read(path), path, { loader: "jsx" });
    assert(`${path} JSX valid`, true);
  } catch (e) {
    assert(`${path} JSX valid`, false, e?.message || String(e));
  }
}

// =================================================================
// 2. tradingViewSymbolResolver — provider-aware
// =================================================================
group("tradingViewSymbolResolver — resolution order");
{
  // 1. Operator override
  const r1 = resolveTradingViewSymbol({ symbol: "WHATEVER", tradingViewSymbol: "AMEX:SPY" });
  assert("override: returns AMEX:SPY", r1.symbol === "AMEX:SPY");
  assert("override: verified=true", r1.verified === true);
  assert("override: source='override'", r1.source === "override");

  // 2. Candidate-supplied exchange
  const r2 = resolveTradingViewSymbol({ symbol: "abc", exchange: "nasdaq" });
  assert("candidate exchange: uppercased EXCHANGE:SYMBOL", r2.symbol === "NASDAQ:ABC");
  assert("candidate exchange: verified=true", r2.verified === true);
  assert("candidate exchange: source='candidate'", r2.source === "candidate");

  // 3. SYMBOL_META fallback
  const r3 = resolveTradingViewSymbol({ symbol: "NVDA" });
  assert("meta: NVDA → NASDAQ:NVDA", r3.symbol === "NASDAQ:NVDA");
  assert("meta: verified=true", r3.verified === true);
  assert("meta: source='meta'", r3.source === "meta");

  const r3b = resolveTradingViewSymbol({ symbol: "BE" });
  assert("meta: BE → NYSE:BE", r3b.symbol === "NYSE:BE");

  const r3c = resolveTradingViewSymbol({ symbol: "JEPI" });
  assert("meta: JEPI → AMEX:JEPI", r3c.symbol === "AMEX:JEPI");

  // Cboe-listed leveraged ETFs (Tradr 2X Long NBIS = NEBX). Default would
  // produce NASDAQ:NEBX (TV returns "Invalid symbol"); meta routes to CBOE.
  const r3d = resolveTradingViewSymbol({ symbol: "NEBX" });
  assert("meta: NEBX → CBOE:NEBX", r3d.symbol === "CBOE:NEBX");
  assert("meta: NEBX is verified", r3d.verified === true);

  // 4. Default — unverified
  const r4 = resolveTradingViewSymbol({ symbol: "ZZ_UNKNOWN" });
  assert("default: ZZ_UNKNOWN → NASDAQ:ZZ_UNKNOWN", r4.symbol === "NASDAQ:ZZ_UNKNOWN");
  assert("default: verified=false", r4.verified === false);
  assert("default: source='default'", r4.source === "default");

  // 5. Bare string convenience
  const r5 = resolveTradingViewSymbol("NVDA");
  assert("bare string: NVDA resolves through meta", r5.symbol === "NASDAQ:NVDA");

  // 6. Defensive against bad input
  assert("null returns null",      resolveTradingViewSymbol(null) === null);
  assert("undefined returns null", resolveTradingViewSymbol() === null);
  assert("empty string returns null", resolveTradingViewSymbol("") === null);
  assert("object without symbol returns null",
    resolveTradingViewSymbol({ exchange: "NASDAQ" }) === null);

  // 7. SYMBOL_META is the documented fallback table — small, not exhaustive
  for (const sym of ["NVDA", "SMCI", "CRWV", "NBIS", "BE", "BEPC",
                     "XLF", "XLE", "JEPI", "JEPQ"]) {
    assert(`SYMBOL_META covers ${sym}`, !!SYMBOL_META[sym]);
  }
}

// =================================================================
// 3. TradingViewMiniChart — real embed + fallbacks
// =================================================================
group("TradingViewMiniChart — embed + fallbacks");
{
  const src = read(FILES.chart);
  const stripped = stripComments(src);
  // Real embed mechanism (not a placeholder)
  assert("loads TV embed script from official CDN",
    /s3\.tradingview\.com\/external-embedding\/embed-widget-mini-symbol-overview\.js/.test(stripped));
  assert("imports resolveTradingViewSymbol",
    /resolveTradingViewSymbol/.test(stripped));
  assert("creates a script element dynamically",
    /document\.createElement\(\s*["']script["']\s*\)/.test(stripped));
  assert("supports tradingViewSymbol prop", /tradingViewSymbol/.test(stripped));
  assert("supports exchange prop",          /exchange/.test(stripped));
  assert("supports verified prop",          /\bverified\b/.test(stripped));
  assert("supports fallbackCandles prop",   /fallbackCandles/.test(stripped));
  // Phase 4.7.6 removed the "chart unverified" badge AND the
  // "Chart unavailable" placeholder text per spec ("no placeholder
  // text EVER"). The chart degrades silently to either the sparkline
  // (when candles are supplied) or a transparent block.
  assert("renders SparklineFallback", /SparklineFallback/.test(stripped));
  assert("renders ChartUnavailable",  /ChartUnavailable/.test(stripped));
  // Doesn't throw + has timeout for failure detection
  assert("has a load-failure timeout",
    /setTimeout/.test(stripped));
  assert("widget tracks load failure state",
    /loadFailed/.test(stripped));
}

// =================================================================
// 4. OpportunityCard — real chart + expanded content
// =================================================================
group("OpportunityCard — chart + content");
{
  const src = read(FILES.card);
  const stripped = stripComments(src);
  assert("imports TradingViewMiniChart", /TradingViewMiniChart/.test(src));
  assert("renders <TradingViewMiniChart ...>", /<TradingViewMiniChart\b/.test(stripped));
  // No more placeholder usage in OpportunityCard
  assert("does NOT import TradingViewChartPlaceholder anymore",
    !/import\s+TradingViewChartPlaceholder/.test(src));
  // Threads candidate provider hints
  for (const prop of ["exchange", "tradingViewSymbol", "verified"]) {
    assert(`passes ${prop} to chart`,
      new RegExp(`${prop}=\\{candidate\\?\\.${prop === "verified" ? "hasLiveChart" : prop}\\}`).test(stripped)
        || new RegExp(`${prop}=\\{[^}]*${prop}`).test(stripped));
  }
  // Phase 4.7.6 contract grid: Strike + Premium (large), DTE + Breakeven
  // (small). "Break-even" lost its hyphen → "Breakeven". PhaseBadge
  // retired entirely (per spec "remove extra tags / repeated category").
  for (const label of ["Strike", "DTE", "Premium", "Breakeven"]) {
    assert(`card surfaces "${label}"`,
      new RegExp(`label=["']${label}["']`).test(stripped));
  }
  // "Option chain not verified" honest fallback
  assert("'Option chain not verified' honest fallback line",
    /Option chain not verified/.test(stripped));
  // Current price visible (formatted from currentPrice)
  assert("card surfaces current price",
    /currentPrice/.test(stripped));
}

// =================================================================
// 5. OpportunityDetailPanel — new sections
// =================================================================
group("OpportunityDetailPanel — new sections");
{
  const src = read(FILES.detail);
  const stripped = stripComments(src);
  for (const section of [
    "Probability · IV",
    "What upgrades this",
    "What invalidates this",
    "Execution plan",
  ]) {
    assert(`section "${section}" present`,
      stripped.includes(section));
  }
  // Probability section surfaces the documented fields
  for (const label of ["Probability above strike", "Touch probability",
                       "IV percentile", "Liquidity grade"]) {
    assert(`probability section surfaces "${label}"`,
      stripped.includes(label));
  }
  // Execution plan renders an ordered list
  assert("execution plan iterates steps", /steps\.map/.test(stripped));
}

// =================================================================
// 6. Operator Console buttons all have handlers
// =================================================================
group("Operator Console buttons wired");
{
  const src = read(FILES.console);
  const stripped = stripComments(src);
  for (const handler of [
    "onRunSamplePreview",
    "onRunLivePreview",
    "onRunLiveCommit",
    "onBack",
    "onEditCapital",
    "onToggleHideBalances",
  ]) {
    assert(`OperatorConsole threads ${handler}`,
      new RegExp(`\\b${handler}\\b`).test(stripped));
  }
  // Buttons actually use onClick (not just title)
  const onClickCount = (stripped.match(/onClick=/g) || []).length;
  assert(`OperatorConsole uses onClick (>= 5 times)`,
    onClickCount >= 5, `got ${onClickCount}`);
}

// =================================================================
// 7. Privacy / safety regressions still hold
// =================================================================
group("safety — still no engine internals in cockpit UI");
{
  const banned = ["scoreBreakdown", "weights", "probabilityInternals",
                  "monteCarlo", "mcPaths", "ivPercentileRaw", "_engineDebug"];
  const cockpitFiles = [
    FILES.card, FILES.detail, FILES.console,
    FILES.chart, FILES.resolver,
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
console.log(`  Phase 4.7.5: ${passed} passed, ${failed} failed (total ${passed + failed})`);
if (failed > 0) {
  console.log("\n  Failures:");
  for (const line of failureLines) console.log("    ✗ " + line);
  process.exit(1);
}
process.exit(0);
