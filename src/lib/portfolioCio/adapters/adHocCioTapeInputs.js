// =====================================================================
// Ad Hoc CIO Tape Inputs — composer
// =====================================================================
// Single helper that bundles the three ad-hoc adapters (MI / TE / CV)
// into the input-bag shape consumed by buildManagerAssessmentTape().
// All other required-agent slots are intentionally omitted so the tape
// renders the standard "Insufficient evidence" fallback for managers
// that haven't produced a read yet.
//
// PURE: no I/O, no React.
// =====================================================================

import { marketIntelligenceToAssessment } from "./marketIntelligenceAssessmentAdapter.js";
import { teSimulationToAssessment } from "./teSimulationAssessmentAdapter.js";
import { cvSimulationToAssessment } from "./cvSimulationAssessmentAdapter.js";

/**
 * @param {object} input
 * @param {string} [input.symbol]
 * @param {object|null} [input.simResult]            output of simulateAdHoc()
 * @param {object|null} [input.intelligenceResult]   output of
 *   initializeMarketIntelligenceForSymbol()
 * @param {object|null} [input.historyRecord]        latest ad-hoc history
 *   record for the symbol; passed through to the tape so calibration
 *   watch can use missed_winner / avoided_correctly clues.
 * @returns {{ symbol: string|null, inputs: object, history: object|null }}
 */
export function buildAdHocCioTapeInputs(input = {}) {
  const symbol = typeof input.symbol === "string" ? input.symbol.toUpperCase() : null;
  const simResult = input.simResult || null;
  const intelligenceResult = input.intelligenceResult || null;
  const historyRecord = input.historyRecord || null;

  const inputs = {};

  const mi = marketIntelligenceToAssessment({
    symbol, marketIntelligenceResult: intelligenceResult,
  });
  if (mi) inputs.market_intel = mi;

  const te = teSimulationToAssessment({ symbol, simResult });
  if (te) inputs.trigger_engine = te;

  const cv = cvSimulationToAssessment({ symbol, simResult });
  if (cv) inputs.credit_view = cv;

  return {
    symbol,
    inputs,
    history: historyRecord,
  };
}
