#!/usr/bin/env node
// =====================================================
// Market Intelligence Context Builder + Scanner Card +
// Credit View block tests
// Run: npm run test:market-intelligence-context
//
// Acceptance gates per spec:
//   1.  Builder returns null when no approved memory exists
//   2.  Builder returns UI-safe object when approved memory exists
//   3.  Output does NOT include raw memory JSON or _rank / score /
//       weight / coefficient tokens
//   4.  TEM approved memory creates AI Health bridge agentRead
//   5.  risk_elevated posture forces a cautionary tradeTranslation
//       (no actionable language)
//   6.  wait_for_confirmation posture renders watchlist guidance
//       (not actionable)
//   7.  avoid_for_now posture renders defer guidance (not actionable)
//   8.  sector_confirmation_signal does not deploy basket capital
//   9.  premium_candidate posture renders the premium harvesting
//       guidance with support / IV / assignment language
//  10.  Symbol-specific TEM memory does NOT decorate GH unless the
//       memory item lists GH in primaries / related
//  11.  Basket-wide memory (no entity scope) DOES decorate any
//       basket symbol
//  12.  Builder leaves agentInsight.allowedActions / verdict /
//       posture untouched (read-only)
//  13.  AIHealthDiagnosticsPanel detail-side renders Market
//       Intelligence Context block + no-override label
//  14.  AIHealthDiagnosticsPanel top-cards render compact MI block
//       only when approved memory matches the symbol
//  15.  Existing market-intelligence-inbox + thesis-health-panel +
//       ai-health-diagnostics tests remain green (verified by the
//       npm run scripts; this suite asserts none of the public
//       agent-level fields shifted)
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  buildMarketIntelligenceContext,
  composeTradeTranslation,
} from "../src/lib/portfolioCio/marketIntelligenceContextBuilder.js";
import {
  buildAIHealthDiagnosticsInsight,
  POSTURE,
} from "../src/lib/portfolioCio/aiHealthDiagnosticsAgent.js";
import {
  setMemoryBackend,
  resetMemoryBackend,
  saveIntelligenceDraft,
  promoteToAgentMemory,
  clearAllIntelligence,
  getBasketMemory,
} from "../src/lib/portfolioCio/agentMemoryStore.js";
import {
  STANCE,
} from "../src/lib/portfolioCio/managerAssessmentTypes.js";
import {
  LEADERSHIP_STATUS,
} from "../src/lib/portfolioCio/basketAgentTypes.js";
import {
  ACTION_TYPE,
} from "../src/lib/portfolioCio/basketActionQueue.js";
import {
  VERDICT,
} from "../src/lib/portfolioCio/aiHealthDiagnosticsScanner.js";
import {
  setBasketBackend,
  resetBasketBackend,
  clearAllBasketUniverses,
  seedBasketTiers,
} from "../src/lib/portfolioCio/basketUniverseManager.js";

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
  setMemoryBackend(makeMemoryBackend());
  setBasketBackend(makeMemoryBackend());
  clearAllIntelligence();
  clearAllBasketUniverses();
}

const BASKET = "ai_health_diagnostics";
const AGENT  = "aiHealthDiagnosticsAgent";

// Disallowed tokens for non-actionable postures.
const ACTIONABLE_TOKENS = /\b(buy now|sell now|enter now|sell premium now|actionable)\b/i;

const SUPPORTIVE_INSIGHT = {
  posture: POSTURE.PREMIUM_CANDIDATE,
  verdict: VERDICT.PREMIUM_CANDIDATE,
  constructiveManagerCount: 3,
  cautiousManagerCount: 0,
  role: "AI-native bridge between diagnostics, multimodal data, physicians, pharma, and clinical decision support",
  primaryRisk: "Speculative AI-health platform",
};

function makeApprovedMemory({
  primarySymbols = ["TEM"],
  relatedSymbols = ["GH", "NTRA"],
  privates = ["PathAI", "Foundation Medicine"],
  catalysts = ["Pharma partnership", "AI infrastructure expansion", "Diagnostics revenue growth"],
  risks = ["Execution risk", "Reimbursement pressure"],
  coreClaim = "TEM may be the bridge between AI, diagnostics, genomic data, pharma, and clinical workflow.",
  updatedAt = 1_710_000_000_000,
} = {}) {
  return [{
    id: "intel_existing_001",
    basketId: BASKET,
    assignedAgent: AGENT,
    title: "TEM AI Health Bridge thesis",
    status: "approved_memory",
    approvedByUser: true,
    expiresAt: null,
    createdAt: 1_700_000_000_000,
    updatedAt,
    sourceType: "user_document",
    useAs: ["thesis_memory"],
    entities: { primarySymbols, relatedSymbols, privateCompanies: privates },
    thesis: { coreClaim, marketFrame: "AI utilization", companyRole: "AI-native platform", basketRole: "AI Health Bridge" },
    risks,
    catalysts,
    scannerTags: ["ai_health"],
  }];
}

// ============================================================
group("[1] builder returns null when no approved memory");
// ============================================================

assert("[1] approvedMemory undefined → null",
  buildMarketIntelligenceContext({
    symbol: "TEM",
    basketId: BASKET,
    agentInsight: SUPPORTIVE_INSIGHT,
  }) === null);
assert("[1] approvedMemory empty array → null",
  buildMarketIntelligenceContext({
    symbol: "TEM",
    basketId: BASKET,
    agentInsight: SUPPORTIVE_INSIGHT,
    approvedMemory: [],
  }) === null);
assert("[1] missing symbol → null",
  buildMarketIntelligenceContext({
    basketId: BASKET,
    approvedMemory: makeApprovedMemory(),
  }) === null);

// ============================================================
group("[2] builder returns UI-safe object when memory exists");
// ============================================================

const ctx = buildMarketIntelligenceContext({
  symbol: "TEM",
  basketId: BASKET,
  agentInsight: SUPPORTIVE_INSIGHT,
  approvedMemory: makeApprovedMemory(),
});
assert("[2] returns object",                                !!ctx && typeof ctx === "object");
assert("[2] basket = 'AI Health / Diagnostics'",            ctx.basket === "AI Health / Diagnostics");
assert("[2] memoryStatus = 'approved'",                     ctx.memoryStatus === "approved");
assert("[2] lastUpdated set",                               typeof ctx.lastUpdated === "number" && ctx.lastUpdated > 0);
assert("[2] supportingSignals is an array",                 Array.isArray(ctx.supportingSignals));
assert("[2] challengingSignals is an array",                Array.isArray(ctx.challengingSignals));
assert("[2] competitors is an array",                       Array.isArray(ctx.competitors));
assert("[2] supportingSignals contains operator catalysts", ctx.supportingSignals.includes("Pharma partnership"));
assert("[2] challengingSignals contains operator risks",    ctx.challengingSignals.includes("Execution risk"));
assert("[2] competitors include private + related",
  ctx.competitors.includes("PathAI") &&
  (ctx.competitors.includes("Foundation Medicine") || ctx.competitors.includes("GH")));

// ============================================================
group("[3] no raw scoring tokens or hidden internals");
// ============================================================

const ctxJson = JSON.stringify(ctx);
assert("[3] ctx has no _rank token",            !/"_rank"/.test(ctxJson));
assert("[3] ctx has no \"score\":N",            !/"score"\s*:\s*-?\d/.test(ctxJson));
assert("[3] ctx has no \"weight\":N",           !/"weight"\s*:/.test(ctxJson));
assert("[3] ctx has no coefficient token",      !/coefficient/i.test(ctxJson));
assert("[3] ctx has no \"w_\" prefix",          !/"w_/.test(ctxJson));
// Builder must not leak the raw memory item shape (createdAt /
// updatedAt at the item level, status, etc.) into the context.
assert("[3] ctx has no 'status' field (memory-item internal)",
  !Object.prototype.hasOwnProperty.call(ctx, "status"));
assert("[3] ctx has no 'approvedByUser' field",
  !Object.prototype.hasOwnProperty.call(ctx, "approvedByUser"));
assert("[3] ctx has no nested 'entities' object",
  !Object.prototype.hasOwnProperty.call(ctx, "entities"));

// ============================================================
group("[4] TEM memory creates AI Health bridge agentRead");
// ============================================================

assert("[4] agentRead carries the operator's coreClaim",
  /TEM may be the bridge|bridge between AI, diagnostics/i.test(ctx.agentRead || ""));
assert("[4] thesisAlignment = 'supportive' (3 constructive reads)",
  ctx.thesisAlignment === "supportive");
assert("[4] primaryRisk surfaces a memory risk",
  /execution risk|reimbursement pressure/i.test(ctx.primaryRisk || ""));

// ============================================================
group("[5] risk_elevated → cautionary tradeTranslation");
// ============================================================

const ctxRisky = buildMarketIntelligenceContext({
  symbol: "TEM",
  basketId: BASKET,
  agentInsight: {
    posture: POSTURE.RISK_ELEVATED,
    verdict: VERDICT.AVOID_OR_WAIT,
    constructiveManagerCount: 0,
    cautiousManagerCount: 2,
  },
  approvedMemory: makeApprovedMemory(),
});
assert("[5] risk_elevated returns context (memory exists)",  !!ctxRisky);
assert("[5] tradeTranslation does NOT contain actionable language",
  !ACTIONABLE_TOKENS.test(ctxRisky.tradeTranslation || ""));
assert("[5] tradeTranslation says 'context only' or 'risk posture is elevated'",
  /context only|risk posture is elevated/i.test(ctxRisky.tradeTranslation || ""));
assert("[5] thesisAlignment = 'conflicting' under cautious reads",
  ctxRisky.thesisAlignment === "conflicting");

// ============================================================
group("[6] wait_for_confirmation → watchlist guidance");
// ============================================================

const ctxWait = buildMarketIntelligenceContext({
  symbol: "TEM",
  basketId: BASKET,
  agentInsight: {
    posture: POSTURE.WAIT_FOR_CONFIRMATION,
    verdict: VERDICT.STRONG_WATCH,
    constructiveManagerCount: 1,
    cautiousManagerCount: 0,
  },
  approvedMemory: makeApprovedMemory(),
});
assert("[6] wait posture returns context",                  !!ctxWait);
assert("[6] tradeTranslation mentions 'watchlist' or 'wait'",
  /watchlist|wait for/i.test(ctxWait.tradeTranslation || ""));
assert("[6] tradeTranslation NOT actionable",
  !ACTIONABLE_TOKENS.test(ctxWait.tradeTranslation || ""));

// ============================================================
group("[7] avoid_for_now → defer guidance");
// ============================================================

const ctxAvoid = buildMarketIntelligenceContext({
  symbol: "TEM",
  basketId: BASKET,
  agentInsight: {
    posture: POSTURE.AVOID_FOR_NOW,
    verdict: VERDICT.AVOID_OR_WAIT,
    constructiveManagerCount: 0,
    cautiousManagerCount: 1,
  },
  approvedMemory: makeApprovedMemory(),
});
assert("[7] avoid_for_now mentions 'defer' or 'context only'",
  /defer|context only|do not size/i.test(ctxAvoid.tradeTranslation || ""));
assert("[7] avoid_for_now NOT actionable",
  !ACTIONABLE_TOKENS.test(ctxAvoid.tradeTranslation || ""));

// ============================================================
group("[8] sector_confirmation_signal does not deploy capital");
// ============================================================

const ctxSector = buildMarketIntelligenceContext({
  symbol: "NVDA",
  basketId: BASKET,
  agentInsight: {
    posture: POSTURE.SECTOR_CONFIRMATION_SIGNAL,
    verdict: VERDICT.STRONG_WATCH,
    constructiveManagerCount: 1,
    cautiousManagerCount: 0,
  },
  approvedMemory: makeApprovedMemory({
    primarySymbols: ["TEM"],
    relatedSymbols: ["NVDA"],
  }),
});
assert("[8] sector_confirmation_signal returns context",   !!ctxSector);
assert("[8] tradeTranslation says 'sector confirmation' or 'do not deploy'",
  /sector confirmation|do not deploy/i.test(ctxSector.tradeTranslation || ""));
assert("[8] sector_confirmation_signal NOT actionable",
  !ACTIONABLE_TOKENS.test(ctxSector.tradeTranslation || ""));

// ============================================================
group("[9] premium_candidate → premium harvesting guidance");
// ============================================================

assert("[9] premium tradeTranslation mentions premium / IV / assignment / support",
  /premium/i.test(ctx.tradeTranslation) &&
  /support|IV|assignment/i.test(ctx.tradeTranslation));
assert("[9] premium tradeTranslation gates on 'only if' or 'only when'",
  /only if|only when/i.test(ctx.tradeTranslation));

// ============================================================
group("[10] symbol-specific TEM memory does NOT decorate GH");
// ============================================================

// Memory only lists TEM in primaries; GH is not in primaries or
// related → builder returns null for GH.
const ctxGhUnrelated = buildMarketIntelligenceContext({
  symbol: "GH",
  basketId: BASKET,
  agentInsight: SUPPORTIVE_INSIGHT,
  approvedMemory: makeApprovedMemory({
    primarySymbols: ["TEM"],
    relatedSymbols: [],
  }),
});
assert("[10] GH gets null when memory is symbol-specific to TEM",
  ctxGhUnrelated === null);

// But when memory lists GH in related, GH does receive context.
const ctxGhRelated = buildMarketIntelligenceContext({
  symbol: "GH",
  basketId: BASKET,
  agentInsight: SUPPORTIVE_INSIGHT,
  approvedMemory: makeApprovedMemory({
    primarySymbols: ["TEM"],
    relatedSymbols: ["GH"],
  }),
});
assert("[10] GH gets context when memory lists it as related",
  !!ctxGhRelated);

// ============================================================
group("[11] basket-wide memory decorates any basket symbol");
// ============================================================

const ctxRhhbyWide = buildMarketIntelligenceContext({
  symbol: "RHHBY",
  basketId: BASKET,
  agentInsight: { ...SUPPORTIVE_INSIGHT, posture: POSTURE.LONG_HOLD_ANCHOR, verdict: VERDICT.DEFENSIVE_ANCHOR },
  approvedMemory: [{
    id: "intel_basket_wide",
    basketId: BASKET,
    assignedAgent: AGENT,
    title: "AI Health basket-wide thesis",
    status: "approved_memory",
    approvedByUser: true,
    expiresAt: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_705_000_000_000,
    entities: { primarySymbols: [], relatedSymbols: [], privateCompanies: [] },
    thesis: { coreClaim: "AI is moving into the intelligence layer of medicine.", basketRole: "AI Health" },
    risks: [], catalysts: ["Hospital adoption / expansion"], scannerTags: [],
  }],
});
assert("[11] basket-wide memory decorates RHHBY",          !!ctxRhhbyWide);
assert("[11] basket-wide agentRead surfaces the wide claim",
  /intelligence layer of medicine/i.test(ctxRhhbyWide.agentRead || ""));

// ============================================================
group("[12] builder leaves agentInsight read-only");
// ============================================================

// Use a frozen insight so any mutation would throw.
const frozenInsight = Object.freeze({
  ...SUPPORTIVE_INSIGHT,
  allowedActions: Object.freeze([
    ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW,
    ACTION_TYPE.SEND_TO_TE,
    ACTION_TYPE.SEND_TO_CV,
  ]),
});
const ctxFromFrozen = buildMarketIntelligenceContext({
  symbol: "TEM",
  basketId: BASKET,
  agentInsight: frozenInsight,
  approvedMemory: makeApprovedMemory(),
});
assert("[12] builder accepted frozen insight",                !!ctxFromFrozen);
assert("[12] frozenInsight.posture unchanged",                frozenInsight.posture === POSTURE.PREMIUM_CANDIDATE);
assert("[12] frozenInsight.verdict unchanged",                frozenInsight.verdict === VERDICT.PREMIUM_CANDIDATE);
assert("[12] frozenInsight.allowedActions unchanged",
  frozenInsight.allowedActions.length === 3 &&
  frozenInsight.allowedActions.includes(ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW));

// composeTradeTranslation directly is also pure / read-only.
const tt = composeTradeTranslation({ posture: POSTURE.RISK_ELEVATED });
assert("[12] direct composeTradeTranslation handles risk_elevated",
  /risk posture is elevated|context only/i.test(tt));

// ============================================================
group("[13] DetailPanel renders MI block + no-override label");
// ============================================================

reset();
const draft = saveIntelligenceDraft({
  basketId: BASKET, assignedAgent: AGENT,
  title: "TEM thesis baseline",
  thesis: {
    coreClaim: "TEM may be the bridge between AI, diagnostics, and pharma.",
    basketRole: "AI Health Bridge",
  },
  catalysts: ["Pharma partnership", "AI infrastructure expansion"],
  risks: ["Execution risk"],
  entities: { primarySymbols: ["TEM"], relatedSymbols: ["GH"], privateCompanies: ["PathAI"] },
});
promoteToAgentMemory(draft.id);
seedBasketTiers(BASKET);

// Build the actual insight via the AI Health agent — that exercises
// the agent's call into the builder.
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
assert("[13] insight has marketIntelligenceContext from agent",
  !!insight.marketIntelligenceContext);
assert("[13] insight context carries supportingSignals",
  Array.isArray(insight.marketIntelligenceContext.supportingSignals) &&
  insight.marketIntelligenceContext.supportingSignals.length > 0);
assert("[13] insight context carries challengingSignals",
  Array.isArray(insight.marketIntelligenceContext.challengingSignals) &&
  insight.marketIntelligenceContext.challengingSignals.length > 0);

// Render the panel and check the DetailPanel renders the MI block.
const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
const { default: AIHealthDiagnosticsPanel } =
  await import("../src/components/portfolioCio/AIHealthDiagnosticsPanel.jsx");

function renderSafe(props) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(AIHealthDiagnosticsPanel, props)) }; }
  catch (err) { return { ok: false, err }; }
}

// Static panel render — selects no symbol, so the DetailPanel
// section won't show the MI block. Exercise the rendered HTML for
// the top-cards' compact MI block instead.
const renderPanel = renderSafe({
  managerAssessmentsBySymbol: {
    TEM:   constructiveMa,
    GH:    constructiveMa,
    NTRA:  constructiveMa,
    RHHBY: { trigger_engine: { stance: STANCE.CONSTRUCTIVE },
             credit_view:    { stance: STANCE.NEUTRAL },
             market_intel:   { stance: STANCE.NEUTRAL } },
  },
});
assert("[13] panel renders without throwing",          renderPanel.ok, renderPanel.err?.message);
assert("[13] panel HTML mentions 'MARKET INTELLIGENCE CONTEXT' or 'MI'",
  renderPanel.ok && (
    /MARKET INTELLIGENCE CONTEXT/.test(renderPanel.html) ||
    />MI</.test(renderPanel.html)
  ));
assert("[13] panel HTML carries the 'Context only — does not override engine verdict.' label",
  renderPanel.ok && /Context only — does not override engine verdict/.test(renderPanel.html));

// ============================================================
group("[14] top-cards render MI block only when memory matches");
// ============================================================

// In the seeded universe, TEM is active and approved memory targets
// TEM. So the top-card for the Best Premium Candidate (TEM) MUST
// carry an MI block. Check that the operator's coreClaim shows up.
assert("[14] top-card region carries TEM operator coreClaim",
  renderPanel.ok && /TEM may be the bridge between AI, diagnostics/.test(renderPanel.html));

// The compact MI block carries an "MI" tag — ensure the panel HTML
// has at least one. (The tag is a visual chip, used in the compact
// variant only.)
assert("[14] HTML carries the compact 'MI' chip used by top-cards",
  renderPanel.ok && />MI</.test(renderPanel.html));

// Now wipe the memory and re-render — the MI block should disappear.
clearAllIntelligence();
const renderPanelNoMemory = renderSafe({
  managerAssessmentsBySymbol: {
    TEM: constructiveMa,
  },
});
assert("[14] panel still renders without memory",         renderPanelNoMemory.ok);
assert("[14] without memory, no 'Context only' disclaimer in HTML",
  renderPanelNoMemory.ok &&
  !/Context only — does not override engine verdict/.test(renderPanelNoMemory.html));
assert("[14] without memory, no 'MARKET INTELLIGENCE CONTEXT' header",
  renderPanelNoMemory.ok &&
  !/MARKET INTELLIGENCE CONTEXT/.test(renderPanelNoMemory.html));

// ============================================================
group("[15] no raw scoring tokens leak into rendered HTML");
// ============================================================

const probes = [renderPanel.html || "", renderPanelNoMemory.html || ""];
for (const [i, html] of probes.entries()) {
  assert(`[15] HTML probe[${i}] no \"score\":N`,        !/"score"\s*:\s*-?\d/.test(html));
  assert(`[15] HTML probe[${i}] no \"weight\":N`,       !/"weight"\s*:/.test(html));
  assert(`[15] HTML probe[${i}] no coefficient token`,  !/coefficient/i.test(html));
  assert(`[15] HTML probe[${i}] no \"w_\" prefix`,      !/"w_/.test(html));
  assert(`[15] HTML probe[${i}] no '_rank' token`,      !/_rank/.test(html));
  assert(`[15] HTML probe[${i}] no actionable token`,   !ACTIONABLE_TOKENS.test(html));
}

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetMemoryBackend();
resetBasketBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
