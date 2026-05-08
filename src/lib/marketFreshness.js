// =====================================================================
// Market freshness — age-based staleness classifier
// =====================================================================
// Single helper used by the status bar AND every per-card freshness chip
// so "live" / "aging" / "stale" never disagree across the cockpit.
//
//   < 60s             LIVE            green
//   60s – 5m          AGING           amber
//   5m  – 30m         STALE           red
//   > 30m or unknown  VERY_STALE      red (with explicit "stale" label)
//
// Two freshness streams are tracked per scan:
//   quoteAgeMs       — how old the underlying quote is
//   analyticsAgeMs   — how old the engine's full analytics pass is
//
// When analytics age exceeds quote age substantially, the card is in a
// "RECALCULATING" intermediate state — the quote moved but the engine
// hasn't recomputed yet.
// =====================================================================

export const FRESHNESS = Object.freeze({
  LIVE:         "LIVE",
  AGING:        "AGING",
  STALE:        "STALE",
  VERY_STALE:   "VERY_STALE",
  RECALCULATING: "RECALCULATING",
  UNKNOWN:      "UNKNOWN",
});

export const FRESHNESS_LABEL = Object.freeze({
  LIVE:          "Live",
  AGING:         "Aging",
  STALE:         "Stale",
  VERY_STALE:    "Very stale",
  RECALCULATING: "Recalculating",
  UNKNOWN:       "Unknown",
});

const LIVE_THRESHOLD_MS  = 60 * 1000;          // 1 min
const AGING_THRESHOLD_MS = 5 * 60 * 1000;      // 5 min
const STALE_THRESHOLD_MS = 30 * 60 * 1000;     // 30 min

const ANALYTICS_LAG_TOLERANCE_MS = 30 * 1000;  // > 30s lag → RECALCULATING

/**
 * Classify a single age (ms) into a freshness bucket. Used for the
 * status bar's master pill.
 *
 * @param {number|null|undefined} ageMs
 * @returns {string} one of FRESHNESS
 */
export function freshnessFromAge(ageMs) {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) {
    return FRESHNESS.UNKNOWN;
  }
  if (ageMs < LIVE_THRESHOLD_MS) return FRESHNESS.LIVE;
  if (ageMs < AGING_THRESHOLD_MS) return FRESHNESS.AGING;
  if (ageMs < STALE_THRESHOLD_MS) return FRESHNESS.STALE;
  return FRESHNESS.VERY_STALE;
}

/**
 * Classify the COMBINED state of a per-symbol pair (quote + analytics).
 * Surfaces RECALCULATING when the quote has moved but analytics hasn't
 * caught up.
 *
 * @param {object} ages
 * @param {number|null} ages.quoteAgeMs
 * @param {number|null} ages.analyticsAgeMs
 */
export function freshnessForCandidate({ quoteAgeMs, analyticsAgeMs }) {
  const quote = freshnessFromAge(quoteAgeMs);
  const analytics = freshnessFromAge(analyticsAgeMs);

  // If we don't even have a quote age, we can't say anything.
  if (quote === FRESHNESS.UNKNOWN) return FRESHNESS.UNKNOWN;

  // Analytics older than quote by more than the lag tolerance → recalc state.
  if (
    Number.isFinite(quoteAgeMs) &&
    Number.isFinite(analyticsAgeMs) &&
    analyticsAgeMs - quoteAgeMs > ANALYTICS_LAG_TOLERANCE_MS &&
    analytics !== FRESHNESS.LIVE
  ) {
    return FRESHNESS.RECALCULATING;
  }

  // Otherwise, take the WORST of the two — never claim live when analytics is stale.
  return worst(quote, analytics);
}

const ORDER = [
  FRESHNESS.LIVE,
  FRESHNESS.AGING,
  FRESHNESS.RECALCULATING,
  FRESHNESS.STALE,
  FRESHNESS.VERY_STALE,
  FRESHNESS.UNKNOWN,
];
function worst(a, b) {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

/**
 * "5s ago" / "2m ago" / "1h ago" — short human-readable.
 */
export function humanizeAge(ageMs) {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return "—";
  if (ageMs < 1000) return "just now";
  const sec = Math.round(ageMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export const FRESHNESS_THRESHOLDS = Object.freeze({
  LIVE_THRESHOLD_MS,
  AGING_THRESHOLD_MS,
  STALE_THRESHOLD_MS,
  ANALYTICS_LAG_TOLERANCE_MS,
});
