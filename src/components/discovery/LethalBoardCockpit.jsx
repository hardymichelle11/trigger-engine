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
import { fetchNews, fetchNewsForTickers } from "../../lib/newsFeed.js";
import RefreshStatusBar from "./cockpit/RefreshStatusBar.jsx";
import { buildNewsThesis } from "../../lib/newsIntelligence.js";
import { buildCandidateIntelligenceSummary } from "../../lib/candidateIntelligence.js";
import { buildEntryReadiness } from "../../lib/entryReadiness.js";

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
 * @param {() => void} [props.onRunReplayLastClose]    Phase 4.7.6 — replay last completed session
 * @param {() => void} [props.onBack]
 * @param {object} [props.labels]
 * @param {object} props.capitalCtx                    CapitalContext (private to user)
 * @param {() => void} props.onEditCapital
 * @param {() => void} props.onToggleHideBalances
 * @param {(patch: object) => void} [props.onSaveCapital]   inline capital edits from the operator console
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

  // -- Live news feeds --------------------------------------------------
  // Workspace intel: aggregate news for the top-3 ranked tickers (so the
  // operator and any downstream model see real, sentiment-tagged news
  // for what's actually being recommended this cycle).
  const topTickers = React.useMemo(
    () => rows.slice(0, 3).map((r) => r.symbol).filter(Boolean),
    [rows],
  );
  const [workspaceNews, setWorkspaceNews] = React.useState([]);
  React.useEffect(() => {
    let cancelled = false;
    if (topTickers.length === 0) {
      setWorkspaceNews([]);
      return undefined;
    }
    fetchNewsForTickers(topTickers, 4).then((items) => {
      if (!cancelled) setWorkspaceNews(items);
    });
    return () => { cancelled = true; };
  }, [topTickers.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detail panel: news for the currently-selected ticker only.
  const selectedSymbol = selectedRow?.symbol || null;
  const [detailNews, setDetailNews] = React.useState([]);
  React.useEffect(() => {
    let cancelled = false;
    if (!selectedSymbol) {
      setDetailNews([]);
      return undefined;
    }
    fetchNews({ ticker: selectedSymbol, limit: 6 }).then((items) => {
      if (!cancelled) setDetailNews(items);
    });
    return () => { cancelled = true; };
  }, [selectedSymbol]);

  // News thesis — narrative summary built from enriched articles.
  // Computed per render off the latest fetched news; cheap, no I/O.
  const workspaceNewsThesis = React.useMemo(
    () => buildNewsThesis(topTickers[0] || null, workspaceNews),
    [workspaceNews, topTickers],
  );
  const detailNewsThesis = React.useMemo(
    () => buildNewsThesis(selectedSymbol, detailNews),
    [detailNews, selectedSymbol],
  );

  // Candidate intelligence summary for the selected row. Engine posture
  // comes from the row; news context comes from detailNews. The summary
  // never lets news override the engine — a WAIT row stays a wait even
  // if news is positive.
  const candidateIntelligence = React.useMemo(
    () =>
      selectedRow
        ? buildCandidateIntelligenceSummary(selectedRow, detailNews)
        : null,
    [selectedRow, detailNews],
  );

  // Entry readiness — the operator-safety gate. Distinct from candidate
  // intelligence: that one *describes* the setup, this one decides
  // whether the operator should act on it RIGHT NOW. Built from the
  // selected row + the trade-context provenance flags.
  const entryReadiness = React.useMemo(
    () =>
      selectedRow
        ? buildEntryReadiness(selectedRow, selectedTradeContext)
        : null,
    [selectedRow, selectedTradeContext],
  );

  return (
    <div
      className="lethal-page"
      style={{
        display: "grid",
        gridTemplateColumns: "280px minmax(0, 1fr)",
        width: "100vw",
        maxWidth: "100vw",
        // Use min-height + page-level scroll so the layout never clips content
        // on shorter viewports (laptops, windowed browsers, devtools open).
        // The cockpit still feels like a full-height workspace when there's
        // room; when there isn't, the page scrolls instead of slicing panels.
        minHeight: "100vh",
        background: COCKPIT_PALETTE.pageBg,
        color: COCKPIT_PALETTE.text,
        overflowX: "hidden",
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      }}>

      <OperatorConsole
        onRunSamplePreview={props.onRunSamplePreview}
        onRunLivePreview={props.onRunLivePreview}
        onRunLiveCommit={props.onRunLiveCommit}
        onRunReplayLastClose={props.onRunReplayLastClose}
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
        onSaveCapital={props.onSaveCapital}
      />

      <main
        className="main-workspace"
        style={{
          display: "grid",
          // Top picks gets a 360px floor; the rest sizes naturally now that
          // the page can scroll. Removed `1fr` on the lower workspace so it
          // takes its natural height instead of being squeezed when there
          // isn't enough viewport space.
          gridTemplateRows: "auto minmax(360px, auto) auto",
          gap: 16,
          padding: 16,
          minWidth: 0,
          minHeight: 0,
          background: COCKPIT_PALETTE.workspaceBg,
        }}>

        {/* 1. CAPITAL COMMAND BAR + REFRESH STATUS BAR */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <CapitalCommandBar
            summary={summary}
            capitalCtx={props.capitalCtx}
            liveMeta={props.liveMeta}
            onEditCapital={props.onEditCapital}
            onToggleHideBalances={props.onToggleHideBalances} />
          {/* Refresh status: session, auto/paused, freshness, manual tick.
              Single source of truth for "is the data the operator sees
              actually current?" */}
          {props.sessionState && (
            <RefreshStatusBar
              sessionState={props.sessionState}
              autoRefreshEnabled={!!props.autoRefreshEnabled}
              onToggleAutoRefresh={props.onToggleAutoRefresh}
              onRefreshNow={props.onRunLivePreview}
              refreshInFlight={!!props.loading}
              quoteAgeMs={props.analyticsAgeMs}
              analyticsAgeMs={props.analyticsAgeMs}
              policyReason={props.refreshPolicy?.reason || ""} />
          )}
        </div>

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
              topN={3}
              replay={!!props.liveMeta?.replay}
              replaySessionDate={
                props.liveMeta?.universe?.sessionDateLabel
                  || props.liveMeta?.sessionDateLabel
                  || null
              } />
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
              // Phase 4.7.5.3: was `1fr 240px 200px` with minmax(0,...) so
              // panels could collapse to 0. Switched to `1fr auto auto` —
              // Intel and Alerts always render their natural height; the
              // ranked-candidates panel (1fr) absorbs all the slack and
              // scrolls internally.
              gridTemplateRows: "minmax(0, 1fr) auto auto",
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
                <MarketIntelligencePanel
                  items={workspaceNews.length > 0 ? workspaceNews : null}
                  title="Market intelligence"
                  newsThesis={workspaceNewsThesis} />
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
            newsItems={detailNews.length > 0 ? detailNews : null}
            newsThesis={detailNewsThesis}
            candidateIntelligence={candidateIntelligence}
            entryReadiness={entryReadiness}
            capitalCtx={props.capitalCtx}
            replay={!!props.liveMeta?.replay}
            replaySessionDate={
              props.liveMeta?.universe?.sessionDateLabel
                || props.liveMeta?.sessionDateLabel
                || null
            }
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
