// =====================================================
// DYNAMIC BASKET MANAGER
// =====================================================
// Compact table of dynamic-basket / LB-prospect / ad-hoc records the
// operator has accumulated. Each row supports:
//   - Promote / unpromote (toggles scannerEligible)
//   - Add / remove tag
//   - Edit note
//   - Remove from basket
//
// Reads + writes go through dynamicUniverseStore so the static catalog
// stays untouched. Pure presentational where it can be — local UI
// state is just the row currently being edited.
// =====================================================

import React, { useCallback, useEffect, useState } from "react";
import {
  listDynamicTickers,
  removeDynamicTicker,
  setScannerEligible,
  addBasketTag,
  removeBasketTag,
  upsertDynamicTicker,
} from "../../lib/universe/dynamicUniverseStore.js";
import {
  TICKER_SOURCE_TYPES,
  CATALOG_STATUS,
} from "../../lib/universe/tickerUniverseTypes.js";

const PALETTE = {
  bg: "#0d1117", border: "#1e2530", borderSoft: "#21252a",
  text: "#e2e8f0", textDim: "#9ca3af", textFaint: "#6b7280",
  accentTeal: "#14b8a6", green: "#22c55e", red: "#ef4444",
  amber: "#f59e0b", cyan: "#06b6d4",
};

/**
 * @param {object} props
 * @param {(symbol: string) => void} [props.onSendToTE]
 * @param {(symbol: string) => void} [props.onSendToCV]
 * @param {number} [props.refreshTick]                   bumped to force reload
 */
export default function DynamicBasketManager({
  onSendToTE,
  onSendToCV,
  refreshTick = 0,
}) {
  const [records, setRecords] = useState({});
  const reload = useCallback(() => {
    setRecords(listDynamicTickers());
  }, []);
  useEffect(() => { reload(); }, [reload, refreshTick]);

  const list = Object.values(records).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

  if (list.length === 0) {
    return (
      <section style={panel}>
        <Header />
        <div style={{ padding: "16px 4px", fontSize: 11, color: PALETTE.textFaint }}>
          No dynamic-basket entries yet. Add a ticker via the search box above.
        </div>
      </section>
    );
  }

  return (
    <section style={panel}>
      <Header count={list.length} />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${PALETTE.borderSoft}` }}>
              <Th>Symbol</Th>
              <Th>Source</Th>
              <Th>Status</Th>
              <Th>Scanner</Th>
              <Th>Tags</Th>
              <Th>Note</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((rec) => (
              <Row
                key={rec.symbol}
                rec={rec}
                onChange={reload}
                onSendToTE={onSendToTE}
                onSendToCV={onSendToCV} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Header({ count = 0 }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      paddingBottom: 8, marginBottom: 8,
      borderBottom: `1px solid ${PALETTE.borderSoft}`,
    }}>
      <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim }}>
        DYNAMIC BASKET
      </div>
      <div style={{ fontSize: 9, color: PALETTE.textFaint }}>
        {count} {count === 1 ? "entry" : "entries"}
      </div>
    </div>
  );
}

function Th({ children }) {
  return (
    <th style={{
      textAlign: "left", padding: "6px 8px",
      fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint,
      fontWeight: 600,
    }}>
      {children}
    </th>
  );
}

function Row({ rec, onChange, onSendToTE, onSendToCV }) {
  const [tagInput, setTagInput] = useState("");
  const [noteInput, setNoteInput] = useState(rec.notes || "");
  const [editingNote, setEditingNote] = useState(false);

  const saveNote = () => {
    upsertDynamicTicker({ symbol: rec.symbol, notes: noteInput.trim() || null });
    setEditingNote(false);
    onChange();
  };

  const togglePromote = () => {
    setScannerEligible(rec.symbol, !rec.scannerEligible);
    onChange();
  };

  const handleAddTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    addBasketTag(rec.symbol, t);
    setTagInput("");
    onChange();
  };

  const handleRemove = () => {
    if (!confirmRemove(rec.symbol)) return;
    removeDynamicTicker(rec.symbol);
    onChange();
  };

  return (
    <tr style={{ borderBottom: `1px solid ${PALETTE.borderSoft}` }}>
      <Td>
        <div style={{ fontWeight: 700, color: PALETTE.accentTeal, letterSpacing: "0.04em" }}>
          {rec.symbol}
        </div>
        <div style={{ fontSize: 9, color: PALETTE.textFaint }}>
          {rec.addedReason || ""}
        </div>
      </Td>
      <Td>
        <SourceBadge source={rec.sourceType} />
      </Td>
      <Td>
        <StatusBadge status={rec.catalogStatus} />
      </Td>
      <Td>
        <button
          onClick={togglePromote}
          style={pillBtn(rec.scannerEligible ? PALETTE.green : PALETTE.border)}>
          {rec.scannerEligible ? "Eligible ✓" : "Promote"}
        </button>
      </Td>
      <Td>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(rec.basketTags || []).map((t) => (
            <button key={t}
              onClick={() => { removeBasketTag(rec.symbol, t); onChange(); }}
              title="click to remove"
              style={tagPill}>
              {t} ✕
            </button>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
            placeholder="+ tag"
            style={{
              minWidth: 60, maxWidth: 120,
              background: "#0a0d12", color: PALETTE.text,
              border: `1px solid ${PALETTE.border}`, borderRadius: 6,
              padding: "2px 6px", fontSize: 10, fontFamily: "inherit",
            }} />
        </div>
      </Td>
      <Td>
        {editingNote ? (
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveNote(); } }}
              autoFocus
              style={{
                minWidth: 100, background: "#0a0d12", color: PALETTE.text,
                border: `1px solid ${PALETTE.border}`, borderRadius: 6,
                padding: "2px 6px", fontSize: 10, fontFamily: "inherit",
              }} />
            <button onClick={saveNote} style={pillBtn(PALETTE.green)}>Save</button>
          </div>
        ) : (
          <span
            onClick={() => setEditingNote(true)}
            style={{ fontSize: 11, color: rec.notes ? PALETTE.text : PALETTE.textFaint, cursor: "pointer" }}>
            {rec.notes || "+ add"}
          </span>
        )}
      </Td>
      <Td>
        <div style={{ display: "flex", gap: 4 }}>
          {onSendToTE && (
            <button onClick={() => onSendToTE(rec.symbol)} style={pillBtn(PALETTE.cyan)}>TE</button>
          )}
          {onSendToCV && (
            <button onClick={() => onSendToCV(rec.symbol)} style={pillBtn(PALETTE.cyan)}>CV</button>
          )}
          <button onClick={handleRemove} style={pillBtn(PALETTE.red)}>✕</button>
        </div>
      </Td>
    </tr>
  );
}

function Td({ children }) {
  return (
    <td style={{ padding: "8px", fontSize: 11, color: PALETTE.text, verticalAlign: "top" }}>
      {children}
    </td>
  );
}

function SourceBadge({ source }) {
  const map = {
    [TICKER_SOURCE_TYPES.STATIC_CATALOG]:        { color: PALETTE.green, label: "STATIC" },
    [TICKER_SOURCE_TYPES.DYNAMIC_BASKET]:        { color: PALETTE.accentTeal, label: "BASKET" },
    [TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT]: { color: PALETTE.amber, label: "LB" },
    [TICKER_SOURCE_TYPES.AD_HOC_SIMULATION]:     { color: PALETTE.textFaint, label: "AD-HOC" },
  };
  const m = map[source] || map[TICKER_SOURCE_TYPES.AD_HOC_SIMULATION];
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
      color: m.color,
      background: `${m.color}1a`, border: `1px solid ${m.color}55`,
      borderRadius: 4, padding: "2px 6px",
    }}>
      {m.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    [CATALOG_STATUS.CATALOGED]:   { color: PALETTE.green,    label: "cataloged" },
    [CATALOG_STATUS.UNCATALOGED]: { color: PALETTE.textDim,  label: "uncataloged" },
    [CATALOG_STATUS.PROMOTED]:    { color: PALETTE.cyan,     label: "promoted" },
    [CATALOG_STATUS.PROSPECT]:    { color: PALETTE.amber,    label: "prospect" },
  };
  const m = map[status] || map[CATALOG_STATUS.UNCATALOGED];
  return (
    <span style={{ fontSize: 10, color: m.color }}>
      {m.label}
    </span>
  );
}

function confirmRemove(sym) {
  try {
    return globalThis.confirm
      ? globalThis.confirm(`Remove ${sym} from the dynamic basket?`)
      : true;
  } catch { return true; }
}

const panel = {
  background: PALETTE.bg, border: `1px solid ${PALETTE.border}`,
  borderRadius: 10, padding: 12,
};

const tagPill = {
  fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
  color: PALETTE.cyan, background: `${PALETTE.cyan}1a`,
  border: `1px solid ${PALETTE.cyan}55`,
  borderRadius: 4, padding: "2px 6px", cursor: "pointer",
};

function pillBtn(color) {
  return {
    background: `${color}1a`, border: `1px solid ${color}88`, color,
    borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700,
    letterSpacing: "0.04em", cursor: "pointer", fontFamily: "inherit",
  };
}
