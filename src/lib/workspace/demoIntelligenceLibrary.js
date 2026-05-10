// =====================================================================
// Demo Intelligence Library
// =====================================================================
// Hardcoded sample intelligence the operator workspace can show inside
// the Intelligence Feed when no real approved or draft items exist for
// a searched symbol. Demo items are clearly tagged with isDemo = true
// so the UI can render a "Sample / demo intelligence" badge.
//
// Hard rules:
//   - Demo items must NEVER override engine posture, verdict,
//     allowedActions, risk flags, or Credit View. They live in the
//     Intelligence Feed only — not in marketIntelligenceContext.
//   - Demo items can influence whatChangedBuilder language as
//     contextual evidence (their `risks` and `catalysts` arrays use
//     the same labels the real lexicon uses).
//   - Demo items are not persisted into agentMemoryStore — they are
//     emitted on demand by getDemoIntelligenceFor().
// =====================================================================

import { normalizeSymbol } from "../portfolioCio/basketAgentTypes.js";

// ---------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------

const DEMO_LIBRARY = Object.freeze({
  AMD: Object.freeze({
    id: "demo_amd_counter_thesis",
    isDemo: true,
    sourceLabel: "Seeking Alpha",
    title: "AMD Has Flipped Nvidia: Time To Sell",
    type: "Counter-thesis / valuation risk",
    bias: "Cautionary",
    confidence: "Medium",
    confirms: [
      "AMD is recognized as a serious AI competitor.",
    ],
    challenges: [
      "Valuation stretched.",
      "Expectations saturation.",
      "Risk of multiple compression.",
    ],
    engineImpact:
      "Reduce chase behavior, increase staged-entry discipline, " +
      "favor premium harvesting or pullback entry, do not invalidate " +
      "the broader AI regime.",

    // Compatible with whatChangedBuilder + agentMemoryStore item
    // shapes so callers can drop demo items into a feed alongside
    // real items without special-casing the consumer.
    basketId: null,
    assignedAgent: null,
    status: "demo",
    approvedByUser: false,
    expiresAt: null,
    createdAt: 0,
    updatedAt: 0,
    sourceType: "demo",
    useAs: [],
    rawTextExcerpt: null,
    entities: {
      primarySymbols: ["AMD"],
      relatedSymbols: ["NVDA"],
      privateCompanies: [],
    },
    thesis: {
      coreClaim:
        "Counter-thesis: AMD valuation stretched; expectations saturated; " +
        "elevated chase risk into the AI regime move.",
      marketFrame: "AI utilization phase",
      companyRole: "AI infrastructure leader",
      basketRole: null,
    },
    risks: [
      "Valuation / crowded-trade risk",
      "Execution risk",
    ],
    catalysts: [],
    scannerTags: ["counter_thesis", "valuation_risk"],
  }),
});

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Look up the demo intelligence item for a symbol. Returns null when
 * no demo exists. Callers should ONLY surface this when no real
 * approved or draft intelligence is available for the symbol — the
 * demo is meant to seed the UI, not to compete with operator memory.
 */
export function getDemoIntelligenceFor(rawSymbol) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym) return null;
  return DEMO_LIBRARY[sym] || null;
}

/** True iff the library has a demo item for the symbol. */
export function hasDemoIntelligence(rawSymbol) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym) return false;
  return Object.prototype.hasOwnProperty.call(DEMO_LIBRARY, sym);
}

/** Symbols the library knows about. */
export function listDemoIntelligenceSymbols() {
  return Object.keys(DEMO_LIBRARY).slice();
}
