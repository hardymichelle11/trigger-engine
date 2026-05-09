#!/usr/bin/env node
// =====================================================
// Market Intelligence Inbox — store + processor + agent integration
// Run: npm run test:market-intelligence-inbox
//
// Acceptance gates per spec:
//   1.  Pasted TEM thesis → draft includes TEM as primary symbol
//   2.  Draft includes GH, NTRA, RHHBY, NVDA as related symbols
//       (when present in the source text)
//   3.  Draft surfaces private companies (PathAI, Foundation Medicine, …)
//   4.  Draft surfaces catalyst + risk labels matching spec lexicon
//   5.  saveIntelligenceDraft persists; listIntelligenceItems returns it
//   6.  promoteToAgentMemory stores item with approvedByUser = true
//   7.  AI Health Diagnostics Agent retrieves approved memory and
//       enriches insight with marketIntelligenceContext
//   8.  Temporary research does NOT show up as agent memory after expiry
//   9.  Memory does NOT override risk_elevated posture
//  10.  Memory does NOT override allowedActions or verdict
//  11.  Insight JSON has no _rank / score / weight / coefficient tokens
//  12.  Inbox + Review components render without throwing under JSX loader
//  13.  Rendered HTML carries no raw scoring tokens
//  14.  archiveIntelligenceItem hides the item from agent memory
//  15.  Production build clean (verified separately by npm run build)
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  setMemoryBackend,
  resetMemoryBackend,
  saveIntelligenceDraft,
  approveIntelligenceItem,
  promoteToAgentMemory,
  archiveIntelligenceItem,
  listIntelligenceItems,
  getIntelligenceItem,
  getAgentMemory,
  getBasketMemory,
  clearAllIntelligence,
  INTELLIGENCE_STATUS,
  CONFIDENCE,
  USE_AS,
  SOURCE_TYPE,
} from "../src/lib/portfolioCio/agentMemoryStore.js";
import {
  processRawIntelligence,
} from "../src/lib/portfolioCio/intelligenceProcessor.js";
import {
  buildAIHealthDiagnosticsInsight,
  POSTURE,
} from "../src/lib/portfolioCio/aiHealthDiagnosticsAgent.js";
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
  clearAllIntelligence();
}

const TEM_THESIS = `
TEM is still a relatively young public AI-healthcare name. The market
is still deciding whether to price it as AI infrastructure / data,
healthcare diagnostics, or speculative momentum.

Tempus AI may be the bridge between diagnostics, genomic data, AI
inference, pharma monetization, and clinical decision support.

Recent Q1 2026 results: revenue grew 36.1% YoY, diagnostics revenue
grew 34.7%, Data & Applications grew 40.5%. Pharma partnerships
expanded.

Roche acquired PathAI (up to $1.05B) and expanded its AI factory with
2,176 NVDA Blackwell GPUs. Foundation Medicine, Caris, Flatiron Health
remain incumbent threats.

Other related names worth tracking: GH (liquid biopsy), NTRA (MRD
monitoring), RHHBY (Roche ADR), ABT, TMO, ILMN, IQV.

Risks: execution risk, valuation pressure, reimbursement risk,
incumbent pressure from Roche, crowded innovation trade unwind.
`.trim();

// ============================================================
group("[1] pasted TEM thesis → primary symbol = TEM");
// ============================================================

const draft = processRawIntelligence({
  rawText: TEM_THESIS,
  basketId: "ai_health_diagnostics",
  assignedAgent: "aiHealthDiagnosticsAgent",
  confidence: CONFIDENCE.USER_THESIS,
  useAs: [USE_AS.THESIS_MEMORY],
  title: "TEM AI Health Bridge thesis",
  sourceType: SOURCE_TYPE.USER_DOCUMENT,
});
assert("[1] draft built",                                     !!draft);
assert("[1] draft.basketId echoed",                           draft.basketId === "ai_health_diagnostics");
assert("[1] draft.assignedAgent echoed",                      draft.assignedAgent === "aiHealthDiagnosticsAgent");
assert("[1] primary symbol = TEM",
  Array.isArray(draft.entities.primarySymbols) && draft.entities.primarySymbols[0] === "TEM");
assert("[1] thesis.coreClaim mentions TEM or 'bridge'",
  /TEM|bridge/i.test(draft.thesis?.coreClaim || ""));
assert("[1] thesis.basketRole = AI Health Bridge",
  draft.thesis?.basketRole === "AI Health Bridge");
assert("[1] thesis.companyRole carries the AI Health profile role",
  /multimodal/i.test(draft.thesis?.companyRole || ""));

// ============================================================
group("[2] related symbols include GH, NTRA, RHHBY, NVDA");
// ============================================================

const related = draft.entities.relatedSymbols;
for (const sym of ["GH", "NTRA", "RHHBY", "NVDA"]) {
  assert(`[2] relatedSymbols includes ${sym}`, related.includes(sym));
}
assert("[2] relatedSymbols does NOT contain TEM (it's primary)",
  !related.includes("TEM"));
assert("[2] noise tokens like AI / FDA / CMS / IPO never become tickers",
  !related.includes("AI") && !related.includes("FDA") && !related.includes("CMS"));

// ============================================================
group("[3] private companies surfaced");
// ============================================================

const privates = draft.entities.privateCompanies;
assert("[3] privateCompanies includes PathAI",            privates.includes("PathAI"));
assert("[3] privateCompanies includes Foundation Medicine",
  privates.includes("Foundation Medicine"));
assert("[3] privateCompanies canonicalises Caris",         privates.includes("Caris"));
assert("[3] privateCompanies canonicalises Flatiron",      privates.includes("Flatiron"));
assert("[3] privateCompanies includes Roche label",        privates.includes("Roche"));

// ============================================================
group("[4] catalysts + risks + scanner tags match spec lexicon");
// ============================================================

const cat = draft.catalysts;
assert("[4] catalyst: M&A activity",                       cat.includes("M&A activity"));
assert("[4] catalyst: AI infrastructure expansion",        cat.includes("AI infrastructure expansion"));
assert("[4] catalyst: pharma partnership",                 cat.includes("Pharma partnership") || cat.includes("Partnership"));
assert("[4] catalyst: diagnostics revenue growth",         cat.includes("Diagnostics revenue growth"));
assert("[4] catalyst: data & applications growth",         cat.includes("Data & Applications growth"));

const r = draft.risks;
assert("[4] risk: execution risk",                         r.includes("Execution risk"));
assert("[4] risk: valuation / crowded-trade risk",         r.includes("Valuation / crowded-trade risk"));
assert("[4] risk: reimbursement pressure",                 r.includes("Reimbursement pressure"));
assert("[4] risk: incumbent pressure / competition",       r.includes("Incumbent pressure / competition"));

assert("[4] scanner tag: ai_health",                       draft.scannerTags.includes("ai_health"));
assert("[4] scanner tag: diagnostics",                     draft.scannerTags.includes("diagnostics"));
assert("[4] scanner tag: pharma",                          draft.scannerTags.includes("pharma"));

// ============================================================
group("[5] saveIntelligenceDraft persists; listIntelligenceItems sees it");
// ============================================================

reset();
const stored = saveIntelligenceDraft(draft);
assert("[5] stored draft has id",                           stored && typeof stored.id === "string" && stored.id.length > 0);
assert("[5] stored status = draft",                         stored.status === INTELLIGENCE_STATUS.DRAFT);
assert("[5] stored approvedByUser = false",                 stored.approvedByUser === false);
assert("[5] listIntelligenceItems contains the saved record",
  listIntelligenceItems().some((it) => it.id === stored.id));
assert("[5] getIntelligenceItem returns same id",
  getIntelligenceItem(stored.id)?.id === stored.id);

// ============================================================
group("[6] promoteToAgentMemory marks approvedByUser = true");
// ============================================================

const promoted = promoteToAgentMemory(stored.id);
assert("[6] promoted record exists",                        !!promoted);
assert("[6] promoted status = approved_memory",             promoted.status === INTELLIGENCE_STATUS.APPROVED_MEMORY);
assert("[6] promoted approvedByUser = true",                promoted.approvedByUser === true);
assert("[6] promoted expiresAt is null",                    promoted.expiresAt === null);
assert("[6] getAgentMemory('aiHealthDiagnosticsAgent') includes the item",
  getAgentMemory("aiHealthDiagnosticsAgent").some((it) => it.id === stored.id));
assert("[6] getBasketMemory('ai_health_diagnostics') includes the item",
  getBasketMemory("ai_health_diagnostics").some((it) => it.id === stored.id));

// ============================================================
group("[7] AI Health agent enriches insight with memory context");
// ============================================================

// The promoted memory is in place. Build an insight for TEM with
// constructive manager reads.
const constructiveMa = {
  trigger_engine: { stance: STANCE.CONSTRUCTIVE },
  credit_view:    { stance: STANCE.CONSTRUCTIVE },
  market_intel:   { stance: STANCE.CONSTRUCTIVE },
};
const insightWithMemory = buildAIHealthDiagnosticsInsight({
  symbol: "TEM",
  managerAssessment: constructiveMa,
  leadershipClass: { status: LEADERSHIP_STATUS.LEADER, read: "Leadership confirmed across managers." },
});
assert("[7] insight has thesisLens (operator-authored)",
  typeof insightWithMemory.thesisLens === "string" && insightWithMemory.thesisLens.length > 0);
assert("[7] thesisLens mentions 'bridge' or matches the operator thesis",
  /bridge|TEM/i.test(insightWithMemory.thesisLens || ""));
assert("[7] insight has competitorMap from memory",
  Array.isArray(insightWithMemory.competitorMap) && insightWithMemory.competitorMap.includes("PathAI"));
assert("[7] insight has marketIntelligenceContext block",
  insightWithMemory.marketIntelligenceContext && typeof insightWithMemory.marketIntelligenceContext === "object");
assert("[7] marketIntelligenceContext.basket = 'AI Health / Diagnostics'",
  insightWithMemory.marketIntelligenceContext.basket === "AI Health / Diagnostics");
assert("[7] marketIntelligenceContext.thesisAlignment = supportive",
  insightWithMemory.marketIntelligenceContext.thesisAlignment === "supportive");
assert("[7] marketIntelligenceContext.tradeTranslation surfaces premium guidance",
  /premium|support|IV|assignment/i.test(insightWithMemory.marketIntelligenceContext.tradeTranslation || ""));
assert("[7] creditViewInsight appends operator thesis line",
  /Operator thesis/i.test(insightWithMemory.creditViewInsight || ""));
assert("[7] risksToVerify has at least one operator memory risk",
  Array.isArray(insightWithMemory.risksToVerify) &&
  insightWithMemory.risksToVerify.some((r) => /execution|valuation|reimbursement|incumbent/i.test(r)));

// Sanity check: insight without memory does NOT surface
// marketIntelligenceContext.
const insightNoMemory = buildAIHealthDiagnosticsInsight({
  symbol: "TEM",
  managerAssessment: constructiveMa,
  leadershipClass: { status: LEADERSHIP_STATUS.LEADER, read: "Leadership confirmed." },
  skipMemory: true,
});
assert("[7] skipMemory=true → marketIntelligenceContext is null",
  insightNoMemory.marketIntelligenceContext === null);
assert("[7] skipMemory=true → thesisLens is null",
  insightNoMemory.thesisLens === null);

// ============================================================
group("[8] temporary research does NOT show in memory after expiry");
// ============================================================

reset();
const tempStored = saveIntelligenceDraft({
  ...draft,
  title: "Temporary research only",
});
const approvedTemp = approveIntelligenceItem(tempStored.id, {
  expiresAt: Date.now() - 1000,    // expired one second ago
});
assert("[8] approveIntelligenceItem returns approved record",
  approvedTemp && approvedTemp.status === INTELLIGENCE_STATUS.APPROVED_TEMPORARY);
assert("[8] expired temporary item does NOT appear in getAgentMemory",
  !getAgentMemory("aiHealthDiagnosticsAgent").some((it) => it.id === tempStored.id));
assert("[8] expired temporary item does NOT appear in getBasketMemory",
  !getBasketMemory("ai_health_diagnostics").some((it) => it.id === tempStored.id));
// listIntelligenceItems should still see it (operator-visible) — only
// the agent's view filters out expired items.
assert("[8] listIntelligenceItems still surfaces the expired record",
  listIntelligenceItems().some((it) => it.id === tempStored.id));

// Confirm a non-expired temporary IS visible to the agent.
reset();
const tempLive = saveIntelligenceDraft({ ...draft, title: "Temporary research live" });
approveIntelligenceItem(tempLive.id);   // default 7-day TTL
assert("[8] non-expired temporary item DOES appear in getAgentMemory",
  getAgentMemory("aiHealthDiagnosticsAgent").some((it) => it.id === tempLive.id));

// ============================================================
group("[9] memory does NOT override risk_elevated posture");
// ============================================================

// Set up: bearish risk manager → engine assigns posture risk_elevated.
// Memory thesis is supportive. Memory must not flip the posture.
reset();
const supportiveDraft = saveIntelligenceDraft(draft);
promoteToAgentMemory(supportiveDraft.id);
const insightRisky = buildAIHealthDiagnosticsInsight({
  symbol: "TEM",
  managerAssessment: {
    trigger_engine: { stance: STANCE.CAUTIOUS },
    credit_view:    { stance: STANCE.CAUTIOUS },
    market_intel:   { stance: STANCE.NEUTRAL },
    risk_manager:   { stance: STANCE.BEARISH },
  },
  leadershipClass: { status: LEADERSHIP_STATUS.FADING_LEADER, read: "Leadership fading across managers." },
});
assert("[9] posture remains RISK_ELEVATED with supportive memory",
  insightRisky.posture === POSTURE.RISK_ELEVATED);
assert("[9] verdict remains AVOID_OR_WAIT with supportive memory",
  insightRisky.verdict === VERDICT.AVOID_OR_WAIT);
assert("[9] marketIntelligenceContext.thesisAlignment reports 'conflicting' (engine-driven, not memory-driven)",
  insightRisky.marketIntelligenceContext &&
  insightRisky.marketIntelligenceContext.thesisAlignment === "conflicting");

// ============================================================
group("[10] memory does NOT override allowedActions");
// ============================================================

assert("[10] risk-elevated allowedActions does NOT include PROMOTE_TO_SCANNER_REVIEW (memory-supportive case)",
  !insightRisky.allowedActions.includes(ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW));
assert("[10] risk-elevated allowedActions does include MOVE_TO_WATCHLIST_REVIEW",
  insightRisky.allowedActions.includes(ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW));
assert("[10] risk-elevated allowedActions does include EXCLUDE_REVIEW",
  insightRisky.allowedActions.includes(ACTION_TYPE.EXCLUDE_REVIEW));

// ============================================================
group("[11] insight JSON has no _rank / score / weight / coefficient tokens");
// ============================================================

const insightJson = JSON.stringify(insightWithMemory);
assert("[11] no _rank token",                       !/"_rank"/.test(insightJson));
assert("[11] no \"score\":N",                       !/"score"\s*:\s*-?\d/.test(insightJson));
assert("[11] no \"weight\":N",                      !/"weight"\s*:/.test(insightJson));
assert("[11] no coefficient token",                 !/coefficient/i.test(insightJson));
assert("[11] no \"w_\" prefix",                     !/"w_/.test(insightJson));

// Same for the marketIntelligenceContext block specifically.
const micJson = JSON.stringify(insightWithMemory.marketIntelligenceContext);
assert("[11] marketIntelligenceContext has no raw scoring tokens",
  !/_rank|"score"|"weight"|coefficient|"w_/i.test(micJson));

// ============================================================
group("[12] inbox + review components render under JSX loader");
// ============================================================

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
const { default: MarketIntelligenceInbox } =
  await import("../src/components/portfolioCio/MarketIntelligenceInbox.jsx");
const { default: IntelligenceExtractionReview } =
  await import("../src/components/portfolioCio/IntelligenceExtractionReview.jsx");

function renderSafe(Component, props) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(Component, props)) }; }
  catch (err) { return { ok: false, err }; }
}

reset();
const renderInbox = renderSafe(MarketIntelligenceInbox, {});
assert("[12] inbox renders without throwing",     renderInbox.ok, renderInbox.err?.message);
assert("[12] inbox HTML mentions 'MARKET INTELLIGENCE INBOX'",
  renderInbox.ok && /MARKET INTELLIGENCE INBOX/.test(renderInbox.html));
assert("[12] inbox HTML mentions 'Process Intelligence' button",
  renderInbox.ok && /Process Intelligence/.test(renderInbox.html));
assert("[12] inbox HTML mentions 'Use as'",
  renderInbox.ok && /USE AS/.test(renderInbox.html));

const renderReview = renderSafe(IntelligenceExtractionReview, {
  draft,
  onSaveDraft: () => {},
  onApproveTemporary: () => {},
  onPromoteToMemory: () => {},
  onReject: () => {},
});
assert("[12] review renders without throwing",    renderReview.ok, renderReview.err?.message);
assert("[12] review HTML mentions 'EXTRACTED INTELLIGENCE REVIEW'",
  renderReview.ok && /EXTRACTED INTELLIGENCE REVIEW/.test(renderReview.html));
assert("[12] review HTML lists primary symbols, related, private, risks, catalysts, scanner tags",
  renderReview.ok &&
  /PRIMARY SYMBOLS/.test(renderReview.html) &&
  /RELATED SYMBOLS/.test(renderReview.html) &&
  /PRIVATE COMPANIES/.test(renderReview.html) &&
  /RISKS/.test(renderReview.html) &&
  /CATALYSTS/.test(renderReview.html) &&
  /SCANNER TAGS/.test(renderReview.html));
assert("[12] review HTML carries 'Promote to Agent Memory' button",
  renderReview.ok && /Promote to Agent Memory/.test(renderReview.html));
assert("[12] review HTML lists suggested scanner additions",
  renderReview.ok && /SUGGESTED SCANNER ADDITIONS/.test(renderReview.html));

// ============================================================
group("[13] rendered HTML carries no raw scoring tokens");
// ============================================================

const probes = [renderInbox.html || "", renderReview.html || ""];
for (const [i, html] of probes.entries()) {
  assert(`[13] probe[${i}] no \"score\":N`,         !/"score"\s*:\s*-?\d/.test(html));
  assert(`[13] probe[${i}] no \"weight\":N`,        !/"weight"\s*:/.test(html));
  assert(`[13] probe[${i}] no coefficient token`,   !/coefficient/i.test(html));
  assert(`[13] probe[${i}] no \"w_\" prefix`,       !/"w_/.test(html));
  assert(`[13] probe[${i}] no '_rank' token`,       !/_rank/.test(html));
}

// ============================================================
group("[14] archiveIntelligenceItem hides item from agent memory");
// ============================================================

reset();
const live = saveIntelligenceDraft({ ...draft, title: "Live thesis" });
promoteToAgentMemory(live.id);
assert("[14] before archive: getAgentMemory sees the item",
  getAgentMemory("aiHealthDiagnosticsAgent").some((it) => it.id === live.id));
const archived = archiveIntelligenceItem(live.id);
assert("[14] archive returns updated record",
  archived && archived.status === INTELLIGENCE_STATUS.ARCHIVED);
assert("[14] after archive: getAgentMemory does NOT see the item",
  !getAgentMemory("aiHealthDiagnosticsAgent").some((it) => it.id === live.id));
assert("[14] after archive: insight no longer carries marketIntelligenceContext for TEM",
  buildAIHealthDiagnosticsInsight({
    symbol: "TEM",
    managerAssessment: constructiveMa,
    leadershipClass: { status: LEADERSHIP_STATUS.LEADER, read: "Leadership confirmed." },
  }).marketIntelligenceContext === null);

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetMemoryBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
