// =====================================================================
// Research Runner — Manual Run / Proposed Intelligence Queue
// =====================================================================
// Operator-driven orchestrator. Reads a saved AgentResearchSettings
// record, walks symbol × source pairs through the deterministic mock
// adapter, and persists each finding as a DRAFT intelligence item via
// agentMemoryStore. Findings stay as proposed intelligence until the
// operator approves them — runner never auto-promotes.
//
// Hard rules:
//   - Settings are read-only from the runner's perspective.
//   - Engine fields (verdict / posture / allowedActions / Credit View
//     risk) are NEVER touched here. The runner only writes draft
//     intelligence items.
//   - Idempotent. Each (basketId, agentId, symbol, source, sequence)
//     tuple maps to a stable id. Re-running:
//       - upserts existing DRAFT items (refreshes title / claim copy)
//       - LEAVES alone any item already moved past DRAFT (approved /
//         archived) so the operator's decisions are preserved.
//   - Disabled settings → runner returns immediately with no writes.
//   - No live network ingestion. Mock adapter only.
// =====================================================================

import {
  getDefaultAgentResearchSettings,
} from "./agentResearchSettingsStore.js";
import { getMockFindings } from "./researchSourceAdapter.js";
import {
  saveIntelligenceDraft,
  getIntelligenceItem,
  listIntelligenceItems,
  INTELLIGENCE_STATUS,
  SOURCE_TYPE,
  CONFIDENCE,
} from "./agentMemoryStore.js";
import { evaluateThesisHealth } from "./thesisHealthEvaluator.js";
import { normalizeSymbol } from "./basketAgentTypes.js";

// ---------------------------------------------------------------------
// Public entry — manual run
// ---------------------------------------------------------------------

/**
 * Run a single research check using the supplied settings record.
 * Pure orchestration — no side effects beyond agentMemoryStore writes
 * for new / draft items and a deterministic id scheme.
 *
 * @param {object} settings  saved AgentResearchSettings record
 * @param {object} [opts]
 * @param {number} [opts.now]   clock injection for tests
 * @returns {{
 *   ok: boolean,
 *   added: string[],
 *   updated: string[],
 *   skipped: Array<{ id: string, reason: string }>,
 *   totalFindings: number,
 *   summary: string,
 *   generatedAt: number,
 * }}
 */
export function runResearchCheck(settings, opts = {}) {
  const now = typeof opts.now === "number" && opts.now > 0 ? opts.now : Date.now();
  if (!settings || typeof settings !== "object") {
    return makeRunResult({ ok: false, summary: "No settings supplied.", generatedAt: now });
  }
  const basketId = typeof settings.basketId === "string" ? settings.basketId : null;
  const agentId  = typeof settings.agentId === "string" ? settings.agentId : null;
  if (!basketId || !agentId) {
    return makeRunResult({ ok: false, summary: "Settings missing basketId or agentId.", generatedAt: now });
  }
  if (settings.enabled === false) {
    return makeRunResult({ ok: true, summary: "Research automation is disabled — no run.", generatedAt: now });
  }

  // Symbols / sources fall back to basket defaults via the settings
  // store contract. If the operator has emptied them out the runner
  // should still tolerate that gracefully.
  const symbols = (Array.isArray(settings.symbols) && settings.symbols.length > 0)
    ? settings.symbols.map(normalizeSymbol).filter(Boolean)
    : (getDefaultAgentResearchSettings({ basketId, agentId }).symbols || [])
        .map(normalizeSymbol).filter(Boolean);
  const sources = Array.isArray(settings.sources) ? settings.sources.filter(Boolean) : [];

  if (symbols.length === 0 || sources.length === 0) {
    return makeRunResult({
      ok: true,
      summary: "Nothing to scan — no symbols or sources configured.",
      generatedAt: now,
    });
  }

  const added = [];
  const updated = [];
  const skipped = [];
  let totalFindings = 0;

  for (const symbol of symbols) {
    for (const source of sources) {
      const findings = getMockFindings({ symbol, source });
      if (findings.length === 0) continue;
      findings.forEach((finding, idx) => {
        totalFindings += 1;
        const id = makeStableId({ basketId, agentId, symbol, source, idx });
        const result = upsertDraft({
          id,
          basketId,
          agentId,
          symbol,
          source,
          finding,
          now,
        });
        if (result.action === "added")    added.push(id);
        else if (result.action === "updated")  updated.push(id);
        else                              skipped.push({ id, reason: result.reason });
      });
    }
  }

  const summary = composeSummary({ added, updated, skipped, totalFindings });
  return makeRunResult({
    ok: true,
    added, updated, skipped,
    totalFindings,
    summary,
    generatedAt: now,
  });
}

// ---------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------

/**
 * Items in the proposed-intelligence queue for a basket. Excludes
 * approved (memory / temporary) and archived items. Sorted newest
 * first.
 */
export function listProposedIntelligence({ basketId, agentId } = {}) {
  if (typeof basketId !== "string" || !basketId) return [];
  const all = listIntelligenceItems({ includeArchived: false });
  return all
    .filter((it) => {
      if (!it) return false;
      if (it.basketId !== basketId) return false;
      if (typeof agentId === "string" && agentId && it.assignedAgent !== agentId) return false;
      return it.status === INTELLIGENCE_STATUS.DRAFT;
    })
    .sort((a, b) => (b?.updatedAt || b?.createdAt || 0) - (a?.updatedAt || a?.createdAt || 0));
}

/**
 * Per-item thesis-health classification. Wraps evaluateThesisHealth
 * scoped to a single proposed item so the queue UI can render a
 * confirming / challenging / mixed / neutral chip without
 * reimplementing the keyword maps.
 */
export function classifyProposedItem(item, { basketId } = {}) {
  if (!item) return { kind: "neutral", confirmingCount: 0, challengingCount: 0, neutralCount: 0 };
  const ev = evaluateThesisHealth({
    basketId: basketId || item.basketId,
    proposedIntelligence: [item],
  });
  const confirmingCount  = ev.confirmingEvidence.length;
  const challengingCount = ev.challengingEvidence.length;
  const neutralCount     = ev.neutralEvidence.length;

  let kind = "neutral";
  if (confirmingCount > 0 && challengingCount === 0)      kind = "confirming";
  else if (challengingCount > 0 && confirmingCount === 0) kind = "challenging";
  else if (confirmingCount > 0 && challengingCount > 0)   kind = "mixed";

  return { kind, confirmingCount, challengingCount, neutralCount };
}

// ---------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------

function upsertDraft({ id, basketId, agentId, symbol, source, finding, now }) {
  const existing = getIntelligenceItem(id);
  if (existing) {
    if (existing.status !== INTELLIGENCE_STATUS.DRAFT) {
      return { action: "skipped", reason: "operator_decision_preserved" };
    }
    // Refresh the existing draft — title / claim / catalysts / risks
    // can move between runs as the mock library evolves. createdAt /
    // approvedByUser are preserved by saveIntelligenceDraft when an
    // existing item is updated.
    saveIntelligenceDraft(buildDraftRecord({
      id, basketId, agentId, symbol, source, finding, now,
    }));
    return { action: "updated" };
  }
  saveIntelligenceDraft(buildDraftRecord({
    id, basketId, agentId, symbol, source, finding, now,
  }));
  return { action: "added" };
}

function buildDraftRecord({ id, basketId, agentId, symbol, source, finding, now }) {
  const title = typeof finding.title === "string" && finding.title.trim()
    ? finding.title.trim()
    : `${symbol} research finding`;
  return {
    id,
    sourceType: SOURCE_TYPE.IMPORTED_NEWS,    // closest enum to "automated finding"
    title,
    basketId,
    assignedAgent: agentId,
    confidence: CONFIDENCE.EXTERNAL,
    status: INTELLIGENCE_STATUS.DRAFT,
    useAs: [],
    rawTextExcerpt: typeof finding.coreClaim === "string"
      ? finding.coreClaim.slice(0, 600)
      : null,
    entities: {
      primarySymbols: [symbol],
      relatedSymbols: [],
      privateCompanies: [],
    },
    thesis: {
      coreClaim:   typeof finding.coreClaim === "string" ? finding.coreClaim : null,
      marketFrame: null,
      companyRole: null,
      basketRole:  null,
    },
    risks: Array.isArray(finding.risks) ? finding.risks.slice() : [],
    catalysts: Array.isArray(finding.catalysts) ? finding.catalysts.slice() : [],
    scannerTags: Array.isArray(finding.scannerTags) ? finding.scannerTags.slice() : [],
    approvedByUser: false,
    expiresAt: null,
    // Source attribution surfaced on each item so the queue can
    // display "Source: <source label>" on the card.
    researchSource: source,
    researchGeneratedAt: now,
  };
}

function makeStableId({ basketId, agentId, symbol, source, idx }) {
  // Deterministic id: re-running the same check upserts rather than
  // duplicates. Uses a fixed prefix so the queue can identify
  // runner-generated items vs operator-pasted ones.
  const seq = typeof idx === "number" && idx > 0 ? `_${idx}` : "";
  return `intel_run_${basketId}__${agentId}__${symbol}__${source}${seq}`;
}

function composeSummary({ added, updated, skipped, totalFindings }) {
  if (totalFindings === 0) {
    return "Run complete — no findings generated for the configured symbols and sources.";
  }
  const parts = [];
  if (added.length > 0)   parts.push(`${added.length} new proposed item${added.length === 1 ? "" : "s"}`);
  if (updated.length > 0) parts.push(`${updated.length} draft${updated.length === 1 ? "" : "s"} refreshed`);
  if (skipped.length > 0) parts.push(`${skipped.length} preserved (already approved or archived)`);
  return `Run complete — ${parts.join(" · ") || "no changes"}.`;
}

function makeRunResult(partial) {
  return {
    ok: !!partial.ok,
    added: Array.isArray(partial.added) ? partial.added : [],
    updated: Array.isArray(partial.updated) ? partial.updated : [],
    skipped: Array.isArray(partial.skipped) ? partial.skipped : [],
    totalFindings: typeof partial.totalFindings === "number" ? partial.totalFindings : 0,
    summary: typeof partial.summary === "string" ? partial.summary : "",
    generatedAt: typeof partial.generatedAt === "number" ? partial.generatedAt : Date.now(),
  };
}
