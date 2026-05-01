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

import React, { useState, useCallback, useRef, useEffect } from "react";
import LethalBoard from "./LethalBoard.jsx";
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

// --------------------------------------------------
// SAMPLE SCAN — used by "Run sample scan" so the UI is
// fully demonstrable without any network access.
// --------------------------------------------------

function buildSampleScan() {
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

  return runMarketDiscoveryScan({
    symbols,
    marketDataBySymbol,
    accountState: {
      totalAccountValue: 60_000, availableCash: 50_000,
      maxDeployedPct: 0.65, reservedCashBufferPct: 0.20,
      marketMode: "neutral",
    },
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode: "neutral",
    now,
  });
}

async function runLiveScan() {
  const glue = createPolygonGlue();
  const bundle = await fetchScannerInputBundle({
    glue,
    universeSource: UNIVERSE_SOURCE.MOST_ACTIVE,
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
    accountState: {
      totalAccountValue: 60_000, availableCash: 50_000,
      maxDeployedPct: 0.65, reservedCashBufferPct: 0.20,
      marketMode: "neutral",
    },
    regimeContext: { detectedRegime: "RISK_ON" },
    scannerMode: "neutral",
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
    applyResult(buildSampleScan(), SCAN_MODE.PREVIEW_SAMPLE);
  }, []);

  const runLivePreview = useCallback(async () => {
    setLoading(true); setErrorMsg(""); setLiveMeta(null);
    try {
      const { result, bundle, errorMsg: e } = await runLiveScan();
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
  }, []);

  const runLiveCommit = useCallback(async () => {
    setLoading(true); setErrorMsg(""); setLiveMeta(null);
    try {
      const { result, bundle, errorMsg: e } = await runLiveScan();
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
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0f14", color: "#e4e4e7", padding: 16, fontFamily: "'JetBrains Mono','Fira Code',ui-monospace,monospace" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {onBack && (
          <button onClick={onBack}
            style={{ padding: "6px 12px", background: "transparent", border: "1px solid #1e2530", borderRadius: 6, color: "#9ca3af", fontSize: 11, cursor: "pointer" }}>
            ← Back
          </button>
        )}
        <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.18em" }}>DISCOVERY LAYER</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>Lethal Board</div>
        <div style={{ flex: 1 }} />

        <button onClick={runSamplePreview} disabled={loading}
          style={{ padding: "6px 12px", background: "transparent", border: "1px solid #6366f1",
                   borderRadius: 6, color: "#a5b4fc", fontSize: 11, fontWeight: 700,
                   cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
          Run sample scan
        </button>

        <button onClick={runLivePreview} disabled={loading}
          style={{ padding: "6px 12px", background: "transparent", border: "1px solid #38bdf8",
                   borderRadius: 6, color: "#7dd3fc", fontSize: 11, fontWeight: 700,
                   cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Scanning…" : "Run live preview"}
        </button>

        <button onClick={runLiveCommit} disabled={loading} title="Live scan that records the top opportunity to alert history"
          style={{ padding: "6px 12px", background: "#065f46", border: "1px solid #22c55e",
                   borderRadius: 6, color: "#22c55e", fontSize: 11, fontWeight: 700,
                   cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
          Run &amp; record
        </button>
      </div>

      <NavHelp />

      {errorMsg && (
        <div style={{ background: "#3f1d1d", border: "1px solid #b91c1c", borderRadius: 8,
                      padding: 12, marginBottom: 12, color: "#fca5a5", fontSize: 12 }}>
          {errorMsg}
        </div>
      )}

      {liveMeta && (
        <div style={{ background: "#0f1620", border: "1px solid #1e2530", borderRadius: 8,
                      padding: 10, marginBottom: 8, fontSize: 11, color: "#9ca3af" }}>
          <strong style={{ color: "#e4e4e7" }}>Live status:</strong>{" "}
          {renderLiveMetaSummary(liveMeta)}
        </div>
      )}

      {scanStatus && <ScanStatusPanel status={scanStatus} />}

      <RecordedAlertsPanel alerts={recordedAlerts} />

      {!scanResult && !errorMsg && (
        <EmptyState onRunSample={runSamplePreview} loading={loading} />
      )}

      {scanResult && (
        <LethalBoard scanResult={scanResult} title="Lethal Board" />
      )}
    </div>
  );
}

// --------------------------------------------------
// STATUS PANEL — explains preview vs recorded
// --------------------------------------------------

function ScanStatusPanel({ status }) {
  if (!status) return null;
  const recordedTone = status.recorded ? "#22c55e" : status.suppressedReason === "preview_mode" ? "#a5b4fc" : "#f59e0b";
  const modeLabel = SCAN_MODE_LABEL[status.mode] || status.mode;
  const reasonLabel = status.suppressedReason
    ? (SUPPRESSED_REASON_LABEL[status.suppressedReason] || status.suppressedReason)
    : null;

  return (
    <div style={{ background: "#0f1620", border: "1px solid #1e2530", borderRadius: 8,
                  padding: 10, marginBottom: 12, fontSize: 11,
                  display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
      <span style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.18em" }}>LAST SCAN</span>
      <span><span style={{ color: "#9ca3af" }}>mode:</span> <span style={{ color: "#e4e4e7", fontWeight: 700 }}>{modeLabel}</span></span>
      <span><span style={{ color: "#9ca3af" }}>event:</span> <span style={{ color: "#e4e4e7" }}>{status.event || "—"}</span></span>
      <span><span style={{ color: "#9ca3af" }}>recorded:</span>{" "}
        <span style={{ color: recordedTone, fontWeight: 700 }}>{status.recorded ? "true" : "false"}</span>
      </span>
      {reasonLabel && (
        <span><span style={{ color: "#9ca3af" }}>reason:</span> <span style={{ color: "#cbd5e1" }}>{reasonLabel}</span></span>
      )}
    </div>
  );
}

// --------------------------------------------------
// NAV HELP — one-line usage guide above the page body
// --------------------------------------------------

function NavHelp() {
  return (
    <div style={{ background: "#0f1620", border: "1px solid #1e2530", borderRadius: 8,
                  padding: "8px 12px", marginBottom: 12, fontSize: 11, color: "#9ca3af",
                  lineHeight: 1.6 }}>
      <span style={{ color: "#e4e4e7", fontWeight: 700 }}>How to use:</span>
      {" "}
      <span style={{ color: "#a5b4fc", fontWeight: 700 }}>Run sample scan</span>
      {" "}offline demo with mock data ·{" "}
      <span style={{ color: "#7dd3fc", fontWeight: 700 }}>Run live preview</span>
      {" "}real data, nothing saved ·{" "}
      <span style={{ color: "#22c55e", fontWeight: 700 }}>Run &amp; record</span>
      {" "}real data + saves the top opportunity to alert history. Use{" "}
      <span style={{ color: "#9ca3af", fontWeight: 700 }}>← Back</span>
      {" "}to return to the Trigger Engine.
    </div>
  );
}

// --------------------------------------------------
// RECORDED ALERTS PANEL — read-only audit view
// --------------------------------------------------

function RecordedAlertsPanel({ alerts }) {
  const safe = Array.isArray(alerts) ? alerts : [];
  // Phase 4.3: rollup is derived from the SANITIZED projection that was already
  // passed in as `alerts`. We do not call loadAlertHistory here — the chip
  // mirrors the currently displayed audit list and nothing more.
  const rollup = computeAlertsRollup(safe);
  return (
    <div style={{ background: "#0f1620", border: "1px solid #1e2530", borderRadius: 8,
                  padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.18em" }}>
          RECORDED DISCOVERY ALERTS
        </div>
        <div style={{ fontSize: 10, color: "#6b7280" }}>
          {safe.length === 0 ? "0" : `latest ${safe.length}`}
        </div>
        <div style={{ flex: 1 }} />
        <RecordedAlertsRollupChip rollup={rollup} />
      </div>
      {safe.length === 0 ? (
        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
          No recorded discovery alerts yet. Run &amp; record to commit one.
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex",
                     flexDirection: "column", gap: 6 }}>
          {safe.map((a, i) => (
            <RecordedAlertRow key={`${a.symbol}-${a.timestamp || i}`} alert={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RecordedAlertsRollupChip({ rollup }) {
  const r = rollup || { today: 0, thisWeek: 0, newBest: 0, displaced: 0 };
  const cells = [
    { label: ROLLUP_CHIP_LABEL.today, value: r.today, tone: "#a5b4fc" },
    { label: ROLLUP_CHIP_LABEL.thisWeek, value: r.thisWeek, tone: "#a5b4fc" },
    { label: ROLLUP_CHIP_LABEL.newBest, value: r.newBest, tone: "#22c55e" },
    { label: ROLLUP_CHIP_LABEL.displaced, value: r.displaced, tone: "#f59e0b" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10 }}>
      {cells.map((c) => (
        <span key={c.label}
          style={{ display: "inline-flex", gap: 4, alignItems: "baseline",
                   padding: "2px 8px", border: "1px solid #1e2530",
                   borderRadius: 999, background: "#0b1119" }}>
          <span style={{ color: "#9ca3af", letterSpacing: "0.05em" }}>{c.label}</span>
          <span style={{ color: c.tone, fontWeight: 700, fontFeatureSettings: "'tnum'" }}>
            {c.value}
          </span>
        </span>
      ))}
    </div>
  );
}

function RecordedAlertRow({ alert }) {
  const eventTone = alert.event === "trade_displaced_by_better_opportunity"
    ? "#f59e0b" : "#22c55e";
  return (
    <li style={{ display: "grid",
                 gridTemplateColumns: "minmax(120px, 160px) minmax(80px, 120px) 1fr",
                 gap: 10, alignItems: "baseline", fontSize: 11,
                 padding: "6px 8px", background: "#0b1119", border: "1px solid #1e2530",
                 borderRadius: 6 }}>
      <span style={{ color: "#9ca3af", fontFeatureSettings: "'tnum'" }}>
        {alert.timestampLabel}
      </span>
      <span>
        <span style={{ color: "#e4e4e7", fontWeight: 700 }}>{alert.symbol}</span>
        {alert.bestUseOfCapital && (
          <span style={{ marginLeft: 4, color: "#22c55e" }}>★</span>
        )}
      </span>
      <span style={{ color: "#cbd5e1" }}>
        <span style={{ color: eventTone, fontWeight: 700 }}>
          {alertEventLabel(alert.event)}
        </span>
        {alert.action && (
          <span style={{ color: "#9ca3af" }}> · {alert.action}</span>
        )}
        {alert.score != null && (
          <span style={{ color: "#9ca3af" }}> · score {alert.score}</span>
        )}
        {alert.displacedFrom && (
          <span style={{ color: "#9ca3af" }}> · displaced {alert.displacedFrom}</span>
        )}
      </span>
    </li>
  );
}

function renderLiveMetaSummary(meta) {
  if (!meta) return "—";
  if (meta.source === "sample") return `sample data — ${meta.reason}`;
  const parts = [];
  if (meta.universe) parts.push(`universe=${meta.universe.source}`);
  if (meta.options) parts.push(`options=${meta.options.source}`);
  if (meta.options?.capability) parts.push(`capability=${meta.options.capability.optionsCapability}`);
  if (meta.circuit) parts.push(`circuit=${meta.circuit.state}`);
  return parts.join(" · ");
}

function EmptyState({ onRunSample, loading }) {
  return (
    <div style={{ background: "#0f1620", border: "1px solid #1e2530", borderRadius: 12,
                  padding: 24, textAlign: "center", color: "#9ca3af" }}>
      <div style={{ fontSize: 14, marginBottom: 8, color: "#e4e4e7", fontWeight: 600 }}>
        No scan loaded
      </div>
      <div style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>
        Run a sample scan to demo the view offline, or run a live preview to fetch
        most-active tickers + option chains via your Polygon proxy. Use "Run &amp; record"
        when you want the top opportunity persisted to alert history.
      </div>
      <button onClick={onRunSample} disabled={loading}
        style={{ padding: "8px 16px", background: "transparent", border: "1px solid #6366f1",
                 borderRadius: 6, color: "#a5b4fc", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        Run sample scan
      </button>
    </div>
  );
}
