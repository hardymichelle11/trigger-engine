// =====================================================
// LETHAL BOARD PAGE — host for the discovery view
// =====================================================
// Wraps <LethalBoard /> with state management:
//   - "Run sample scan"   → mock data, preview only
//   - "Run live preview"  → polygonGlue → scanner, preview only
//   - "Run & record"      → live + commits the top result to alert history
//   - Back button         → navigates to caller
//
// Phase 4.1: preview/commit split is owned by lethalBoardScanController,
// which carries a single discoveryAlertWireup so dedup state survives
// across consecutive scans.
//
// This component owns the scan lifecycle. The presentational
// LethalBoard component reads its props as a pure projection.
// =====================================================

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import LethalBoardCockpit from "./LethalBoardCockpit.jsx";
import { runMarketDiscoveryScan } from "../../engines/discovery/marketDiscoveryScanner.js";
import { createPolygonGlue, fetchScannerInputBundle, GLUE_SOURCE } from "../../engines/discovery/polygonGlue.js";
import { UNIVERSE_SOURCE } from "../../engines/discovery/polygonUniverseAdapter.js";
import { recordAlert, loadAlertHistory } from "../../lib/alerts/alertHistory.js";
import {
  createScanController,
  SCAN_MODE,
  SCAN_MODE_LABEL,
  SUPPRESSED_REASON_LABEL,
} from "./lethalBoardScanController.js";
import {
  projectAlertHistory,
  alertEventLabel,
  ALERT_DISPLAY_LIMIT,
} from "./recordedAlertsView.js";
import {
  computeAlertsRollup,
  ROLLUP_CHIP_LABEL,
} from "./recordedAlertsRollup.js";
import { buildTradeConstructionContext } from "./tradeConstructionContext.js";
import { createOptionsChainProvider } from "../../providers/options/optionsChainProvider.js";
import { HEALTH_STATUS } from "../../providers/options/optionsProviderTypes.js";
import { resolveNearestExpiration } from "../../providers/options/expirationResolver.js";
import { useCapitalContext } from "../../lib/capital/useCapitalContext.js";
import { toAccountState } from "../../lib/capital/capitalContext.js";
import CapitalSettingsModal from "./cockpit/CapitalSettingsModal.jsx";
import { useCockpitActions } from "../../lib/cockpit/useCockpitActions.js";

// --------------------------------------------------
// SAMPLE SCAN — used by "Run sample scan" so the UI is
// fully demonstrable without any network access.
// --------------------------------------------------

function buildSampleScan(accountState) {
  const now = Date.now();
  const symbols = ["NVDA", "CRWV", "BE", "INTC", "ZZUNCAT"];
  const marketDataBySymbol = {
    NVDA: {
      symbol: "NVDA", price: 113.5, previousClose: 109,
      volume: 35_000_000, avgVolume: 30_000_000, dollarVolume: 3_900_000_000,
      atr: 2.4, iv: 35, ivPercentile: 65,
      atrExpansion: 1.6, distanceToSupportPct: 1.5, near20DayHigh: true,
      detectedRegime: "RISK_ON", timestamp: now - 60_000,
    },
    CRWV: {
      symbol: "CRWV", price: 95, previousClose: 92.8,
      volume: 12_000_000, avgVolume: 8_000_000, dollarVolume: 1_140_000_000,
      atr: 2.0, iv: 50, ivPercentile: 75,
      atrExpansion: 1.4, distanceToSupportPct: 1.0,
      detectedRegime: "RISK_ON", timestamp: now - 60_000,
    },
    BE: {
      symbol: "BE", price: 30, previousClose: 29.5,
      volume: 8_000_000, avgVolume: 6_000_000, dollarVolume: 240_000_000,
      atr: 0.9, iv: 55, ivPercentile: 70,
      atrExpansion: 1.2, distanceToSupportPct: 0.8,
      detectedRegime: "RISK_ON", timestamp: now - 60_000,
    },
    INTC: {
      symbol: "INTC", price: 32, previousClose: 31.7,
      volume: 25_000_000, avgVolume: 30_000_000, dollarVolume: 800_000_000,
      atr: 0.8, iv: 28, ivPercentile: 35,
      detectedRegime: "RISK_ON", timestamp: now - 60_000,
    },
    ZZUNCAT: {
      symbol: "ZZUNCAT", price: 40, previousClose: 38,
      volume: 4_000_000, avgVolume: 2_000_000, dollarVolume: 160_000_000,
      atr: 1.0,
      detectedRegime: "RISK_ON", timestamp: now - 60_000,
      sector: "Technology", industry: "Software",
    },
  };

  // Phase 4.7.2: accountState is now driven by the operator's private
  // CapitalContext. The hardcoded sample numbers are gone — if the user
  // hasn't configured capital, the scanner sees zeros and surfaces
  // "not_affordable" / capital-pressure warnings honestly.
  return runMarketDiscoveryScan({
    symbols,
    marketDataBySymbol,
    accountState,
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode: "neutral",
    now,
  });
}

async function runLiveScan(accountState) {
  const glue = createPolygonGlue();
  const bundle = await fetchScannerInputBundle({
    glue,
    universeSource: UNIVERSE_SOURCE.SESSION_AWARE,
    fetchChains: true,
  });

  const universeOk = bundle.metadata.universe.source === GLUE_SOURCE.LIVE;
  if (!universeOk || bundle.symbols.length === 0) {
    return { result: null, bundle, errorMsg:
      `Live data unavailable (${bundle.metadata.universe.source}` +
      (bundle.metadata.universe.reason ? ` — ${bundle.metadata.universe.reason}` : "") +
      "). Try \"Run sample scan\" or check the API key / proxy." };
  }

  const result = runMarketDiscoveryScan({
    symbols: bundle.symbols,
    marketDataBySymbol: bundle.marketDataBySymbol,
    optionsDataBySymbol: bundle.optionsDataBySymbol,
    // Phase 4.7.2: accountState is sourced from the operator's private
    // CapitalContext via the page-level useCapitalContext hook. Hardcoded
    // sample numbers retired.
    accountState,
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode: "neutral",
    // Phase 4.5A1: forward session metadata so the scanner uses session-aware
    // freshness thresholds. This is metadata forwarding, not UI hardcoding.
    session: bundle.metadata?.universe?.session,
  });

  const enrichedWarnings = [
    ...(result.warnings || []),
    `Universe: ${bundle.metadata.universe.source} (${bundle.symbols.length} symbols)`,
    `Options: ${bundle.metadata.options.source}` +
      (bundle.metadata.options.capability
        ? ` · capability ${bundle.metadata.options.capability.optionsCapability}`
        : ""),
  ];
  return { result: { ...result, warnings: enrichedWarnings }, bundle, errorMsg: null };
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------

export default function LethalBoardPage({ onBack }) {
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [liveMeta, setLiveMeta] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);
  const [recordedAlerts, setRecordedAlerts] = useState([]);
  // Phase 4.4: lifted selection state. Lives here so Phase 4.5 can observe
  // selectedSymbol and build/cache a per-symbol trade-construction context.
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  // Phase 4.5C: per-symbol live option-chain snapshot cache.
  // Stays empty when ThetaData credentials are absent or terminal is offline.
  // The trade-construction helper renders gracefully without it.
  const [optionSnapshotsBySymbol, setOptionSnapshotsBySymbol] = useState({});
  // Phase 4.5C+1: per-symbol resolved expiration cache. Mirrors the snapshot
  // cache so the trade context always renders alongside its matching
  // expiration (success or reason).
  const [resolvedExpirationBySymbol, setResolvedExpirationBySymbol] = useState({});
  const [providerHealth, setProviderHealth] = useState(null);

  // Phase 4.7.2: private per-user capital context (localStorage-scoped).
  // Drives the scanner's accountState; Edit/Hide actions surface in the
  // Capital Command Bar and Operator Console.
  const { ctx: capitalCtx, saveContext, toggleHideBalances, resetContext } = useCapitalContext();
  const [capitalModalOpen, setCapitalModalOpen] = useState(false);

  // Phase 4.7.4: per-user cockpit actions (watch list, candidates, price alerts).
  // Handlers persist to localStorage scoped by userId; the OpportunityDetailPanel
  // consumes them via the cockpit's prop pipe.
  const cockpitActions = useCockpitActions();

  // Single options provider per session. Falls back to "missing_credentials"
  // when env config is absent or the terminal is offline.
  const optionsProviderRef = useRef(null);
  function getOptionsProvider() {
    if (!optionsProviderRef.current) {
      // Read VITE_* config directly. Vite v8's import-analysis only injects
      // the runtime `import.meta.env = {...}` override when it detects an
      // explicit `import.meta.env.X` access — the previous defensive
      // `import.meta?.env` (with optional chaining) was not matched, so
      // the env arrived empty and the provider reported thetadata_not_enabled.
      const env = {
        VITE_THETADATA_ENABLED: import.meta.env.VITE_THETADATA_ENABLED,
        VITE_THETADATA_BASE_URL: import.meta.env.VITE_THETADATA_BASE_URL,
        VITE_THETADATA_TIMEOUT_MS: import.meta.env.VITE_THETADATA_TIMEOUT_MS,
      };
      optionsProviderRef.current = createOptionsChainProvider({ env });
    }
    return optionsProviderRef.current;
  }

  // One controller per session — keeps bridge dedup state across scans.
  const controllerRef = useRef(null);
  function getController() {
    if (!controllerRef.current) {
      controllerRef.current = createScanController({ recordAlertFn: recordAlert });
    }
    return controllerRef.current;
  }

  // Read-only audit panel: refresh from alertHistory on mount and after each commit.
  const refreshRecordedAlerts = useCallback(() => {
    let raw = [];
    try { raw = loadAlertHistory(); } catch { raw = []; }
    setRecordedAlerts(projectAlertHistory(raw, ALERT_DISPLAY_LIMIT));
  }, []);

  useEffect(() => { refreshRecordedAlerts(); }, [refreshRecordedAlerts]);

  // Phase 4.5C: probe options provider health on mount, then on demand.
  // The probe is cheap (cached at the provider layer); we surface the
  // result only as a status string for the live-status pill.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getOptionsProvider().checkHealth();
        if (!cancelled) setProviderHealth(result);
      } catch {
        // Provider should never throw, but be defensive.
        if (!cancelled) {
          setProviderHealth({ status: HEALTH_STATUS.UNAVAILABLE, reason: "probe_failed" });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Phase 4.5C: when selectedSymbol changes, attempt a single-snapshot fetch
  // for the suggested put strike. Cached per symbol per session. Failure
  // resolves to null silently — Trade Construction stays in "estimated".
  useEffect(() => {
    if (!selectedSymbol || !scanResult) return;
    if (optionSnapshotsBySymbol[selectedSymbol] !== undefined) return;     // already attempted
    const candidate = (scanResult.candidates || []).find(c =>
      String(c?.symbol || "").toUpperCase() === selectedSymbol);
    const est = candidate?.premiumEstimate;
    if (!est?.preferredStrike || !est?.preferredDte) {
      // Mark attempted with null so we don't keep re-probing the same symbol.
      setOptionSnapshotsBySymbol(prev => ({ ...prev, [selectedSymbol]: null }));
      return;
    }
    let cancelled = false;
    (async () => {
      // Phase 4.5C+1: resolve a real chain expiration before snapshot fetch.
      // The provider's fetchExpirations() returns null when the terminal is
      // unreachable, in which case the resolver's reason is set to
      // "no_expirations_available" and the UI stays in "estimated".
      const provider = getOptionsProvider();
      let availableExpirations = null;
      try {
        availableExpirations = typeof provider.fetchExpirations === "function"
          ? await provider.fetchExpirations(selectedSymbol)
          : null;
      } catch {
        availableExpirations = null;
      }
      const resolved = resolveNearestExpiration({
        availableExpirations: availableExpirations || [],
        targetDte: Number(est.preferredDte),
      });

      let snapshot = null;
      if (resolved.expiration) {
        try {
          snapshot = await provider.fetchSnapshot({
            symbol: selectedSymbol,
            expiration: resolved.expiration,
            strike: est.preferredStrike,
            right: "put",
          });
        } catch {
          snapshot = null;
        }
      }
      if (!cancelled) {
        setOptionSnapshotsBySymbol(prev => ({ ...prev, [selectedSymbol]: snapshot }));
        setResolvedExpirationBySymbol(prev => ({ ...prev, [selectedSymbol]: resolved }));
      }
    })();
    return () => { cancelled = true; };
  }, [selectedSymbol, scanResult, optionSnapshotsBySymbol]);

  // Default selection: best-use-of-capital, falling back to the first ranked
  // candidate. Reset whenever the scan result changes — including when the
  // previously-selected ticker is no longer present in the new scan.
  useEffect(() => {
    if (!scanResult) {
      if (selectedSymbol !== null) setSelectedSymbol(null);
      return;
    }
    const ranked = Array.isArray(scanResult.ranked) ? scanResult.ranked : [];
    const symbols = ranked.map(r => r?.symbol);
    if (selectedSymbol && symbols.includes(selectedSymbol)) return;
    const best = ranked.find(r => r?.bestUseOfCapital)?.symbol;
    const fallback = symbols[0] || null;
    setSelectedSymbol(best || fallback);
  // selectedSymbol intentionally excluded from deps: this effect only runs to
  // (re)seed selection on a new scan; user clicks update selection directly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanResult]);

  function applyResult(result, mode) {
    const out = getController().processScan({ scanResult: result, mode });
    setScanResult(out.scanResult);
    setScanStatus(out.status);
    if (mode === SCAN_MODE.COMMIT_LIVE) {
      // Always re-read after a commit attempt — even if recorded=false the
      // panel should reflect the current persisted state, not stale data.
      refreshRecordedAlerts();
    }
  }

  const runSamplePreview = useCallback(() => {
    setErrorMsg("");
    setLiveMeta({ source: "sample", reason: "deterministic mock data" });
    applyResult(buildSampleScan(toAccountState(capitalCtx)), SCAN_MODE.PREVIEW_SAMPLE);
  }, [capitalCtx]);

  const runLivePreview = useCallback(async () => {
    setLoading(true); setErrorMsg(""); setLiveMeta(null);
    try {
      const { result, bundle, errorMsg: e } = await runLiveScan(toAccountState(capitalCtx));
      setLiveMeta(bundle.metadata);
      if (e) {
        setErrorMsg(e);
        setScanResult(null);
        setScanStatus(null);
        return;
      }
      applyResult(result, SCAN_MODE.PREVIEW_LIVE);
    } catch (err) {
      setErrorMsg(`Unexpected error: ${err?.message || String(err)}`);
      setScanResult(null);
      setScanStatus(null);
    } finally { setLoading(false); }
  }, [capitalCtx]);

  const runLiveCommit = useCallback(async () => {
    setLoading(true); setErrorMsg(""); setLiveMeta(null);
    try {
      const { result, bundle, errorMsg: e } = await runLiveScan(toAccountState(capitalCtx));
      setLiveMeta(bundle.metadata);
      if (e) {
        setErrorMsg(e);
        setScanResult(null);
        setScanStatus(null);
        return;
      }
      applyResult(result, SCAN_MODE.COMMIT_LIVE);
    } catch (err) {
      setErrorMsg(`Unexpected error: ${err?.message || String(err)}`);
      setScanResult(null);
      setScanStatus(null);
    } finally { setLoading(false); }
  }, [capitalCtx]);

  // Phase 4.7: per-symbol trade-construction contexts so the cockpit's
  // top opportunity grid can show suggested expiration / strike / live
  // bid/ask chips for each top pick. Live snapshot + resolved expiration
  // are still only fetched for `selectedSymbol` (Phase 4.5C/C+1) — for
  // other rows the context is built without those caches and renders
  // the legacy estimated values (premium source = "estimated").
  const tradeContextBySymbol = useMemo(() => {
    if (!scanResult) return {};
    const ranked = Array.isArray(scanResult.ranked) ? scanResult.ranked : [];
    const out = {};
    for (const r of ranked) {
      if (!r?.symbol) continue;
      out[r.symbol] = buildTradeConstructionContext({
        scanResult,
        selectedSymbol: r.symbol,
        chartContextBySymbol: null,
        optionChainSnapshot: optionSnapshotsBySymbol[r.symbol] ?? null,
        resolvedExpiration: resolvedExpirationBySymbol[r.symbol] ?? null,
      });
    }
    return out;
  }, [scanResult, optionSnapshotsBySymbol, resolvedExpirationBySymbol]);

  return (
    <>
      <LethalBoardCockpit
        scanResult={scanResult}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={setSelectedSymbol}
        tradeContextBySymbol={tradeContextBySymbol}
        providerHealth={providerHealth}
        liveMeta={liveMeta}
        scanStatus={scanStatus}
        recordedAlerts={recordedAlerts}
        recordedAlertsRollup={computeAlertsRollup(recordedAlerts)}
        errorMsg={errorMsg}
        loading={loading}
        onRunSamplePreview={runSamplePreview}
        onRunLivePreview={runLivePreview}
        onRunLiveCommit={runLiveCommit}
        onBack={onBack}
        labels={{
          scanModeLabel: SCAN_MODE_LABEL,
          suppressedReasonLabel: SUPPRESSED_REASON_LABEL,
          alertEventLabel,
          rollupChipLabel: ROLLUP_CHIP_LABEL,
        }}
        capitalCtx={capitalCtx}
        onEditCapital={() => setCapitalModalOpen(true)}
        onToggleHideBalances={toggleHideBalances}
        onCapitalPatch={saveContext}
        cockpitActions={cockpitActions}
      />
      <CapitalSettingsModal
        open={capitalModalOpen}
        onClose={() => setCapitalModalOpen(false)}
        ctx={capitalCtx}
        onSave={saveContext}
        onReset={resetContext} />
    </>
  );
}
