// =====================================================
// BASKET UNIVERSE EDITOR
// =====================================================
// Manual symbol entry + three-list editor (active / watchlist /
// excluded). Trader-facing labels; per-symbol action menu lets the
// operator move between lists, tag, note, or send to TE / CV /
// Scanner. The component is presentational; persistence is delegated
// via callbacks the parent supplies.
// =====================================================

import React, { useCallback, useState } from "react";
import { normalizeSymbol } from "../../lib/portfolioCio/basketAgentTypes.js";

const PALETTE = {
  bg:        "#0d1117",
  panelBg:   "#0a0d12",
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
 * @param {object} props.universe                 BasketUniverse record
 * @param {(syms: string[]) => void} props.onAddActive
 * @param {(sym: string, reason?: string) => void} props.onMoveToWatchlist
 * @param {(sym: string, reason?: string) => void} props.onMoveToExcluded
 * @param {(sym: string) => void} props.onRestoreToActive
 * @param {(sym: string) => void} props.onRemove
 * @param {(sym: string, note: string) => void} [props.onUpdateNote]
 * @param {(sym: string, tag: string) => void} [props.onAddTag]
 * @param {(sym: string, tag: string) => void} [props.onRemoveTag]
 * @param {(sym: string) => void} [props.onSendToTE]
 * @param {(sym: string) => void} [props.onSendToCV]
 * @param {(sym: string) => void} [props.onPromoteToScanner]
 */
export default function BasketUniverseEditor({
  universe,
  onAddActive,
  onMoveToWatchlist,
  onMoveToExcluded,
  onRestoreToActive,
  onRemove,
  onUpdateNote,
  onAddTag,
  onRemoveTag,
  onSendToTE,
  onSendToCV,
  onPromoteToScanner,
}) {
  const [manual, setManual] = useState("");
  const u = universe || { activeUniverse: [], watchlist: [], excludedSymbols: [] };

  const handleAdd = useCallback(() => {
    const syms = parseSymbolList(manual);
    if (syms.length === 0) return;
    onAddActive && onAddActive(syms);
    setManual("");
  }, [manual, onAddActive]);

  return (
    <section aria-label="Basket universe editor"
      style={{
        background: PALETTE.bg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 8,
        padding: 12,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
      {/* Manual add */}
      <div>
        <div style={{ fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint, marginBottom: 4 }}>
          ADD SYMBOLS TO ACTIVE UNIVERSE
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
          <input
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
            placeholder="SNDK, WDC, CARR, TEM, TSLA"
            style={{
              flex: 1, minWidth: 0,
              background: PALETTE.panelBg, color: PALETTE.text,
              border: `1px solid ${PALETTE.border}`, borderRadius: 6,
              padding: "6px 8px", fontSize: 11, fontFamily: "inherit",
              letterSpacing: "0.04em", textTransform: "uppercase",
            }} />
          <button type="button" onClick={handleAdd} style={btn(PALETTE.accentTeal)}>
            Add to Active
          </button>
        </div>
        <div style={{ marginTop: 4, fontSize: 9, color: PALETTE.textFaint }}>
          Symbols are normalized (uppercase + trim). Invalid entries are ignored.
        </div>
      </div>

      {/* Three-list grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 12,
      }}>
        <ListPanel
          title="Active universe"
          subtitle="Active universe is the current scan universe for this basket."
          tone={PALETTE.green}
          records={u.activeUniverse}
          listType="active"
          onMoveToWatchlist={onMoveToWatchlist}
          onMoveToExcluded={onMoveToExcluded}
          onRestoreToActive={null}
          onRemove={onRemove}
          onUpdateNote={onUpdateNote}
          onAddTag={onAddTag}
          onRemoveTag={onRemoveTag}
          onSendToTE={onSendToTE}
          onSendToCV={onSendToCV}
          onPromoteToScanner={onPromoteToScanner} />
        <ListPanel
          title="Watchlist"
          subtitle="Watchlist names are monitored but not actively scanned."
          tone={PALETTE.amber}
          records={u.watchlist}
          listType="watchlist"
          onMoveToWatchlist={null}
          onMoveToExcluded={onMoveToExcluded}
          onRestoreToActive={onRestoreToActive}
          onRemove={onRemove}
          onUpdateNote={onUpdateNote}
          onAddTag={onAddTag}
          onRemoveTag={onRemoveTag}
          onSendToTE={onSendToTE}
          onSendToCV={onSendToCV}
          onPromoteToScanner={onPromoteToScanner} />
        <ListPanel
          title="Excluded"
          subtitle="Excluded names are temporarily removed due to risk, weak thesis, poor liquidity, or operator choice."
          tone={PALETTE.red}
          records={u.excludedSymbols}
          listType="excluded"
          onMoveToWatchlist={onMoveToWatchlist}
          onMoveToExcluded={null}
          onRestoreToActive={onRestoreToActive}
          onRemove={onRemove}
          onUpdateNote={onUpdateNote}
          onAddTag={onAddTag}
          onRemoveTag={onRemoveTag}
          onSendToTE={onSendToTE}
          onSendToCV={onSendToCV}
          onPromoteToScanner={onPromoteToScanner} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// List panel — single-list rendering
// ---------------------------------------------------------------------

function ListPanel({
  title, subtitle, tone, records, listType,
  onMoveToWatchlist, onMoveToExcluded, onRestoreToActive, onRemove,
  onUpdateNote, onAddTag, onRemoveTag,
  onSendToTE, onSendToCV, onPromoteToScanner,
}) {
  const list = Array.isArray(records) ? records : [];
  return (
    <div style={{
      background: PALETTE.panelBg,
      border: `1px solid ${tone}33`,
      borderRadius: 8, padding: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: tone, letterSpacing: "0.04em" }}>
          {title}
        </span>
        <span style={{ fontSize: 9, color: PALETTE.textFaint }}>{list.length}</span>
      </div>
      {subtitle && (
        <div style={{ fontSize: 9, color: PALETTE.textFaint, lineHeight: 1.5, marginBottom: 6 }}>
          {subtitle}
        </div>
      )}
      {list.length === 0 ? (
        <div style={{ fontSize: 10, color: PALETTE.textFaint, fontStyle: "italic", padding: "4px 0" }}>
          {emptyCopyFor(listType)}
        </div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {list.map((rec) => (
            <SymbolRow
              key={rec.symbol}
              rec={rec}
              listType={listType}
              tone={tone}
              onMoveToWatchlist={onMoveToWatchlist}
              onMoveToExcluded={onMoveToExcluded}
              onRestoreToActive={onRestoreToActive}
              onRemove={onRemove}
              onUpdateNote={onUpdateNote}
              onAddTag={onAddTag}
              onRemoveTag={onRemoveTag}
              onSendToTE={onSendToTE}
              onSendToCV={onSendToCV}
              onPromoteToScanner={onPromoteToScanner} />
          ))}
        </ul>
      )}
    </div>
  );
}

function emptyCopyFor(listType) {
  switch (listType) {
    case "active":    return "No active names. Use the input above or seed baseline leaders.";
    case "watchlist": return "No watchlist names yet.";
    case "excluded":  return "No excluded names.";
    default:           return "—";
  }
}

// ---------------------------------------------------------------------
// Single symbol row
// ---------------------------------------------------------------------

function SymbolRow({
  rec, listType, tone,
  onMoveToWatchlist, onMoveToExcluded, onRestoreToActive, onRemove,
  onUpdateNote, onAddTag, onRemoveTag,
  onSendToTE, onSendToCV, onPromoteToScanner,
}) {
  const [open, setOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [noteInput, setNoteInput] = useState(rec.notes || "");

  const saveNote = () => {
    if (typeof onUpdateNote !== "function") return;
    onUpdateNote(rec.symbol, noteInput.trim() || null);
    setOpen(false);
  };
  const handleAddTag = () => {
    const t = tagInput.trim();
    if (!t || typeof onAddTag !== "function") return;
    onAddTag(rec.symbol, t);
    setTagInput("");
  };

  return (
    <li style={{
      background: "#06090e",
      border: `1px solid ${PALETTE.borderSoft}`,
      borderRadius: 6, padding: "6px 8px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <button type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            background: "transparent", border: "none",
            color: tone, fontWeight: 700, fontSize: 12,
            letterSpacing: "0.04em", cursor: "pointer",
            padding: 0, fontFamily: "inherit",
          }}>
          {open ? "▾" : "▸"} {rec.symbol}
        </button>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(rec.tags || []).map((t) => (
            <button key={t} type="button"
              onClick={() => onRemoveTag && onRemoveTag(rec.symbol, t)}
              title="Click to remove tag"
              style={{
                fontSize: 8, fontWeight: 700, letterSpacing: "0.04em",
                color: PALETTE.cyan, background: `${PALETTE.cyan}1a`,
                border: `1px solid ${PALETTE.cyan}55`,
                borderRadius: 3, padding: "1px 5px", cursor: "pointer",
                fontFamily: "inherit",
              }}>
              {t} ✕
            </button>
          ))}
        </div>
      </div>
      {rec.notes && !open && (
        <div style={{ fontSize: 9, color: PALETTE.textDim, fontStyle: "italic", marginTop: 2 }}>
          {rec.notes}
        </div>
      )}
      {rec.addedReason && !open && (
        <div style={{ fontSize: 8, color: PALETTE.textFaint, marginTop: 2 }}>
          {rec.addedReason}
        </div>
      )}
      {open && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${PALETTE.borderSoft}` }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
            {listType !== "active" && onRestoreToActive && (
              <button type="button" onClick={() => onRestoreToActive(rec.symbol)} style={btn(PALETTE.green)}>
                Restore to Active
              </button>
            )}
            {listType === "active" && onMoveToWatchlist && (
              <button type="button" onClick={() => onMoveToWatchlist(rec.symbol, "needs_confirmation")} style={btn(PALETTE.amber)}>
                Move to Watchlist
              </button>
            )}
            {listType !== "excluded" && onMoveToExcluded && (
              <button type="button" onClick={() => onMoveToExcluded(rec.symbol, "operator_excluded")} style={btn(PALETTE.red)}>
                Exclude
              </button>
            )}
            {onRemove && (
              <button type="button" onClick={() => onRemove(rec.symbol)} style={btn(PALETTE.textFaint)}>
                Remove
              </button>
            )}
            {onSendToTE && (
              <button type="button" onClick={() => onSendToTE(rec.symbol)} style={btn(PALETTE.cyan)}>
                Send to TE
              </button>
            )}
            {onSendToCV && (
              <button type="button" onClick={() => onSendToCV(rec.symbol)} style={btn(PALETTE.cyan)}>
                Send to CV
              </button>
            )}
            {onPromoteToScanner && (
              <button type="button" onClick={() => onPromoteToScanner(rec.symbol)} style={btn(PALETTE.accentTeal)}>
                Promote to Scanner
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "stretch", marginBottom: 4 }}>
            <input type="text" value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
              placeholder="add tag"
              style={miniInput()} />
            <button type="button" onClick={handleAddTag} style={btn(PALETTE.cyan)}>
              Add Tag
            </button>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
            <input type="text" value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="add note"
              style={miniInput()} />
            <button type="button" onClick={saveNote} style={btn(PALETTE.green)}>
              Save Note
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

export function parseSymbolList(raw) {
  if (typeof raw !== "string") return [];
  const seen = new Set();
  const out = [];
  for (const part of raw.split(/[,\s]+/)) {
    const s = normalizeSymbol(part);
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

function btn(color) {
  return {
    background: `${color}1a`,
    border: `1px solid ${color}88`,
    color,
    borderRadius: 5, padding: "3px 8px",
    fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
    cursor: "pointer", fontFamily: "inherit",
  };
}
function miniInput() {
  return {
    flex: 1, minWidth: 0,
    background: "#06090e", color: PALETTE.text,
    border: `1px solid ${PALETTE.border}`, borderRadius: 5,
    padding: "3px 6px", fontSize: 10, fontFamily: "inherit",
  };
}
