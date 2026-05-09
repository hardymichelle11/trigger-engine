// =====================================================
// UNIVERSE SELECTOR
// =====================================================
// Lets the operator pick which universe(s) the scanner runs over:
//   - Core Catalog            (existing static catalog)
//   - Dynamic Basket          (operator-managed basket)
//   - Lethal Board Prospects  (LB-surfaced symbols)
//   - Manual Ticker List      (comma-separated ad-hoc symbols)
//   - Combined Universe       (all of the above)
//
// Pure presentational. The host owns the selection state + the merge
// logic that turns the selection into a list of symbols for the scan.
// =====================================================

import React, { useCallback, useState } from "react";
import {
  TICKER_SOURCE_TYPES,
  normalizeSymbol,
} from "../../lib/universe/tickerUniverseTypes.js";
import {
  listBasketAgents,
  getBasketAgent,
} from "../../lib/portfolioCio/basketAgentRegistry.js";
import {
  getBasketUniverse,
  listBasketUniverses,
} from "../../lib/portfolioCio/basketUniverseManager.js";

const PALETTE = {
  bg:        "#0d1117",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  accentTeal:"#14b8a6",
  green:     "#22c55e",
  cyan:      "#06b6d4",
};

export const UNIVERSE_OPTIONS = Object.freeze({
  CORE_CATALOG:       { code: "core_catalog",       label: "Core Catalog",            sourceType: TICKER_SOURCE_TYPES.STATIC_CATALOG },
  DYNAMIC_BASKET:     { code: "dynamic_basket",     label: "Dynamic Basket",          sourceType: TICKER_SOURCE_TYPES.DYNAMIC_BASKET },
  LETHAL_BOARD:       { code: "lethal_board",       label: "Lethal Board Prospects",  sourceType: TICKER_SOURCE_TYPES.LETHAL_BOARD_PROSPECT },
  MANUAL_TICKER_LIST: { code: "manual_ticker_list", label: "Manual Ticker List",      sourceType: null },
  CIO_BASKET:         { code: "cio_basket",         label: "CIO Basket",              sourceType: TICKER_SOURCE_TYPES.CIO_BASKET_ACTIVE_UNIVERSE },
  ALL_CIO_BASKETS:    { code: "all_cio_baskets",    label: "All CIO Baskets",         sourceType: TICKER_SOURCE_TYPES.CIO_BASKET_ACTIVE_UNIVERSE },
  COMBINED:           { code: "combined",           label: "Combined Universe",       sourceType: null },
});

/**
 * @param {object} props
 * @param {string[]} props.selected                       array of UNIVERSE_OPTIONS codes
 * @param {(codes: string[]) => void} props.onChange
 * @param {string} [props.manualList]                     comma-separated symbols
 * @param {(value: string) => void} [props.onManualListChange]
 * @param {string|null} [props.selectedCioBasketId]       basket id when selected = ["cio_basket"]
 * @param {(basketId: string) => void} [props.onCioBasketChange]
 */
export default function UniverseSelector({
  selected = ["core_catalog"],
  onChange,
  manualList = "",
  onManualListChange,
  selectedCioBasketId = null,
  onCioBasketChange,
}) {
  const toggle = useCallback((code) => {
    if (!onChange) return;
    if (code === "combined") {
      // "Combined" is mutually exclusive — selecting it replaces all
      // other choices; deselecting it falls back to core_catalog.
      const isOn = selected.includes("combined");
      onChange(isOn ? ["core_catalog"] : ["combined"]);
      return;
    }
    const without = selected.filter((c) => c !== "combined");
    const next = without.includes(code)
      ? without.filter((c) => c !== code)
      : [...without, code];
    onChange(next.length === 0 ? ["core_catalog"] : next);
  }, [selected, onChange]);

  return (
    <section style={{
      background: PALETTE.bg, border: `1px solid ${PALETTE.border}`,
      borderRadius: 10, padding: 12,
    }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim, marginBottom: 8,
      }}>
        SCAN UNIVERSE
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Object.values(UNIVERSE_OPTIONS).map((opt) => (
          <Chip
            key={opt.code}
            label={opt.label}
            active={selected.includes(opt.code)}
            onClick={() => toggle(opt.code)}
          />
        ))}
      </div>

      {(selected.includes("manual_ticker_list") || selected.includes("combined")) && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", color: PALETTE.textFaint, marginBottom: 4 }}>
            MANUAL TICKERS (comma-separated)
          </div>
          <input
            type="text"
            value={manualList}
            onChange={(e) => onManualListChange && onManualListChange(e.target.value)}
            placeholder="TEM, ALAB, INOD, BE, CRWV"
            spellCheck={false}
            style={{
              width: "100%",
              background: "#0a0d12", color: PALETTE.text,
              border: `1px solid ${PALETTE.border}`, borderRadius: 6,
              padding: "6px 8px", fontSize: 12,
              letterSpacing: "0.04em", textTransform: "uppercase",
              fontFamily: "inherit",
            }} />
          <div style={{ marginTop: 4, fontSize: 9, color: PALETTE.textFaint }}>
            Symbols are normalized (uppercase + trim). Invalid entries are ignored at scan time.
          </div>
        </div>
      )}

      {/* CIO Basket sub-selector — visible when "CIO Basket" is on. The
          selector lists all 12 mandates so the operator can choose which
          basket's active universe to scan. The All CIO Baskets option
          is a separate mode and does NOT show this sub-selector. */}
      {selected.includes("cio_basket") && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", color: PALETTE.textFaint, marginBottom: 4 }}>
            CIO BASKET
          </div>
          <select
            value={selectedCioBasketId || ""}
            onChange={(e) => onCioBasketChange && onCioBasketChange(e.target.value || null)}
            style={{
              width: "100%",
              background: "#0a0d12", color: PALETTE.text,
              border: `1px solid ${PALETTE.border}`, borderRadius: 6,
              padding: "6px 8px", fontSize: 12, fontFamily: "inherit",
            }}>
            <option value="">— Select basket —</option>
            {listBasketAgents().map((b) => (
              <option key={b.basketId} value={b.basketId}>{b.basketName}</option>
            ))}
          </select>
          <div style={{ marginTop: 4, fontSize: 9, color: PALETTE.textFaint, lineHeight: 1.5 }}>
            Scans active names only. Baseline leaders, watchlist, and excluded names are not scanned unless moved to Active.
          </div>
        </div>
      )}

      {selected.includes("all_cio_baskets") && (
        <div style={{ marginTop: 10, fontSize: 9, color: PALETTE.textFaint, lineHeight: 1.5 }}>
          Scans active universes across all CIO basket agents (deduped). Baseline leaders, watchlist, and excluded names are excluded.
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------------
// PARSER + RESOLVER
// ----------------------------------------------------------------

/**
 * Turn a manual-list string into an array of normalized unique symbols.
 * "TEM, ALAB, INOD" → ["TEM", "ALAB", "INOD"].
 */
export function parseManualTickerList(raw) {
  if (!raw || typeof raw !== "string") return [];
  const seen = new Set();
  const out = [];
  for (const part of raw.split(/[,\s]+/)) {
    const sym = normalizeSymbol(part);
    if (sym && !seen.has(sym)) { seen.add(sym); out.push(sym); }
  }
  return out;
}

/**
 * Build the merged symbol list from the operator's selection.
 *
 * @param {object} args
 * @param {string[]} args.selected                       UNIVERSE_OPTIONS codes
 * @param {string} [args.manualList]
 * @param {string[]} [args.coreCatalogSymbols]
 * @param {string[]} [args.dynamicBasketSymbols]
 * @param {string[]} [args.lethalBoardSymbols]
 * @param {string[]} [args.cioBasketSymbols]             active universe of the
 *                                                       single selected basket
 * @param {string[]} [args.allCioBasketSymbols]          union of active
 *                                                       universes across all
 *                                                       CIO basket agents
 * @returns {string[]}
 */
export function resolveScanSymbols({
  selected = ["core_catalog"],
  manualList = "",
  coreCatalogSymbols = [],
  dynamicBasketSymbols = [],
  lethalBoardSymbols = [],
  cioBasketSymbols = [],
  allCioBasketSymbols = [],
}) {
  const includeAll = selected.includes("combined");
  const seen = new Set();
  const push = (arr) => { for (const s of arr) { const n = normalizeSymbol(s); if (n) seen.add(n); } };

  if (includeAll || selected.includes("core_catalog")) push(coreCatalogSymbols);
  if (includeAll || selected.includes("dynamic_basket")) push(dynamicBasketSymbols);
  if (includeAll || selected.includes("lethal_board")) push(lethalBoardSymbols);
  if (includeAll || selected.includes("manual_ticker_list")) push(parseManualTickerList(manualList));
  if (includeAll || selected.includes("cio_basket")) push(cioBasketSymbols);
  if (includeAll || selected.includes("all_cio_baskets")) push(allCioBasketSymbols);

  return Array.from(seen);
}

/**
 * Read the active universe of a single CIO basket. Active members only —
 * baseline leaders, watchlist, and excluded names are NEVER returned.
 *
 * @param {string} basketId
 * @returns {string[]}
 */
export function resolveCioBasketSymbols(basketId) {
  if (typeof basketId !== "string" || !basketId) return [];
  const universe = getBasketUniverse(basketId);
  if (!universe || !Array.isArray(universe.activeUniverse)) return [];
  const out = [];
  const seen = new Set();
  for (const rec of universe.activeUniverse) {
    const sym = normalizeSymbol(rec?.symbol);
    if (sym && !seen.has(sym)) { seen.add(sym); out.push(sym); }
  }
  return out;
}

/**
 * Union the active universes across all CIO basket agents, deduped.
 * Active members only — same exclusion rules as resolveCioBasketSymbols.
 *
 * @returns {string[]}
 */
export function resolveAllCioBasketSymbols() {
  const all = listBasketUniverses();
  const seen = new Set();
  const out = [];
  for (const universe of Object.values(all || {})) {
    if (!universe || !Array.isArray(universe.activeUniverse)) continue;
    for (const rec of universe.activeUniverse) {
      const sym = normalizeSymbol(rec?.symbol);
      if (sym && !seen.has(sym)) { seen.add(sym); out.push(sym); }
    }
  }
  return out;
}

/**
 * Build per-symbol records for a CIO basket — useful for callers that
 * want sourceType / basketId provenance alongside the symbol itself.
 *
 * @param {string} basketId
 * @returns {Array<{
 *   symbol: string, sourceType: string, scannerEligible: boolean,
 *   catalogStatus: string, basketId: string, basketName: string,
 * }>}
 */
export function buildCioBasketRecords(basketId) {
  const profile = getBasketAgent(basketId);
  if (!profile) return [];
  const symbols = resolveCioBasketSymbols(basketId);
  return symbols.map((sym) => ({
    symbol: sym,
    sourceType: TICKER_SOURCE_TYPES.CIO_BASKET_ACTIVE_UNIVERSE,
    scannerEligible: true,
    catalogStatus: "promoted",     // explicit operator promotion to active
    basketId: profile.basketId,
    basketName: profile.basketName,
  }));
}

// ----------------------------------------------------------------
// CHIP
// ----------------------------------------------------------------

function Chip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      style={{
        background: active ? `${PALETTE.accentTeal}1a` : "transparent",
        border: `1px solid ${active ? PALETTE.accentTeal : PALETTE.border}`,
        color: active ? PALETTE.accentTeal : PALETTE.textDim,
        borderRadius: 6, padding: "5px 10px",
        fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
        cursor: "pointer", fontFamily: "inherit",
      }}>
      {label}
    </button>
  );
}
