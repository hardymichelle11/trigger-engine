// =====================================================
// MARKET INTELLIGENCE INBOX
// =====================================================
// Operator command center: upload a document, paste notes, drop a
// URL, or import news; assign it to a basket + agent; pick how the
// system should use it; press Process. The processor builds a
// deterministic draft (no random scoring, no medical claims). Users
// review the draft via the IntelligenceExtractionReview surface.
//
// URL + News imports are placeholders for now — the project doesn't
// yet have a network ingestion service. The inputs accept text but
// flag the source type so future ingestion work can swap them in.
// =====================================================

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  listBasketAgents,
} from "../../lib/portfolioCio/basketAgentRegistry.js";
import {
  processRawIntelligence,
} from "../../lib/portfolioCio/intelligenceProcessor.js";
import {
  saveIntelligenceDraft,
  approveIntelligenceItem,
  promoteToAgentMemory,
  archiveIntelligenceItem,
  listIntelligenceItems,
  SOURCE_TYPE,
  CONFIDENCE,
  USE_AS,
  INTELLIGENCE_STATUS,
} from "../../lib/portfolioCio/agentMemoryStore.js";
import IntelligenceExtractionReview from "./IntelligenceExtractionReview.jsx";

const PALETTE = {
  bg:        "#06090e",
  panelBg:   "#0d1117",
  cardBg:    "#0a0d12",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  accentTeal:"#14b8a6",
  green:     "#22c55e",
  red:       "#ef4444",
  amber:     "#f59e0b",
  cyan:      "#06b6d4",
  purple:    "#a78bfa",
};

const AGENTS = Object.freeze([
  { id: "aiHealthDiagnosticsAgent",  label: "AI Health Diagnostics Agent" },
  { id: "creditViewAgent",            label: "Credit View Agent" },
  { id: "triggerEngineContextAgent",  label: "Trigger Engine Context Agent" },
  { id: "basketManagerAgent",         label: "Basket Manager Agent" },
]);

const SOURCE_TABS = Object.freeze([
  { id: SOURCE_TYPE.USER_DOCUMENT, label: "Upload Document" },
  { id: SOURCE_TYPE.USER_NOTES,    label: "Paste Notes" },
  { id: SOURCE_TYPE.EXTERNAL_URL,  label: "Add URL" },
  { id: SOURCE_TYPE.IMPORTED_NEWS, label: "Import News" },
]);

const USE_AS_OPTIONS = Object.freeze([
  { id: USE_AS.THESIS_MEMORY,      label: "Thesis Memory" },
  { id: USE_AS.CATALYST_WATCH,     label: "Catalyst Watch" },
  { id: USE_AS.COMPETITOR_MAP,     label: "Competitor Map" },
  { id: USE_AS.RISK_FRAMEWORK,     label: "Risk Framework" },
  { id: USE_AS.SCANNER_RULE_SEED,  label: "Scanner Rule Seed" },
  { id: USE_AS.TEMPORARY_RESEARCH, label: "Temporary Research Only" },
]);

const STATUS_LABELS = {
  [INTELLIGENCE_STATUS.DRAFT]:              "Draft",
  [INTELLIGENCE_STATUS.APPROVED_TEMPORARY]: "One-scan",
  [INTELLIGENCE_STATUS.APPROVED_MEMORY]:    "In agent memory",
  [INTELLIGENCE_STATUS.ARCHIVED]:           "Archived",
};

const STATUS_TONES = {
  [INTELLIGENCE_STATUS.DRAFT]:              PALETTE.amber,
  [INTELLIGENCE_STATUS.APPROVED_TEMPORARY]: PALETTE.cyan,
  [INTELLIGENCE_STATUS.APPROVED_MEMORY]:    PALETTE.green,
  [INTELLIGENCE_STATUS.ARCHIVED]:           PALETTE.textFaint,
};

const CONFIDENCE_OPTIONS = Object.freeze([
  { id: CONFIDENCE.USER_THESIS, label: "User-authored thesis" },
  { id: CONFIDENCE.EXTERNAL,    label: "External source" },
  { id: CONFIDENCE.MIXED,       label: "Mixed" },
]);

/**
 * @param {object} props
 * @param {string} [props.defaultBasketId]
 * @param {string} [props.defaultAgentId]
 */
export default function MarketIntelligenceInbox({
  defaultBasketId = "ai_health_diagnostics",
  defaultAgentId = "aiHealthDiagnosticsAgent",
}) {
  const baskets = useMemo(() => listBasketAgents(), []);
  const fileInputRef = useRef(null);

  const [sourceType, setSourceType] = useState(SOURCE_TYPE.USER_NOTES);
  const [rawText, setRawText] = useState("");
  const [title, setTitle] = useState("");
  const [basketId, setBasketId] = useState(() =>
    baskets.some((b) => b.basketId === defaultBasketId) ? defaultBasketId : (baskets[0]?.basketId || ""),
  );
  const [agentId, setAgentId] = useState(defaultAgentId);
  const [confidence, setConfidence] = useState(CONFIDENCE.USER_THESIS);
  const [useAs, setUseAs] = useState([USE_AS.THESIS_MEMORY]);

  const [draft, setDraft] = useState(null);
  const [savedItems, setSavedItems] = useState(() => listIntelligenceItems());
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const reloadList = useCallback(() => setSavedItems(listIntelligenceItems()), []);

  const toggleUseAs = useCallback((id) => {
    setUseAs((prev) => prev.includes(id)
      ? prev.filter((u) => u !== id)
      : [...prev, id]);
  }, []);

  const onPickFile = useCallback(async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await readTextFile(file);
      setRawText(text);
      setTitle((prev) => prev || file.name.replace(/\.[^.]+$/, ""));
      setSourceType(SOURCE_TYPE.USER_DOCUMENT);
      setError(null);
    } catch (err) {
      setError(`Could not read file: ${err && err.message ? err.message : "unknown error"}`);
    }
  }, []);

  const onProcess = useCallback(() => {
    setError(null);
    setInfo(null);
    if (!rawText.trim()) {
      setError("Add notes, upload a document, or paste a URL before processing.");
      return;
    }
    if (!basketId) {
      setError("Pick a basket before processing.");
      return;
    }
    const draftShape = processRawIntelligence({
      rawText,
      basketId,
      assignedAgent: agentId,
      confidence,
      useAs,
      title,
      sourceType,
    });
    if (!draftShape) {
      setError("Could not extract any intelligence from the input.");
      return;
    }
    setDraft(draftShape);
  }, [rawText, basketId, agentId, confidence, useAs, title, sourceType]);

  const onSaveDraft = useCallback((edited) => {
    const shape = edited || draft;
    if (!shape) return;
    const stored = saveIntelligenceDraft(shape);
    if (!stored) {
      setError("Could not save the draft.");
      return;
    }
    setDraft(null);
    setRawText("");
    setTitle("");
    reloadList();
    setInfo(`Saved draft "${stored.title}".`);
  }, [draft, reloadList]);

  const onApproveTemporary = useCallback((edited) => {
    const shape = edited || draft;
    if (!shape) return;
    const stored = saveIntelligenceDraft(shape);
    if (!stored) {
      setError("Could not save before approving.");
      return;
    }
    const approved = approveIntelligenceItem(stored.id);
    if (!approved) {
      setError("Could not mark item approved.");
      return;
    }
    setDraft(null);
    setRawText("");
    setTitle("");
    reloadList();
    setInfo(`Approved "${approved.title}" for one-scan use.`);
  }, [draft, reloadList]);

  const onPromoteToMemory = useCallback((edited) => {
    const shape = edited || draft;
    if (!shape) return;
    const stored = saveIntelligenceDraft(shape);
    if (!stored) {
      setError("Could not save before promoting.");
      return;
    }
    const promoted = promoteToAgentMemory(stored.id);
    if (!promoted) {
      setError("Could not promote item to memory.");
      return;
    }
    setDraft(null);
    setRawText("");
    setTitle("");
    reloadList();
    setInfo(`Promoted "${promoted.title}" to agent memory.`);
  }, [draft, reloadList]);

  const onReject = useCallback(() => {
    setDraft(null);
    setInfo("Draft rejected — nothing saved.");
  }, []);

  const onArchiveItem = useCallback((id) => {
    archiveIntelligenceItem(id);
    reloadList();
  }, [reloadList]);

  const onPromoteSavedItem = useCallback((id) => {
    const promoted = promoteToAgentMemory(id);
    if (!promoted) return;
    reloadList();
    setInfo(`Promoted "${promoted.title}" to agent memory.`);
  }, [reloadList]);

  return (
    <section aria-label="Market intelligence inbox"
      style={{
        background: PALETTE.bg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 10, padding: 12,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
      {/* Header */}
      <header>
        <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim, marginBottom: 4 }}>
          MARKET INTELLIGENCE INBOX
        </div>
        <div style={{ fontSize: 10, color: PALETTE.textFaint, lineHeight: 1.5 }}>
          Upload, paste, or import market intelligence. The processor extracts tickers, competitors, catalysts, and risks deterministically. Approve before any agent uses it.
        </div>
      </header>

      {/* Source tabs */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {SOURCE_TABS.map((tab) => {
          const active = sourceType === tab.id;
          const disabled = tab.id === SOURCE_TYPE.EXTERNAL_URL || tab.id === SOURCE_TYPE.IMPORTED_NEWS;
          return (
            <button key={tab.id} type="button"
              onClick={() => {
                if (tab.id === SOURCE_TYPE.USER_DOCUMENT) {
                  setSourceType(tab.id);
                  fileInputRef.current && fileInputRef.current.click();
                } else {
                  setSourceType(tab.id);
                }
              }}
              disabled={disabled}
              style={{
                background: active ? `${PALETTE.accentTeal}1a` : "transparent",
                border: `1px solid ${active ? PALETTE.accentTeal : PALETTE.border}`,
                color: active ? PALETTE.accentTeal : (disabled ? PALETTE.textFaint : PALETTE.textDim),
                borderRadius: 6, padding: "5px 10px",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                cursor: disabled ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}>
              {tab.label}{disabled ? " (coming soon)" : ""}
            </button>
          );
        })}
        <input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.json"
          onChange={onPickFile} style={{ display: "none" }} />
      </div>

      {/* Title */}
      <Field label="Title (optional)">
        <input type="text" value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`e.g. "TEM AI Health Bridge thesis"`}
          style={inputStyle()} />
      </Field>

      {/* Raw text */}
      <Field label={sourceType === SOURCE_TYPE.EXTERNAL_URL ? "URL" : "Notes / document text"}>
        {sourceType === SOURCE_TYPE.EXTERNAL_URL ? (
          <input type="text" value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="https://…  (link will be queued for ingestion when network ingestion ships)"
            style={inputStyle()} />
        ) : (
          <textarea value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={10}
            placeholder="Paste your thesis, notes, or document text here…"
            style={{ ...inputStyle(), fontFamily: "ui-monospace, Menlo, monospace" }} />
        )}
      </Field>

      {/* Basket + agent */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 8,
      }}>
        <Field label="Assign to basket">
          <select value={basketId} onChange={(e) => setBasketId(e.target.value)} style={inputStyle()}>
            {baskets.map((b) => (
              <option key={b.basketId} value={b.basketId}>{b.basketName}</option>
            ))}
          </select>
        </Field>
        <Field label="Assign to agent">
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} style={inputStyle()}>
            {AGENTS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Source confidence">
          <select value={confidence} onChange={(e) => setConfidence(e.target.value)} style={inputStyle()}>
            {CONFIDENCE_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Use as */}
      <Field label="Use as">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {USE_AS_OPTIONS.map((opt) => {
            const active = useAs.includes(opt.id);
            return (
              <button key={opt.id} type="button"
                onClick={() => toggleUseAs(opt.id)}
                aria-pressed={active}
                style={{
                  background: active ? `${PALETTE.purple}1a` : "transparent",
                  border: `1px solid ${active ? PALETTE.purple : PALETTE.border}`,
                  color: active ? PALETTE.purple : PALETTE.textDim,
                  borderRadius: 5, padding: "4px 8px",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                {opt.label}
              </button>
            );
          })}
        </div>
      </Field>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={onProcess} style={primaryBtn()}>Process Intelligence</button>
        {error && <span style={{ fontSize: 11, color: PALETTE.red }}>{error}</span>}
        {info && <span style={{ fontSize: 11, color: PALETTE.green }}>{info}</span>}
      </div>

      {/* Extraction review */}
      {draft && (
        <IntelligenceExtractionReview
          draft={draft}
          onSaveDraft={onSaveDraft}
          onApproveTemporary={onApproveTemporary}
          onPromoteToMemory={onPromoteToMemory}
          onReject={onReject} />
      )}

      {/* Saved items list */}
      <SavedItems items={savedItems}
        onArchive={onArchiveItem}
        onPromote={onPromoteSavedItem} />
    </section>
  );
}

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

function SavedItems({ items, onArchive, onPromote }) {
  if (!items || items.length === 0) {
    return (
      <section style={{
        background: PALETTE.panelBg,
        border: `1px solid ${PALETTE.borderSoft}`,
        borderRadius: 8, padding: 10,
        fontSize: 10, color: PALETTE.textFaint, fontStyle: "italic",
      }}>
        No saved intelligence yet. Process and approve a document to populate the agent's memory.
      </section>
    );
  }
  return (
    <section aria-label="Saved intelligence items"
      style={{
        background: PALETTE.panelBg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 8, padding: 10,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
      <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim }}>
        SAVED INTELLIGENCE · {items.length}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it) => (
          <li key={it.id} style={{
            background: PALETTE.cardBg,
            border: `1px solid ${PALETTE.borderSoft}`,
            borderRadius: 6, padding: "6px 8px",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: PALETTE.text, fontWeight: 600 }}>
                {it.title}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                color: STATUS_TONES[it.status] || PALETTE.textFaint,
                background: `${STATUS_TONES[it.status] || PALETTE.textFaint}1a`,
                border: `1px solid ${STATUS_TONES[it.status] || PALETTE.textFaint}55`,
                borderRadius: 4, padding: "2px 6px",
              }}>
                {STATUS_LABELS[it.status] || it.status}
              </span>
            </div>
            <div style={{ fontSize: 9, color: PALETTE.textFaint }}>
              {it.basketId || "(no basket)"} · {it.assignedAgent || "(no agent)"} · {(it.entities?.primarySymbols || []).join(", ") || "no primary"}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {it.status !== INTELLIGENCE_STATUS.APPROVED_MEMORY && (
                <button type="button" onClick={() => onPromote(it.id)} style={btn(PALETTE.green)}>
                  Promote to memory
                </button>
              )}
              {it.status !== INTELLIGENCE_STATUS.ARCHIVED && (
                <button type="button" onClick={() => onArchive(it.id)} style={btn(PALETTE.textFaint)}>
                  Archive
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint, fontWeight: 700 }}>
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}

function inputStyle() {
  return {
    background: PALETTE.panelBg, color: PALETTE.text,
    border: `1px solid ${PALETTE.border}`, borderRadius: 6,
    padding: "6px 8px", fontSize: 11, fontFamily: "inherit",
  };
}
function btn(color) {
  return {
    background: `${color}1a`, border: `1px solid ${color}88`, color,
    borderRadius: 5, padding: "3px 8px",
    fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
    cursor: "pointer", fontFamily: "inherit",
  };
}
function primaryBtn() {
  return {
    background: `${PALETTE.accentTeal}1a`,
    border: `1px solid ${PALETTE.accentTeal}88`,
    color: PALETTE.accentTeal,
    borderRadius: 6, padding: "6px 12px",
    fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
    cursor: "pointer", fontFamily: "inherit",
  };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsText(file);
  });
}
