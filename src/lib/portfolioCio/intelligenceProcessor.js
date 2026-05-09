// =====================================================================
// Intelligence Processor
// =====================================================================
// PURE function. Takes raw operator-pasted text + an assigned basket
// and agent and returns a draft intelligence item the operator can
// review and approve.
//
// Hard rules:
//   - Deterministic. No random scoring. Same input always produces the
//     same draft.
//   - Trader-facing copy only — keyword spotting; no generative claims.
//   - Output is a draft until the operator approves it (lifecycle in
//     agentMemoryStore.js).
// =====================================================================

import { normalizeSymbol } from "./basketAgentTypes.js";
import {
  AI_HEALTH_DIAGNOSTICS_BASKET_ID,
  AI_HEALTH_DIAGNOSTICS_SYMBOLS,
  getAIHealthDiagnosticsProfile,
} from "./aiHealthDiagnosticsProfiles.js";
import {
  SOURCE_TYPE,
  CONFIDENCE,
  USE_AS,
  INTELLIGENCE_STATUS,
} from "./agentMemoryStore.js";

// ---------------------------------------------------------------------
// Lexicons
// ---------------------------------------------------------------------

// Companies that appear in the AI Health spec that aren't public US
// tickers — include them as "private companies" when the text
// mentions them. Private/foreign players are useful context for the
// competitor map but should not pollute the related-tickers list.
const PRIVATE_COMPANY_LEXICON = Object.freeze([
  "PathAI",
  "Foundation Medicine",
  "Caris",
  "Caris Life Sciences",
  "Flatiron Health",
  "Flatiron",
  "Roche",                    // public on Swiss / OTC ADR (RHHBY) — kept here too
  "DeepMind",
  "Nuance",
  "Veracyte",
]);

// Catalyst keyword lexicon. Each entry is a regex pattern + the
// trader-facing label that goes into the draft.
const CATALYST_PATTERNS = Object.freeze([
  { pattern: /\b(fda|fda approval|cleared by the fda)\b/i,                                   label: "FDA approval" },
  { pattern: /\b(medicare|reimbursement|coverage decision|cms coverage)\b/i,                 label: "Medicare / reimbursement decision" },
  { pattern: /\b(earnings|q[1-4]\s*\d{4}|quarterly results|earnings beat|earnings miss)\b/i, label: "Earnings catalyst" },
  { pattern: /\b(acquisition|acquired|to acquire|acquiring|m&a|merger)\b/i,                  label: "M&A activity" },
  { pattern: /\b(partnerships?|strategic partner|collaboration deal)\b/i,                    label: "Partnership" },
  { pattern: /\b(pharma partnerships?|biopharma partnerships?)\b/i,                          label: "Pharma partnership" },
  { pattern: /\b(hospital (?:adoption|expansion|deployment)|health system rollout)\b/i,      label: "Hospital adoption / expansion" },
  { pattern: /\b(diagnostics revenue|diagnostics growth)\b/i,                                label: "Diagnostics revenue growth" },
  { pattern: /\b(data applications growth|data & applications|data and applications)\b/i,    label: "Data & Applications growth" },
  { pattern: /\b(ark accumulation|ark fund|cathie wood)\b/i,                                 label: "ARK accumulation" },
  { pattern: /\b(ai pathology|digital pathology)\b/i,                                        label: "AI pathology validation" },
  { pattern: /\b(infrastructure expansion|ai factory|gpu deployment)\b/i,                    label: "AI infrastructure expansion" },
  { pattern: /\b(clinical trial|trial readout|data readout)\b/i,                             label: "Clinical / trial readout" },
  { pattern: /\b(insider buying|insider purchases)\b/i,                                      label: "Insider accumulation" },
]);

// Risk keyword lexicon.
const RISK_PATTERNS = Object.freeze([
  { pattern: /\bexecution risk\b/i,                                                  label: "Execution risk" },
  { pattern: /\b(reimbursement (?:risk|pressure|headwind))\b/i,                      label: "Reimbursement pressure" },
  { pattern: /\b(competition|incumbent pressure|incumbent fortress)\b/i,             label: "Incumbent pressure / competition" },
  { pattern: /\b(valuation (?:risk|pressure|stretched)|crowded innovation)\b/i,      label: "Valuation / crowded-trade risk" },
  { pattern: /\b(regulatory (?:risk|pushback)|fda pushback|approval risk)\b/i,       label: "Regulatory pushback" },
  { pattern: /\b(cash burn|runway|liquidity)\b/i,                                    label: "Cash / runway risk" },
  { pattern: /\b(volatility|high.beta|elevated iv|iv spike)\b/i,                     label: "Elevated volatility" },
  { pattern: /\b(reimbursement pathway|reimbursement risk)\b/i,                      label: "Reimbursement pathway uncertainty" },
  { pattern: /\b(trial failure|missed (?:endpoint|data))\b/i,                        label: "Trial failure / missed endpoint" },
  { pattern: /\b(supply chain|chip shortage|logistics)\b/i,                          label: "Supply chain pressure" },
]);

// Scanner-tag suggestions — ties the document to the AI Health
// scanner tag vocabulary.
const TAG_PATTERNS = Object.freeze([
  { pattern: /\b(ai[\s.\-]?health(?:care)?|precision medicine|ai.driven (?:diagnostics|health))\b/i, tag: "ai_health" },
  { pattern: /\b(genomic|genomics)\b/i,                                tag: "genomics" },
  { pattern: /\b(diagnostic|diagnostics)\b/i,                          tag: "diagnostics" },
  { pattern: /\b(liquid biopsy)\b/i,                                   tag: "liquid_biopsy" },
  { pattern: /\b(mrd|minimal residual disease)\b/i,                    tag: "mrd" },
  { pattern: /\b(pharma|biopharma)\b/i,                                tag: "pharma" },
  { pattern: /\b(clinical (?:ai|workflow))\b/i,                        tag: "clinical_ai" },
  { pattern: /\b(high.beta|high beta)\b/i,                             tag: "high_beta" },
  { pattern: /\b(real.world (?:evidence|data))\b/i,                    tag: "real_world_evidence" },
  { pattern: /\b(data platform|data application)\b/i,                  tag: "data_platform" },
]);

const TICKER_REGEX = /\$?([A-Z][A-Z0-9.\-]{0,9})\b/g;
// Common English words that look like tickers — exclude to avoid
// noise. Lower-cased for the lookup; uppercase tokens are checked
// against this lookup in case-insensitive form.
const TICKER_NOISE_WORDS = new Set([
  "AI", "CEO", "CTO", "CFO", "ETF", "USD", "USA", "IPO", "Q1", "Q2", "Q3", "Q4",
  "ARK", "EOD", "EPS", "FDA", "CMS", "CRO", "GPU", "OTC", "CV", "TE", "MI",
  "M&A", "ROE", "ROIC", "VC", "OS", "IT", "OT", "HR", "OK", "ML", "IV", "API",
  "RFP", "RFI", "PE", "PS", "PEG", "EBITDA", "FY", "YTD", "YOY", "QOQ", "PR",
  "NA", "AM", "PM", "ET", "PT",
]);

// ---------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------

/**
 * @param {object} input
 * @param {string} input.rawText
 * @param {string} [input.basketId]
 * @param {string} [input.assignedAgent]
 * @param {string} [input.confidence]
 * @param {string[]} [input.useAs]
 * @param {string} [input.title]
 * @param {string} [input.sourceType]
 * @returns {object|null} draft intelligence item shape (no id, no
 *                        createdAt yet — agentMemoryStore.saveIntelligenceDraft
 *                        adds those when persisting). Returns null on bad input.
 */
export function processRawIntelligence(input = {}) {
  if (!input || typeof input.rawText !== "string" || !input.rawText.trim()) return null;

  const rawText = input.rawText;
  const basketId = typeof input.basketId === "string" ? input.basketId : null;
  const assignedAgent = typeof input.assignedAgent === "string" ? input.assignedAgent : null;
  const confidence = typeof input.confidence === "string" ? input.confidence : CONFIDENCE.USER_THESIS;
  const useAs = sanitizeUseAs(input.useAs);
  const sourceType = typeof input.sourceType === "string" ? input.sourceType : SOURCE_TYPE.USER_NOTES;

  // --- entities --------------------------------------------------
  const tickers = extractTickers(rawText);
  const privateCompanies = extractPrivateCompanies(rawText);

  // Pick a primary symbol. Prefer the most-mentioned ticker that's
  // also part of the assigned basket's catalog. Tie-break by first-
  // mention position so the symbol the operator mentions first wins —
  // alphabetic tiebreak felt arbitrary and surfaced the wrong primary
  // when several basket symbols appeared once.
  const basketCatalog = basketCatalogFor(basketId);
  const tickerCounts = countTickerMentions(rawText, tickers);
  const tickerPositions = firstMentionPositions(rawText, tickers);
  const primarySymbols = pickPrimarySymbols(tickerCounts, tickerPositions, basketCatalog);
  const relatedSymbols = tickers.filter((t) => !primarySymbols.includes(t));

  // --- thesis ----------------------------------------------------
  const thesis = composeThesis({ rawText, primarySymbols, basketId });

  // --- catalysts / risks / tags ---------------------------------
  const catalysts = extractByLexicon(rawText, CATALYST_PATTERNS);
  const risks     = extractByLexicon(rawText, RISK_PATTERNS);
  const scannerTags = extractTags(rawText);

  // --- title -----------------------------------------------------
  const title = composeTitle({
    explicitTitle: input.title,
    primarySymbols,
    basketId,
  });

  return {
    sourceType,
    title,
    basketId,
    assignedAgent,
    confidence,
    status: INTELLIGENCE_STATUS.DRAFT,
    useAs,
    rawTextExcerpt: rawText.slice(0, 600),
    entities: {
      primarySymbols,
      relatedSymbols,
      privateCompanies,
    },
    thesis,
    risks,
    catalysts,
    scannerTags,
    approvedByUser: false,
    expiresAt: null,
  };
}

// ---------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------

function extractTickers(rawText) {
  const out = [];
  const seen = new Set();
  let match;
  TICKER_REGEX.lastIndex = 0;
  while ((match = TICKER_REGEX.exec(rawText)) !== null) {
    const candidate = match[1];
    if (!candidate) continue;
    if (TICKER_NOISE_WORDS.has(candidate.toUpperCase())) continue;
    const sym = normalizeSymbol(candidate);
    if (!sym) continue;
    // Skip if it's a single letter that's clearly an article ("A").
    // Symbol "A" (Agilent) is real, so we only skip if there's no
    // surrounding $ marker AND the catalog confirmation can't promote
    // it. Strategy: only accept 1-letter tickers when they appear as
    // $A or are mentioned at least twice — Agilent's symbol is "A"
    // and our test fixture should mention it explicitly.
    if (sym.length === 1) {
      const dollarHit = new RegExp(`\\$${sym}\\b`).test(rawText);
      const mentionCount = countOccurrences(rawText, new RegExp(`\\b${sym}\\b`, "g"));
      if (!dollarHit && mentionCount < 2) continue;
    }
    if (seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
  }
  return out;
}

function extractPrivateCompanies(rawText) {
  const out = [];
  const seen = new Set();
  for (const name of PRIVATE_COMPANY_LEXICON) {
    const re = new RegExp(`\\b${escapeRegex(name)}\\b`, "i");
    if (re.test(rawText)) {
      const canonical = canonicalizePrivateName(name);
      if (!seen.has(canonical)) {
        seen.add(canonical);
        out.push(canonical);
      }
    }
  }
  return out;
}

function canonicalizePrivateName(name) {
  // Collapse known aliases.
  if (name === "Caris Life Sciences") return "Caris";
  if (name === "Flatiron Health")     return "Flatiron";
  return name;
}

function countTickerMentions(rawText, tickers) {
  const counts = new Map();
  for (const t of tickers) {
    const re = new RegExp(`(?:\\$${t}|\\b${t}\\b)`, "g");
    counts.set(t, countOccurrences(rawText, re));
  }
  return counts;
}

function firstMentionPositions(rawText, tickers) {
  const positions = new Map();
  for (const t of tickers) {
    const re = new RegExp(`(?:\\$${t}|\\b${t}\\b)`);
    const m = re.exec(rawText);
    positions.set(t, m ? m.index : Number.MAX_SAFE_INTEGER);
  }
  return positions;
}

function countOccurrences(text, regex) {
  const m = text.match(regex);
  return m ? m.length : 0;
}

function pickPrimarySymbols(tickerCounts, tickerPositions, basketCatalog) {
  // Sort tickers by mention count desc, then by first-mention position
  // (earlier in the text wins). Catalog-member tickers are preferred
  // when present.
  const sortFn = (a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const ap = tickerPositions.get(a[0]) ?? Number.MAX_SAFE_INTEGER;
    const bp = tickerPositions.get(b[0]) ?? Number.MAX_SAFE_INTEGER;
    if (ap !== bp) return ap - bp;
    return a[0].localeCompare(b[0]);
  };
  const arr = Array.from(tickerCounts.entries()).sort(sortFn);
  if (arr.length === 0) return [];

  const inBasket = arr.filter(([sym]) => basketCatalog.has(sym));
  if (inBasket.length > 0) {
    return [inBasket[0][0]];
  }
  return [arr[0][0]];
}

function basketCatalogFor(basketId) {
  if (basketId === AI_HEALTH_DIAGNOSTICS_BASKET_ID) {
    return new Set(AI_HEALTH_DIAGNOSTICS_SYMBOLS);
  }
  return new Set();
}

function extractByLexicon(rawText, patterns) {
  const out = [];
  const seen = new Set();
  for (const { pattern, label } of patterns) {
    if (pattern.test(rawText)) {
      if (!seen.has(label)) {
        seen.add(label);
        out.push(label);
      }
    }
  }
  return out;
}

function extractTags(rawText) {
  const out = [];
  const seen = new Set();
  for (const { pattern, tag } of TAG_PATTERNS) {
    if (pattern.test(rawText)) {
      if (!seen.has(tag)) {
        seen.add(tag);
        out.push(tag);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Thesis / title composition
// ---------------------------------------------------------------------

function composeThesis({ rawText, primarySymbols, basketId }) {
  const primary = primarySymbols[0] || null;
  const profile = primary ? getAIHealthDiagnosticsProfile(primary) : null;

  // Try to lift the first sentence that mentions the primary symbol —
  // gives the operator-authored claim a chance to surface verbatim.
  const coreClaim = liftLeadingSentence(rawText, primary);

  return {
    coreClaim: coreClaim || (profile ? profile.thesis : null),
    marketFrame: deriveMarketFrame(rawText),
    companyRole: profile ? profile.role : null,
    basketRole: profile && basketId === AI_HEALTH_DIAGNOSTICS_BASKET_ID
      ? aiHealthBasketRoleFor(profile)
      : null,
  };
}

function aiHealthBasketRoleFor(profile) {
  switch (profile.category) {
    case "ai_operating_system":       return "AI Health Bridge";
    case "liquid_biopsy":             return "Liquid Biopsy Leader";
    case "mrd_monitoring":            return "MRD Monitoring";
    case "genomics_testing":          return "Genomics Testing";
    case "digital_pathology":         return "Digital Pathology";
    case "pharma_data_platform":      return "Pharma Data Platform";
    case "diagnostic_fortress":       return "Diagnostics Fortress";
    case "ai_infrastructure_enabler": return "AI Infrastructure Enabler";
    case "life_science_tools":        return "Life Science Tools";
    default:                          return "AI Health";
  }
}

function liftLeadingSentence(rawText, primary) {
  if (!primary) return null;
  const sentences = rawText.split(/(?<=[.!?])\s+/).slice(0, 12);
  for (const s of sentences) {
    if (!s) continue;
    if (new RegExp(`\\b${primary}\\b`).test(s) || new RegExp(`\\$${primary}\\b`).test(s)) {
      return s.trim().slice(0, 280);
    }
  }
  return null;
}

function deriveMarketFrame(rawText) {
  if (/\bai (?:utilization|adoption phase)/i.test(rawText)) return "AI utilization phase";
  if (/\bai infrastructure (?:phase|buildout)/i.test(rawText)) return "AI infrastructure phase";
  if (/\bbridge (?:between|company|layer)/i.test(rawText)) return "AI bridge layer";
  if (/\bprecision medicine\b/i.test(rawText)) return "Precision medicine";
  return null;
}

function composeTitle({ explicitTitle, primarySymbols, basketId }) {
  if (typeof explicitTitle === "string" && explicitTitle.trim()) {
    return explicitTitle.trim().slice(0, 200);
  }
  const primary = primarySymbols[0] || null;
  if (primary) {
    return `${primary} intelligence`;
  }
  if (basketId) {
    return `${basketId} intelligence note`;
  }
  return "Untitled intelligence";
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function sanitizeUseAs(input) {
  if (!Array.isArray(input)) return [];
  const valid = new Set(Object.values(USE_AS));
  const out = [];
  for (const v of input) {
    if (typeof v === "string" && valid.has(v)) out.push(v);
  }
  return Array.from(new Set(out));
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
