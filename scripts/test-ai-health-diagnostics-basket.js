#!/usr/bin/env node
// =====================================================
// AI Health / Diagnostics — basket + agent + scanner + UI tests
// Run: npm run test:ai-health-diagnostics
//
// Acceptance gates per spec:
//   1.  Basket includes TEM, GH, NTRA, RHHBY, ABT, TMO, NVDA
//   2.  getAIHealthDiagnosticsProfile("TEM") returns
//       AI_OPERATING_SYSTEM (the "AI Health Bridge" category)
//   3.  Unknown symbols return null safely
//   4.  Insight output never exposes raw _rank / scores / weights
//   5.  News alignment never overrides risk_elevated posture
//   6.  UI-safe output includes creditViewInsight
//   7.  Ranking returns top premium / accumulation / sector confirmation
//   8.  allowedActions are constrained based on posture
//   9.  Tier-aware seeding lands Tier 1 active, Tier 2 watch, Tier 3 excluded
//  10.  Registry baselineLeaders updated to Tier 1 pure plays
//  11.  Specialty panel renders empty-state + seeded state without throwing
//  12.  No raw scores / weights / coefficients in rendered HTML
//  13.  Specialty panel respects operator universe (never auto-promotes)
//  14.  Scanner verdicts never include AVOID_OR_WAIT for fortresses with
//       at least one constructive read
//  15.  Production build clean (verified separately by npm run build)
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  AI_HEALTH_DIAGNOSTICS_BASKET_ID,
  AI_HEALTH_DIAGNOSTICS_CATEGORIES,
  AI_HEALTH_DIAGNOSTICS_SYMBOLS,
  TIER,
  OPTION_PROFILE,
  getAIHealthDiagnosticsProfile,
  isAIHealthDiagnosticsSymbol,
  listProfilesByTier,
  categoryLabel,
} from "../src/lib/portfolioCio/aiHealthDiagnosticsProfiles.js";
import {
  evaluateAIHealthDiagnosticsCandidate,
  rankAIHealthDiagnosticsBasket,
  VERDICT,
} from "../src/lib/portfolioCio/aiHealthDiagnosticsScanner.js";
import {
  buildAIHealthDiagnosticsInsight,
  POSTURE,
} from "../src/lib/portfolioCio/aiHealthDiagnosticsAgent.js";
import {
  ACTION_TYPE,
} from "../src/lib/portfolioCio/basketActionQueue.js";
import {
  STANCE,
} from "../src/lib/portfolioCio/managerAssessmentTypes.js";
import {
  LEADERSHIP_STATUS,
} from "../src/lib/portfolioCio/basketAgentTypes.js";
import {
  setBasketBackend,
  resetBasketBackend,
  clearAllBasketUniverses,
  seedBasketTiers,
  getBasketUniverse,
} from "../src/lib/portfolioCio/basketUniverseManager.js";
import {
  getBasketAgent,
} from "../src/lib/portfolioCio/basketAgentRegistry.js";

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
function resetUniverse() {
  setBasketBackend(makeMemoryBackend());
  clearAllBasketUniverses();
}

// ============================================================
group("[1] basket includes TEM, GH, NTRA, RHHBY, ABT, TMO, NVDA");
// ============================================================

const required = ["TEM", "GH", "NTRA", "RHHBY", "ABT", "TMO", "NVDA"];
for (const sym of required) {
  assert(`[1] basket has ${sym}`, AI_HEALTH_DIAGNOSTICS_SYMBOLS.includes(sym));
}
assert("[1] basketId constant matches registry id",
  AI_HEALTH_DIAGNOSTICS_BASKET_ID === "ai_health_diagnostics");

// ============================================================
group("[2] TEM → AI Operating System (Bridge)");
// ============================================================

const temProfile = getAIHealthDiagnosticsProfile("TEM");
assert("[2] TEM profile exists", !!temProfile);
assert("[2] TEM category = AI_OPERATING_SYSTEM",
  temProfile && temProfile.category === AI_HEALTH_DIAGNOSTICS_CATEGORIES.AI_OPERATING_SYSTEM);
assert("[2] TEM tier = Tier 1 pure play",
  temProfile && temProfile.tier === TIER.TIER_1_PURE_PLAY);
assert("[2] categoryLabel('AI_OPERATING_SYSTEM') = AI Health Bridge",
  /AI Health Bridge/.test(categoryLabel(temProfile.category)));
// Symbol normalizer should accept lowercase / spacey input.
assert("[2] getAIHealthDiagnosticsProfile('  tem ') returns same profile",
  getAIHealthDiagnosticsProfile("  tem ") === temProfile);

// ============================================================
group("[3] unknown symbols return null safely");
// ============================================================

assert("[3] unknown ZZZZZ → null",            getAIHealthDiagnosticsProfile("ZZZZZ") === null);
assert("[3] empty string → null",             getAIHealthDiagnosticsProfile("") === null);
assert("[3] non-string null → null",          getAIHealthDiagnosticsProfile(null) === null);
assert("[3] non-string number → null",        getAIHealthDiagnosticsProfile({}) === null);
assert("[3] isAIHealthDiagnosticsSymbol('ZZZZZ') = false",
  isAIHealthDiagnosticsSymbol("ZZZZZ") === false);
assert("[3] isAIHealthDiagnosticsSymbol('TEM') = true",
  isAIHealthDiagnosticsSymbol("TEM") === true);
assert("[3] evaluate unknown symbol returns null",
  evaluateAIHealthDiagnosticsCandidate({ symbol: "ZZZZZ" }) === null);
assert("[3] insight unknown symbol returns null",
  buildAIHealthDiagnosticsInsight({ symbol: "ZZZZZ" }) === null);

// ============================================================
group("[4] insight output never exposes raw _rank / scores / weights");
// ============================================================

const constructiveMa = {
  trigger_engine: { stance: STANCE.CONSTRUCTIVE },
  credit_view:    { stance: STANCE.CONSTRUCTIVE },
  market_intel:   { stance: STANCE.CONSTRUCTIVE },
};
const insight = buildAIHealthDiagnosticsInsight({
  symbol: "TEM",
  managerAssessment: constructiveMa,
  leadershipClass: { status: LEADERSHIP_STATUS.LEADER, read: "Leadership confirmed across managers." },
});
assert("[4] insight has no _rank field",            !("_rank" in (insight || {})));
const insightJson = JSON.stringify(insight || {});
assert("[4] insight JSON has no _rank token",       !/"_rank"/.test(insightJson));
assert("[4] insight JSON has no \"score\":N",       !/"score"\s*:\s*-?\d/.test(insightJson));
assert("[4] insight JSON has no \"weight\":N",      !/"weight"\s*:/.test(insightJson));
assert("[4] insight JSON has no coefficient token", !/coefficient/i.test(insightJson));
assert("[4] insight JSON has no \"w_\" prefix",     !/"w_/.test(insightJson));

// Ranked slate also strips _rank.
const ranked = rankAIHealthDiagnosticsBasket(["TEM", "GH"], {
  managerAssessmentsBySymbol: { TEM: constructiveMa, GH: constructiveMa },
});
const rankedJson = JSON.stringify(ranked);
assert("[4] ranked slate has no _rank token",       !/"_rank"/.test(rankedJson));

// ============================================================
group("[5] news alignment never overrides risk_elevated posture");
// ============================================================

const cautiousMa = {
  trigger_engine: { stance: STANCE.CAUTIOUS },
  credit_view:    { stance: STANCE.CAUTIOUS },
  market_intel:   { stance: STANCE.NEUTRAL },
  risk_manager:   { stance: STANCE.BEARISH },
};
const insightRisky = buildAIHealthDiagnosticsInsight({
  symbol: "TEM",
  managerAssessment: cautiousMa,
  newsAlignment: "supports_thesis",
  leadershipClass: { status: LEADERSHIP_STATUS.FADING_LEADER, read: "Leadership fading across managers." },
});
assert("[5] supportive news does NOT lift posture out of risk_elevated",
  insightRisky && insightRisky.posture === POSTURE.RISK_ELEVATED);
assert("[5] verdict is AVOID_OR_WAIT regardless of news",
  insightRisky && insightRisky.verdict === VERDICT.AVOID_OR_WAIT);
assert("[5] allowedActions does NOT include PROMOTE_TO_SCANNER_REVIEW",
  insightRisky && !insightRisky.allowedActions.includes(ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW));

// ============================================================
group("[6] UI-safe output includes creditViewInsight");
// ============================================================

assert("[6] insight has creditViewInsight string",
  insight && typeof insight.creditViewInsight === "string" && insight.creditViewInsight.length > 0);
assert("[6] creditViewInsight mentions ownership layer",
  insight && /multimodal/i.test(insight.creditViewInsight));
assert("[6] insight has suggestedAction string",
  insight && typeof insight.suggestedAction === "string" && insight.suggestedAction.length > 0);
assert("[6] insight has keyLevels string",
  insight && typeof insight.keyLevels === "string" && insight.keyLevels.length > 0);
assert("[6] insight has assignmentComfort string",
  insight && typeof insight.assignmentComfort === "string" && insight.assignmentComfort.length > 0);
assert("[6] insight has risksToVerify array",
  insight && Array.isArray(insight.risksToVerify) && insight.risksToVerify.length > 0);
assert("[6] insight has thesisSummary",
  insight && typeof insight.thesisSummary === "string" && insight.thesisSummary.length > 0);
assert("[6] insight has categoryLabel that's UI-safe",
  insight && /AI Health Bridge|Bridge|Pure|Diagnostics/i.test(insight.categoryLabel));

// ============================================================
group("[7] ranking returns top premium / accumulation / sector confirmation");
// ============================================================

const slate = rankAIHealthDiagnosticsBasket(
  ["TEM", "GH", "NTRA", "RHHBY", "ABT", "TMO", "NVDA"],
  {
    managerAssessmentsBySymbol: {
      TEM:   constructiveMa,
      GH:    constructiveMa,
      NTRA:  constructiveMa,
      RHHBY: { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
               credit_view:    { stance: STANCE.NEUTRAL },
               market_intel:   { stance: STANCE.NEUTRAL } },
      ABT:   { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
               credit_view:    { stance: STANCE.CONSTRUCTIVE },
               market_intel:   { stance: STANCE.NEUTRAL } },
      TMO:   {},
      NVDA:  { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
               credit_view:    { stance: STANCE.CONSTRUCTIVE },
               market_intel:   { stance: STANCE.NEUTRAL } },
    },
    leadershipClassBySymbol: {
      TEM:  { status: LEADERSHIP_STATUS.LEADER, read: "Leadership confirmed across managers." },
      GH:   { status: LEADERSHIP_STATUS.LEADER, read: "Leadership confirmed across managers." },
      NTRA: { status: LEADERSHIP_STATUS.EMERGING_LEADER, read: "Leadership improving." },
    },
  },
);
assert("[7] ranking returns evaluated array",
  Array.isArray(slate.evaluated) && slate.evaluated.length === 7);
assert("[7] bestPremium is a Tier 1 pure-play",
  slate.bestPremium && slate.bestPremium.tier === TIER.TIER_1_PURE_PLAY);
assert("[7] bestPremium uses a premium-friendly option profile",
  slate.bestPremium && (
    slate.bestPremium.optionProfile === OPTION_PROFILE.PREMIUM_CANDIDATE ||
    slate.bestPremium.optionProfile === OPTION_PROFILE.SELECTIVE_PREMIUM_CANDIDATE
  ));
assert("[7] bestAccumulation is a Tier 2 fortress",
  slate.bestAccumulation && slate.bestAccumulation.tier === TIER.TIER_2_INCUMBENT_FORTRESS);
assert("[7] bestSectorConfirmation is a Tier 3 adjacency or leader",
  slate.bestSectorConfirmation && (
    slate.bestSectorConfirmation.tier === TIER.TIER_3_ADJACENCY ||
    slate.bestSectorConfirmation.leadershipStatus === LEADERSHIP_STATUS.LEADER ||
    slate.bestSectorConfirmation.leadershipStatus === LEADERSHIP_STATUS.EMERGING_LEADER
  ));

// ============================================================
group("[8] allowedActions are constrained based on posture");
// ============================================================

// Premium candidate insight — should allow promotion.
const premiumInsight = buildAIHealthDiagnosticsInsight({
  symbol: "TEM",
  managerAssessment: constructiveMa,
  leadershipClass: { status: LEADERSHIP_STATUS.LEADER, read: "Leadership confirmed." },
});
assert("[8] premium candidate allows PROMOTE_TO_SCANNER_REVIEW",
  premiumInsight && premiumInsight.allowedActions.includes(ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW));

// Fortress with constructive reads → long-hold anchor — should NOT
// allow promote-to-scanner.
const fortressInsight = buildAIHealthDiagnosticsInsight({
  symbol: "RHHBY",
  managerAssessment: {
    trigger_engine: { stance: STANCE.CONSTRUCTIVE },
    credit_view:    { stance: STANCE.CONSTRUCTIVE },
    market_intel:   { stance: STANCE.NEUTRAL },
  },
  leadershipClass: { status: LEADERSHIP_STATUS.LEADER, read: "Sector anchor." },
});
assert("[8] fortress posture = LONG_HOLD_ANCHOR",
  fortressInsight && fortressInsight.posture === POSTURE.LONG_HOLD_ANCHOR);
assert("[8] fortress does NOT allow PROMOTE_TO_SCANNER_REVIEW",
  fortressInsight && !fortressInsight.allowedActions.includes(ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW));

// Risk-elevated insight — should allow watchlist / exclude / monitor.
assert("[8] risk-elevated allows MOVE_TO_WATCHLIST_REVIEW",
  insightRisky && insightRisky.allowedActions.includes(ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW));
assert("[8] risk-elevated allows EXCLUDE_REVIEW",
  insightRisky && insightRisky.allowedActions.includes(ACTION_TYPE.EXCLUDE_REVIEW));
assert("[8] risk-elevated allows MONITOR_ONLY",
  insightRisky && insightRisky.allowedActions.includes(ACTION_TYPE.MONITOR_ONLY));
assert("[8] risk-elevated does NOT allow PROMOTE_TO_SCANNER_REVIEW",
  insightRisky && !insightRisky.allowedActions.includes(ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW));

// ============================================================
group("[9] tier-aware seeding (Tier 1 active / Tier 2 watch / Tier 3 excluded)");
// ============================================================

resetUniverse();
const seeded = seedBasketTiers(AI_HEALTH_DIAGNOSTICS_BASKET_ID);
assert("[9] seedBasketTiers returns the universe record", !!seeded);
const u = getBasketUniverse(AI_HEALTH_DIAGNOSTICS_BASKET_ID);
const activeSyms   = (u?.activeUniverse || []).map((r) => r.symbol).sort();
const watchSyms    = (u?.watchlist || []).map((r) => r.symbol).sort();
const excludedSyms = (u?.excludedSymbols || []).map((r) => r.symbol).sort();
const tier1 = listProfilesByTier(TIER.TIER_1_PURE_PLAY).map((p) => p.symbol).sort();
const tier2 = listProfilesByTier(TIER.TIER_2_INCUMBENT_FORTRESS).map((p) => p.symbol).sort();
const tier3 = listProfilesByTier(TIER.TIER_3_ADJACENCY).map((p) => p.symbol).sort();
assert("[9] active universe = Tier 1 set",        JSON.stringify(activeSyms) === JSON.stringify(tier1));
assert("[9] watchlist = Tier 2 set",              JSON.stringify(watchSyms) === JSON.stringify(tier2));
assert("[9] excluded = Tier 3 set",               JSON.stringify(excludedSyms) === JSON.stringify(tier3));
assert("[9] tier 1 includes TEM and GH",          activeSyms.includes("TEM") && activeSyms.includes("GH"));
assert("[9] tier 2 includes RHHBY",               watchSyms.includes("RHHBY"));
assert("[9] tier 3 includes NVDA",                excludedSyms.includes("NVDA"));

// ============================================================
group("[10] registry baselineLeaders updated to Tier 1 pure plays");
// ============================================================

const profile = getBasketAgent(AI_HEALTH_DIAGNOSTICS_BASKET_ID);
assert("[10] basketName preserved",       profile && profile.basketName === "AI Health / Diagnostics");
assert("[10] baselineLeaders includes TEM, GH, NTRA",
  profile &&
  profile.baselineLeaders.includes("TEM") &&
  profile.baselineLeaders.includes("GH") &&
  profile.baselineLeaders.includes("NTRA"));
assert("[10] baselineLeaders no longer carries the legacy EXAS / RXRX / SDGR placeholders",
  profile &&
  !profile.baselineLeaders.includes("EXAS") &&
  !profile.baselineLeaders.includes("RXRX") &&
  !profile.baselineLeaders.includes("SDGR"));
assert("[10] tierActive / tierWatch / tierExcluded arrays present",
  profile &&
  Array.isArray(profile.tierActive) &&
  Array.isArray(profile.tierWatch) &&
  Array.isArray(profile.tierExcluded));

// ============================================================
group("[11] specialty panel renders empty + seeded state without throwing");
// ============================================================

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
const { default: AIHealthDiagnosticsPanel } =
  await import("../src/components/portfolioCio/AIHealthDiagnosticsPanel.jsx");

function renderSafe(props) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(AIHealthDiagnosticsPanel, props)) }; }
  catch (err) { return { ok: false, err }; }
}

resetUniverse();
const renderEmpty = renderSafe({});
assert("[11] empty-state panel renders without throwing", renderEmpty.ok, renderEmpty.err?.message);
assert("[11] empty-state HTML mentions 'Seed AI Health basket'",
  renderEmpty.ok && /Seed AI Health basket/.test(renderEmpty.html));

// Seed and re-render with manager evidence overrides to drive
// the top-3 cards.
seedBasketTiers(AI_HEALTH_DIAGNOSTICS_BASKET_ID);
const renderSeeded = renderSafe({
  managerAssessmentsBySymbol: {
    TEM: constructiveMa,
    GH:  constructiveMa,
    RHHBY: { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
             credit_view:    { stance: STANCE.CONSTRUCTIVE },
             market_intel:   { stance: STANCE.NEUTRAL } },
  },
});
assert("[11] seeded panel renders without throwing", renderSeeded.ok, renderSeeded.err?.message);
assert("[11] seeded HTML mentions 'BASKET HEAT MAP'",
  renderSeeded.ok && /BASKET HEAT MAP/.test(renderSeeded.html));
assert("[11] seeded HTML lists Tier 1 / 2 / 3 strips",
  renderSeeded.ok &&
  /TIER 1/.test(renderSeeded.html) &&
  /TIER 2/.test(renderSeeded.html) &&
  /TIER 3/.test(renderSeeded.html));
assert("[11] seeded HTML mentions 'Best Premium Candidate'",
  renderSeeded.ok && /Best Premium Candidate/.test(renderSeeded.html));
assert("[11] seeded HTML mentions sector thesis question",
  renderSeeded.ok && /Who owns the intelligence layer of medicine/i.test(renderSeeded.html));

// ============================================================
group("[12] no raw scores / weights / coefficients in rendered HTML");
// ============================================================

const html = renderSeeded.html || "";
assert("[12] no \"score\":N in HTML",         !/"score"\s*:\s*-?\d/.test(html));
assert("[12] no \"weight\":N in HTML",        !/"weight"\s*:/.test(html));
assert("[12] no coefficient token in HTML",   !/coefficient/i.test(html));
assert("[12] no \"w_\" prefix in HTML",       !/"w_/.test(html));
assert("[12] no '_rank' token in HTML",       !/_rank/.test(html));
// No buy/sell/capital-allocation phrasing.
assert("[12] no 'buy now' / 'sell now' phrasing",
  !/(\bbuy\s+now\b|\bsell\s+now\b)/i.test(html));
assert("[12] no 'go long' / 'go short' phrasing",
  !/(\bgo\s+long\b|\bgo\s+short\b)/i.test(html));

// ============================================================
group("[13] specialty panel respects operator universe");
// ============================================================

// Re-seed; verify the panel surfaces only what's in the universe.
// Excluded names (NVDA, MSFT, etc.) should NOT show up in heat map.
resetUniverse();
seedBasketTiers(AI_HEALTH_DIAGNOSTICS_BASKET_ID);
const renderRespect = renderSafe({});
assert("[13] heat map does NOT include excluded NVDA",
  renderRespect.ok && !/title="NVDA · /.test(renderRespect.html));
assert("[13] heat map includes active TEM",
  renderRespect.ok && /title="TEM · /.test(renderRespect.html));
assert("[13] heat map includes watchlist RHHBY",
  renderRespect.ok && /title="RHHBY · /.test(renderRespect.html));

// ============================================================
group("[14] fortress with constructive reads is never AVOID_OR_WAIT");
// ============================================================

const fortressEval = evaluateAIHealthDiagnosticsCandidate({
  symbol: "ABT",
  managerAssessment: {
    trigger_engine: { stance: STANCE.CONSTRUCTIVE },
    credit_view:    { stance: STANCE.NEUTRAL },
    market_intel:   { stance: STANCE.NEUTRAL },
  },
});
assert("[14] fortress with one constructive read → DEFENSIVE_ANCHOR",
  fortressEval && fortressEval.verdict === VERDICT.DEFENSIVE_ANCHOR);
assert("[14] fortress verdict is never AVOID_OR_WAIT under one constructive read",
  fortressEval && fortressEval.verdict !== VERDICT.AVOID_OR_WAIT);

// Re-confirm with full constructive across managers — should still be
// a defensive anchor (not premium candidate, since it's tier 2).
const fortressFullC = evaluateAIHealthDiagnosticsCandidate({
  symbol: "ABT",
  managerAssessment: constructiveMa,
  leadershipClass: { status: LEADERSHIP_STATUS.LEADER, read: "Defensive sector anchor." },
});
assert("[14] fortress + 3 constructive reads + leader → DEFENSIVE_ANCHOR (not PREMIUM_CANDIDATE)",
  fortressFullC && fortressFullC.verdict === VERDICT.DEFENSIVE_ANCHOR);

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetBasketBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
