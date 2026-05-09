// =====================================================
// AD HOC TICKER SEARCH
// =====================================================
// Self-contained search box that lets the operator type any valid
// Polygon ticker and run TE / CV against it without editing the
// static catalog.
//
// Flow:
//   1. Operator types a symbol → presses Enter (or Search).
//   2. Component calls resolveTickerUniverse(symbol).
//   3a. CATALOGED  → emits onCataloged({ record }) so the host page
//                    can load its normal catalog analysis.
//   3b. UNCATALOGED → shows the "Ticker not found in static catalog.
//                     Run ad hoc simulation?" prompt with three
//                     buttons: Run Simulation / Add to Dynamic Basket
//                     / Dismiss.
//   4. After Run Simulation → shows TE + CV result sections plus an
//      action bar: Add to Dynamic Basket / Promote to Scanner /
//      Send to CV / Send to TE / Add Note.
//
// Hard rules:
//   - No raw scores or internal weights surface anywhere.
//   - Trader-facing language only.
//   - All persistence flows through dynamicUniverseStore so the
//     static catalog stays untouched.
// =====================================================

import React, { useCallback, useState } from "react";
import { resolveTickerUniverse } from "../../lib/universe/resolveTickerUniverse.js";
import { simulateAdHoc } from "../../lib/universe/adHocSimulationService.js";
import {
  upsertDynamicTicker,
  setScannerEligible,
} from "../../lib/universe/dynamicUniverseStore.js";
import {
  TICKER_SOURCE_TYPES,
  CATALOG_STATUS,
  normalizeSymbol,
} from "../../lib/universe/tickerUniverseTypes.js";
import { getPolygonDailyBars } from "../../lib/marketData/polygonBarsProvider.js";
import { getOptionsChain } from "../../lib/marketData/optionsChainProvider.js";
import {
  recordSimulation,
  updatePromotion,
} from "../../lib/universe/adHocSimulationHistoryStore.js";
import {
  initializeMarketIntelligenceForSymbol,
  buildIntelligenceInputsFromSim,
} from "../../lib/intelligence/newsIntelligenceService.js";
import MarketIntelligencePanel from "../intelligence/MarketIntelligencePanel.jsx";

const PALETTE = {
  bg:        "#0d1117",
  panel:     "#151719",
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
};

/**
 * @param {object} props
 * @param {(rec: object) => void} [props.onCataloged]      called when the symbol is in the static catalog
 * @param {(rec: object) => void} [props.onAddToBasket]    fires after upsert into dynamic basket
 * @param {(symbol: string) => void} [props.onSendToTE]    "Send to TE" action — host wires the navigation
 * @param {(symbol: string) => void} [props.onSendToCV]    "Send to CV" action
 * @param {(symbol: string) => void} [props.onPromote]     "Promote to Scanner" action (post-promote callback)
 * @param {string} [props.placeholder]
 * @param {string} [props.title]
 * @param {string} [props.compact]                         compact = "true" suppresses the ladder of action buttons
 */
export default function AdHocTickerSearch({
  onCataloged,
  onAddToBasket,
  onSendToTE,
  onSendToCV,
  onPromote,
  onHistoryChange,
  placeholder = "Ticker (any valid symbol)",
  title = "Ticker search",
  compact = false,
}) {
  const [input, setInput] = useState("");
  const [stage, setStage] = useState("idle");          // idle | prompt | running | result | cataloged
  const [resolvedRecord, setResolvedRecord] = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState("");
  // Track the history record id for the active simulation so the
  // promotion buttons can patch the same row instead of writing fresh
  // entries each click.
  const [historyId, setHistoryId] = useState(null);
  // Market Intelligence layer — additive panel rendered below the
  // TE/CV blocks. Loads after the simulation completes; failures are
  // isolated so the simulation result stays usable.
  const [intelligenceResult, setIntelligenceResult] = useState(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState(null);

  const reset = () => {
    setStage("idle");
    setResolvedRecord(null);
    setSimResult(null);
    setError(null);
    setNote("");
    setHistoryId(null);
    setIntelligenceResult(null);
    setIntelligenceLoading(false);
    setIntelligenceError(null);
  };

  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault?.();
    const sym = normalizeSymbol(input);
    if (!sym) {
      setError("Enter a valid ticker (1-10 letters, optional . or -).");
      return;
    }
    setError(null);
    const rec = resolveTickerUniverse(sym);
    setResolvedRecord(rec);

    if (rec.catalogStatus === CATALOG_STATUS.CATALOGED) {
      setStage("cataloged");
      onCataloged && onCataloged(rec);
      return;
    }
    setStage("prompt");
  }, [input, onCataloged]);

  const handleRunSim = useCallback(async () => {
    if (!resolvedRecord) return;
    setStage("running");
    setError(null);
    try {
      // Quote-only path is always attempted; bars upgrade the
      // structural snapshot when Polygon daily aggregates respond.
      // persist:false — running a simulation never writes to the
      // dynamic basket on its own. Explicit "Add to Basket" / "Promote
      // to Scanner" actions handle persistence below.
      const result = await simulateAdHoc(resolvedRecord.symbol, {
        persist: false,
        providers: {
          fetchBars: (sym) => getPolygonDailyBars(sym, { lookbackDays: 90 }),
          fetchOptionsChain: (sym) =>
            getOptionsChain(sym, { expirationRangeDays: 45, optionType: "put" }),
        },
      });
      setSimResult(result);
      // Always record into history (independent of dynamic-store
      // persistence) so the operator can review even limited / no-data
      // simulations later.
      try {
        const rec = recordSimulation(result);
        if (rec?.id) setHistoryId(rec.id);
        if (typeof onHistoryChange === "function") onHistoryChange();
      } catch { /* history is best-effort */ }
      setStage("result");

      // Kick off the Market Intelligence load. Defaults to the rules-
      // based fallback (useLLM=false) so the panel shows useful copy
      // even without a Vertex provider configured. Failures are
      // isolated — the TE/CV simulation result stays usable.
      setIntelligenceLoading(true);
      setIntelligenceError(null);
      setIntelligenceResult(null);
      const inputs = buildIntelligenceInputsFromSim(result);
      if (inputs) {
        initializeMarketIntelligenceForSymbol({ ...inputs, useLLM: false })
          .then((intel) => {
            setIntelligenceResult(intel);
            setIntelligenceLoading(false);
          })
          .catch((err) => {
            setIntelligenceError(err?.message || "Market intelligence failed.");
            setIntelligenceLoading(false);
          });
      } else {
        setIntelligenceLoading(false);
      }
    } catch (err) {
      setError(err?.message || "Simulation failed.");
      setStage("prompt");
    }
  }, [resolvedRecord]);

  const handleAddToBasket = useCallback(() => {
    if (!resolvedRecord) return;
    const rec = upsertDynamicTicker({
      symbol: resolvedRecord.symbol,
      sourceType: TICKER_SOURCE_TYPES.DYNAMIC_BASKET,
      addedReason: "manual_add",
      notes: note || null,
    });
    if (historyId) {
      try { updatePromotion(historyId, { addedToBasket: true }); } catch { /* best-effort */ }
      if (typeof onHistoryChange === "function") onHistoryChange();
    }
    onAddToBasket && onAddToBasket(rec);
  }, [resolvedRecord, note, onAddToBasket, historyId, onHistoryChange]);

  const handlePromote = useCallback(() => {
    if (!resolvedRecord) return;
    setScannerEligible(resolvedRecord.symbol, true);
    if (historyId) {
      try { updatePromotion(historyId, { promotedToScanner: true, addedToBasket: true }); } catch { /* best-effort */ }
      if (typeof onHistoryChange === "function") onHistoryChange();
    }
    onPromote && onPromote(resolvedRecord.symbol);
  }, [resolvedRecord, onPromote, historyId, onHistoryChange]);

  const handleAddNote = useCallback(() => {
    if (!resolvedRecord || !note.trim()) return;
    upsertDynamicTicker({
      symbol: resolvedRecord.symbol,
      notes: note.trim(),
    });
    setNote("");
  }, [resolvedRecord, note]);

  const handleSendToTE = useCallback(() => {
    if (!simResult) return;
    if (historyId) {
      try { updatePromotion(historyId, { sentToTE: true }); } catch { /* best-effort */ }
      if (typeof onHistoryChange === "function") onHistoryChange();
    }
    onSendToTE && onSendToTE(simResult.symbol);
  }, [simResult, onSendToTE, historyId, onHistoryChange]);

  const handleSendToCV = useCallback(() => {
    if (!simResult) return;
    if (historyId) {
      try { updatePromotion(historyId, { sentToCV: true }); } catch { /* best-effort */ }
      if (typeof onHistoryChange === "function") onHistoryChange();
    }
    onSendToCV && onSendToCV(simResult.symbol);
  }, [simResult, onSendToCV, historyId, onHistoryChange]);

  return (
    <section style={{
      background: PALETTE.bg, border: `1px solid ${PALETTE.border}`,
      borderRadius: 10, padding: 14,
    }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim, marginBottom: 8,
      }}>
        {title.toUpperCase()}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          style={{
            flex: 1, minWidth: 0,
            background: "#0a0d12", color: PALETTE.text,
            border: `1px solid ${PALETTE.border}`, borderRadius: 6,
            padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
            letterSpacing: "0.04em", textTransform: "uppercase",
          }} />
        <button type="submit"
          style={btn(PALETTE.accentTeal)}>
          Search
        </button>
      </form>

      {error && (
        <div style={{ marginTop: 8, fontSize: 11, color: PALETTE.red }}>
          {error}
        </div>
      )}

      {/* CATALOGED — host page picks it up; we just show a confirmation. */}
      {stage === "cataloged" && resolvedRecord && (
        <CatalogPanel record={resolvedRecord} onReset={reset} />
      )}

      {/* UNCATALOGED PROMPT */}
      {stage === "prompt" && resolvedRecord && (
        <UncatalogedPrompt
          record={resolvedRecord}
          onRunSim={handleRunSim}
          onAddToBasket={handleAddToBasket}
          onDismiss={reset} />
      )}

      {/* RUNNING */}
      {stage === "running" && (
        <div style={{ marginTop: 12, fontSize: 12, color: PALETTE.cyan }}>
          Running ad hoc simulation for {resolvedRecord?.symbol}…
        </div>
      )}

      {/* RESULT */}
      {stage === "result" && simResult && (
        <SimResultPanel
          result={simResult}
          note={note}
          setNote={setNote}
          onAddToBasket={handleAddToBasket}
          onPromote={handlePromote}
          onSendToTE={handleSendToTE}
          onSendToCV={handleSendToCV}
          onAddNote={handleAddNote}
          onReset={reset}
          compact={compact}
          intelligenceResult={intelligenceResult}
          intelligenceLoading={intelligenceLoading}
          intelligenceError={intelligenceError} />
      )}
    </section>
  );
}

// ----------------------------------------------------------------
// CATALOGED — small confirmation block
// ----------------------------------------------------------------

function CatalogPanel({ record, onReset }) {
  const meta = record.catalogMeta || {};
  return (
    <div style={panelBox(PALETTE.green)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: PALETTE.text }}>
          <strong>{record.symbol}</strong> is in the static catalog. Loading normal analysis.
        </div>
        <button onClick={onReset} style={btnGhost()}>Clear</button>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: PALETTE.textDim }}>
        {meta.tier ? `Tier T${meta.tier}` : null}
        {meta.spreadQuality ? `  ·  Spread ${meta.spreadQuality}` : null}
        {meta.wheelSuit ? `  ·  Wheel ${meta.wheelSuit}` : null}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// UNCATALOGED PROMPT
// ----------------------------------------------------------------

function UncatalogedPrompt({ record, onRunSim, onAddToBasket, onDismiss }) {
  return (
    <div style={panelBox(PALETTE.amber)}>
      <div style={{ fontSize: 12, color: PALETTE.text, marginBottom: 8 }}>
        <strong>{record.symbol}</strong> not found in static catalog. Run ad hoc simulation?
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={onRunSim} style={btn(PALETTE.accentTeal)}>Run Simulation</button>
        <button onClick={onAddToBasket} style={btn(PALETTE.green)}>Add to Dynamic Basket</button>
        <button onClick={onDismiss} style={btnGhost()}>Dismiss</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// SIM RESULT PANEL
// ----------------------------------------------------------------

function SimResultPanel({
  result, note, setNote,
  onAddToBasket, onPromote, onSendToTE, onSendToCV, onAddNote, onReset,
  compact,
  intelligenceResult = null,
  intelligenceLoading = false,
  intelligenceError = null,
}) {
  const te = result.triggerEngine;
  const cv = result.creditView;
  const da = result.dataAvailability;
  const dataLabel = result.dataAvailabilityLabel || "—";
  const badgeColor = dataLabel === "Quote + bars" ? PALETTE.green
                   : dataLabel === "Quote only"   ? PALETTE.amber
                   : dataLabel === "Bars only"    ? PALETTE.cyan
                   :                                 PALETTE.red;

  // Separate CV badge — "Options available" / "Credit limited" — so the
  // operator can read the credit-side data status independently of the
  // TE data badge.
  const cvLabel = result.creditViewBadge
    || (cv?.limited === false ? "Options available" : "Credit limited");
  const cvBadgeColor = cvLabel === "Options available" ? PALETTE.green : PALETTE.amber;

  return (
    <div style={panelBox(PALETTE.accentTeal)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: PALETTE.accentTeal }}>
            {result.symbol}
          </span>
          <span title="Polygon market-data quality"
            style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              color: badgeColor,
              background: `${badgeColor}1a`,
              border: `1px solid ${badgeColor}55`,
              borderRadius: 4, padding: "2px 6px",
            }}>
            {dataLabel}
          </span>
          <span title="Credit View options-data status"
            style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              color: cvBadgeColor,
              background: `${cvBadgeColor}1a`,
              border: `1px solid ${cvBadgeColor}55`,
              borderRadius: 4, padding: "2px 6px",
            }}>
            {cvLabel}
          </span>
        </div>
        <div style={{ fontSize: 9, color: PALETTE.textDim, letterSpacing: "0.08em" }}>
          {result.analysisMode.replace(/_/g, " ").toUpperCase()}
        </div>
      </div>

      {/* Safe-failure banner — when both quote and bars failed and no
          options chain is present. Surfaces a single clear message
          instead of two separate "limited" sections below. */}
      {result.noMarketData && (
        <div style={{
          marginTop: 8, padding: 8,
          background: `${PALETTE.red}10`,
          border: `1px solid ${PALETTE.red}55`,
          borderRadius: 6, fontSize: 11, color: PALETTE.red, lineHeight: 1.5,
        }}>
          Ad hoc TE simulation unavailable: Polygon quote/history data could not be loaded.
        </div>
      )}

      <div style={{ marginTop: 6, fontSize: 10, color: PALETTE.textFaint }}>
        Quote {boolDot(da.polygonQuote)}  ·  Bars {boolDot(da.polygonBars)}  ·
        {" "}Options {boolDot(da.optionsChain)}
      </div>

      <Section label="Trigger Engine">
        {te.ok ? (
          <>
            <div style={{ fontSize: 11, color: PALETTE.textDim, marginBottom: 4 }}>
              {te.label}{te.limited ? "  (limited)" : ""}
            </div>
            <KV row label="Price"          value={fmt$(te.result?.price)} />
            <KV row label="Prev close"     value={fmt$(te.result?.previousClose)} />
            <KV row label="% change"       value={fmtPct(te.result?.percentChange)} />
            <KV row label="Trend bias"     value={te.result?.structure?.trendBias || "—"} />
            <KV row label="Support"        value={fmt$(te.result?.structure?.support)} />
            <KV row label="Resistance"     value={fmt$(te.result?.structure?.resistance)} />
            <KV row label="ATR (avg)"      value={fmt$(te.result?.structure?.atr)} />
            <div style={{ marginTop: 6, fontSize: 10, color: PALETTE.textFaint, fontStyle: "italic" }}>
              {te.result?.note}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: PALETTE.amber }}>
            {te.reason || "Trigger Engine simulation skipped."}
          </div>
        )}
      </Section>

      <Section label="Credit View">
        {cv.limited ? (
          <div style={{ fontSize: 11, color: PALETTE.amber, lineHeight: 1.5 }}>
            {cv.reason}
          </div>
        ) : (
          <CreditViewBlock cv={cv} />
        )}
      </Section>

      {/* MARKET INTELLIGENCE — additive panel below CV. Loading /
          error / fallback copy are all rendered without breaking the
          TE/CV layout above. */}
      <Section label="Market Intelligence">
        <IntelligenceBlock
          result={intelligenceResult}
          loading={intelligenceLoading}
          error={intelligenceError} />
      </Section>

      {!compact && (
        <ActionBar
          note={note} setNote={setNote}
          onAddToBasket={onAddToBasket}
          onPromote={onPromote}
          onSendToTE={onSendToTE}
          onSendToCV={onSendToCV}
          onAddNote={onAddNote}
          onReset={onReset} />
      )}
    </div>
  );
}

function ActionBar({ note, setNote, onAddToBasket, onPromote, onSendToTE, onSendToCV, onAddNote, onReset }) {
  return (
    <div style={{
      marginTop: 10, paddingTop: 10,
      borderTop: `1px solid ${PALETTE.borderSoft}`,
    }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={onAddToBasket} style={btn(PALETTE.green)}>Add to Dynamic Basket</button>
        <button onClick={onPromote}     style={btn(PALETTE.cyan)}>Promote to Scanner</button>
        <button onClick={onSendToCV}    style={btnGhost()}>Send to Credit View</button>
        <button onClick={onSendToTE}    style={btnGhost()}>Send to Trigger Engine</button>
        <button onClick={onReset}       style={btnGhost()}>Clear</button>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (e.g., earnings tomorrow, watching $24.40 support)…"
          style={{
            flex: 1, minWidth: 0,
            background: "#0a0d12", color: PALETTE.text,
            border: `1px solid ${PALETTE.border}`, borderRadius: 6,
            padding: "6px 8px", fontSize: 12, fontFamily: "inherit",
          }} />
        <button onClick={onAddNote} style={btnGhost()}>Add Note</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// INTELLIGENCE BLOCK — Market Intelligence panel + states
// ----------------------------------------------------------------
// Wraps the standalone <MarketIntelligencePanel /> with loading /
// error / fallback states. Failures here never bubble into the TE/CV
// simulation result above.

function IntelligenceBlock({ result, loading, error }) {
  if (loading) {
    return (
      <div style={{ fontSize: 11, color: PALETTE.cyan, fontStyle: "italic" }}>
        Loading market intelligence…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ fontSize: 11, color: PALETTE.amber, lineHeight: 1.5 }}>
        Market intelligence unavailable — using rules-based fallback.
      </div>
    );
  }
  if (!result) {
    return (
      <div style={{ fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic" }}>
        No market intelligence read available yet.
      </div>
    );
  }
  return <MarketIntelligencePanel result={result} />;
}

// ----------------------------------------------------------------
// CREDIT VIEW BLOCK — recommendation + structured fields
// ----------------------------------------------------------------
// Renders the ad-hoc Credit Simulation when the chain provider returned
// usable contracts. All copy comes from buildCreditViewNarrative() so
// raw scores / weights never surface in the UI.

function CreditViewBlock({ cv }) {
  const r = cv?.result || null;
  const candidate = cv?.candidate || null;
  return (
    <div>
      <div style={{ fontSize: 11, color: PALETTE.textDim, marginBottom: 6 }}>
        {cv.label}
      </div>

      {r?.recommendation?.label && (
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
          color: PALETTE.accentTeal, marginBottom: 6,
        }}>
          {r.recommendation.label}
        </div>
      )}

      {r?.triggerSentence && (
        <KV label="Trigger" value={r.triggerSentence} />
      )}

      {r?.bestStrikeZone?.label && (
        <KV label="Preferred strike zone" value={r.bestStrikeZone.label} row />
      )}
      {r?.minimumPremium?.label && (
        <KV label="Premium floor" value={r.minimumPremium.label} row />
      )}
      {candidate?.expiration && (
        <KV
          label="Candidate"
          row
          value={`${candidate.expiration} · $${fmt(candidate.strike)} put · mid $${fmt(candidate.mid)} (${candidate.spreadClass || "—"})`} />
      )}

      {r?.confirmation?.sentence && (
        <div style={{ marginTop: 8, fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
          <strong style={{ color: PALETTE.green }}>Confirmation: </strong>
          {r.confirmation.sentence}
        </div>
      )}
      {r?.invalidation?.sentence && (
        <div style={{ marginTop: 6, fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
          <strong style={{ color: PALETTE.red }}>Invalidation: </strong>
          {r.invalidation.sentence}
        </div>
      )}
      {r?.managementNote && (
        <div style={{ marginTop: 6, fontSize: 11, color: PALETTE.textDim, fontStyle: "italic", lineHeight: 1.5 }}>
          {r.managementNote}
        </div>
      )}
      {r?.riskNarrative && (
        <div style={{
          marginTop: 8, paddingTop: 8,
          borderTop: `1px solid ${PALETTE.borderSoft}`,
          fontSize: 11, color: PALETTE.textDim, lineHeight: 1.55,
        }}>
          {r.riskNarrative}
        </div>
      )}

      {Array.isArray(cv.warnings) && cv.warnings.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 9, color: PALETTE.textFaint }}>
          {cv.warnings.join(" · ")}
        </div>
      )}
    </div>
  );
}

function fmt(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toFixed(2);
}

// ----------------------------------------------------------------
// PRIMITIVES
// ----------------------------------------------------------------

function Section({ label, children }) {
  return (
    <div style={{
      marginTop: 10, paddingTop: 10,
      borderTop: `1px solid ${PALETTE.borderSoft}`,
    }}>
      <div style={{ fontSize: 9, letterSpacing: "0.12em", color: PALETTE.textDim, marginBottom: 6 }}>
        {label.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function KV({ label, value, row = false }) {
  return (
    <div style={{
      display: row ? "flex" : "block",
      justifyContent: row ? "space-between" : "initial",
      gap: 8, padding: "1px 0",
      fontSize: 11,
    }}>
      <span style={{ color: PALETTE.textDim }}>{label}</span>
      <span style={{ color: PALETTE.text, fontFeatureSettings: "'tnum'" }}>{value ?? "—"}</span>
    </div>
  );
}

function boolDot(v) {
  return (
    <span style={{
      display: "inline-block", width: 6, height: 6, borderRadius: "50%",
      background: v ? PALETTE.green : "#1e2530", marginLeft: 4, marginRight: 4,
    }} aria-label={v ? "available" : "unavailable"} />
  );
}

function panelBox(borderColor) {
  return {
    marginTop: 10, padding: 10,
    background: "#0a0d12",
    border: `1px solid ${borderColor}55`,
    borderRadius: 8,
  };
}

function btn(color) {
  return {
    background: `${color}1a`, border: `1px solid ${color}88`, color,
    borderRadius: 6, padding: "6px 10px", fontSize: 11,
    fontWeight: 700, letterSpacing: "0.04em", cursor: "pointer",
  };
}

function btnGhost() {
  return {
    background: "transparent",
    border: `1px solid ${PALETTE.border}`, color: PALETTE.textDim,
    borderRadius: 6, padding: "6px 10px", fontSize: 11,
    fontWeight: 700, letterSpacing: "0.04em", cursor: "pointer",
  };
}

function fmt$(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `$${Number(v).toFixed(2)}`;
}
function fmtPct(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
