// =====================================================================
// News Intelligence Layer (Phase 4.7.7)
// =====================================================================
// Turns raw Polygon news articles into decision-grade structured signal:
//
//   catalystType         (12-bucket classifier)
//   newsConfidence       (5-dimension confidence vector)
//   newsScoreAdjustment  (bounded -8..+8 modifier per article)
//
// Plus aggregation:
//   aggregateNewsAdjustment(articles)  → bounded total -8..+8
//   buildNewsThesis(ticker, articles)  → human-readable summary
//
// Hard rules:
//   - PURE functions. No fetch, no I/O.
//   - News must NEVER override the core engine score. The aggregate
//     adjustment is an additive modifier surfaced for downstream
//     consumers (LLM, RAG, the operator) — engines do not consume it.
//   - Placeholder rows are excluded from scoring at every layer.
//   - Investor-friendly outputs: type badges + confidence labels are
//     human-readable; raw weights stay internal to this module.
// =====================================================================

// ---------- catalystType classifier ----------------------------------

const CATALYST_TYPES = [
  "contract_win",
  "earnings",
  "guidance",
  "analyst_action",
  "sector_rotation",
  "macro",
  "legal_regulatory",
  "insider_institutional",
  "financing_balance_sheet",
  "product_ai_infrastructure",
  "risk_warning",
  "unknown",
];

// Keyword → catalyst rules. Order matters: more specific buckets first.
// Each rule scans the (title + description) lowercased text.
const CATALYST_RULES = [
  {
    type: "risk_warning",
    // Operational red flags only — fraud, halts, going-concern, audit issues.
    // Regulatory probes (SEC investigation / DOJ / subpoena) belong in
    // legal_regulatory below, not here.
    keywords: [
      "fraud", "going concern", "delisting", "delisted", "trading halt",
      "halted", "audit failure", "restated", "restatement", "ponzi",
    ],
  },
  {
    type: "financing_balance_sheet",
    keywords: [
      "secondary offering", "share offering", "stock offering", "dilution",
      "convertible note", "convertible debt", "registered direct",
      "atm offering", "at-the-market offering", "private placement",
      "raise capital", "raises capital", "raising capital",
      "going concern", "bankruptcy", "chapter 11", "covenant breach",
    ],
  },
  {
    type: "guidance",
    keywords: [
      "raises guidance", "raised guidance", "lifts guidance", "lifted guidance",
      "lowers guidance", "lowered guidance", "cuts guidance", "cut guidance",
      "withdraws guidance", "reaffirms guidance", "guidance",
      "raises outlook", "lowers outlook", "cuts outlook", "raises forecast",
      "lowers forecast", "cuts forecast",
    ],
  },
  {
    type: "earnings",
    keywords: [
      "earnings beat", "earnings miss", "beats earnings", "misses earnings",
      "eps beat", "eps miss", "revenue beat", "revenue miss",
      "quarterly results", "q1 results", "q2 results", "q3 results",
      "q4 results", "fourth-quarter", "third-quarter", "second-quarter",
      "first-quarter", "earnings report", "reports earnings",
      // Looser variants — "beats Q3 earnings", "missed earnings estimates",
      // "earnings estimate" all reach here without exploding the rule list.
      "earnings estimate", "beats q1", "beats q2", "beats q3", "beats q4",
      "misses q1", "misses q2", "misses q3", "misses q4",
      "topped earnings", "fell short of earnings",
    ],
  },
  {
    type: "analyst_action",
    keywords: [
      "upgrades", "upgraded", "downgrades", "downgraded",
      "price target", "raised price target", "cut price target",
      "initiated coverage", "reiterates", "maintains rating",
      "buy rating", "sell rating", "hold rating", "outperform", "underperform",
      "overweight", "underweight", "analyst",
    ],
  },
  {
    type: "legal_regulatory",
    keywords: [
      "lawsuit", "settlement", "fine", "penalty", "regulatory approval",
      "fda approval", "fda rejection", "ftc", "antitrust",
      "regulatory action", "consent decree", "court ruling", "ruling",
      "settled", "settles",
      // Regulatory investigations / probes — distinct from risk_warning,
      // which is reserved for operational red flags (fraud / halts).
      "sec investigation", "doj investigation", "subpoena", "probe",
      "regulatory probe",
    ],
  },
  {
    type: "insider_institutional",
    keywords: [
      "insider buying", "insider selling", "insider purchase",
      "13f", "13-f", "stake", "buys stake", "sells stake",
      "institutional", "berkshire", "buffett", "ackman", "burry",
      "hedge fund", "passive stake", "activist",
    ],
  },
  {
    type: "product_ai_infrastructure",
    keywords: [
      "ai cloud", "ai infrastructure", "ai compute", "ai contract",
      "data center contract", "gpu cluster", "gpu deployment",
      "nvidia partnership", "nvidia contract", "nvidia deal",
      "vertex ai", "google cloud contract", "azure contract",
      "hyperscaler", "h100", "h200", "blackwell", "ai factory",
    ],
  },
  {
    type: "contract_win",
    keywords: [
      "wins contract", "awarded contract", "signs deal", "signs agreement",
      "multi-year contract", "multi-billion contract", "multi-million contract",
      "contract worth", "deal worth", "agreement worth",
      "$1 billion", "$2 billion", "$3 billion", "$5 billion",
    ],
  },
  {
    type: "macro",
    keywords: [
      "fed decision", "rate cut", "rate hike", "interest rate",
      "inflation", "cpi", "ppi", "gdp", "unemployment", "jobs report",
      "fomc", "yield curve", "treasury yield",
    ],
  },
  {
    type: "sector_rotation",
    keywords: [
      "sector rotation", "sector rally", "sector selloff",
      "stocks rally", "stocks fall", "markets rally", "markets fall",
      "industry-wide", "broader market", "tech selloff", "tech rally",
    ],
  },
];

/**
 * Classify a single article into one of the 12 catalystType buckets.
 * Falls back to "unknown" when nothing matches.
 */
export function classifyCatalystType(article) {
  if (!article) return "unknown";
  const title = String(article.title || article.headline || "").toLowerCase();
  const description = String(
    article.description || article.why || article.sentiment_reasoning || "",
  ).toLowerCase();
  const keywords = (article.keywords || []).map((k) => String(k).toLowerCase());
  const text = `${title} ${description} ${keywords.join(" ")}`;

  for (const rule of CATALYST_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) return rule.type;
    }
  }
  return "unknown";
}

// ---------- newsConfidence vector ------------------------------------

const HIGH_QUALITY_SOURCES = new Set([
  "reuters", "bloomberg", "wall street journal", "wsj",
  "financial times", "ft", "cnbc", "barrons", "barron's",
  "the new york times", "investor's business daily", "ibd",
  "marketwatch", "the wall street journal",
]);

const MEDIUM_QUALITY_SOURCES = new Set([
  "seeking alpha", "benzinga", "investing.com", "yahoo finance",
  "the motley fool", "zacks", "thestreet", "investopedia",
  "morningstar", "barchart", "247 wall st.",
]);

function freshnessLabel(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "low";
  const HOUR = 3600 * 1000;
  if (ageMs <= 2 * HOUR) return "high";
  if (ageMs <= 24 * HOUR) return "medium";
  return "low";
}

function sourceQualityLabel(publisherName) {
  const name = String(publisherName || "").toLowerCase().trim();
  if (!name) return "low";
  if (HIGH_QUALITY_SOURCES.has(name)) return "high";
  if (MEDIUM_QUALITY_SOURCES.has(name)) return "medium";
  // Heuristic match for variants ("Reuters Business" → reuters)
  for (const src of HIGH_QUALITY_SOURCES) {
    if (name.includes(src)) return "high";
  }
  for (const src of MEDIUM_QUALITY_SOURCES) {
    if (name.includes(src)) return "medium";
  }
  return "low";
}

function tickerSpecificityLabel(article, contextTicker) {
  if (!contextTicker) return "weak";
  const t = contextTicker.toUpperCase();
  const title = String(article.title || article.headline || "").toUpperCase();
  const tickers = (article.tickers || []).map((x) => String(x).toUpperCase());
  const titleHasTicker =
    title.includes(t) || title.includes(`(${t})`) || title.includes(` ${t} `);
  if (tickers.includes(t) && titleHasTicker) return "direct";
  if (tickers.includes(t)) return "sector";
  return "weak";
}

function sentimentStrengthLabel(article) {
  const sentiment = article.sentiment || null;
  // No sentiment / neutral → weak. Polygon explicitly labelling positive
  // or negative is itself a meaningful signal, so anything pos/neg starts
  // at "moderate"; depth of reasoning is what promotes it to "strong".
  if (!sentiment || sentiment === "neutral") return "weak";
  const reasoning = String(
    article.sentiment_reasoning || article.why || "",
  ).trim();
  if (reasoning.length >= 100) return "strong";
  return "moderate";
}

function contradictionRiskLabel(article, catalystType) {
  // Articles in these buckets routinely have a surface-positive sentiment
  // ("company raises capital!") that masks a real-world negative — flag
  // them so downstream consumers don't trust the sentiment label alone.
  if (catalystType === "financing_balance_sheet") return "high";
  if (catalystType === "risk_warning") return "high";
  // Multiple insights with mismatched sentiments → medium contradiction.
  const insights = Array.isArray(article.insights) ? article.insights : [];
  if (insights.length > 1) {
    const sentiments = new Set(
      insights.map((i) => i?.sentiment).filter(Boolean),
    );
    if (sentiments.size > 1) return "medium";
  }
  return "low";
}

/**
 * Build the 5-dimension newsConfidence vector for an article.
 * @param {object} article — projected article (sentiment, source, etc.)
 * @param {string|null} contextTicker
 */
export function buildNewsConfidence(article, contextTicker = null) {
  if (!article) {
    return {
      freshness: "low",
      sourceQuality: "low",
      tickerSpecificity: "weak",
      sentimentStrength: "weak",
      contradictionRisk: "low",
    };
  }
  const publishedMs = article.publishedIso
    ? Date.parse(article.publishedIso)
    : null;
  const ageMs = Number.isFinite(publishedMs) ? Date.now() - publishedMs : null;
  const catalystType = article.catalystType || classifyCatalystType(article);
  return {
    freshness: freshnessLabel(ageMs),
    sourceQuality: sourceQualityLabel(article.publisherName ?? article.source),
    tickerSpecificity: tickerSpecificityLabel(article, contextTicker),
    sentimentStrength: sentimentStrengthLabel(article),
    contradictionRisk: contradictionRiskLabel(article, catalystType),
  };
}

// ---------- newsScoreAdjustment --------------------------------------

const SIGN_POSITIVE = "positive";
const SIGN_NEGATIVE = "negative";

const POSITIVE_BIAS_TYPES = new Set([
  "contract_win",
  "product_ai_infrastructure",
  "earnings",
  "guidance",
  "analyst_action",
]);

const NEGATIVE_HARD_TYPES = new Set([
  "financing_balance_sheet",
  "risk_warning",
  "legal_regulatory",
]);

const NEUTRAL_TYPES = new Set([
  "sector_rotation",
  "macro",
  "insider_institutional",
  "unknown",
]);

// High confidence requires that the article actually says something
// substantive (strong sentiment) AND ties to the ticker directly. A
// weak / vague reasoning blurb cannot be rated "high" no matter how
// fresh or how reputable the publisher is — that prevents shallow
// "decent win" copy on a recognized publisher from punching above its
// information weight.
function isHighConfidence(conf) {
  if (!conf) return false;
  if (conf.sentimentStrength !== "strong") return false;
  if (conf.tickerSpecificity !== "direct") return false;
  if (conf.sourceQuality === "low") return false;
  if (conf.freshness === "low") return false;
  return true;
}

function isModerateConfidence(conf) {
  if (!conf) return false;
  // At least direct or sector tie, AND non-weak sentiment, AND a
  // recognized source. Anything weaker rolls down to "low".
  if (conf.tickerSpecificity === "weak") return false;
  if (conf.sentimentStrength === "weak") return false;
  if (conf.sourceQuality === "low") return false;
  return true;
}

/**
 * Compute the bounded score adjustment for a single article.
 * Returns an integer in [-8, +8].
 *
 * Rules (per spec):
 *   strong direct positive catalyst:   +6
 *   moderate positive catalyst:        +3
 *   neutral / background:               0
 *   direct negative operational risk:  -4
 *   financing / dilution / fraud / legal / guidance cut: -7
 *
 * Hard cap at ±8.
 */
export function scoreNewsImpact(article) {
  if (!article || article.isPlaceholder) return 0;
  const catalystType = article.catalystType || classifyCatalystType(article);
  const sentiment = article.sentiment || null;
  const conf = article.newsConfidence ||
    buildNewsConfidence(article, article.contextTicker || null);

  // High-conviction negatives override sentiment polarity.
  if (catalystType === "financing_balance_sheet") return clamp(-7);
  if (catalystType === "risk_warning") return clamp(-7);
  if (catalystType === "legal_regulatory" && sentiment === SIGN_NEGATIVE) {
    return clamp(-4);
  }
  if (catalystType === "guidance" && sentiment === SIGN_NEGATIVE) {
    return clamp(-7);
  }

  // Positive bias buckets — magnitude scales with confidence.
  if (POSITIVE_BIAS_TYPES.has(catalystType) && sentiment === SIGN_POSITIVE) {
    if (isHighConfidence(conf)) return clamp(+6);
    if (isModerateConfidence(conf)) return clamp(+3);
    return clamp(+1);
  }

  // Negative direction in normally-positive buckets = operational risk.
  if (POSITIVE_BIAS_TYPES.has(catalystType) && sentiment === SIGN_NEGATIVE) {
    return clamp(-4);
  }

  // Neutral types: no impact, even if Polygon assigned a sentiment.
  if (NEUTRAL_TYPES.has(catalystType)) return 0;

  // Hard-negative bucket missed above (e.g. legal_regulatory + positive
  // sentiment from a settlement win): treat as small positive.
  if (NEGATIVE_HARD_TYPES.has(catalystType) && sentiment === SIGN_POSITIVE) {
    return clamp(+1);
  }

  return 0;
}

function clamp(n) {
  return Math.max(-8, Math.min(8, n));
}

// ---------- enrich a single article ----------------------------------

/**
 * Single-label summary of the 5-dimension confidence vector.
 * Investor-friendly: "high" / "moderate" / "low" (no raw weights surfaced).
 */
export function summarizeConfidence(newsConfidence) {
  if (!newsConfidence) return "low";
  if (isHighConfidence(newsConfidence)) return "high";
  if (isModerateConfidence(newsConfidence)) return "moderate";
  return "low";
}

const CATALYST_LABELS = {
  contract_win: "Contract win",
  earnings: "Earnings",
  guidance: "Guidance",
  analyst_action: "Analyst",
  sector_rotation: "Sector",
  macro: "Macro",
  legal_regulatory: "Legal / Reg",
  insider_institutional: "Insider",
  financing_balance_sheet: "Financing",
  product_ai_infrastructure: "AI infra",
  risk_warning: "Risk",
  unknown: "Background",
};

/**
 * Human-readable label for a catalyst type. Returns null for "unknown" so
 * panels can choose to omit the badge instead of rendering "Background".
 */
export function catalystLabel(catalystType) {
  if (!catalystType || catalystType === "unknown") return null;
  return CATALYST_LABELS[catalystType] || null;
}

/**
 * Add catalystType, newsConfidence, confidenceLabel, catalystLabel, and
 * newsScoreAdjustment to an article. Idempotent: re-enriching is safe.
 *
 * @param {object} article          projected article (newsFeed shape)
 * @param {string|null} contextTicker
 */
export function enrichArticle(article, contextTicker = null) {
  if (!article || article.isPlaceholder) {
    return {
      ...article,
      isPlaceholder: true,
      newsScoreAdjustment: 0,
      catalystType: "unknown",
      catalystLabel: null,
      confidenceLabel: "low",
    };
  }
  const catalystType = classifyCatalystType(article);
  const enrichedForConfidence = { ...article, catalystType };
  const newsConfidence = buildNewsConfidence(enrichedForConfidence, contextTicker);
  const enrichedForScore = {
    ...enrichedForConfidence,
    newsConfidence,
    contextTicker,
  };
  const newsScoreAdjustment = scoreNewsImpact(enrichedForScore);
  return {
    ...enrichedForScore,
    newsScoreAdjustment,
    catalystLabel: catalystLabel(catalystType),
    confidenceLabel: summarizeConfidence(newsConfidence),
  };
}

// ---------- aggregation ----------------------------------------------

/**
 * Sum per-article adjustments, drop placeholders, and clamp to ±8.
 */
export function aggregateNewsAdjustment(articles) {
  if (!Array.isArray(articles) || articles.length === 0) return 0;
  let total = 0;
  for (const a of articles) {
    if (!a || a.isPlaceholder) continue;
    const adj = Number.isFinite(a.newsScoreAdjustment)
      ? a.newsScoreAdjustment
      : scoreNewsImpact(a);
    total += adj;
  }
  return clamp(total);
}

// ---------- newsThesis builder ---------------------------------------

const TYPE_PHRASE = {
  contract_win: "a direct contract-win catalyst",
  earnings: "fresh earnings results",
  guidance: "company guidance changes",
  analyst_action: "analyst action",
  sector_rotation: "broad sector flow",
  macro: "macro context",
  legal_regulatory: "legal / regulatory developments",
  insider_institutional: "insider or institutional activity",
  financing_balance_sheet: "balance-sheet / financing risk (dilution-class)",
  product_ai_infrastructure: "AI-infrastructure demand signal",
  risk_warning: "an operational red flag",
  unknown: "background headlines",
};

function dominantCatalyst(realArticles) {
  if (realArticles.length === 0) return "unknown";
  const counts = new Map();
  for (const a of realArticles) {
    const t = a.catalystType || classifyCatalystType(a);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best = "unknown";
  let max = 0;
  for (const [t, n] of counts) {
    // Prefer hard-negative types to surface risk over positive noise.
    const weight = NEGATIVE_HARD_TYPES.has(t) ? n + 0.5 : n;
    if (weight > max) {
      max = weight;
      best = t;
    }
  }
  return best;
}

/**
 * Human-readable summary of why current news matters for the ticker.
 * Empty / placeholder-only inputs → an explicit "no live feed" string.
 *
 * @param {string|null} ticker
 * @param {Array<object>} articles  enriched articles (may include placeholders)
 */
export function buildNewsThesis(ticker, articles) {
  const sym = (ticker || "this ticker").toUpperCase();
  const list = Array.isArray(articles) ? articles : [];
  const real = list.filter((a) => a && !a.isPlaceholder);

  if (real.length === 0) {
    if (list.length === 0) {
      return {
        text: `No fresh news for ${sym} — existing thesis stands.`,
        tone: "neutral",
        reliable: false,
      };
    }
    return {
      text: `News feed unavailable — placeholder only. Do not use news context for scoring ${sym}.`,
      tone: "warn",
      reliable: false,
    };
  }

  const adj = aggregateNewsAdjustment(real);
  const dominant = dominantCatalyst(real);
  const phrase = TYPE_PHRASE[dominant] || TYPE_PHRASE.unknown;

  const positives = real.filter((a) => (a.newsScoreAdjustment ?? 0) > 0).length;
  const negatives = real.filter((a) => (a.newsScoreAdjustment ?? 0) < 0).length;

  let tone = "neutral";
  let lead;
  if (adj >= 4) {
    tone = "good";
    lead = `News confirms thesis on ${sym}: ${phrase}`;
  } else if (adj > 0) {
    tone = "mild_good";
    lead = `Modest tailwind on ${sym}: ${phrase}`;
  } else if (adj <= -4) {
    tone = "bad";
    lead = `News raises risk on ${sym}: ${phrase}`;
  } else if (adj < 0) {
    tone = "mild_bad";
    lead = `Soft drag on ${sym}: ${phrase}`;
  } else if (positives > 0 && negatives > 0) {
    tone = "mixed";
    lead = `Mixed news on ${sym}: ${positives} supportive vs ${negatives} concerning headline${
      positives + negatives === 1 ? "" : "s"
    }`;
  } else {
    tone = "neutral";
    lead = `Background news only on ${sym}: ${phrase}`;
  }

  // Always close with a non-override clause so the operator never reads
  // the thesis as a buy signal — entry depends on the engine, not news.
  const closer =
    adj <= -4
      ? "Treat as a hedge or skip signal until structure stabilizes."
      : "Entry still depends on premium quality and chart confirmation.";

  return {
    text: `${lead}. ${closer}`,
    tone,
    reliable: true,
    aggregateAdjustment: adj,
    counts: { positives, negatives, neutral: real.length - positives - negatives },
  };
}

// ---------- exports for tests ----------------------------------------

export const _internals = {
  CATALYST_TYPES,
  POSITIVE_BIAS_TYPES,
  NEGATIVE_HARD_TYPES,
  NEUTRAL_TYPES,
  HIGH_QUALITY_SOURCES,
  MEDIUM_QUALITY_SOURCES,
  freshnessLabel,
  sourceQualityLabel,
  tickerSpecificityLabel,
  sentimentStrengthLabel,
  contradictionRiskLabel,
  isHighConfidence,
  isModerateConfidence,
  dominantCatalyst,
  clamp,
};
