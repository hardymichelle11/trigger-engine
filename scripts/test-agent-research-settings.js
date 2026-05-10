#!/usr/bin/env node
// =====================================================
// Agent Research Settings — store + contract + component
// Run: npm run test:agent-research-settings
//
// Acceptance gates per spec:
//   1.  AgentResearchSettings renders title + subtitle + safety note
//   2.  Renders basket selector with the 6 basket options
//   3.  Renders agent selector with the 5 agent options
//   4.  Renders 4 frequency options
//   5.  Renders 12 source checkboxes
//   6.  Renders 5 output destination checkboxes + Require approval row
//   7.  AI Health default symbols: TEM, GH, NTRA, RHHBY, ABT, TMO, NVDA
//   8.  AI Health default sources include the 9-source operator list
//   9.  Default outputs include proposed_intelligence + thesis_check_update
//  10.  requireApproval defaults true; enabled defaults true
//  11.  saveAgentResearchSettings persists; getAgentResearchSettings reads
//  12.  listAgentResearchSettings returns the saved record
//  13.  resetAgentResearchSettings restores defaults
//  14.  Disabled settings persist enabled = false
//  15.  buildResearchAutomationPlan returns UI-safe plan with
//       approvalMode + monitoredSymbols
//  16.  Plan never includes raw scoring tokens / cron / queue ids /
//       _rank / raw memory JSON
//  17.  SettingsAdminPage renders AgentResearchSettings inside the
//       Research Automation accordion
//  18.  Default Dashboard does NOT render the Research Automation panel
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  RESEARCH_FREQUENCY,
  RESEARCH_SOURCE,
  RESEARCH_OUTPUT,
  getDefaultAgentResearchSettings,
  saveAgentResearchSettings,
  getAgentResearchSettings,
  listAgentResearchSettings,
  resetAgentResearchSettings,
  clearAgentResearchSettingsForTests,
  setResearchSettingsBackend,
  resetResearchSettingsBackend,
} from "../src/lib/portfolioCio/agentResearchSettingsStore.js";
import {
  buildResearchAutomationPlan,
} from "../src/lib/portfolioCio/researchAutomationContract.js";

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
  setResearchSettingsBackend(makeMemoryBackend());
  clearAgentResearchSettingsForTests();
}

// JSX-bearing imports must be dynamic so the loader is in effect.
const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
const { default: AgentResearchSettings } =
  await import("../src/components/portfolioCio/AgentResearchSettings.jsx");
const { default: SettingsAdminPage } =
  await import("../src/components/workspace/SettingsAdminPage.jsx");
const { default: UniverseWorkspace } =
  await import("../src/components/common/UniverseWorkspace.jsx");

function renderSafe(Component, props = {}) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(Component, props)) }; }
  catch (err) { return { ok: false, err }; }
}

// ============================================================
group("[1] panel renders title + subtitle + safety note");
// ============================================================

reset();
const panel = renderSafe(AgentResearchSettings, {});
assert("[1] panel renders without throwing",       panel.ok, panel.err?.message);
const html = panel.html || "";
assert("[1] HTML carries 'RESEARCH AUTOMATION' title",
  /RESEARCH AUTOMATION/.test(html));
assert("[1] HTML carries the operator subtitle",
  /Configure what agents monitor and where proposed intelligence should go/i.test(html));
assert("[1] HTML carries the safety-note disclaimer",
  /do not override engine verdicts.*Credit View risk.*Trigger posture.*stale.data warnings.*capital fit.*allowed actions/i.test(html));

// ============================================================
group("[2] basket selector lists the 6 baskets");
// ============================================================

for (const label of [
  "AI Health . Diagnostics",
  "AI Infrastructure",
  "Robotics",
  "SaaS Harvest",
  "Dividend Income",
  "Watchlist",
]) {
  assert(`[2] basket option '${label}'`,            new RegExp(`<option[^>]*>${label}<`).test(html));
}

// ============================================================
group("[3] agent selector lists the 5 agents");
// ============================================================

for (const id of [
  "aiHealthDiagnosticsAgent",
  "marketIntelligenceAgent",
  "creditViewAgent",
  "triggerContextAgent",
  "basketManagerAgent",
]) {
  assert(`[3] agent option '${id}'`,                new RegExp(`<option[^>]*value="${id}"[^>]*>${id}<`).test(html));
}

// ============================================================
group("[4] research frequency lists 4 options");
// ============================================================

for (const label of ["Manual only", "Daily", "Weekly", "On major news only"]) {
  assert(`[4] frequency option '${label}'`,
    new RegExp(`<option[^>]*>${label}<`).test(html));
}

// ============================================================
group("[5] sources to monitor — 12 checkboxes");
// ============================================================

const SOURCE_LABELS_TEXT = [
  "SEC filings",
  "Earnings releases",
  "Company press releases",
  "FDA updates",
  "Medicare . reimbursement updates",
  "ARK holdings",
  "Partnership news",
  "M&amp;A news",
  "Analyst upgrades/downgrades",
  "Options IV changes",
  "Credit market stress",
  "Insider activity",
];
for (const label of SOURCE_LABELS_TEXT) {
  assert(`[5] source label '${label.replace("&amp;", "&")}'`,
    new RegExp(label).test(html));
}

// ============================================================
group("[6] output destinations + Require approval");
// ============================================================

for (const label of [
  "Create proposed intelligence item",
  "Update Thesis Check",
  "Send to Manager Review",
  "Create alert candidate",
  "Update active research card",
]) {
  assert(`[6] output label '${label}'`,             new RegExp(label).test(html));
}
assert("[6] Require approval before memory update is rendered",
  /Require approval before memory update/.test(html));
// Require approval should be checked by default.
const requireApprovalRow = html.match(
  /<input[^>]*id="research-cb-require_approval"[^>]*>/,
);
assert("[6] Require approval input found",          !!requireApprovalRow);
assert("[6] Require approval is checked by default",
  requireApprovalRow && /\bchecked(="|=""|\s|>)/.test(requireApprovalRow[0]));

// ============================================================
group("[7] AI Health default symbols include TEM/GH/NTRA/RHHBY/ABT/TMO/NVDA");
// ============================================================

for (const sym of ["TEM", "GH", "NTRA", "RHHBY", "ABT", "TMO", "NVDA"]) {
  assert(`[7] default chip includes ${sym}`,        new RegExp(`>${sym}<`).test(html));
}

// ============================================================
group("[8] AI Health default sources cover the operator list");
// ============================================================

const def = getDefaultAgentResearchSettings({
  basketId: "ai_health_diagnostics",
  agentId:  "aiHealthDiagnosticsAgent",
});
for (const s of [
  RESEARCH_SOURCE.EARNINGS_RELEASES,
  RESEARCH_SOURCE.COMPANY_RELEASES,
  RESEARCH_SOURCE.FDA_UPDATES,
  RESEARCH_SOURCE.MEDICARE_REIMBURSEMENT,
  RESEARCH_SOURCE.ARK_HOLDINGS,
  RESEARCH_SOURCE.PARTNERSHIPS,
  RESEARCH_SOURCE.MA_NEWS,
  RESEARCH_SOURCE.ANALYST_CHANGES,
  RESEARCH_SOURCE.OPTIONS_IV,
]) {
  assert(`[8] default sources include '${s}'`,     def.sources.includes(s));
}
assert("[8] default sources do NOT include SEC filings (operator can opt in)",
  !def.sources.includes(RESEARCH_SOURCE.SEC_FILINGS));

// ============================================================
group("[9] default outputs include proposed_intelligence + thesis_check_update");
// ============================================================

assert("[9] outputs include proposed_intelligence",
  def.outputs.includes(RESEARCH_OUTPUT.PROPOSED_INTELLIGENCE));
assert("[9] outputs include thesis_check_update",
  def.outputs.includes(RESEARCH_OUTPUT.THESIS_CHECK_UPDATE));

// ============================================================
group("[10] requireApproval = true; enabled = true by default");
// ============================================================

assert("[10] requireApproval defaults true",        def.requireApproval === true);
assert("[10] enabled defaults true",                def.enabled === true);
assert("[10] frequency defaults to manual_only",
  def.frequency === RESEARCH_FREQUENCY.MANUAL_ONLY);

// ============================================================
group("[11-12] save / get / list");
// ============================================================

reset();
const saved = saveAgentResearchSettings({
  basketId: "ai_health_diagnostics",
  agentId:  "aiHealthDiagnosticsAgent",
  frequency: RESEARCH_FREQUENCY.DAILY,
  sources: [RESEARCH_SOURCE.FDA_UPDATES, RESEARCH_SOURCE.PARTNERSHIPS],
  outputs: [RESEARCH_OUTPUT.PROPOSED_INTELLIGENCE, RESEARCH_OUTPUT.MANAGER_REVIEW],
  symbols: ["TEM", "GH"],
  requireApproval: true,
  enabled: true,
});
assert("[11] save returns a record",                !!saved && typeof saved.id === "string");
assert("[11] saved frequency = daily",              saved.frequency === RESEARCH_FREQUENCY.DAILY);
const fetched = getAgentResearchSettings({
  basketId: "ai_health_diagnostics",
  agentId:  "aiHealthDiagnosticsAgent",
});
assert("[11] getAgentResearchSettings returns the saved record",
  !!fetched && fetched.frequency === RESEARCH_FREQUENCY.DAILY);
assert("[12] listAgentResearchSettings exposes the record",
  listAgentResearchSettings().some(
    (r) => r.basketId === "ai_health_diagnostics" && r.agentId === "aiHealthDiagnosticsAgent",
  ));
// Sanitisation: bad inputs are silently dropped.
const sanitisedSave = saveAgentResearchSettings({
  basketId: "ai_health_diagnostics",
  agentId:  "aiHealthDiagnosticsAgent",
  sources: ["fda_updates", "BOGUS_SOURCE"],
  outputs: ["proposed_intelligence", "BOGUS_OUTPUT"],
  symbols: [" tem ", "gh", ""],
});
assert("[11] sanitisation drops invalid sources",
  !sanitisedSave.sources.includes("BOGUS_SOURCE"));
assert("[11] sanitisation drops invalid outputs",
  !sanitisedSave.outputs.includes("BOGUS_OUTPUT"));
assert("[11] sanitisation upper-cases + trims symbols",
  sanitisedSave.symbols.includes("TEM") && sanitisedSave.symbols.includes("GH"));

// ============================================================
group("[13] reset restores basket-aware defaults");
// ============================================================

const aroundReset = resetAgentResearchSettings({
  basketId: "ai_health_diagnostics",
  agentId:  "aiHealthDiagnosticsAgent",
});
assert("[13] reset returns the restored record",   !!aroundReset);
assert("[13] reset restores frequency to manual_only",
  aroundReset.frequency === RESEARCH_FREQUENCY.MANUAL_ONLY);
assert("[13] reset restores AI Health symbol set",
  ["TEM", "GH", "NTRA", "RHHBY", "ABT", "TMO", "NVDA"].every(
    (s) => aroundReset.symbols.includes(s),
  ));
assert("[13] reset restores requireApproval = true",
  aroundReset.requireApproval === true);

// ============================================================
group("[14] disabled state persists enabled = false");
// ============================================================

const disabled = saveAgentResearchSettings({
  basketId: "ai_health_diagnostics",
  agentId:  "aiHealthDiagnosticsAgent",
  enabled: false,
});
assert("[14] saved record has enabled = false",     disabled.enabled === false);
assert("[14] re-fetch keeps enabled = false",
  getAgentResearchSettings({
    basketId: "ai_health_diagnostics",
    agentId:  "aiHealthDiagnosticsAgent",
  }).enabled === false);

// ============================================================
group("[15] buildResearchAutomationPlan returns UI-safe plan");
// ============================================================

reset();
saveAgentResearchSettings({
  basketId: "ai_health_diagnostics",
  agentId:  "aiHealthDiagnosticsAgent",
  frequency: RESEARCH_FREQUENCY.DAILY,
  sources: [RESEARCH_SOURCE.FDA_UPDATES, RESEARCH_SOURCE.PARTNERSHIPS],
  outputs: [RESEARCH_OUTPUT.PROPOSED_INTELLIGENCE, RESEARCH_OUTPUT.MANAGER_REVIEW],
  symbols: ["TEM", "GH"],
  requireApproval: true,
  enabled: true,
});
const stored = getAgentResearchSettings({
  basketId: "ai_health_diagnostics",
  agentId:  "aiHealthDiagnosticsAgent",
});
const plan = buildResearchAutomationPlan(stored);
assert("[15] plan is non-null",                     !!plan);
assert("[15] plan.frequencyLabel = 'Daily'",        plan.frequencyLabel === "Daily");
assert("[15] plan.monitoredSymbols includes TEM and GH",
  plan.monitoredSymbols.includes("TEM") && plan.monitoredSymbols.includes("GH"));
assert("[15] plan.monitoredSources surface labels",
  plan.monitoredSources.length === 2 &&
  plan.monitoredSources.every((s) => typeof s.label === "string" && s.label.length > 0));
assert("[15] plan.outputDestinations surface labels",
  plan.outputDestinations.length === 2 &&
  plan.outputDestinations.every((o) => typeof o.label === "string" && o.label.length > 0));
assert("[15] plan.approvalMode = requires_approval (default)",
  plan.approvalMode === "requires_approval");
assert("[15] plan.nextStepLabel mentions 'require approval'",
  /require approval before memory update/i.test(plan.nextStepLabel));
assert("[15] plan.enabled = true",                  plan.enabled === true);

// Disabled / auto-propose paths.
const disabledPlan = buildResearchAutomationPlan({
  ...stored, enabled: false,
});
assert("[15] disabled plan.nextStepLabel says 'disabled'",
  /Research automation is disabled/i.test(disabledPlan.nextStepLabel));
const autoProposePlan = buildResearchAutomationPlan({
  ...stored, requireApproval: false,
});
assert("[15] auto-propose plan.approvalMode = auto_propose",
  autoProposePlan.approvalMode === "auto_propose");
assert("[15] auto-propose plan.nextStepLabel notes engine controls remain unchanged",
  /engine verdicts and risk controls remain unchanged/i.test(autoProposePlan.nextStepLabel));

// ============================================================
group("[16] no raw scoring / cron / queue / _rank / memory JSON");
// ============================================================

const planJson = JSON.stringify(plan);
assert("[16] plan JSON has no _rank token",         !/"_rank"/.test(planJson));
assert("[16] plan JSON has no \"score\":N",         !/"score"\s*:\s*-?\d/.test(planJson));
assert("[16] plan JSON has no \"weight\":N",        !/"weight"\s*:/.test(planJson));
assert("[16] plan JSON has no coefficient token",   !/coefficient/i.test(planJson));
assert("[16] plan JSON has no cron syntax",         !/cron|schedule_at|jobId|queueId/i.test(planJson));

// Same checks for the rendered HTML.
assert("[16] HTML has no _rank token",              !/_rank/.test(html));
assert("[16] HTML has no \"score\":N token",        !/"score"\s*:\s*-?\d/.test(html));
assert("[16] HTML has no \"weight\":N token",       !/"weight"\s*:/.test(html));
assert("[16] HTML has no coefficient token",        !/coefficient/i.test(html));
assert("[16] HTML has no cron / queue token",       !/cron|jobId|queueId/i.test(html));

// ============================================================
group("[17] SettingsAdminPage renders Research Automation accordion");
// ============================================================

const adminRender = renderSafe(SettingsAdminPage, {});
assert("[17] SettingsAdminPage renders without throwing",
  adminRender.ok, adminRender.err?.message);
assert("[17] Settings/Admin page contains the RESEARCH AUTOMATION accordion",
  /RESEARCH AUTOMATION/.test(adminRender.html));
assert("[17] accordion hint copy reflects the new configurator",
  /Configure what each agent monitors/i.test(adminRender.html));

// ============================================================
group("[18] default Dashboard does NOT render Research Automation");
// ============================================================

const dashboardRender = renderSafe(UniverseWorkspace, {});
assert("[18] dashboard renders without throwing",
  dashboardRender.ok, dashboardRender.err?.message);
assert("[18] dashboard does NOT show RESEARCH AUTOMATION header",
  !/RESEARCH AUTOMATION/.test(dashboardRender.html));
assert("[18] dashboard does NOT show the safety-note copy",
  !/do not override engine verdicts.*Credit View risk/i.test(dashboardRender.html));
// Settings/Admin page must show it (rendered via defaultSection prop).
const adminViaWorkspace = renderSafe(UniverseWorkspace, {
  defaultSection: "settings_admin",
});
assert("[18] admin view via workspace exposes RESEARCH AUTOMATION",
  adminViaWorkspace.ok && /RESEARCH AUTOMATION/.test(adminViaWorkspace.html));

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetResearchSettingsBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
