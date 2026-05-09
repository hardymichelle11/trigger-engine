// =====================================================
// CIO REVIEW DASHBOARD
// =====================================================
// Top-level portfolio review surface. Resolves the dashboard inputs
// from the basket-agent registry, the basket-universe store, and
// the manager-assessment memory store, runs the pure
// cioReviewDashboardEngine, and renders three child surfaces:
//   - per-basket summaries (CioBasketSummaryCard)
//   - top-of-funnel review queue (CioReviewQueueSummary)
//   - calibration / evidence / derisking rollups (CioCalibrationSummary)
//
// All actions remain operator-driven. Nothing on this dashboard
// auto-promotes, auto-trades, or sizes capital.
// =====================================================

import React, { useMemo } from "react";
import { listBasketAgents } from "../../lib/portfolioCio/basketAgentRegistry.js";
import { getBasketUniverse } from "../../lib/portfolioCio/basketUniverseManager.js";
import { getBasketManagerInputs } from "../../lib/portfolioCio/basketManagerAssessmentResolver.js";
import { buildCioReviewDashboard } from "../../lib/portfolioCio/cioReviewDashboardEngine.js";
import CioBasketSummaryCard from "./CioBasketSummaryCard.jsx";
import CioReviewQueueSummary from "./CioReviewQueueSummary.jsx";
import CioCalibrationSummary from "./CioCalibrationSummary.jsx";

const PALETTE = {
  bg:        "#06090e",
  panelBg:   "#0d1117",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  accentTeal:"#14b8a6",
  green:     "#22c55e",
  amber:     "#f59e0b",
  cyan:      "#06b6d4",
  red:       "#ef4444",
};

/**
 * @param {object} props
 * @param {Record<string, object>} [props.managerAssessmentsBySymbol]   override / additions
 * @param {Record<string, object>} [props.historyBySymbol]              override / additions
 * @param {object|null} [props.marketRegime]
 * @param {(sym: string) => void} [props.onSendToTE]
 * @param {(sym: string) => void} [props.onSendToCV]
 * @param {(sym: string) => void} [props.onPromoteToScanner]
 * @param {(sym: string) => void} [props.onRunAdHocSimulation]
 * @param {(basketId: string) => void} [props.onOpenBasket]
 * @param {number} [props.refreshTick]                                  bump to force recompute
 */
export default function CioReviewDashboard({
  managerAssessmentsBySymbol = {},
  historyBySymbol = {},
  marketRegime = null,
  onSendToTE,
  onSendToCV,
  onPromoteToScanner,
  onRunAdHocSimulation,
  onOpenBasket,
  refreshTick = 0,
}) {
  // 1) Resolve all baskets and their stored universes from the local
  //    stores. Caller can override per-symbol manager / history bags.
  const dashboard = useMemo(() => {
    const basketProfiles = listBasketAgents();
    const basketUniversesById = {};
    const allSymbols = new Set();

    for (const p of basketProfiles) {
      const u = getBasketUniverse(p.basketId);
      basketUniversesById[p.basketId] = u;
      for (const r of (u?.activeUniverse || [])) if (r?.symbol) allSymbols.add(r.symbol);
      for (const r of (u?.watchlist || []))      if (r?.symbol) allSymbols.add(r.symbol);
    }

    // Pull manager memory + history for the union of active+watchlist
    // symbols across all baskets, then layer the host overrides on top.
    const memoryInputs = getBasketManagerInputs(Array.from(allSymbols));
    const mergedMa = {
      ...memoryInputs.managerAssessmentsBySymbol,
      ...(managerAssessmentsBySymbol || {}),
    };
    const mergedHistory = {
      ...memoryInputs.historyBySymbol,
      ...(historyBySymbol || {}),
    };

    return buildCioReviewDashboard({
      basketProfiles,
      basketUniversesById,
      managerAssessmentsBySymbol: mergedMa,
      historyBySymbol: mergedHistory,
      marketRegime,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managerAssessmentsBySymbol, historyBySymbol, marketRegime, refreshTick]);

  return (
    <section aria-label="CIO review dashboard"
      style={{
        background: PALETTE.bg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 10, padding: 12,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
      {/* Header / portfolio rollup */}
      <header>
        <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim, marginBottom: 4 }}>
          CIO REVIEW DASHBOARD
        </div>
        <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.55 }}>
          {dashboard.actionSummary}
        </div>
        <div style={{
          marginTop: 8, display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: 6,
          background: PALETTE.panelBg,
          border: `1px solid ${PALETTE.borderSoft}`,
          borderRadius: 8, padding: "8px 10px",
        }}>
          <Stat label="Active"       value={dashboard.totalActive}                tone={PALETTE.green} />
          <Stat label="Watchlist"    value={dashboard.totalWatchlist}             tone={PALETTE.cyan} />
          <Stat label="Excluded"     value={dashboard.totalExcluded}              tone={PALETTE.textFaint} />
          <Stat label="High pri."    value={dashboard.totalHighPriorityActions}   tone={PALETTE.amber} />
          <Stat label="Calibration"  value={dashboard.totalCalibrationFlags}      tone={PALETTE.red} />
          <Stat label="Need evidence" value={dashboard.totalInsufficientEvidence} tone={PALETTE.cyan} />
        </div>
      </header>

      {/* Top-of-funnel review queue */}
      <CioReviewQueueSummary
        topQueueItems={dashboard.topQueueItems}
        scannerPromotionCandidates={dashboard.scannerPromotionCandidates}
        teReviewNeeded={dashboard.teReviewNeeded}
        cvReviewNeeded={dashboard.cvReviewNeeded}
        onSendToTE={onSendToTE}
        onSendToCV={onSendToCV}
        onPromoteToScanner={onPromoteToScanner}
        onOpenBasket={onOpenBasket} />

      {/* Calibration / evidence / derisking */}
      <CioCalibrationSummary
        calibrationFlags={dashboard.calibrationFlags}
        insufficientEvidence={dashboard.insufficientEvidence}
        deriskingWatch={dashboard.deriskingWatch}
        onRunAdHocSimulation={onRunAdHocSimulation}
        onOpenBasket={onOpenBasket} />

      {/* Per-basket summaries */}
      <section aria-label="Per-basket summaries"
        style={{
          background: PALETTE.panelBg,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: 10, padding: 10,
          display: "flex", flexDirection: "column", gap: 10,
        }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim }}>
            BASKETS · {dashboard.basketSummaries.length}
          </span>
          <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
            sorted by review priority
          </span>
        </header>
        {dashboard.basketSummaries.length === 0 ? (
          <div style={{
            padding: "10px 4px", fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic",
          }}>
            No basket profiles registered.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dashboard.basketSummaries.map((s) => (
              <CioBasketSummaryCard key={s.basketId} summary={s} onOpenBasket={onOpenBasket} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

function Stat({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 8, letterSpacing: "0.10em", color: PALETTE.textFaint }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 16, color: tone, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}
