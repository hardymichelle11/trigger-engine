// =====================================================================
// News Feed Adapter — Polygon / Lethal Board / Manual injection
// =====================================================================
// Three concrete provider implementations matching the registry shape.
// Each is tolerant of failure and returns [] on any error.
// =====================================================================

import { buildPolygonUrl } from "../polygonProxy.js";
import { normalizeArticleShape } from "./newsIntelligenceTypes.js";

// ---------------------------------------------------------------------
// 1. Polygon news provider — /v2/reference/news?ticker=...
// ---------------------------------------------------------------------

export function createPolygonNewsProvider({
  name = "polygon",
  limit = 25,
  timeoutMs = 8000,
  fetchImpl = null,
} = {}) {
  return {
    name,
    available: () => true,
    fetchForSymbol: async (symbol, opts = {}) => {
      const sym = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
      if (!sym) return [];
      const signal = opts.signal ?? safeTimeoutSignal(timeoutMs);
      const fetcher = fetchImpl || (typeof fetch === "function" ? fetch : null);
      if (!fetcher) return [];
      try {
        const url = await buildPolygonUrl("/v2/reference/news", {
          ticker: sym,
          limit: String(opts.limit || limit),
          order: "desc",
          sort: "published_utc",
        });
        const r = await fetcher(url, { signal });
        if (!r || !r.ok) return [];
        const json = await r.json();
        const results = Array.isArray(json?.results) ? json.results : [];
        const out = [];
        for (const raw of results) {
          const norm = normalizeArticleShape({
            id: raw.id,
            title: raw.title,
            summary: raw.description,
            source: raw.publisher?.name,
            url: raw.article_url,
            publishedAt: raw.published_utc,
            tickers: raw.tickers,
            sentimentLabel: raw.insights?.[0]?.sentiment,
            sentimentScore: raw.insights?.[0]?.sentiment_score,
          }, { symbol: sym });
          if (norm) out.push(norm);
        }
        return out;
      } catch {
        return [];
      }
    },
  };
}

// ---------------------------------------------------------------------
// 2. Lethal Board news provider — wraps the existing fetchNews helper.
//    Caller passes the helper in so the intelligence layer doesn't take
//    a direct dependency on the discovery cockpit's news module (and
//    so tests can stub it).
// ---------------------------------------------------------------------

export function createLethalBoardNewsProvider({ name = "lethal_board", fetchNews } = {}) {
  return {
    name,
    available: () => typeof fetchNews === "function",
    fetchForSymbol: async (symbol, opts = {}) => {
      if (typeof fetchNews !== "function") return [];
      const sym = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
      if (!sym) return [];
      try {
        const items = await fetchNews({ ticker: sym, limit: opts.limit || 12 });
        if (!Array.isArray(items)) return [];
        const out = [];
        for (const raw of items) {
          const norm = normalizeArticleShape(raw, { symbol: sym });
          if (norm) out.push(norm);
        }
        return out;
      } catch {
        return [];
      }
    },
  };
}

// ---------------------------------------------------------------------
// 3. Manual injection provider — useful for tests, custom feeds, and
//    operator-supplied articles. Articles are kept in an in-memory
//    map keyed by symbol.
// ---------------------------------------------------------------------

export function createManualNewsProvider({ name = "manual", initial = {} } = {}) {
  const store = new Map();
  for (const [k, v] of Object.entries(initial || {})) {
    if (typeof k === "string" && Array.isArray(v)) store.set(k.toUpperCase(), v.slice());
  }
  return {
    name,
    available: () => true,
    addArticles: (symbol, articles) => {
      const sym = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
      if (!sym || !Array.isArray(articles)) return;
      const existing = store.get(sym) || [];
      store.set(sym, existing.concat(articles));
    },
    setArticles: (symbol, articles) => {
      const sym = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
      if (!sym) return;
      store.set(sym, Array.isArray(articles) ? articles.slice() : []);
    },
    clear: () => store.clear(),
    fetchForSymbol: async (symbol) => {
      const sym = typeof symbol === "string" ? symbol.trim().toUpperCase() : "";
      if (!sym) return [];
      const items = store.get(sym) || [];
      const out = [];
      for (const raw of items) {
        const norm = normalizeArticleShape(raw, { symbol: sym });
        if (norm) out.push(norm);
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------
// Article-level helpers used by the service layer.
// ---------------------------------------------------------------------

/**
 * Dedupe by URL primary, source+title secondary. Preserves first-seen
 * order so the caller can sort afterwards.
 */
export function dedupeArticles(articles) {
  if (!Array.isArray(articles)) return [];
  const seen = new Set();
  const out = [];
  for (const a of articles) {
    if (!a || !a.title) continue;
    const key = a.url
      ? `url::${a.url.trim().toLowerCase()}`
      : `srcttl::${(a.source || "").toLowerCase().trim()}::${a.title.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/**
 * Sort newest first. Articles without a publishedAt sink to the bottom.
 */
export function sortNewestFirst(articles) {
  if (!Array.isArray(articles)) return [];
  return articles.slice().sort((a, b) => {
    const aT = Number.isFinite(a?.publishedAt) ? a.publishedAt : -Infinity;
    const bT = Number.isFinite(b?.publishedAt) ? b.publishedAt : -Infinity;
    return bT - aT;
  });
}

function safeTimeoutSignal(ms) {
  try {
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      return AbortSignal.timeout(ms);
    }
  } catch { /* fall through */ }
  return undefined;
}
