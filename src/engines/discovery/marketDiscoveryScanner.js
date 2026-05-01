// =====================================================
// MARKET DISCOVERY SCANNER (Phase 2 orchestrator)
// =====================================================
// Pipeline:
//   broad universe input
//     → freshness + market-data validation
//     → bundle enrichment
//     → opportunity classification
//     → existing-signal adaptation (optional)
//     → estimated premium engine
//     → capital-aware ranker
//     → structured output (ranked / rejected / displaced / stats)
//
// Hard rules:
//   - Deterministic: no Math.random. Accepts `now` for tests.
//   - Additive: imports nothing from existing engines except by
//     consuming their outputs through discoveryScoreAdapter.
//   - Uncataloged symbols are not rejected solely because they
//     are uncataloged — they are scanned, classified, and ranked
//     using whatever data is provided.
//   - All rejections carry an explicit reason code from the
//     spec list.
// =====================================================

import { evaluateCapitalPolicy } from "./capitalPolicyEngine.js";
import { classifyBundles, getCatalogStatus, getCatalogMeta } from "./bundleClassifier.js";
import { classifyOpportunity, CLASSIFIER_THRESHOLDS } from "./opportunityClassifier.js";
import { adaptExistingSignal } from "./discoveryScoreAdapter.js";
import { estimatePremium } from "./estimatedPremiumEngine.js";
import { rankCandidates } from "./capitalAwareRanker.js";
import {
  PROBABILITY_STATUS,
  PREMIUM_SOURCE,
  CATALOG_STATUS,
  ACTION,
  OPPORTUNITY_TYPE,
  safeNum,
  clamp,
} from "./types.js";

// --------------------------------------------------
// REJECTION REASONS — exact strings required by spec
// --------------------------------------------------

export const REJECTION = Object.freeze({
  MISSING_MARKET_DATA: "missing_market_data",
  INSUFFICIENT_LIQUIDITY: "insufficient_liquidity",
  SPREAD_TOO_WIDE: "spread_too_wide",
  PRICE_OUTSIDE_BUDGET: "price_outside_budget",
  NO_VALID_OPPORTUNITY_TYPE: "no_valid_opportunity_type",
  CAPITAL_POLICY_REJECTED: "capital_policy_rejected",
  STALE_DATA: "stale_data",
});

// --------------------------------------------------
// SCANNER MODE RULES — used by the orchestrator only.
// (estimatedPremiumEngine has its own mode floor.)
// --------------------------------------------------

const SCANNER_MODE_RULES = Object.freeze({
  conservative: {
    minDollarVolume: 10_000_000,
    minClassifierConfidence: 0.5,
    maxStaleSec: 5 * 60,
    rejectInsufficientPremiumData: true,
    rejectHighSpread: true,
    rejectMismatchRegime: true,
    classifierOverride: { minDollarVolume: 10_000_000 },
  },
  neutral: {
    minDollarVolume: 5_000_000,
    minClassifierConfidence: 0.3,
    maxStaleSec: 15 * 60,
    rejectInsufficientPremiumData: false,
    rejectHighSpread: false,
    rejectMismatchRegime: false,
    classifierOverride: { minDollarVolume: 5_000_000 },
  },
  aggressive: {
    minDollarVolume: 2_000_000,
    minClassifierConfidence: 0.2,
    maxStaleSec: 60 * 60,
    rejectInsufficientPremiumData: false,
    rejectHighSpread: false,
    rejectMismatchRegime: false,
    classifierOverride: { minDollarVolume: 2_000_000 },
  },
});

function pickModeRules(mode) {
  return SCANNER_MODE_RULES[mode] || SCANNER_MODE_RULES.neutral;
}

// --------------------------------------------------
// SMALL HELPERS
// --------------------------------------------------

function ageSecondsOf(record, now) {
  if (!record) return null;
  if (Number.isFinite(Number(record.timestamp))) {
    return Math.max(0, (now - Number(record.timestamp)) / 1000);
  }
  if (typeof record.asOf === "string") {
    const t = Date.parse(record.asOf);
    if (Number.isFinite(t)) return Math.max(0, (now - t) / 1000);
  }
  if (Number.isFinite(Number(record.ageSec))) return Number(record.ageSec);
  return null;
}

function dollarVolumeOf(md) {
  if (!md) return 0;
  if (Number.isFinite(Number(md.dollarVolume)) && Number(md.dollarVolume) > 0) return Number(md.dollarVolume);
  const p = safeNum(md.price);
  const v = safeNum(md.volume);
  return p > 0 && v > 0 ? p * v : 0;
}

function premiumScoreFromEstimate(est) {
  if (!est || est.method === "insufficient_data") return 0;
  const yieldVal = safeNum(est.estimatedYieldOnCollateral);
  let base = 0;
  if (yieldVal >= 0.0050) base = 10;
  else if (yieldVal >= 0.0035) base = 8;
  else if (yieldVal >= 0.0020) base = 6;
  else if (yieldVal >= 0.0010) base = 4;
  else if (yieldVal > 0) base = 2;

  // Confidence + method adjust
  if (est.method === "iv_estimated") base = Math.max(0, base - 2);
  if (est.method === "atr_estimated") base = Math.max(0, base - 4);
  if (est.confidence === "low") base = Math.max(0, base - 1);
  if (est.confidence === "high") base = Math.min(10, base + 1);
  return clamp(base, 0, 10);
}

// --------------------------------------------------
// PUBLIC: runMarketDiscoveryScan
// --------------------------------------------------

/**
 * @param {object} args
 * @param {string[]} args.symbols
 * @param {Record<string, object>} args.marketDataBySymbol
 * @param {Record<string, object>} [args.optionsDataBySymbol]
 * @param {Record<string, object>} [args.existingSetupOutputsBySymbol]
 * @param {Array<object>} [args.openPositions]
 * @param {object} args.accountState           { totalAccountValue, availableCash, maxDeployedPct, reservedCashBufferPct, marketMode }
 * @param {object} [args.regimeContext]        { detectedRegime, marketMode? }
 * @param {"conservative"|"neutral"|"aggressive"} [args.scannerMode]
 * @param {number} [args.now]                  injectable epoch ms for determinism
 * @param {object} [args.thresholdOverrides]
 */
export function runMarketDiscoveryScan(args) {
  const {
    symbols = [],
    marketDataBySymbol = {},
    optionsDataBySymbol = {},
    existingSetupOutputsBySymbol = {},
    openPositions = [],
    accountState,
    regimeContext = {},
    scannerMode = "neutral",
    now,
    thresholdOverrides = {},
  } = args || {};

  if (!accountState) throw new Error("runMarketDiscoveryScan: accountState is required");
  const generatedAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();

  const mode = (scannerMode || "neutral").toLowerCase();
  const rules = { ...pickModeRules(mode), ...(thresholdOverrides || {}) };
  const detectedRegime = regimeContext?.detectedRegime || regimeContext?.regime || null;
  const marketMode = accountState?.marketMode || regimeContext?.marketMode || "neutral";

  // 1) Capital state
  const capitalState = evaluateCapitalPolicy({ ...accountState, currentOpenPositions: openPositions, marketMode });
  const warnings = [...(capitalState.warnings || [])];

  // 2) Deduplicate + uppercase symbol list
  const seen = new Set();
  const cleanSymbols = [];
  for (const raw of symbols) {
    const s = String(raw || "").toUpperCase().trim();
    if (s && !seen.has(s)) { seen.add(s); cleanSymbols.push(s); }
  }

  const rejected = [];
  const candidates = [];

  let catalogedCount = 0;
  let uncatalogedCount = 0;

  // 3) Per-symbol pipeline
  for (const symbol of cleanSymbols) {
    const md = marketDataBySymbol[symbol] || marketDataBySymbol[symbol.toLowerCase()];
    const catalogStatus = getCatalogStatus(symbol);
    if (catalogStatus === CATALOG_STATUS.CATALOGED) catalogedCount++;
    else uncatalogedCount++;

    // 3a. missing market data
    if (!md || !Number.isFinite(Number(md.price))) {
      rejected.push({ symbol, reason: REJECTION.MISSING_MARKET_DATA, detail: "no price in marketDataBySymbol" });
      continue;
    }

    // 3b. stale data
    const age = ageSecondsOf(md, generatedAt);
    if (age != null && age > rules.maxStaleSec) {
      rejected.push({ symbol, reason: REJECTION.STALE_DATA, detail: `age ${Math.round(age)}s exceeds ${rules.maxStaleSec}s for mode '${mode}'` });
      continue;
    }

    // 3c. dollar volume floor
    const dv = dollarVolumeOf(md);
    if (dv > 0 && dv < rules.minDollarVolume) {
      rejected.push({ symbol, reason: REJECTION.INSUFFICIENT_LIQUIDITY, detail: `dollar volume ${Math.round(dv)} below ${rules.minDollarVolume} for mode '${mode}'` });
      continue;
    }

    // 3d. price-outside-budget — only if price exceeds total available cash
    //     (i.e. you literally cannot buy a single share). High-priced names
    //     are still allowed through because the ranker handles capital fit.
    if (Number(md.price) > 0 && Number(md.price) > safeNum(accountState.availableCash)) {
      rejected.push({ symbol, reason: REJECTION.PRICE_OUTSIDE_BUDGET, detail: `price ${md.price} exceeds availableCash` });
      continue;
    }

    // 3e. enrichments
    const bundleResult = classifyBundles(symbol, { sector: md.sector, industry: md.industry });
    const catalogMeta = getCatalogMeta(symbol);

    // 3f. classification
    const classification = classifyOpportunity({
      ...md,
      symbol,
      detectedRegime,
      bundles: bundleResult.bundles,
    }, { thresholds: { ...CLASSIFIER_THRESHOLDS, minDollarVolume: rules.minDollarVolume } });

    if (classification.primaryType === OPPORTUNITY_TYPE.NO_TRADE) {
      const dq = (classification.disqualifiers || []).join(" / ") || "no opportunity signal";
      const reason = /spread/.test(dq) ? REJECTION.SPREAD_TOO_WIDE
        : /dollar volume|liquidity/.test(dq) ? REJECTION.INSUFFICIENT_LIQUIDITY
        : REJECTION.NO_VALID_OPPORTUNITY_TYPE;
      rejected.push({ symbol, reason, detail: dq });
      continue;
    }

    if (classification.confidence < rules.minClassifierConfidence) {
      rejected.push({ symbol, reason: REJECTION.NO_VALID_OPPORTUNITY_TYPE,
        detail: `classifier confidence ${classification.confidence} below mode floor ${rules.minClassifierConfidence}` });
      continue;
    }

    // 3g. existing signal adapter (optional)
    const existing = existingSetupOutputsBySymbol[symbol] || null;
    const adapterOut = existing ? adaptExistingSignal(existing) : null;

    // 3h. premium engine
    const optionsChain = optionsDataBySymbol[symbol]?.chain || optionsDataBySymbol[symbol] || null;
    const premiumEstimate = estimatePremium({
      symbol,
      price: Number(md.price),
      atr: md.atr,
      iv: md.iv,
      ivPercentile: md.ivPercentile,
      optionsChain: Array.isArray(optionsChain) ? optionsChain : null,
      dteTargets: md.dteTargets,
      accountState,
      scannerMode: mode,
    });

    // 3i. mode-driven extra rejections from the premium engine
    if (rules.rejectInsufficientPremiumData && premiumEstimate.method === "insufficient_data") {
      rejected.push({ symbol, reason: REJECTION.NO_VALID_OPPORTUNITY_TYPE,
        detail: `mode '${mode}' requires premium data; got insufficient_data` });
      continue;
    }
    if (rules.rejectHighSpread && premiumEstimate.spreadRisk === "high") {
      rejected.push({ symbol, reason: REJECTION.SPREAD_TOO_WIDE,
        detail: `mode '${mode}' rejects high spread risk` });
      continue;
    }

    // 3j. mismatch-regime rejection (conservative only)
    // Implemented downstream in the ranker; we let regimeAlignment surface
    // the mismatch, but in conservative mode we surface a warning here too.
    if (rules.rejectMismatchRegime && /mismatch/i.test(classification.primaryType)) {
      // primaryType strings don't carry "mismatch" — this is a guard for future
      // use; left as a no-op now.
    }

    // 3k. assemble candidate for the ranker
    const probabilityStatus = adapterOut && Number.isFinite(adapterOut.probabilityScore) && adapterOut.probabilityScore > 0
      ? PROBABILITY_STATUS.AVAILABLE
      : PROBABILITY_STATUS.UNAVAILABLE;

    const premiumSource = premiumEstimate.premiumSource || PREMIUM_SOURCE.UNAVAILABLE;
    const premiumScore = premiumScoreFromEstimate(premiumEstimate);

    candidates.push({
      symbol,
      // raw market fields needed by the ranker
      price: Number(md.price),
      previousClose: md.previousClose,
      percentChange: md.percentChange,
      volume: md.volume,
      avgVolume: md.avgVolume,
      dollarVolume: dv,
      distanceToSupportPct: md.distanceToSupportPct,
      // classification + bundles
      classification,
      primaryType: classification.primaryType,
      opportunityTypes: classification.opportunityTypes,
      confidence: classification.confidence,
      reasons: classification.reasons,
      disqualifiers: classification.disqualifiers,
      bundles: bundleResult.bundles,
      primaryBundle: bundleResult.primaryBundle,
      concentrationTags: bundleResult.concentrationTags,
      // adapter contribution
      probabilityStatus,
      probabilityScore: adapterOut?.probabilityScore ?? 0,
      adapterSignalQuality: adapterOut?.signalQuality || "none",
      adapterUsable: adapterOut?.usableForDiscovery ?? false,
      // premium estimate
      premiumSource,
      premiumScore,
      premiumEstimate,
      // catalog metadata
      catalogStatus,
      catalogMeta,
    });
  }

  // 4) Rank survivors
  const ranked = rankCandidates({
    candidates,
    capitalState,
    detectedRegime,
    marketMode,
    currentOpenPositions: openPositions,
  });

  // 5) Universe stats
  const optionCandidateCount = ranked.filter(r => r.action === ACTION.OPTION_CANDIDATE).length;
  const sharesCandidateCount = ranked.filter(r => r.action === ACTION.STOCK_CANDIDATE).length;
  const winner = ranked.find(r => r.bestUseOfCapital) || null;
  const displaced = ranked.filter(r => r.displacedBy);

  const universeStats = {
    totalSymbolsScanned: cleanSymbols.length,
    catalogedCount,
    uncatalogedCount,
    candidatesGenerated: candidates.length,
    rejectedCount: rejected.length,
    optionCandidateCount,
    sharesCandidateCount,
    bestUseOfCapitalSymbol: winner ? winner.symbol : null,
  };

  if (capitalState.capitalPressureLevel === "MAXED") {
    warnings.push("Capital pressure MAXED — orchestrator delivering deep_scan/watch only");
  }

  return {
    generatedAt,
    scannerMode: mode,
    regimeContext: { ...regimeContext, detectedRegime, marketMode },
    accountStateSummary: {
      totalAccountValue: capitalState.totalAccountValue,
      availableCash: capitalState.availableCash,
      deployableCash: capitalState.deployableCash,
      reservedCash: capitalState.reservedCash,
      currentlyDeployedCash: capitalState.currentlyDeployedCash,
      remainingDeployableCash: capitalState.remainingDeployableCash,
      capitalPressureLevel: capitalState.capitalPressureLevel,
      sizingBias: capitalState.sizingBias,
      marketMode: capitalState.marketMode,
    },
    universeStats,
    candidates,
    ranked,
    bestUseOfCapital: winner,
    displaced,
    rejected,
    warnings,
  };
}

export const SCAN_MODE_RULES = SCANNER_MODE_RULES;
