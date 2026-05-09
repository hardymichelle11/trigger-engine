// =====================================================================
// AI Health / Diagnostics — per-symbol profile sidecar
// =====================================================================
// PURE constants. Each symbol carries a structured profile so the
// AI Health specialty surfaces (panel, scanner, agent) can render
// operator-facing copy without leaking raw scoring internals.
//
// Hard rules:
//   - Trader-facing copy only. No raw scores / weights / coefficients.
//   - No medical claims that aren't already public ("dominates",
//     "best-in-class") — phrase via mandate / role.
//   - Sidecar is keyed by symbol. Unknown symbols return null so callers
//     can fall back to the generic basket panel without crashing.
// =====================================================================

import { normalizeSymbol } from "./basketAgentTypes.js";

export const AI_HEALTH_DIAGNOSTICS_BASKET_ID = "ai_health_diagnostics";

export const AI_HEALTH_DIAGNOSTICS_CATEGORIES = Object.freeze({
  AI_OPERATING_SYSTEM:        "ai_operating_system",
  LIQUID_BIOPSY:              "liquid_biopsy",
  MRD_MONITORING:             "mrd_monitoring",
  GENOMICS_TESTING:           "genomics_testing",
  DIGITAL_PATHOLOGY:          "digital_pathology",
  PHARMA_DATA_PLATFORM:       "pharma_data_platform",
  DIAGNOSTIC_FORTRESS:        "diagnostic_fortress",
  AI_INFRASTRUCTURE_ENABLER:  "ai_infrastructure_enabler",
  LIFE_SCIENCE_TOOLS:         "life_science_tools",
});

export const VOLATILITY_PROFILE = Object.freeze({
  VERY_HIGH: "very_high",
  HIGH:      "high",
  MEDIUM:    "medium",
  LOW:       "low",
});

export const OPTION_PROFILE = Object.freeze({
  PREMIUM_CANDIDATE:           "premium_candidate",
  SELECTIVE_PREMIUM_CANDIDATE: "selective_premium_candidate",
  PREMIUM_CANDIDATE_EXPENSIVE: "premium_candidate_expensive",
  LONG_HOLD_OR_ANCHOR:         "long_hold_or_anchor",
  WATCHLIST:                   "watchlist",
  WATCHLIST_ADJACENCY:         "watchlist_adjacency",
});

export const TIER = Object.freeze({
  TIER_1_PURE_PLAY:           "tier_1_pure_play",
  TIER_2_INCUMBENT_FORTRESS:  "tier_2_incumbent_fortress",
  TIER_3_ADJACENCY:           "tier_3_adjacency",
});

// Operator-facing label used in chips / titles.
export const CATEGORY_LABELS = Object.freeze({
  [AI_HEALTH_DIAGNOSTICS_CATEGORIES.AI_OPERATING_SYSTEM]:       "AI Health Bridge",
  [AI_HEALTH_DIAGNOSTICS_CATEGORIES.LIQUID_BIOPSY]:             "Liquid Biopsy Leader",
  [AI_HEALTH_DIAGNOSTICS_CATEGORIES.MRD_MONITORING]:            "MRD / Monitoring",
  [AI_HEALTH_DIAGNOSTICS_CATEGORIES.GENOMICS_TESTING]:          "Genomics Testing",
  [AI_HEALTH_DIAGNOSTICS_CATEGORIES.DIGITAL_PATHOLOGY]:         "Digital Pathology",
  [AI_HEALTH_DIAGNOSTICS_CATEGORIES.PHARMA_DATA_PLATFORM]:      "Pharma Data Platform",
  [AI_HEALTH_DIAGNOSTICS_CATEGORIES.DIAGNOSTIC_FORTRESS]:       "Diagnostics Fortress",
  [AI_HEALTH_DIAGNOSTICS_CATEGORIES.AI_INFRASTRUCTURE_ENABLER]: "AI Infrastructure Enabler",
  [AI_HEALTH_DIAGNOSTICS_CATEGORIES.LIFE_SCIENCE_TOOLS]:        "Life Science Tools",
});

// ---------------------------------------------------------------------
// Profile catalog
// ---------------------------------------------------------------------

const C = AI_HEALTH_DIAGNOSTICS_CATEGORIES;
const V = VOLATILITY_PROFILE;
const O = OPTION_PROFILE;
const T = TIER;

const RAW_PROFILES = [
  // Tier 1 — pure plays
  {
    symbol: "TEM", name: "Tempus AI",
    category: C.AI_OPERATING_SYSTEM, tier: T.TIER_1_PURE_PLAY,
    role: "AI-native bridge between diagnostics, multimodal data, physicians, pharma, and clinical decision support",
    thesis: "Potential operating system for precision medicine — both diagnostics and Data & Applications scaling",
    ownershipLayer: "Multimodal healthcare data + AI interpretation + pharma decision support",
    volatilityProfile: V.VERY_HIGH, optionProfile: O.PREMIUM_CANDIDATE,
    primaryRisk: "Speculative AI-health platform — narrative can unwind if adoption stalls",
    scannerTags: ["bridge", "ai_native", "multimodal_data", "pharma_partnerships"],
  },
  {
    symbol: "GH", name: "Guardant Health",
    category: C.LIQUID_BIOPSY, tier: T.TIER_1_PURE_PLAY,
    role: "Blood-based cancer testing and oncology diagnostics leader",
    thesis: "Own the liquid biopsy layer of oncology",
    ownershipLayer: "Liquid biopsy + colorectal screening + oncology testing workflow",
    volatilityProfile: V.HIGH, optionProfile: O.PREMIUM_CANDIDATE,
    primaryRisk: "Reimbursement and FDA approval timing on screening assays",
    scannerTags: ["liquid_biopsy", "oncology", "screening"],
  },
  {
    symbol: "NTRA", name: "Natera",
    category: C.MRD_MONITORING, tier: T.TIER_1_PURE_PLAY,
    role: "MRD monitoring and genetic testing scale player",
    thesis: "Cancer recurrence monitoring and genetic testing adoption at scale",
    ownershipLayer: "MRD monitoring + non-invasive prenatal + organ transplant testing",
    volatilityProfile: V.HIGH, optionProfile: O.SELECTIVE_PREMIUM_CANDIDATE,
    primaryRisk: "Volume-driven business — sensitive to reimbursement reset and competition",
    scannerTags: ["mrd", "monitoring", "scale"],
  },
  {
    symbol: "PSNL", name: "Personalis",
    category: C.GENOMICS_TESTING, tier: T.TIER_1_PURE_PLAY,
    role: "Cancer genomics and therapy response testing",
    thesis: "Smaller genomics optionality on therapy-response and immune profiling",
    ownershipLayer: "Tumor immune profiling + therapy response + biopharma services",
    volatilityProfile: V.VERY_HIGH, optionProfile: O.SELECTIVE_PREMIUM_CANDIDATE,
    primaryRisk: "Cash runway and customer concentration",
    scannerTags: ["genomics", "small_cap", "therapy_response"],
  },
  {
    symbol: "MYGN", name: "Myriad Genetics",
    category: C.GENOMICS_TESTING, tier: T.TIER_1_PURE_PLAY,
    role: "Hereditary genetics and oncology testing",
    thesis: "Legacy genetics platform attempting a turnaround toward broader oncology + mental health testing",
    ownershipLayer: "Hereditary cancer + mental health pharmacogenomics + prenatal testing",
    volatilityProfile: V.HIGH, optionProfile: O.SELECTIVE_PREMIUM_CANDIDATE,
    primaryRisk: "Execution risk on the turnaround; legacy reimbursement headwinds",
    scannerTags: ["hereditary", "turnaround", "oncology"],
  },
  {
    symbol: "DGX", name: "Quest Diagnostics",
    category: C.DIAGNOSTIC_FORTRESS, tier: T.TIER_1_PURE_PLAY,
    role: "Large diagnostic lab infrastructure",
    thesis: "Defensive diagnostics scale with steady volumes",
    ownershipLayer: "National lab footprint + employer testing + clinician workflow",
    volatilityProfile: V.LOW, optionProfile: O.LONG_HOLD_OR_ANCHOR,
    primaryRisk: "Reimbursement compression; slower-growth profile",
    scannerTags: ["defensive", "scale", "lab_infra"],
  },
  {
    symbol: "LH", name: "Labcorp",
    category: C.DIAGNOSTIC_FORTRESS, tier: T.TIER_1_PURE_PLAY,
    role: "Diagnostic scale plus clinical-trial services",
    thesis: "Defensive diagnostics with CRO-adjacent trial-services optionality",
    ownershipLayer: "Diagnostics + central lab + clinical-trial services",
    volatilityProfile: V.LOW, optionProfile: O.LONG_HOLD_OR_ANCHOR,
    primaryRisk: "Reimbursement compression; CRO cycle exposure",
    scannerTags: ["defensive", "trial_services", "scale"],
  },

  // Tier 2 — incumbent fortresses
  {
    symbol: "RHHBY", name: "Roche Holding ADR",
    category: C.DIAGNOSTIC_FORTRESS, tier: T.TIER_2_INCUMBENT_FORTRESS,
    role: "Global pharma + diagnostics incumbent with Foundation Medicine and PathAI exposure",
    thesis: "Institutional fortress validating AI diagnostics — Foundation Medicine + PathAI pathway",
    ownershipLayer: "Pharma + diagnostics + AI pathology partnership stack",
    volatilityProfile: V.LOW, optionProfile: O.LONG_HOLD_OR_ANCHOR,
    primaryRisk: "ADR liquidity; FX; large-cap pharma cycle",
    scannerTags: ["fortress", "pathology", "validator"],
  },
  {
    symbol: "ABT", name: "Abbott Laboratories",
    category: C.DIAGNOSTIC_FORTRESS, tier: T.TIER_2_INCUMBENT_FORTRESS,
    role: "Large diagnostics platform with Exact Sciences acquisition exposure",
    thesis: "Defensive diagnostics scale with optionality through M&A",
    ownershipLayer: "Diagnostics + medical devices + nutrition + Exact Sciences acquisition",
    volatilityProfile: V.LOW, optionProfile: O.LONG_HOLD_OR_ANCHOR,
    primaryRisk: "M&A integration risk; mature growth",
    scannerTags: ["fortress", "diagnostics_scale"],
  },
  {
    symbol: "TMO", name: "Thermo Fisher Scientific",
    category: C.LIFE_SCIENCE_TOOLS, tier: T.TIER_2_INCUMBENT_FORTRESS,
    role: "Life sciences tools and lab infrastructure provider",
    thesis: "Picks-and-shovels for diagnostics and research",
    ownershipLayer: "Lab equipment + reagents + bioproduction + clinical research services",
    volatilityProfile: V.MEDIUM, optionProfile: O.WATCHLIST,
    primaryRisk: "Bioproduction post-COVID destocking; cycle exposure",
    scannerTags: ["picks_shovels", "tools"],
  },
  {
    symbol: "DHR", name: "Danaher",
    category: C.LIFE_SCIENCE_TOOLS, tier: T.TIER_2_INCUMBENT_FORTRESS,
    role: "Diagnostics and life science platform",
    thesis: "Diversified life-science platform across diagnostics and bioprocessing",
    ownershipLayer: "Diagnostics + biotechnology + environmental & applied solutions",
    volatilityProfile: V.MEDIUM, optionProfile: O.WATCHLIST,
    primaryRisk: "Bioprocessing demand cycles; M&A integration",
    scannerTags: ["picks_shovels", "diversified"],
  },
  {
    symbol: "ILMN", name: "Illumina",
    category: C.GENOMICS_TESTING, tier: T.TIER_2_INCUMBENT_FORTRESS,
    role: "Sequencing infrastructure",
    thesis: "Sequencing backbone for genomics — adoption-driven",
    ownershipLayer: "Next-gen sequencing instruments + consumables + informatics",
    volatilityProfile: V.MEDIUM, optionProfile: O.WATCHLIST,
    primaryRisk: "Customer capex cycle; competitive pressure on sequencing",
    scannerTags: ["sequencing", "infra"],
  },
  {
    symbol: "A", name: "Agilent",
    category: C.LIFE_SCIENCE_TOOLS, tier: T.TIER_2_INCUMBENT_FORTRESS,
    role: "Lab analytics and testing infrastructure",
    thesis: "Analytical instruments for diagnostics and research",
    ownershipLayer: "Mass spectrometry + chromatography + diagnostics consumables",
    volatilityProfile: V.MEDIUM, optionProfile: O.WATCHLIST,
    primaryRisk: "Capex cycle exposure; competitive instrument pricing",
    scannerTags: ["analytics", "instruments"],
  },

  // Tier 3 — adjacency (covered by other baskets — kept here for context only)
  {
    symbol: "NVDA", name: "Nvidia",
    category: C.AI_INFRASTRUCTURE_ENABLER, tier: T.TIER_3_ADJACENCY,
    role: "Compute backbone for AI diagnostics and pharma AI factories",
    thesis: "Infrastructure layer powering healthcare AI — sector signal, not basket-primary trade",
    ownershipLayer: "GPUs + CUDA + healthcare reference architectures (Clara, BioNeMo)",
    volatilityProfile: V.HIGH, optionProfile: O.PREMIUM_CANDIDATE_EXPENSIVE,
    primaryRisk: "Already crowded AI trade; basket adjacency only",
    scannerTags: ["adjacency", "compute"],
  },
  {
    symbol: "MSFT", name: "Microsoft",
    category: C.AI_INFRASTRUCTURE_ENABLER, tier: T.TIER_3_ADJACENCY,
    role: "Healthcare cloud and Nuance AI adjacency",
    thesis: "Cloud + clinical documentation AI — adjacency only",
    ownershipLayer: "Azure for Health + Nuance + Dragon Ambient eXperience",
    volatilityProfile: V.MEDIUM, optionProfile: O.WATCHLIST_ADJACENCY,
    primaryRisk: "Mega-cap diversification dilutes pure AI-health exposure",
    scannerTags: ["adjacency", "cloud", "ambient_ai"],
  },
  {
    symbol: "GOOGL", name: "Alphabet (Google / DeepMind)",
    category: C.AI_INFRASTRUCTURE_ENABLER, tier: T.TIER_3_ADJACENCY,
    role: "AI health research and infrastructure",
    thesis: "DeepMind health research + Google Cloud — adjacency only",
    ownershipLayer: "DeepMind + Google Health + Cloud Healthcare API",
    volatilityProfile: V.MEDIUM, optionProfile: O.WATCHLIST_ADJACENCY,
    primaryRisk: "Mega-cap mix dilutes AI-health signal",
    scannerTags: ["adjacency", "research", "cloud"],
  },
  {
    symbol: "AMZN", name: "Amazon",
    category: C.AI_INFRASTRUCTURE_ENABLER, tier: T.TIER_3_ADJACENCY,
    role: "AWS health data infrastructure",
    thesis: "AWS health data layer + One Medical / pharmacy adjacencies — broad mix",
    ownershipLayer: "AWS HealthLake + One Medical + Amazon Pharmacy",
    volatilityProfile: V.MEDIUM, optionProfile: O.WATCHLIST_ADJACENCY,
    primaryRisk: "Mega-cap diversification; healthcare is small share of revenue",
    scannerTags: ["adjacency", "cloud", "pharmacy"],
  },
  {
    symbol: "PLTR", name: "Palantir",
    category: C.PHARMA_DATA_PLATFORM, tier: T.TIER_3_ADJACENCY,
    role: "Healthcare data platforms and government-health analytics",
    thesis: "Government / hospital data analytics — adjacency",
    ownershipLayer: "Foundry + AIP for hospital and pharma deployments",
    volatilityProfile: V.HIGH, optionProfile: O.WATCHLIST_ADJACENCY,
    primaryRisk: "Crowded AI trade; valuation sensitivity",
    scannerTags: ["adjacency", "data_platform"],
  },
  {
    symbol: "VEEV", name: "Veeva Systems",
    category: C.PHARMA_DATA_PLATFORM, tier: T.TIER_3_ADJACENCY,
    role: "Pharma software and data workflow",
    thesis: "Pharma CRM + clinical operations — adjacency",
    ownershipLayer: "Veeva CRM + Vault + clinical data platforms",
    volatilityProfile: V.MEDIUM, optionProfile: O.WATCHLIST_ADJACENCY,
    primaryRisk: "Salesforce CRM transition; pharma vertical concentration",
    scannerTags: ["adjacency", "pharma_software"],
  },
  {
    symbol: "IQV", name: "IQVIA",
    category: C.PHARMA_DATA_PLATFORM, tier: T.TIER_3_ADJACENCY,
    role: "Pharma real-world evidence and clinical-trial data",
    thesis: "CRO + real-world data — adjacency",
    ownershipLayer: "Clinical research services + real-world data + analytics",
    volatilityProfile: V.MEDIUM, optionProfile: O.WATCHLIST_ADJACENCY,
    primaryRisk: "CRO cycle; trial-services price competition",
    scannerTags: ["adjacency", "cro", "rwd"],
  },
];

const PROFILES_BY_SYMBOL = Object.freeze(
  Object.fromEntries(
    RAW_PROFILES.map((p) => [p.symbol, Object.freeze({ ...p, scannerTags: Object.freeze([...(p.scannerTags || [])]) })]),
  ),
);

export const AI_HEALTH_DIAGNOSTICS_SYMBOLS = Object.freeze(
  RAW_PROFILES.map((p) => p.symbol),
);

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Look up a symbol's AI Health profile. Returns null if the symbol is
 * not tracked by this basket so callers can fall back to the generic
 * basket panel without crashing.
 */
export function getAIHealthDiagnosticsProfile(rawSymbol) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym) return null;
  return PROFILES_BY_SYMBOL[sym] || null;
}

/** True iff the symbol has a profile in this basket. */
export function isAIHealthDiagnosticsSymbol(rawSymbol) {
  const sym = normalizeSymbol(rawSymbol);
  if (!sym) return false;
  return Boolean(PROFILES_BY_SYMBOL[sym]);
}

/** All profiles. Returned as a frozen array — caller should not mutate. */
export function listAIHealthDiagnosticsProfiles() {
  return RAW_PROFILES.slice();
}

/** Profiles for a specific tier (TIER_1_PURE_PLAY etc). */
export function listProfilesByTier(tier) {
  return RAW_PROFILES.filter((p) => p.tier === tier);
}

/** Profiles for a specific category (LIQUID_BIOPSY etc). */
export function listProfilesByCategory(category) {
  return RAW_PROFILES.filter((p) => p.category === category);
}

/** Operator-facing chip text for a category. */
export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || "AI Health";
}
