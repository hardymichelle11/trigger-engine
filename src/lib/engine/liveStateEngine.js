// =====================================================
// LIVE STATE ENGINE — universal recalibration framework
// =====================================================
// Splits every card into setupDefinition + liveMarketState
// + derivedState. Recalculates derivedState when material
// inputs change. Generic across all setup types.
//
// Core rule: signals can be historical, but cards must be live.
// =====================================================

import { round2, safeNumber } from "./config.js";
import { recordRecalcEvent, recordInvalidationEvent } from "./opsEventCollector.js";

// --------------------------------------------------
// TELEMETRY — structured recalibration event log
// --------------------------------------------------

let _debugMode = false;
const _recalcLog = [];
const MAX_LOG_SIZE = 200;

export function enableDebugMode(on = true) { _debugMode = on; }
export function getRecalcLog() { return [..._recalcLog]; }
export function clearRecalcLog() { _recalcLog.length = 0; }

function _logRecalcEvent(event) {
  const entry = { ...event, timestamp: Date.now() };
  _recalcLog.push(entry);
  if (_recalcLog.length > MAX_LOG_SIZE) _recalcLog.shift();
  if (_debugMode) {
    console.log(`  [recalc] ${entry.symbol || "?"}: ${entry.type} — ${(entry.reasons || []).join(", ")}`);
  }
}

// --------------------------------------------------
// REASON CATEGORIES — normalized reason codes
// --------------------------------------------------

export const RECALC_REASON_CODES = {
  PRICE_DRIFT:       "price_drift",
  PROXY_DRIFT:       "proxy_drift",
  LEADER_DRIFT:      "leader_drift",
  LEVERAGE_GAP:      "leverage_gap_drift",
  IV_SHIFT:          "iv_shift",
  ATR_SHIFT:         "atr_shift",
  REGIME_CHANGE:     "regime_change",
  NEW_BAR:           "new_bar",
  FRESHNESS_TTL:     "freshness_ttl",
  MC_TTL:            "mc_ttl",
  NO_PREVIOUS_STATE: "no_previous_state",
};

// --------------------------------------------------
// THRESHOLDS — trigger recalculation when exceeded
// --------------------------------------------------

export const RECALC_THRESHOLDS = {
  // Price drift from last anchor (fractional)
  equity:           0.015,  // 1.5% for stocks/ETFs
  leveragedProxy:   0.025,  // 2.5% for leveraged products
  option:           0.015,  // 1.5% for options underlyings

  // Cross-asset / proxy
  leverageGapDrift: 0.005,  // 0.5% leverage gap change
  ivChangePct:      0.10,   // 10% relative IV change (e.g. 50→55)
  atrChangePct:     0.15,   // 15% relative ATR change

  // Freshness TTL (ms)
  freshnessTtlMs:   90_000,  // 90 seconds max staleness
  mcCacheTtlMs:     120_000, // 2 minutes for MC results
};

// --------------------------------------------------
// shouldRecalculate — universal trigger check
// --------------------------------------------------

/**
 * Determine if a setup's derivedState should be recomputed.
 * Works for all setup types: equity, ETF, leveraged, options, pair.
 *
 * @param {object} prev — previous liveMarketState snapshot
 * @param {object} next — current liveMarketState snapshot
 * @param {object} [derived] — current derivedState (for timestamp check)
 * @returns {{ recalc: boolean, reasons: string[] }}
 */
export function shouldRecalculate(prev, next, derived) {
  if (!prev || !next) return { recalc: true, reasons: ["no_previous_state"], reasonCodes: [RECALC_REASON_CODES.NO_PREVIOUS_STATE] };

  const reasons = [];
  const reasonCodes = [];
  const T = RECALC_THRESHOLDS;

  // 1. Price drift
  const priceThreshold = next.isLeveraged ? T.leveragedProxy : T.equity;
  if (prev.price > 0 && next.price > 0) {
    const priceDrift = Math.abs(next.price - prev.price) / prev.price;
    if (priceDrift >= priceThreshold) {
      const code = next.isLeveraged ? RECALC_REASON_CODES.PROXY_DRIFT : RECALC_REASON_CODES.PRICE_DRIFT;
      reasons.push(`price_drift_${(priceDrift * 100).toFixed(1)}pct`);
      reasonCodes.push(code);
    }
  }

  // 2. Leader price drift (for pair/stack setups)
  if (prev.leaderPrice > 0 && next.leaderPrice > 0) {
    const leaderDrift = Math.abs(next.leaderPrice - prev.leaderPrice) / prev.leaderPrice;
    if (leaderDrift >= T.equity) {
      reasons.push(`leader_drift_${(leaderDrift * 100).toFixed(1)}pct`);
      reasonCodes.push(RECALC_REASON_CODES.LEADER_DRIFT);
    }
  }

  // 3. Leverage gap drift
  if (prev.leverageGap != null && next.leverageGap != null) {
    const gapDrift = Math.abs(next.leverageGap - prev.leverageGap);
    if (gapDrift >= T.leverageGapDrift) {
      reasons.push(`leverage_gap_drift_${(gapDrift * 100).toFixed(2)}pct`);
      reasonCodes.push(RECALC_REASON_CODES.LEVERAGE_GAP);
    }
  }

  // 4. IV change
  if (prev.ivPercentile > 0 && next.ivPercentile > 0) {
    const ivDelta = Math.abs(next.ivPercentile - prev.ivPercentile);
    if (ivDelta / prev.ivPercentile >= T.ivChangePct) {
      reasons.push(`iv_change_${ivDelta.toFixed(0)}pts`);
      reasonCodes.push(RECALC_REASON_CODES.IV_SHIFT);
    }
  }

  // 5. ATR change
  if (prev.atrExpansion > 0 && next.atrExpansion > 0) {
    const atrDelta = Math.abs(next.atrExpansion - prev.atrExpansion);
    if (atrDelta / prev.atrExpansion >= T.atrChangePct) {
      reasons.push("atr_change");
      reasonCodes.push(RECALC_REASON_CODES.ATR_SHIFT);
    }
  }

  // 6. Regime change
  if (prev.regime && next.regime && prev.regime !== next.regime) {
    reasons.push(`regime_change_${prev.regime}_to_${next.regime}`);
    reasonCodes.push(RECALC_REASON_CODES.REGIME_CHANGE);
  }

  // 7. Freshness TTL
  if (derived?.calculatedAt) {
    const age = Date.now() - derived.calculatedAt;
    if (age >= T.freshnessTtlMs) {
      reasons.push(`ttl_expired_${Math.round(age / 1000)}s`);
      reasonCodes.push(RECALC_REASON_CODES.FRESHNESS_TTL);
    }
  }

  // 8. New bar close
  if (next.barTimestamp && prev.barTimestamp && next.barTimestamp > prev.barTimestamp) {
    reasons.push("new_bar_close");
    reasonCodes.push(RECALC_REASON_CODES.NEW_BAR);
  }

  return { recalc: reasons.length > 0, reasons, reasonCodes };
}

// --------------------------------------------------
// extractLiveMarketState — from quote + context
// --------------------------------------------------

/**
 * Extract liveMarketState from a card's raw inputs.
 * Works for any setup type.
 *
 * @param {object} params
 * @returns {object} liveMarketState
 */
export function extractLiveMarketState(params) {
  return {
    price:          safeNumber(params.price),
    leaderPrice:    safeNumber(params.leaderPrice),
    followerPrice:  safeNumber(params.followerPrice),
    leverageGap:    params.leverageGap ?? null,
    ivPercentile:   safeNumber(params.ivPercentile),
    atrExpansion:   safeNumber(params.atrExpansion, 1),
    regime:         params.regime || null,
    regimeScore:    safeNumber(params.regimeScore),
    vixState:       params.vixState || null,
    isLeveraged:    params.isLeveraged || false,
    barTimestamp:    params.barTimestamp || null,
    snapshotTime:   params.snapshotTime || Date.now(),
  };
}

// --------------------------------------------------
// buildDynamicTargets — rebuild ladder from current anchor
// --------------------------------------------------

/**
 * Compute dynamic T1/T2/T3 targets from current anchor price
 * and current volatility/regime, rather than static config.
 *
 * For setups with fixed targets (config-defined), this validates
 * the distance and flags if targets are no longer reachable.
 *
 * @param {object} params
 * @returns {object} dynamicTargets
 */
export function buildDynamicTargets(params) {
  const {
    anchor,           // current price (leader or follower)
    staticTargets,    // [T1, T2, T3] from config (may be null)
    staticStop,       // stop from config (may be null)
    dailyVol,         // current daily vol estimate
    horizon = 10,     // trading days horizon
    regime,           // current regime string
  } = params;

  if (!anchor || anchor <= 0) {
    return { targets: [], stop: null, expectedMove: 0, anchor, method: "none" };
  }

  const vol = Math.max(dailyVol || 0.02, 0.005);
  const expectedMove = round2(anchor * vol * Math.sqrt(horizon));

  // If static targets exist, validate distance from current anchor
  if (staticTargets && staticTargets.length > 0) {
    const targets = staticTargets.map((t, i) => {
      const distPct = round2(((t - anchor) / anchor) * 100);
      const reachable = Math.abs(distPct) < 25; // within 25% is plausible
      return {
        level: t,
        label: `T${i + 1}`,
        distPct,
        reachable,
      };
    });

    const stop = staticStop ? {
      level: staticStop,
      distPct: round2(((anchor - staticStop) / anchor) * 100),
    } : null;

    return {
      targets,
      stop,
      expectedMove,
      anchor,
      method: "static_validated",
    };
  }

  // Dynamic targets: derive from current vol and regime
  const regimeMultiplier = _regimeVolMultiplier(regime);
  const adjVol = vol * regimeMultiplier;
  const em = anchor * adjVol * Math.sqrt(horizon);

  return {
    targets: [
      { level: round2(anchor + em * 1.0), label: "T1", distPct: round2((em / anchor) * 100), reachable: true },
      { level: round2(anchor + em * 1.5), label: "T2", distPct: round2((em * 1.5 / anchor) * 100), reachable: true },
      { level: round2(anchor + em * 2.0), label: "T3", distPct: round2((em * 2.0 / anchor) * 100), reachable: true },
    ],
    stop: {
      level: round2(anchor - em * 0.8),
      distPct: round2((em * 0.8 / anchor) * 100),
    },
    expectedMove: round2(em),
    anchor,
    method: "dynamic",
  };
}

function _regimeVolMultiplier(regime) {
  if (!regime) return 1.0;
  switch (regime) {
    case "RISK_ON":                   return 0.85;
    case "VOLATILE_BUT_CONTAINED":    return 1.1;
    case "CREDIT_STRESS_WATCH":       return 1.3;
    case "HIGH_PREMIUM_ENVIRONMENT":  return 1.5;
    case "LOW_EDGE":                  return 1.0;
    default:                          return 1.0;
  }
}

// --------------------------------------------------
// invalidateDerivedState — mark state as stale
// --------------------------------------------------

/**
 * Create an invalidated derivedState placeholder.
 * UI should show "recalibrating" instead of old values.
 *
 * @param {string} reason
 * @returns {object}
 */
export function invalidateDerivedState(reason) {
  return {
    stale: true,
    invalidatedAt: Date.now(),
    invalidationReason: reason,
    targets: null,
    stop: null,
    mcResult: null,
    score: null,
    signal: null,
    gates: null,
  };
}

// --------------------------------------------------
// getFreshnessStatus — for UI display
// --------------------------------------------------

/**
 * Get freshness status for a card's derivedState.
 *
 * @param {object} card — card with liveState attached
 * @returns {object} { fresh, stale, ageMs, ageSec, label, anchorPrice, regime, volSource }
 */
export function getFreshnessStatus(card) {
  const ls = card?.liveState;
  if (!ls) return { fresh: false, stale: true, ageMs: Infinity, ageSec: Infinity, label: "NO DATA" };

  const now = Date.now();
  const calcTime = ls.calculatedAt || 0;
  const ageMs = now - calcTime;
  const ageSec = Math.round(ageMs / 1000);
  const T = RECALC_THRESHOLDS;

  const stale = ls.stale === true || ageMs >= T.freshnessTtlMs;

  let label = "LIVE";
  if (stale) label = "STALE";
  else if (ageMs >= T.freshnessTtlMs * 0.8) label = "AGING";

  // Check anchor drift
  let anchorDrift = 0;
  if (ls.anchorPrice > 0 && card.price > 0) {
    anchorDrift = Math.abs(card.price - ls.anchorPrice) / ls.anchorPrice;
  }
  if (anchorDrift >= 0.02) {
    label = "STALE";
  }

  return {
    fresh: !stale && anchorDrift < 0.02,
    stale: stale || anchorDrift >= 0.02,
    ageMs,
    ageSec,
    label,
    anchorPrice: ls.anchorPrice || null,
    anchorDrift: round2(anchorDrift * 100),
    regime: ls.regime || null,
    volSource: ls.volSource || null,
    calculatedAt: calcTime,
  };
}

// --------------------------------------------------
// renderSafeCardState — prevent stale display
// --------------------------------------------------

/**
 * Returns card values safe for display.
 * If stale, replaces analytics with null so UI shows "recalibrating".
 *
 * @param {object} card
 * @returns {object} safeCard
 */
export function renderSafeCardState(card) {
  const freshness = getFreshnessStatus(card);

  if (freshness.fresh) {
    return { ...card, freshness, invalidation: null };
  }

  // Build invalidation detail
  const reasons = [];
  if (freshness.ageSec > 90) reasons.push("freshness_ttl");
  if (freshness.anchorDrift >= 2) reasons.push("anchor_drift");
  if (card.liveState?.stale) reasons.push("marked_stale");

  const invalidation = {
    stale: true,
    reasons,
    anchorDrift: freshness.anchorDrift,
    ageSec: freshness.ageSec,
    anchorPrice: freshness.anchorPrice,
    currentPrice: card.price,
    suppressedFields: ["probability", "recommendation", "distT1Pct"],
  };

  _logRecalcEvent({ type: "invalidate", symbol: card.symbol, reasons, anchorDrift: freshness.anchorDrift, ageSec: freshness.ageSec });
  // Persist to localStorage for BQ flush
  recordInvalidationEvent({ symbol: card.symbol, reasons, anchorDriftPct: freshness.anchorDrift, ageSeconds: freshness.ageSec, anchorPrice: freshness.anchorPrice, currentPrice: card.price });

  // Stale: null out derived analytics but preserve identity/thesis
  return {
    ...card,
    freshness,
    invalidation,
    probability: null,
    recommendation: null,
    ladder: card.ladder ? { ...card.ladder, stale: true } : null,
    metrics: card.metrics ? {
      ...card.metrics,
      distT1Pct: null,
    } : null,
  };
}

// --------------------------------------------------
// buildLiveState — compute full liveState for a card
// --------------------------------------------------

/**
 * Compute the liveState for a card from current market inputs.
 * This is the function that replaces snapshot-based analytics
 * with current-anchor-based analytics.
 *
 * @param {object} params
 * @returns {object} liveState to attach to card
 */
export function buildLiveState(params) {
  const {
    price,
    leaderPrice,
    ivPercentile,
    atrExpansion,
    regime,
    regimeScore,
    vixState,
    staticTargets,
    staticStop,
    isLeveraged,
    leverageGap,
    recalcReasons,
    recalcReasonCodes,
    symbol,
  } = params;

  const anchor = safeNumber(price);
  const iv = safeNumber(ivPercentile, 50);
  const atr = safeNumber(atrExpansion, 1);

  // Compute daily vol from IV
  const annualizedIV = 0.15 + (iv / 100) * 0.85;
  const dailyVol = (annualizedIV / Math.sqrt(252)) * atr;

  // Build dynamic targets
  const dynamicTargets = buildDynamicTargets({
    anchor,
    staticTargets,
    staticStop,
    dailyVol,
    horizon: 10,
    regime,
  });

  const liveState = {
    anchorPrice: anchor,
    leaderPrice: safeNumber(leaderPrice),
    leverageGap: leverageGap ?? null,
    ivPercentile: iv,
    atrExpansion: atr,
    dailyVol: round2(dailyVol * 10000) / 10000,
    annualizedIV: round2(annualizedIV),
    regime,
    regimeScore: safeNumber(regimeScore),
    vixState,
    isLeveraged: !!isLeveraged,
    dynamicTargets,
    calculatedAt: Date.now(),
    stale: false,
    volSource: iv > 0 ? "iv_percentile" : "atr_estimate",
    // Recalculation audit trail
    lastRecalcReasons: recalcReasons || [],
    lastRecalcReasonCodes: recalcReasonCodes || [],
  };

  // Log telemetry (in-memory)
  if (recalcReasons && recalcReasons.length > 0) {
    _logRecalcEvent({ type: "recalculate", symbol, reasons: recalcReasons, reasonCodes: recalcReasonCodes, anchor });
    // Persist to localStorage for BQ flush
    recordRecalcEvent({ symbol, reasonCodes: recalcReasonCodes, anchorPrice: anchor, regime, ivPercentile: iv });
  }

  return liveState;
}

// --------------------------------------------------
// mcCacheValid — check if MC results can be reused
// --------------------------------------------------

/**
 * Check if cached Monte Carlo results are still valid.
 *
 * @param {object} mcCache — { anchorPrice, iv, regime, timestamp }
 * @param {object} current — current liveMarketState
 * @returns {boolean}
 */
// --------------------------------------------------
// isAlertSafe — prevent alerts from stale cards
// --------------------------------------------------

/**
 * Check if a card is safe to use for alert evaluation.
 * Alerts must only fire on fresh derivedState.
 *
 * @param {object} card
 * @returns {{ safe: boolean, reason: string|null }}
 */
export function isAlertSafe(card) {
  if (!card) return { safe: false, reason: "no_card" };

  // Must have liveState
  if (!card.liveState) return { safe: false, reason: "no_live_state" };

  // Must not be stale
  if (card.liveState.stale) return { safe: false, reason: "stale_live_state" };

  // Check freshness
  const freshness = getFreshnessStatus(card);
  if (freshness.stale) return { safe: false, reason: `stale_${freshness.label.toLowerCase()}` };

  // Anchor drift check
  if (freshness.anchorDrift >= 2) return { safe: false, reason: `anchor_drift_${freshness.anchorDrift}pct` };

  // Must have valid probability (MC not expired)
  if (!card.probability) return { safe: false, reason: "no_probability" };

  // MC must be from same anchor (check assumptions)
  if (card.probability.method === "monte_carlo" && card.liveState.anchorPrice > 0 && card.price > 0) {
    const mcDrift = Math.abs(card.price - card.liveState.anchorPrice) / card.liveState.anchorPrice;
    if (mcDrift >= RECALC_THRESHOLDS.equity) {
      return { safe: false, reason: "mc_anchor_mismatch" };
    }
  }

  return { safe: true, reason: null };
}

export function mcCacheValid(mcCache, current) {
  if (!mcCache || !mcCache.timestamp) return false;

  const T = RECALC_THRESHOLDS;
  const age = Date.now() - mcCache.timestamp;
  if (age >= T.mcCacheTtlMs) return false;

  // Anchor price drift
  if (mcCache.anchorPrice > 0 && current.price > 0) {
    const drift = Math.abs(current.price - mcCache.anchorPrice) / mcCache.anchorPrice;
    if (drift >= T.equity) return false;
  }

  // IV drift
  if (mcCache.iv > 0 && current.ivPercentile > 0) {
    const ivDrift = Math.abs(current.ivPercentile - mcCache.iv) / mcCache.iv;
    if (ivDrift >= T.ivChangePct) return false;
  }

  // Regime change
  if (mcCache.regime && current.regime && mcCache.regime !== current.regime) return false;

  return true;
}
