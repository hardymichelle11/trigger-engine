// =====================================================================
// Basket Action Queue Engine
// =====================================================================
// PURE function that turns a basket's leadership read + manager memory
// into an operator-facing review queue. The queue does NOT execute any
// action — it only flags what the operator should review next.
//
// Hard rules:
//   - Trader-facing copy only. No raw scores / weights / coefficients.
//   - No buy / sell wording. No capital allocation.
//   - Each rule produces a structured item with a single recommended
//     actionType plus the buttons the UI is allowed to surface for
//     that item (allowedActions).
// =====================================================================

import { LEADERSHIP_STATUS } from "./basketAgentTypes.js";
import { STANCE } from "./managerAssessmentTypes.js";

export const ACTION_TYPE = Object.freeze({
  RUN_AD_HOC_SIMULATION:     "run_ad_hoc_simulation",
  SEND_TO_TE:                "send_to_TE",
  SEND_TO_CV:                "send_to_CV",
  PROMOTE_TO_SCANNER_REVIEW: "promote_to_scanner_review",
  MOVE_TO_WATCHLIST_REVIEW:  "move_to_watchlist_review",
  EXCLUDE_REVIEW:            "exclude_review",
  RESTORE_TO_ACTIVE_REVIEW:  "restore_to_active_review",
  REVIEW_CONFLICT:           "review_conflict",
  REVIEW_CALIBRATION:        "review_calibration",
  MONITOR_ONLY:              "monitor_only",
});

export const PRIORITY = Object.freeze({
  URGENT: "urgent",
  HIGH:   "high",
  MEDIUM: "medium",
  LOW:    "low",
});

export const QUEUE_TIME_HORIZON = Object.freeze({
  SHORT_TERM: "short_term",
  NEAR_TERM:  "near_term",
  LONG_TERM:  "long_term",
  MIXED:      "mixed",
});

const PRIORITY_ORDER = [PRIORITY.URGENT, PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW];

// ---------------------------------------------------------------------
// Public entry — single basket
// ---------------------------------------------------------------------

/**
 * @param {object} input
 * @param {object} input.basketProfile
 * @param {object} [input.basketUniverse]
 * @param {object} [input.leadershipRead]                 output of buildBasketLeadershipRead
 * @param {Record<string, object>} [input.managerAssessmentsBySymbol]
 * @param {Record<string, { outcome: { status: string } }>} [input.historyBySymbol]
 * @returns {Array<object>} action queue items, deduped by id
 */
export function buildBasketActionQueue(input = {}) {
  const profile = input.basketProfile || null;
  if (!profile) return [];
  const universe = input.basketUniverse || { activeUniverse: [], watchlist: [], excludedSymbols: [] };
  const ma = input.managerAssessmentsBySymbol || {};
  const history = input.historyBySymbol || {};
  const read = input.leadershipRead || null;

  const excluded = new Set(symbolsOf(universe.excludedSymbols));
  const activeSyms = symbolsOf(universe.activeUniverse).filter((s) => !excluded.has(s));
  const watchSyms  = symbolsOf(universe.watchlist).filter((s) => !excluded.has(s));
  const excludedSyms = symbolsOf(universe.excludedSymbols);

  const classBySymbol = indexLeadershipBySymbol(read);

  const out = [];
  const at = Date.now();

  // Active + watchlist — analyse with manager + leadership inputs.
  for (const sym of activeSyms) {
    const item = analyzeSymbol({
      symbol: sym, basketProfile: profile,
      ma: ma[sym] || {}, hist: history[sym] || null,
      cls: classBySymbol.get(sym) || null,
      onWatchlist: false, at,
    });
    if (item) out.push(item);
  }
  for (const sym of watchSyms) {
    const item = analyzeSymbol({
      symbol: sym, basketProfile: profile,
      ma: ma[sym] || {}, hist: history[sym] || null,
      cls: classBySymbol.get(sym) || null,
      onWatchlist: true, at,
    });
    if (item) out.push(item);
  }

  // Excluded — only surface a Restore review when manager memory shows
  // a constructive read on a name we previously took out.
  for (const sym of excludedSyms) {
    const m = ma[sym];
    if (!m) continue;
    if (anyConstructive(m)) {
      out.push({
        id: makeId(profile.basketId, sym, ACTION_TYPE.RESTORE_TO_ACTIVE_REVIEW),
        symbol: sym,
        basketId: profile.basketId,
        basketName: profile.basketName,
        actionType: ACTION_TYPE.RESTORE_TO_ACTIVE_REVIEW,
        priority: PRIORITY.MEDIUM,
        title: `${sym} — excluded name showing constructive reads`,
        rationale:
          "Manager memory now shows a supportive read on a name that was excluded earlier. Review whether the original exclusion still applies.",
        managerContext: composeManagerContext(m),
        suggestedNextStep: "Consider Restore to Active or run a fresh Ad Hoc Simulation.",
        allowedActions: [
          ACTION_TYPE.RESTORE_TO_ACTIVE_REVIEW,
          ACTION_TYPE.RUN_AD_HOC_SIMULATION,
        ],
        timeHorizon: QUEUE_TIME_HORIZON.NEAR_TERM,
        calibrationFlag: null,
        createdAt: at,
      });
    }
  }

  return sortByPriority(dedupeById(out));
}

// ---------------------------------------------------------------------
// Per-symbol analysis (single-action emit; rules priority-ranked)
// ---------------------------------------------------------------------

function analyzeSymbol({ symbol, basketProfile, ma, hist, cls, onWatchlist, at }) {
  const teStance = ma?.trigger_engine?.stance;
  const cvStance = ma?.credit_view?.stance;
  const miStance = ma?.market_intel?.stance;
  const riskStance = ma?.risk_manager?.stance;

  const isC   = (s) => s === STANCE.BULLISH || s === STANCE.CONSTRUCTIVE;
  const isCau = (s) => s === STANCE.CAUTIOUS || s === STANCE.BEARISH;
  const isUna = (s) => !s || s === STANCE.UNAVAILABLE;

  const constructiveCount = [teStance, cvStance, miStance].filter(isC).length;
  const cautiousCount     = [teStance, cvStance, miStance].filter(isCau).length;
  const allUnavailable    = isUna(teStance) && isUna(cvStance) && isUna(miStance);

  const histStatus = typeof hist?.outcome?.status === "string" ? hist.outcome.status : null;
  const calibrationFlag = composeCalibrationFlag(histStatus);
  const managerContext = composeManagerContext(ma);

  // Rule order matters — evaluate from highest-priority signal down.

  // Rule 7: missed_winner history → review_calibration (HIGH)
  if (histStatus === "missed_winner") {
    return mk({
      basketProfile, symbol, at,
      actionType: ACTION_TYPE.REVIEW_CALIBRATION,
      priority: PRIORITY.HIGH,
      title: `${symbol} — review CIO calibration`,
      rationale:
        "A prior simulation on this name was later marked a missed winner. Possible over-conservatism — review whether current manager reads support a fresh look.",
      managerContext,
      suggestedNextStep:
        "Run a fresh Ad Hoc Simulation and revisit the CIO override that kept this name out.",
      allowedActions: [
        ACTION_TYPE.RUN_AD_HOC_SIMULATION,
        ACTION_TYPE.SEND_TO_TE,
        ACTION_TYPE.SEND_TO_CV,
      ],
      timeHorizon: QUEUE_TIME_HORIZON.NEAR_TERM,
      calibrationFlag,
    });
  }

  // Rule 3: CV constructive + TE cautious → review_conflict (HIGH)
  if (isC(cvStance) && isCau(teStance)) {
    return mk({
      basketProfile, symbol, at,
      actionType: ACTION_TYPE.REVIEW_CONFLICT,
      priority: PRIORITY.HIGH,
      title: `${symbol} — premium attractive but structure weak`,
      rationale:
        "Credit View finds the premium attractive while Trigger Engine flags structural risk. Premium may be a trap; defer to structure and risk before sizing.",
      managerContext,
      suggestedNextStep:
        "Re-run TE to confirm the breakdown read; if still cautious, do not size on premium alone.",
      allowedActions: [
        ACTION_TYPE.RUN_AD_HOC_SIMULATION,
        ACTION_TYPE.SEND_TO_TE,
        ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW,
      ],
      timeHorizon: QUEUE_TIME_HORIZON.SHORT_TERM,
      calibrationFlag,
    });
  }

  // Rule 1: Leader / emerging leader with constructive TE / CV / MI →
  // promote_to_scanner_review (HIGH).
  const isLeaderClass =
    cls?.status === LEADERSHIP_STATUS.LEADER ||
    cls?.status === LEADERSHIP_STATUS.EMERGING_LEADER;
  if (isLeaderClass && cautiousCount === 0 && constructiveCount >= 2) {
    return mk({
      basketProfile, symbol, at,
      actionType: ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW,
      priority: PRIORITY.HIGH,
      title: `${symbol} — leadership confirmed; review for scanner promotion`,
      rationale:
        cls.status === LEADERSHIP_STATUS.LEADER
          ? "Leadership confirmed across managers. Review whether to promote into the scanner-eligible set."
          : "Leadership improving; review whether to promote into the scanner-eligible set.",
      managerContext,
      suggestedNextStep:
        onWatchlist
          ? "Consider moving from Watchlist to Active and promoting to Scanner."
          : "Consider Promote to Scanner.",
      allowedActions: [
        ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW,
        ACTION_TYPE.SEND_TO_TE,
        ACTION_TYPE.SEND_TO_CV,
      ],
      timeHorizon: QUEUE_TIME_HORIZON.NEAR_TERM,
      calibrationFlag,
    });
  }

  // Rule 5/6: fading_leader / overextended → move_to_watchlist_review (MEDIUM)
  if (cls?.status === LEADERSHIP_STATUS.FADING_LEADER ||
      cls?.status === LEADERSHIP_STATUS.OVEREXTENDED) {
    return mk({
      basketProfile, symbol, at,
      actionType: ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW,
      priority: PRIORITY.MEDIUM,
      title: `${symbol} — leadership fading`,
      rationale:
        "Manager reads suggest leadership is fading or the name is overextended. Reduce active exposure until reads improve.",
      managerContext,
      suggestedNextStep: onWatchlist
        ? "Already on watchlist — confirm whether to exclude or run a fresh sim."
        : "Consider Move to Watchlist; re-run TE / CV before re-engaging.",
      allowedActions: [
        ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW,
        ACTION_TYPE.RUN_AD_HOC_SIMULATION,
        ACTION_TYPE.EXCLUDE_REVIEW,
      ],
      timeHorizon: QUEUE_TIME_HORIZON.NEAR_TERM,
      calibrationFlag,
    });
  }

  // Rule 2: MI constructive but TE/CV unavailable → run_ad_hoc_simulation (MEDIUM)
  if (isC(miStance) && isUna(teStance) && isUna(cvStance)) {
    return mk({
      basketProfile, symbol, at,
      actionType: ACTION_TYPE.RUN_AD_HOC_SIMULATION,
      priority: PRIORITY.MEDIUM,
      title: `${symbol} — thesis supportive, structure & premium unverified`,
      rationale:
        "Market Intelligence is constructive but TE / CV have not produced a read. Run a simulation to fill the structural and premium gaps.",
      managerContext,
      suggestedNextStep: "Run an Ad Hoc Simulation to generate TE / CV reads.",
      allowedActions: [ACTION_TYPE.RUN_AD_HOC_SIMULATION],
      timeHorizon: QUEUE_TIME_HORIZON.NEAR_TERM,
      calibrationFlag,
    });
  }

  // Rule 4: TE constructive but CV unavailable → send_to_CV (MEDIUM)
  if (isC(teStance) && isUna(cvStance)) {
    return mk({
      basketProfile, symbol, at,
      actionType: ACTION_TYPE.SEND_TO_CV,
      priority: PRIORITY.MEDIUM,
      title: `${symbol} — structure constructive, premium unverified`,
      rationale:
        "Trigger Engine is constructive but Credit View has not produced a read. Validate options premium and spread before sizing.",
      managerContext,
      suggestedNextStep: "Send to CV (or re-run with options-chain providers).",
      allowedActions: [ACTION_TYPE.SEND_TO_CV, ACTION_TYPE.RUN_AD_HOC_SIMULATION],
      timeHorizon: QUEUE_TIME_HORIZON.SHORT_TERM,
      calibrationFlag,
    });
  }

  // Rule 8: avoided_correctly / invalidated → monitor_only (LOW), caution validated
  if (histStatus === "avoided_correctly" || histStatus === "invalidated") {
    return mk({
      basketProfile, symbol, at,
      actionType: ACTION_TYPE.MONITOR_ONLY,
      priority: PRIORITY.LOW,
      title: `${symbol} — caution validated by recent outcome`,
      rationale:
        "A prior simulation was avoided correctly or invalidated. Caution may have been appropriate — monitor only.",
      managerContext,
      suggestedNextStep: "No action required — keep on watchlist if relevant.",
      allowedActions: [ACTION_TYPE.MONITOR_ONLY, ACTION_TYPE.RUN_AD_HOC_SIMULATION],
      timeHorizon: QUEUE_TIME_HORIZON.NEAR_TERM,
      calibrationFlag,
    });
  }

  // Rule 9: no manager memory → run_ad_hoc_simulation (LOW)
  if (allUnavailable) {
    return mk({
      basketProfile, symbol, at,
      actionType: ACTION_TYPE.RUN_AD_HOC_SIMULATION,
      priority: PRIORITY.LOW,
      title: `${symbol} — no manager evidence yet`,
      rationale:
        "No TE / CV / MI reads on file for this name. Run an Ad Hoc Simulation to generate the manager evidence the basket leadership engine needs.",
      managerContext: "Insufficient manager evidence.",
      suggestedNextStep: "Run an Ad Hoc Simulation for this symbol.",
      allowedActions: [ACTION_TYPE.RUN_AD_HOC_SIMULATION],
      timeHorizon: QUEUE_TIME_HORIZON.NEAR_TERM,
      calibrationFlag,
    });
  }

  // Default — partial reads; monitor only.
  return mk({
    basketProfile, symbol, at,
    actionType: ACTION_TYPE.MONITOR_ONLY,
    priority: PRIORITY.LOW,
    title: `${symbol} — monitor`,
    rationale:
      "Manager reads are partial or mixed. Monitor for resolution before sizing.",
    managerContext,
    suggestedNextStep: "Monitor for new manager reads or news catalysts.",
    allowedActions: [ACTION_TYPE.MONITOR_ONLY, ACTION_TYPE.RUN_AD_HOC_SIMULATION],
    timeHorizon: QUEUE_TIME_HORIZON.NEAR_TERM,
    calibrationFlag,
  });
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function mk(args) {
  return {
    id: makeId(args.basketProfile.basketId, args.symbol, args.actionType),
    symbol: args.symbol,
    basketId: args.basketProfile.basketId,
    basketName: args.basketProfile.basketName,
    actionType: args.actionType,
    priority: args.priority,
    title: args.title,
    rationale: args.rationale,
    managerContext: args.managerContext || null,
    suggestedNextStep: args.suggestedNextStep || null,
    allowedActions: Array.isArray(args.allowedActions) ? args.allowedActions : [],
    timeHorizon: args.timeHorizon || QUEUE_TIME_HORIZON.NEAR_TERM,
    calibrationFlag: args.calibrationFlag || null,
    createdAt: args.at || Date.now(),
  };
}

function makeId(basketId, symbol, actionType) {
  return `${basketId}::${symbol}::${actionType}`;
}

function symbolsOf(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const r of list) {
    if (r && typeof r.symbol === "string" && r.symbol) out.push(r.symbol);
  }
  return out;
}

function indexLeadershipBySymbol(read) {
  const m = new Map();
  if (!read) return m;
  for (const cls of (read.leaders || []))         m.set(cls.symbol, cls);
  for (const cls of (read.emergingLeaders || [])) m.set(cls.symbol, cls);
  for (const cls of (read.fadingNames || []))     m.set(cls.symbol, cls);
  for (const cls of (read.watchOnly || []))       m.set(cls.symbol, cls);
  return m;
}

function anyConstructive(ma) {
  for (const a of Object.values(ma || {})) {
    if (a && (a.stance === STANCE.BULLISH || a.stance === STANCE.CONSTRUCTIVE)) return true;
  }
  return false;
}

function composeManagerContext(ma) {
  const labels = [];
  const tag = (k, label) => {
    const s = ma?.[k]?.stance;
    if (!s || s === STANCE.UNAVAILABLE) return;
    labels.push(`${label}: ${humanizeStance(s)}`);
  };
  tag("trigger_engine", "TE");
  tag("credit_view",    "CV");
  tag("market_intel",   "MI");
  tag("risk_manager",   "Risk");
  if (labels.length === 0) return "Insufficient manager evidence.";
  return labels.join(" · ");
}

function humanizeStance(s) {
  switch (s) {
    case STANCE.BULLISH:      return "Bullish";
    case STANCE.CONSTRUCTIVE: return "Constructive";
    case STANCE.NEUTRAL:      return "Neutral";
    case STANCE.CAUTIOUS:     return "Cautious";
    case STANCE.BEARISH:      return "Bearish";
    default:                  return "—";
  }
}

function composeCalibrationFlag(historyStatus) {
  switch (historyStatus) {
    case "missed_winner":
      return "Possible over-conservatism — prior outcome was a missed winner.";
    case "avoided_correctly":
    case "invalidated":
      return "Caution validated by prior outcome.";
    case "profitable":
      return "Prior outcome was profitable — current caution may need calibration.";
    default:
      return null;
  }
}

function dedupeById(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (!it || !it.id || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

function sortByPriority(items) {
  return items.slice().sort((a, b) => {
    const ai = PRIORITY_ORDER.indexOf(a.priority);
    const bi = PRIORITY_ORDER.indexOf(b.priority);
    if (ai !== bi) return ai - bi;
    return (a.symbol || "").localeCompare(b.symbol || "");
  });
}

/** Group items by priority. Empty buckets included so the UI can show
 *  a consistent layout. */
export function groupByPriority(items) {
  const out = {
    [PRIORITY.URGENT]: [],
    [PRIORITY.HIGH]:   [],
    [PRIORITY.MEDIUM]: [],
    [PRIORITY.LOW]:    [],
  };
  for (const it of items || []) {
    if (!it || !it.priority) continue;
    if (!out[it.priority]) out[it.priority] = [];
    out[it.priority].push(it);
  }
  return out;
}
