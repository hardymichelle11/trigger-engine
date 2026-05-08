// =====================================================================
// Entry Readiness / Provenance Gate (Phase 4.7.8)
// =====================================================================
// Operator safety layer: collapses the engine state + the trade-context
// provenance flags into a single, decisive verdict so the operator can
// tell at a glance whether a candidate is actionable RIGHT NOW.
//
//   ready_to_review   — verified signal + live chain + live/high-conf
//                       premium + no severe stale flags
//   verify_first      — promising but caveats: estimated premium,
//                       fallback expiration, unverified signal, wide
//                       spread, or aging data
//   wait_for_chain    — no expirations / chain missing / premium
//                       unavailable
//   do_not_trade      — engine posture avoid/skip, unaffordable, regime
//                       severely mismatched, stale market data, missing
//                       critical price fields
//
// Hard rules:
//   - PURE function. No fetch, no I/O, no side effects.
//   - Does NOT change the engine's score or a candidate's ranking.
//     This is a render-time gate that sits on top of the engine output.
//   - Returns at most 3 reasons (most-severe first) so the UI never
//     has to truncate.
//   - Defensive on every input: null / partial / malformed data
//     resolves to do_not_trade — we never default to "ready".
// =====================================================================

const READINESS = Object.freeze({
  READY:        "ready_to_review",
  VERIFY:       "verify_first",
  WAIT_CHAIN:   "wait_for_chain",
  DO_NOT_TRADE: "do_not_trade",
});

const READINESS_LABEL = Object.freeze({
  ready_to_review: "Ready to review",
  verify_first:    "Verify first",
  wait_for_chain:  "Wait for chain",
  do_not_trade:    "Do not trade",
});

const READINESS_SEVERITY = Object.freeze({
  ready_to_review: "green",
  verify_first:    "amber",
  wait_for_chain:  "amber",
  do_not_trade:    "red",
});

const OPERATOR_INSTRUCTION = Object.freeze({
  ready_to_review:
    "Live data and verified signal — confirm spread, then place at limit between bid and mid.",
  verify_first:
    "Promising setup with caveats. Verify the flagged fields before sizing.",
  wait_for_chain:
    "Do not enter from this view yet. Confirm live chain, bid/ask spread, expiration, and premium quality first.",
  do_not_trade:
    "Skip this candidate in current state. Engine has not cleared it for entry.",
});

// Window of "data is fine but aging" before it becomes hard-stale.
const AGING_MS = 5 * 60 * 1000;       // 5 min
const STALE_MS = 30 * 60 * 1000;      // 30 min

function lc(v) {
  return typeof v === "string" ? v.toLowerCase() : "";
}

function numericOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pack(readiness, reasons) {
  return Object.freeze({
    readiness,
    label: READINESS_LABEL[readiness],
    severity: READINESS_SEVERITY[readiness],
    // Cap at 3 — UI never has to truncate, and the operator gets only
    // the most-severe pointers without scrolling.
    reasons: (reasons || []).slice(0, 3),
    operatorInstruction: OPERATOR_INSTRUCTION[readiness],
  });
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * @param {object|null} candidate    view-model row
 *   {
 *     actionCode?: string,
 *     capitalFitCode?: string,
 *     regimeAlignment?: string,
 *     signalState?: string,
 *     score?: number,
 *     ...
 *   }
 * @param {object|null} provenance   trade-context + market-data flags
 *   {
 *     currentPrice?: number,
 *     suggestedStrike?: number,
 *     premiumSource?: "live" | "estimated" | "unavailable",
 *     resolvedExpiration?: string|null,
 *     resolvedExpirationMatched?: "preferred" | "fallback" | null,
 *     resolvedExpirationReason?: string|null,
 *     spreadWidthLabel?: "tight" | "moderate" | "wide" | null,
 *     marketDataAgeMs?: number,
 *     marketFreshness?: "LIVE" | "AGING" | "STALE" | "MOCK",
 *   }
 * @returns {{readiness, label, severity, reasons, operatorInstruction}}
 */
export function buildEntryReadiness(candidate, provenance) {
  // Defensive: nothing to work with → never claim ready.
  if (!candidate && !provenance) {
    return pack(READINESS.DO_NOT_TRADE, [
      "No candidate or trade context available.",
    ]);
  }

  const reasons = [];
  const cand = candidate || {};
  const prov = provenance || {};

  // -------------------------------------------------------------------
  // Priority 1 — DO_NOT_TRADE (hard blocks)
  // -------------------------------------------------------------------

  const action = lc(cand.actionCode || cand.action);
  const fit = lc(cand.capitalFitCode || cand.capitalFit);
  const regime = lc(cand.regimeAlignment);

  if (action.startsWith("skip") || action === "avoid" || action === "no_trade") {
    reasons.push("Engine posture is avoid/skip.");
    return pack(READINESS.DO_NOT_TRADE, reasons);
  }

  if (fit === "not_affordable") {
    reasons.push("Position size exceeds available cash.");
    return pack(READINESS.DO_NOT_TRADE, reasons);
  }

  if (regime === "mismatch" || regime === "severe_mismatch") {
    reasons.push("Setup conflicts with current market regime.");
    return pack(READINESS.DO_NOT_TRADE, reasons);
  }

  // Stale market data → never trade off it.
  const ageMs = numericOrNull(prov.marketDataAgeMs);
  const explicitlyStale = lc(prov.marketFreshness) === "stale";
  if (explicitlyStale || (ageMs != null && ageMs > STALE_MS)) {
    reasons.push("Market data is stale — do not trade off this snapshot.");
    return pack(READINESS.DO_NOT_TRADE, reasons);
  }

  // Missing critical price fields. We deliberately do NOT fall back to
  // candidate.price here — when provenance has no currentPrice, that's
  // the chain query failing, and the candidate's row.price could be a
  // stale snapshot from a previous scan. Refuse to trade off it.
  const spot = numericOrNull(prov.currentPrice);
  if (spot == null || spot <= 0) {
    reasons.push("Current price is missing or invalid.");
    return pack(READINESS.DO_NOT_TRADE, reasons);
  }

  // -------------------------------------------------------------------
  // Priority 2 — WAIT_FOR_CHAIN (the chain itself isn't ready)
  // -------------------------------------------------------------------

  const expirationReason = lc(prov.resolvedExpirationReason);
  const expirationMatched = lc(prov.resolvedExpirationMatched);
  const noResolvedExpiration =
    !prov.resolvedExpiration || expirationMatched === "" || expirationMatched === null;
  const noExpirationsAvailable =
    expirationReason === "no_expirations_available" ||
    expirationReason === "no_chain";

  if (noExpirationsAvailable || (noResolvedExpiration && expirationReason)) {
    reasons.push("No live expirations are available.");
    if (lc(prov.premiumSource) === "estimated") {
      reasons.push("Premium is estimated, not from a live chain.");
    }
    if (lc(cand.signalState) === "unverified") {
      reasons.push("Signal is not fully verified.");
    }
    return pack(READINESS.WAIT_CHAIN, reasons);
  }

  if (lc(prov.premiumSource) === "unavailable") {
    reasons.push("Option premium is unavailable for this expiration.");
    return pack(READINESS.WAIT_CHAIN, reasons);
  }

  // -------------------------------------------------------------------
  // Priority 3 — VERIFY_FIRST (actionable but caveat-laden)
  // -------------------------------------------------------------------

  if (lc(cand.signalState) === "unverified") {
    reasons.push("Signal is not fully verified.");
  }
  if (lc(prov.premiumSource) === "estimated") {
    reasons.push("Premium is estimated, not from a live chain.");
  }
  if (expirationMatched === "fallback") {
    reasons.push("Expiration is a resolver fallback (chain may be thin).");
  }
  if (lc(prov.spreadWidthLabel) === "wide") {
    reasons.push("Bid/ask spread is wide.");
  }
  if (ageMs != null && ageMs > AGING_MS) {
    reasons.push("Market data is aging (older than 5 minutes).");
  }
  if (lc(prov.marketFreshness) === "aging" && (ageMs == null || ageMs <= AGING_MS)) {
    // Honor an explicit AGING flag even when we don't have an exact ageMs.
    reasons.push("Market data is aging.");
  }

  if (reasons.length > 0) {
    return pack(READINESS.VERIFY, reasons);
  }

  // -------------------------------------------------------------------
  // Priority 4 — READY_TO_REVIEW
  // -------------------------------------------------------------------

  return pack(READINESS.READY, [
    "Live chain, verified signal, and fresh market data.",
  ]);
}

// Exported for tests / consumers that want the enums.
export const ENTRY_READINESS = Object.freeze({
  STATES: READINESS,
  LABELS: READINESS_LABEL,
  SEVERITIES: READINESS_SEVERITY,
});
