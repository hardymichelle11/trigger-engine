#!/usr/bin/env node
// =====================================================
// Research Automation Phase 2 — Manual Run +
// Proposed Intelligence Queue
// Run: npm run test:research-runner
//
// Acceptance gates per spec:
//   1.  Mock adapter is deterministic: same (symbol, source) →
//       same finding(s); unknown returns []
//   2.  Adapter coverage includes TEM, GH, RHHBY, NVDA
//   3.  runResearchCheck on disabled settings → no writes
//   4.  runResearchCheck with no symbols / no sources → no writes
//   5.  runResearchCheck on AI Health settings produces draft
//       items in agentMemoryStore
//   6.  Drafts carry status=DRAFT, requireApproval implied (no
//       approvedByUser=true), correct basketId / assignedAgent
//   7.  Per-item classification via classifyProposedItem:
//       - TEM earnings → confirming
//       - RHHBY M&A    → mixed (catalysts + risks)
//   8.  Re-running upserts; does NOT duplicate items
//   9.  Re-running PRESERVES operator decisions: approved /
//       archived items are not regressed back to draft
//  10.  listProposedIntelligence filters by basket + agent
//  11.  Runner output never leaks _rank / score / weight /
//       coefficient / cron / queue tokens
//  12.  ProposedIntelligenceQueue renders empty state copy
//  13.  Queue renders item cards with classification chip +
//       4 action buttons + source label
//  14.  AgentResearchSettings renders 'Run research check'
//       button
//  15.  SettingsAdminPage exposes both Research Automation and
//       Proposed Intelligence Queue accordions
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  getMockFindings,
  hasMockCoverageFor,
  listMockCoverageSymbols,
  listMockCoveragePairs,
} from "../src/lib/portfolioCio/researchSourceAdapter.js";
import {
  runResearchCheck,
  listProposedIntelligence,
  classifyProposedItem,
} from "../src/lib/portfolioCio/researchRunner.js";
import {
  RESEARCH_FREQUENCY,
  RESEARCH_SOURCE,
  saveAgentResearchSettings,
  setResearchSettingsBackend,
  resetResearchSettingsBackend,
  clearAgentResearchSettingsForTests,
} from "../src/lib/portfolioCio/agentResearchSettingsStore.js";
import {
  setMemoryBackend,
  resetMemoryBackend,
  clearAllIntelligence,
  promoteToAgentMemory,
  archiveIntelligenceItem,
  getIntelligenceItem,
  listIntelligenceItems,
  INTELLIGENCE_STATUS,
} from "../src/lib/portfolioCio/agentMemoryStore.js";

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
  setResearchSettingsBackend(makeMemoryBackend());
  clearAllIntelligence();
  clearAgentResearchSettingsForTests();
}

// ============================================================
group("[1-2] mock adapter is deterministic");
// ============================================================

const tem1 = getMockFindings({ symbol: "TEM", source: "earnings_releases" });
const tem2 = getMockFindings({ symbol: "TEM", source: "earnings_releases" });
assert("[1] TEM earnings findings non-empty",        Array.isArray(tem1) && tem1.length > 0);
assert("[1] TEM earnings findings are deterministic",
  JSON.stringify(tem1) === JSON.stringify(tem2));
assert("[1] TEM earnings finding carries title + coreClaim",
  typeof tem1[0].title === "string" && /Q1|earnings/i.test(tem1[0].title) &&
  typeof tem1[0].coreClaim === "string");
assert("[1] unknown symbol returns []",
  getMockFindings({ symbol: "ZZZZ", source: "earnings_releases" }).length === 0);
assert("[1] missing source returns []",
  getMockFindings({ symbol: "TEM" }).length === 0);
assert("[1] adapter never mutates from caller",
  (() => {
    const a = getMockFindings({ symbol: "TEM", source: "earnings_releases" });
    a[0].title = "MUTATED";
    const b = getMockFindings({ symbol: "TEM", source: "earnings_releases" });
    return b[0].title !== "MUTATED";
  })());

assert("[2] mock library covers TEM",                 hasMockCoverageFor("TEM"));
assert("[2] mock library covers GH",                  hasMockCoverageFor("GH"));
assert("[2] mock library covers RHHBY",               hasMockCoverageFor("RHHBY"));
assert("[2] mock library covers NVDA",                hasMockCoverageFor("NVDA"));
assert("[2] listMockCoverageSymbols includes core AI Health names",
  ["TEM", "GH", "RHHBY", "NVDA"].every((s) => listMockCoverageSymbols().includes(s)));
assert("[2] listMockCoveragePairs returns at least 10 (symbol, source) tuples",
  listMockCoveragePairs().length >= 10);

// ============================================================
group("[3] disabled settings → no writes");
// ============================================================

reset();
const disabledRun = runResearchCheck({
  basketId: "ai_health_diagnostics",
  agentId: "aiHealthDiagnosticsAgent",
  enabled: false,
  symbols: ["TEM"],
  sources: [RESEARCH_SOURCE.EARNINGS_RELEASES],
});
assert("[3] disabled run.ok = true",                  disabledRun.ok === true);
assert("[3] disabled run.added.length === 0",         disabledRun.added.length === 0);
assert("[3] disabled run.summary mentions 'disabled'",
  /disabled/i.test(disabledRun.summary));
assert("[3] disabled run did NOT write to memory store",
  listIntelligenceItems().length === 0);

// ============================================================
group("[4] no symbols or no sources → no writes");
// ============================================================

reset();
const noSourcesRun = runResearchCheck({
  basketId: "ai_health_diagnostics",
  agentId: "aiHealthDiagnosticsAgent",
  enabled: true,
  symbols: ["TEM"],
  sources: [],
});
assert("[4] no-sources run.ok = true",                noSourcesRun.ok === true);
assert("[4] no-sources run.added.length === 0",       noSourcesRun.added.length === 0);
assert("[4] no-sources run.summary mentions 'Nothing to scan'",
  /Nothing to scan/i.test(noSourcesRun.summary));
assert("[4] no-sources run did NOT write to memory store",
  listIntelligenceItems().length === 0);

// Also exercise: no symbols. Should also short-circuit because
// settings.symbols is empty AND the basket-default fallback hits.
// We need to clear basket defaults — passing watchlist (which has
// empty symbol defaults) does it.
const noSymbolsRun = runResearchCheck({
  basketId: "watchlist",
  agentId: "aiHealthDiagnosticsAgent",
  enabled: true,
  symbols: [],
  sources: [RESEARCH_SOURCE.EARNINGS_RELEASES],
});
assert("[4] empty-symbols run.added.length === 0",    noSymbolsRun.added.length === 0);

// ============================================================
group("[5] AI Health run produces draft items");
// ============================================================

reset();
const aiHealthRun = runResearchCheck({
  basketId: "ai_health_diagnostics",
  agentId: "aiHealthDiagnosticsAgent",
  enabled: true,
  frequency: RESEARCH_FREQUENCY.MANUAL_ONLY,
  symbols: ["TEM", "GH", "NTRA", "RHHBY", "ABT", "TMO", "NVDA"],
  sources: [
    RESEARCH_SOURCE.EARNINGS_RELEASES,
    RESEARCH_SOURCE.COMPANY_RELEASES,
    RESEARCH_SOURCE.FDA_UPDATES,
    RESEARCH_SOURCE.MEDICARE_REIMBURSEMENT,
    RESEARCH_SOURCE.PARTNERSHIPS,
    RESEARCH_SOURCE.MA_NEWS,
    RESEARCH_SOURCE.ANALYST_CHANGES,
    RESEARCH_SOURCE.OPTIONS_IV,
  ],
});
assert("[5] run.ok = true",                           aiHealthRun.ok === true);
assert("[5] run.added.length >= 6 (TEM coverage alone gives several)",
  aiHealthRun.added.length >= 6);
assert("[5] run.totalFindings >= run.added.length",
  aiHealthRun.totalFindings >= aiHealthRun.added.length);
assert("[5] run.summary mentions 'new proposed item'",
  /new proposed item/i.test(aiHealthRun.summary));
const allItems = listIntelligenceItems();
assert("[5] memory store now contains the draft items",
  allItems.length === aiHealthRun.added.length);

// ============================================================
group("[6] drafts carry correct shape");
// ============================================================

const sampleDraft = getIntelligenceItem(aiHealthRun.added[0]);
assert("[6] draft status = draft",                    sampleDraft.status === INTELLIGENCE_STATUS.DRAFT);
assert("[6] draft.basketId echoed",                   sampleDraft.basketId === "ai_health_diagnostics");
assert("[6] draft.assignedAgent echoed",              sampleDraft.assignedAgent === "aiHealthDiagnosticsAgent");
assert("[6] draft.approvedByUser = false",            sampleDraft.approvedByUser === false);
assert("[6] draft has primarySymbols = [TEM-or-similar]",
  Array.isArray(sampleDraft.entities.primarySymbols) &&
  sampleDraft.entities.primarySymbols.length === 1);
assert("[6] draft.researchSource is set (queue can render)",
  typeof sampleDraft.researchSource === "string" && sampleDraft.researchSource.length > 0);

// ============================================================
group("[7] per-item classification");
// ============================================================

reset();
runResearchCheck({
  basketId: "ai_health_diagnostics",
  agentId: "aiHealthDiagnosticsAgent",
  enabled: true,
  symbols: ["TEM"],
  sources: [RESEARCH_SOURCE.EARNINGS_RELEASES],
});
const temItem = listProposedIntelligence({
  basketId: "ai_health_diagnostics",
  agentId: "aiHealthDiagnosticsAgent",
})[0];
const temClassification = classifyProposedItem(temItem, { basketId: "ai_health_diagnostics" });
assert("[7] TEM earnings classification = confirming",
  temClassification.kind === "confirming");
assert("[7] TEM earnings classification has at least 1 confirming entry",
  temClassification.confirmingCount >= 1);

reset();
runResearchCheck({
  basketId: "ai_health_diagnostics",
  agentId: "aiHealthDiagnosticsAgent",
  enabled: true,
  symbols: ["RHHBY"],
  sources: [RESEARCH_SOURCE.MA_NEWS],
});
const rhhbyItem = listProposedIntelligence({
  basketId: "ai_health_diagnostics",
  agentId: "aiHealthDiagnosticsAgent",
})[0];
const rhhbyClassification = classifyProposedItem(rhhbyItem, { basketId: "ai_health_diagnostics" });
assert("[7] RHHBY M&A carries both catalysts and risks (mixed)",
  rhhbyClassification.kind === "mixed" &&
  rhhbyClassification.confirmingCount >= 1 &&
  rhhbyClassification.challengingCount >= 1);

// ============================================================
group("[8] re-running is idempotent");
// ============================================================

reset();
const settings = saveAgentResearchSettings({
  basketId: "ai_health_diagnostics",
  agentId: "aiHealthDiagnosticsAgent",
  enabled: true,
  symbols: ["TEM"],
  sources: [
    RESEARCH_SOURCE.EARNINGS_RELEASES,
    RESEARCH_SOURCE.PARTNERSHIPS,
  ],
});
const firstRun = runResearchCheck(settings);
const firstCount = listIntelligenceItems().length;
const secondRun = runResearchCheck(settings);
const secondCount = listIntelligenceItems().length;
assert("[8] first run created drafts",                firstRun.added.length > 0);
assert("[8] second run does NOT create new drafts",   secondRun.added.length === 0);
assert("[8] second run reports updated count > 0",    secondRun.updated.length > 0);
assert("[8] memory store size unchanged after re-run",firstCount === secondCount);

// ============================================================
group("[9] operator decisions preserved across re-runs");
// ============================================================

// Promote one draft, archive another, run again — neither should
// regress back to draft.
const draftIds = listProposedIntelligence({
  basketId: "ai_health_diagnostics",
  agentId: "aiHealthDiagnosticsAgent",
}).map((it) => it.id);
const promoteId = draftIds[0];
const archiveId = draftIds[1];
promoteToAgentMemory(promoteId);
archiveIntelligenceItem(archiveId);

const reRun = runResearchCheck(settings);
const promoted = getIntelligenceItem(promoteId);
const archived = getIntelligenceItem(archiveId);
assert("[9] promoted item stays APPROVED_MEMORY",
  promoted.status === INTELLIGENCE_STATUS.APPROVED_MEMORY);
assert("[9] archived item stays ARCHIVED",
  archived.status === INTELLIGENCE_STATUS.ARCHIVED);
assert("[9] re-run reports them as skipped (operator decisions preserved)",
  reRun.skipped.length >= 2 &&
  reRun.skipped.every((s) => s.reason === "operator_decision_preserved"));

// ============================================================
group("[10] listProposedIntelligence filters by basket + agent");
// ============================================================

reset();
// Run two settings: AI Health under aiHealthDiagnosticsAgent, then
// AI Health under a different agent. Queue lookups must scope
// correctly.
runResearchCheck({
  basketId: "ai_health_diagnostics",
  agentId: "aiHealthDiagnosticsAgent",
  enabled: true,
  symbols: ["TEM"],
  sources: [RESEARCH_SOURCE.EARNINGS_RELEASES],
});
runResearchCheck({
  basketId: "ai_health_diagnostics",
  agentId: "marketIntelligenceAgent",
  enabled: true,
  symbols: ["GH"],
  sources: [RESEARCH_SOURCE.FDA_UPDATES],
});
const aiHealthAgentQueue = listProposedIntelligence({
  basketId: "ai_health_diagnostics",
  agentId: "aiHealthDiagnosticsAgent",
});
const miAgentQueue = listProposedIntelligence({
  basketId: "ai_health_diagnostics",
  agentId: "marketIntelligenceAgent",
});
assert("[10] AI Health agent queue returns only its drafts",
  aiHealthAgentQueue.length >= 1 &&
  aiHealthAgentQueue.every((it) => it.assignedAgent === "aiHealthDiagnosticsAgent"));
assert("[10] MI agent queue returns only its drafts",
  miAgentQueue.length >= 1 &&
  miAgentQueue.every((it) => it.assignedAgent === "marketIntelligenceAgent"));
assert("[10] basket-only filter (no agent scope) returns both",
  listProposedIntelligence({ basketId: "ai_health_diagnostics" }).length ===
  aiHealthAgentQueue.length + miAgentQueue.length);

// ============================================================
group("[11] runner output has no scoring / cron / queue tokens");
// ============================================================

reset();
runResearchCheck({
  basketId: "ai_health_diagnostics",
  agentId: "aiHealthDiagnosticsAgent",
  enabled: true,
  symbols: ["TEM", "RHHBY", "NVDA"],
  sources: [RESEARCH_SOURCE.EARNINGS_RELEASES, RESEARCH_SOURCE.MA_NEWS, RESEARCH_SOURCE.OPTIONS_IV],
});
const allDrafts = listIntelligenceItems();
const draftsJson = JSON.stringify(allDrafts);
assert("[11] drafts JSON has no _rank token",         !/"_rank"/.test(draftsJson));
assert("[11] drafts JSON has no \"score\":N",         !/"score"\s*:\s*-?\d/.test(draftsJson));
assert("[11] drafts JSON has no \"weight\":N",        !/"weight"\s*:/.test(draftsJson));
assert("[11] drafts JSON has no coefficient token",   !/coefficient/i.test(draftsJson));
assert("[11] drafts JSON has no cron / jobId / queueId tokens",
  !/cron|jobId|queueId|schedule_at/i.test(draftsJson));

// ============================================================
group("[12] queue empty-state copy");
// ============================================================

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
const { default: ProposedIntelligenceQueue } =
  await import("../src/components/portfolioCio/ProposedIntelligenceQueue.jsx");
const { default: AgentResearchSettings } =
  await import("../src/components/portfolioCio/AgentResearchSettings.jsx");
const { default: SettingsAdminPage } =
  await import("../src/components/workspace/SettingsAdminPage.jsx");

function renderSafe(Component, props = {}) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(Component, props)) }; }
  catch (err) { return { ok: false, err }; }
}

reset();
const emptyQueue = renderSafe(ProposedIntelligenceQueue, {});
assert("[12] empty queue renders without throwing",   emptyQueue.ok, emptyQueue.err?.message);
assert("[12] empty queue renders the header",
  /PROPOSED INTELLIGENCE QUEUE . 0/.test(emptyQueue.html));
assert("[12] empty queue prompts to Run research check",
  /Run research check/i.test(emptyQueue.html));

// ============================================================
group("[13] queue renders item cards with classification + actions");
// ============================================================

runResearchCheck({
  basketId: "ai_health_diagnostics",
  agentId: "aiHealthDiagnosticsAgent",
  enabled: true,
  symbols: ["TEM", "RHHBY"],
  sources: [RESEARCH_SOURCE.EARNINGS_RELEASES, RESEARCH_SOURCE.MA_NEWS],
});
const populatedQueue = renderSafe(ProposedIntelligenceQueue, {
  defaultBasketId: "ai_health_diagnostics",
  defaultAgentId: "aiHealthDiagnosticsAgent",
});
assert("[13] populated queue renders without throwing",
  populatedQueue.ok, populatedQueue.err?.message);
const qHtml = populatedQueue.html || "";
assert("[13] queue surfaces the TEM card",            /TEM/.test(qHtml));
assert("[13] queue surfaces the RHHBY card",          /RHHBY/.test(qHtml));
assert("[13] queue carries 'Confirming' classification chip",
  /Confirming/.test(qHtml));
assert("[13] queue carries 'Mixed' classification chip",
  /Mixed/.test(qHtml));
for (const action of ["Promote to Memory", "One-scan only", "Archive", "Reject"]) {
  assert(`[13] queue card carries '${action}' button`,  new RegExp(action).test(qHtml));
}
assert("[13] queue card surfaces the Source label",
  /Source: Earnings releases|Source: M&amp;A news/.test(qHtml));

// ============================================================
group("[14] AgentResearchSettings exposes 'Run research check'");
// ============================================================

const settingsRender = renderSafe(AgentResearchSettings, {});
assert("[14] settings panel renders without throwing",
  settingsRender.ok, settingsRender.err?.message);
assert("[14] settings panel renders 'Run research check' button",
  /Run research check/.test(settingsRender.html));

// ============================================================
group("[15] SettingsAdminPage exposes both accordions");
// ============================================================

const adminRender = renderSafe(SettingsAdminPage, {});
assert("[15] admin renders without throwing",         adminRender.ok, adminRender.err?.message);
assert("[15] admin contains RESEARCH AUTOMATION accordion",
  /RESEARCH AUTOMATION/.test(adminRender.html));
assert("[15] admin contains PROPOSED INTELLIGENCE QUEUE accordion",
  /PROPOSED INTELLIGENCE QUEUE/.test(adminRender.html));

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetMemoryBackend();
resetResearchSettingsBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
