// =====================================================================
// Research Automation Contract
// =====================================================================
// PURE function. Translates a saved AgentResearchSettings record into
// an operator-safe plan object the UI can render verbatim. Used by the
// configurator's "plan summary" panel after Save and by any future
// surface that wants to describe the automation without exposing the
// raw stored record.
//
// Hard rules:
//   - No raw scoring tokens / cron syntax / queue ids / scheduler
//     internals.
//   - No raw memory JSON.
//   - The plan is a description of intent. It does not start any
//     research, schedule any jobs, or override any engine field.
// =====================================================================

import {
  RESEARCH_FREQUENCY,
  RESEARCH_SOURCE,
  RESEARCH_OUTPUT,
} from "./agentResearchSettingsStore.js";

const FREQUENCY_LABELS = Object.freeze({
  [RESEARCH_FREQUENCY.MANUAL_ONLY]:   "Manual only",
  [RESEARCH_FREQUENCY.DAILY]:         "Daily",
  [RESEARCH_FREQUENCY.WEEKLY]:        "Weekly",
  [RESEARCH_FREQUENCY.ON_MAJOR_NEWS]: "On major news only",
});

const SOURCE_LABELS = Object.freeze({
  [RESEARCH_SOURCE.SEC_FILINGS]:           "SEC filings",
  [RESEARCH_SOURCE.EARNINGS_RELEASES]:     "Earnings releases",
  [RESEARCH_SOURCE.COMPANY_RELEASES]:      "Company press releases",
  [RESEARCH_SOURCE.FDA_UPDATES]:           "FDA updates",
  [RESEARCH_SOURCE.MEDICARE_REIMBURSEMENT]:"Medicare / reimbursement updates",
  [RESEARCH_SOURCE.ARK_HOLDINGS]:          "ARK holdings",
  [RESEARCH_SOURCE.PARTNERSHIPS]:          "Partnership news",
  [RESEARCH_SOURCE.MA_NEWS]:               "M&A news",
  [RESEARCH_SOURCE.ANALYST_CHANGES]:       "Analyst upgrades/downgrades",
  [RESEARCH_SOURCE.OPTIONS_IV]:            "Options IV changes",
  [RESEARCH_SOURCE.CREDIT_MARKET_STRESS]:  "Credit market stress",
  [RESEARCH_SOURCE.INSIDER_ACTIVITY]:      "Insider activity",
});

const OUTPUT_LABELS = Object.freeze({
  [RESEARCH_OUTPUT.PROPOSED_INTELLIGENCE]: "Create proposed intelligence item",
  [RESEARCH_OUTPUT.THESIS_CHECK_UPDATE]:   "Update Thesis Check",
  [RESEARCH_OUTPUT.MANAGER_REVIEW]:        "Send to Manager Review",
  [RESEARCH_OUTPUT.ALERT_CANDIDATE]:       "Create alert candidate",
  [RESEARCH_OUTPUT.ACTIVE_RESEARCH_CARD]:  "Update active research card",
});

// Operator-safe approval-mode strings.
const APPROVAL_MODE = Object.freeze({
  REQUIRES_APPROVAL: "requires_approval",
  AUTO_PROPOSE:      "auto_propose",
});

const APPROVAL_LABEL = Object.freeze({
  [APPROVAL_MODE.REQUIRES_APPROVAL]:
    "Findings stay as proposed intelligence until the operator approves them.",
  [APPROVAL_MODE.AUTO_PROPOSE]:
    "Findings are auto-saved as proposed intelligence; engine verdicts and risk controls remain unchanged.",
});

// Operator-safe next-step copy.
const NEXT_STEP_REQUIRES_APPROVAL =
  "Research automation configured. New findings will be saved as proposed intelligence and require approval before memory update.";
const NEXT_STEP_AUTO_PROPOSE =
  "Research automation configured. New findings will be saved as proposed intelligence; engine verdicts and risk controls remain unchanged.";
const NEXT_STEP_DISABLED =
  "Research automation is disabled for this basket and agent.";

/**
 * @param {object} settings   record from agentResearchSettingsStore
 * @returns {object|null}     UI-safe plan, or null on bad input
 */
export function buildResearchAutomationPlan(settings) {
  if (!settings || typeof settings !== "object") return null;
  if (typeof settings.basketId !== "string" || typeof settings.agentId !== "string") return null;

  const enabled = settings.enabled !== false;   // default true
  const requireApproval = settings.requireApproval !== false;   // default true

  const monitoredSources = (Array.isArray(settings.sources) ? settings.sources : [])
    .map((id) => ({ id, label: SOURCE_LABELS[id] || id }))
    .filter((row) => !!SOURCE_LABELS[row.id]);

  const outputDestinations = (Array.isArray(settings.outputs) ? settings.outputs : [])
    .map((id) => ({ id, label: OUTPUT_LABELS[id] || id }))
    .filter((row) => !!OUTPUT_LABELS[row.id]);

  const monitoredSymbols = Array.isArray(settings.symbols)
    ? settings.symbols.filter((s) => typeof s === "string" && s.trim()).slice(0, 64)
    : [];

  const approvalMode = requireApproval
    ? APPROVAL_MODE.REQUIRES_APPROVAL
    : APPROVAL_MODE.AUTO_PROPOSE;

  const nextStepLabel = !enabled
    ? NEXT_STEP_DISABLED
    : (requireApproval ? NEXT_STEP_REQUIRES_APPROVAL : NEXT_STEP_AUTO_PROPOSE);

  return {
    basketId: settings.basketId,
    agentId:  settings.agentId,
    frequencyLabel: FREQUENCY_LABELS[settings.frequency] || "Manual only",
    monitoredSymbols,
    monitoredSources,
    outputDestinations,
    approvalMode,
    approvalLabel: APPROVAL_LABEL[approvalMode],
    enabled,
    nextStepLabel,
  };
}

// Re-export lookup tables so the component can render labels without
// duplicating the maps.
export {
  FREQUENCY_LABELS,
  SOURCE_LABELS,
  OUTPUT_LABELS,
  APPROVAL_MODE,
};
