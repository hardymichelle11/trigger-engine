// =====================================================================
// Market Intelligence Context Builder
// =====================================================================
// PURE function. Combines approved agent memory + engine fields from
// the agent insight into the operator-safe `marketIntelligenceContext`
// block surfaced inside the Credit-View detail panel and the scanner
// top-cards.
//
// Hard rules:
//   - No raw memory JSON. Builder picks only operator-safe fields and
//     returns a flat structured object.
//   - No raw scores / weights / coefficients / hidden ranks.
//   - Returns null when no approved memory matches the symbol so the
//     UI hides the block entirely (rather than rendering an empty
//     stub).
//   - Memory may enrich language but cannot change posture, verdict,
//     allowedActions, managerContext, or risk flags. The builder
//     READS those engine fields to gate the trade translation; it
//     never writes to them.
//   - tradeTranslation must NOT imply actionable entry when posture
//     is risk_elevated, avoid_for_now, wait_for_confirmation, or
//     sector_confirmation_signal.
// =====================================================================

// Posture strings are duplicated here (rather than imported from
// aiHealthDiagnosticsAgent.js) so the agent can import this builder
// without a circular module graph. The agent enum remains the source
// of truth — these strings must match the values exported there.
const POSTURE = Object.freeze({
  ACCUMULATE_WATCH:           "accumulate_watch",
  PREMIUM_CANDIDATE:          "premium_candidate",
  WAIT_FOR_CONFIRMATION:      "wait_for_confirmation",
  LONG_HOLD_ANCHOR:           "long_hold_anchor",
  AVOID_FOR_NOW:              "avoid_for_now",
  RISK_ELEVATED:              "risk_elevated",
  SECTOR_CONFIRMATION_SIGNAL: "sector_confirmation_signal",
});

const ENGINE_NON_ACTIONABLE_POSTURES = new Set([
  POSTURE.RISK_ELEVATED,
  POSTURE.AVOID_FOR_NOW,
  POSTURE.WAIT_FOR_CONFIRMATION,
  POSTURE.SECTOR_CONFIRMATION_SIGNAL,
]);

const BASKET_LABELS = Object.freeze({
  ai_health_diagnostics: "AI Health / Diagnostics",
});

const MEMORY_STATUS = Object.freeze({
  APPROVED: "approved",
  NONE:     "none",
  EXPIRED:  "expired",
});

/**
 * @param {object} input
 * @param {string} input.symbol
 * @param {string} [input.basketId]
 * @param {string} [input.agentId]
 * @param {object} [input.agentInsight]   may be the engine evalRes or
 *                                        the full enriched insight; only
 *                                        reads operator-safe fields.
 * @param {Array<object>} [input.approvedMemory]   approved (non-archived,
 *                                                  non-expired) intelligence
 *                                                  items already filtered to
 *                                                  the basket / agent scope.
 * @param {object} [input.thesisHealth]   optional output of
 *                                        evaluateThesisHealth — used to
 *                                        decorate copy when supplied.
 * @returns {object|null}
 */
export function buildMarketIntelligenceContext(input = {}) {
  if (!input || typeof input.symbol !== "string" || !input.symbol) return null;

  const memory = arrayify(input.approvedMemory);
  if (memory.length === 0) return null;

  // Filter memory to items that name the symbol OR are basket-wide
  // (no entities). Symbol-specific memory for TEM should NOT decorate
  // GH unless GH appears in the related-symbols list of that item.
  const relevant = memory.filter((it) => matchesSymbolOrBasket(it, input.symbol));
  if (relevant.length === 0) return null;

  const insight = input.agentInsight || null;
  const basket  = BASKET_LABELS[input.basketId] || input.basketId || null;

  const agentRead         = pickAgentRead(relevant, insight);
  const supportingSignals = aggregate(relevant, "catalysts");
  const challengingSignals = aggregate(relevant, "risks");
  const competitors       = aggregateCompetitors(relevant);
  const primaryRisk       = pickPrimaryRisk(challengingSignals, insight);
  const thesisAlignment   = deriveAlignment(insight, input.thesisHealth);
  const tradeTranslation  = composeTradeTranslation(insight);
  const lastUpdated       = mostRecentTimestamp(relevant);

  return {
    basket,
    agentRead,
    thesisAlignment,
    primaryRisk,
    tradeTranslation,
    supportingSignals: supportingSignals.slice(0, 12),
    challengingSignals: challengingSignals.slice(0, 12),
    competitors: competitors.slice(0, 8),
    memoryStatus: MEMORY_STATUS.APPROVED,
    lastUpdated,
  };
}

// ---------------------------------------------------------------------
// Posture-gated trade translation
// ---------------------------------------------------------------------

export function composeTradeTranslation(insight) {
  const posture = insight?.posture;
  // When the engine posture is non-actionable, NEVER produce language
  // that suggests action. This is the hard safety rail.
  if (ENGINE_NON_ACTIONABLE_POSTURES.has(posture)) {
    switch (posture) {
      case POSTURE.RISK_ELEVATED:
        return "Thesis remains relevant, but current risk posture is elevated. Treat this as context only.";
      case POSTURE.AVOID_FOR_NOW:
        return "Approved thesis context only — defer trade activity until reads improve.";
      case POSTURE.WAIT_FOR_CONFIRMATION:
        return "Approved thesis supports watchlist placement. Wait for technical and Credit View confirmation.";
      case POSTURE.SECTOR_CONFIRMATION_SIGNAL:
        return "Sector confirmation only — do not deploy basket capital here.";
      default:
        return "Context only — confirm with manager reads before any action.";
    }
  }
  switch (posture) {
    case POSTURE.PREMIUM_CANDIDATE:
      return "Approved thesis supports monitoring for premium harvesting only if support, IV quality, and assignment comfort align.";
    case POSTURE.ACCUMULATE_WATCH:
      return "Approved thesis supports continued monitoring with selective accumulation.";
    case POSTURE.LONG_HOLD_ANCHOR:
      return "Approved thesis supports defensive sector exposure. Do not chase — wait for premium attractiveness.";
    default:
      return "Approved thesis supports continued monitoring, but current engine posture does not permit action.";
  }
}

// ---------------------------------------------------------------------
// Alignment / agent-read / risk helpers
// ---------------------------------------------------------------------

function deriveAlignment(insight, thesisHealth) {
  // Honour the thesis-health verdict when supplied, but never let it
  // promote alignment past what the engine reads support.
  if (thesisHealth && typeof thesisHealth.status === "string") {
    if (thesisHealth.status === "weakening")    return "conflicting";
    if (thesisHealth.status === "conflicting")  return "mixed";
  }
  if (!insight) return "unavailable";
  const c = insight.constructiveManagerCount || 0;
  const k = insight.cautiousManagerCount || 0;
  if (k >= 2)               return "conflicting";
  if (c >= 2 && k === 0)    return "supportive";
  if (c >= 1 && k >= 1)     return "mixed";
  if (c >= 1)               return "supportive";
  return "unavailable";
}

function pickAgentRead(relevantMemory, insight) {
  // Prefer the operator's most-recent thesis claim. Fall back to the
  // basket profile's role line surfaced on the insight, then to the
  // insight's thesisSummary.
  for (const it of relevantMemory) {
    const claim = it && it.thesis && it.thesis.coreClaim;
    if (typeof claim === "string" && claim.trim()) return claim.trim();
  }
  if (insight?.role && typeof insight.role === "string") return insight.role;
  if (insight?.thesisSummary && typeof insight.thesisSummary === "string") return insight.thesisSummary;
  return null;
}

function pickPrimaryRisk(challengingSignals, insight) {
  if (challengingSignals.length > 0) return challengingSignals[0];
  if (insight?.primaryRisk) return insight.primaryRisk;
  return null;
}

function aggregate(items, field) {
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const arr = Array.isArray(it?.[field]) ? it[field] : [];
    for (const v of arr) {
      if (typeof v !== "string" || !v.trim()) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function aggregateCompetitors(items) {
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const privates = Array.isArray(it?.entities?.privateCompanies) ? it.entities.privateCompanies : [];
    const related  = Array.isArray(it?.entities?.relatedSymbols) ? it.entities.relatedSymbols : [];
    for (const c of [...privates, ...related]) {
      if (typeof c !== "string" || !c.trim()) continue;
      const k = c.trim();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Memory filtering
// ---------------------------------------------------------------------

function matchesSymbolOrBasket(item, symbol) {
  if (!item || !item.entities) return true;   // basket-wide / no entity scope
  const primaries = Array.isArray(item.entities.primarySymbols) ? item.entities.primarySymbols : [];
  const related   = Array.isArray(item.entities.relatedSymbols) ? item.entities.relatedSymbols : [];
  if (primaries.length === 0 && related.length === 0) return true;   // basket-wide
  return primaries.includes(symbol) || related.includes(symbol);
}

function mostRecentTimestamp(items) {
  let max = 0;
  for (const it of items) {
    const t = typeof it?.updatedAt === "number" ? it.updatedAt
            : typeof it?.createdAt === "number" ? it.createdAt
            : 0;
    if (t > max) max = t;
  }
  return max || null;
}

function arrayify(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === "object") return [v];
  return [];
}
