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

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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
