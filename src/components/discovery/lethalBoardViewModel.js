// =====================================================
// LETHAL BOARD VIEW MODEL
// =====================================================
// Pure helper that turns a runMarketDiscoveryScan() result
// into the safe, user-facing shape the LethalBoard renders.
//
// Hard rules (UI accuracy):
//   - Premium label is honest: "live" for chain_based,
//     "estimated" for iv/atr methods, "unavailable" otherwise.
//   - NEVER label estimated premium as "live".
//   - Internal scoring weights / breakdowns are intentionally
//     OMITTED from the view model — the UI sees only top-line
//     score and reasons. Scoring formulas stay private.
//   - Pure function. Same input → same output. Easy to test.
// =====================================================

import {
  PREMIUM_SOURCE,
  PROBABILITY_STATUS,
  CAPITAL_FIT,
  ACTION,
} from "../../engines/discovery/types.js";

// --------------------------------------------------
// HUMAN-READABLE LABELS
// --------------------------------------------------

const PREMIUM_LABEL = {
  [PREMIUM_SOURCE.LIVE]: "live",
  [PREMIUM_SOURCE.ESTIMATED]: "estimated",
  [PREMIUM_SOURCE.UNAVAILABLE]: "unavailable",
};

const ACTION_LABEL = {
  [ACTION.DEEP_SCAN]: "Deep scan",
  [ACTION.WATCH]: "Watch",
  [ACTION.PAPER_TRACK]: "Paper-track",
  [ACTION.OPTION_CANDIDATE]: "Option candidate",
  [ACTION.STOCK_CANDIDATE]: "Stock candidate",
  [ACTION.SKIP_CAPITAL_INEFFICIENT]: "Skip — capital inefficient",
  [ACTION.SKIP_LIQUIDITY]: "Skip — liquidity",
  [ACTION.SKIP_NO_EDGE]: "Skip — no edge",
};

const FIT_LABEL = {
  [CAPITAL_FIT.EXCELLENT]: "Excellent",
  [CAPITAL_FIT.GOOD]: "Good",
  [CAPITAL_FIT.ACCEPTABLE]: "Acceptable",
  [CAPITAL_FIT.POOR]: "Poor",
  [CAPITAL_FIT.NOT_AFFORDABLE]: "Not affordable",
};

const REJECTION_LABEL = {
  missing_market_data: "Market data unavailable",
  insufficient_liquidity: "Insufficient liquidity",
  spread_too_wide: "Bid/ask spread too wide",
  price_outside_budget: "Share price exceeds available cash",
  no_valid_opportunity_type: "No actionable signal in this regime",
  capital_policy_rejected: "Blocked by capital policy",
  stale_data: "Quote data is stale",
  insufficient_options_data: "Options data unavailable",
  insufficient_confidence: "Signal confidence too low",
  invalid_symbol: "Symbol not recognized",
  no_viable_action: "No viable action right now",
};

// --------------------------------------------------
// FORMATTERS
// --------------------------------------------------

function fmtCurrency(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function premiumMethodLabel(premiumSource) {
  return PREMIUM_LABEL[premiumSource] || "unavailable";
}

function fitLabel(fit) {
  return FIT_LABEL[fit] || (fit ? String(fit) : "—");
}

function actionLabel(action) {
  return ACTION_LABEL[action] || (action ? String(action) : "—");
}

function rejectionLabel(reason) {
  return REJECTION_LABEL[reason] || `Rejected: ${reason || "unknown reason"}`;
}

// --------------------------------------------------
// CORE: buildLethalBoardViewModel
// --------------------------------------------------

/**
 * @param {object} scanResult           runMarketDiscoveryScan() output
 * @returns {{
 *   summary: object|null,
 *   best: object|null,
 *   rows: object[],
 *   displaced: object[],
 *   rejected: object[],
 *   warnings: string[],
 * }}
 */
export function buildLethalBoardViewModel(scanResult) {
  if (!scanResult || typeof scanResult !== "object") {
    return { summary: null, best: null, rows: [], displaced: [], rejected: [], warnings: [] };
  }

  const acct = scanResult.accountStateSummary || {};
  const stats = scanResult.universeStats || {};

  const summary = {
    scannerMode: scanResult.scannerMode || "neutral",
    regime: scanResult.regimeContext?.detectedRegime || "—",
    marketMode: acct.marketMode || scanResult.regimeContext?.marketMode || "—",
    availableCash: fmtCurrency(acct.availableCash),
    deployableCash: fmtCurrency(acct.deployableCash),
    reservedCash: fmtCurrency(acct.reservedCash),
    currentlyDeployedCash: fmtCurrency(acct.currentlyDeployedCash),
    remainingDeployableCash: fmtCurrency(acct.remainingDeployableCash),
    capitalPressureLevel: acct.capitalPressureLevel || "—",
    sizingBias: acct.sizingBias || "—",
    bestUseOfCapitalSymbol: stats.bestUseOfCapitalSymbol || null,
    totalSymbolsScanned: stats.totalSymbolsScanned ?? 0,
    candidatesGenerated: stats.candidatesGenerated ?? 0,
    rejectedCount: stats.rejectedCount ?? 0,
    optionCandidateCount: stats.optionCandidateCount ?? 0,
    sharesCandidateCount: stats.sharesCandidateCount ?? 0,
  };

  const ranked = Array.isArray(scanResult.ranked) ? scanResult.ranked : [];
  const rows = ranked.map(toRow);
  const best = ranked.find(r => r?.bestUseOfCapital) || null;
  const bestRow = best ? toBestCard(best) : null;

  const displaced = ranked
    .filter(r => r?.displacedBy)
    .map(r => ({
      symbol: r.symbol,
      currentlyOpen: false,                  // discovery layer doesn't know about open position
      displacedBy: r.displacedBy,
      capitalImpact: fmtCurrency(r.capitalRequired),
      reason: r.concentrationWarning
        || `Better capital efficiency available in ${r.displacedBy}`,
      suggestedReview: "Compare current position against the new best use of capital",
    }));

  const rejected = (Array.isArray(scanResult.rejected) ? scanResult.rejected : []).map(j => ({
    symbol: j.symbol,
    reasonCode: j.reason,
    reasonLabel: rejectionLabel(j.reason),
    detail: j.detail || "",
  }));

  const warnings = Array.isArray(scanResult.warnings) ? scanResult.warnings.slice() : [];

  return {
    summary,
    best: bestRow,
    rows,
    displaced,
    rejected,
    warnings,
  };
}

// --------------------------------------------------
// PER-ROW PROJECTION
// --------------------------------------------------

function toRow(r) {
  const reasonSummary = buildReasonSummary(r);
  return {
    rank: r.rank,
    symbol: r.symbol,
    actionCode: r.action,
    action: actionLabel(r.action),
    score: r.lethalScore,
    capitalFitCode: r.capitalFit,
    capitalFit: fitLabel(r.capitalFit),
    premiumMethod: premiumMethodLabel(r.premiumSource),
    premiumIsLive: r.premiumSource === PREMIUM_SOURCE.LIVE,
    signalQuality: probabilityToLabel(r.probabilityStatus),
    estimatedCollateral: fmtCurrency(r.capitalRequired),
    bundles: Array.isArray(r.bundles) ? r.bundles.slice(0, 3) : [],
    primaryType: r.primaryType,
    isBestUseOfCapital: !!r.bestUseOfCapital,
    displacedBy: r.displacedBy || null,
    concentrationWarning: r.concentrationWarning || null,
    regimeAlignment: r.regimeAlignment || null,
    reasonSummary,
    // Phase 4.4: per-row Why/Risks for the selected-ticker detail panel.
    // Reuses the same private helpers used by `best`. Same output shape, no
    // new internals exposed.
    keyReasons: extractKeyReasons(r),
    risks: extractRisks(r),
  };
}

function toBestCard(r) {
  return {
    symbol: r.symbol,
    actionCode: r.action,
    action: actionLabel(r.action),
    score: r.lethalScore,
    capitalFitCode: r.capitalFit,
    capitalFit: fitLabel(r.capitalFit),
    premiumMethod: premiumMethodLabel(r.premiumSource),
    premiumIsLive: r.premiumSource === PREMIUM_SOURCE.LIVE,
    estimatedCollateral: fmtCurrency(r.capitalRequired),
    bundles: Array.isArray(r.bundles) ? r.bundles.slice(0, 3) : [],
    primaryType: r.primaryType,
    keyReasons: extractKeyReasons(r),
    risks: extractRisks(r),
  };
}

function probabilityToLabel(status) {
  if (status === PROBABILITY_STATUS.AVAILABLE) return "validated";
  return "unverified";   // honest about absence of probability data
}

// --------------------------------------------------
// REASON / RISK EXTRACTION (no internal weights)
// --------------------------------------------------

function buildReasonSummary(r) {
  const parts = [];
  if (r.primaryType && r.primaryType !== "no_trade") {
    parts.push(humanizeType(r.primaryType));
  }
  if (r.regimeAlignment === "aligned") parts.push("regime aligned");
  if (r.regimeAlignment === "mismatch") parts.push("regime mismatch");
  if (r.bestUseOfCapital) parts.push("best use of remaining capital");
  if (r.displacedBy) parts.push(`displaced by ${r.displacedBy}`);
  if (r.concentrationWarning) parts.push("concentration risk");
  if (r.premiumSource === PREMIUM_SOURCE.ESTIMATED) parts.push("premium estimated");
  return parts.join(" · ");
}

function extractKeyReasons(r) {
  const out = [];
  if (r.primaryType) out.push(`Primary type: ${humanizeType(r.primaryType)}`);
  if (r.capitalFit === CAPITAL_FIT.EXCELLENT) out.push("Capital fit: excellent");
  else if (r.capitalFit === CAPITAL_FIT.GOOD) out.push("Capital fit: good");
  if (r.regimeAlignment === "aligned") out.push("Regime alignment supports the setup");
  if (Array.isArray(r.bundles) && r.bundles.length > 0) {
    out.push(`Bundle exposure: ${r.bundles.slice(0, 3).join(", ")}`);
  }
  if (r.premiumSource === PREMIUM_SOURCE.LIVE) out.push("Live options chain available");
  return out;
}

function extractRisks(r) {
  const out = [];
  if (r.capitalFit === CAPITAL_FIT.NOT_AFFORDABLE) out.push("Trade not affordable on current capital");
  if (r.capitalFit === CAPITAL_FIT.POOR) out.push("Trade exceeds remaining deployable budget");
  if (r.concentrationWarning) out.push(r.concentrationWarning);
  if (r.regimeAlignment === "mismatch") out.push("Regime currently does not favor this setup");
  if (r.premiumSource === PREMIUM_SOURCE.ESTIMATED) {
    out.push("Premium is estimated, not from a live chain — verify before entry");
  }
  if (r.premiumSource === PREMIUM_SOURCE.UNAVAILABLE) {
    out.push("No premium data available — treat option pricing as unknown");
  }
  if (r.probabilityStatus !== PROBABILITY_STATUS.AVAILABLE) {
    out.push("Probability not validated against existing engine");
  }
  return out;
}

function humanizeType(t) {
  if (!t) return "";
  return String(t).replace(/_candidate$/, "").replace(/_/g, " ");
}

export const VIEW_LABELS = Object.freeze({
  PREMIUM_LABEL,
  ACTION_LABEL,
  FIT_LABEL,
  REJECTION_LABEL,
});
