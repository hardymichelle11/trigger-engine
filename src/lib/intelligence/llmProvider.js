// =====================================================================
// LLM Provider Interface
// =====================================================================
// Provider-neutral wrapper around any LLM that can return a sanitized
// MarketIntelligenceSummary. Vertex AI is implemented as ONE provider
// behind this interface; the rules-based path is always available as
// the safe fallback.
//
// Provider object shape:
//   {
//     name: string,
//     model: string|null,
//     available: () => boolean,
//     run: (payload) => Promise<rawSummary>,
//   }
//
// runMarketIntelligenceLLM never throws — it converts every failure
// into the fallback shape so the UI can handle it uniformly.
// =====================================================================

let defaultProvider = null;

/** Register the default LLM provider. Pass null to clear. */
export function setDefaultLlmProvider(provider) { defaultProvider = provider || null; }
export function getDefaultLlmProvider() { return defaultProvider; }

const FALLBACK_WARNING = "LLM unavailable — using rules-based news interpretation.";

/**
 * @param {object} input — prompt-builder input + optional provider override
 * @returns {Promise<{
 *   available: boolean,
 *   provider: string,
 *   model: string|null,
 *   summary: object|null,
 *   warnings: string[]
 * }>}
 */
export async function runMarketIntelligenceLLM(input = {}) {
  const provider = input.provider || defaultProvider;
  if (!provider) {
    return fallback();
  }
  if (typeof provider.available === "function" && provider.available() === false) {
    return fallback(`Provider "${provider.name}" not available.`);
  }
  if (typeof provider.run !== "function") {
    return fallback(`Provider "${provider.name}" missing run() method.`);
  }
  try {
    const summary = await provider.run({
      symbol:           input.symbol,
      basketProfile:    input.basketProfile,
      articles:         input.articles,
      macroContext:     input.macroContext,
      teSnapshot:       input.teSnapshot,
      cvSnapshot:       input.cvSnapshot,
      portfolioContext: input.portfolioContext,
    });
    if (!summary || typeof summary !== "object") {
      return fallback(`Provider "${provider.name}" returned no usable summary.`);
    }
    return {
      available: true,
      provider:  provider.name,
      model:     provider.model || null,
      summary,
      warnings:  [],
    };
  } catch (err) {
    return fallback(`Provider "${provider.name}" failed: ${err?.message || "unknown"}`);
  }
}

function fallback(reason) {
  const warnings = [FALLBACK_WARNING];
  if (reason) warnings.unshift(reason);
  return {
    available: false,
    provider:  "rules_fallback",
    model:     null,
    summary:   null,
    warnings,
  };
}

// ---------------------------------------------------------------------
// Vertex AI provider — backend-routed, frontend-safe.
// ---------------------------------------------------------------------
// The frontend NEVER talks to Vertex directly. This provider POSTs to a
// backend route (default /api/vertex/market-intelligence) which handles
// the GoogleAuth + project/location wiring server-side.
//
// If the route returns 5xx / 4xx / unavailable, the provider's run()
// throws, and the LLM wrapper falls back gracefully.
// ---------------------------------------------------------------------

export function createVertexAiProvider({
  endpoint = "/api/vertex/market-intelligence",
  model = "gemini-2.5-flash",
  fetchImpl = null,
  timeoutMs = 12000,
  isAvailable = null,
} = {}) {
  return {
    name: "vertex_ai",
    model,
    available: () => {
      if (typeof isAvailable === "function") return !!isAvailable();
      // The browser can't see env vars; we assume the route exists if we
      // got configured. The route itself responds 503 with a fallback
      // warning when credentials aren't set.
      return true;
    },
    run: async (payload) => {
      const fetcher = fetchImpl || (typeof fetch === "function" ? fetch : null);
      if (!fetcher) throw new Error("fetch_unavailable");
      const signal = safeTimeoutSignal(timeoutMs);
      const r = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload, model }),
        signal,
      });
      if (!r || !r.ok) {
        throw new Error(`vertex_route_${r?.status || "no_response"}`);
      }
      const json = await r.json();
      if (!json || typeof json !== "object") {
        throw new Error("vertex_invalid_json");
      }
      // The backend returns { available, summary, warnings? } so the
      // run() result is just the summary.
      if (json.available === false) {
        throw new Error(json.reason || "vertex_unavailable");
      }
      return json.summary || null;
    },
  };
}

function safeTimeoutSignal(ms) {
  try {
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      return AbortSignal.timeout(ms);
    }
  } catch { /* fall through */ }
  return undefined;
}
