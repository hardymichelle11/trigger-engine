// =====================================================================
// CIO Review Dashboard Engine
// =====================================================================
// PURE aggregator. Takes pre-resolved inputs (basket profiles + per-
// basket universes + manager-assessment + history bags) and returns a
// portfolio-level summary across all CIO basket agents. The host
// (UniverseWorkspace / dashboard component) is responsible for fetching
// the inputs from the registry / universe manager / memory store so the
// engine itself stays testable without store stubs.
//
// Hard rules:
//   - Trader-facing copy only. No raw scores / weights / coefficients.
//   - No capital allocation. No auto-promote. No auto-trade.
//   - Empty / missing inputs degrade to safe empty reads, not crashes.
// =====================================================================

import { LEADERSHIP_STATUS, makeBasketUniverse } from "./basketAgentTypes.js";
import { buildBasketLeadershipRead } from "./basketLeadershipEngine.js";
import {
  buildBasketActionQueue,
  PRIORITY,
  ACTION_TYPE,
} from "./basketActionQueue.js";

const TOP_QUEUE_LIMIT = 10;
const TOP_LIST_LIMIT  = 5;

/**
 * @param {object} input
 * @param {Array<object>} input.basketProfiles
 * @param {Record<string, object>} [input.basketUniversesById]
 * @param {Record<string, object>} [input.managerAssessmentsBySymbol]
 * @param {Record<string, { outcome: { status: string } }>} [input.historyBySymbol]
 * @param {object|null} [input.marketRegime]
 * @returns {object} dashboard summary
 */
export function buildCioReviewDashboard(input = {}) {
  const at = Date.now();
  const profiles = Array.isArray(input.basketProfiles) ? input.basketProfiles : [];
  const universesById = input.basketUniversesById || {};
  const ma = input.managerAssessmentsBySymbol || {};
  const history = input.historyBySymbol || {};
  const marketRegime = input.marketRegime || null;

  const basketSummaries = [];
  const allQueueItems   = [];
  const calibrationFlags = [];
  const insufficientEvidence = [];
  const deriskingWatch = [];

  let totalActive = 0, totalWatchlist = 0, totalExcluded = 0;

  for (const profile of profiles) {
    if (!profile || !profile.basketId) continue;
    const universe = universesById[profile.basketId] || makeBasketUniverse(profile.basketId);

    const activeSyms = symbolsOf(universe.activeUniverse);
    const watchSyms  = symbolsOf(universe.watchlist);
    const excludedSyms = symbolsOf(universe.excludedSymbols);

    totalActive    += activeSyms.length;
    totalWatchlist += watchSyms.length;
    totalExcluded  += excludedSyms.length;

    const read = buildBasketLeadershipRead({
      basketProfile: profile,
      basketUniverse: universe,
      managerAssessmentsBySymbol: ma,
      historyBySymbol: history,
      marketRegime,
    });
    const queue = buildBasketActionQueue({
      basketProfile: profile,
      basketUniverse: universe,
      leadershipRead: read,
      managerAssessmentsBySymbol: ma,
      historyBySymbol: history,
    });

    // Per-basket counts and rollups.
    const highPriorityActionCount = queue.filter(
      (q) => q.priority === PRIORITY.HIGH || q.priority === PRIORITY.URGENT,
    ).length;

    // Insufficient evidence — any active or watchlist symbol with no
    // entry in the manager bag.
    const localInsufficient = [];
    for (const sym of [...activeSyms, ...watchSyms]) {
      if (!ma[sym]) localInsufficient.push(sym);
    }
    insufficientEvidence.push(
      ...localInsufficient.map((sym) => ({
        symbol: sym,
        basketId: profile.basketId,
        basketName: profile.basketName,
      })),
    );

    // Calibration flags — items with non-null calibrationFlag, plus
    // anything classified as REVIEW_CALIBRATION.
    for (const it of queue) {
      if (it.calibrationFlag) {
        calibrationFlags.push({
          symbol: it.symbol,
          basketId: it.basketId,
          basketName: it.basketName,
          flag: it.calibrationFlag,
          actionType: it.actionType,
        });
      }
    }

    // Derisking watch — fading / overextended classifications.
    for (const cls of (read?.fadingNames || [])) {
      deriskingWatch.push({
        symbol: cls.symbol,
        basketId: profile.basketId,
        basketName: profile.basketName,
        status: cls.status,
        read: cls.read,
      });
    }

    allQueueItems.push(...queue);

    const summary = {
      basketId: profile.basketId,
      basketName: profile.basketName,
      activeCount: activeSyms.length,
      watchlistCount: watchSyms.length,
      excludedCount: excludedSyms.length,
      highPriorityActionCount,
      leadershipRead: {
        leaderCount:           (read?.leaders || []).length,
        emergingLeaderCount:   (read?.emergingLeaders || []).length,
        fadingCount:           (read?.fadingNames || []).length,
        watchOnlyCount:        (read?.watchOnly || []).length,
        deriskingRead:         read?.deriskingRead || null,
        repricingRead:         read?.repricingRead || null,
        institutionalRead:     read?.institutionalRead || null,
        actionSummary:         read?.actionSummary || null,
      },
      riskRead:                read?.basketRiskLevel || "moderate",
      topLeaders:              (read?.leaders || []).slice(0, TOP_LIST_LIMIT),
      emergingLeaders:         (read?.emergingLeaders || []).slice(0, TOP_LIST_LIMIT),
      fadingNames:             (read?.fadingNames || []).slice(0, TOP_LIST_LIMIT),
      calibrationFlags:        queue
        .filter((it) => it.calibrationFlag)
        .slice(0, TOP_LIST_LIMIT)
        .map((it) => ({ symbol: it.symbol, flag: it.calibrationFlag })),
      insufficientEvidenceCount: localInsufficient.length,
      suggestedOperatorFocus: composeSuggestedOperatorFocus({
        highPriorityActionCount, queue, read, hasActive: activeSyms.length > 0,
        insufficientCount: localInsufficient.length,
      }),
    };
    basketSummaries.push(summary);
  }

  // Sort baskets so the busiest review surface rises to the top.
  basketSummaries.sort((a, b) => {
    if (b.highPriorityActionCount !== a.highPriorityActionCount) {
      return b.highPriorityActionCount - a.highPriorityActionCount;
    }
    if (b.emergingLeaders.length !== a.emergingLeaders.length) {
      return b.emergingLeaders.length - a.emergingLeaders.length;
    }
    return a.basketName.localeCompare(b.basketName);
  });

  // Top queue items across all baskets.
  const topQueueItems = sortQueueByPriority(allQueueItems).slice(0, TOP_QUEUE_LIMIT);

  // Routed sub-lists drive the four "what to do next" surfaces.
  const teReviewNeeded = allQueueItems.filter(
    (it) => it.actionType === ACTION_TYPE.SEND_TO_TE ||
            (it.actionType === ACTION_TYPE.RUN_AD_HOC_SIMULATION && it.priority !== PRIORITY.LOW),
  );
  const cvReviewNeeded = allQueueItems.filter(
    (it) => it.actionType === ACTION_TYPE.SEND_TO_CV,
  );
  const scannerPromotionCandidates = allQueueItems.filter(
    (it) => it.actionType === ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW,
  );

  const totalHighPriorityActions =
    allQueueItems.filter((it) => it.priority === PRIORITY.HIGH || it.priority === PRIORITY.URGENT).length;

  return {
    generatedAt: at,
    totalActive,
    totalWatchlist,
    totalExcluded,
    totalHighPriorityActions,
    totalCalibrationFlags: calibrationFlags.length,
    totalInsufficientEvidence: insufficientEvidence.length,
    basketSummaries,
    topQueueItems,
    calibrationFlags,
    insufficientEvidence,
    scannerPromotionCandidates,
    teReviewNeeded,
    cvReviewNeeded,
    deriskingWatch,
    actionSummary: composeTopLevelActionSummary({
      totalActive, totalHighPriorityActions, totalCalibrationFlags: calibrationFlags.length,
      totalInsufficientEvidence: insufficientEvidence.length,
      basketSummaries,
    }),
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const PRIORITY_ORDER = [PRIORITY.URGENT, PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW];

function sortQueueByPriority(items) {
  return items.slice().sort((a, b) => {
    const ai = PRIORITY_ORDER.indexOf(a.priority);
    const bi = PRIORITY_ORDER.indexOf(b.priority);
    if (ai !== bi) return ai - bi;
    return (a.symbol || "").localeCompare(b.symbol || "");
  });
}

function symbolsOf(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const r of list) {
    if (r && typeof r.symbol === "string" && r.symbol) out.push(r.symbol);
  }
  return out;
}

function composeSuggestedOperatorFocus({ highPriorityActionCount, queue, read, hasActive, insufficientCount }) {
  if (!hasActive) {
    return "No active symbols. Seed baseline leaders or add symbols manually before reviewing.";
  }
  if (highPriorityActionCount > 0) {
    return `${highPriorityActionCount} high-priority item${highPriorityActionCount === 1 ? "" : "s"} need attention.`;
  }
  if ((read?.emergingLeaders || []).length >= 2) {
    return "Basket leadership improving — review emerging names for promotion.";
  }
  if ((read?.fadingNames || []).length >= 2) {
    return "Derisking watch — multiple names fading; review for watchlist or removal.";
  }
  if (insufficientCount > 0) {
    return `${insufficientCount} symbol${insufficientCount === 1 ? "" : "s"} need manager evidence — run Ad Hoc Simulations.`;
  }
  return "No urgent review items — monitor for new manager reads or news catalysts.";
}

function composeTopLevelActionSummary({
  totalActive, totalHighPriorityActions, totalCalibrationFlags, totalInsufficientEvidence, basketSummaries,
}) {
  const parts = [];
  if (totalActive === 0) {
    parts.push("No active symbols across CIO baskets — seed baselines or add manually.");
  } else {
    parts.push(`${totalActive} active symbol${totalActive === 1 ? "" : "s"} across ${basketSummaries.length} basket${basketSummaries.length === 1 ? "" : "s"}.`);
  }
  if (totalHighPriorityActions > 0) {
    parts.push(`${totalHighPriorityActions} high-priority action${totalHighPriorityActions === 1 ? "" : "s"} pending.`);
  }
  if (totalCalibrationFlags > 0) {
    parts.push(`${totalCalibrationFlags} calibration flag${totalCalibrationFlags === 1 ? "" : "s"} for review.`);
  }
  if (totalInsufficientEvidence > 0) {
    parts.push(`${totalInsufficientEvidence} symbol${totalInsufficientEvidence === 1 ? "" : "s"} need manager evidence.`);
  }
  if (parts.length === 1) {
    parts.push("No high-priority items in the review queue.");
  }
  return parts.join(" ");
}
