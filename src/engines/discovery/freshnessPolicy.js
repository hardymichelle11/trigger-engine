// =====================================================
// FRESHNESS POLICY (Phase 4.5A1)
// =====================================================
// Pure helper that resolves the right `maxStaleSec` for a
// given session × scannerMode pair.
//
// Why this exists:
//   Polygon's snapshot endpoints on the current plan tier
//   are ~15 minutes delayed. The previous mode-only gate
//   (neutral=900s) rejected nearly all regular-session
//   data because rows arrived at ~900–903s old. During
//   premarket/postmarket the data is intentionally
//   session-bounded (last regular close), so any "live
//   freshness" gate is meaningless. During closed hours
//   freshness is undefined.
//
// Hard rules:
//   - Pure function. Same input → same output.
//   - When session is unknown, falls back to existing
//     mode defaults — preserves back-compat for callers
//     that don't pass session.
//   - The 6-hour prior-session safeguard catches yesterday's
//     data sneaking through during a regular session under
//     a more permissive threshold.
// =====================================================

/**
 * @typedef {object} FreshnessPolicy
 * @property {number} [maxStaleSec]    threshold in seconds (omitted when disabled)
 * @property {boolean} disabled        true when freshness rejection is suppressed
 * @property {"session"|"mode_default"} source
 * @property {string} justification    human-readable reason for the chosen value
 */

// Per-session, per-mode threshold table.
export const FRESHNESS_POLICY = Object.freeze({
  regular: Object.freeze({
    conservative: 1080,    // 18 min — strict, but absorbs ~15-min snapshot delay
    neutral:      1500,    // 25 min — safe default for delayed-tier snapshots
    aggressive:   3600,    // 60 min — operator opts in to wider window
  }),
  premarket: Object.freeze({
    conservative: 21600,   // 6 h — covers premarket window from 04:00 ET
    neutral:      21600,
    aggressive:   21600,
  }),
  postmarket: Object.freeze({
    conservative: 21600,   // 6 h — covers postmarket window from 16:00 ET
    neutral:      21600,
    aggressive:   21600,
  }),
  closed: Object.freeze({
    conservative: { disabled: true },
    neutral:      { disabled: true },
    aggressive:   { disabled: true },
  }),
});

// Back-compat defaults: matches the existing SCANNER_MODE_RULES.maxStaleSec
// values so callers that do NOT pass session continue to behave exactly as
// they did before Phase 4.5A1.
const MODE_DEFAULTS = Object.freeze({
  conservative: 300,       // 5 min
  neutral:      900,       // 15 min
  aggressive:   3600,      // 60 min
});

// Prior-session safeguard. Used by the scanner only during regular session:
// if a quote's age exceeds this, reject regardless of the mode-derived
// threshold. Catches yesterday's data even when the regular policy is lenient.
export const PRIOR_SESSION_SAFEGUARD_SEC = 6 * 3600;     // 21600s

/**
 * Resolve the freshness policy for a session × mode.
 *
 * @param {object} args
 * @param {string} [args.session]         "regular" | "premarket" | "postmarket" | "closed"
 * @param {string} [args.scannerMode]     "conservative" | "neutral" | "aggressive"
 * @returns {FreshnessPolicy}
 */
export function resolveFreshnessPolicy(args = {}) {
  const mode = String(args?.scannerMode || "neutral").toLowerCase();
  const sess = args?.session ? String(args.session).toLowerCase() : null;

  // No session → mode default (back-compat for callers that don't pass session).
  if (!sess) {
    return {
      maxStaleSec: MODE_DEFAULTS[mode] ?? MODE_DEFAULTS.neutral,
      disabled: false,
      source: "mode_default",
      justification: "no session supplied — using existing mode default",
    };
  }

  const sessionTable = FRESHNESS_POLICY[sess];
  if (!sessionTable) {
    return {
      maxStaleSec: MODE_DEFAULTS[mode] ?? MODE_DEFAULTS.neutral,
      disabled: false,
      source: "mode_default",
      justification: `unknown session '${sess}' — using mode default`,
    };
  }

  const value = sessionTable[mode] ?? sessionTable.neutral;
  if (value && typeof value === "object" && value.disabled === true) {
    return {
      disabled: true,
      source: "session",
      justification: `freshness rejection disabled for '${sess}' session`,
    };
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return {
      maxStaleSec: MODE_DEFAULTS[mode] ?? MODE_DEFAULTS.neutral,
      disabled: false,
      source: "mode_default",
      justification: `policy table value for ${sess}/${mode} is invalid — using mode default`,
    };
  }

  return {
    maxStaleSec: numeric,
    disabled: false,
    source: "session",
    justification: `${sess}/${mode} → ${numeric}s`,
  };
}

/**
 * Prior-session safeguard check. Returns true if a quote's age would put it
 * BEFORE the start of the current regular session — i.e. it's a yesterday
 * (or older) timestamp masquerading as a current quote.
 *
 * @param {number} ageSec
 * @param {string} [session]
 * @returns {boolean}
 */
export function isPriorSessionTimestamp(ageSec, session) {
  if (String(session || "").toLowerCase() !== "regular") return false;
  const n = Number(ageSec);
  if (!Number.isFinite(n) || n < 0) return false;
  return n > PRIOR_SESSION_SAFEGUARD_SEC;
}

/**
 * Mode-default exposure for tests / consumers that need to compare against
 * the back-compat values without hard-coding them elsewhere.
 */
export function getModeDefault(scannerMode) {
  const mode = String(scannerMode || "neutral").toLowerCase();
  return MODE_DEFAULTS[mode] ?? MODE_DEFAULTS.neutral;
}
