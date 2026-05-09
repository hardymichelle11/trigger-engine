#!/usr/bin/env node
// =====================================================
// Ad Hoc Credit View — options-chain wiring tests
// Run: npm run test:ad-hoc-options
//
// Acceptance gates per spec:
//   1. options provider returns normalized contracts.
//   2. CV limited mode remains when provider returns empty chain.
//   3. CV limited mode remains when provider fails.
//   4. Ad hoc CV runs when contracts are available.
//   5. Put contracts are filtered/preferred (calls ignored).
//   6. Spread quality is classified correctly.
//   7. Candidate strike zone prefers strikes at/below TE support.
//   8. Missing Greeks do not break CV.
//   9. Simulation does not persist to Dynamic Basket by default.
//  10. Static catalog behavior remains unchanged.
//  11. UI displays Options Available / Credit Limited badge correctly
//      (verified via the result.creditViewBadge / cv.badge fields).
// =====================================================

import {
  setUniverseBackend,
  resetUniverseBackend,
  clearDynamicUniverse,
  listDynamicTickers,
  listScannerEligible,
  listBySource,
} from "../src/lib/universe/dynamicUniverseStore.js";
import { TICKER_SOURCE_TYPES } from "../src/lib/universe/tickerUniverseTypes.js";
import { simulateAdHoc } from "../src/lib/universe/adHocSimulationService.js";
import { resolveTickerUniverse } from "../src/lib/universe/resolveTickerUniverse.js";
import { isInScanUniverse, getWatchlistEntry } from "../src/optionsWatchlist.js";
import {
  classifyContractSpread,
  spreadGradeFromClass,
  pickCandidatePut,
  normalizeContract,
} from "../src/lib/marketData/optionsChainProvider.js";

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
  setUniverseBackend(makeMemoryBackend());
  clearDynamicUniverse();
}

// Build a chain of fake put contracts with clear strike spacing so
// candidate selection is deterministic.
function fakePutChain({ underlying = 100, strikes = [110, 105, 100, 95, 90, 85], dte = 21, withGreeks = true } = {}) {
  const today = new Date();
  const exp = new Date(today.getTime() + dte * 86_400_000);
  const expIso = exp.toISOString().slice(0, 10);
  return strikes.map((k, i) => ({
    symbol: `O:TEST${expIso}P${k}`,
    underlyingSymbol: "TEST",
    expiration: expIso,
    strike: k,
    type: "put",
    bid: Math.max(0.05, 0.50 + (underlying - k) * 0.04 - i * 0.02),
    ask: Math.max(0.10, 0.55 + (underlying - k) * 0.04 - i * 0.02 + 0.05),
    mid: null,                                                   // service computes
    last: 0.40,
    volume: 1000,
    openInterest: 5000,
    impliedVolatility: 0.35,
    delta: withGreeks ? -0.20 + (k - underlying) * 0.01 : null,
    gamma: withGreeks ? 0.02 : null,
    theta: withGreeks ? -0.05 : null,
    vega: withGreeks ? 0.10 : null,
    inTheMoney: k > underlying,
  })).map((c) => ({ ...c, mid: (c.bid + c.ask) / 2 }));
}

const MARKET_QUOTE = { TEST: { symbol: "TEST", price: 100, previousClose: 99, percentChange: 1.01 } };
function fakeBars({ start = 100, count = 30, drift = 0.0, low = 92 } = {}) {
  const out = [];
  let prev = start;
  for (let i = 0; i < count; i++) {
    const open = prev;
    const close = prev + drift + Math.sin(i) * 0.2;
    out.push({
      ts: Date.now() - (count - i) * 86_400_000,
      open, high: Math.max(open, close) + 0.5,
      low:  i === count - 5 ? low : Math.min(open, close) - 0.5,
      close, volume: 1_000_000,
    });
    prev = close;
  }
  return out;
}

// ============================================================
group("[1] provider normalization (normalizeContract shape)");
// ============================================================

const rawSnap = {
  details: {
    ticker: "O:AAPL241115P00150000",
    underlying_ticker: "AAPL",
    expiration_date: "2024-11-15",
    strike_price: 150,
    contract_type: "put",
  },
  last_quote: { bid: 1.20, ask: 1.30 },
  last_trade: { price: 1.25 },
  greeks: { delta: -0.30, gamma: 0.02, theta: -0.04, vega: 0.10 },
  implied_volatility: 0.27,
  open_interest: 1500,
  day: { volume: 230 },
  in_the_money: false,
};
const c = normalizeContract(rawSnap);
assert("normalized contract returned", !!c);
assert("symbol mapped",                 c.symbol === "O:AAPL241115P00150000");
assert("underlyingSymbol mapped",       c.underlyingSymbol === "AAPL");
assert("expiration mapped",             c.expiration === "2024-11-15");
assert("strike mapped (150)",           c.strike === 150);
assert("type mapped (put)",             c.type === "put");
assert("bid/ask mapped",                c.bid === 1.20 && c.ask === 1.30);
assert("mid computed (1.25)",           Math.abs(c.mid - 1.25) < 1e-9);
assert("greeks mapped",                 c.delta === -0.30 && c.gamma === 0.02);
assert("openInterest mapped",           c.openInterest === 1500);
assert("inTheMoney flag mapped",        c.inTheMoney === false);

// Call contract normalizes too.
const callRaw = { ...rawSnap, details: { ...rawSnap.details, contract_type: "call", ticker: "O:AAPL241115C00150000" } };
const callC = normalizeContract(callRaw);
assert("call contract normalizes",      callC && callC.type === "call");

// Reject malformed input.
assert("missing details → null",        normalizeContract({}) === null);
assert("unknown contract_type → null",  normalizeContract({ details: { contract_type: "weird" } }) === null);

// ============================================================
group("[2] CV stays limited when chain provider returns empty");
// ============================================================
reset();

const limitedEmpty = await simulateAdHoc("TEST", {
  persist: false,
  providers: {
    fetchQuotes: async () => MARKET_QUOTE,
    fetchBars:   async () => fakeBars(),
    fetchOptionsChain: async () => ({
      underlyingSymbol: "TEST",
      contracts: [],
      provider: "polygon",
      asOf: Date.now(),
      warnings: ["empty_chain"],
    }),
  },
});
assert("creditView is in limited mode (empty chain)", limitedEmpty.creditView.limited === true);
assert("creditView reason mentions options chain unavailable",
  /options chain data unavailable/i.test(limitedEmpty.creditView.reason || ""));
assert("creditView.badge = 'Credit limited'",         limitedEmpty.creditView.badge === "Credit limited");
assert("dataAvailability.optionsChain = false",       limitedEmpty.dataAvailability.optionsChain === false);
assert("creditViewBadge = 'Credit limited'",          limitedEmpty.creditViewBadge === "Credit limited");
assert("analysisMode stays AD_HOC_TE_SIMULATION",
  limitedEmpty.analysisMode === "ad_hoc_te_simulation");

// ============================================================
group("[3] CV stays limited when chain provider fails (returns null)");
// ============================================================
reset();

const limitedNull = await simulateAdHoc("TEST", {
  persist: false,
  providers: {
    fetchQuotes: async () => MARKET_QUOTE,
    fetchBars:   async () => fakeBars(),
    fetchOptionsChain: async () => { throw new Error("network"); },
  },
});
assert("provider throw is swallowed",                 !!limitedNull && limitedNull.symbol === "TEST");
assert("creditView limited after throw",              limitedNull.creditView.limited === true);
assert("creditViewBadge = 'Credit limited'",          limitedNull.creditViewBadge === "Credit limited");

// ============================================================
group("[4] Ad hoc CV runs when contracts are available");
// ============================================================
reset();

const chain = fakePutChain({ underlying: 100, strikes: [110, 105, 100, 95, 90, 85] });
const fullSim = await simulateAdHoc("TEST", {
  persist: false,
  providers: {
    fetchQuotes: async () => MARKET_QUOTE,
    fetchBars:   async () => fakeBars({ low: 92 }),
    fetchOptionsChain: async () => ({
      underlyingSymbol: "TEST", contracts: chain,
      provider: "polygon", asOf: Date.now(), warnings: [],
    }),
  },
});

assert("creditView is NOT limited",                   fullSim.creditView.limited === false);
assert("creditView label = 'Ad Hoc Credit Simulation'",
  fullSim.creditView.label === "Ad Hoc Credit Simulation");
assert("creditView badge = 'Options available'",      fullSim.creditView.badge === "Options available");
assert("creditViewBadge top-level = 'Options available'",
  fullSim.creditViewBadge === "Options available");
assert("analysisMode = AD_HOC_CREDIT_SIMULATION",
  fullSim.analysisMode === "ad_hoc_credit_simulation");
assert("creditView.candidate present",                !!fullSim.creditView.candidate);
assert("candidate.strike is finite",
  Number.isFinite(fullSim.creditView.candidate.strike));

// Narrative output produced by buildCreditViewNarrative.
const cv = fullSim.creditView.result;
assert("narrative.recommendation present",            !!cv?.recommendation?.label);
assert("narrative.confirmation.sentence present",
  typeof cv?.confirmation?.sentence === "string" && cv.confirmation.sentence.length > 0);
assert("narrative.invalidation.sentence present",
  typeof cv?.invalidation?.sentence === "string" && cv.invalidation.sentence.length > 0);
assert("narrative.bestStrikeZone.label present",      typeof cv?.bestStrikeZone?.label === "string");
assert("narrative.minimumPremium.label present",      typeof cv?.minimumPremium?.label === "string");
assert("narrative.managementNote present",            typeof cv?.managementNote === "string");
assert("narrative.riskNarrative present",             typeof cv?.riskNarrative === "string");

// No raw scores / weights leak into the result.
const blob = JSON.stringify(fullSim.creditView);
assert("no raw 'score' field leaks",                  !/"score"\s*:\s*-?\d/.test(blob));
assert("no 'weight' token leaks",                     !/"weight"|"w_/.test(blob));

// ============================================================
group("[5] Put contracts filtered / preferred");
// ============================================================
reset();

const mixedChain = [
  ...chain,
  // Add a couple of calls that should be ignored.
  { ...chain[0], symbol: "C1", strike: 110, type: "call" },
  { ...chain[1], symbol: "C2", strike: 105, type: "call" },
];
const candidate = pickCandidatePut(mixedChain, { underlyingPrice: 100, supportLevel: 95 });
assert("pickCandidatePut returns a put contract",     candidate && candidate.type === "put");
assert("pickCandidatePut ignores calls",              candidate.type !== "call");

// ============================================================
group("[6] Spread quality classification");
// ============================================================

assert("excellent: 5% of mid",  classifyContractSpread(1.00, 1.05, 1.025) === "excellent");
assert("acceptable: 12% of mid",classifyContractSpread(0.94, 1.06, 1.00)  === "acceptable");
assert("wide: 30% of mid",      classifyContractSpread(0.85, 1.15, 1.00)  === "wide");
assert("unusable: no bid",      classifyContractSpread(null, 1.00, 1.00)  === "unusable");
assert("unusable: no ask",      classifyContractSpread(1.00, null, 1.00)  === "unusable");
assert("unusable: spread > 50%",classifyContractSpread(0.20, 1.80, 1.00)  === "unusable");
assert("grade map: excellent → A+",  spreadGradeFromClass("excellent") === "A+");
assert("grade map: acceptable → B",  spreadGradeFromClass("acceptable") === "B");
assert("grade map: wide → C",        spreadGradeFromClass("wide") === "C");
assert("grade map: unusable → F",    spreadGradeFromClass("unusable") === "F");

// ============================================================
group("[7] Candidate strike zone prefers strikes at/below support");
// ============================================================

const supportPick = pickCandidatePut(chain, { underlyingPrice: 100, supportLevel: 95 });
assert("candidate strike ≤ support level",       supportPick.strike <= 95);
assert("candidate strike within 10% below price", supportPick.strike >= 90);

// No support → fall back to 3-10% below price.
const noSupportPick = pickCandidatePut(chain, { underlyingPrice: 100, supportLevel: null });
assert("no support: candidate strike ≤ 97 (3% below)", noSupportPick.strike <= 97);
assert("no support: candidate strike ≥ 90 (10% below)", noSupportPick.strike >= 90);

// ============================================================
group("[8] Missing Greeks do not break CV");
// ============================================================
reset();

const noGreekChain = fakePutChain({ withGreeks: false });
const noGreekSim = await simulateAdHoc("TEST", {
  persist: false,
  providers: {
    fetchQuotes: async () => MARKET_QUOTE,
    fetchBars:   async () => fakeBars({ low: 92 }),
    fetchOptionsChain: async () => ({
      underlyingSymbol: "TEST", contracts: noGreekChain,
      provider: "polygon", asOf: Date.now(), warnings: [],
    }),
  },
});
assert("missing Greeks: creditView still NOT limited", noGreekSim.creditView.limited === false);
assert("missing Greeks: candidate.delta is null",
  noGreekSim.creditView.candidate.delta === null);
assert("missing Greeks: narrative still produced",
  typeof noGreekSim.creditView.result?.riskNarrative === "string" &&
  noGreekSim.creditView.result.riskNarrative.length > 0);

// ============================================================
group("[9] Simulation does not persist to Dynamic Basket");
// ============================================================
reset();

assert("dynamic store empty before sim",     Object.keys(listDynamicTickers()).length === 0);
await simulateAdHoc("TEST", {
  // Default persist: false.
  providers: {
    fetchQuotes: async () => MARKET_QUOTE,
    fetchBars:   async () => fakeBars(),
    fetchOptionsChain: async () => ({
      underlyingSymbol: "TEST", contracts: chain,
      provider: "polygon", asOf: Date.now(), warnings: [],
    }),
  },
});
assert("dynamic store still empty after sim",  Object.keys(listDynamicTickers()).length === 0);
assert("listScannerEligible empty",            listScannerEligible().length === 0);
assert("no DYNAMIC_BASKET entries",
  listBySource(TICKER_SOURCE_TYPES.DYNAMIC_BASKET).length === 0);

// ============================================================
group("[10] Static catalog behavior unchanged");
// ============================================================
reset();

const aaplBefore = getWatchlistEntry("AAPL");
const inUniverseBefore = isInScanUniverse("AAPL");

await simulateAdHoc("TEST", {
  persist: false,
  providers: {
    fetchQuotes: async () => MARKET_QUOTE,
    fetchBars:   async () => fakeBars(),
    fetchOptionsChain: async () => ({
      underlyingSymbol: "TEST", contracts: chain,
      provider: "polygon", asOf: Date.now(), warnings: [],
    }),
  },
});

const aaplAfter = getWatchlistEntry("AAPL");
assert("AAPL catalog metadata unchanged",
  aaplBefore === aaplAfter || JSON.stringify(aaplBefore) === JSON.stringify(aaplAfter));
assert("AAPL still in scan universe",          isInScanUniverse("AAPL") === inUniverseBefore);
assert("AAPL still resolves as STATIC_CATALOG",
  resolveTickerUniverse("AAPL").sourceType === TICKER_SOURCE_TYPES.STATIC_CATALOG);
assert("TEST stays uncataloged",
  resolveTickerUniverse("TEST").catalogStatus === "uncataloged");

// ============================================================
group("[11] UI badge fields surface correctly");
// ============================================================

// "Options available" path.
assert("[full sim] result.creditViewBadge = Options available",
  fullSim.creditViewBadge === "Options available");
assert("[full sim] cv.badge = Options available",
  fullSim.creditView.badge === "Options available");
// "Credit limited" path.
assert("[empty chain] result.creditViewBadge = Credit limited",
  limitedEmpty.creditViewBadge === "Credit limited");
assert("[empty chain] cv.badge = Credit limited",
  limitedEmpty.creditView.badge === "Credit limited");
assert("[chain throw] result.creditViewBadge = Credit limited",
  limitedNull.creditViewBadge === "Credit limited");

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetUniverseBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
