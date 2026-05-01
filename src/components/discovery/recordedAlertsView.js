// =====================================================
// RECORDED ALERTS VIEW (Phase 4.2)
// =====================================================
// Read-only projection from alertHistory.loadAlertHistory()
// rows into UI-safe view-model items for the Lethal Board's
// Recorded Alerts panel.
//
// Hard rules:
//   - PURE function. Same input → same output.
//   - Tolerates malformed / partial / non-array input.
//   - Drops rows that lack a usable symbol (rather than
//     rendering "—" placeholders that look like real alerts).
//   - Surfaces ONLY user-facing fields. No scoreBreakdown,
//     no engine internals, no probability/IV pass-through.
//   - Limits length to ALERT_DISPLAY_LIMIT (default 8).
// =====================================================

export const ALERT_DISPLAY_LIMIT = 8;
export const ALERT_DISPLAY_MIN = 5;     // spec: most recent 5–10

/**
 * @typedef {object} ProjectedAlertRow
 * @property {number|null} timestamp           epoch ms (null when absent)
 * @property {string} timestampLabel           pre-formatted display string
 * @property {string} symbol                   uppercase
 * @property {string|null} action
 * @property {number|null} score
 * @property {string|null} priority
 * @property {string|null} summary             passthrough summary text
 * @property {string|null} event               derived from summary (may be null)
 * @property {string|null} displacedFrom       prior winner symbol when event is displacement
 * @property {boolean} bestUseOfCapital        true for both alert events surfaced here
 */

const EVENT_NEW_BEST = "new_best_opportunity";
const EVENT_DISPLACED = "trade_displaced_by_better_opportunity";

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

// Match "[NEW] displaced [PRIOR] ..."
const DISPLACED_RE = /^\s*([A-Z][A-Z0-9.\-]{0,9})\s+displaced\s+([A-Z][A-Z0-9.\-]{0,9})/;
const NEW_BEST_RE = /^new best (use of capital|opportunity)/i;

/**
 * @param {string|null|undefined} summary
 * @returns {string|null}
 */
function deriveEventFromSummary(summary) {
  if (!summary || typeof summary !== "string") return null;
  if (NEW_BEST_RE.test(summary)) return EVENT_NEW_BEST;
  if (DISPLACED_RE.test(summary)) return EVENT_DISPLACED;
  if (/displaced/i.test(summary)) return EVENT_DISPLACED;
  return null;
}

/**
 * @param {string|null|undefined} summary
 * @returns {string|null}                  prior winner symbol or null
 */
function deriveDisplacedFromSummary(summary) {
  if (!summary || typeof summary !== "string") return null;
  const m = summary.match(DISPLACED_RE);
  if (!m) return null;
  const prior = m[2];
  return SYMBOL_RE.test(prior) ? prior : null;
}

/**
 * @param {string|null|undefined} sym
 * @returns {string|null}
 */
function safeSymbol(sym) {
  if (typeof sym !== "string") return null;
  const u = sym.toUpperCase().trim();
  return SYMBOL_RE.test(u) ? u : null;
}

/**
 * @param {*} ts
 * @returns {{ ts: number|null, label: string }}
 */
function safeTimestamp(ts, fallbackLabel) {
  const n = Number(ts);
  if (Number.isFinite(n) && n > 0) {
    let label;
    try { label = new Date(n).toLocaleString(); }
    catch { label = String(n); }
    return { ts: n, label };
  }
  if (typeof fallbackLabel === "string" && fallbackLabel.length > 0) {
    return { ts: null, label: fallbackLabel };
  }
  return { ts: null, label: "—" };
}

/**
 * Project raw alertHistory rows into a UI-safe view model.
 * Order is preserved (alertHistory.unshift writes newest first).
 *
 * @param {unknown} rawHistory                 result of loadAlertHistory()
 * @param {number} [limit]                     default ALERT_DISPLAY_LIMIT
 * @returns {ProjectedAlertRow[]}
 */
export function projectAlertHistory(rawHistory, limit = ALERT_DISPLAY_LIMIT) {
  if (!Array.isArray(rawHistory)) return [];
  const cap = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.min(Math.max(1, Math.floor(Number(limit))), 50) : ALERT_DISPLAY_LIMIT;

  const out = [];
  for (const raw of rawHistory) {
    if (out.length >= cap) break;
    if (!raw || typeof raw !== "object") continue;

    const symbol = safeSymbol(raw.symbol);
    if (!symbol) continue;

    const summary = typeof raw.summary === "string" ? raw.summary : null;
    const event = deriveEventFromSummary(summary);
    const displacedFrom = deriveDisplacedFromSummary(summary);

    const action = typeof raw.action === "string" ? raw.action : null;
    const priority = typeof raw.priority === "string" ? raw.priority : null;

    const score = (raw.score === 0 || Number.isFinite(Number(raw.score)))
      ? Number(raw.score) : null;

    const { ts, label } = safeTimestamp(raw.timestamp, raw.dateStr);

    out.push({
      timestamp: ts,
      timestampLabel: label,
      symbol,
      action,
      score: Number.isFinite(score) ? score : null,
      priority,
      summary,
      event,
      displacedFrom,
      bestUseOfCapital: true,           // record exists ⇒ event was a top-of-board alert
    });
  }

  return out;
}

/**
 * Convenience wrapper around an injected loadAlertHistory function.
 * Used by tests to verify "loadAlertHistory is called on mount/init."
 *
 * @param {() => unknown} loadFn
 * @param {number} [limit]
 */
export function loadProjectedAlerts(loadFn, limit = ALERT_DISPLAY_LIMIT) {
  if (typeof loadFn !== "function") return [];
  let raw;
  try { raw = loadFn(); }
  catch { return []; }
  return projectAlertHistory(raw, limit);
}

// --------------------------------------------------
// HUMAN LABELS
// --------------------------------------------------

export const ALERT_EVENT_LABEL = Object.freeze({
  [EVENT_NEW_BEST]: "new best opportunity",
  [EVENT_DISPLACED]: "displaced",
});

/**
 * @param {string|null} event
 * @returns {string}
 */
export function alertEventLabel(event) {
  if (!event) return "—";
  return ALERT_EVENT_LABEL[event] || String(event);
}
