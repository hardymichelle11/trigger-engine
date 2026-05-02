// =====================================================
// EXPIRATION RESOLVER (Phase 4.5C+1)
// =====================================================
// Pure helper that picks the nearest valid option-chain
// expiration from a list of available expirations, given
// a target DTE (days-to-expiration).
//
// Why this exists:
//   Phase 4.5C used `today + targetDte` as a calendar
//   guess. Options only trade on a sparse set of real
//   expirations (typically Fridays plus selected dailies).
//   A guessed date often misses the chain entirely and the
//   provider returns null — even when ThetaData is healthy.
//
// Hard rules:
//   - PURE function. Same input → same output. No I/O.
//   - NEVER throws on malformed input. Returns a structured
//     result with `expiration: null` and a `reason`.
//   - WHITELIST output. Caller cannot leak provider-specific
//     fields through this helper.
//   - Accepts heterogeneous expiration shapes ("YYYYMMDD",
//     "YYYY-MM-DD", or epoch ms numbers). Anything else is
//     dropped silently.
//   - Resolution order:
//       1. preferred  smallest expiration >= (today + targetDte)
//       2. fallback   smallest expiration >= today
//       3. else       expiration: null, reason: "no_future_expirations"
// =====================================================

import { normalizeExpiration } from "./normalizeOptionChain.js";

const MS_PER_DAY = 86_400_000;

const REASON = Object.freeze({
  NONE: null,
  EMPTY_LIST: "no_expirations_available",
  NO_FUTURE: "no_future_expirations",
  INVALID_TARGET: "invalid_target_dte",
});

const MATCHED = Object.freeze({
  PREFERRED: "preferred",
  FALLBACK: "fallback",
  NONE: null,
});

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

/**
 * Convert "YYYY-MM-DD" to epoch ms at UTC midnight. Returns null
 * if the value can't be parsed back to a valid Date.
 */
function isoToUtcMs(iso) {
  if (typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null;
  const t = Date.UTC(yyyy, mm - 1, dd);
  if (!Number.isFinite(t)) return null;
  // Round-trip check: rejects 2026-02-31 and similar.
  const d = new Date(t);
  if (d.getUTCFullYear() !== yyyy
      || d.getUTCMonth() + 1 !== mm
      || d.getUTCDate() !== dd) return null;
  return t;
}

/**
 * Compute UTC midnight for `now` so date math doesn't drift by
 * timezone-of-host. The caller passes `now` (epoch ms); we floor
 * to UTC midnight for stable comparison against ISO dates.
 */
function utcMidnight(nowMs) {
  const t = Number.isFinite(nowMs) ? nowMs : Date.now();
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Normalize a list of caller-supplied expirations into a sorted
 * unique array of `{ iso, ms }` entries. Drops anything that can't
 * be parsed to a calendar date.
 */
function normalizeExpirationList(rawList) {
  if (!Array.isArray(rawList)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of rawList) {
    const iso = normalizeExpiration(raw);
    if (!iso) continue;
    if (seen.has(iso)) continue;
    const ms = isoToUtcMs(iso);
    if (ms == null) continue;
    seen.add(iso);
    out.push({ iso, ms });
  }
  out.sort((a, b) => a.ms - b.ms);
  return out;
}

// --------------------------------------------------
// PUBLIC: resolveNearestExpiration
// --------------------------------------------------

/**
 * @typedef {object} ResolvedExpiration
 * @property {string|null} expiration       "YYYY-MM-DD" or null when none usable
 * @property {number|null} dte              days from today to chosen expiration (UTC midnight math)
 * @property {string|null} matched          "preferred" | "fallback" | null
 * @property {string|null} reason           diagnostic vocabulary; null on success
 * @property {number|null} targetDte        echoed back for diagnostics; null when invalid
 */

/**
 * Pick the nearest valid expiration given a target DTE.
 *
 *   1. preferred  smallest expiration >= (today + targetDte)
 *   2. fallback   smallest expiration >= today (if no preferred match)
 *   3. else       { expiration: null, reason: "no_future_expirations" }
 *
 * @param {object} args
 * @param {Array<string|number>} args.availableExpirations   provider-supplied list
 * @param {number} args.targetDte                             desired days-to-expiration
 * @param {number} [args.now]                                 epoch ms (injectable clock)
 * @returns {ResolvedExpiration}
 */
export function resolveNearestExpiration(args = {}) {
  const { availableExpirations, targetDte } = args;
  const nowMs = Number.isFinite(Number(args.now)) ? Number(args.now) : Date.now();

  const targetDteNum = Number(targetDte);
  const targetValid = Number.isFinite(targetDteNum) && targetDteNum >= 0;

  const list = normalizeExpirationList(availableExpirations);

  if (list.length === 0) {
    return Object.freeze({
      expiration: null,
      dte: null,
      matched: MATCHED.NONE,
      reason: REASON.EMPTY_LIST,
      targetDte: targetValid ? Math.round(targetDteNum) : null,
    });
  }

  if (!targetValid) {
    // Without a usable target, fall back to the next future expiration so
    // the caller still gets *something* honest. Reason captures the issue.
    const todayMs = utcMidnight(nowMs);
    const fallback = list.find(e => e.ms >= todayMs) || null;
    if (fallback) {
      const dte = Math.round((fallback.ms - todayMs) / MS_PER_DAY);
      return Object.freeze({
        expiration: fallback.iso,
        dte,
        matched: MATCHED.FALLBACK,
        reason: REASON.INVALID_TARGET,
        targetDte: null,
      });
    }
    return Object.freeze({
      expiration: null,
      dte: null,
      matched: MATCHED.NONE,
      reason: REASON.NO_FUTURE,
      targetDte: null,
    });
  }

  const todayMs = utcMidnight(nowMs);
  const targetMs = todayMs + Math.round(targetDteNum) * MS_PER_DAY;

  const preferred = list.find(e => e.ms >= targetMs) || null;
  if (preferred) {
    const dte = Math.round((preferred.ms - todayMs) / MS_PER_DAY);
    return Object.freeze({
      expiration: preferred.iso,
      dte,
      matched: MATCHED.PREFERRED,
      reason: REASON.NONE,
      targetDte: Math.round(targetDteNum),
    });
  }

  const fallback = list.find(e => e.ms >= todayMs) || null;
  if (fallback) {
    const dte = Math.round((fallback.ms - todayMs) / MS_PER_DAY);
    return Object.freeze({
      expiration: fallback.iso,
      dte,
      matched: MATCHED.FALLBACK,
      reason: REASON.NONE,
      targetDte: Math.round(targetDteNum),
    });
  }

  return Object.freeze({
    expiration: null,
    dte: null,
    matched: MATCHED.NONE,
    reason: REASON.NO_FUTURE,
    targetDte: Math.round(targetDteNum),
  });
}

export const EXPIRATION_RESOLVER_REASON = REASON;
export const EXPIRATION_RESOLVER_MATCHED = MATCHED;
