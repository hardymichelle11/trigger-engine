// =====================================================================
// Research Source Adapter (mock / manual)
// =====================================================================
// PURE function. Maps (symbol, source) tuples to deterministic mock
// findings the researchRunner can turn into proposed intelligence
// items. No live network ingestion — this is a settings-to-queue
// bridge so the operator can validate the governance flow before
// real adapters land.
//
// Hard rules:
//   - Deterministic only. Same (symbol, source) input always yields
//     the same finding(s).
//   - Findings carry trader-facing copy + lexicon-aligned catalyst /
//     risk labels (so they flow through whatChangedBuilder + thesis
//     health classification just like real intelligence).
//   - No raw scoring / cron / queue tokens. No medical claims that
//     aren't already public.
//   - Findings DO NOT include posture / verdict / allowedActions —
//     those are owned by the engines and surface elsewhere.
// =====================================================================

import { normalizeSymbol } from "./basketAgentTypes.js";

// ---------------------------------------------------------------------
// Mock library
// ---------------------------------------------------------------------
//
// Keyed by symbol → source → array of finding shells.
//
// Each shell is the operator-visible payload (title + thesis claim +
// catalysts + risks + tags). The runner adds the JSON-safe metadata
// (id, basketId, assignedAgent, status, etc.) when persisting to the
// agent memory store.

const MOCK_LIBRARY = Object.freeze({
  TEM: {
    earnings_releases: [
      {
        title: "TEM Q1 earnings beat — Data & Applications +40.5% YoY",
        coreClaim: "TEM Q1 results: revenue +36.1% YoY; diagnostics +34.7%; Data & Applications +40.5%. Consistent with the AI-health bridge thesis.",
        catalysts: ["Diagnostics revenue growth", "Data & Applications growth"],
        risks: [],
        scannerTags: ["ai_health", "diagnostics", "data_platform"],
      },
    ],
    company_releases: [
      {
        title: "TEM expanded multimodal data platform deployments",
        coreClaim: "TEM announced new hospital deployments for its multimodal data platform.",
        catalysts: ["Hospital adoption / expansion"],
        risks: [],
        scannerTags: ["ai_health", "clinical_ai"],
      },
    ],
    partnerships: [
      {
        title: "TEM extended pharma collaboration with AstraZeneca",
        coreClaim: "TEM expanded an existing biopharma collaboration covering oncology data services.",
        catalysts: ["Pharma partnership"],
        risks: [],
        scannerTags: ["ai_health", "pharma"],
      },
    ],
    fda_updates: [
      {
        title: "TEM received expanded FDA clearance for an MRD assay",
        coreClaim: "FDA expanded indications for a Tempus MRD assay in solid tumours.",
        catalysts: ["FDA approval"],
        risks: [],
        scannerTags: ["ai_health", "diagnostics", "mrd"],
      },
    ],
    options_iv: [
      {
        title: "TEM IV elevated into earnings — premium quality watch",
        coreClaim: "Implied volatility on TEM elevated; premium harvesting requires support + assignment-comfort confirmation per existing engine rules.",
        catalysts: [],
        risks: ["Elevated volatility"],
        scannerTags: ["ai_health", "high_beta"],
      },
    ],
  },

  GH: {
    earnings_releases: [
      {
        title: "GH liquid biopsy revenue accelerated",
        coreClaim: "Guardant reported continued growth in colorectal screening volumes.",
        catalysts: ["Diagnostics revenue growth"],
        risks: [],
        scannerTags: ["ai_health", "liquid_biopsy"],
      },
    ],
    fda_updates: [
      {
        title: "GH received expanded FDA approval on screening assay",
        coreClaim: "Guardant Health received an expanded label for its colorectal screening assay.",
        catalysts: ["FDA approval"],
        risks: [],
        scannerTags: ["ai_health", "liquid_biopsy"],
      },
    ],
    medicare_reimbursement: [
      {
        title: "Medicare expanded coverage for liquid biopsy screening",
        coreClaim: "CMS expanded coverage criteria for liquid biopsy in early-stage colorectal screening.",
        catalysts: ["Medicare / reimbursement decision"],
        risks: [],
        scannerTags: ["ai_health", "liquid_biopsy", "reimbursement"],
      },
    ],
  },

  NTRA: {
    earnings_releases: [
      {
        title: "NTRA MRD volumes continued to grow",
        coreClaim: "Natera reported continued growth in MRD test volumes across oncology indications.",
        catalysts: ["Diagnostics revenue growth"],
        risks: [],
        scannerTags: ["ai_health", "mrd"],
      },
    ],
    analyst_changes: [
      {
        title: "NTRA analyst upgrade — MRD adoption momentum",
        coreClaim: "Sell-side note highlighted MRD adoption momentum as supportive of medium-term thesis.",
        catalysts: ["Analyst upgrades/downgrades"],
        risks: [],
        scannerTags: ["ai_health", "mrd"],
      },
    ],
  },

  RHHBY: {
    ma_news: [
      {
        title: "Roche acquired PathAI in $1B+ deal",
        coreClaim: "Roche moved further into AI pathology. Sector validation but increased incumbent competition for AI-native diagnostics platforms like TEM.",
        catalysts: ["AI pathology validation"],
        risks: ["Incumbent pressure / competition"],
        scannerTags: ["ai_health", "digital_pathology"],
      },
    ],
    partnerships: [
      {
        title: "Roche extended Foundation Medicine genomics partnerships",
        coreClaim: "Roche reinforced its Foundation Medicine + Flatiron Health stack — fortress validation for the AI-health basket.",
        catalysts: ["Pharma partnership"],
        risks: [],
        scannerTags: ["ai_health", "fortress"],
      },
    ],
  },

  ABT: {
    earnings_releases: [
      {
        title: "ABT diagnostics earnings — defensive growth",
        coreClaim: "Abbott diagnostics segment delivered steady single-digit growth.",
        catalysts: ["Diagnostics revenue growth"],
        risks: [],
        scannerTags: ["ai_health", "fortress"],
      },
    ],
  },

  TMO: {
    earnings_releases: [
      {
        title: "TMO life-science tools demand stabilising",
        coreClaim: "Thermo Fisher reported sequential improvement in bioproduction and clinical research demand.",
        catalysts: [],
        risks: [],
        scannerTags: ["ai_health", "picks_shovels"],
      },
    ],
  },

  NVDA: {
    ma_news: [
      {
        title: "NVDA expanded healthcare AI infrastructure footprint",
        coreClaim: "NVIDIA extended its healthcare AI infrastructure deployments — sector signal but adjacency only for AI Health basket.",
        catalysts: ["AI infrastructure expansion"],
        risks: [],
        scannerTags: ["ai_health", "adjacency"],
      },
    ],
    options_iv: [
      {
        title: "NVDA IV expansion ahead of earnings",
        coreClaim: "Implied volatility expansion in NVDA — premium harvesting only inside the engine's existing posture rules.",
        catalysts: [],
        risks: ["Elevated volatility"],
        scannerTags: ["ai_health", "adjacency", "high_beta"],
      },
    ],
  },
});

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Look up deterministic mock findings for a (symbol, source) pair.
 * Returns an array (possibly empty). Never throws.
 *
 * @param {object} input
 * @param {string} input.symbol
 * @param {string} input.source
 * @returns {Array<object>}
 */
export function getMockFindings({ symbol, source } = {}) {
  const sym = normalizeSymbol(symbol);
  if (!sym || typeof source !== "string" || !source) return [];
  const bySource = MOCK_LIBRARY[sym];
  if (!bySource) return [];
  const arr = bySource[source];
  if (!Array.isArray(arr)) return [];
  // Defensive clone so callers can't mutate the library.
  return arr.map((row) => JSON.parse(JSON.stringify(row)));
}

/** True iff the library has at least one finding for the symbol. */
export function hasMockCoverageFor(symbol) {
  const sym = normalizeSymbol(symbol);
  if (!sym) return false;
  return Object.prototype.hasOwnProperty.call(MOCK_LIBRARY, sym);
}

/** Symbols the library knows about. Useful for tests and UI hints. */
export function listMockCoverageSymbols() {
  return Object.keys(MOCK_LIBRARY).slice();
}

/** All (symbol, source) tuples that resolve to at least one finding. */
export function listMockCoveragePairs() {
  const out = [];
  for (const [sym, bySource] of Object.entries(MOCK_LIBRARY)) {
    for (const source of Object.keys(bySource || {})) {
      out.push({ symbol: sym, source });
    }
  }
  return out;
}
