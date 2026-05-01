// =====================================================
// MARKET SESSION DETECTOR (Phase 4.5A)
// =====================================================
// Pure helper that classifies a moment in time into one of
// four US-equity sessions. Used by sessionAwareUniverse to
// pick the right Polygon strategy.
//
// Sessions (US-equities, Eastern Time):
//   premarket  04:00 ≤ t < 09:30   (Mon–Fri, non-holiday)
//   regular    09:30 ≤ t < 16:00   (Mon–Fri, non-holiday)
//   postmarket 16:00 ≤ t < 20:00   (Mon–Fri, non-holiday)
//   closed     otherwise (incl. Saturday, Sunday, late night, early morning)
//
// Hard rules:
//   - Pure function. Same `now` → same output.
//   - Injectable `now` for deterministic tests.
//   - Holidays are NOT detected in 4.5A — treated as
//     regular weekdays. Documented limitation, addressed
//     in Phase 4.5C with an embedded NYSE calendar.
//   - Returns a frozen object so consumers cannot mutate.
// =====================================================

export const SESSION = Object.freeze({
  PREMARKET: "premarket",
  REGULAR: "regular",
  POSTMARKET: "postmarket",
  CLOSED: "closed",
});

const PREMARKET_OPEN_HOUR = 4;     // 04:00 ET
const REGULAR_OPEN_HOUR = 9;       // 09:30 ET
const REGULAR_OPEN_MIN = 30;
const REGULAR_CLOSE_HOUR = 16;     // 16:00 ET
const POSTMARKET_CLOSE_HOUR = 20;  // 20:00 ET

// Cached formatter — Intl.DateTimeFormat construction is non-trivial.
let _etFormatter = null;
function getEtFormatter() {
  if (_etFormatter) return _etFormatter;
  _etFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, weekday: "short",
  });
  return _etFormatter;
}

/**
 * Convert an epoch ms value into the wall-clock parts in America/New_York.
 * @param {number} epochMs
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number, weekday: string }}
 */
function getEtParts(epochMs) {
  const dt = new Date(epochMs);
  const parts = getEtFormatter().formatToParts(dt);
  const lookup = {};
  for (const p of parts) lookup[p.type] = p.value;
  // Intl can return "24" for the hour at midnight in some runtimes — normalize.
  const hour = lookup.hour === "24" ? 0 : Number(lookup.hour);
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour,
    minute: Number(lookup.minute),
    second: Number(lookup.second),
    weekday: lookup.weekday,                       // "Mon", "Tue", "Sat", ...
  };
}

const WEEKEND = new Set(["Sat", "Sun"]);

/**
 * @typedef {object} MarketSessionInfo
 * @property {string} session                 SESSION value
 * @property {string} sessionLabel            human label
 * @property {number} asOf                    echo of injected `now`
 * @property {boolean} isWeekend
 * @property {boolean} isHoliday              always false in 4.5A
 * @property {{ premarketOpen: string, regularOpen: string, regularClose: string, postmarketClose: string }} windows
 */

const SESSION_LABEL = Object.freeze({
  [SESSION.PREMARKET]:  "Premarket (US equities, 04:00–09:30 ET)",
  [SESSION.REGULAR]:    "Regular session (US equities, 09:30–16:00 ET)",
  [SESSION.POSTMARKET]: "Postmarket (US equities, 16:00–20:00 ET)",
  [SESSION.CLOSED]:     "Markets closed",
});

const FIXED_WINDOWS = Object.freeze({
  premarketOpen:   "04:00 ET",
  regularOpen:     "09:30 ET",
  regularClose:    "16:00 ET",
  postmarketClose: "20:00 ET",
});

/**
 * Classify a US-equities session based on injected `now`.
 *
 * @param {object} [options]
 * @param {number} [options.now]              epoch ms; defaults to Date.now()
 * @returns {MarketSessionInfo}               frozen
 */
export function classifyMarketSession(options = {}) {
  const epochMs = Number.isFinite(Number(options?.now)) ? Number(options.now) : Date.now();
  const et = getEtParts(epochMs);
  const isWeekend = WEEKEND.has(et.weekday);

  let session = SESSION.CLOSED;
  if (!isWeekend) {
    const minutes = et.hour * 60 + et.minute;
    const PRE = PREMARKET_OPEN_HOUR * 60;                                 // 240
    const RGO = REGULAR_OPEN_HOUR * 60 + REGULAR_OPEN_MIN;                // 570
    const RGC = REGULAR_CLOSE_HOUR * 60;                                  // 960
    const PMC = POSTMARKET_CLOSE_HOUR * 60;                               // 1200
    if (minutes >= PRE && minutes < RGO) session = SESSION.PREMARKET;
    else if (minutes >= RGO && minutes < RGC) session = SESSION.REGULAR;
    else if (minutes >= RGC && minutes < PMC) session = SESSION.POSTMARKET;
    else session = SESSION.CLOSED;
  }

  return Object.freeze({
    session,
    sessionLabel: SESSION_LABEL[session],
    asOf: epochMs,
    isWeekend,
    isHoliday: false,                 // TODO Phase 4.5C — NYSE holiday calendar
    windows: FIXED_WINDOWS,
  });
}

/**
 * Convenience predicates for the orchestrator.
 * @param {string} session
 */
export const isExtendedHours = (session) =>
  session === SESSION.PREMARKET || session === SESSION.POSTMARKET;

export const isMarketOpen = (session) =>
  session !== SESSION.CLOSED;
