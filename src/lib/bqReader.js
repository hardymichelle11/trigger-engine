// =====================================================
// BQ READER — browser-side BigQuery query adapter
// =====================================================
// Fetches recent bar data from BigQuery via a proxy endpoint.
// The proxy handles auth (service account) and returns JSON.
//
// If no proxy is configured, returns null (caller falls back
// to Polygon REST or cached data).
//
// Expected proxy shape:
//   POST /api/bq-query
//   Body: { query: "SELECT ...", params: { ... } }
//   Response: { rows: [...], totalRows: N }
//
// Future: could also use BigQuery REST API directly with
// OAuth token if user authenticates via Google sign-in.
// =====================================================

const BQ_PROXY_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_BQ_PROXY_URL) || "";

/**
 * Check if BQ reads are available.
 * @returns {boolean}
 */
export function isBqAvailable() {
  return BQ_PROXY_URL.length > 0;
}

/**
 * Execute a parameterized BQ query via proxy.
 * @param {string} query — SQL query with @param placeholders
 * @param {object} [params] — { paramName: value }
 * @returns {Promise<object[]|null>} rows or null if unavailable
 */
async function bqQuery(query, params = {}) {
  if (!BQ_PROXY_URL) return null;

  try {
    const res = await fetch(BQ_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, params }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.rows || [];
  } catch {
    return null;
  }
}

// --------------------------------------------------
// BAR QUERIES
// --------------------------------------------------

/**
 * Fetch recent 1m bars for a symbol from BQ.
 * Returns array of { ts, close, high, low, volume, range_pct, momentum }.
 * @param {string} symbol
 * @param {number} [days] — lookback days (default 2)
 * @param {number} [limit] — max rows (default 120)
 * @returns {Promise<object[]|null>}
 */
export async function fetchBars1m(symbol, days = 2, limit = 120) {
  const query = `
    SELECT ts, close, high, low, volume, range_pct, momentum
    FROM \`bars_1m\`
    WHERE symbol = @symbol
      AND bar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
    ORDER BY ts DESC
    LIMIT @limit
  `;
  const rows = await bqQuery(query, { symbol, days, limit });
  return rows ? rows.reverse() : null; // oldest first
}

/**
 * Fetch recent daily bars for a symbol from BQ.
 * Returns array of { ts, bar_date, close, high, low, volume, range_pct, momentum, gap, prev_close }.
 * @param {string} symbol
 * @param {number} [days] — lookback days (default 30)
 * @returns {Promise<object[]|null>}
 */
export async function fetchBars1d(symbol, days = 30) {
  const query = `
    SELECT ts, bar_date, open, close, high, low, volume, vwap, range_pct, momentum, gap, prev_close
    FROM \`bars_1d\`
    WHERE symbol = @symbol
      AND bar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
    ORDER BY ts ASC
  `;
  return bqQuery(query, { symbol, days });
}

/**
 * Fetch close prices for slope computation from BQ.
 * Optimized: only fetches close column.
 * @param {string} symbol
 * @param {number} [barsWanted] — default 60
 * @returns {Promise<number[]|null>} close prices oldest-first, or null
 */
export async function fetchClosesFromBQ(symbol, barsWanted = 60) {
  const query = `
    SELECT close
    FROM \`bars_1m\`
    WHERE symbol = @symbol
      AND bar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 2 DAY)
    ORDER BY ts DESC
    LIMIT @limit
  `;
  const rows = await bqQuery(query, { symbol, limit: barsWanted });
  if (!rows || rows.length === 0) return null;

  return rows.map(r => r.close).filter(c => c != null && c > 0).reverse();
}

/**
 * Fetch daily context for a symbol (recent daily bars + computed metrics).
 * Richer than 1m bars — includes gap, prev_close, daily range.
 * @param {string} symbol
 * @param {number} [days] — default 10
 * @returns {Promise<object|null>} context object
 */
export async function fetchDailyContext(symbol, days = 10) {
  const bars = await fetchBars1d(symbol, days);
  if (!bars || bars.length === 0) return null;

  const latest = bars[bars.length - 1];
  const closes = bars.map(b => b.close).filter(Boolean);
  const ranges = bars.map(b => b.range_pct).filter(r => r != null);

  return {
    symbol,
    bars: bars.length,
    latestDate: latest.bar_date,
    latestClose: latest.close,
    avgRange: ranges.length > 0 ? ranges.reduce((a, b) => a + b, 0) / ranges.length : null,
    avgVolume: bars.reduce((s, b) => s + (b.volume || 0), 0) / bars.length,
    recentGap: latest.gap,
    highOfPeriod: Math.max(...closes),
    lowOfPeriod: Math.min(...closes),
    closes,
  };
}
