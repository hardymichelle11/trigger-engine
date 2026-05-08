// =====================================================================
// Session state — PREMARKET / REGULAR / AFTERHOURS / WEEKEND_REPLAY / CLOSED
// =====================================================================
// US equity session windows, evaluated in America/New_York regardless of
// the operator's local timezone. Used by:
//   - the refresh policy to pick a quote/analytics cadence
//   - the cockpit command bar to label what data the operator is seeing
//
// Hard rules:
//   - Pure function. No clock skew tricks; uses Intl with America/New_York
//     so DST is handled by the runtime.
//   - WEEKEND_REPLAY beats every other state on Sat/Sun — the live feed
//     isn't actually live, so the UI can degrade gracefully.
// =====================================================================

export const SESSION_STATES = Object.freeze({
  PREMARKET:       "PREMARKET",
  REGULAR:         "REGULAR",
  AFTERHOURS:      "AFTERHOURS",
  WEEKEND_REPLAY:  "WEEKEND_REPLAY",
  CLOSED:          "CLOSED",
});

export const SESSION_LABEL = Object.freeze({
  PREMARKET:      "Pre-market",
  REGULAR:        "Regular session",
  AFTERHOURS:     "After-hours",
  WEEKEND_REPLAY: "Weekend (replay only)",
  CLOSED:         "Closed",
});

// US equity session boundaries (minutes since ET midnight).
const PREMARKET_START   = 4  * 60;       // 4:00  AM ET
const REGULAR_START     = 9  * 60 + 30;  // 9:30  AM ET
const REGULAR_END       = 16 * 60;       // 4:00  PM ET
const AFTERHOURS_END    = 20 * 60;       // 8:00  PM ET

/**
 * Resolve the US equity session for a given timestamp.
 * @param {number|Date} [now]   epoch ms or Date; defaults to now
 * @returns {keyof typeof SESSION_STATES}
 */
export function resolveSessionState(now) {
  const dt = now == null ? new Date() : new Date(now);
  const { weekday, hour, minute } = easternParts(dt);

  if (weekday === "Sat" || weekday === "Sun") {
    return SESSION_STATES.WEEKEND_REPLAY;
  }

  const totalMin = hour * 60 + minute;

  if (totalMin >= PREMARKET_START && totalMin < REGULAR_START) {
    return SESSION_STATES.PREMARKET;
  }
  if (totalMin >= REGULAR_START && totalMin < REGULAR_END) {
    return SESSION_STATES.REGULAR;
  }
  if (totalMin >= REGULAR_END && totalMin < AFTERHOURS_END) {
    return SESSION_STATES.AFTERHOURS;
  }
  return SESSION_STATES.CLOSED;
}

// Internal — extract weekday + hour + minute in America/New_York.
function easternParts(dt) {
  // Intl.DateTimeFormat is the only DST-safe path in browser + Node.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = fmt.formatToParts(dt);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),                    // "Mon".."Sun"
    hour:    parseInt(get("hour"), 10) || 0,
    minute:  parseInt(get("minute"), 10) || 0,
  };
}

/**
 * Helpful predicates so the UI can branch without re-implementing them.
 */
export function isLiveSession(session) {
  return session === SESSION_STATES.PREMARKET
      || session === SESSION_STATES.REGULAR
      || session === SESSION_STATES.AFTERHOURS;
}
export function isReplayOnlySession(session) {
  return session === SESSION_STATES.WEEKEND_REPLAY
      || session === SESSION_STATES.CLOSED;
}
