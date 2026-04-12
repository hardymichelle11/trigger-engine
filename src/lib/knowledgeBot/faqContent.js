// =====================================================
// FAQ CONTENT — static help docs (zero API cost)
// =====================================================
// Searchable FAQ, glossary, and feature docs.
// Always available, even in FAQ_ONLY mode.
// =====================================================

/**
 * FAQ entries. Each has a question, answer, tags for search, and category.
 */
export const FAQ_ENTRIES = [
  // --- Scoring ---
  {
    id: "score",
    category: "Scoring",
    q: "What does the score mean?",
    a: "The score (0-100) combines setup quality, timing, regime, and chart context. 75+ = GO (actionable), 55-74 = WATCH, below 55 = NO_TRADE. Chart context adjustments can shift the score up to +/-15 points from baseline.",
    tags: ["score", "signal", "go", "watch", "no_trade", "baseline", "enhanced"],
  },
  {
    id: "baseline-vs-enhanced",
    category: "Scoring",
    q: "What is the difference between baseline and enhanced score?",
    a: "Baseline score uses only fundamental setup data (IV, timing, regime). Enhanced score adds chart context adjustments (support/resistance zones, ATR extension, candle patterns). The delta between them shows how much chart structure influenced the signal.",
    tags: ["baseline", "enhanced", "delta", "chart context"],
  },
  {
    id: "atr-penalty",
    category: "Scoring",
    q: "What is the ATR penalty?",
    a: "When price is extended beyond 1 ATR from its mean, a -5 point penalty is applied. This prevents chasing overextended moves. The penalty fires on ~25-40% of scans and is the most impactful single chart adjustment.",
    tags: ["atr", "penalty", "overextended", "chart context"],
  },

  // --- Regime ---
  {
    id: "regime",
    category: "Regime",
    q: "What are the regime modes?",
    a: "The Credit-Vol Regime V2 classifies market conditions: RISK_ON (sell puts normally), VOLATILE_BUT_CONTAINED (reduce size), CREDIT_STRESS_WATCH (wait or go far OTM), HIGH_PREMIUM_ENVIRONMENT (sell into fear), LOW_EDGE (reduce activity). Each has a bias and explicit action label.",
    tags: ["regime", "risk_on", "credit_stress", "high_premium", "volatile", "low_edge"],
  },
  {
    id: "regime-score",
    category: "Regime",
    q: "What is the regime score?",
    a: "A 0-100 composite score from 6 tickers: HYG (35%), KRE (25%), VIX (10%), XLF (18%), QQQ (7%), TNX (5%). Higher = more stress. Below 25 = RISK_ON, 25-45 = VOLATILE_BUT_CONTAINED, 45-65 = CREDIT_STRESS_WATCH, 65+ = HIGH_PREMIUM_ENVIRONMENT.",
    tags: ["regime score", "composite", "hyg", "kre", "vix", "xlf", "qqq", "tnx", "weights"],
  },
  {
    id: "early-stress",
    category: "Regime",
    q: "What does earlyStress mean?",
    a: "earlyStress flags when credit indicators (HYG, KRE) are deteriorating but VIX hasn't spiked yet. It's an early warning — the market is showing cracks before volatility confirms. Position sizing should be reduced when this flag is active.",
    tags: ["early stress", "warning", "hyg", "kre", "vix"],
  },
  {
    id: "vix-state",
    category: "Regime",
    q: "What are the VIX states?",
    a: "calm: VIX < 20 (normal). watch: VIX 20-30 (elevated). panic: VIX 30-45 (fear). crisis: VIX > 45 (extreme). The state determines how aggressively to sell puts.",
    tags: ["vix", "calm", "watch", "panic", "crisis", "state"],
  },

  // --- Alerts ---
  {
    id: "alerts",
    category: "Alerts",
    q: "How do alerts work?",
    a: "Alerts fire when a card passes all gates: score >= 75, action is SELL_PUTS, probability above strike >= 70%, touch probability <= 50%, max drawdown <= 15%, and IV confidence is not 'none'. Alerts are deduped per symbol within a 2-hour window.",
    tags: ["alert", "gate", "score", "probability", "dedup"],
  },

  // --- Positions ---
  {
    id: "positions",
    category: "Positions",
    q: "How does position tracking work?",
    a: "The Position Manager tracks open puts with entry price, strike, DTE, and current P&L. Positions persist in localStorage and sync across devices via Cloudflare KV. The economics engine computes max profit, max loss, breakeven, and days to profit target.",
    tags: ["position", "track", "pnl", "sync", "cloudflare"],
  },

  // --- Calibration ---
  {
    id: "calibration",
    category: "Calibration",
    q: "What is the calibration system?",
    a: "The calibration tracker records every scan observation — baseline vs enhanced scores, chart adjustments, regime context, and whether alerts fired. Over time, it builds a dataset for quarterly review. Use 'npm run calibration:export' to extract data. The system never modifies scoring weights automatically.",
    tags: ["calibration", "tracker", "observation", "quarterly", "export"],
  },
  {
    id: "calibration-outcome",
    category: "Calibration",
    q: "How do I record trade outcomes?",
    a: "Use the CLI: 'npm run calibration:update -- --id <ID> --outcome HIT_T1 --justified YES --sessions 3'. Valid outcomes: HIT_T1, HIT_T2, IMPROVED, NEUTRAL, WORSE, FAILED, UNKNOWN. Justified: YES, NO, MIXED.",
    tags: ["calibration", "outcome", "update", "cli", "review"],
  },

  // --- Discovery ---
  {
    id: "discovery",
    category: "Discovery",
    q: "What is the discovery scanner?",
    a: "The discovery scanner evaluates the top-100 historical watchlist symbols not in your curated scan. It filters by spread quality (A+/A) and wheel suitability (High/Medium), then scores them through the same engine. Toggle it with the DISCOVERY button.",
    tags: ["discovery", "scanner", "watchlist", "top 100", "historical"],
  },

  // --- Dashboard ---
  {
    id: "refresh",
    category: "Dashboard",
    q: "How often does data refresh?",
    a: "The scanner fetches Polygon.io snapshots on each manual RESCAN click. The pipeline (run_refresh.bat) refreshes BigQuery data on a schedule via Windows Task Scheduler. WebSocket feeds provide real-time quote updates when connected.",
    tags: ["refresh", "rescan", "polygon", "websocket", "pipeline", "bigquery"],
  },
  {
    id: "data-sources",
    category: "Dashboard",
    q: "Where does the data come from?",
    a: "Market data: Polygon.io (snapshots + WebSocket). Historical bars: BigQuery (1-min and daily). IV rank: Polygon options + ATR estimate fallback. Regime: computed from HYG, KRE, VIX, XLF, QQQ, TNX snapshots.",
    tags: ["data", "polygon", "bigquery", "iv", "regime", "source"],
  },
];

/**
 * Glossary of terms used in the dashboard.
 */
export const GLOSSARY = [
  { term: "ATR", definition: "Average True Range — measures volatility over N bars." },
  { term: "BOS", definition: "Break of Structure — price breaks above a prior swing high (BOS_UP) or below a swing low (BOS_DOWN)." },
  { term: "DTE", definition: "Days to Expiration — trading days until option expires." },
  { term: "HYG", definition: "High Yield Corporate Bond ETF — credit stress indicator." },
  { term: "IV Rank", definition: "Implied Volatility percentile rank (0-100) relative to past year." },
  { term: "KRE", definition: "Regional Banking ETF — credit/financial stress indicator." },
  { term: "MSS", definition: "Market Structure Shift — stronger reversal signal than BOS." },
  { term: "OTM", definition: "Out of the Money — strike below current price for puts." },
  { term: "T1/T2/T3", definition: "Profit targets at increasing distances from entry." },
  { term: "TNX", definition: "10-Year Treasury Yield — rates stress indicator (rising = stress)." },
  { term: "VIX", definition: "CBOE Volatility Index — fear gauge." },
  { term: "XLF", definition: "Financial Select Sector SPDR — financials health indicator." },
];

/**
 * Search FAQ entries by query string.
 * Returns entries ranked by relevance (tag + question match).
 * @param {string} query
 * @returns {object[]}
 */
export function searchFaq(query) {
  if (!query || query.trim().length === 0) return [];
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  if (terms.length === 0) return [];

  const scored = FAQ_ENTRIES.map(entry => {
    let score = 0;
    const text = `${entry.q} ${entry.a} ${entry.tags.join(" ")}`.toLowerCase();
    for (const term of terms) {
      if (entry.tags.some(t => t.includes(term))) score += 3;
      if (entry.q.toLowerCase().includes(term)) score += 2;
      if (entry.a.toLowerCase().includes(term)) score += 1;
    }
    return { ...entry, relevance: score };
  });

  return scored.filter(e => e.relevance > 0).sort((a, b) => b.relevance - a.relevance);
}

/**
 * Search glossary by term.
 * @param {string} query
 * @returns {object[]}
 */
export function searchGlossary(query) {
  if (!query || query.trim().length === 0) return GLOSSARY;
  const q = query.toLowerCase();
  return GLOSSARY.filter(g =>
    g.term.toLowerCase().includes(q) || g.definition.toLowerCase().includes(q)
  );
}

/**
 * Get all FAQ categories.
 * @returns {string[]}
 */
export function getFaqCategories() {
  return [...new Set(FAQ_ENTRIES.map(e => e.category))];
}

/**
 * Get FAQ entries by category.
 * @param {string} category
 * @returns {object[]}
 */
export function getFaqByCategory(category) {
  return FAQ_ENTRIES.filter(e => e.category === category);
}
