// =====================================================================
// Vertex Market Intelligence — backend route skeleton
// =====================================================================
// POST /api/vertex/market-intelligence
//
// Frontend never talks to Vertex directly. This route holds the
// GoogleAuth + project/location plumbing on the backend. When the
// required env vars aren't set, the route returns a structured
// fallback so the LLM wrapper degrades gracefully.
//
// Required env vars (backend-only — NEVER expose via Vite):
//   GOOGLE_CLOUD_PROJECT
//   GOOGLE_CLOUD_LOCATION
//   VERTEX_MODEL                 (defaults to "gemini-2.5-flash")
//
// This module deliberately ships as a SKELETON — no Vertex SDK import
// at module load, so the rest of the test suite never accidentally
// pulls in @google-cloud/aiplatform. The real Vertex call is gated
// behind opts.callVertex (injected by the host server) so unit tests
// can exercise the route without any backend dependency.
// =====================================================================

const DEFAULT_MODEL = "gemini-2.5-flash";

/**
 * Build the request handler. Pure — returns an Express-style handler
 * suitable for `app.post("/api/vertex/market-intelligence", handler)`.
 *
 * @param {object} [opts]
 * @param {() => object} [opts.readEnv]   Override env access (for tests).
 * @param {(args: object) => Promise<object>} [opts.callVertex]
 *   Real Vertex call. Receives { project, location, model, payload } and
 *   must return { summary, warnings? }. Throws on hard failure.
 */
export function buildVertexMarketIntelligenceHandler(opts = {}) {
  const readEnv = opts.readEnv || (() => (typeof process !== "undefined" ? process.env || {} : {}));
  const callVertex = opts.callVertex || null;

  return async function vertexMarketIntelligenceHandler(req, res) {
    const env = readEnv() || {};
    const project = env.GOOGLE_CLOUD_PROJECT || null;
    const location = env.GOOGLE_CLOUD_LOCATION || null;
    const model = env.VERTEX_MODEL || DEFAULT_MODEL;

    // Body should be { payload, model? }.
    const body = (req && req.body && typeof req.body === "object") ? req.body : {};
    const payload = body.payload || null;
    const requestedModel = typeof body.model === "string" && body.model ? body.model : model;

    if (!project || !location || typeof callVertex !== "function") {
      return respond(res, 503, {
        available: false,
        provider: "vertex_ai",
        model: requestedModel,
        summary: null,
        warnings: ["LLM unavailable — Vertex AI not configured on the backend."],
        reason: "vertex_not_configured",
      });
    }
    if (!payload || typeof payload !== "object") {
      return respond(res, 400, {
        available: false,
        provider: "vertex_ai",
        model: requestedModel,
        summary: null,
        warnings: ["LLM unavailable — invalid request body."],
        reason: "invalid_request",
      });
    }

    try {
      const out = await callVertex({
        project,
        location,
        model: requestedModel,
        payload,
      });
      return respond(res, 200, {
        available: true,
        provider: "vertex_ai",
        model: requestedModel,
        summary: (out && out.summary) || null,
        warnings: Array.isArray(out?.warnings) ? out.warnings : [],
      });
    } catch (err) {
      return respond(res, 502, {
        available: false,
        provider: "vertex_ai",
        model: requestedModel,
        summary: null,
        warnings: [`LLM unavailable — Vertex call failed: ${safeMessage(err)}`],
        reason: "vertex_call_failed",
      });
    }
  };
}

/**
 * Run the handler against a synthetic request without a real Express
 * server — useful for unit tests of the fallback shape.
 *
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function runVertexHandlerForTest(handler, body = {}) {
  let captured = null;
  const fakeRes = {
    status(code) { this._status = code; return this; },
    json(payload) { captured = { status: this._status || 200, body: payload }; return this; },
    send(payload) { captured = { status: this._status || 200, body: payload }; return this; },
  };
  await handler({ body }, fakeRes);
  return captured || { status: 0, body: null };
}

function respond(res, status, body) {
  if (res && typeof res.status === "function" && typeof res.json === "function") {
    res.status(status).json(body);
    return;
  }
}

function safeMessage(err) {
  if (!err) return "unknown";
  if (typeof err === "string") return err;
  if (typeof err.message === "string") return err.message;
  return "unknown";
}
