// =====================================================
// TIMING CONFIG — buckets, weights, thresholds
// =====================================================
// Defines all classification buckets, scoring weights,
// and timing state thresholds for the premium timing engine.
// 2PM is a soft prior, not a rule.
// =====================================================

// --------------------------------------------------
// DTE BUCKETS
// --------------------------------------------------

export const DTE_BUCKETS = [
  { label: "0-3",   min: 0,  max: 3  },
  { label: "4-7",   min: 4,  max: 7  },
  { label: "8-14",  min: 8,  max: 14 },
  { label: "15-30", min: 15, max: 30 },
];

export function bucketDTE(dte) {
  for (const b of DTE_BUCKETS) {
    if (dte >= b.min && dte <= b.max) return b.label;
  }
  return dte > 30 ? "15-30" : "0-3";
}

// --------------------------------------------------
// MONEYNESS BUCKETS
// --------------------------------------------------

export const MONEYNESS_BUCKETS = [
  { label: "ATM",          min: 0,   max: 1   },
  { label: "1-3% OTM",    min: 1,   max: 3   },
  { label: "3-5% OTM",    min: 3,   max: 5   },
  { label: "5-8% OTM",    min: 5,   max: 8   },
  { label: "deep OTM",    min: 8,   max: 100 },
];

export function bucketMoneyness(underlyingPrice, strike, optionType) {
  if (!underlyingPrice || underlyingPrice <= 0) return "ATM";
  const otmPct = optionType === "put"
    ? ((underlyingPrice - strike) / underlyingPrice) * 100
    : ((strike - underlyingPrice) / underlyingPrice) * 100;
  const pct = Math.max(0, otmPct);
  for (const b of MONEYNESS_BUCKETS) {
    if (pct >= b.min && pct < b.max) return b.label;
  }
  return "deep OTM";
}

// --------------------------------------------------
// SETUP TYPES
// --------------------------------------------------

export const SETUP_TYPES = ["MOMENTUM", "RANGE", "HYBRID", "FOLLOWER", "INCOME"];

export function classifySetupType(category) {
  switch (category) {
    case "HIGH_IV":  return "MOMENTUM";
    case "CREDIT":   return "INCOME";
    case "ETF":      return "RANGE";
    default:         return "HYBRID";
  }
}

// --------------------------------------------------
// TIMING STATES
// --------------------------------------------------

export const TIMING_STATES = {
  PEAK_WINDOW: "PEAK_WINDOW",
  FAVORABLE:   "FAVORABLE",
  EARLY:       "EARLY",
  LATE:        "LATE",
  AVOID:       "AVOID",
};

// --------------------------------------------------
// SUGGESTED ACTIONS
// --------------------------------------------------

export const TIMING_ACTIONS = {
  SELL_NOW:                  "SELL_NOW",
  WAIT_FOR_RICHER_PREMIUM:   "WAIT_FOR_RICHER_PREMIUM",
  WAIT_FOR_BETTER_STRUCTURE: "WAIT_FOR_BETTER_STRUCTURE",
  WATCH_FOR_2PM_WINDOW:      "WATCH_FOR_2PM_WINDOW",
  AVOID_LOW_PREMIUM:         "AVOID_LOW_PREMIUM",
};

// --------------------------------------------------
// SCORING WEIGHTS
// --------------------------------------------------

export const TIMING_WEIGHTS = {
  premiumRichness:       0.35,
  spreadQuality:         0.15,
  ivContext:             0.15,
  symbolWindowAlignment: 0.15,
  setupWindowAlignment:  0.10,
  regimeWindowAlignment: 0.05,
  soft2pmBias:           0.05,
};

// --------------------------------------------------
// TIMING STATE THRESHOLDS
// --------------------------------------------------

export const TIMING_THRESHOLDS = {
  peakWindow:  85,  // >= 85 + premium percentile >= 75
  favorable:   70,  // 70-84
  early:       50,  // 50-69
  late:        35,  // 35-49
  // < 35 = AVOID
};

// --------------------------------------------------
// 2PM SOFT BIAS — time windows (minutes from midnight ET)
// --------------------------------------------------

export const SOFT_2PM_WINDOWS = {
  prime:    { start: 840, end: 930 },   // 2:00 PM - 3:30 PM ET
  prebias:  { start: 810, end: 840 },   // 1:30 PM - 2:00 PM ET
  open:     { start: 570, end: 615 },   // 9:30 AM - 10:15 AM ET
  midday:   { start: 690, end: 810 },   // 11:30 AM - 1:30 PM ET
  late:     { start: 930, end: 960 },   // 3:30 PM - 4:00 PM ET
};

// --------------------------------------------------
// PREMIUM PERCENTILE THRESHOLDS
// --------------------------------------------------

export const PREMIUM_PERCENTILE = {
  elite:  90,  // >= p90
  strong: 75,  // >= p75
  normal: 50,  // > median
  weak:   50,  // <= median
};

// --------------------------------------------------
// CLOCK HELPERS
// --------------------------------------------------

/**
 * Get current ET minute-of-day and context.
 * @returns {object} { minuteOfDay, hour, minute, dayOfWeek, marketOpen }
 */
export function getClockContext(dateOverride) {
  const now = dateOverride || new Date();
  // Convert to ET (UTC-4 EDT / UTC-5 EST)
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(etStr);
  const hour = et.getHours();
  const minute = et.getMinutes();
  const minuteOfDay = hour * 60 + minute;
  const dayOfWeek = et.getDay(); // 0=Sun, 1=Mon...5=Fri

  return {
    minuteOfDay,
    hour,
    minute,
    dayOfWeek,
    marketOpen: dayOfWeek >= 1 && dayOfWeek <= 5 && minuteOfDay >= 570 && minuteOfDay <= 960,
    timeET: `${hour}:${String(minute).padStart(2, "0")}`,
  };
}
