// =====================================================
// AD HOC SIMULATION HISTORY
// =====================================================
// Compact panel that surfaces the recent ad-hoc simulations the
// operator has run, plus a manual-calibration outcome for each row
// and a small summary card across the top.
//
// Pure presentational + thin reads/writes through the history store.
// No raw scores or weights surface here — every label comes from the
// snapshotted result fields.
// =====================================================

import React, { useCallback, useEffect, useState } from "react";
import {
  listHistory,
  updateOutcome,
  setNotes,
  deleteHistory,
  clearHistory,
  getCalibrationSummary,
  HISTORY_OUTCOMES,
} from "../../lib/universe/adHocSimulationHistoryStore.js";

const PALETTE = {
  bg:        "#0d1117",
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

const OUTCOME_LABELS = {
  [HISTORY_OUTCOMES.UNREVIEWED]:        "Outcome not reviewed",
  [HISTORY_OUTCOMES.WATCH]:             "Watching",
  [HISTORY_OUTCOMES.PROFITABLE]:        "Profitable",
  [HISTORY_OUTCOMES.MISSED_WINNER]:     "Missed winner",
  [HISTORY_OUTCOMES.INVALIDATED]:       "Invalidated",
  [HISTORY_OUTCOMES.AVOIDED_CORRECTLY]: "Avoided correctly",
  [HISTORY_OUTCOMES.POOR_LIQUIDITY]:    "Poor liquidity",
  [HISTORY_OUTCOMES.NO_FOLLOW_THROUGH]: "No follow-through",
  [HISTORY_OUTCOMES.PROMOTED]:          "Promoted",
};

const OUTCOME_TONES = {
  [HISTORY_OUTCOMES.PROFITABLE]:        PALETTE.green,
  [HISTORY_OUTCOMES.AVOIDED_CORRECTLY]: PALETTE.green,
  [HISTORY_OUTCOMES.PROMOTED]:          PALETTE.cyan,
  [HISTORY_OUTCOMES.WATCH]:             PALETTE.amber,
  [HISTORY_OUTCOMES.MISSED_WINNER]:     PALETTE.amber,
  [HISTORY_OUTCOMES.NO_FOLLOW_THROUGH]: PALETTE.amber,
  [HISTORY_OUTCOMES.INVALIDATED]:       PALETTE.red,
  [HISTORY_OUTCOMES.POOR_LIQUIDITY]:    PALETTE.red,
  [HISTORY_OUTCOMES.UNREVIEWED]:        PALETTE.textFaint,
};

/**
 * @param {object} props
 * @param {number} [props.refreshTick]                     bumped to force reload
 * @param {(symbol: string) => void} [props.onSendToTE]
 * @param {(symbol: string) => void} [props.onSendToCV]
 * @param {number} [props.limit=20]
 */
export default function AdHocSimulationHistory({
  refreshTick = 0,
  onSendToTE,
  onSendToCV,
  limit = 20,
}) {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(() => emptySummary());
  const [filterSymbol, setFilterSymbol] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const reload = useCallback(() => {
    try {
      setRecords(listHistory({ limit }));
      setSummary(getCalibrationSummary());
    } catch {
      setRecords([]);
      setSummary(emptySummary());
    }
  }, [limit]);

  useEffect(() => { reload(); }, [reload, refreshTick]);

  const handleOutcome = useCallback((id, status) => {
    updateOutcome(id, { status });
    reload();
  }, [reload]);

  const handleDelete = useCallback((id) => {
    if (!confirmDelete()) return;
    deleteHistory(id);
    reload();
  }, [reload]);

  const handleClear = useCallback(() => {
    if (!confirmClearAll()) return;
    clearHistory();
    reload();
  }, [reload]);

  const filtered = records
    .filter((r) => !filterSymbol || r.symbol.includes(filterSymbol.toUpperCase()))
    .filter((r) => !filterStatus || r.outcome?.status === filterStatus);

  return (
    <section style={panel}>
      <Header
        total={summary.total}
        onClear={handleClear}
        filterSymbol={filterSymbol}
        setFilterSymbol={setFilterSymbol}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus} />

      <CalibrationSummary summary={summary} />

      {filtered.length === 0 ? (
        <div style={{ padding: "16px 4px", fontSize: 11, color: PALETTE.textFaint }}>
          {records.length === 0
            ? "Recent ad hoc research will appear here. Run an ad hoc simulation to start populating the history."
            : "No matching records — adjust the filters above."}
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {filtered.map((rec) => (
            <Row
              key={rec.id}
              rec={rec}
              onOutcome={(status) => handleOutcome(rec.id, status)}
              onDelete={() => handleDelete(rec.id)}
              onSendToTE={onSendToTE ? () => onSendToTE(rec.symbol) : null}
              onSendToCV={onSendToCV ? () => onSendToCV(rec.symbol) : null}
              onSaveNote={(text) => { setNotes(rec.id, text); reload(); }} />
          ))}
        </ul>
      )}
    </section>
  );
}

// --------------------------------------------------
// Header — title + filters + Clear All
// --------------------------------------------------

function Header({ total, onClear, filterSymbol, setFilterSymbol, filterStatus, setFilterStatus }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${PALETTE.borderSoft}`,
      gap: 8, flexWrap: "wrap",
    }}>
      <div>
        <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim }}>
          SIMULATION HISTORY
        </div>
        <div style={{ fontSize: 9, color: PALETTE.textFaint, marginTop: 2 }}>
          Recent ad hoc research · {total} {total === 1 ? "entry" : "entries"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          value={filterSymbol}
          onChange={(e) => setFilterSymbol(e.target.value)}
          placeholder="Filter symbol"
          spellCheck={false}
          style={{
            background: "#0a0d12", color: PALETTE.text,
            border: `1px solid ${PALETTE.border}`, borderRadius: 6,
            padding: "4px 8px", fontSize: 10, fontFamily: "inherit",
            letterSpacing: "0.04em", textTransform: "uppercase",
            width: 96,
          }} />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            background: "#0a0d12", color: PALETTE.text,
            border: `1px solid ${PALETTE.border}`, borderRadius: 6,
            padding: "4px 6px", fontSize: 10, fontFamily: "inherit",
          }}>
          <option value="">All outcomes</option>
          {Object.values(HISTORY_OUTCOMES).map((s) => (
            <option key={s} value={s}>{OUTCOME_LABELS[s] || s}</option>
          ))}
        </select>
        {total > 0 && (
          <button onClick={onClear}
            style={{
              background: "transparent", border: `1px solid ${PALETTE.red}55`,
              color: PALETTE.red, borderRadius: 6, padding: "4px 8px",
              fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer",
            }}>
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------
// Calibration summary chips
// --------------------------------------------------

function CalibrationSummary({ summary }) {
  const chips = [
    { label: "Total",              value: summary.total,             tone: PALETTE.text },
    { label: "Options available",  value: summary.optionsAvailable,  tone: PALETTE.green },
    { label: "Added to basket",    value: summary.addedToBasket,     tone: PALETTE.accentTeal },
    { label: "Promoted",           value: summary.promotedToScanner, tone: PALETTE.cyan },
    { label: "Profitable",         value: summary.profitable,        tone: PALETTE.green },
    { label: "Missed winner",      value: summary.missedWinner,      tone: PALETTE.amber },
    { label: "Invalidated",        value: summary.invalidated,       tone: PALETTE.red },
    { label: "Avoided correctly",  value: summary.avoidedCorrectly,  tone: PALETTE.green },
  ];
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
      gap: 6, marginBottom: 10,
    }}>
      {chips.map((c) => (
        <div key={c.label} style={{
          background: "#0a0d12",
          border: `1px solid ${c.tone}33`,
          borderRadius: 6, padding: "6px 8px",
          display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6,
        }}>
          <span style={{ fontSize: 9, letterSpacing: "0.08em", color: PALETTE.textDim }}>
            {c.label.toUpperCase()}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: c.tone, fontFeatureSettings: "'tnum'" }}>
            {c.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------
// History row
// --------------------------------------------------

function Row({ rec, onOutcome, onDelete, onSendToTE, onSendToCV, onSaveNote }) {
  const [open, setOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(rec.notes || "");

  const cv = rec.cvSnapshot || {};
  const te = rec.teSnapshot || {};
  const promo = rec.promotionState || {};
  const status = rec.outcome?.status || HISTORY_OUTCOMES.UNREVIEWED;

  return (
    <li style={{
      borderBottom: `1px solid ${PALETTE.borderSoft}`,
      padding: "8px 0",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            background: "transparent", border: "none",
            color: PALETTE.accentTeal, fontWeight: 700,
            fontSize: 13, letterSpacing: "0.04em", cursor: "pointer",
            padding: 0, fontFamily: "inherit",
          }}>
          {open ? "▾" : "▸"} {rec.symbol}
        </button>
        <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
          {fmtTime(rec.createdAt)}
        </span>
        <DataBadge label="TE" available={te.available} />
        <DataBadge label="CV" available={cv.available} />
        {cv.recommendationLabel && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: PALETTE.accentTeal,
            background: `${PALETTE.accentTeal}1a`,
            border: `1px solid ${PALETTE.accentTeal}55`,
            borderRadius: 4, padding: "2px 6px",
          }}>
            {cv.recommendationLabel}
          </span>
        )}
        {Number.isFinite(cv.preferredStrike) && (
          <span style={{ fontSize: 10, color: PALETTE.textDim }}>
            ${fmt(cv.preferredStrike)}{cv.expiration ? ` ${cv.expiration}` : ""}
            {cv.premiumMid != null ? `  ·  $${fmt(cv.premiumMid)}` : ""}
          </span>
        )}
        {promo.addedToBasket && (
          <PromoChip label="Added to basket" tone={PALETTE.accentTeal} />
        )}
        {promo.promotedToScanner && (
          <PromoChip label="Promoted to scanner" tone={PALETTE.cyan} />
        )}
        <span style={{
          marginLeft: "auto", fontSize: 10, fontWeight: 700,
          color: OUTCOME_TONES[status] || PALETTE.textFaint,
          letterSpacing: "0.04em",
        }}>
          {OUTCOME_LABELS[status] || status}
        </span>
      </div>

      {open && (
        <div style={{
          marginTop: 8, padding: "8px 10px",
          background: "#0a0d12",
          border: `1px solid ${PALETTE.borderSoft}`,
          borderRadius: 6,
        }}>
          <DetailGrid te={te} cv={cv} />
          {cv.confirmationSentence && (
            <Sentence label="Confirmation" tone={PALETTE.green} text={cv.confirmationSentence} />
          )}
          {cv.invalidationSentence && (
            <Sentence label="Invalidation" tone={PALETTE.red} text={cv.invalidationSentence} />
          )}
          {cv.managementNote && (
            <div style={{ marginTop: 6, fontSize: 11, color: PALETTE.textDim, fontStyle: "italic", lineHeight: 1.5 }}>
              {cv.managementNote}
            </div>
          )}

          <OutcomePicker current={status} onPick={onOutcome} />

          <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "stretch" }}>
            <input
              type="text"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add a note (optional)"
              style={{
                flex: 1, minWidth: 0,
                background: "#06090e", color: PALETTE.text,
                border: `1px solid ${PALETTE.border}`, borderRadius: 6,
                padding: "4px 8px", fontSize: 11, fontFamily: "inherit",
              }} />
            <button
              onClick={() => onSaveNote(noteDraft.trim() || null)}
              style={btn(PALETTE.cyan)}>
              Save note
            </button>
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {onSendToTE && (
              <button onClick={onSendToTE} style={btn(PALETTE.cyan)}>Send to TE</button>
            )}
            {onSendToCV && (
              <button onClick={onSendToCV} style={btn(PALETTE.cyan)}>Send to CV</button>
            )}
            <button onClick={onDelete} style={btn(PALETTE.red)}>Delete</button>
          </div>
        </div>
      )}
    </li>
  );
}

function DataBadge({ label, available }) {
  const tone = available ? PALETTE.green : PALETTE.textFaint;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
      color: tone, background: `${tone}1a`,
      border: `1px solid ${tone}55`, borderRadius: 4, padding: "2px 5px",
    }}>
      {label} {available ? "✓" : "—"}
    </span>
  );
}

function PromoChip({ label, tone }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
      color: tone, background: `${tone}1a`,
      border: `1px solid ${tone}55`, borderRadius: 4, padding: "2px 6px",
    }}>
      {label}
    </span>
  );
}

function Sentence({ label, tone, text }) {
  return (
    <div style={{ marginTop: 6, fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
      <strong style={{ color: tone }}>{label}: </strong>
      {text}
    </div>
  );
}

function DetailGrid({ te, cv }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      gap: 6, marginBottom: 6,
    }}>
      <KV label="Price"          value={te.price != null ? `$${fmt(te.price)}` : "—"} />
      <KV label="% change"       value={fmtPct(te.percentChange)} />
      <KV label="Trend"          value={te.trend || "—"} />
      <KV label="Support"        value={te.support != null ? `$${fmt(te.support)}` : "—"} />
      <KV label="Resistance"     value={te.resistance != null ? `$${fmt(te.resistance)}` : "—"} />
      <KV label="ATR"            value={te.atr != null ? `$${fmt(te.atr)}` : "—"} />
      <KV label="Strike"         value={cv.preferredStrike != null ? `$${fmt(cv.preferredStrike)}` : "—"} />
      <KV label="Expiration"     value={cv.expiration || "—"} />
      <KV label="Premium mid"    value={cv.premiumMid != null ? `$${fmt(cv.premiumMid)}` : "—"} />
      <KV label="Premium floor"  value={cv.premiumFloor != null ? `$${fmt(cv.premiumFloor)}` : "—"} />
      <KV label="Spread"         value={cv.spreadGrade || cv.spreadClass || "—"} />
      <KV label="Credit View"    value={cv.creditViewBadge || "—"} />
    </div>
  );
}

function KV({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 8, letterSpacing: "0.10em", color: PALETTE.textFaint }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 11, color: PALETTE.text, fontFeatureSettings: "'tnum'" }}>
        {value}
      </div>
    </div>
  );
}

function OutcomePicker({ current, onPick }) {
  const options = [
    HISTORY_OUTCOMES.PROFITABLE,
    HISTORY_OUTCOMES.AVOIDED_CORRECTLY,
    HISTORY_OUTCOMES.MISSED_WINNER,
    HISTORY_OUTCOMES.INVALIDATED,
    HISTORY_OUTCOMES.POOR_LIQUIDITY,
    HISTORY_OUTCOMES.NO_FOLLOW_THROUGH,
    HISTORY_OUTCOMES.WATCH,
    HISTORY_OUTCOMES.UNREVIEWED,
  ];
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textDim, marginBottom: 4 }}>
        MARK OUTCOME
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {options.map((opt) => {
          const tone = OUTCOME_TONES[opt] || PALETTE.textFaint;
          const active = opt === current;
          return (
            <button key={opt}
              onClick={() => onPick(opt)}
              style={{
                background: active ? `${tone}33` : "transparent",
                border: `1px solid ${active ? tone : `${tone}55`}`,
                color: tone,
                borderRadius: 6, padding: "3px 8px",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {OUTCOME_LABELS[opt] || opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function fmt(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toFixed(2);
}
function fmtPct(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtTime(ms) {
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function emptySummary() {
  return {
    total: 0, optionsAvailable: 0, addedToBasket: 0,
    promotedToScanner: 0, profitable: 0, missedWinner: 0,
    invalidated: 0, avoidedCorrectly: 0, poorLiquidity: 0,
    noFollowThrough: 0, unreviewed: 0,
  };
}

function btn(color) {
  return {
    background: `${color}1a`, border: `1px solid ${color}88`, color,
    borderRadius: 6, padding: "4px 10px",
    fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
    cursor: "pointer", fontFamily: "inherit",
  };
}

function confirmDelete() {
  try { return globalThis.confirm ? globalThis.confirm("Delete this history record?") : true; }
  catch { return true; }
}
function confirmClearAll() {
  try { return globalThis.confirm ? globalThis.confirm("Clear all simulation history?") : true; }
  catch { return true; }
}

const panel = {
  background: PALETTE.bg, border: `1px solid ${PALETTE.border}`,
  borderRadius: 10, padding: 12,
};
