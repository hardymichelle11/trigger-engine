// =====================================================
// CLOUDFLARE WORKER — Polygon API Proxy
// =====================================================
// Forwards requests to Polygon.io with your API key
// injected server-side. Users never see the key.
//
// Deploy: npx wrangler deploy
// Config: set POLYGON_API_KEY as a secret in Cloudflare dashboard
//
// Usage from browser:
//   fetch("https://api.aipicks.shop/v2/snapshot/locale/us/markets/stocks/tickers/NVDA")
//   → proxies to Polygon with your key appended
// =====================================================

const POLYGON_BASE = "https://api.polygon.io";

// Allowed origins (update with your domain)
const ALLOWED_ORIGINS = [
  "https://aipicks.shop",
  "http://aipicks.shop",
  "https://www.aipicks.shop",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCORS(request);
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === "/" || path === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "polygon-proxy" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      });
    }

    // Position sync: GET /positions/:userId, PUT /positions/:userId
    if (path.startsWith("/positions/")) {
      return handlePositions(request, env, path);
    }

    // Index quote: /index/:symbol (VIX, TNX) — Yahoo Finance fallback
    if (path.startsWith("/index/")) {
      return handleIndexQuote(request, path);
    }

    // Proxy: forward /v2/*, /v3/* to Polygon
    if (path.startsWith("/v2/") || path.startsWith("/v3/")) {
      return proxyToPolygon(request, env, path, url.search);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders(request) });
  },
};

async function proxyToPolygon(request, env, path, search) {
  const apiKey = env.POLYGON_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(request) },
    });
  }

  // Build Polygon URL with API key
  const separator = search ? "&" : "?";
  const polygonUrl = `${POLYGON_BASE}${path}${search}${separator}apiKey=${apiKey}`;

  try {
    const resp = await fetch(polygonUrl, {
      method: request.method,
      headers: {
        "User-Agent": "aipicks-proxy/1.0",
        "Accept": "application/json",
      },
    });

    // Forward the response with CORS headers
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        ...corsHeaders(request),
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Proxy fetch failed", detail: err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders(request) },
    });
  }
}

// --------------------------------------------------
// POSITION SYNC via Cloudflare KV
// --------------------------------------------------

async function handlePositions(request, env, path) {
  const parts = path.split("/").filter(Boolean); // ["positions", userId]
  const userId = parts[1] || "default";

  if (!env.POSITIONS) {
    return new Response(JSON.stringify({ error: "KV not configured" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(request) },
    });
  }

  const key = `positions:${userId}`;

  // GET — load positions
  if (request.method === "GET") {
    const data = await env.POSITIONS.get(key);
    return new Response(data || JSON.stringify({ positions: [], updatedAt: null }), {
      headers: { "Content-Type": "application/json", ...corsHeaders(request) },
    });
  }

  // PUT — save positions
  if (request.method === "PUT") {
    try {
      const body = await request.json();
      const toStore = JSON.stringify({
        positions: body.positions || [],
        updatedAt: new Date().toISOString(),
      });
      await env.POSITIONS.put(key, toStore);
      return new Response(JSON.stringify({ ok: true, count: (body.positions || []).length }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Save failed", detail: err.message }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders(request) });
}

// --------------------------------------------------
// INDEX QUOTE via Yahoo Finance (VIX, TNX)
// Polygon index data requires higher-tier plan, so we
// use Yahoo Finance chart API as a free fallback.
// --------------------------------------------------

const YAHOO_SYMBOL_MAP = {
  VIX: "^VIX",
  TNX: "^TNX",
};

async function handleIndexQuote(request, path) {
  const parts = path.split("/").filter(Boolean); // ["index", "VIX"]
  const symbol = (parts[1] || "").toUpperCase();
  const yahooSymbol = YAHOO_SYMBOL_MAP[symbol];

  if (!yahooSymbol) {
    return new Response(JSON.stringify({ error: "Unsupported index", symbol }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(request) },
    });
  }

  try {
    const yahooUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`;
    const resp = await fetch(yahooUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; aipicks-proxy/1.0)" },
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "Yahoo Finance request failed", status: resp.status }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      });
    }

    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta || {};
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const timestamps = result?.timestamp || [];

    // Build a Polygon-compatible snapshot shape
    const current = meta.regularMarketPrice ?? null;
    const prevClose = meta.chartPreviousClose ?? (closes.length >= 2 ? closes[closes.length - 2] : null);
    const high = meta.regularMarketDayHigh ?? null;
    const low = meta.regularMarketDayLow ?? null;

    const ticker = {
      ticker: symbol,
      day: { c: current, h: high, l: low, v: 0 },
      prevDay: { c: prevClose, h: high, l: low, v: 0 },
      _source: "yahoo_finance",
      _yahooSymbol: yahooSymbol,
      _timestamp: (meta.regularMarketTime || 0) * 1000,
    };

    return new Response(JSON.stringify({ status: "OK", ticker }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "max-age=60", ...corsHeaders(request) },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Index quote failed", detail: err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders(request) },
    });
  }
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function handleCORS(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}
