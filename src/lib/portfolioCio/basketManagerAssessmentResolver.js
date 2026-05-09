// =====================================================================
// Basket Manager Assessment Resolver
// =====================================================================
// Translates a list of basket symbols into the input bags expected by
// buildBasketLeadershipRead:
//
//   { managerAssessmentsBySymbol: { SYM: { trigger_engine: {...}, ... } },
//     historyBySymbol:            { SYM: { outcome: { status: "..." } } } }
//
// Reads from two sources:
//   1. managerAssessmentMemoryStore — sanitized snapshots of Manager
//      Assessment Tape results recorded after each Ad Hoc Simulation /
//      CIO Audit Preview view.
//   2. adHocSimulationHistoryStore — latest history outcome per symbol
//      so calibration-watch + leadership reads can reference clues
//      like missed_winner / avoided_correctly when memory itself does
//      not carry an outcome.
//
// PURE: no React, no fetch. Falls back to empty bags whenever a store
// is unavailable so the leadership table always has a usable input.
// =====================================================================

import { getManagerAssessmentsBySymbols }
  from "./managerAssessmentMemoryStore.js";
import { getLatestForSymbol as getLatestHistoryForSymbol }
  from "../universe/adHocSimulationHistoryStore.js";
import { normalizeSymbol } from "../universe/tickerUniverseTypes.js";

/**
 * Build the manager-assessment + history bags for the leadership engine.
 *
 * @param {string[]} symbols                       active + watchlist symbols
 * @returns {{
 *   managerAssessmentsBySymbol: Record<string, Record<string, object>>,
 *   historyBySymbol: Record<string, { outcome: { status: string } }>,
 *   coverage: {
 *     covered: string[],     // symbols that have a memory snapshot
 *     missing: string[],     // symbols with no manager memory yet
 *     total: number,
 *   }
 * }}
 */
export function getBasketManagerInputs(symbols) {
  const out = {
    managerAssessmentsBySymbol: {},
    historyBySymbol: {},
    coverage: { covered: [], missing: [], total: 0 },
  };
  if (!Array.isArray(symbols)) return out;

  const seen = new Set();
  const normalized = [];
  for (const raw of symbols) {
    const sym = normalizeSymbol(raw);
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    normalized.push(sym);
  }
  out.coverage.total = normalized.length;
  if (normalized.length === 0) return out;

  // 1. Manager memory.
  const memoryBags = getManagerAssessmentsBySymbols(normalized);
  out.managerAssessmentsBySymbol = { ...memoryBags.managerAssessmentsBySymbol };
  out.historyBySymbol            = { ...memoryBags.historyBySymbol };

  // 2. Fill history clues from the ad-hoc history store when memory
  //    didn't carry one. Memory takes priority because it was written
  //    closer to the manager-tape moment.
  for (const sym of normalized) {
    if (out.historyBySymbol[sym]) continue;
    const hist = safeGetLatestHistory(sym);
    if (hist && hist.outcome && typeof hist.outcome.status === "string") {
      out.historyBySymbol[sym] = { outcome: { status: hist.outcome.status } };
    }
  }

  // 3. Coverage rollup so the UI can show a partial-data hint.
  for (const sym of normalized) {
    if (out.managerAssessmentsBySymbol[sym]) {
      out.coverage.covered.push(sym);
    } else {
      out.coverage.missing.push(sym);
    }
  }
  return out;
}

function safeGetLatestHistory(sym) {
  try {
    return getLatestHistoryForSymbol(sym);
  } catch {
    return null;
  }
}
