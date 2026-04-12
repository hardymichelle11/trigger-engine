#!/usr/bin/env node
// =====================================================
// KNOWLEDGE BOT BACKEND — Vertex AI (Gemini) proxy
// =====================================================
// Lightweight Express server that proxies chat requests
// to Vertex AI. Never expose credentials to the browser.
//
// Usage:
//   npm run bot:server
//
// Env vars:
//   GOOGLE_CLOUD_PROJECT   — GCP project ID
//   GOOGLE_CLOUD_LOCATION  — Vertex AI region (default: us-central1)
//   GOOGLE_GENAI_USE_VERTEXAI — must be "true"
//   BOT_PORT               — server port (default: 3001)
//   BOT_MODEL              — Gemini model (default: gemini-2.5-flash)
//
// Auth: uses Application Default Credentials (ADC).
//   Run `gcloud auth application-default login` locally.
//   In production, attach a service account.
// =====================================================

import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import { BOT_SYSTEM_PROMPT } from "./botSystemPrompt.js";

const PORT = process.env.BOT_PORT || 3001;
const MODEL = process.env.BOT_MODEL || "gemini-2.5-flash";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.VITE_GCP_PROJECT;
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

// ── INIT ────────────────────────────────────────────

if (!PROJECT) {
  console.error("  ERROR: GOOGLE_CLOUD_PROJECT or VITE_GCP_PROJECT must be set.");
  process.exit(1);
}

const ai = new GoogleGenAI({
  vertexai: true,
  project: PROJECT,
  location: LOCATION,
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "16kb" }));

// ── REQUEST LOGGING ─────────────────────────────────

let requestCount = 0;
const startTime = Date.now();

// ── ROUTES ──────────────────────────────────────────

/**
 * POST /api/knowledgebot/chat
 * Body: { message: string, history?: [{ role, text }] }
 * Returns: { ok, text, usage }
 */
app.post("/api/knowledgebot/chat", async (req, res) => {
  const { message, history } = req.body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ ok: false, error: "Message is required." });
  }

  if (message.length > 2000) {
    return res.status(400).json({ ok: false, error: "Message too long (max 2000 chars)." });
  }

  requestCount++;
  const reqId = requestCount;
  const startMs = Date.now();

  try {
    // Build conversation contents
    const contents = [];

    // Prepend history if provided (last 10 turns max)
    if (Array.isArray(history)) {
      const recentHistory = history.slice(-10);
      for (const h of recentHistory) {
        contents.push({
          role: h.role === "user" ? "user" : "model",
          parts: [{ text: h.text }],
        });
      }
    }

    // Add current message
    contents.push({
      role: "user",
      parts: [{ text: message.trim() }],
    });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: BOT_SYSTEM_PROMPT,
        maxOutputTokens: 512,
        temperature: 0.3,
      },
    });

    const text = response.text || "[No response generated]";
    const elapsedMs = Date.now() - startMs;

    // Rough token/cost estimation for Gemini 2.5 Flash
    // Input: ~$0.15/1M tokens, Output: ~$0.60/1M tokens (Vertex pricing)
    const inputTokensEst = Math.ceil((message.length + BOT_SYSTEM_PROMPT.length) / 4);
    const outputTokensEst = Math.ceil(text.length / 4);
    const estimatedCostUsd = (inputTokensEst * 0.00000015) + (outputTokensEst * 0.0000006);

    console.log(`  [${reqId}] ${elapsedMs}ms | ~${inputTokensEst}+${outputTokensEst} tokens | $${estimatedCostUsd.toFixed(6)} | "${message.slice(0, 60)}..."`);

    res.json({
      ok: true,
      text,
      usage: {
        inputTokensEst,
        outputTokensEst,
        estimatedCostUsd: Math.round(estimatedCostUsd * 1000000) / 1000000,
        elapsedMs,
      },
    });
  } catch (err) {
    const elapsedMs = Date.now() - startMs;
    console.error(`  [${reqId}] ERROR ${elapsedMs}ms | ${err.message}`);

    res.status(500).json({
      ok: false,
      error: err.message || "Vertex AI request failed",
    });
  }
});

/**
 * GET /api/knowledgebot/health
 * Returns server status (no auth required).
 */
app.get("/api/knowledgebot/health", (_req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    project: PROJECT,
    location: LOCATION,
    uptime: Math.round((Date.now() - startTime) / 1000),
    requestCount,
  });
});

// ── START ───────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  Knowledge Bot Backend`);
  console.log(`  ─────────────────────`);
  console.log(`  Port:     ${PORT}`);
  console.log(`  Model:    ${MODEL}`);
  console.log(`  Project:  ${PROJECT}`);
  console.log(`  Location: ${LOCATION}`);
  console.log(`  Health:   http://localhost:${PORT}/api/knowledgebot/health`);
  console.log(`  Chat:     POST http://localhost:${PORT}/api/knowledgebot/chat\n`);
});
