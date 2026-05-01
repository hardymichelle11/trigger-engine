// =====================================================
// CAPITAL-AWARE DISCOVERY SCANNER — type contracts
// =====================================================
// Phase 1 backend type definitions for the Lethal Board
// discovery layer. JSDoc typedefs + frozen enum objects.
//
// This module is purely declarative. No runtime logic,
// no random values, no fallbacks that fabricate data.
// =====================================================

// --------------------------------------------------
// ENUMS (frozen objects — string literal sources of truth)
// --------------------------------------------------

export const MARKET_MODE = Object.freeze({
  DEFENSIVE: "defensive",
  NEUTRAL: "neutral",
  RISK_ON: "risk_on",
  OPPORTUNISTIC: "opportunistic",
});

export const CAPITAL_PRESSURE = Object.freeze({
  LOW: "LOW",
  MODERATE: "MODERATE",
  HIGH: "HIGH",
  MAXED: "MAXED",
});

export const SIZING_BIAS = Object.freeze({
  SKIP: "skip",
  MICRO: "micro",
  STARTER: "starter",
  NORMAL: "normal",
  MAX_ALLOWED: "max_allowed",
});

export const CAPITAL_FIT = Object.freeze({
  EXCELLENT: "excellent",
  GOOD: "good",
  ACCEPTABLE: "acceptable",
  POOR: "poor",
  NOT_AFFORDABLE: "not_affordable",
});

export const OPPORTUNITY_TYPE = Object.freeze({
  ACCUMULATION: "accumulation_candidate",
  VOLUME_EXPANSION: "volume_expansion_candidate",
  VOLATILITY_EXPANSION: "volatility_expansion_candidate",
  CREDIT_STRESS_PREMIUM: "credit_stress_premium_candidate",
  AI_INFRA_SYMPATHY: "ai_infrastructure_sympathy_candidate",
  SEMICONDUCTOR_SYMPATHY: "semiconductor_sympathy_candidate",
  DATACENTER_POWER: "datacenter_power_candidate",
  CRYPTO_BETA: "crypto_beta_candidate",
  MEAN_REVERSION: "mean_reversion_candidate",
  BREAKOUT: "breakout_candidate",
  PULLBACK_TO_SUPPORT: "pullback_to_support_candidate",
  DEFENSIVE_ROTATION: "defensive_rotation_candidate",
  CAPITAL_INEFFICIENT: "capital_inefficient_candidate",
  WATCH_ONLY: "watch_only",
  NO_TRADE: "no_trade",
});

export const ACTION = Object.freeze({
  DEEP_SCAN: "deep_scan",
  WATCH: "watch",
  PAPER_TRACK: "paper_track",
  OPTION_CANDIDATE: "option_candidate",
  STOCK_CANDIDATE: "stock_candidate",
  SKIP_CAPITAL_INEFFICIENT: "skip_capital_inefficient",
  SKIP_LIQUIDITY: "skip_liquidity",
  SKIP_NO_EDGE: "skip_no_edge",
});

export const BUNDLE = Object.freeze({
  AI_INFRASTRUCTURE: "ai_infrastructure",
  SEMICONDUCTORS: "semiconductors",
  DATACENTER_POWER: "datacenter_power",
  ENERGY_GRID: "energy_grid",
  ROBOTICS_ENABLERS: "robotics_enablers",
  CLOUD_HYPERSCALERS: "cloud_hyperscalers",
  CRYPTO_BETA: "crypto_beta",
  FINANCIALS_CREDIT: "financials_credit",
  DEFENSIVE_DIVIDEND: "defensive_dividend",
  CONSUMER_MOMENTUM: "consumer_momentum",
  BROAD_MARKET_ETF: "broad_market_etf",
  UNKNOWN: "unknown",
});

export const SCANNER_STATE_EVENT = Object.freeze({
  NEW_BEST_OPPORTUNITY: "new_best_opportunity",
  TRADE_DISPLACED: "trade_displaced_by_better_opportunity",
  NO_CHANGE: "no_change",
});

export const CATALOG_STATUS = Object.freeze({
  CATALOGED: "cataloged",
  UNCATALOGED: "uncataloged",
});

export const PROBABILITY_STATUS = Object.freeze({
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
});

export const PREMIUM_SOURCE = Object.freeze({
  LIVE: "live",
  ESTIMATED: "estimated",
  UNAVAILABLE: "unavailable",
});

// --------------------------------------------------
// JSDoc TYPEDEFS — referenced by other modules
// --------------------------------------------------

/**
 * @typedef {"defensive"|"neutral"|"risk_on"|"opportunistic"} MarketMode
 * @typedef {"LOW"|"MODERATE"|"HIGH"|"MAXED"} CapitalPressureLevel
 * @typedef {"skip"|"micro"|"starter"|"normal"|"max_allowed"} SizingBias
 * @typedef {"excellent"|"good"|"acceptable"|"poor"|"not_affordable"} CapitalFit
 * @typedef {"cataloged"|"uncataloged"} CatalogStatus
 * @typedef {"available"|"unavailable"} ProbabilityStatus
 * @typedef {"live"|"estimated"|"unavailable"} PremiumSource
 */

/**
 * @typedef {object} OpenPosition
 * @property {string} symbol
 * @property {string} [strategy]            short_put | covered_call | long_stock | ...
 * @property {number} [strike]              required when strategy is short_put
 * @property {number} [contracts]
 * @property {number} [collateral]          if explicitly known, overrides derived
 * @property {string} [primaryBundle]       hint for concentration check
 */

/**
 * @typedef {object} CapitalPolicyInput
 * @property {number} totalAccountValue     informational
 * @property {number} availableCash         BASIS for deployable + reserved math
 * @property {number} maxDeployedPct        0..1, applied to availableCash
 * @property {number} reservedCashBufferPct 0..1, applied to availableCash
 * @property {OpenPosition[]} [currentOpenPositions]
 * @property {MarketMode} [marketMode]
 */

/**
 * @typedef {object} CapitalPolicyState
 * @property {number} totalAccountValue
 * @property {number} availableCash
 * @property {number} deployableCash
 * @property {number} reservedCash
 * @property {number} currentlyDeployedCash
 * @property {number} remainingDeployableCash
 * @property {CapitalPressureLevel} capitalPressureLevel
 * @property {MarketMode} marketMode
 * @property {SizingBias} sizingBias
 * @property {string[]} warnings
 */

/**
 * @typedef {object} CatalogMeta
 * @property {string} sector
 * @property {string} category
 * @property {string[]} tags
 * @property {CatalogStatus} catalogStatus
 */

/**
 * @typedef {object} BundleResult
 * @property {string} symbol
 * @property {string[]} bundles
 * @property {string} primaryBundle
 * @property {string[]} concentrationTags
 * @property {string[]} relatedSymbols
 */

/**
 * @typedef {object} RawCandidate
 * @property {string} symbol
 * @property {number} [price]
 * @property {number} [previousClose]
 * @property {number} [percentChange]
 * @property {number} [volume]
 * @property {number} [avgVolume]
 * @property {number} [dollarVolume]
 * @property {number} [atr]
 * @property {number} [atrExpansion]
 * @property {number} [iv]
 * @property {number} [ivPercentile]
 * @property {number} [beta]
 * @property {string} [sector]
 * @property {string} [industry]
 * @property {number} [marketCap]
 * @property {string} [trend]                 "up"|"down"|"sideways"
 * @property {number} [distanceToSupportPct]
 * @property {number} [distanceToResistancePct]
 * @property {boolean} [near20DayHigh]
 * @property {boolean} [recentRangeBreakout]
 * @property {string} [detectedRegime]        from existing macroRegime
 * @property {string} [source]
 */

/**
 * @typedef {object} ClassificationResult
 * @property {string} symbol
 * @property {string[]} opportunityTypes
 * @property {string} primaryType
 * @property {number} confidence              0..1
 * @property {string[]} reasons
 * @property {string[]} disqualifiers
 */

/**
 * @typedef {object} ScoreBreakdown
 * @property {number} capitalFitScore
 * @property {number} opportunityScore
 * @property {number} regimeScore
 * @property {number} liquidityScore
 * @property {number} bundleScore
 * @property {number} probabilityScore
 * @property {number} premiumScore
 * @property {number} structureScore
 * @property {number} concentrationPenalty
 * @property {number} liquidityPenalty
 */

/**
 * @typedef {object} RankedCandidate
 * @property {number} rank
 * @property {string} symbol
 * @property {number} price
 * @property {string} primaryType
 * @property {string[]} opportunityTypes
 * @property {string[]} bundles
 * @property {number} lethalScore             0..100
 * @property {ScoreBreakdown} scoreBreakdown
 * @property {number} capitalRequired
 * @property {CapitalFit} capitalFit
 * @property {number} remainingDeployableAfterTrade
 * @property {boolean} bestUseOfCapital
 * @property {string|null} displacedBy
 * @property {string|null} concentrationWarning
 * @property {string} regimeAlignment         "aligned"|"neutral"|"mismatch"
 * @property {string} action
 * @property {string} explanation
 * @property {ProbabilityStatus} probabilityStatus
 * @property {PremiumSource} premiumSource
 */

/**
 * @typedef {object} ScannerStateSnapshot
 * @property {number|null} lastScanTimestamp
 * @property {string|null} previousTopSymbol
 * @property {string|null} previousTopSetupId
 * @property {number|null} previousTopRank
 * @property {number|null} previousTopScore
 */

// --------------------------------------------------
// SHARED VALIDATORS — small, pure
// --------------------------------------------------

/**
 * Verify a value is a finite number; otherwise return fallback.
 * Mirrors src/lib/engine/config.js#safeNumber but kept local to
 * keep the discovery package import-free of engine internals.
 * @param {*} n
 * @param {number} [fallback]
 * @returns {number}
 */
export function safeNum(n, fallback = 0) {
  return Number.isFinite(Number(n)) ? Number(n) : fallback;
}

/**
 * @param {number} n @param {number} min @param {number} max
 */
export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * @param {number} n
 */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
