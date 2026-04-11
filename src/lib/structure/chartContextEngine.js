// =====================================================
// CHART CONTEXT ENGINE — orchestrator for structural analysis
// =====================================================
// Combines swing structure, S/R zones, supply/demand zones,
// candle patterns, and ATR extension into a unified context
// with bounded score adjustments.
//
// This is secondary confluence — it does NOT create GO signals
// by itself and does NOT override regime or core setup logic.
//
// Feature flag: set ENABLE_CHART_CONTEXT = false to disable
// all chart-context scoring (context data still available).
// =====================================================

import { analyzeSwingStructure } from "./swingStructure.js";
import { detectZones, computeATR } from "./zoneDetection.js";
import { detectSupplyDemand } from "./supplyDemand.js";
import { getRecentPatterns } from "./candlePatterns.js";

export const ENABLE_CHART_CONTEXT = true;

// Max total chart-context contribution to score
const MAX_POSITIVE = 15;
const MAX_NEGATIVE = -15;

// --------------------------------------------------
// MAIN API
// --------------------------------------------------

/**
 * Get full chart context from OHLCV bars.
 *
 * @param {object} params
 * @param {object[]} params.bars — OHLCV bars (oldest first, min 10)
 * @param {number} params.currentPrice
 * @param {number} [params.targetPrice] — T1 target for "room to target" check
 * @param {number} [params.stopPrice] — stop level for context
 * @returns {object} chart context with all layers + score adjustments
 */
export function getChartContext({ bars, currentPrice, targetPrice, stopPrice }) {
  if (!bars || bars.length < 10 || !currentPrice) {
    return _emptyContext();
  }

  // 1. Swing structure
  const swingStructure = analyzeSwingStructure(bars);

  // 2. Support / resistance zones
  const zones = detectZones(bars);

  // 3. Supply / demand zones
  const sd = detectSupplyDemand(bars);

  // 4. Candle patterns (last 10 bars)
  const candleSignals = getRecentPatterns(bars, 10);

  // 5. ATR context
  const atr = computeATR(bars);
  const atrContext = _computeATRContext(currentPrice, bars, atr);

  // 6. Room to target (is there resistance between here and T1?)
  const roomToTarget = _computeRoomToTarget(currentPrice, targetPrice, zones);

  // 7. Score adjustments (v1 scope: bounded, secondary)
  const { adjustments, scoreTrace } = ENABLE_CHART_CONTEXT
    ? _computeScoreAdjustments({
        zones, sd, candleSignals, atrContext, currentPrice,
        targetPrice, stopPrice, swingStructure,
      })
    : { adjustments: 0, scoreTrace: [] };

  // 8. Overall confidence
  const confidence = _computeConfidence(zones, sd, swingStructure, bars.length);

  return {
    candleSignals,
    swingStructure,
    supportZones: zones.supportZones,
    resistanceZones: zones.resistanceZones,
    demandZones: sd.demandZones,
    supplyZones: sd.supplyZones,
    nearestSupport: zones.nearestSupport,
    nearestResistance: zones.nearestResistance,
    nearestSupportPct: zones.nearestSupportPct,
    nearestResistancePct: zones.nearestResistancePct,
    insideDemandZone: sd.insideDemandZone,
    insideSupplyZone: sd.insideSupplyZone,
    atrContext,
    roomToTarget,
    chartScoreAdjustments: adjustments,
    scoreTrace,
    confidence,
    atr: _r2(atr),
    enabled: ENABLE_CHART_CONTEXT,
  };
}

// --------------------------------------------------
// SCORE ADJUSTMENTS (v1 scope, capped at ±15)
// --------------------------------------------------

function _computeScoreAdjustments({ zones, sd, candleSignals, atrContext, currentPrice, targetPrice, stopPrice, swingStructure }) {
  const trace = [];
  let total = 0;

  function add(pts, reason) {
    if (pts === 0) return;
    trace.push({ pts, reason, source: "chart_context" });
    total += pts;
  }

  // --- Structure/zone context (up to +10) ---

  // Fresh demand zone near entry (price within 2% of demand zone)
  if (sd.insideDemandZone || (sd.activeDemandZone && zones.nearestSupportPct != null && zones.nearestSupportPct < 0.02)) {
    const demandFresh = sd.activeDemandZone?.fresh || sd.insideDemandZone;
    if (demandFresh) {
      add(5, "Structure: fresh demand/support confluence near entry");
    }
  }

  // Clean air to T1 (no resistance between current price and target)
  if (targetPrice && zones.resistanceZones.length > 0) {
    const resistanceBetween = zones.resistanceZones.filter(z => z.mid > currentPrice && z.mid < targetPrice);
    if (resistanceBetween.length === 0) {
      add(5, "Resistance: clear air to T1");
    }
  } else if (targetPrice && zones.resistanceZones.length === 0) {
    add(5, "Resistance: clear air to T1 (no resistance detected)");
  }

  // Higher low held at demand zone (bullish structure + demand confluence)
  if (swingStructure.trendBias === "BULLISH" && sd.activeDemandZone && zones.nearestSupportPct != null && zones.nearestSupportPct < 0.03) {
    add(3, "Structure: higher low held at demand zone");
  }

  // --- Candle confirmation (up to +3) ---

  // Bullish reversal candle at support/demand zone
  const bullishCandles = candleSignals.filter(c => c.bullish && c.confidence >= 0.5);
  if (bullishCandles.length > 0 && (sd.insideDemandZone || (zones.nearestSupportPct != null && zones.nearestSupportPct < 0.02))) {
    add(3, `Candle: ${bullishCandles[0].type} at support/demand`);
  }

  // --- Penalties ---

  // Fresh supply overhead near target
  if (targetPrice && sd.activeSupplyZone && sd.activeSupplyZone.low < targetPrice * 1.02 && sd.activeSupplyZone.fresh) {
    add(-8, "Supply: fresh supply zone near target");
  }

  // Entry directly under resistance (within 1%)
  if (zones.nearestResistancePct != null && zones.nearestResistancePct < 0.01) {
    add(-6, "Resistance: entry directly under resistance");
  }

  // ATR extension penalty (don't double count existing ATR expansion logic)
  if (atrContext.extensionState === "OVEREXTENDED_UP" || atrContext.extensionState === "NEAR_PLUS_1_ATR") {
    add(-5, `ATR context: ${atrContext.extensionState.replace(/_/g, " ").toLowerCase()}`);
  }

  // Clamp total
  const clamped = Math.max(MAX_NEGATIVE, Math.min(MAX_POSITIVE, total));

  if (clamped !== total) {
    trace.push({ pts: clamped - total, reason: `Chart context capped (${total} → ${clamped})`, source: "chart_context" });
  }

  return { adjustments: clamped, scoreTrace: trace };
}

// --------------------------------------------------
// ATR EXTENSION CONTEXT
// --------------------------------------------------

function _computeATRContext(currentPrice, bars, atr) {
  if (!bars.length || atr <= 0) {
    return { distToPlus1Atr: null, distToMinus1Atr: null, extensionState: "NOT_EXTENDED" };
  }

  // Use recent close average as reference
  const recentCloses = bars.slice(-5).map(b => b.close).filter(Boolean);
  const avgRecent = recentCloses.length > 0 ? recentCloses.reduce((a, b) => a + b, 0) / recentCloses.length : currentPrice;

  const plus1Atr = avgRecent + atr;
  const minus1Atr = avgRecent - atr;

  const distToPlus = _r4((plus1Atr - currentPrice) / currentPrice);
  const distToMinus = _r4((currentPrice - minus1Atr) / currentPrice);

  let extensionState = "NOT_EXTENDED";
  if (currentPrice >= plus1Atr * 1.1) extensionState = "OVEREXTENDED_UP";
  else if (currentPrice >= plus1Atr * 0.95) extensionState = "NEAR_PLUS_1_ATR";
  else if (currentPrice <= minus1Atr * 0.9) extensionState = "OVEREXTENDED_DOWN";
  else if (currentPrice <= minus1Atr * 1.05) extensionState = "NEAR_MINUS_1_ATR";

  return {
    distToPlus1Atr: distToPlus,
    distToMinus1Atr: distToMinus,
    extensionState,
  };
}

// --------------------------------------------------
// ROOM TO TARGET
// --------------------------------------------------

function _computeRoomToTarget(currentPrice, targetPrice, zones) {
  if (!targetPrice || !currentPrice) return null;

  const distPct = _r4((targetPrice - currentPrice) / currentPrice);
  const resistanceBetween = (zones.resistanceZones || []).filter(z => z.mid > currentPrice && z.mid < targetPrice);

  return {
    distPct,
    resistanceLevels: resistanceBetween.length,
    clearPath: resistanceBetween.length === 0,
  };
}

// --------------------------------------------------
// CONFIDENCE
// --------------------------------------------------

function _computeConfidence(zones, sd, swingStructure, barCount) {
  let conf = 0.3; // base
  if (barCount >= 60) conf += 0.2;
  else if (barCount >= 30) conf += 0.1;

  if (zones.supportZones.length > 0 || zones.resistanceZones.length > 0) conf += 0.15;
  if (sd.demandZones.length > 0 || sd.supplyZones.length > 0) conf += 0.15;
  if (swingStructure.trendBias !== "NEUTRAL") conf += 0.1;

  return _r2(Math.min(0.95, conf));
}

// --------------------------------------------------
// EMPTY / HELPERS
// --------------------------------------------------

function _emptyContext() {
  return {
    candleSignals: [], swingStructure: { trendBias: "NEUTRAL", swings: { highs: [], lows: [] }, lastStructureEvent: null },
    supportZones: [], resistanceZones: [],
    demandZones: [], supplyZones: [],
    nearestSupport: null, nearestResistance: null,
    nearestSupportPct: null, nearestResistancePct: null,
    insideDemandZone: false, insideSupplyZone: false,
    atrContext: { distToPlus1Atr: null, distToMinus1Atr: null, extensionState: "NOT_EXTENDED" },
    roomToTarget: null,
    chartScoreAdjustments: 0, scoreTrace: [], confidence: 0,
    atr: 0, enabled: ENABLE_CHART_CONTEXT,
  };
}

function _r2(n) { return Math.round(n * 100) / 100; }
function _r4(n) { return Math.round(n * 10000) / 10000; }
