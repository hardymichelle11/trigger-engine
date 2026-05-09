#!/usr/bin/env node
// =====================================================
// Thesis Health Panel + evaluator tests
// Run: npm run test:thesis-health-panel
//
// Acceptance gates per spec:
//   1.  evaluateThesisHealth → STRENGTHENING when proposed includes
//       AI Health confirming evidence
//   2.  evaluateThesisHealth → WEAKENING on reimbursement / incumbent
//       pressure
//   3.  Mixed evidence → CONFLICTING
//   4.  Empty proposed (with approved memory) → UNCHANGED
//   5.  Empty proposed (no approved memory) → INSUFFICIENT_EVIDENCE
//   6.  Engine-flagged risk_elevated posture surfaces as challenging
//       evidence regardless of memory
//   7.  AI Health-specific keyword map routes Pharma partnership
//       and Hospital adoption / expansion to confirming
//   8.  AI Health-specific keyword map routes Reimbursement pressure
//       and Incumbent pressure / competition to challenging
//   9.  Neutral labels (Earnings catalyst, Clinical / trial readout,
//       Elevated volatility) land in the neutral bucket and do NOT
//       move the verdict
//  10.  Confidence label ladders correctly with evidence count
//  11.  ThesisHealthPanel renders approved thesis + summary line
//  12.  ThesisHealthPanel surfaces the "no override" disclaimer
//  13.  ThesisHealthPanel renders confirming + challenging buckets
//  14.  ThesisHealthPanel does NOT mutate memory when no callbacks
//       are provided
//  15.  No raw scores / weights / coefficients / _rank in rendered
//       HTML or evaluation JSON
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  evaluateThesisHealth,
  THESIS_HEALTH_STATUS,
  THESIS_HEALTH_CONFIDENCE,
  THESIS_HEALTH_ACTION,
} from "../src/lib/portfolioCio/thesisHealthEvaluator.js";
import {
  setMemoryBackend,
  resetMemoryBackend,
  saveIntelligenceDraft,
  promoteToAgentMemory,
  clearAllIntelligence,
  getBasketMemory,
  listIntelligenceItems,
  CONFIDENCE,
  USE_AS,
  SOURCE_TYPE,
  INTELLIGENCE_STATUS,
} from "../src/lib/portfolioCio/agentMemoryStore.js";
import {
  POSTURE,
} from "../src/lib/portfolioCio/aiHealthDiagnosticsAgent.js";
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

const BASKET = "ai_health_diagnostics";
const AGENT  = "aiHealthDiagnosticsAgent";

function makeApprovedMemoryItem(overrides = {}) {
  return {
    id: "intel_existing_001",
    basketId: BASKET,
    assignedAgent: AGENT,
    title: "TEM AI Health Bridge thesis",
    confidence: CONFIDENCE.USER_THESIS,
    status: INTELLIGENCE_STATUS.APPROVED_MEMORY,
    approvedByUser: true,
    expiresAt: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    sourceType: SOURCE_TYPE.USER_DOCUMENT,
    useAs: [USE_AS.THESIS_MEMORY],
    entities: { primarySymbols: ["TEM"], relatedSymbols: ["GH", "NTRA"], privateCompanies: ["PathAI"] },
    thesis: {
      coreClaim: "TEM may be the bridge between AI, diagnostics, genomic data, pharma, and clinical workflow.",
      marketFrame: "AI utilization phase",
      companyRole: "AI-native healthcare intelligence platform",
      basketRole: "AI Health Bridge",
    },
    risks: ["Execution risk"],
    catalysts: ["Pharma partnership"],
    scannerTags: ["ai_health"],
    ...overrides,
  };
}

function makeProposedItem(overrides = {}) {
  return {
    id: "intel_proposed_001",
    basketId: BASKET,
    assignedAgent: AGENT,
    title: "TEM new note",
    status: INTELLIGENCE_STATUS.DRAFT,
    approvedByUser: false,
    createdAt: 1_710_000_000_000,
    updatedAt: 1_710_000_000_000,
    entities: { primarySymbols: ["TEM"], relatedSymbols: [], privateCompanies: [] },
    thesis: { coreClaim: null, marketFrame: null, companyRole: null, basketRole: null },
    risks: [],
    catalysts: [],
    scannerTags: [],
    ...overrides,
  };
}

// ============================================================
group("[1] proposed confirming evidence → STRENGTHENING");
// ============================================================

const evStrong = evaluateThesisHealth({
  basketId: BASKET, agentId: AGENT, symbol: "TEM",
  approvedMemory: makeApprovedMemoryItem(),
  proposedIntelligence: makeProposedItem({
    catalysts: [
      "Pharma partnership",
      "Hospital adoption / expansion",
      "Diagnostics revenue growth",
    ],
    risks: [],
  }),
});
assert("[1] status = STRENGTHENING",                       evStrong.status === THESIS_HEALTH_STATUS.STRENGTHENING);
assert("[1] confirming bucket has 3 entries",              evStrong.confirmingEvidence.length === 3);
assert("[1] challenging bucket is empty",                  evStrong.challengingEvidence.length === 0);
assert("[1] suggestedAction = NO_CHANGE",                  evStrong.suggestedAction === THESIS_HEALTH_ACTION.NO_CHANGE);
assert("[1] confidence = MEDIUM (3 evidence items)",       evStrong.confidenceLabel === THESIS_HEALTH_CONFIDENCE.MEDIUM);
assert("[1] summary mentions 'strengthening'",
  /strengthening/i.test(evStrong.summary));
assert("[1] recommendation surfaces 'No engine action'",
  /no engine action|monitoring|supports the approved/i.test(evStrong.recommendation));

// ============================================================
group("[2] reimbursement / incumbent pressure → WEAKENING");
// ============================================================

const evWeak = evaluateThesisHealth({
  basketId: BASKET,
  approvedMemory: makeApprovedMemoryItem(),
  proposedIntelligence: makeProposedItem({
    risks: [
      "Reimbursement pressure",
      "Incumbent pressure / competition",
      "Cash / runway risk",
    ],
    catalysts: [],
  }),
});
assert("[2] status = WEAKENING",                           evWeak.status === THESIS_HEALTH_STATUS.WEAKENING);
assert("[2] challenging bucket has 3 entries",             evWeak.challengingEvidence.length === 3);
assert("[2] confirming bucket is empty",                   evWeak.confirmingEvidence.length === 0);
assert("[2] suggestedAction = REVIEW_CONCERN",             evWeak.suggestedAction === THESIS_HEALTH_ACTION.REVIEW_CONCERN);
assert("[2] confidence = MEDIUM",                          evWeak.confidenceLabel === THESIS_HEALTH_CONFIDENCE.MEDIUM);

// ============================================================
group("[3] mixed evidence → CONFLICTING");
// ============================================================

const evMixed = evaluateThesisHealth({
  basketId: BASKET,
  approvedMemory: makeApprovedMemoryItem(),
  proposedIntelligence: makeProposedItem({
    catalysts: ["Pharma partnership", "AI infrastructure expansion"],
    risks: ["Execution risk", "Reimbursement pressure"],
  }),
});
assert("[3] status = CONFLICTING",                         evMixed.status === THESIS_HEALTH_STATUS.CONFLICTING);
assert("[3] confirming bucket >= 1",                       evMixed.confirmingEvidence.length >= 1);
assert("[3] challenging bucket >= 1",                      evMixed.challengingEvidence.length >= 1);
assert("[3] suggestedAction = REVIEW_UPDATE",              evMixed.suggestedAction === THESIS_HEALTH_ACTION.REVIEW_UPDATE);
assert("[3] confidence = HIGH (4 evidence items)",         evMixed.confidenceLabel === THESIS_HEALTH_CONFIDENCE.HIGH);

// ============================================================
group("[4] empty proposed + approved memory → UNCHANGED");
// ============================================================

const evUnchanged = evaluateThesisHealth({
  basketId: BASKET,
  approvedMemory: makeApprovedMemoryItem(),
  proposedIntelligence: [],
});
assert("[4] status = UNCHANGED",                           evUnchanged.status === THESIS_HEALTH_STATUS.UNCHANGED);
assert("[4] confidence = UNAVAILABLE",                     evUnchanged.confidenceLabel === THESIS_HEALTH_CONFIDENCE.UNAVAILABLE);
assert("[4] confirmingEvidence is empty",                  evUnchanged.confirmingEvidence.length === 0);
assert("[4] challengingEvidence is empty",                 evUnchanged.challengingEvidence.length === 0);
assert("[4] updatedAt = approved-memory updatedAt",        evUnchanged.updatedAt === 1_700_000_000_000);

// ============================================================
group("[5] empty proposed + no memory → INSUFFICIENT_EVIDENCE");
// ============================================================

const evNone = evaluateThesisHealth({
  basketId: BASKET,
  approvedMemory: [],
  proposedIntelligence: [],
});
assert("[5] status = INSUFFICIENT_EVIDENCE",               evNone.status === THESIS_HEALTH_STATUS.INSUFFICIENT_EVIDENCE);
assert("[5] suggestedAction = GATHER_MORE",                evNone.suggestedAction === THESIS_HEALTH_ACTION.GATHER_MORE);
assert("[5] recommendation prompts to baseline thesis",
  /No approved thesis on file|baseline|initial thesis/i.test(evNone.recommendation));

// ============================================================
group("[6] risk_elevated posture surfaces as challenging");
// ============================================================

const evRisky = evaluateThesisHealth({
  basketId: BASKET,
  approvedMemory: makeApprovedMemoryItem(),
  proposedIntelligence: [],
  agentInsight: {
    posture: POSTURE.RISK_ELEVATED,
    verdict: VERDICT.AVOID_OR_WAIT,
    constructiveManagerCount: 0,
    cautiousManagerCount: 2,
  },
});
assert("[6] status = WEAKENING (engine pushed into challenging)",
  evRisky.status === THESIS_HEALTH_STATUS.WEAKENING);
assert("[6] challenging includes 'Engine posture: risk elevated'",
  evRisky.challengingEvidence.some((e) => /risk elevated/i.test(e.label)));
assert("[6] challenging includes 'Engine verdict: avoid / wait'",
  evRisky.challengingEvidence.some((e) => /avoid.*wait/i.test(e.label)));
assert("[6] engine-origin items are tagged origin = engine",
  evRisky.challengingEvidence
    .filter((e) => /engine/i.test(e.label))
    .every((e) => e.origin === "engine"));

// Even with supportive memory in the input, posture stays the
// challenging signal (engine drives, memory does not override).
const evRiskyWithSupportiveProposed = evaluateThesisHealth({
  basketId: BASKET,
  approvedMemory: makeApprovedMemoryItem(),
  proposedIntelligence: makeProposedItem({
    catalysts: ["Pharma partnership"],
  }),
  agentInsight: {
    posture: POSTURE.RISK_ELEVATED,
    verdict: VERDICT.AVOID_OR_WAIT,
  },
});
assert("[6] supportive proposed + risk_elevated → CONFLICTING (memory does not override engine)",
  evRiskyWithSupportiveProposed.status === THESIS_HEALTH_STATUS.CONFLICTING);

// ============================================================
group("[7] confirming map routes Pharma partnership / Hospital adoption");
// ============================================================

const ev7 = evaluateThesisHealth({
  basketId: BASKET,
  approvedMemory: makeApprovedMemoryItem(),
  proposedIntelligence: makeProposedItem({
    catalysts: ["Pharma partnership", "Hospital adoption / expansion"],
  }),
});
assert("[7] confirming includes Pharma partnership",
  ev7.confirmingEvidence.some((e) => e.label === "Pharma partnership"));
assert("[7] confirming includes Hospital adoption / expansion",
  ev7.confirmingEvidence.some((e) => e.label === "Hospital adoption / expansion"));

// ============================================================
group("[8] challenging map routes Reimbursement pressure / Incumbent pressure");
// ============================================================

const ev8 = evaluateThesisHealth({
  basketId: BASKET,
  approvedMemory: makeApprovedMemoryItem(),
  proposedIntelligence: makeProposedItem({
    risks: ["Reimbursement pressure", "Incumbent pressure / competition"],
  }),
});
assert("[8] challenging includes Reimbursement pressure",
  ev8.challengingEvidence.some((e) => e.label === "Reimbursement pressure"));
assert("[8] challenging includes Incumbent pressure / competition",
  ev8.challengingEvidence.some((e) => e.label === "Incumbent pressure / competition"));

// ============================================================
group("[9] neutral labels do NOT move the verdict");
// ============================================================

const ev9 = evaluateThesisHealth({
  basketId: BASKET,
  approvedMemory: makeApprovedMemoryItem(),
  proposedIntelligence: makeProposedItem({
    catalysts: ["Earnings catalyst", "Clinical / trial readout"],
    risks: ["Elevated volatility"],
  }),
});
assert("[9] neutral bucket includes Earnings catalyst",
  ev9.neutralEvidence.some((e) => e.label === "Earnings catalyst"));
assert("[9] neutral bucket includes Clinical / trial readout",
  ev9.neutralEvidence.some((e) => e.label === "Clinical / trial readout"));
assert("[9] neutral bucket includes Elevated volatility",
  ev9.neutralEvidence.some((e) => e.label === "Elevated volatility"));
assert("[9] confirming bucket is empty for neutral-only proposed",
  ev9.confirmingEvidence.length === 0);
assert("[9] challenging bucket is empty for neutral-only proposed",
  ev9.challengingEvidence.length === 0);
assert("[9] status = UNCHANGED with only neutral evidence",
  ev9.status === THESIS_HEALTH_STATUS.UNCHANGED);

// ============================================================
group("[10] confidence label ladder");
// ============================================================

function confidenceFor(catalystCount, riskCount) {
  return evaluateThesisHealth({
    basketId: BASKET,
    approvedMemory: makeApprovedMemoryItem(),
    proposedIntelligence: makeProposedItem({
      catalysts: Array.from({ length: catalystCount }, (_, i) =>
        ["Pharma partnership", "AI infrastructure expansion", "Diagnostics revenue growth", "Hospital adoption / expansion", "ARK accumulation"][i] || "Pharma partnership",
      ),
      risks: Array.from({ length: riskCount }, (_, i) =>
        ["Execution risk", "Reimbursement pressure", "Incumbent pressure / competition"][i] || "Execution risk",
      ),
    }),
  }).confidenceLabel;
}
assert("[10] 0 evidence → UNAVAILABLE",  confidenceFor(0, 0) === THESIS_HEALTH_CONFIDENCE.UNAVAILABLE);
assert("[10] 1 evidence → LOW",          confidenceFor(1, 0) === THESIS_HEALTH_CONFIDENCE.LOW);
assert("[10] 2 evidence → MEDIUM",       confidenceFor(2, 0) === THESIS_HEALTH_CONFIDENCE.MEDIUM);
assert("[10] 3 evidence → MEDIUM",       confidenceFor(3, 0) === THESIS_HEALTH_CONFIDENCE.MEDIUM);
assert("[10] 4 evidence → HIGH",         confidenceFor(4, 0) === THESIS_HEALTH_CONFIDENCE.HIGH);
assert("[10] 5 evidence → HIGH",         confidenceFor(5, 0) === THESIS_HEALTH_CONFIDENCE.HIGH);

// ============================================================
group("[11] panel renders approved thesis + summary");
// ============================================================

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");
const { default: ThesisHealthPanel } =
  await import("../src/components/portfolioCio/ThesisHealthPanel.jsx");

function renderSafe(props) {
  try { return { ok: true, html: renderToStaticMarkup(createElement(ThesisHealthPanel, props)) }; }
  catch (err) { return { ok: false, err }; }
}

const renderStrong = renderSafe({
  basketId: BASKET, agentId: AGENT, symbol: "TEM",
  approvedMemory: makeApprovedMemoryItem(),
  proposedIntelligence: makeProposedItem({
    catalysts: ["Pharma partnership", "Hospital adoption / expansion", "Diagnostics revenue growth"],
  }),
});
assert("[11] panel renders without throwing",        renderStrong.ok, renderStrong.err?.message);
assert("[11] HTML mentions 'CURRENT APPROVED THESIS'",
  renderStrong.ok && /CURRENT APPROVED THESIS/.test(renderStrong.html));
assert("[11] HTML carries the operator's coreClaim verbatim",
  renderStrong.ok && /TEM may be the bridge between AI, diagnostics/.test(renderStrong.html));
assert("[11] HTML shows status chip 'Thesis strengthening'",
  renderStrong.ok && /Thesis strengthening/.test(renderStrong.html));
assert("[11] HTML shows summary line",
  renderStrong.ok && /confirming/i.test(renderStrong.html));

// ============================================================
group("[12] panel surfaces the no-override disclaimer");
// ============================================================

assert("[12] disclaimer text is rendered",
  renderStrong.ok && /Thesis Health enriches market context only/i.test(renderStrong.html));
assert("[12] disclaimer mentions scanner verdicts / Credit View / Trigger Engine",
  renderStrong.ok &&
  /scanner verdicts/i.test(renderStrong.html) &&
  /Credit View/i.test(renderStrong.html) &&
  /Trigger Engine/i.test(renderStrong.html));

// ============================================================
group("[13] panel renders confirming + challenging buckets");
// ============================================================

const renderMixed = renderSafe({
  basketId: BASKET, agentId: AGENT,
  approvedMemory: makeApprovedMemoryItem(),
  proposedIntelligence: makeProposedItem({
    catalysts: ["Pharma partnership"],
    risks: ["Reimbursement pressure"],
  }),
});
assert("[13] HTML lists CONFIRMING + CHALLENGING + NEUTRAL bucket headers",
  renderMixed.ok &&
  /CONFIRMING ·/.test(renderMixed.html) &&
  /CHALLENGING ·/.test(renderMixed.html) &&
  /NEUTRAL .* WATCH ·/.test(renderMixed.html));
assert("[13] HTML mentions Pharma partnership in the confirming bucket",
  renderMixed.ok && /Pharma partnership/.test(renderMixed.html));
assert("[13] HTML mentions Reimbursement pressure in the challenging bucket",
  renderMixed.ok && /Reimbursement pressure/.test(renderMixed.html));

// ============================================================
group("[14] panel does NOT mutate memory without callbacks");
// ============================================================

reset();
const stored = saveIntelligenceDraft({
  basketId: BASKET,
  assignedAgent: AGENT,
  title: "Live thesis baseline",
  thesis: { coreClaim: "Baseline thesis claim", basketRole: "AI Health Bridge" },
  catalysts: ["Pharma partnership"],
  risks: [],
  entities: { primarySymbols: ["TEM"], relatedSymbols: [], privateCompanies: [] },
});
promoteToAgentMemory(stored.id);
const memBefore = getBasketMemory(BASKET).length;
const draftBefore = listIntelligenceItems().filter((it) =>
  it.status === INTELLIGENCE_STATUS.DRAFT).length;

// Render the panel WITHOUT any callbacks. Buttons should be inert.
const renderInert = renderSafe({
  basketId: BASKET, agentId: AGENT,
  approvedMemory: getBasketMemory(BASKET),
  proposedIntelligence: [],
});
assert("[14] inert panel renders without throwing", renderInert.ok, renderInert.err?.message);
const memAfter = getBasketMemory(BASKET).length;
const draftAfter = listIntelligenceItems().filter((it) =>
  it.status === INTELLIGENCE_STATUS.DRAFT).length;
assert("[14] approved memory count unchanged", memAfter === memBefore);
assert("[14] draft count unchanged",            draftAfter === draftBefore);

// ============================================================
group("[15] no raw scoring tokens in HTML or evaluation JSON");
// ============================================================

const probesHtml = [renderStrong.html || "", renderMixed.html || "", renderInert.html || ""];
for (const [i, html] of probesHtml.entries()) {
  assert(`[15] HTML probe[${i}] no \"score\":N`,         !/"score"\s*:\s*-?\d/.test(html));
  assert(`[15] HTML probe[${i}] no \"weight\":N`,        !/"weight"\s*:/.test(html));
  assert(`[15] HTML probe[${i}] no coefficient token`,   !/coefficient/i.test(html));
  assert(`[15] HTML probe[${i}] no \"w_\" prefix`,       !/"w_/.test(html));
  assert(`[15] HTML probe[${i}] no '_rank' token`,       !/_rank/.test(html));
}

const evalJson = JSON.stringify(evMixed);
assert("[15] evaluation JSON has no _rank token",       !/"_rank"/.test(evalJson));
assert("[15] evaluation JSON has no \"score\":N",       !/"score"\s*:\s*-?\d/.test(evalJson));
assert("[15] evaluation JSON has no \"weight\":N",      !/"weight"\s*:/.test(evalJson));
assert("[15] evaluation JSON has no coefficient token", !/coefficient/i.test(evalJson));
assert("[15] evaluation JSON has no \"w_\" prefix",     !/"w_/.test(evalJson));

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
resetMemoryBackend();
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
