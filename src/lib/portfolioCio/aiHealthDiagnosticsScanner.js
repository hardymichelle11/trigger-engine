// =====================================================================
// AI Health / Diagnostics — sector ranking helper
// =====================================================================
// PURE function. Takes a slate of candidate symbols + the manager-
// assessment / history / leadership context and returns operator-safe
// ranked lists for the specialty panel:
//   - Best Premium Candidate
//   - Best Long-Term Accumulation Candidate
//   - Best Sector Confirmation Signal
//
// The scanner does NOT trade. The output carries operator-safe labels
// (Strong Watch / Premium Candidate / Accumulation Candidate /
//  Defensive Anchor / Avoid). Raw weights and per-signal numerics stay
// inside this file — they NEVER reach the rendered UI.
// =====================================================================

import { STANCE } from "./managerAssessmentTypes.js";
import { LEADERSHIP_STATUS } from "./basketAgentTypes.js";
import {
  AI_HEALTH_DIAGNOSTICS_CATEGORIES as CAT,
  TIER,
  OPTION_PROFILE,
  getAIHealthDiagnosticsProfile,
  isAIHealthDiagnosticsSymbol,
} from "./aiHealthDiagnosticsProfiles.js";

// Operator-safe verdict labels. These are the ONLY labels surfaced
// to the UI.
export const VERDICT = Object.freeze({
  STRONG_WATCH:           "strong_watch",
  PREMIUM_CANDIDATE:      "premium_candidate",
  ACCUMULATION_CANDIDATE: "accumulation_candidate",
  DEFENSIVE_ANCHOR:       "defensive_anchor",
  AVOID_OR_WAIT:          "avoid_or_wait",
});

export const VERDICT_LABELS = Object.freeze({
  [VERDICT.STRONG_WATCH]:           "Strong Watch",
  [VERDICT.PREMIUM_CANDIDATE]:      "Premium Candidate",
  [VERDICT.ACCUMULATION_CANDIDATE]: "Accumulation Candidate",
  [VERDICT.DEFENSIVE_ANCHOR]:       "Defensive Anchor",
  [VERDICT.AVOID_OR_WAIT]:          "Avoid / Wait",
});

// ---------------------------------------------------------------------
// Public entry — single candidate
// ---------------------------------------------------------------------

/**
 * @param {object} input
 * @param {string} input.symbol
 * @param {object} [input.managerAssessment]   { trigger_engine, credit_view, market_intel, risk_manager }
 * @param {object} [input.history]             { outcome: { status } }
 * @param {object} [input.leadershipClass]     { status, read } from the leadership engine
 * @returns {object|null} operator-safe candidate read, or null when symbol is not in the basket
 */
export function evaluateAIHealthDiagnosticsCandidate(input = {}) {
  const profile = getAIHealthDiagnosticsProfile(input.symbol);
  if (!profile) return null;

  const ma = input.managerAssessment || {};
  const hist = input.history || null;
  const cls = input.leadershipClass || null;

  const teStance = ma?.trigger_engine?.stance;
  const cvStance = ma?.credit_view?.stance;
  const miStance = ma?.market_intel?.stance;
  const riskStance = ma?.risk_manager?.stance;

  const isC   = (s) => s === STANCE.BULLISH || s === STANCE.CONSTRUCTIVE;
  const isCau = (s) => s === STANCE.CAUTIOUS || s === STANCE.BEARISH;
  const isUna = (s) => !s || s === STANCE.UNAVAILABLE;

  const constructiveCount = [teStance, cvStance, miStance].filter(isC).length;
  const cautiousCount     = [teStance, cvStance, miStance].filter(isCau).length;
  const allUnavailable    = isUna(teStance) && isUna(cvStance) && isUna(miStance);

  const histStatus = typeof hist?.outcome?.status === "string" ? hist.outcome.status : null;

  // Internal ranking score — never surfaces to UI. Used only for
  // sortinng / selecting the top candidate per output bucket.
  let rank = 0;
  rank += constructiveCount * 10;
  rank -= cautiousCount * 6;
  if (cls?.status === LEADERSHIP_STATUS.LEADER)          rank += 8;
  if (cls?.status === LEADERSHIP_STATUS.EMERGING_LEADER) rank += 6;
  if (cls?.status === LEADERSHIP_STATUS.FADING_LEADER)   rank -= 8;
  if (cls?.status === LEADERSHIP_STATUS.OVEREXTENDED)    rank -= 6;
  if (histStatus === "missed_winner") rank += 4;
  if (histStatus === "profitable")    rank += 3;
  if (histStatus === "invalidated" || histStatus === "avoided_correctly") rank -= 1;
  if (isCau(riskStance)) rank -= 3;

  // Verdict — operator-safe label. Default by tier so the basket shows
  // a coherent posture even when manager evidence is missing.
  let verdict = defaultVerdictForTier(profile.tier, profile.optionProfile);
  let posture =
    "Default posture from basket profile — manager evidence not yet available.";

  if (cautiousCount >= 2 || cls?.status === LEADERSHIP_STATUS.FADING_LEADER) {
    verdict = VERDICT.AVOID_OR_WAIT;
    posture = "Manager reads suggest caution — defer trade activity until reads improve.";
  } else if (constructiveCount >= 2 && cls?.status === LEADERSHIP_STATUS.LEADER) {
    verdict = profile.tier === TIER.TIER_1_PURE_PLAY
      ? VERDICT.PREMIUM_CANDIDATE
      : VERDICT.DEFENSIVE_ANCHOR;
    posture = "Leadership confirmed across managers — basket-eligible posture.";
  } else if (constructiveCount >= 2 && cls?.status === LEADERSHIP_STATUS.EMERGING_LEADER) {
    verdict = VERDICT.STRONG_WATCH;
    posture = "Leadership improving — watch for confirmation before sizing.";
  } else if (constructiveCount >= 1 && profile.tier === TIER.TIER_2_INCUMBENT_FORTRESS) {
    verdict = VERDICT.DEFENSIVE_ANCHOR;
    posture = "Fortress with at least one constructive manager read — sector anchor.";
  } else if (allUnavailable) {
    verdict = profile.tier === TIER.TIER_1_PURE_PLAY
      ? VERDICT.STRONG_WATCH
      : VERDICT.DEFENSIVE_ANCHOR;
    posture =
      "No manager evidence yet — keep on the basket and run an Ad Hoc Simulation.";
  }

  // News alignment — the spec asked for a categorical so news never
  // overrides the engine. Only used to decorate copy.
  const newsAlignment = decideNewsAlignment(input.newsAlignment);

  return {
    symbol: profile.symbol,
    name: profile.name,
    category: profile.category,
    tier: profile.tier,
    role: profile.role,
    thesis: profile.thesis,
    ownershipLayer: profile.ownershipLayer,
    primaryRisk: profile.primaryRisk,
    optionProfile: profile.optionProfile,
    verdict,
    verdictLabel: VERDICT_LABELS[verdict] || "Strong Watch",
    posture,
    newsAlignment,
    leadershipStatus: cls?.status || LEADERSHIP_STATUS.UNCLASSIFIED,
    leadershipRead:   cls?.read || null,
    constructiveManagerCount: constructiveCount,
    cautiousManagerCount:     cautiousCount,
    historyStatus: histStatus,
    // Internal — kept on the object for sort but stripped before any UI
    // surface that touches scores. The dashboard / panel must NEVER pass
    // this through to JSX.
    _rank: rank,
  };
}

// ---------------------------------------------------------------------
// Public entry — slate ranking
// ---------------------------------------------------------------------

/**
 * Rank candidates and return three operator-facing top picks plus the
 * full evaluated slate (with `_rank` stripped on the slate copy).
 *
 * @param {Array<{symbol: string}>} candidates    iterable of symbols (or {symbol})
 * @param {object} [context]
 * @param {Record<string, object>} [context.managerAssessmentsBySymbol]
 * @param {Record<string, object>} [context.historyBySymbol]
 * @param {Map<string, object>|Record<string, object>} [context.leadershipClassBySymbol]
 * @param {Record<string, string>} [context.newsAlignmentBySymbol]
 * @returns {object} { evaluated, bestPremium, bestAccumulation, bestSectorConfirmation }
 */
export function rankAIHealthDiagnosticsBasket(candidates = [], context = {}) {
  const ma = context.managerAssessmentsBySymbol || {};
  const history = context.historyBySymbol || {};
  const news = context.newsAlignmentBySymbol || {};
  const lookupClass = makeLeadershipLookup(context.leadershipClassBySymbol);

  const evaluated = [];
  for (const c of candidates) {
    const sym = typeof c === "string" ? c : (c && c.symbol);
    if (!sym || !isAIHealthDiagnosticsSymbol(sym)) continue;
    const result = evaluateAIHealthDiagnosticsCandidate({
      symbol: sym,
      managerAssessment: ma[sym],
      history: history[sym],
      leadershipClass: lookupClass(sym),
      newsAlignment: news[sym],
    });
    if (result) evaluated.push(result);
  }

  evaluated.sort((a, b) => {
    if (b._rank !== a._rank) return b._rank - a._rank;
    return a.symbol.localeCompare(b.symbol);
  });

  const bestPremium               = pickBestPremium(evaluated);
  const bestAccumulation          = pickBestAccumulation(evaluated);
  const bestSectorConfirmation    = pickBestSectorConfirmation(evaluated);

  // Strip _rank on the externally-returned slate. Keep top picks
  // re-stripped as well for safety.
  const safeSlate = evaluated.map(stripRank);

  return {
    evaluated: safeSlate,
    bestPremium:            bestPremium ? stripRank(bestPremium) : null,
    bestAccumulation:       bestAccumulation ? stripRank(bestAccumulation) : null,
    bestSectorConfirmation: bestSectorConfirmation ? stripRank(bestSectorConfirmation) : null,
  };
}

// ---------------------------------------------------------------------
// Bucket pickers
// ---------------------------------------------------------------------

function pickBestPremium(evaluated) {
  // Premium candidates: Tier 1 pure plays with a premium-friendly
  // option profile and a non-avoid verdict.
  const pool = evaluated.filter(
    (e) =>
      e.tier === TIER.TIER_1_PURE_PLAY &&
      (e.optionProfile === OPTION_PROFILE.PREMIUM_CANDIDATE ||
       e.optionProfile === OPTION_PROFILE.SELECTIVE_PREMIUM_CANDIDATE) &&
      e.verdict !== VERDICT.AVOID_OR_WAIT,
  );
  return pool[0] || null;
}

function pickBestAccumulation(evaluated) {
  // Accumulation: Tier 2 fortresses (long-hold anchors) with at least
  // one constructive read; fall back to highest-ranked anchor.
  const pool = evaluated.filter(
    (e) =>
      e.tier === TIER.TIER_2_INCUMBENT_FORTRESS &&
      e.verdict !== VERDICT.AVOID_OR_WAIT,
  );
  // Prefer ones with at least one constructive manager read.
  const constructive = pool.filter((e) => e.constructiveManagerCount >= 1);
  return (constructive[0] || pool[0] || null);
}

function pickBestSectorConfirmation(evaluated) {
  // Sector confirmation: Tier 3 adjacency with the strongest read,
  // fallback to any leader / emerging name across tiers.
  const adjacency = evaluated.filter(
    (e) => e.tier === TIER.TIER_3_ADJACENCY && e.constructiveManagerCount >= 1,
  );
  if (adjacency.length > 0) return adjacency[0];
  const leaders = evaluated.filter(
    (e) => e.leadershipStatus === LEADERSHIP_STATUS.LEADER ||
           e.leadershipStatus === LEADERSHIP_STATUS.EMERGING_LEADER,
  );
  return leaders[0] || null;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function defaultVerdictForTier(tier, optionProfile) {
  if (tier === TIER.TIER_2_INCUMBENT_FORTRESS) return VERDICT.DEFENSIVE_ANCHOR;
  if (tier === TIER.TIER_3_ADJACENCY)          return VERDICT.STRONG_WATCH;
  if (optionProfile === OPTION_PROFILE.PREMIUM_CANDIDATE ||
      optionProfile === OPTION_PROFILE.SELECTIVE_PREMIUM_CANDIDATE) {
    return VERDICT.STRONG_WATCH;
  }
  return VERDICT.STRONG_WATCH;
}

function decideNewsAlignment(raw) {
  const valid = new Set([
    "supports_thesis", "conflicts_with_thesis", "mixed", "neutral", "unavailable",
  ]);
  if (typeof raw === "string" && valid.has(raw)) return raw;
  return "unavailable";
}

function makeLeadershipLookup(input) {
  if (!input) return () => null;
  if (input instanceof Map) return (s) => input.get(s) || null;
  return (s) => input[s] || null;
}

function stripRank(e) {
  if (!e) return null;
  const { _rank, ...rest } = e;
  return rest;
}
