// =====================================================================
// What Changed Builder
// =====================================================================
// PURE function. Compares the current candidate state against a prior
// snapshot + the latest intelligence items, and emits a one-line
// operator-facing "what changed" string.
//
// Hard rules:
//   - Deterministic only. No random scoring.
//   - Trader-facing copy. No raw scores / weights / coefficients.
//   - Never overrides any engine field — it just summarises observable
//     state changes.
// =====================================================================

const RESULT_PRIORITIES = Object.freeze([
  "risk_elevated",
  "thesis_challenged",
  "stale_data",
  "posture_downgrade",
  "credit_view_downgrade",
  "counter_thesis_intelligence",
  "support_break",
  "premium_quality_drop",
  "thesis_confirmed",
  "posture_upgrade",
  "credit_view_upgrade",
  "premium_quality_improved",
  "supportive_intelligence",
  "near_resistance",
  "near_support",
  "no_change",
]);

const PRIORITY_INDEX = Object.fromEntries(RESULT_PRIORITIES.map((k, i) => [k, i]));

const MESSAGES = Object.freeze({
  risk_elevated:                "Risk posture elevated.",
  thesis_challenged:            "Thesis challenged by latest intelligence.",
  stale_data:                   "Data may be stale — confirm before acting.",
  posture_downgrade:            "Engine posture downgraded.",
  credit_view_downgrade:        "Credit View shifted toward caution.",
  counter_thesis_intelligence:  "New counter-thesis article detected.",
  support_break:                "Support level broke — re-evaluate.",
  premium_quality_drop:         "Premium quality has dropped.",
  thesis_confirmed:             "Thesis confirmed by latest intelligence.",
  posture_upgrade:              "Engine posture upgraded.",
  credit_view_upgrade:          "Credit View shifted constructive.",
  premium_quality_improved:     "Premium quality improved.",
  supportive_intelligence:      "Supportive intelligence detected.",
  near_resistance:              "Price moved near resistance.",
  near_support:                 "Price moved near support.",
  no_change:                    "No major change.",
});

// Risk-flagging keyword sets — both for catalysts and risks. Used when
// caller passes intelligence items with arrays of catalyst / risk
// labels. Match ordering matters: risk_elevated takes precedence over
// counter_thesis_intelligence which takes precedence over
// supportive_intelligence.
const COUNTER_THESIS_RISK_LABELS = new Set([
  "Reimbursement pressure",
  "Reimbursement pathway uncertainty",
  "Valuation / crowded-trade risk",
  "Incumbent pressure / competition",
  "Trial failure / missed endpoint",
  "Cash / runway risk",
  "Regulatory pushback",
  "Supply chain pressure",
  "Execution risk",
]);
const SUPPORTIVE_CATALYST_LABELS = new Set([
  "Pharma partnership",
  "Partnership",
  "Hospital adoption / expansion",
  "Diagnostics revenue growth",
  "Data & Applications growth",
  "AI pathology validation",
  "AI infrastructure expansion",
  "ARK accumulation",
  "Insider accumulation",
  "M&A activity",
]);

const POSTURE_RANK = Object.freeze({
  risk_elevated:              0,
  avoid_for_now:              1,
  sector_confirmation_signal: 2,
  wait_for_confirmation:      3,
  long_hold_anchor:           4,
  accumulate_watch:           5,
  premium_candidate:          6,
});

const CREDIT_VIEW_RANK = Object.freeze({
  bearish:      0,
  cautious:     1,
  unavailable:  2,
  neutral:      3,
  constructive: 4,
  bullish:      5,
});

/**
 * @param {object} candidate
 * @param {object|null} previousCandidate
 * @param {Array<object>} [intelligenceItems]
 * @returns {string}
 */
export function buildWhatChanged(candidate, previousCandidate, intelligenceItems) {
  const findings = collectFindings(candidate, previousCandidate, intelligenceItems);
  if (findings.length === 0) return MESSAGES.no_change;
  // Highest-priority (lowest index) wins.
  findings.sort((a, b) =>
    (PRIORITY_INDEX[a] ?? 999) - (PRIORITY_INDEX[b] ?? 999),
  );
  return MESSAGES[findings[0]] || MESSAGES.no_change;
}

/**
 * Same as buildWhatChanged but returns the structured kind too. Useful
 * for UI tone selection (red for challenges, green for confirmations).
 */
export function describeWhatChanged(candidate, previousCandidate, intelligenceItems) {
  const findings = collectFindings(candidate, previousCandidate, intelligenceItems);
  if (findings.length === 0) {
    return { kind: "no_change", message: MESSAGES.no_change, tone: "neutral" };
  }
  findings.sort((a, b) =>
    (PRIORITY_INDEX[a] ?? 999) - (PRIORITY_INDEX[b] ?? 999),
  );
  const kind = findings[0];
  return {
    kind,
    message: MESSAGES[kind] || MESSAGES.no_change,
    tone: toneFor(kind),
  };
}

function toneFor(kind) {
  switch (kind) {
    case "risk_elevated":
    case "thesis_challenged":
    case "posture_downgrade":
    case "credit_view_downgrade":
    case "counter_thesis_intelligence":
    case "support_break":
    case "premium_quality_drop":
    case "stale_data":
      return "challenging";
    case "thesis_confirmed":
    case "posture_upgrade":
    case "credit_view_upgrade":
    case "premium_quality_improved":
    case "supportive_intelligence":
      return "supportive";
    default:
      return "neutral";
  }
}

// ---------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------

function collectFindings(candidate, previousCandidate, intelligenceItems) {
  const findings = [];
  const cur  = candidate || {};
  const prev = previousCandidate || null;

  // 1. Engine-driven signals on the candidate itself.
  if (cur.staleData === true)        findings.push("stale_data");
  if (cur.posture === "risk_elevated" && (!prev || prev.posture !== "risk_elevated")) {
    findings.push("risk_elevated");
  }
  if (cur.supportBreak === true)     findings.push("support_break");
  if (cur.nearResistance === true)   findings.push("near_resistance");
  if (cur.nearSupport === true)      findings.push("near_support");

  // 2. Diff against previous snapshot when supplied.
  if (prev) {
    if (typeof cur.posture === "string" && typeof prev.posture === "string" &&
        cur.posture !== prev.posture) {
      const before = POSTURE_RANK[prev.posture] ?? null;
      const after  = POSTURE_RANK[cur.posture]  ?? null;
      if (before != null && after != null) {
        if (after < before) findings.push("posture_downgrade");
        else if (after > before) findings.push("posture_upgrade");
      }
    }
    if (typeof cur.creditViewStance === "string" && typeof prev.creditViewStance === "string" &&
        cur.creditViewStance !== prev.creditViewStance) {
      const before = CREDIT_VIEW_RANK[prev.creditViewStance] ?? null;
      const after  = CREDIT_VIEW_RANK[cur.creditViewStance]  ?? null;
      if (before != null && after != null) {
        if (after < before) findings.push("credit_view_downgrade");
        else if (after > before) findings.push("credit_view_upgrade");
      }
    }
    if (typeof cur.premiumQuality === "number" && typeof prev.premiumQuality === "number") {
      const dq = cur.premiumQuality - prev.premiumQuality;
      // Use a coarse threshold so trivial numeric noise doesn't trigger.
      if (dq <= -0.1) findings.push("premium_quality_drop");
      else if (dq >= 0.1) findings.push("premium_quality_improved");
    }
    if (cur.thesisHealthStatus === "weakening" &&
        prev.thesisHealthStatus !== "weakening") {
      findings.push("thesis_challenged");
    }
    if (cur.thesisHealthStatus === "strengthening" &&
        prev.thesisHealthStatus !== "strengthening") {
      findings.push("thesis_confirmed");
    }
  }

  // 3. Intelligence items — take the most recent first.
  const items = arrayify(intelligenceItems);
  if (items.length > 0) {
    items.sort((a, b) =>
      (b?.updatedAt || b?.createdAt || 0) - (a?.updatedAt || a?.createdAt || 0));
    const top = items[0] || null;
    if (top) {
      const risks = arr(top.risks);
      const cats  = arr(top.catalysts);
      const counterMatches = risks.filter((r) => COUNTER_THESIS_RISK_LABELS.has(r));
      const supportMatches = cats.filter((c) => SUPPORTIVE_CATALYST_LABELS.has(c));
      if (counterMatches.length > 0 && supportMatches.length === 0) {
        findings.push("counter_thesis_intelligence");
      } else if (supportMatches.length > 0 && counterMatches.length === 0) {
        findings.push("supportive_intelligence");
      } else if (counterMatches.length > 0 && supportMatches.length > 0) {
        // Both signals present — defer to engine state. Don't emit
        // an intelligence-driven finding here.
      }
    }
  }

  return Array.from(new Set(findings));
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function arrayify(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === "object") return [v];
  return [];
}
