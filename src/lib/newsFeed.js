// =====================================================================
// News feed — Polygon /v2/reference/news via the proxy
// =====================================================================
// Fetches real headlines (with Polygon's AI sentiment + reasoning) and
// projects them into the shape MarketIntelligencePanel + Opportunity
// DetailPanel already expect: { headline, source, timestamp, why, relevance }.
//
// The same projection is what a downstream model (Gemini knowledge bot,
// Vertex AI consumer, etc.) reads, so wiring this here gives the model
// access to real news instead of placeholder rows.
//
// Hard rules:
//   - Network calls go through the existing Polygon proxy (server-side
//     key, never exposed to the client).
//   - Tolerant of failures: returns [] on any error so the panel falls
//     back to placeholders, never crashes the cockpit.
//   - Short in-memory cache (60s) so repeated scans don't hammer the API.
// =====================================================================

import { buildPolygonUrl } from "./polygonProxy.js";

const CACHE_MS = 60 * 1000;
const _cache = new Map(); // cacheKey → { ts, items }

const SENTIMENT_TO_RELEVANCE = {
  positive: "high",
  neutral: "low",
  negative: "medium", // negative news is actionable — flag at "medium" not "low"
};

function humanizeTimestamp(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const ageMin = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (ageMin < 1) return "just now";
  if (ageMin < 60) return `${ageMin}m ago`;
  const ageHr = Math.round(ageMin / 60);
  if (ageHr < 24) return `${ageHr}h ago`;
  const ageDay = Math.round(ageHr / 24);
  if (ageDay < 14) return `${ageDay}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Project a Polygon news article into the panel row shape.
 * Picks the most-relevant ticker insight when several are present.
 */
function projectArticle(article, primaryTicker) {
  const insight =
    (article.insights || []).find(
      (i) => i?.ticker?.toUpperCase() === (primaryTicker || "").toUpperCase(),
    ) || (article.insights || [])[0] || null;

  const sentiment = insight?.sentiment || null;
  const reasoning = insight?.sentiment_reasoning || article.description || "";

  return {
    headline: article.title || "Untitled",
    source: article.publisher?.name || article.author || "—",
    timestamp: humanizeTimestamp(article.published_utc),
    publishedAt: article.published_utc || null,
    why: reasoning,
    relevance: SENTIMENT_TO_RELEVANCE[sentiment] || "low",
    sentiment,
    tickers: article.tickers || [],
    url: article.article_url || null,
    publishedIso: article.published_utc || null,
  };
}

/**
 * Fetch news for a ticker (or general market when ticker is null).
 *
 * @param {object} opts
 * @param {string|null} [opts.ticker]   filter to articles tagged with this ticker
 * @param {number}      [opts.limit]    max articles (default 8)
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Array<{headline,source,timestamp,why,relevance,sentiment,tickers,url}>>}
 */
export async function fetchNews({ ticker = null, limit = 8, signal } = {}) {
  const key = `${ticker || "*"}:${limit}`;
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.items;

  try {
    const params = { limit: String(limit), order: "desc", sort: "published_utc" };
    if (ticker) params.ticker = ticker.toUpperCase();
    const url = await buildPolygonUrl("/v2/reference/news", params);
    const r = await fetch(url, { signal: signal ?? AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const items = (json.results || []).map((a) => projectArticle(a, ticker));
    _cache.set(key, { ts: Date.now(), items });
    return items;
  } catch (err) {
    // Tolerant: panel falls back to placeholders when this returns [].
    return [];
  }
}

/** Fetch news for many tickers in parallel; deduplicates by article id. */
export async function fetchNewsForTickers(tickers, limitPer = 4) {
  if (!Array.isArray(tickers) || tickers.length === 0) return [];
  const lists = await Promise.all(
    tickers.map((t) => fetchNews({ ticker: t, limit: limitPer })),
  );
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const a of list) {
      const id = a.url || `${a.headline}|${a.publishedIso}`;
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(a);
    }
  }
  // Newest first
  merged.sort((a, b) =>
    new Date(b.publishedIso || 0) - new Date(a.publishedIso || 0),
  );
  return merged;
}

/** Test-only: clear the in-memory cache. */
export function _clearNewsCache() {
  _cache.clear();
}
