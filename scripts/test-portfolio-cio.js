#!/usr/bin/env node
// =====================================================
// Portfolio CIO — Manager Assessment Tape tests
// Run: npm run test:portfolio-cio
//
// Acceptance gates per spec:
//   1. assessment object produced for each available subagent.
//   2. missing subagent produces unavailable assessment.
//   3. all required subagents appear in tape even when unavailable.
//   4. CIO detects Market Intelligence + CV thesis-vs-timing conflict.
//   5. CIO detects CV-attractive + TE-breakdown conflict.
//   6. CIO detects Basket + Risk Manager risk-vs-opportunity conflict.
//   7. Risk Manager override appears in overrideReason.
//   8. Calibration watch is created when CV caution conflicts with
//      constructive TE/Market Intelligence.
//   9. Calibration watch is created when CIO downgrades due to
//      concentration.
//  10. Calibration watch can use recent history outcome missed_winner
//      as over-conservatism clue.
//  11. Calibration watch can use recent history outcome
//      avoided_correctly as caution-validation clue.
//  12. No raw scores or weights appear in manager assessment tape output.
//  13–17. UI render — agent name/role/stance/confidence/evidence/
//      concerns/missing evidence; conflicts; override; calibration watch;
//      unavailable cards.
// =====================================================

import { register } from "node:module";
register("./jsx-hooks.mjs", import.meta.url);

import {
  buildManagerAssessmentTape,
} from "../src/lib/portfolioCio/managerAssessmentTape.js";
import {
  REQUIRED_AGENTS,
  STANCE,
  CONFIDENCE,
  RECOMMENDED_ACTION,
  TIME_HORIZON,
  CONFLICT_TYPE,
  makeUnavailableAssessment,
} from "../src/lib/portfolioCio/managerAssessmentTypes.js";

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

// Fixtures — minimum viable assessments per agent.
const basketConstructive = {
  agentName: "Storage / Memory Basket Agent",
  assessmentLabel: "Emerging leader",
  stance: STANCE.CONSTRUCTIVE,
  confidenceLabel: CONFIDENCE.MODERATE,
  evidenceSummary: "Ticker fits the Storage / Memory mandate and is participating in AI infrastructure repricing.",
  supportingEvidence: ["Theme alignment", "Leadership versus basket peers"],
  concernFlags: ["Storage cycle is cyclical"],
  missingEvidence: ["Need TE structure confirmation"],
  recommendedAction: RECOMMENDED_ACTION.SEND_TO_TE_AND_CV,
  routeRecommendation: "Validate structure and premium before sizing.",
  timeHorizonBias: TIME_HORIZON.NEAR_TERM,
};
const marketIntelConstructive = {
  stance: STANCE.CONSTRUCTIVE,
  confidenceLabel: CONFIDENCE.HIGH,
  assessmentLabel: "Theme repricing in progress",
  evidenceSummary: "Institutional flow and news cycle support the AI infrastructure thesis.",
  supportingEvidence: ["Positive analyst notes", "Sector rotation underway"],
  recommendedAction: RECOMMENDED_ACTION.PROCEED,
  timeHorizonBias: TIME_HORIZON.LONG_TERM,
};
const teConstructive = {
  stance: STANCE.CONSTRUCTIVE,
  confidenceLabel: CONFIDENCE.MODERATE,
  assessmentLabel: "Structure intact above support",
  evidenceSummary: "Price holding above key support; ATR contained.",
  supportingEvidence: ["Above 50-day MA", "Demand zone holding"],
  recommendedAction: RECOMMENDED_ACTION.PROCEED,
  timeHorizonBias: TIME_HORIZON.NEAR_TERM,
};
const teBearish = {
  stance: STANCE.BEARISH,
  confidenceLabel: CONFIDENCE.HIGH,
  assessmentLabel: "Breakdown risk",
  evidenceSummary: "Price has lost the 50-day MA and is testing prior pivot lows.",
  concernFlags: ["Failed bounce", "Supply zone overhead"],
  recommendedAction: RECOMMENDED_ACTION.AVOID_FOR_NOW,
  timeHorizonBias: TIME_HORIZON.SHORT_TERM,
};
const cvCautious = {
  stance: STANCE.CAUTIOUS,
  confidenceLabel: CONFIDENCE.MODERATE,
  assessmentLabel: "Premium not ready",
  evidenceSummary: "Spread quality and premium floor do not support an income trade yet.",
  concernFlags: ["Spread quality is wide", "Premium does not meet floor"],
  recommendedAction: RECOMMENDED_ACTION.WAIT_FOR_CONFIRMATION,
  timeHorizonBias: TIME_HORIZON.SHORT_TERM,
  calibrationFlag: "Review if rejected setup later becomes profitable.",
};
const cvConstructive = {
  stance: STANCE.CONSTRUCTIVE,
  confidenceLabel: CONFIDENCE.MODERATE,
  assessmentLabel: "Premium attractive",
  evidenceSummary: "Premium is above floor and spread is tight.",
  supportingEvidence: ["A-grade spread", "Premium >10th percentile"],
  recommendedAction: RECOMMENDED_ACTION.PROCEED,
};
const riskCautious = {
  stance: STANCE.CAUTIOUS,
  confidenceLabel: CONFIDENCE.HIGH,
  assessmentLabel: "Size down",
  evidenceSummary: "AI infrastructure exposure is already elevated.",
  concernFlags: ["Concentration risk", "Theme crowding risk"],
  recommendedAction: RECOMMENDED_ACTION.REDUCE_SIZE,
  timeHorizonBias: TIME_HORIZON.MIXED,
};
const macroConstructive = {
  stance: STANCE.CONSTRUCTIVE,
  confidenceLabel: CONFIDENCE.MODERATE,
  assessmentLabel: "Risk-on regime",
  recommendedAction: RECOMMENDED_ACTION.PROCEED,
  timeHorizonBias: TIME_HORIZON.LONG_TERM,
};
const capitalConstructive = {
  stance: STANCE.CONSTRUCTIVE,
  confidenceLabel: CONFIDENCE.HIGH,
  assessmentLabel: "Sizing fits",
  recommendedAction: RECOMMENDED_ACTION.PROCEED,
};
const lethalConstructive = {
  stance: STANCE.CONSTRUCTIVE,
  confidenceLabel: CONFIDENCE.MODERATE,
  assessmentLabel: "Capital-fit prospect",
  recommendedAction: RECOMMENDED_ACTION.ADD_TO_ACTIVE_UNIVERSE,
};
const rotationConstructive = {
  stance: STANCE.CONSTRUCTIVE,
  confidenceLabel: CONFIDENCE.MODERATE,
  assessmentLabel: "Theme rotation supportive",
  recommendedAction: RECOMMENDED_ACTION.PROCEED,
};

function fullInputs(overrides = {}) {
  return {
    basket: basketConstructive,
    market_intel: marketIntelConstructive,
    lethal_board: lethalConstructive,
    trigger_engine: teConstructive,
    credit_view: cvConstructive,
    risk_manager: capitalConstructive,
    capital_allocation: capitalConstructive,
    macro_regime: macroConstructive,
    institutional_rotation: rotationConstructive,
    ...overrides,
  };
}

// ============================================================
group("[1] assessment object produced for each available subagent");
// ============================================================

const tape1 = buildManagerAssessmentTape({ symbol: "TEST", inputs: fullInputs() });
assert("symbol echoed back",                tape1.symbol === "TEST");
assert("9 assessments produced",            tape1.assessments.length === 9);
for (const a of tape1.assessments) {
  assert(`agentId present: ${a.agentId}`,                typeof a.agentId === "string" && a.agentId.length > 0);
  assert(`agentName present: ${a.agentId}`,              typeof a.agentName === "string" && a.agentName.length > 0);
  assert(`agentRole present: ${a.agentId}`,              typeof a.agentRole === "string" && a.agentRole.length > 0);
  assert(`stance is a valid enum: ${a.agentId}`,         Object.values(STANCE).includes(a.stance));
  assert(`confidenceLabel valid enum: ${a.agentId}`,     Object.values(CONFIDENCE).includes(a.confidenceLabel));
  assert(`recommendedAction valid enum: ${a.agentId}`,   Object.values(RECOMMENDED_ACTION).includes(a.recommendedAction));
  assert(`timeHorizonBias valid enum: ${a.agentId}`,     Object.values(TIME_HORIZON).includes(a.timeHorizonBias));
  assert(`supportingEvidence is array: ${a.agentId}`,    Array.isArray(a.supportingEvidence));
  assert(`concernFlags is array: ${a.agentId}`,          Array.isArray(a.concernFlags));
  assert(`missingEvidence is array: ${a.agentId}`,       Array.isArray(a.missingEvidence));
}

// ============================================================
group("[2] missing subagent produces unavailable assessment");
// ============================================================

const tape2 = buildManagerAssessmentTape({ symbol: "TEST", inputs: { basket: basketConstructive } });
const cv2 = tape2.assessments.find((a) => a.agentId === "credit_view");
assert("CV is present even when not supplied",       !!cv2);
assert("CV stance = unavailable",                    cv2.stance === STANCE.UNAVAILABLE);
assert("CV confidence = unavailable",                cv2.confidenceLabel === CONFIDENCE.UNAVAILABLE);
assert("CV assessmentLabel = 'Insufficient evidence'", cv2.assessmentLabel === "Insufficient evidence");
assert("CV evidenceSummary explains absence",
  /not produced a read/i.test(cv2.evidenceSummary || ""));
assert("CV missingEvidence flags 'Manager input unavailable'",
  cv2.missingEvidence.includes("Manager input unavailable"));
assert("CV recommendedAction = insufficient_evidence",
  cv2.recommendedAction === RECOMMENDED_ACTION.INSUFFICIENT_EVIDENCE);

// ============================================================
group("[3] all required subagents appear even when all unavailable");
// ============================================================

const tape3 = buildManagerAssessmentTape({ symbol: "VOID", inputs: {} });
assert("9 assessments still produced",         tape3.assessments.length === 9);
const ids3 = tape3.assessments.map((a) => a.agentId).sort();
const required3 = REQUIRED_AGENTS.map((a) => a.agentId).sort();
assert("all required agentIds present",        ids3.join("|") === required3.join("|"));
assert("all stances are unavailable",
  tape3.assessments.every((a) => a.stance === STANCE.UNAVAILABLE));
assert("missing_evidence conflict fires when 4+ unavailable",
  tape3.managerConflicts.some((c) => c.conflictType === CONFLICT_TYPE.MISSING_EVIDENCE));
assert("CIO recommendation falls back to insufficient_evidence",
  tape3.cioRecommendation.action === RECOMMENDED_ACTION.INSUFFICIENT_EVIDENCE);

// ============================================================
group("[4] thesis_vs_timing conflict — Market Intel + CV");
// ============================================================

const tape4 = buildManagerAssessmentTape({
  symbol: "TEST",
  inputs: fullInputs({
    market_intel: marketIntelConstructive,
    credit_view: cvCautious,
  }),
});
const c4 = tape4.managerConflicts.find((c) => c.conflictType === CONFLICT_TYPE.THESIS_VS_TIMING);
assert("thesis_vs_timing conflict detected",                 !!c4);
assert("agentsInConflict includes market_intel and credit_view",
  c4.agentsInConflict.includes("market_intel") && c4.agentsInConflict.includes("credit_view"));
assert("cioInterpretation matches spec phrasing",
  /Long-term thesis may be valid, but short-term premium trade is not ready/.test(c4.cioInterpretation));

// ============================================================
group("[5] premium_vs_structure conflict — CV + TE");
// ============================================================

const tape5 = buildManagerAssessmentTape({
  symbol: "TEST",
  inputs: fullInputs({
    credit_view: cvConstructive,
    trigger_engine: teBearish,
  }),
});
const c5 = tape5.managerConflicts.find((c) => c.conflictType === CONFLICT_TYPE.PREMIUM_VS_STRUCTURE);
assert("premium_vs_structure conflict detected", !!c5);
assert("cioInterpretation mentions 'premium may be a trap'",
  /premium may be a trap/i.test(c5.cioInterpretation));

// ============================================================
group("[6] risk_vs_opportunity conflict — Basket + Risk Manager");
// ============================================================

const tape6 = buildManagerAssessmentTape({
  symbol: "TEST",
  inputs: fullInputs({
    basket: basketConstructive,
    risk_manager: riskCautious,
  }),
});
const c6 = tape6.managerConflicts.find((c) => c.conflictType === CONFLICT_TYPE.RISK_VS_OPPORTUNITY);
assert("risk_vs_opportunity conflict detected", !!c6);
assert("cioInterpretation mentions 'sizing should be reduced'",
  /sizing should be reduced/i.test(c6.cioInterpretation));

// ============================================================
group("[7] Risk Manager override appears in overrideReason");
// ============================================================

assert("tape6 overrideReason set",                    typeof tape6.overrideReason === "string" && tape6.overrideReason.length > 0);
assert("override mentions Risk Manager + concentration",
  /Risk Manager.*concentration/i.test(tape6.overrideReason));
assert("CIO action downgraded to reduce_size",
  tape6.cioRecommendation.action === RECOMMENDED_ACTION.REDUCE_SIZE);

// ============================================================
group("[8] Calibration watch — CV caution vs constructive TE/Market Intel");
// ============================================================

const tape8 = buildManagerAssessmentTape({
  symbol: "TEST",
  inputs: fullInputs({
    credit_view: cvCautious,
    trigger_engine: teConstructive,
    market_intel: marketIntelConstructive,
  }),
});
const w8 = tape8.calibrationWatch;
assert("calibrationNeeded = true",                   w8.calibrationNeeded === true);
assert("reason mentions CV cautious + constructive TE/MI",
  /CV is cautious.*constructive/i.test(w8.calibrationReason));
assert("reviewAfter = '5_trading_days'",             w8.reviewAfter === "5_trading_days");
assert("watchMetric is non-empty",                   typeof w8.watchMetric === "string" && w8.watchMetric.length > 0);

// ============================================================
group("[9] Calibration watch — concentration override");
// ============================================================

const w9 = tape6.calibrationWatch;
assert("calibrationNeeded = true (from concentration)", w9.calibrationNeeded === true);
assert("reason mentions concentration",                  /concentration/i.test(w9.calibrationReason));

// ============================================================
group("[10] history clue — missed_winner suggests over-conservatism");
// ============================================================

const tape10 = buildManagerAssessmentTape({
  symbol: "TEST",
  inputs: fullInputs({ credit_view: cvCautious }),
  history: { outcome: { status: "missed_winner" } },
});
const w10 = tape10.calibrationWatch;
assert("calibrationNeeded = true",        w10.calibrationNeeded === true);
assert("clueFromHistory mentions over-conservatism",
  /missed winner|over.conservative/i.test(w10.clueFromHistory || ""));
assert("calibrationReason includes the history clue",
  /missed winner/i.test(w10.calibrationReason || ""));

// ============================================================
group("[11] history clue — avoided_correctly validates caution");
// ============================================================

const tape11 = buildManagerAssessmentTape({
  symbol: "TEST",
  inputs: fullInputs({ credit_view: cvCautious, trigger_engine: teConstructive, market_intel: marketIntelConstructive }),
  history: { outcome: { status: "avoided_correctly" } },
});
const w11 = tape11.calibrationWatch;
assert("clueFromHistory present", !!w11.clueFromHistory);
assert("clueFromHistory cites avoided correctly / invalidated",
  /avoided correctly|invalidated|caution may have been appropriate/i.test(w11.clueFromHistory));

// ============================================================
group("[12] no raw scores or weights leak in tape output");
// ============================================================

const blob12 = JSON.stringify(tape1);
assert("no \"score\" field present",      !/"score"\s*:\s*-?\d/.test(blob12));
assert("no \"weight\" / w_ token present", !/"weight"|"w_/.test(blob12));
assert("no \"coefficient\" token present", !/"coefficient/i.test(blob12));

// ============================================================
group("[13–17] UI render — components mount under JSX loader");
// ============================================================

const { default: ManagerAssessmentTape } =
  await import("../src/components/portfolioCio/ManagerAssessmentTape.jsx");
const { default: ManagerAssessmentCard } =
  await import("../src/components/portfolioCio/ManagerAssessmentCard.jsx");
const { default: CioConflictSummary } =
  await import("../src/components/portfolioCio/CioConflictSummary.jsx");
const { default: CioCalibrationWatch } =
  await import("../src/components/portfolioCio/CioCalibrationWatch.jsx");

const { renderToStaticMarkup } = await import("react-dom/server");
const { createElement } = await import("react");

function renderSafe(name, Component, props) {
  try {
    const html = renderToStaticMarkup(createElement(Component, props));
    return { ok: typeof html === "string", html };
  } catch (err) {
    return { ok: false, err };
  }
}

// [13] ManagerAssessmentCard with a populated assessment.
const cardRender = renderSafe("ManagerAssessmentCard", ManagerAssessmentCard, {
  assessment: {
    ...makeUnavailableAssessment(REQUIRED_AGENTS[0]),
    agentName: "Storage / Memory Basket Agent",
    agentRole: "Determines whether the ticker belongs in the basket and whether it is leading, lagging, fading, or emerging.",
    stance: STANCE.CONSTRUCTIVE,
    confidenceLabel: CONFIDENCE.MODERATE,
    assessmentLabel: "Emerging leader",
    evidenceSummary: "Ticker fits the Storage / Memory mandate.",
    supportingEvidence: ["Theme alignment", "Leadership versus peers"],
    concernFlags: ["Cyclical risk"],
    missingEvidence: ["Need TE confirmation"],
    recommendedAction: RECOMMENDED_ACTION.SEND_TO_TE_AND_CV,
    timeHorizonBias: TIME_HORIZON.NEAR_TERM,
    routeRecommendation: "Validate before allocation.",
  },
});
assert("[13] card renders without throwing", cardRender.ok, cardRender.err?.message);
assert("[13] card includes agentName",       /Storage \/ Memory Basket Agent/.test(cardRender.html || ""));
assert("[13] card includes agentRole",       /Determines whether the ticker belongs/.test(cardRender.html || ""));
assert("[13] card includes stance label",    /Constructive/.test(cardRender.html || ""));
assert("[13] card includes confidence",      /Moderate confidence/.test(cardRender.html || ""));
assert("[13] card includes evidence summary",
  /Storage \/ Memory mandate/.test(cardRender.html || ""));
assert("[13] card includes concern bullet",  /Cyclical risk/.test(cardRender.html || ""));
assert("[13] card includes missing evidence bullet",
  /Need TE confirmation/.test(cardRender.html || ""));
assert("[13] card includes recommended action label",
  /Send to TE \+ CV/.test(cardRender.html || ""));

// [14] Conflict summary
const conflictsRender = renderSafe("CioConflictSummary", CioConflictSummary, {
  consensus: tape4.managerConsensus,
  conflicts: tape4.managerConflicts,
  overrideReason: tape4.overrideReason,
});
assert("[14] conflicts renders without throwing", conflictsRender.ok, conflictsRender.err?.message);
assert("[14] consensus surfaced",               /MANAGER CONSENSUS/.test(conflictsRender.html || ""));
assert("[14] thesis_vs_timing chip surfaces",
  /Conflict Detected.*Thesis vs Timing/i.test(conflictsRender.html || ""));
assert("[14] CIO interpretation surfaces",
  /Long-term thesis may be valid/.test(conflictsRender.html || ""));

// [15] Override banner via the same component
const conflicts15 = renderSafe("CioConflictSummary", CioConflictSummary, {
  consensus: tape6.managerConsensus,
  conflicts: tape6.managerConflicts,
  overrideReason: tape6.overrideReason,
});
assert("[15] override banner renders",          conflicts15.ok && /CIO OVERRIDE/.test(conflicts15.html || ""));
assert("[15] override copy mentions Risk Manager",
  /Risk Manager.*concentration/i.test(conflicts15.html || ""));

// [16] Calibration watch
const calibRender = renderSafe("CioCalibrationWatch", CioCalibrationWatch, {
  watch: tape8.calibrationWatch,
});
assert("[16] calibration watch renders",        calibRender.ok, calibRender.err?.message);
assert("[16] flag-active chip visible",         /FLAG ACTIVE/.test(calibRender.html || ""));
assert("[16] reason text visible",
  /CV is cautious|TE and Market Intelligence are constructive/.test(calibRender.html || ""));

// [17] Unavailable manager card
const unavCard = renderSafe("ManagerAssessmentCard (unavailable)", ManagerAssessmentCard, {
  assessment: makeUnavailableAssessment(REQUIRED_AGENTS[3]),
});
assert("[17] unavailable card renders",          unavCard.ok, unavCard.err?.message);
assert("[17] unavailable label visible",
  /Insufficient evidence/.test(unavCard.html || ""));
assert("[17] 'not produced a read' copy visible",
  /not produced a read/i.test(unavCard.html || ""));
assert("[17] 'Manager input unavailable' bullet visible",
  /Manager input unavailable/.test(unavCard.html || ""));

// [Bonus] ManagerAssessmentTape mounts end-to-end with a full tape.
const tapeRender = renderSafe("ManagerAssessmentTape", ManagerAssessmentTape, { tape: tape4 });
assert("[Bonus] tape renders end-to-end",       tapeRender.ok, tapeRender.err?.message);
assert("[Bonus] tape shows CIO Final Recommendation",
  /CIO FINAL RECOMMENDATION/.test(tapeRender.html || ""));
assert("[Bonus] tape shows Manager Assessment Tape header",
  /MANAGER ASSESSMENT TAPE/.test(tapeRender.html || ""));
assert("[Bonus] tape shows Calibration Watch header",
  /CALIBRATION WATCH/.test(tapeRender.html || ""));

// ============================================================
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  Failures:\n    ${failures.join("\n    ")}`);
  process.exit(1);
}
