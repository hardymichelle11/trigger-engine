// =====================================================
// BASKET AGENT PANEL
// =====================================================
// Top-level CIO basket workspace. Picks a basket, shows the mandate
// + baseline-leader controls, the universe editor, and the leadership
// table. Owns the localStorage-backed state through
// basketUniverseManager and re-renders on mutations.
// =====================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  listBasketAgents,
  getBasketAgent,
} from "../../lib/portfolioCio/basketAgentRegistry.js";
import {
  getBasketUniverse,
  upsertBasketSymbol,
  removeBasketSymbol,
  moveToWatchlist,
  moveToExcluded,
  restoreToActive,
  updateBasketSymbolNote,
  addBasketSymbolTag,
  removeBasketSymbolTag,
  seedBaselineLeaders,
} from "../../lib/portfolioCio/basketUniverseManager.js";
import { buildBasketLeadershipRead } from "../../lib/portfolioCio/basketLeadershipEngine.js";
import { getBasketManagerInputs } from "../../lib/portfolioCio/basketManagerAssessmentResolver.js";
import { buildBasketActionQueue } from "../../lib/portfolioCio/basketActionQueue.js";
import BasketActionQueue from "./BasketActionQueue.jsx";
import BasketMandateCard from "./BasketMandateCard.jsx";
import BasketUniverseEditor from "./BasketUniverseEditor.jsx";
import BasketLeadershipTable from "./BasketLeadershipTable.jsx";

const PALETTE = {
  bg:        "#06090e",
  panelBg:   "#0d1117",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  accentTeal:"#14b8a6",
};

/**
 * @param {object} props
 * @param {string} [props.defaultBasketId]                    initial selection
 * @param {Record<string, object>} [props.managerAssessmentsBySymbol]
 * @param {Record<string, object>} [props.historyBySymbol]
 * @param {object|null} [props.marketRegime]
 * @param {(sym: string) => void} [props.onSendToTE]
 * @param {(sym: string) => void} [props.onSendToCV]
 * @param {(sym: string) => void} [props.onPromoteToScanner]
 */
export default function BasketAgentPanel({
  defaultBasketId = "storage_memory_data_movement",
  managerAssessmentsBySymbol = {},
  historyBySymbol = {},
  marketRegime = null,
  onSendToTE,
  onSendToCV,
  onPromoteToScanner,
}) {
  const baskets = useMemo(() => listBasketAgents(), []);
  const [basketId, setBasketId] = useState(() => {
    return baskets.some((b) => b.basketId === defaultBasketId)
      ? defaultBasketId
      : (baskets[0]?.basketId || null);
  });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  const profile = useMemo(() => getBasketAgent(basketId), [basketId]);
  const universe = useMemo(() => getBasketUniverse(basketId), [basketId, tick]);

  // Pull manager-assessment memory for active + watchlist symbols. The
  // prop bag (managerAssessmentsBySymbol / historyBySymbol) takes
  // priority — operators or future hosts can override per-symbol —
  // and memory fills the gaps. Excluded names are deliberately left
  // out of the lookup; the engine filters them anyway.
  const memoryInputs = useMemo(() => {
    const symbols = [
      ...((universe?.activeUniverse || []).map((r) => r.symbol)),
      ...((universe?.watchlist || []).map((r) => r.symbol)),
    ].filter(Boolean);
    return getBasketManagerInputs(symbols);
  }, [universe, tick]);

  const mergedManagerAssessments = useMemo(
    () => ({ ...memoryInputs.managerAssessmentsBySymbol, ...(managerAssessmentsBySymbol || {}) }),
    [memoryInputs, managerAssessmentsBySymbol],
  );
  const mergedHistory = useMemo(
    () => ({ ...memoryInputs.historyBySymbol, ...(historyBySymbol || {}) }),
    [memoryInputs, historyBySymbol],
  );

  const leadershipRead = useMemo(() => {
    if (!profile) return null;
    return buildBasketLeadershipRead({
      basketProfile: profile,
      basketUniverse: universe,
      managerAssessmentsBySymbol: mergedManagerAssessments,
      marketRegime,
      historyBySymbol: mergedHistory,
    });
  }, [profile, universe, mergedManagerAssessments, marketRegime, mergedHistory]);

  const actionQueueItems = useMemo(() => {
    if (!profile) return [];
    return buildBasketActionQueue({
      basketProfile: profile,
      basketUniverse: universe,
      leadershipRead,
      managerAssessmentsBySymbol: mergedManagerAssessments,
      historyBySymbol: mergedHistory,
    });
  }, [profile, universe, leadershipRead, mergedManagerAssessments, mergedHistory]);

  // ---- mutation handlers ----
  const handleSeedBaseline = useCallback((syms) => {
    if (!basketId || !Array.isArray(syms)) return;
    for (const sym of syms) {
      upsertBasketSymbol(basketId, sym, {
        addedReason: "baseline_anchor",
        source: "registry_baseline",
      });
    }
    reload();
  }, [basketId, reload]);

  const handleSeedAllExposed = useCallback(() => {
    if (!basketId) return;
    seedBaselineLeaders(basketId);
    reload();
  }, [basketId, reload]);

  const handleAddActive = useCallback((syms) => {
    if (!basketId || !Array.isArray(syms)) return;
    for (const sym of syms) {
      upsertBasketSymbol(basketId, sym, { addedReason: "manual_add" });
    }
    reload();
  }, [basketId, reload]);

  const handleMoveToWatchlist = useCallback((sym, reason) => {
    moveToWatchlist(basketId, sym, reason);
    reload();
  }, [basketId, reload]);

  const handleMoveToExcluded = useCallback((sym, reason) => {
    moveToExcluded(basketId, sym, reason);
    reload();
  }, [basketId, reload]);

  const handleRestoreToActive = useCallback((sym) => {
    restoreToActive(basketId, sym);
    reload();
  }, [basketId, reload]);

  const handleRemove = useCallback((sym) => {
    removeBasketSymbol(basketId, sym);
    reload();
  }, [basketId, reload]);

  const handleUpdateNote = useCallback((sym, note) => {
    updateBasketSymbolNote(basketId, sym, note);
    reload();
  }, [basketId, reload]);

  const handleAddTag = useCallback((sym, tag) => {
    addBasketSymbolTag(basketId, sym, tag);
    reload();
  }, [basketId, reload]);

  const handleRemoveTag = useCallback((sym, tag) => {
    removeBasketSymbolTag(basketId, sym, tag);
    reload();
  }, [basketId, reload]);

  if (!profile) {
    return (
      <section style={{
        background: PALETTE.bg, border: `1px solid ${PALETTE.border}`,
        borderRadius: 10, padding: 12,
        fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic",
      }}>
        No basket profile available.
      </section>
    );
  }

  return (
    <section aria-label="CIO basket agent panel"
      style={{
        background: PALETTE.bg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 10, padding: 12,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
      {/* Header + basket selector */}
      <header>
        <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim, marginBottom: 4 }}>
          CIO BASKET AGENTS
        </div>
        <div style={{ fontSize: 10, color: PALETTE.textFaint, lineHeight: 1.5, marginBottom: 6 }}>
          Each basket is a living mandate, not a fixed ticker list. Active universe / watchlist / excluded names are user-editable. Baseline leaders are reference anchors only.
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {baskets.map((b) => (
            <button key={b.basketId} type="button"
              onClick={() => setBasketId(b.basketId)}
              aria-pressed={b.basketId === basketId}
              style={{
                background: b.basketId === basketId ? `${PALETTE.accentTeal}1a` : "transparent",
                border: `1px solid ${b.basketId === basketId ? PALETTE.accentTeal : PALETTE.border}`,
                color: b.basketId === basketId ? PALETTE.accentTeal : PALETTE.textDim,
                borderRadius: 5, padding: "4px 8px",
                fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {b.basketName}
            </button>
          ))}
        </div>
      </header>

      {/* Mandate */}
      <BasketMandateCard
        profile={profile}
        onSeedBaseline={handleSeedBaseline} />

      {/* Universe editor */}
      <BasketUniverseEditor
        universe={universe}
        onAddActive={handleAddActive}
        onMoveToWatchlist={handleMoveToWatchlist}
        onMoveToExcluded={handleMoveToExcluded}
        onRestoreToActive={handleRestoreToActive}
        onRemove={handleRemove}
        onUpdateNote={handleUpdateNote}
        onAddTag={handleAddTag}
        onRemoveTag={handleRemoveTag}
        onSendToTE={onSendToTE}
        onSendToCV={onSendToCV}
        onPromoteToScanner={onPromoteToScanner} />

      {/* Leadership table — merged-bag is what the engine saw above */}
      <BasketLeadershipTable
        read={leadershipRead}
        universe={universe}
        managerAssessmentsBySymbol={mergedManagerAssessments}
        onSendToTE={onSendToTE}
        onSendToCV={onSendToCV}
        onPromoteToScanner={onPromoteToScanner}
        onMoveToWatchlist={handleMoveToWatchlist}
        onMoveToExcluded={handleMoveToExcluded}
        onRestoreToActive={handleRestoreToActive}
        onRemove={handleRemove} />

      {/* Action queue — review-only, scoped to the selected basket */}
      <BasketActionQueue
        title={`Review queue · ${profile.basketName}`}
        items={actionQueueItems}
        onSendToTE={onSendToTE}
        onSendToCV={onSendToCV}
        onPromoteToScanner={onPromoteToScanner}
        onMoveToWatchlist={handleMoveToWatchlist}
        onMoveToExcluded={handleMoveToExcluded}
        onRestoreToActive={handleRestoreToActive} />
    </section>
  );
}
