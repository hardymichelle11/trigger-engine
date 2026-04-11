// =====================================================
// EVALUATOR BARREL — re-exports all evaluators + shared
// =====================================================

export { evaluatePairSetup } from "./pairEvaluator.js";
export { evaluateStandaloneSetup } from "./standaloneEvaluator.js";
export { evaluateBasketSetup } from "./basketEvaluator.js";
export { evaluateInfraFollowerSetup } from "./infraFollowerEvaluator.js";
export { evaluateStackReversalSetup } from "./stackReversalEvaluator.js";

export {
  pctChange, avg, randn, normalizeFeed, validateInstrument,
  computeRealizedVolFromRange, computeKellyLite,
} from "./shared.js";
