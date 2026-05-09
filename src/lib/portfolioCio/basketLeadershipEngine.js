// =====================================================================
// Basket Leadership Engine
// =====================================================================
// PURE function that classifies the operator's per-basket active
// universe + watchlist into leadership buckets using the manager-
// assessment vocabulary already established by the CIO tape. No raw
// scores or weights surface — every output line is trader-facing copy
// derived from STANCE / CONFIDENCE / RECOMMENDED_ACTION values.
// =====================================================================

import { LEADERSHIP_STATUS } from "./basketAgentTypes.js";
import { STANCE } from "./managerAssessmentTypes.js";

/**
 * @typedef {Object} ManagerAssessmentBag
 * @property {object} [trigger_engine]
 * @property {object} [credit_view]
 * @property {object} [market_intel]
 * @property {object} [risk_manager]
 *
 * @typedef {Object} HistoryClue
 * @property {object} [outcome]   { status: ad-hoc history outcome string }
 *
 * @param {object} input
 * @param {object} input.basketProfile                 from registry
 * @param {object|null} [input.basketUniverse]
 * @param {Record<string, ManagerAssessmentBag>} [input.managerAssessmentsBySymbol]
 * @param {object|null} [input.marketRegime]
 * @param {Record<string, HistoryClue>} [input.historyBySymbol]
 * @returns {object}                                   leadership read
 */
export function buildBasketLeadershipRead(input = {}) {
  const profile = input.basketProfile || null;
  if (!profile) return null;

  const universe = input.basketUniverse || {
    activeUniverse: [], watchlist: [], excludedSymbols: [], notes: null,
  };
  const ma = input.managerAssessmentsBySymbol || {};
  const history = input.historyBySymbol || {};
  const regime = input.marketRegime || null;

  const excluded = new Set(symbolsOf(universe.excludedSymbols));
  const activeSyms = symbolsOf(universe.activeUniverse).filter((s) => !excluded.has(s));
  const watchSyms  = symbolsOf(universe.watchlist).filter((s) => !excluded.has(s));

  const leaders          = [];
  const emergingLeaders  = [];
  const fadingNames      = [];
  const watchOnly        = [];
  const suggestedAdditions = [];
  const suggestedRemovals  = [];

  // Active set classification.
  for (const sym of activeSyms) {
    const cls = classifySymbol(sym, ma[sym] || {}, history[sym] || null, /*onWatchlist*/ false);
    pushByStatus(cls, leaders, emergingLeaders, fadingNames, watchOnly);
    if (cls.status === LEADERSHIP_STATUS.FADING_LEADER ||
        cls.status === LEADERSHIP_STATUS.OVEREXTENDED ||
        cls.status === LEADERSHIP_STATUS.REMOVED) {
      suggestedRemovals.push({ symbol: sym, reason: cls.read });
    }
  }
  // Watchlist set classification.
  for (const sym of watchSyms) {
    const cls = classifySymbol(sym, ma[sym] || {}, history[sym] || null, /*onWatchlist*/ true);
    pushByStatus(cls, leaders, emergingLeaders, fadingNames, watchOnly);
    if (cls.status === LEADERSHIP_STATUS.LEADER ||
        cls.status === LEADERSHIP_STATUS.EMERGING_LEADER) {
      suggestedAdditions.push({ symbol: sym, reason: cls.read });
    }
  }

  // Basket-level reads.
  const deriskingRead     = composeDeriskingRead(leaders, fadingNames);
  const repricingRead     = composeRepricingRead(emergingLeaders, suggestedAdditions, profile);
  const institutionalRead = composeInstitutionalRead(leaders, fadingNames, profile);
  const basketRiskLevel   = inferBasketRiskLevel(profile, leaders, fadingNames, regime);
  const basketConfidence  = inferBasketConfidence(leaders, emergingLeaders, watchOnly);
  const actionSummary     = composeActionSummary({
    profile, leaders, emergingLeaders, fadingNames, watchOnly,
    suggestedAdditions, suggestedRemovals, basketRiskLevel,
  });

  return {
    basketId: profile.basketId,
    basketName: profile.basketName,
    activeUniverse: activeSyms,
    leaders,
    emergingLeaders,
    fadingNames,
    watchOnly,
    suggestedAdditions,
    suggestedRemovals,
    deriskingRead,
    repricingRead,
    institutionalRead,
    basketRiskLevel,
    basketConfidence,
    actionSummary,
  };
}

// ---------------------------------------------------------------------
// Per-symbol classification
// ---------------------------------------------------------------------

function classifySymbol(symbol, ma, hist, onWatchlist) {
  const teStance = ma?.trigger_engine?.stance;
  const cvStance = ma?.credit_view?.stance;
  const miStance = ma?.market_intel?.stance;
  const riskStance = ma?.risk_manager?.stance;

  const isC = (s) => s === STANCE.BULLISH || s === STANCE.CONSTRUCTIVE;
  const isCau = (s) => s === STANCE.CAUTIOUS || s === STANCE.BEARISH;
  const isUna = (s) => !s || s === STANCE.UNAVAILABLE;

  const constructiveCount = [teStance, cvStance, miStance].filter(isC).length;
  const cautiousCount     = [teStance, cvStance, miStance].filter(isCau).length;
  const unavailableCount  = [teStance, cvStance, miStance].filter(isUna).length;

  // Build the read string + status based on the rule layer.
  let status;
  let read;

  if (cautiousCount === 0 && constructiveCount >= 3) {
    status = LEADERSHIP_STATUS.LEADER;
    read = "Leadership confirmed across managers.";
  } else if (cautiousCount === 0 && constructiveCount >= 2 && unavailableCount <= 1) {
    status = LEADERSHIP_STATUS.EMERGING_LEADER;
    read = onWatchlist
      ? "Leadership improving on the watchlist; consider promotion to active universe."
      : "Leadership improving; awaiting final manager confirmation.";
  } else if (isC(miStance) && isUna(teStance) && isUna(cvStance)) {
    status = LEADERSHIP_STATUS.WATCH_ONLY;
    read = "Thesis supportive but timing incomplete — TE/CV confirmation missing.";
  } else if (isCau(cvStance) && isCau(teStance)) {
    status = LEADERSHIP_STATUS.FADING_LEADER;
    read = "Both structure and premium are deteriorating — remove from active scan until confirmation improves.";
  } else if (isCau(teStance) && !isCau(cvStance) && !isCau(miStance)) {
    status = LEADERSHIP_STATUS.FADING_LEADER;
    read = "Structure deteriorating despite supportive thesis — possible overextension.";
  } else if (isCau(cvStance) && isC(miStance)) {
    status = LEADERSHIP_STATUS.WATCH_ONLY;
    read = "Premium not ready — keep on watchlist, track entry signal.";
  } else if (isC(miStance) && isCau(riskStance)) {
    status = LEADERSHIP_STATUS.WATCH_ONLY;
    read = "Risk concentration elevated — keep on watchlist with reduced size posture.";
  } else if (constructiveCount >= 1 && cautiousCount >= 1) {
    status = LEADERSHIP_STATUS.WATCH_ONLY;
    read = "Mixed manager reads — wait for resolution before sizing.";
  } else if (unavailableCount === 3) {
    status = LEADERSHIP_STATUS.UNCLASSIFIED;
    read = "Insufficient manager evidence.";
  } else if (constructiveCount === 1 && unavailableCount === 2) {
    status = LEADERSHIP_STATUS.CHALLENGER;
    read = "Single supportive manager — challenger profile pending broader confirmation.";
  } else {
    status = LEADERSHIP_STATUS.UNCLASSIFIED;
    read = "Manager reads inconclusive.";
  }

  // Append a history calibration clue when available.
  const historyNote = composeHistoryNote(hist);
  if (historyNote) read = `${read} ${historyNote}`;

  return { symbol, status, read, onWatchlist };
}

function composeHistoryNote(hist) {
  const status = hist?.outcome?.status;
  if (!status) return null;
  switch (status) {
    case "missed_winner":
      return "(history clue: prior simulation marked a missed winner — possible over-conservatism.)";
    case "avoided_correctly":
      return "(history clue: prior simulation avoided correctly — caution may have been appropriate.)";
    case "invalidated":
      return "(history clue: prior simulation was invalidated — caution validated.)";
    case "profitable":
      return "(history clue: prior simulation was profitable — current caution may need calibration.)";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------
// Basket-level reads
// ---------------------------------------------------------------------

function pushByStatus(cls, leaders, emergingLeaders, fadingNames, watchOnly) {
  switch (cls.status) {
    case LEADERSHIP_STATUS.LEADER:
    case LEADERSHIP_STATUS.CHALLENGER:
      leaders.push(cls);
      break;
    case LEADERSHIP_STATUS.EMERGING_LEADER:
      emergingLeaders.push(cls);
      break;
    case LEADERSHIP_STATUS.FADING_LEADER:
    case LEADERSHIP_STATUS.OVEREXTENDED:
      fadingNames.push(cls);
      break;
    case LEADERSHIP_STATUS.WATCH_ONLY:
      watchOnly.push(cls);
      break;
    default: /* unclassified / removed */
      break;
  }
}

function composeDeriskingRead(leaders, fading) {
  if (fading.length === 0 && leaders.length > 0) {
    return "No de-risking signals — leadership is intact.";
  }
  if (fading.length > 0 && leaders.length === 0) {
    return "Basket leadership is deteriorating — consider tightening stops or trimming.";
  }
  if (fading.length > 0) {
    return `${fading.length} name${fading.length === 1 ? "" : "s"} flagged as fading — rotate exposure toward intact leaders.`;
  }
  return "No leaders identified yet — basket read is incomplete.";
}

function composeRepricingRead(emerging, additions, profile) {
  if (emerging.length === 0 && additions.length === 0) {
    return "No repricing signals on the active universe yet.";
  }
  if (additions.length > 0) {
    return `Watchlist names showing repricing tailwinds: ${additions.map((a) => a.symbol).join(", ")}.`;
  }
  return `Emerging leadership tilts toward ${profile.basketName.toLowerCase()} repricing.`;
}

function composeInstitutionalRead(leaders, fading, profile) {
  if (leaders.length === 0 && fading.length === 0) {
    return "Institutional positioning read incomplete — run full manager coverage.";
  }
  if (leaders.length > 0 && fading.length === 0) {
    return `Institutional flow appears aligned with ${profile.basketName.toLowerCase()} mandate.`;
  }
  if (fading.length > 0 && leaders.length === 0) {
    return `Institutional flow appears to be rotating away from this basket.`;
  }
  return "Mixed institutional signals — monitor flow and confirm on next rebalance.";
}

function inferBasketRiskLevel(profile, leaders, fading, regime) {
  const fade = fading.length;
  const lead = leaders.length;
  if (regime?.creditStress || regime?.fearSpike) return "elevated";
  if (lead === 0 && fade > 0) return "elevated";
  if (fade >= lead && fade > 0) return "elevated";
  if (lead > 0 && fade === 0) return "moderate";
  return "moderate";
}

function inferBasketConfidence(leaders, emerging, watchOnly) {
  const total = leaders.length + emerging.length + watchOnly.length;
  if (total === 0) return "unavailable";
  if (leaders.length >= 3 && watchOnly.length <= leaders.length) return "moderate";
  if (leaders.length >= 1 || emerging.length >= 2) return "moderate";
  if (emerging.length === 0 && leaders.length === 0) return "low";
  return "low";
}

function composeActionSummary({ profile, leaders, emergingLeaders, fadingNames, suggestedAdditions, suggestedRemovals, basketRiskLevel }) {
  const parts = [];
  if (leaders.length > 0) {
    parts.push(`${leaders.length} confirmed leader${leaders.length === 1 ? "" : "s"}`);
  }
  if (emergingLeaders.length > 0) {
    parts.push(`${emergingLeaders.length} emerging name${emergingLeaders.length === 1 ? "" : "s"}`);
  }
  if (fadingNames.length > 0) {
    parts.push(`${fadingNames.length} fading name${fadingNames.length === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) {
    parts.push("no manager-confirmed reads yet");
  }
  const head = `${profile.basketName}: ${parts.join(", ")}.`;
  const tail = [];
  if (suggestedAdditions.length > 0) {
    tail.push(`Promote: ${suggestedAdditions.map((a) => a.symbol).join(", ")}.`);
  }
  if (suggestedRemovals.length > 0) {
    tail.push(`Review for removal: ${suggestedRemovals.map((a) => a.symbol).join(", ")}.`);
  }
  if (basketRiskLevel === "elevated") {
    tail.push("Basket risk elevated — confirm before adding exposure.");
  }
  return [head, ...tail].join(" ");
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function symbolsOf(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const r of list) {
    if (r && typeof r.symbol === "string" && r.symbol) out.push(r.symbol);
  }
  return out;
}
