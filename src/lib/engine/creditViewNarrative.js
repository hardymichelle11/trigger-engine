// =====================================================================
// CREDIT VIEW NARRATIVE — concatenated trader-readable risk paragraph
// =====================================================================
// Replaces the disconnected "After 2pm: Require confirmation" /
// "Price near support: Good if support holds" / "VIX elevated: Good
// for premium if controlled" rows with a single paragraph that explains
// the conservative concern, the accumulation interpretation, the entry
// confirmation gates, and the invalidation gates — all in language a
// trader can act on.
//
// Output shape:
//   {
//     recommendationLabel,
//     riskNarrative,
//     conservativeConcern,
//     accumulationInterpretation,
//     confirmationSentence,
//     invalidationSentence,
//     executionReadiness,
//     oldModelWouldHaveBlocked,
//   }
//
// Hard rules:
//   - PURE function. No state, no I/O.
//   - Never expose raw scores or internal weights.
//   - When inputs are missing, fall back to honest "—" text rather
//     than fabricating numbers.
// =====================================================================

// Levels are tuned to the existing engine defaults so the narrative
// stays in lockstep with the rest of the cockpit.
const VIX_FEAR  = 21;   // matches CONFIG.macro.vixFearLow
const VIX_PANIC = 28;   // matches MARKET_REGIME.vix.fearThreshold (28)
const SUPPORT_NEAR_PCT = 0.025;                 // within 2.5% of support
const PREMIUM_HOLD_PCT = 0.85;                  // floor at 85% of current premium
const INVALIDATION_BREAK_PCT = 0.01;            // 1% below support
const AFTER_TWO_PM_MINUTE = 14 * 60;            // 14:00 ET in minutes-of-day

const READINESS = Object.freeze({
  READY:    "ready_if_confirmed",
  WAIT:     "wait_for_confirmation",
  AVOID_INVALID: "avoid_invalidated",
  AVOID_LIQUIDITY: "avoid_poor_liquidity",
  AVOID_PREMIUM: "avoid_premium_collapse",
});

const LABEL = Object.freeze({
  [READINESS.READY]:    "ACCUMULATION CANDIDATE",
  [READINESS.WAIT]:     "WAIT FOR CONFIRMATION",
  [READINESS.AVOID_INVALID]:   "AVOID — INVALIDATED",
  [READINESS.AVOID_LIQUIDITY]: "AVOID — POOR LIQUIDITY",
  [READINESS.AVOID_PREMIUM]:   "AVOID — PREMIUM COLLAPSE",
});

/**
 * @typedef {Object} CreditViewInputs
 * @property {string}  symbol
 * @property {number}  price                            current spot
 * @property {number|null} ivPercentile                 0-100
 * @property {number|null} bid
 * @property {number|null} ask
 * @property {number|null} premiumMid                   override if engine already computed it
 * @property {string}  spreadQuality                    "A+" / "A" / "B" / "C" / "D" / "F" / "—"
 * @property {string}  wheelSuit                        "High" / "Medium" / "Low" / "No" / "—"
 * @property {string}  signal                           "GO" / "WATCH" / "NO_TRADE"
 * @property {string}  action                           "SELL_PUTS" / "WAIT" / "SKIP" / ...
 * @property {string}  timingStage                      "EARLY" / "PEAK" / "LATE" / "EXHAUSTED"
 * @property {number|null} vix
 * @property {boolean} fearSpike
 * @property {boolean} creditStress
 * @property {number|null} nearestSupportPct            distance below price as decimal (0.012 = 1.2%)
 * @property {number|null} minuteOfDay                  for "after 2pm" detection
 * @property {number|null} primaryStrike                short put strike
 */

/**
 * Build the credit-view narrative output from a flat input bag.
 *
 * @param {CreditViewInputs} input
 */
export function buildCreditViewNarrative(input = {}) {
  const ctx = normalizeInput(input);

  const conservativeConcern = pickConservativeConcern(ctx);
  const accumulationInterpretation = pickAccumulationInterpretation(ctx);
  const confirmationSentence = buildConfirmationSentence(ctx);
  const invalidationSentence = buildInvalidationSentence(ctx);
  const executionReadiness = pickExecutionReadiness(ctx);
  const oldModelWouldHaveBlocked = wouldOldModelBlock(ctx);
  const recommendationLabel = LABEL[executionReadiness] || LABEL[READINESS.WAIT];

  const riskNarrative = composeNarrative({
    conservativeConcern,
    accumulationInterpretation,
    confirmationSentence,
    invalidationSentence,
  });

  return {
    recommendationLabel,
    riskNarrative,
    conservativeConcern,
    accumulationInterpretation,
    confirmationSentence,
    invalidationSentence,
    executionReadiness,
    oldModelWouldHaveBlocked,
  };
}

// --------------------------------------------------
// CONTEXT NORMALIZATION
// --------------------------------------------------

function normalizeInput(raw) {
  const price = numeric(raw.price);
  const bid   = numeric(raw.bid);
  const ask   = numeric(raw.ask);
  const premiumMid = numeric(raw.premiumMid)
    ?? (bid != null && ask != null ? (bid + ask) / 2 : null);

  const vix = numeric(raw.vix);
  const ivPct = numeric(raw.ivPercentile);
  const supportPct = numeric(raw.nearestSupportPct);
  const supportLevel = (price != null && supportPct != null)
    ? price * (1 - supportPct)
    : null;
  const minuteOfDay = numeric(raw.minuteOfDay);

  const spreadOk = isAcceptableSpread(raw.spreadQuality);
  const spreadKnown = raw.spreadQuality && raw.spreadQuality !== "—";
  const wheelOk = raw.wheelSuit === "High" || raw.wheelSuit === "Medium";
  const wheelKnown = raw.wheelSuit && raw.wheelSuit !== "—";

  return {
    symbol: raw.symbol || "this name",
    price,
    bid, ask,
    premiumMid,
    primaryStrike: numeric(raw.primaryStrike),
    ivPct,
    premiumAttractive: ivPct != null && ivPct >= 60,
    premiumWeak: ivPct != null && ivPct < 40,
    signal: raw.signal || "WATCH",
    action: raw.action || "WAIT",
    timingStage: raw.timingStage || "UNKNOWN",
    vix,
    vixElevated: vix != null && vix >= VIX_FEAR,
    vixPanic: vix != null && vix >= VIX_PANIC,
    fearSpike: !!raw.fearSpike,
    creditStress: !!raw.creditStress,
    supportPct,
    supportLevel,
    supportNear: supportPct != null && supportPct >= 0 && supportPct <= SUPPORT_NEAR_PCT,
    minuteOfDay,
    afterTwoPm: minuteOfDay != null && minuteOfDay >= AFTER_TWO_PM_MINUTE,
    spreadOk, spreadKnown,
    wheelOk, wheelKnown,
    spreadQuality: raw.spreadQuality || "—",
    wheelSuit: raw.wheelSuit || "—",
  };
}

function isAcceptableSpread(grade) {
  if (!grade || grade === "—") return false;
  return grade.startsWith("A") || grade === "B+" || grade === "B";
}

// --------------------------------------------------
// FIELD BUILDERS
// --------------------------------------------------

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
  if (c.vixElevated) {
    return "Elevated VIX creates volatility risk on an early/forming setup";
  }
  if (c.premiumWeak) {
    return "Below-norm premium creates poor risk/reward for a credit sale";
  }
  if (c.spreadKnown && !c.spreadOk) {
    return "Wide bid/ask spread creates execution and fill-quality risk";
  }
  if (c.timingStage === "EARLY") {
    return "Early-session timing means the setup has not yet confirmed";
  }
  return "No headline conservative concern flagged";
}

function pickAccumulationInterpretation(c) {
  // What the upgraded accumulation model says about whether this is
  // still a candidate even with the conservative concern present.
  const readiness = pickExecutionReadiness(c);

  const valid =
    readiness === READINESS.READY ||
    readiness === READINESS.WAIT;
  const stem = valid
    ? "this remains a valid accumulation candidate"
    : (readiness === READINESS.AVOID_LIQUIDITY
        ? "this is not a valid accumulation candidate at current liquidity"
        : readiness === READINESS.AVOID_PREMIUM
          ? "this is not a valid accumulation candidate at current premium"
          : "this is not a valid accumulation candidate until invalidators clear");

  const reasons = [];
  if (c.supportNear) {
    reasons.push("price is holding above support");
  } else if (c.supportPct != null && c.supportPct > 0) {
    reasons.push(`price has ${(c.supportPct * 100).toFixed(1)}% room to support`);
  }
  if (c.vixElevated && !c.vixPanic) {
    reasons.push("VIX is elevated but controlled");
  } else if (!c.vixElevated && c.vix != null) {
    reasons.push("VIX is contained");
  }
  if (c.premiumAttractive) reasons.push("premium remains attractive");
  if (c.spreadOk)          reasons.push("spread quality is acceptable");
  if (c.wheelOk && c.primaryStrike != null) {
    reasons.push("assignment price fits the wheel plan");
  }

  if (reasons.length === 0) return stem;
  return `${stem} because ${joinList(reasons)}`;
}

function buildConfirmationSentence(c) {
  const gates = [];
  if (c.supportLevel != null) {
    gates.push(`price to hold above $${c.supportLevel.toFixed(2)}`);
  }
  if (c.vix != null) {
    gates.push(`VIX to remain above ${c.vix.toFixed(1)} without panic expansion`);
  }
  if (c.premiumMid != null) {
    const floor = c.premiumMid * PREMIUM_HOLD_PCT;
    gates.push(`premium to stay above $${floor.toFixed(2)}`);
  }
  if (gates.length === 0) {
    return "Entry requires further confirmation from price, VIX, and premium before sizing.";
  }
  return `Entry requires ${joinList(gates)}.`;
}

function buildInvalidationSentence(c) {
  const fails = [];
  if (c.supportLevel != null) {
    const breakLevel = c.supportLevel * (1 - INVALIDATION_BREAK_PCT);
    fails.push(`price breaks below $${breakLevel.toFixed(2)}`);
  }
  // The "fresh lower low after 2pm" gate is generic — we surface it
  // whenever the operator could realistically still be in-session,
  // because it is the primary intraday invalidator the wheel plan
  // watches for.
  fails.push("a fresh lower low forms after 2pm");
  if (c.spreadKnown) {
    fails.push("spread quality deteriorates");
  }
  if (c.premiumMid != null) {
    const collapse = c.premiumMid * 0.6;
    fails.push(`premium collapses below $${collapse.toFixed(2)}`);
  }
  return `Avoid if ${joinList(fails)}.`;
}

function pickExecutionReadiness(c) {
  // Hard avoid first.
  if (c.signal === "NO_TRADE" || c.timingStage === "EXHAUSTED" || c.vixPanic) {
    return READINESS.AVOID_INVALID;
  }
  if (String(c.action || "").startsWith("SKIP") || c.action === "AVOID") {
    return READINESS.AVOID_INVALID;
  }
  // Liquidity / premium gates next.
  if (c.spreadKnown && !c.spreadOk) {
    return READINESS.AVOID_LIQUIDITY;
  }
  if (c.premiumWeak) {
    return READINESS.AVOID_PREMIUM;
  }
  // Wait gates.
  if (c.signal === "WATCH" || c.timingStage === "EARLY" || c.action === "WAIT") {
    return READINESS.WAIT;
  }
  if (c.afterTwoPm && (c.vixElevated || c.timingStage === "LATE")) {
    return READINESS.WAIT;
  }
  // Default to ready when the engine has positively cleared it.
  if (c.signal === "GO" && c.action === "SELL_PUTS") {
    return READINESS.READY;
  }
  return READINESS.WAIT;
}

function wouldOldModelBlock(c) {
  // The conservative model bailed on (a) any late/exhausted timing,
  // (b) elevated VIX, (c) wide spread, OR (d) credit-stress regime.
  // The upgraded accumulation model still allows the trade when the
  // structural pieces (support, wheel suit, premium, spread) hold.
  const conservativeBlock =
    c.timingStage === "LATE" ||
    c.timingStage === "EXHAUSTED" ||
    c.afterTwoPm ||
    c.vixElevated ||
    (c.spreadKnown && !c.spreadOk) ||
    c.creditStress;

  const upgradedAllows =
    pickExecutionReadiness(c) === READINESS.READY ||
    pickExecutionReadiness(c) === READINESS.WAIT;

  return conservativeBlock && upgradedAllows;
}

// --------------------------------------------------
// COMPOSITION
// --------------------------------------------------

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

export const CREDIT_VIEW_READINESS = READINESS;
