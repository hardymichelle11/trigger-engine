// =====================================================================
// CREDIT VIEW NARRATIVE — accumulation-aware credit decision aid
// =====================================================================
// Replaces the disconnected risk-condition rows in the Credit View with a
// single trader-readable paragraph PLUS a structured set of fields the
// UI can lay out section-by-section:
//
//   recommendation          — one of the 9 CREDIT_RECOMMENDATIONS states
//   triggers                — which CREDIT_TRIGGERS fired
//   triggerSentence         — "Trigger A + Trigger B + Trigger C"
//   confirmation            — { priceFloor, vixFloor, premiumFloor,
//                               spreadCeilingPct, requireNoLowerLowAfter2pm,
//                               sentence, conditions[] }
//   invalidation            — { priceBreak, vixCollapse, premiumCollapse,
//                               spreadCeilingPct, newLowAfter2pm,
//                               newsShockClause, sentence, conditions[] }
//   bestStrikeZone          — { low, high, label }
//   minimumPremium          — { value, label }
//   managementNote          — wheel / assignment-readiness reminder
//   riskNarrative           — concatenated paragraph
//
//   Backward-compat fields kept for the existing UI and unit suite:
//   recommendationLabel, conservativeConcern, accumulationInterpretation,
//   confirmationSentence, invalidationSentence, executionReadiness,
//   oldModelWouldHaveBlocked.
//
// Accumulation mode:
//   When `marketPhase === "accumulation"` (or `accumulationMode: true`),
//   the model downshifts its conservatism per the upgraded decision
//   matrix — late-session + elevated VIX + price holding support
//   becomes a CANDIDATE, not an avoid.
//
// Hard rules:
//   - PURE function. No state, no I/O.
//   - Never expose raw scores or internal weights.
//   - When inputs are missing, fall back to honest "—" / explicit
//     "further confirmation required" copy rather than fabricating.
// =====================================================================

// ---------------------------------------------------------------------
// THRESHOLDS
// ---------------------------------------------------------------------

const VIX_FEAR_FLOOR  = 16;   // narrative threshold; below = "contained"
const VIX_FEAR_HIGH   = 21;   // matches CONFIG.macro.vixFearLow
const VIX_PANIC       = 28;   // matches MARKET_REGIME.vix.fearThreshold
const VIX_DROP_DELTA  = 1.0;  // VIX must drop this much to trigger collapse
const SUPPORT_NEAR_PCT  = 0.025;     // ≤ 2.5% above support
const SUPPORT_EXTENDED_PCT = 0.07;   // > 7% above support → extended
const PREMIUM_HOLD_FLOOR_RATIO = 0.85;
const PREMIUM_COLLAPSE_RATIO   = 0.60;
const SPREAD_PCT_OK_CONFIRM = 0.12;  // 12% of mid OK at entry
const SPREAD_PCT_INVALIDATE = 0.18;  // 18% widens → kill
const INVALIDATION_BREAK_PCT = 0.01; // 1% below support breaks setup
const PREMIUM_RICH_IV_PCT = 70;
const PREMIUM_OK_IV_PCT   = 50;
const PREMIUM_LOW_IV_PCT  = 40;
const PREMIUM_FLOOR_IV_PCT = 30;
const TWO_PM_START = 14 * 60;        // 14:00 ET
const TWO_PM_END   = 15 * 60 + 30;   // 15:30 ET
const PREMIUM_PERCENTILE_RICH = 80;  // historical premium percentile

// ---------------------------------------------------------------------
// ENUMS
// ---------------------------------------------------------------------

export const CREDIT_RECOMMENDATIONS = Object.freeze({
  STRONG_ENTRY:         "Strong Credit Entry",
  ACCUMULATION_ENTRY:   "Accumulation Entry",
  TWO_PM_HARVEST:       "2PM Premium Harvest",
  LATE_CONFIRMATION:    "Late Window — Require Confirmation",
  WAIT_FOR_PULLBACK:    "Wait for Better Price",
  WAIT_FOR_PREMIUM:     "Wait for Better Premium",
  AVOID_BREAKDOWN:      "Avoid — Breakdown Risk",
  AVOID_POOR_CREDIT:    "Avoid — Poor Premium/Spread",
  NO_TRADE_INVALIDATED: "No Trade — Invalidated",
});

export const CREDIT_TRIGGERS = Object.freeze({
  PREMIUM_EXPANSION:           "Premium expansion detected",
  SUPPORT_HOLD:                "Price holding above support",
  VIX_ELEVATED:                "VIX remains elevated",
  FEAR_OVERPRICING:            "Fear premium appears overpricing downside risk",
  ACCUMULATION_PHASE:          "Accumulation behavior detected",
  POST_SELL_OFF_STABILIZATION: "Post-selloff stabilization",
  TWO_PM_PREMIUM_WINDOW:       "2PM premium window active",
  WHEEL_ACCEPTABLE_PRICE:      "Assignment price is acceptable for wheel entry",
});

// Backward-compat readiness codes used by the existing cockpit chip
// colorization. Each recommendation maps to one of these.
export const CREDIT_VIEW_READINESS = Object.freeze({
  READY:           "ready_if_confirmed",
  WAIT:            "wait_for_confirmation",
  AVOID_INVALID:   "avoid_invalidated",
  AVOID_LIQUIDITY: "avoid_poor_liquidity",
  AVOID_PREMIUM:   "avoid_premium_collapse",
});

const RECOMMENDATION_TO_READINESS = Object.freeze({
  [CREDIT_RECOMMENDATIONS.STRONG_ENTRY]:         CREDIT_VIEW_READINESS.READY,
  [CREDIT_RECOMMENDATIONS.ACCUMULATION_ENTRY]:   CREDIT_VIEW_READINESS.READY,
  [CREDIT_RECOMMENDATIONS.TWO_PM_HARVEST]:       CREDIT_VIEW_READINESS.READY,
  [CREDIT_RECOMMENDATIONS.LATE_CONFIRMATION]:    CREDIT_VIEW_READINESS.WAIT,
  [CREDIT_RECOMMENDATIONS.WAIT_FOR_PULLBACK]:    CREDIT_VIEW_READINESS.WAIT,
  [CREDIT_RECOMMENDATIONS.WAIT_FOR_PREMIUM]:     CREDIT_VIEW_READINESS.WAIT,
  [CREDIT_RECOMMENDATIONS.AVOID_BREAKDOWN]:      CREDIT_VIEW_READINESS.AVOID_INVALID,
  [CREDIT_RECOMMENDATIONS.AVOID_POOR_CREDIT]:    CREDIT_VIEW_READINESS.AVOID_LIQUIDITY,
  [CREDIT_RECOMMENDATIONS.NO_TRADE_INVALIDATED]: CREDIT_VIEW_READINESS.AVOID_INVALID,
});

// ---------------------------------------------------------------------
// PUBLIC ENTRY POINT
// ---------------------------------------------------------------------

/**
 * @param {object} input — see normalizeInput() for the full shape.
 */
export function buildCreditViewNarrative(input = {}) {
  const ctx = normalizeInput(input);
  const triggers = detectTriggers(ctx);
  const recommendation = pickRecommendation(ctx, triggers);
  const confirmation = buildConfirmation(ctx);
  const invalidation = buildInvalidation(ctx);
  const bestStrikeZone = buildBestStrikeZone(ctx);
  const minimumPremium = buildMinimumPremium(ctx);
  const managementNote = buildManagementNote(ctx, recommendation);
  const conservativeConcern = pickConservativeConcern(ctx);
  const accumulationInterpretation =
    pickAccumulationInterpretation(ctx, recommendation, triggers);
  const oldModelWouldHaveBlocked =
    wouldOldModelBlock(ctx, recommendation);
  const triggerSentence = composeTriggerSentence(triggers);

  const riskNarrative = composeNarrative({
    conservativeConcern,
    accumulationInterpretation,
    confirmationSentence: confirmation.sentence,
    invalidationSentence: invalidation.sentence,
  });

  const executionReadiness =
    recommendation.readiness ||
    RECOMMENDATION_TO_READINESS[recommendation.label] ||
    CREDIT_VIEW_READINESS.WAIT;

  return {
    // -- new structured fields --
    recommendation,
    triggers,
    triggerSentence,
    confirmation,
    invalidation,
    bestStrikeZone,
    minimumPremium,
    managementNote,
    marketPhase: ctx.marketPhase,
    accumulationMode: ctx.accumulationMode,

    // -- consolidated paragraph --
    riskNarrative,

    // -- backward-compat fields --
    recommendationLabel: recommendation.label,
    conservativeConcern,
    accumulationInterpretation,
    confirmationSentence: confirmation.sentence,
    invalidationSentence: invalidation.sentence,
    executionReadiness,
    oldModelWouldHaveBlocked,
  };
}

// ---------------------------------------------------------------------
// CONTEXT NORMALIZATION
// ---------------------------------------------------------------------

function normalizeInput(raw) {
  const price = numeric(raw.price);
  const bid   = numeric(raw.bid);
  const ask   = numeric(raw.ask);
  const premiumMid = numeric(raw.premiumMid)
    ?? (bid != null && ask != null ? (bid + ask) / 2 : null);
  const spreadPct = (bid != null && ask != null && premiumMid != null && premiumMid > 0)
    ? (ask - bid) / premiumMid
    : null;

  const vix = numeric(raw.vix);
  const ivPct = numeric(raw.ivPercentile);
  const premiumPercentile = numeric(raw.premiumPercentile);   // historical %ile
  const supportPct = numeric(raw.nearestSupportPct);
  const supportLevel = (price != null && supportPct != null)
    ? price * (1 - supportPct)
    : null;
  const minuteOfDay = numeric(raw.minuteOfDay);

  const spreadGrade = raw.spreadQuality;
  const spreadKnown = !!(spreadGrade && spreadGrade !== "—");
  const spreadOk = isAcceptableSpread(spreadGrade);
  const spreadGradeBad = spreadKnown && !spreadOk;

  const wheelSuit = raw.wheelSuit;
  const wheelKnown = !!(wheelSuit && wheelSuit !== "—");
  const wheelOk = wheelSuit === "High" || wheelSuit === "Medium";

  // Accumulation can be supplied directly or via marketPhase.
  const marketPhase = raw.marketPhase || null;
  const accumulationMode =
    raw.accumulationMode === true ||
    marketPhase === "accumulation" ||
    raw.priceTrend === "stabilizing" ||
    raw.priceTrend === "reclaiming";

  // Trader's tolerance for assignment. Defaults to the watchlist's wheel
  // suit when not explicitly supplied — High/Medium suits imply the
  // operator already pre-screened for ownership tolerance.
  const willingToOwnShares = raw.willingToOwnShares != null
    ? !!raw.willingToOwnShares
    : wheelOk;

  return {
    symbol: raw.symbol || "this name",
    price,
    bid, ask,
    premiumMid,
    spreadPct,
    primaryStrike:   numeric(raw.primaryStrike),
    secondaryStrike: numeric(raw.secondaryStrike),
    ivPct,
    premiumPercentile,
    premiumRich:      ivPct != null && ivPct >= PREMIUM_RICH_IV_PCT,
    premiumOk:        ivPct != null && ivPct >= PREMIUM_OK_IV_PCT,
    premiumWeak:      ivPct != null && ivPct < PREMIUM_LOW_IV_PCT,
    premiumTooThin:   ivPct != null && ivPct < PREMIUM_FLOOR_IV_PCT,
    historicalRich:   premiumPercentile != null && premiumPercentile >= PREMIUM_PERCENTILE_RICH,
    signal: raw.signal || "WATCH",
    action: raw.action || "WAIT",
    timingStage: raw.timingStage || "UNKNOWN",
    vix,
    vixElevated: vix != null && vix >= VIX_FEAR_FLOOR && vix < VIX_PANIC,
    vixHigh:     vix != null && vix >= VIX_FEAR_HIGH && vix < VIX_PANIC,
    vixPanic:    vix != null && vix >= VIX_PANIC,
    fearSpike:    !!raw.fearSpike,
    creditStress: !!raw.creditStress,
    supportPct,
    supportLevel,
    supportNear:     supportPct != null && supportPct >= 0 && supportPct <= SUPPORT_NEAR_PCT,
    supportExtended: supportPct != null && supportPct > SUPPORT_EXTENDED_PCT,
    priceTrend: raw.priceTrend || null,
    breakingDown:
      raw.priceTrend === "breaking" ||
      raw.priceTrend === "breakdown" ||
      raw.trendBias === "BEARISH",
    insideDemandZone: !!raw.insideDemandZone,
    minuteOfDay,
    afterTwoPm: minuteOfDay != null && minuteOfDay >= TWO_PM_START,
    inTwoPmWindow: minuteOfDay != null && minuteOfDay >= TWO_PM_START && minuteOfDay <= TWO_PM_END,
    spreadOk, spreadKnown, spreadGradeBad,
    wheelOk, wheelKnown, wheelSuit: wheelSuit || "—",
    willingToOwnShares,
    marketPhase,
    accumulationMode,
  };
}

function isAcceptableSpread(grade) {
  if (!grade || grade === "—") return false;
  return grade.startsWith("A") || grade === "B+" || grade === "B";
}

// ---------------------------------------------------------------------
// TRIGGERS
// ---------------------------------------------------------------------

function detectTriggers(c) {
  const out = [];

  if (c.premiumRich || c.historicalRich) {
    out.push({ code: "PREMIUM_EXPANSION", label: CREDIT_TRIGGERS.PREMIUM_EXPANSION });
  }
  if (c.supportNear && !c.breakingDown) {
    out.push({ code: "SUPPORT_HOLD", label: CREDIT_TRIGGERS.SUPPORT_HOLD });
  }
  if (c.vixElevated) {
    out.push({ code: "VIX_ELEVATED", label: CREDIT_TRIGGERS.VIX_ELEVATED });
  }
  if (c.vixHigh && c.premiumRich && !c.breakingDown) {
    out.push({ code: "FEAR_OVERPRICING", label: CREDIT_TRIGGERS.FEAR_OVERPRICING });
  }
  if (c.accumulationMode || c.insideDemandZone) {
    out.push({ code: "ACCUMULATION_PHASE", label: CREDIT_TRIGGERS.ACCUMULATION_PHASE });
  }
  if (c.priceTrend === "stabilizing" || c.priceTrend === "reclaiming") {
    out.push({ code: "POST_SELL_OFF_STABILIZATION", label: CREDIT_TRIGGERS.POST_SELL_OFF_STABILIZATION });
  }
  if (c.inTwoPmWindow && (c.premiumOk || c.historicalRich)) {
    out.push({ code: "TWO_PM_PREMIUM_WINDOW", label: CREDIT_TRIGGERS.TWO_PM_PREMIUM_WINDOW });
  }
  if (c.wheelOk && c.willingToOwnShares && c.primaryStrike != null) {
    out.push({ code: "WHEEL_ACCEPTABLE_PRICE", label: CREDIT_TRIGGERS.WHEEL_ACCEPTABLE_PRICE });
  }

  return out;
}

function composeTriggerSentence(triggers) {
  if (!triggers || triggers.length === 0) {
    return "No active triggers — engine is in a wait posture.";
  }
  const labels = triggers.map((t) => t.label.toLowerCase());
  // Capitalize the first letter for sentence flow.
  const joined = joinList(labels);
  return joined.charAt(0).toUpperCase() + joined.slice(1) + ".";
}

// ---------------------------------------------------------------------
// RECOMMENDATION
// ---------------------------------------------------------------------

function pickRecommendation(c, triggers) {
  const has = (code) => triggers.some((t) => t.code === code);

  // Hard kill switches.
  if (
    c.signal === "NO_TRADE" ||
    c.timingStage === "EXHAUSTED" ||
    c.vixPanic ||
    String(c.action || "").startsWith("SKIP") ||
    c.action === "AVOID"
  ) {
    return rec(CREDIT_RECOMMENDATIONS.NO_TRADE_INVALIDATED, CREDIT_VIEW_READINESS.AVOID_INVALID);
  }

  // Structural breakdown.
  if (c.breakingDown && c.supportPct != null && c.supportPct <= 0.005) {
    return rec(CREDIT_RECOMMENDATIONS.AVOID_BREAKDOWN, CREDIT_VIEW_READINESS.AVOID_INVALID);
  }
  if (c.breakingDown && c.afterTwoPm) {
    return rec(CREDIT_RECOMMENDATIONS.AVOID_BREAKDOWN, CREDIT_VIEW_READINESS.AVOID_INVALID);
  }

  // Liquidity / premium hard gates.
  if (c.spreadGradeBad) {
    return rec(CREDIT_RECOMMENDATIONS.AVOID_POOR_CREDIT, CREDIT_VIEW_READINESS.AVOID_LIQUIDITY);
  }
  if (c.premiumTooThin) {
    // Premium-driven AVOID maps to the "premium collapse" readiness so
    // the existing cockpit chip surfaces the right cause to the operator.
    return rec(CREDIT_RECOMMENDATIONS.AVOID_POOR_CREDIT, CREDIT_VIEW_READINESS.AVOID_PREMIUM);
  }
  if (c.premiumWeak) {
    return rec(CREDIT_RECOMMENDATIONS.WAIT_FOR_PREMIUM, CREDIT_VIEW_READINESS.WAIT);
  }

  // Pullback wait — extended above support.
  if (c.supportExtended && !c.premiumRich) {
    return rec(CREDIT_RECOMMENDATIONS.WAIT_FOR_PULLBACK, CREDIT_VIEW_READINESS.WAIT);
  }

  // Accumulation entry — the headline upgrade. Allowed when accumulation
  // is detected AND (premium expansion OR support hold) without breakdown.
  // Priority over the 2PM harvest path so accumulation is named explicitly.
  if (
    has("ACCUMULATION_PHASE") &&
    (has("PREMIUM_EXPANSION") || has("SUPPORT_HOLD")) &&
    !c.breakingDown &&
    !c.vixPanic
  ) {
    return rec(CREDIT_RECOMMENDATIONS.ACCUMULATION_ENTRY, CREDIT_VIEW_READINESS.READY);
  }

  // 2PM premium harvest window when triggers align (no accumulation flag).
  if (
    c.inTwoPmWindow &&
    has("TWO_PM_PREMIUM_WINDOW") &&
    has("PREMIUM_EXPANSION") &&
    has("SUPPORT_HOLD")
  ) {
    return rec(CREDIT_RECOMMENDATIONS.TWO_PM_HARVEST, CREDIT_VIEW_READINESS.READY);
  }

  // Late-window setups need explicit confirmation.
  if (c.afterTwoPm) {
    return rec(CREDIT_RECOMMENDATIONS.LATE_CONFIRMATION, CREDIT_VIEW_READINESS.WAIT);
  }
  if (c.timingStage === "LATE") {
    return rec(CREDIT_RECOMMENDATIONS.LATE_CONFIRMATION, CREDIT_VIEW_READINESS.WAIT);
  }
  if (c.signal === "WATCH" || c.timingStage === "EARLY" || c.action === "WAIT") {
    return rec(CREDIT_RECOMMENDATIONS.LATE_CONFIRMATION, CREDIT_VIEW_READINESS.WAIT);
  }

  // Strong entry — clean tape with multiple supportive triggers.
  if (
    c.signal === "GO" &&
    c.action === "SELL_PUTS" &&
    !c.vixPanic &&
    triggers.length >= 2
  ) {
    return rec(CREDIT_RECOMMENDATIONS.STRONG_ENTRY, CREDIT_VIEW_READINESS.READY);
  }

  // Default to late-confirmation rather than fabricating a green light.
  return rec(CREDIT_RECOMMENDATIONS.LATE_CONFIRMATION, CREDIT_VIEW_READINESS.WAIT);
}

function rec(label, readiness) {
  const code = Object.keys(CREDIT_RECOMMENDATIONS)
    .find((k) => CREDIT_RECOMMENDATIONS[k] === label);
  return { code, label, readiness };
}

// ---------------------------------------------------------------------
// CONFIRMATION + INVALIDATION
// ---------------------------------------------------------------------

function buildConfirmation(c) {
  const conditions = [];
  let priceFloor = null, vixFloor = null, premiumFloor = null;

  if (c.supportLevel != null) {
    priceFloor = c.supportLevel;
    conditions.push({
      key: "PRICE_HOLDS_SUPPORT",
      sentence: `price holds above $${priceFloor.toFixed(2)}`,
    });
  }
  if (c.vix != null) {
    vixFloor = c.vix;
    conditions.push({
      key: "VIX_REMAINS_ELEVATED",
      sentence: `VIX remains above ${vixFloor.toFixed(1)} without panic expansion`,
    });
  }
  if (c.premiumMid != null) {
    premiumFloor = c.premiumMid * PREMIUM_HOLD_FLOOR_RATIO;
    conditions.push({
      key: "PREMIUM_HOLDS",
      sentence: `premium stays above $${premiumFloor.toFixed(2)}`,
    });
  }
  if (c.spreadKnown) {
    conditions.push({
      key: "SPREAD_TIGHT",
      sentence: `bid/ask spread stays below ${(SPREAD_PCT_OK_CONFIRM * 100).toFixed(0)}% of mid`,
    });
  }
  conditions.push({
    key: "NO_LOWER_LOW_AFTER_2PM",
    sentence: "no fresh intraday lower low forms after 2pm",
  });

  const sentence = conditions.length === 0
    ? "Entry requires further confirmation from price, VIX, premium, and spread before sizing."
    : `Entry requires ${joinList(conditions.map((c2) => c2.sentence))}.`;

  return {
    priceFloor,
    vixFloor,
    premiumFloor,
    spreadCeilingPct: SPREAD_PCT_OK_CONFIRM,
    requireNoLowerLowAfter2pm: true,
    conditions,
    sentence,
  };
}

function buildInvalidation(c) {
  const conditions = [];
  let priceBreak = null, vixCollapse = null, premiumCollapse = null;

  if (c.supportLevel != null) {
    priceBreak = c.supportLevel * (1 - INVALIDATION_BREAK_PCT);
    conditions.push({
      key: "PRICE_BREAKS_SUPPORT",
      sentence: `price breaks below $${priceBreak.toFixed(2)}`,
    });
  }
  if (c.vix != null) {
    vixCollapse = c.vix - VIX_DROP_DELTA;
    if (c.premiumMid != null) {
      premiumCollapse = c.premiumMid * PREMIUM_COLLAPSE_RATIO;
      conditions.push({
        key: "VIX_COLLAPSE_AND_PREMIUM_DROP",
        sentence: `VIX drops below ${vixCollapse.toFixed(1)} and premium collapses below $${premiumCollapse.toFixed(2)}`,
      });
    } else {
      conditions.push({
        key: "VIX_COLLAPSE",
        sentence: `VIX drops below ${vixCollapse.toFixed(1)} and the premium thesis evaporates`,
      });
    }
  }
  if (c.spreadKnown) {
    conditions.push({
      key: "SPREAD_WIDENS",
      sentence: `bid/ask spread widens above ${(SPREAD_PCT_INVALIDATE * 100).toFixed(0)}% of mid`,
    });
  }
  conditions.push({
    key: "NEW_INTRADAY_LOW_AFTER_2PM",
    sentence: "the stock prints a new intraday low after 2pm",
  });
  conditions.push({
    key: "NEWS_SHOCK",
    sentence: "a news shock changes the thesis",
  });

  const sentence = `Avoid if ${joinList(conditions.map((c2) => c2.sentence))}.`;

  return {
    priceBreak,
    vixCollapse,
    premiumCollapse,
    spreadCeilingPct: SPREAD_PCT_INVALIDATE,
    newLowAfter2pm: true,
    newsShockClause: true,
    conditions,
    sentence,
  };
}

// ---------------------------------------------------------------------
// STRIKE ZONE / PREMIUM FLOOR / MANAGEMENT NOTE
// ---------------------------------------------------------------------

function buildBestStrikeZone(c) {
  const primary = c.primaryStrike;
  const secondary = c.secondaryStrike;
  if (primary == null && secondary == null) {
    return { low: null, high: null, label: "—" };
  }
  if (primary != null && secondary != null && secondary !== primary) {
    const low = Math.min(primary, secondary);
    const high = Math.max(primary, secondary);
    return {
      low, high,
      label: `$${low.toFixed(2)}–$${high.toFixed(2)} put`,
    };
  }
  const only = primary ?? secondary;
  return { low: only, high: only, label: `$${only.toFixed(2)} put` };
}

function buildMinimumPremium(c) {
  if (c.premiumMid == null) {
    return { value: null, label: "—" };
  }
  const value = c.premiumMid * PREMIUM_HOLD_FLOOR_RATIO;
  return { value, label: `$${value.toFixed(2)} credit or better` };
}

function buildManagementNote(c, recommendation) {
  if (recommendation.label === CREDIT_RECOMMENDATIONS.NO_TRADE_INVALIDATED) {
    return "Stand down — invalidator is active.";
  }
  if (recommendation.label === CREDIT_RECOMMENDATIONS.AVOID_BREAKDOWN) {
    return "Stand down — structural breakdown signals do not support a credit sale.";
  }
  if (recommendation.label === CREDIT_RECOMMENDATIONS.AVOID_POOR_CREDIT) {
    return "Stand down — execution friction or premium thinness erodes the trade.";
  }
  if (c.wheelOk && c.bestStrikeLow != null) {
    return `Acceptable only if willing to own shares near ${(c.bestStrikeLow ?? c.primaryStrike).toFixed(2)}.`;
  }
  if (c.wheelOk && c.primaryStrike != null && c.secondaryStrike != null) {
    const low = Math.min(c.primaryStrike, c.secondaryStrike);
    const high = Math.max(c.primaryStrike, c.secondaryStrike);
    return `Acceptable only if willing to own shares near $${low.toFixed(2)}–$${high.toFixed(2)}.`;
  }
  if (c.wheelOk && c.primaryStrike != null) {
    return `Acceptable only if willing to own shares near $${c.primaryStrike.toFixed(2)}.`;
  }
  if (c.wheelKnown && !c.wheelOk) {
    return "Treat as a pure-premium play — assignment exposure is not part of the plan.";
  }
  return "Size to remaining capital and respect the invalidation gates above.";
}

// ---------------------------------------------------------------------
// CONSERVATIVE CONCERN + ACCUMULATION INTERPRETATION
// ---------------------------------------------------------------------

function pickConservativeConcern(c) {
  if (c.timingStage === "EXHAUSTED") {
    return "Overextended late-cycle move creates entry-timing risk";
  }
  if (c.afterTwoPm && (c.vixElevated || c.timingStage === "LATE")) {
    return "Late-session timing creates execution risk";
  }
  if (c.vixPanic) {
    return "VIX in panic territory creates volatility-shock risk";
  }
  if (c.creditStress && c.fearSpike) {
    return "Credit stress alongside a VIX fear spike creates regime risk";
  }
  if (c.timingStage === "LATE") {
    return "Late-stage timing creates fade-risk after the move has played";
  }
  if (c.vixHigh) {
    return "Elevated VIX creates volatility risk on an early/forming setup";
  }
  if (c.premiumWeak) {
    return "Below-norm premium creates poor risk/reward for a credit sale";
  }
  if (c.spreadGradeBad) {
    return "Wide bid/ask spread creates execution and fill-quality risk";
  }
  if (c.timingStage === "EARLY") {
    return "Early-session timing means the setup has not yet confirmed";
  }
  return "No headline conservative concern flagged";
}

function pickAccumulationInterpretation(c, recommendation, triggers) {
  const valid =
    recommendation.label === CREDIT_RECOMMENDATIONS.STRONG_ENTRY ||
    recommendation.label === CREDIT_RECOMMENDATIONS.ACCUMULATION_ENTRY ||
    recommendation.label === CREDIT_RECOMMENDATIONS.TWO_PM_HARVEST ||
    recommendation.label === CREDIT_RECOMMENDATIONS.LATE_CONFIRMATION ||
    recommendation.label === CREDIT_RECOMMENDATIONS.WAIT_FOR_PULLBACK ||
    recommendation.label === CREDIT_RECOMMENDATIONS.WAIT_FOR_PREMIUM;

  let stem;
  if (recommendation.label === CREDIT_RECOMMENDATIONS.AVOID_POOR_CREDIT) {
    stem = "this is not a valid accumulation candidate at current premium and spread";
  } else if (recommendation.label === CREDIT_RECOMMENDATIONS.AVOID_BREAKDOWN) {
    stem = "this is not a valid accumulation candidate while structural breakdown signals are active";
  } else if (!valid) {
    stem = "this is not a valid accumulation candidate until invalidators clear";
  } else {
    stem = "this remains a valid accumulation candidate";
  }

  const reasons = [];
  if (c.supportNear && !c.breakingDown) {
    reasons.push("price is holding above support");
  } else if (c.supportPct != null && c.supportPct > 0) {
    reasons.push(`price has ${(c.supportPct * 100).toFixed(1)}% room to support`);
  }
  if (c.vixHigh) {
    reasons.push("VIX is elevated but controlled");
  } else if (c.vixElevated) {
    reasons.push("VIX is elevated but contained");
  } else if (c.vix != null) {
    reasons.push("VIX is contained");
  }
  if (c.premiumRich) reasons.push("premium remains attractive");
  else if (c.premiumOk) reasons.push("premium remains acceptable");
  if (c.spreadOk)      reasons.push("spread quality is acceptable");
  if (c.wheelOk && c.primaryStrike != null && c.willingToOwnShares) {
    reasons.push("assignment price fits the wheel plan");
  }
  if (triggers.some((t) => t.code === "ACCUMULATION_PHASE")) {
    reasons.push("accumulation behavior is intact");
  }

  if (reasons.length === 0) return stem;
  return `${stem} because ${joinList(reasons)}`;
}

function wouldOldModelBlock(c, recommendation) {
  const conservativeBlock =
    c.timingStage === "LATE" ||
    c.timingStage === "EXHAUSTED" ||
    c.afterTwoPm ||
    c.vixHigh ||
    c.spreadGradeBad ||
    c.creditStress;

  const upgradedAllows =
    recommendation.label === CREDIT_RECOMMENDATIONS.STRONG_ENTRY ||
    recommendation.label === CREDIT_RECOMMENDATIONS.ACCUMULATION_ENTRY ||
    recommendation.label === CREDIT_RECOMMENDATIONS.TWO_PM_HARVEST ||
    recommendation.label === CREDIT_RECOMMENDATIONS.LATE_CONFIRMATION ||
    recommendation.label === CREDIT_RECOMMENDATIONS.WAIT_FOR_PULLBACK ||
    recommendation.label === CREDIT_RECOMMENDATIONS.WAIT_FOR_PREMIUM;

  return conservativeBlock && upgradedAllows;
}

// ---------------------------------------------------------------------
// COMPOSITION
// ---------------------------------------------------------------------

function composeNarrative(parts) {
  const lead = `${parts.conservativeConcern}, but ${parts.accumulationInterpretation}.`;
  return [lead, parts.confirmationSentence, parts.invalidationSentence]
    .filter(Boolean)
    .join(" ");
}

function joinList(arr) {
  if (arr.length === 0) return "";
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
}

function numeric(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
