// =====================================================
// INTELLIGENCE EXTRACTION REVIEW
// =====================================================
// Operator approval surface for a draft built by intelligenceProcessor.
// Shows the structured extraction (entities, thesis, risks, catalysts,
// scanner tags), lets the operator edit any field, and surfaces three
// approval paths:
//   - Save Draft           (keeps the draft for later review)
//   - Use for One Scan     (approves temporary, expires by default)
//   - Promote to Agent Memory (permanent, agent reads it from now on)
//   - Reject               (drops the draft)
//
// "Suggested scanner additions" are operator-driven: clicking adds the
// symbol into the basket's active universe via the existing universe
// manager. Nothing happens automatically.
// =====================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  upsertBasketSymbol,
} from "../../lib/portfolioCio/basketUniverseManager.js";
import {
  getAIHealthDiagnosticsProfile,
  AI_HEALTH_DIAGNOSTICS_BASKET_ID,
} from "../../lib/portfolioCio/aiHealthDiagnosticsProfiles.js";
import {
  getBasketAgent,
} from "../../lib/portfolioCio/basketAgentRegistry.js";

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

/**
 * @param {object} props
 * @param {object} props.draft                                    output of processRawIntelligence
 * @param {(edited: object) => void} props.onSaveDraft
 * @param {(edited: object) => void} props.onApproveTemporary
 * @param {(edited: object) => void} props.onPromoteToMemory
 * @param {() => void} props.onReject
 */
export default function IntelligenceExtractionReview({
  draft, onSaveDraft, onApproveTemporary, onPromoteToMemory, onReject,
}) {
  const [edited, setEdited] = useState(draft);

  // Sync if the parent passes a new draft (re-process flow).
  React.useEffect(() => { setEdited(draft); }, [draft]);

  const basketProfile = useMemo(
    () => edited?.basketId ? getBasketAgent(edited.basketId) : null,
    [edited?.basketId],
  );

  const updateField = useCallback((path, value) => {
    setEdited((prev) => setIn(prev, path, value));
  }, []);

  const onAddSymbolToBasket = useCallback((symbol) => {
    if (!edited?.basketId || !symbol) return;
    upsertBasketSymbol(edited.basketId, symbol, {
      addedReason: "intelligence_review",
      source: "operator_intelligence",
    });
  }, [edited]);

  if (!edited) return null;

  // Suggested scanner additions: tickers we found that aren't yet in
  // the operator's basket. Surface only when we have an AI Health
  // profile match — otherwise we don't have safe operator-facing
  // copy for the suggestion. Other baskets fall back to the symbol
  // alone.
  const suggestedAdditions = (edited.entities?.primarySymbols || [])
    .concat(edited.entities?.relatedSymbols || [])
    .map((sym) => ({
      symbol: sym,
      profile: edited.basketId === AI_HEALTH_DIAGNOSTICS_BASKET_ID
        ? getAIHealthDiagnosticsProfile(sym)
        : null,
    }))
    .filter((row, i, arr) =>
      i === arr.findIndex((r) => r.symbol === row.symbol));

  return (
    <article aria-label="Intelligence extraction review"
      style={{
        background: PALETTE.panelBg,
        border: `1px solid ${PALETTE.purple}55`,
        borderLeft: `3px solid ${PALETTE.purple}`,
        borderRadius: 10, padding: 12,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
      <header>
        <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.purple, fontWeight: 700, marginBottom: 4 }}>
          EXTRACTED INTELLIGENCE REVIEW
        </div>
        <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
          {edited.title}
        </div>
        <div style={{ fontSize: 10, color: PALETTE.textFaint, marginTop: 2 }}>
          Basket: <strong style={{ color: PALETTE.text }}>{basketProfile?.basketName || edited.basketId}</strong>
          {"  ·  "}Agent: <strong style={{ color: PALETTE.text }}>{edited.assignedAgent}</strong>
          {"  ·  "}Confidence: <strong style={{ color: PALETTE.text }}>{edited.confidence}</strong>
        </div>
      </header>

      {/* Title / thesis */}
      <Field label="Title">
        <input type="text" value={edited.title || ""}
          onChange={(e) => updateField(["title"], e.target.value)}
          style={inputStyle()} />
      </Field>
      <Field label="Core thesis claim">
        <textarea
          value={edited.thesis?.coreClaim || ""}
          onChange={(e) => updateField(["thesis", "coreClaim"], e.target.value)}
          rows={3}
          style={{ ...inputStyle(), fontFamily: "inherit" }} />
      </Field>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 6,
      }}>
        <Field label="Market frame">
          <input type="text" value={edited.thesis?.marketFrame || ""}
            onChange={(e) => updateField(["thesis", "marketFrame"], e.target.value)}
            style={inputStyle()} />
        </Field>
        <Field label="Company role">
          <input type="text" value={edited.thesis?.companyRole || ""}
            onChange={(e) => updateField(["thesis", "companyRole"], e.target.value)}
            style={inputStyle()} />
        </Field>
        <Field label="Basket role">
          <input type="text" value={edited.thesis?.basketRole || ""}
            onChange={(e) => updateField(["thesis", "basketRole"], e.target.value)}
            style={inputStyle()} />
        </Field>
      </div>

      {/* Entities */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 6,
      }}>
        <ListField label="Primary symbols"
          values={edited.entities?.primarySymbols || []}
          onChange={(arr) => updateField(["entities", "primarySymbols"], arr)} />
        <ListField label="Related symbols"
          values={edited.entities?.relatedSymbols || []}
          onChange={(arr) => updateField(["entities", "relatedSymbols"], arr)} />
        <ListField label="Private companies"
          values={edited.entities?.privateCompanies || []}
          onChange={(arr) => updateField(["entities", "privateCompanies"], arr)} />
      </div>

      {/* Risks + catalysts + tags */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 6,
      }}>
        <ListField label="Risks"
          values={edited.risks || []}
          onChange={(arr) => updateField(["risks"], arr)}
          tone={PALETTE.red} />
        <ListField label="Catalysts"
          values={edited.catalysts || []}
          onChange={(arr) => updateField(["catalysts"], arr)}
          tone={PALETTE.green} />
        <ListField label="Scanner tags"
          values={edited.scannerTags || []}
          onChange={(arr) => updateField(["scannerTags"], arr)}
          tone={PALETTE.cyan} />
      </div>

      {/* Suggested scanner additions */}
      {suggestedAdditions.length > 0 && (
        <section>
          <div style={{ fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint, fontWeight: 700, marginBottom: 4 }}>
            SUGGESTED SCANNER ADDITIONS
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {suggestedAdditions.map((row) => (
              <button key={row.symbol} type="button"
                onClick={() => onAddSymbolToBasket(row.symbol)}
                title={row.profile?.role || `Add ${row.symbol} to ${basketProfile?.basketName || edited.basketId}`}
                style={{
                  background: `${PALETTE.green}1a`,
                  border: `1px solid ${PALETTE.green}88`,
                  color: PALETTE.green,
                  borderRadius: 5, padding: "3px 8px",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                + {row.symbol}{row.profile?.tier ? ` · ${shortTier(row.profile.tier)}` : ""}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Approval actions */}
      <footer style={{
        display: "flex", gap: 6, flexWrap: "wrap",
        marginTop: 4, paddingTop: 8,
        borderTop: `1px solid ${PALETTE.borderSoft}`,
      }}>
        <button type="button" onClick={() => onSaveDraft(edited)} style={btn(PALETTE.amber)}>
          Save Draft
        </button>
        <button type="button" onClick={() => onApproveTemporary(edited)} style={btn(PALETTE.cyan)}>
          Use for One Scan Only
        </button>
        <button type="button" onClick={() => onPromoteToMemory(edited)} style={primaryBtn()}>
          Promote to Agent Memory
        </button>
        <button type="button" onClick={onReject} style={btn(PALETTE.textFaint)}>
          Reject
        </button>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

function ListField({ label, values, onChange, tone }) {
  const [pending, setPending] = useState("");
  const onAdd = () => {
    const v = (pending || "").trim();
    if (!v) return;
    onChange(Array.from(new Set([...(values || []), v])));
    setPending("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint, fontWeight: 700 }}>
        {label.toUpperCase()}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {(values || []).map((v, i) => (
          <span key={`${v}-${i}`} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10, color: tone || PALETTE.text,
            background: tone ? `${tone}1a` : PALETTE.cardBg,
            border: `1px solid ${tone ? `${tone}55` : PALETTE.borderSoft}`,
            borderRadius: 4, padding: "2px 6px",
          }}>
            {v}
            <button type="button"
              onClick={() => onChange((values || []).filter((x, j) => j !== i))}
              style={{
                background: "transparent", border: "none", padding: 0,
                cursor: "pointer", color: tone || PALETTE.textFaint, fontFamily: "inherit",
              }}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <input type="text" value={pending}
          onChange={(e) => setPending(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
          placeholder="add…"
          style={{ ...inputStyle(), flex: 1 }} />
        <button type="button" onClick={onAdd} style={btn(PALETTE.textFaint)}>+</button>
      </div>
    </div>
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

function shortTier(tier) {
  if (tier === "tier_1_pure_play")          return "T1";
  if (tier === "tier_2_incumbent_fortress") return "T2";
  if (tier === "tier_3_adjacency")          return "T3";
  return "";
}

function setIn(obj, path, value) {
  if (!Array.isArray(path) || path.length === 0) return obj;
  const next = JSON.parse(JSON.stringify(obj || {}));
  let cursor = next;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (cursor[k] == null || typeof cursor[k] !== "object") cursor[k] = {};
    cursor = cursor[k];
  }
  cursor[path[path.length - 1]] = value;
  return next;
}

function inputStyle() {
  return {
    background: PALETTE.panelBg, color: PALETTE.text,
    border: `1px solid ${PALETTE.border}`, borderRadius: 6,
    padding: "5px 8px", fontSize: 11, fontFamily: "inherit",
  };
}
function btn(color) {
  return {
    background: `${color}1a`, border: `1px solid ${color}88`, color,
    borderRadius: 5, padding: "4px 10px",
    fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
    cursor: "pointer", fontFamily: "inherit",
  };
}
function primaryBtn() {
  return {
    background: `${PALETTE.green}1a`,
    border: `1px solid ${PALETTE.green}88`,
    color: PALETTE.green,
    borderRadius: 6, padding: "4px 12px",
    fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
    cursor: "pointer", fontFamily: "inherit",
  };
}
