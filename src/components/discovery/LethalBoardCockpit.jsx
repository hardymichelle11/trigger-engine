// =====================================================
// LETHAL BOARD COCKPIT (Phase 4.7.2)
// =====================================================
// Production trader cockpit. Strict 100 vh layout: nothing
// scrolls at the page level — internal scroll lives inside
// individual panels (Operator Console / Ranked Candidates /
// Market Intelligence / Alerts / Opportunity Detail).
//
//   ┌────────────┬──────────────────────────────────────┐
//   │ Operator   │ CapitalCommandBar (auto)             │
//   │ Console    ├──────────────────────────────────────┤
//   │ 280 px     │ Top picks (36% of viewport)          │
//   │            │   3 equal columns                    │
//   │            ├──────────────────────────────────────┤
//   │            │ Lower split (1fr — fills rest)       │
//   │            │   60%  Ranked + Intel + Alerts       │
//   │            │   40%  OpportunityDetailPanel        │
//   └────────────┴──────────────────────────────────────┘
//
// Hard rules:
//   - PURE presentational. No engine call, no fetch.
//   - Reads view-model + caller-supplied trade contexts /
//     provider health / capital context only.
//   - Capital values are private; rendered via the
//     consumer panels which apply masking.
// =====================================================

import React from "react";
import { buildLethalBoardViewModel } from "./lethalBoardViewModel.js";
import { COCKPIT_PALETTE } from "./cockpit/cockpitTheme.js";

import OperatorConsole from "./cockpit/OperatorConsole.jsx";
import CapitalCommandBar from "./cockpit/CapitalCommandBar.jsx";
import TopPicksGrid from "./cockpit/TopPicksGrid.jsx";
import RankedCandidatesPanel from "./cockpit/RankedCandidatesPanel.jsx";
import OpportunityDetailPanel from "./cockpit/OpportunityDetailPanel.jsx";
import MarketIntelligencePanel from "./cockpit/MarketIntelligencePanel.jsx";
import AlertsPanel from "./cockpit/AlertsPanel.jsx";

/**
 * @param {object} props
 * @param {object} props.scanResult
 * @param {string|null} [props.selectedSymbol]
 * @param {(sym: string) => void} [props.onSelectSymbol]
 * @param {Record<string, object>} [props.tradeContextBySymbol]
 * @param {object|null} [props.providerHealth]
 * @param {object|null} [props.liveMeta]
 * @param {object|null} [props.scanStatus]
 * @param {Array<object>} [props.recordedAlerts]
 * @param {object|null} [props.recordedAlertsRollup]
 * @param {string} [props.errorMsg]
 * @param {boolean} [props.loading]
 * @param {() => void} props.onRunSamplePreview
 * @param {() => void} props.onRunLivePreview
 * @param {() => void} props.onRunLiveCommit
 * @param {() => void} [props.onBack]
 * @param {object} [props.labels]
 * @param {object} props.capitalCtx                    CapitalContext (private to user)
 * @param {() => void} props.onEditCapital
 * @param {() => void} props.onToggleHideBalances
 * @param {object} [props.cockpitActions]              from useCockpitActions(): isWatching, isCandidate, getAlert, toggleWatch, toggleCandidate, setAlert, clearAlert
 */
export default function LethalBoardCockpit(props) {
  const vm = props.scanResult ? buildLethalBoardViewModel(props.scanResult) : null;
  const rows = vm?.rows || [];
  const summary = vm?.summary || null;
  const selectedRow = rows.find(r => r.symbol === props.selectedSymbol)
    || (vm?.best ? rows.find(r => r.symbol === vm.best.symbol) : null)
    || rows[0]
    || null;

  const selectedTradeContext = props.tradeContextBySymbol && props.selectedSymbol
    ? (props.tradeContextBySymbol[props.selectedSymbol] || null)
    : null;

  return (
    <div
      className="lethal-page"
      style={{
        display: "grid",
        gridTemplateColumns: "280px minmax(0, 1fr)",
        width: "100vw",
        maxWidth: "100vw",
        height: "100vh",
        background: COCKPIT_PALETTE.pageBg,
        color: COCKPIT_PALETTE.text,
        overflow: "hidden",
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}>

      <OperatorConsole
        onRunSamplePreview={props.onRunSamplePreview}
        onRunLivePreview={props.onRunLivePreview}
        onRunLiveCommit={props.onRunLiveCommit}
        loading={props.loading}
        onBack={props.onBack}
        providerHealth={props.providerHealth}
        liveMeta={props.liveMeta}
        scanStatus={props.scanStatus}
        recordedAlerts={props.recordedAlerts}
        recordedAlertsRollup={props.recordedAlertsRollup}
        errorMsg={props.errorMsg}
        labels={props.labels}
        capitalCtx={props.capitalCtx}
        onEditCapital={props.onEditCapital}
        onToggleHideBalances={props.onToggleHideBalances}
      />

      <main
        className="main-workspace"
        style={{
          display: "grid",
          gridTemplateRows: "auto 36% 1fr",
          gap: 16,
          padding: 16,
          overflow: "hidden",
          minWidth: 0,
          minHeight: 0,
          background: COCKPIT_PALETTE.workspaceBg,
        }}>

        {/* 1. CAPITAL COMMAND BAR */}
        <CapitalCommandBar
          summary={summary}
          capitalCtx={props.capitalCtx}
          onEditCapital={props.onEditCapital}
          onToggleHideBalances={props.onToggleHideBalances} />

        {/* 2. TOP PICKS GRID — 36% of viewport, 3 equal cards */}
        <section
          className="top-picks-grid"
          style={{ minWidth: 0, minHeight: 0, overflow: "hidden" }}
          aria-label="Top opportunities">
          {!vm ? (
            <EmptyCanvas
              onRunSamplePreview={props.onRunSamplePreview}
              loading={props.loading} />
          ) : (
            <TopPicksGrid
              rows={rows}
              selectedSymbol={selectedRow?.symbol || null}
              onSelectSymbol={props.onSelectSymbol}
              tradeContextBySymbol={props.tradeContextBySymbol || {}}
              topN={3} />
          )}
        </section>

        {/* 3. LOWER WORKSPACE — 60/40 split, fills remaining height */}
        <section
          className="lower-workspace"
          style={{
            display: "grid",
            gridTemplateColumns: "60% 40%",
            gap: 16,
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
          }}
          aria-label="Lower workspace">
          {/* LEFT 60% — ranked + intel + alerts, vertically split */}
          <div
            className="lower-left"
            style={{
              display: "grid",
              gridTemplateRows: "minmax(0, 1fr) minmax(0, 240px) minmax(0, 200px)",
              gap: 16,
              minWidth: 0,
              minHeight: 0,
              overflow: "hidden",
            }}>
            {vm ? (
              <>
                <RankedCandidatesPanel
                  rows={rows}
                  skipFirstN={3}
                  selectedSymbol={selectedRow?.symbol || null}
                  onSelectSymbol={props.onSelectSymbol}
                  tradeContextBySymbol={props.tradeContextBySymbol || {}} />
                <MarketIntelligencePanel items={null} title="Market intelligence" />
                <AlertsPanel
                  alerts={props.recordedAlerts}
                  alertEventLabel={props.labels?.alertEventLabel}
                  hideBalances={!!props.capitalCtx?.hideBalances} />
              </>
            ) : (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 text-sm text-zinc-500 flex items-center justify-center"
                   style={{ padding: 16 }}>
                Waiting for scan…
              </div>
            )}
          </div>

          {/* RIGHT 40% — opportunity detail panel */}
          <OpportunityDetailPanel
            row={selectedRow}
            tradeContext={selectedTradeContext}
            summary={summary}
            providerHealth={props.providerHealth}
            newsItems={null}
            capitalCtx={props.capitalCtx}
            isWatching={props.cockpitActions?.isWatching}
            isCandidate={props.cockpitActions?.isCandidate}
            getAlert={props.cockpitActions?.getAlert}
            onToggleWatch={props.cockpitActions?.toggleWatch}
            onToggleCandidate={props.cockpitActions?.toggleCandidate}
            onSetAlert={props.cockpitActions?.setAlert}
            onClearAlert={props.cockpitActions?.clearAlert} />
        </section>
      </main>
    </div>
  );
}

// --------------------------------------------------
// EMPTY CANVAS — pre-scan state inside the top-picks slot
// --------------------------------------------------

function EmptyCanvas({ onRunSamplePreview, loading }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 text-center h-full flex flex-col items-center justify-center"
         style={{ padding: 16 }}>
      <div className="text-base font-bold text-zinc-100 mb-1">Cockpit standing by</div>
      <div className="text-xs text-zinc-400 leading-relaxed max-w-xl mx-auto">
        Run a sample scan for an offline demo, a live preview to fetch real data,
        or <span className="text-emerald-400 font-bold">Run &amp; record</span> when you want
        the top opportunity persisted to alert history.
      </div>
      <button
        onClick={onRunSamplePreview}
        disabled={loading}
        className="mt-4 px-3 py-1.5 rounded border border-indigo-500 text-indigo-300 hover:bg-indigo-500/10 text-xs font-bold transition-colors"
        style={{ opacity: loading ? 0.55 : 1 }}>
        Run sample scan
      </button>
    </div>
  );
}
