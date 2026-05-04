// =====================================================
// OPERATOR CONSOLE (Phase 4.7.5.x — mission-control redesign)
// =====================================================
// Mission-control left rail. Five visible blocks:
//
//   CAPITAL       — inline Start + Deployable editors,
//                   Hide toggle, "Edit Capital → modal" link
//   MODE          — 4-state market-mode toggle
//                   (defensive / neutral / risk_on / opportunistic)
//   ACTIONS       — Run Scan (sample), Live Preview (real),
//                   Run & Record (persist)
//   ALERTS        — compressed 4-chip rollup
//                   (24h / 7d / new best / displaced)
//   DIAGNOSTICS   — collapsed disclosure: Polygon universe,
//                   ThetaData options, Last scan, recorded
//                   detail. Errors stay visible at the top.
//
// Hard rules:
//   - PURE presentational; no fetch, no engine call.
//   - Reads sanitized recorded-alert projections only.
//   - Never exposes scoreBreakdown / weights / probability
//     internals / debug fields.
//   - Capital values are NEVER logged or transmitted. Mask
//     is applied at the render layer only.
// =====================================================

import React, { useEffect, useState } from "react";
import {
  maskMoney,
  maskPercent,
  isCapitalContextUnconfigured,
  CAPITAL_MARKET_MODES,
} from "../../../lib/capital/capitalContext.js";
import HideBalancesToggle from "./HideBalancesToggle.jsx";
import { COCKPIT_PALETTE, COCKPIT_SCROLL_CLASS } from "./cockpitTheme.js";

// --------------------------------------------------
// PUBLIC COMPONENT
// --------------------------------------------------

/**
 * @param {object} props
 * @param {() => void} props.onRunSamplePreview
 * @param {() => void} props.onRunLivePreview
 * @param {() => void} props.onRunLiveCommit
 * @param {() => void} [props.onRunReplayLastClose]    Phase 4.7.6 — replay last completed session
 * @param {boolean} [props.loading]
 * @param {() => void} [props.onBack]
 * @param {object|null} [props.providerHealth]
 * @param {object|null} [props.liveMeta]
 * @param {object|null} [props.scanStatus]
 * @param {Array<object>} [props.recordedAlerts]
 * @param {object} [props.recordedAlertsRollup]
 * @param {string} [props.errorMsg]
 * @param {object} [props.labels]
 * @param {object} props.capitalCtx
 * @param {(patch: object) => void} [props.onSaveCapital]   inline capital edits
 * @param {() => void} props.onEditCapital                  open full settings modal
 * @param {() => void} props.onToggleHideBalances
 */
export default function OperatorConsole(props) {
  const [collapsed, setCollapsed] = useState(false);
  const [diagOpen,  setDiagOpen]  = useState(false);

  if (collapsed) {
    return (
      <aside
        style={{
          flex: "none", width: 32, height: "100%",
          background: COCKPIT_PALETTE.consoleBg,
          borderRight: `1px solid ${COCKPIT_PALETTE.border}`,
          padding: 8,
        }}
        aria-label="Operator console (collapsed)">
        <button
          onClick={() => setCollapsed(false)}
          title="Expand operator console"
          style={{
            width: "100%", color: COCKPIT_PALETTE.textFaint,
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 12,
          }}>
          ›
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={COCKPIT_SCROLL_CLASS}
      style={{
        flex: "none", width: 280, height: "100%",
        background: COCKPIT_PALETTE.consoleBg,
        borderRight: `1px solid ${COCKPIT_PALETTE.border}`,
        overflowY: "auto", overflowX: "hidden",
        padding: 16, minWidth: 0,
      }}
      aria-label="Operator console">
      <SidebarHeader onBack={props.onBack} onCollapse={() => setCollapsed(true)} />

      {props.errorMsg && <ErrorBlock message={props.errorMsg} />}

      <CapitalBlock
        ctx={props.capitalCtx}
        onSaveCapital={props.onSaveCapital}
        onEditCapital={props.onEditCapital}
        onToggleHideBalances={props.onToggleHideBalances} />

      <ModeBlock
        ctx={props.capitalCtx}
        onSaveCapital={props.onSaveCapital} />

      <ActionsBlock
        loading={!!props.loading}
        onRunSamplePreview={props.onRunSamplePreview}
        onRunLivePreview={props.onRunLivePreview}
        onRunLiveCommit={props.onRunLiveCommit}
        onRunReplayLastClose={props.onRunReplayLastClose} />

      <AlertsRollupBlock
        rollup={props.recordedAlertsRollup}
        labels={props.labels} />

      <DiagnosticsBlock
        open={diagOpen}
        onToggle={() => setDiagOpen(v => !v)}
        liveMeta={props.liveMeta}
        providerHealth={props.providerHealth}
        scanStatus={props.scanStatus}
        recordedAlerts={props.recordedAlerts}
        labels={props.labels} />
    </aside>
  );
}

// --------------------------------------------------
// HEADER
// --------------------------------------------------

function SidebarHeader({ onBack, onCollapse }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 14, paddingBottom: 10,
      borderBottom: `1px solid ${COCKPIT_PALETTE.border}`,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
          color: COCKPIT_PALETTE.textFaint,
        }}>Operator console</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: COCKPIT_PALETTE.text }}>
          Lethal Board
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flex: "0 0 auto" }}>
        {onBack && (
          <button onClick={onBack}
            title="Back to Trigger Engine"
            style={{
              fontSize: 10, padding: "4px 8px",
              background: "transparent",
              border: `1px solid ${COCKPIT_PALETTE.border}`,
              color: COCKPIT_PALETTE.textDim,
              borderRadius: 4, cursor: "pointer",
            }}>
            ← Back
          </button>
        )}
        <button onClick={onCollapse}
          title="Collapse console"
          style={{
            fontSize: 12, color: COCKPIT_PALETTE.textFaint,
            background: "transparent", border: "none", cursor: "pointer",
            padding: "0 4px",
          }}>
          ‹
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------
// CAPITAL — inline editors + modal trigger + hide toggle
// --------------------------------------------------

function CapitalBlock({ ctx, onSaveCapital, onEditCapital, onToggleHideBalances }) {
  const safe = ctx || {};
  const hide = !!safe.hideBalances;
  const unconfigured = isCapitalContextUnconfigured(safe);

  // Canonical mask calls — referenced by phase tests AND used as the
  // hide-mode display values for the inline editors. availableCash /
  // reservedCashBufferPct are not editable inline (they live in the
  // modal) but their masked values surface in the Edit Capital tooltip.
  const startMasked      = maskMoney(safe.startingCapital, hide);
  const deployableMasked = maskMoney(safe.deployableCapital, hide);
  const availableMasked  = maskMoney(safe.availableCash, hide);
  const bufferMasked     = maskPercent(safe.reservedCashBufferPct, hide);

  return (
    <SectionShell title="Capital" ariaLabel="Capital settings">
      <div style={{ position: "absolute", top: -2, right: 0 }}>
        <HideBalancesToggle hidden={hide} onToggle={onToggleHideBalances} size="sm" />
      </div>

      {unconfigured && (
        <div style={{
          fontSize: 11, color: COCKPIT_PALETTE.accentAmber,
          lineHeight: 1.35, marginBottom: 8,
        }}>
          Not configured. Set Start + Deployable to enable accurate rankings.
        </div>
      )}

      <InlineMoneyRow
        label="Start"
        value={safe.startingCapital}
        masked={startMasked}
        hide={hide}
        onCommit={(v) => onSaveCapital && onSaveCapital({ startingCapital: v })} />
      <InlineMoneyRow
        label="Deployable"
        value={safe.deployableCapital}
        masked={deployableMasked}
        hide={hide}
        onCommit={(v) => onSaveCapital && onSaveCapital({ deployableCapital: v })} />

      <button
        onClick={onEditCapital}
        title={`Edit capital — available ${availableMasked}, buffer ${bufferMasked}`}
        aria-label="Edit capital"
        style={{
          marginTop: 8, width: "100%",
          background: "transparent",
          border: `1px solid ${COCKPIT_PALETTE.border}`,
          color: COCKPIT_PALETTE.textDim,
          padding: "6px 8px", borderRadius: 6,
          fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
          cursor: "pointer", textAlign: "left",
        }}>
        Edit Capital →
      </button>
    </SectionShell>
  );
}

function InlineMoneyRow({ label, value, masked, hide, onCommit }) {
  const numeric = Number(value) || 0;
  const [draft, setDraft]     = useState(String(numeric || ""));
  const [editing, setEditing] = useState(false);

  // Refresh draft when external value changes (e.g., the modal saves)
  // — but only when the user isn't actively typing.
  useEffect(() => {
    if (!editing) setDraft(String(numeric || ""));
  }, [numeric, editing]);

  const commit = () => {
    setEditing(false);
    const cleaned = String(draft).replace(/[^0-9.]/g, "");
    const n = cleaned === "" ? 0 : Number(cleaned);
    if (Number.isFinite(n) && n >= 0 && n !== numeric) {
      onCommit(n);
    } else {
      setDraft(String(numeric || ""));
    }
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 8, marginBottom: 6,
    }}>
      <span style={{
        fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase",
        color: COCKPIT_PALETTE.textFaint, flex: "0 0 auto",
      }}>{label}</span>
      {hide ? (
        <span style={{
          fontSize: 13, fontWeight: 700, color: COCKPIT_PALETTE.textDim,
          fontFeatureSettings: "'tnum'",
        }}>{masked}</span>
      ) : (
        <input
          type="text"
          inputMode="numeric"
          value={editing
            ? draft
            : (numeric > 0 ? "$" + numeric.toLocaleString() : "")}
          placeholder="$0"
          aria-label={`${label} capital`}
          onFocus={(e) => {
            setEditing(true);
            setDraft(String(numeric || ""));
            const node = e.currentTarget;
            requestAnimationFrame(() => { try { node.select(); } catch { /* noop */ } });
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") { setEditing(false); setDraft(String(numeric || "")); }
          }}
          style={{
            flex: "1 1 auto", minWidth: 0, textAlign: "right",
            background: COCKPIT_PALETTE.inputBg,
            border: `1px solid ${COCKPIT_PALETTE.border}`,
            borderRadius: 4,
            color: COCKPIT_PALETTE.text,
            padding: "4px 6px",
            fontSize: 13, fontWeight: 700,
            fontFeatureSettings: "'tnum'",
          }} />
      )}
    </div>
  );
}

// --------------------------------------------------
// MODE — 4-state market-mode toggle
// --------------------------------------------------

function ModeBlock({ ctx, onSaveCapital }) {
  const current = (ctx && ctx.marketMode) || "neutral";
  return (
    <SectionShell title="Mode">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {CAPITAL_MARKET_MODES.map((m) => {
          const active = m === current;
          return (
            <button key={m}
              onClick={() => onSaveCapital && onSaveCapital({ marketMode: m })}
              title={`Set market mode: ${m.replace(/_/g, " ")}`}
              style={{
                fontSize: 9, fontWeight: 700,
                letterSpacing: "0.10em", textTransform: "uppercase",
                padding: "6px 4px", borderRadius: 4, cursor: "pointer",
                background: active ? "rgba(20,184,166,0.12)" : "transparent",
                color: active ? COCKPIT_PALETTE.accentTeal : COCKPIT_PALETTE.textDim,
                border: `1px solid ${active
                  ? COCKPIT_PALETTE.accentTeal
                  : COCKPIT_PALETTE.border}`,
              }}>
              {m.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>
    </SectionShell>
  );
}

// --------------------------------------------------
// ACTIONS — three buttons with clear hierarchy
// --------------------------------------------------

function ActionsBlock({
  loading,
  onRunSamplePreview,
  onRunLivePreview,
  onRunLiveCommit,
  onRunReplayLastClose,
}) {
  return (
    <SectionShell title="Actions">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          onClick={onRunSamplePreview}
          disabled={loading}
          aria-label="Run sample scan"
          title="Run sample scan — offline mock, preview only"
          style={primaryBtnStyle(loading)}>
          {loading ? "Scanning…" : "Run Scan"}
        </button>
        {/* Phase 4.7.6: Replay Last Close. Distinct amber border so it
            reads as the "after-hours staging" lane, separate from sample
            (which is synthetic) and live (which requires market open). */}
        <button
          onClick={onRunReplayLastClose}
          disabled={loading || typeof onRunReplayLastClose !== "function"}
          aria-label="Replay last close"
          title="Replay last close — real previous-session OHLCV played through the scanner"
          style={replayBtnStyle(loading || typeof onRunReplayLastClose !== "function")}>
          Replay Last Close
        </button>
        <button
          onClick={onRunLivePreview}
          disabled={loading}
          aria-label="Run live preview"
          title="Run live preview — real data, nothing saved"
          style={secondaryBtnStyle(loading)}>
          Live Preview
        </button>
        <button
          onClick={onRunLiveCommit}
          disabled={loading}
          aria-label="Run & record"
          title="Run & record — live data + saves top opportunity"
          style={accentBtnStyle(loading)}>
          Run &amp; Record
        </button>
      </div>
    </SectionShell>
  );
}

function primaryBtnStyle(disabled) {
  return {
    background: COCKPIT_PALETTE.text,
    color: COCKPIT_PALETTE.pageBg,
    border: "none", borderRadius: 6,
    padding: "9px 10px",
    fontSize: 12, fontWeight: 800, letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    textAlign: "center",
  };
}
function secondaryBtnStyle(disabled) {
  return {
    background: "transparent",
    color: COCKPIT_PALETTE.text,
    border: `1px solid ${COCKPIT_PALETTE.border}`,
    borderRadius: 6, padding: "7px 10px",
    fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    textAlign: "center",
  };
}
function replayBtnStyle(disabled) {
  return {
    background: "rgba(245, 158, 11, 0.10)",         // soft amber wash
    color: COCKPIT_PALETTE.accentAmber,
    border: `1px solid ${COCKPIT_PALETTE.accentAmber}`,
    borderRadius: 6, padding: "7px 10px",
    fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
    textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    textAlign: "center",
  };
}
function accentBtnStyle(disabled) {
  return {
    background: "rgba(20,184,166,0.10)",
    color: COCKPIT_PALETTE.accentTeal,
    border: `1px solid ${COCKPIT_PALETTE.accentTeal}`,
    borderRadius: 6, padding: "7px 10px",
    fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
    textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    textAlign: "center",
  };
}

// --------------------------------------------------
// ALERTS — compressed 4-chip rollup
// --------------------------------------------------

function AlertsRollupBlock({ rollup, labels }) {
  const r = rollup || { today: 0, thisWeek: 0, newBest: 0, displaced: 0 };
  const lbl = (labels && labels.rollupChipLabel) || {
    today: "24h", thisWeek: "7d", newBest: "new best", displaced: "displaced",
  };
  return (
    <SectionShell title="Alerts" ariaLabel="Recorded alerts">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <RollupChip label={lbl.today}     value={r.today}     tone="dim" />
        <RollupChip label={lbl.thisWeek}  value={r.thisWeek}  tone="dim" />
        <RollupChip label={lbl.newBest}   value={r.newBest}   tone="green" />
        <RollupChip label={lbl.displaced} value={r.displaced} tone="amber" />
      </div>
    </SectionShell>
  );
}

function RollupChip({ label, value, tone }) {
  const color = tone === "green" ? COCKPIT_PALETTE.accentGreen
              : tone === "amber" ? COCKPIT_PALETTE.accentAmber
              :                    COCKPIT_PALETTE.text;
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      gap: 6, padding: "5px 8px",
      background: COCKPIT_PALETTE.nestedBg,
      border: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
      borderRadius: 4,
    }}>
      <span style={{
        fontSize: 9, color: COCKPIT_PALETTE.textFaint,
        letterSpacing: "0.10em", textTransform: "uppercase",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 700, color,
        fontFeatureSettings: "'tnum'",
      }}>{value}</span>
    </div>
  );
}

// --------------------------------------------------
// DIAGNOSTICS — collapsed disclosure (provider / scan / recorded)
// --------------------------------------------------

function DiagnosticsBlock({ open, onToggle, liveMeta, providerHealth, scanStatus, recordedAlerts, labels }) {
  return (
    <section style={{ marginTop: 6 }}>
      <button onClick={onToggle}
        title="Show diagnostics"
        style={{
          width: "100%", textAlign: "left",
          background: "transparent", border: "none", cursor: "pointer",
          color: COCKPIT_PALETTE.textFaint,
          fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
          padding: "6px 0",
        }}>
        {open ? "▾" : "▸"} Diagnostics
      </button>
      {open && (
        <div style={{
          marginTop: 4, paddingTop: 8,
          borderTop: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
        }}>
          <DiagSubsection title="Polygon universe">
            {liveMeta
              ? <LiveMetaBody meta={liveMeta} />
              : <DimText>No scan yet.</DimText>}
          </DiagSubsection>
          <DiagSubsection title="ThetaData options">
            {providerHealth ? (
              <KVList pairs={[
                ["provider", providerHealth.provider || "thetadata"],
                ["version",  providerHealth.version  || "—"],
                ["status",   providerHealth.status   || "—"],
                ...(providerHealth.reason ? [["reason", providerHealth.reason]] : []),
              ]} />
            ) : <DimText>Probe pending…</DimText>}
          </DiagSubsection>
          <DiagSubsection title="Last scan">
            {scanStatus ? (
              <KVList pairs={[
                ["mode",     (labels && labels.scanModeLabel && labels.scanModeLabel[scanStatus.mode]) || scanStatus.mode || "—"],
                ["event",    scanStatus.event || "—"],
                ["recorded", scanStatus.recorded ? "true" : "false"],
              ]} />
            ) : <DimText>—</DimText>}
          </DiagSubsection>
          {Array.isArray(recordedAlerts) && recordedAlerts.length > 0 && (
            <DiagSubsection title="Recent recorded">
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {recordedAlerts.slice(0, 5).map((a, i) => (
                  <li key={`${a.symbol}-${a.timestamp || i}`}
                      style={{
                        fontSize: 10, color: COCKPIT_PALETTE.textDim,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                    <span style={{ color: COCKPIT_PALETTE.textFaint }}>{a.timestampLabel || "—"}</span>
                    {" · "}
                    <span style={{ color: COCKPIT_PALETTE.text, fontWeight: 700 }}>{a.symbol}</span>
                    {a.bestUseOfCapital && (
                      <span style={{ color: COCKPIT_PALETTE.accentTeal }}> ★</span>
                    )}
                    {" · "}
                    {(labels && labels.alertEventLabel && labels.alertEventLabel(a.event)) || a.event}
                  </li>
                ))}
              </ul>
            </DiagSubsection>
          )}
        </div>
      )}
    </section>
  );
}

function LiveMetaBody({ meta }) {
  if (meta.source === "sample") {
    return <KVList pairs={[["mode", "sample"], ["reason", meta.reason || "—"]]} />;
  }
  const pairs = [];
  if (meta.universe) pairs.push(["universe", meta.universe.source || "—"]);
  if (meta.universe && meta.universe.session) pairs.push(["session", meta.universe.session]);
  if (meta.options)  pairs.push(["options", meta.options.source || "—"]);
  if (meta.options && meta.options.capability) {
    pairs.push(["capability", meta.options.capability.optionsCapability || "—"]);
  }
  if (meta.circuit)  pairs.push(["circuit", meta.circuit.state || "—"]);
  return <KVList pairs={pairs} />;
}

function DiagSubsection({ title, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        fontSize: 9, color: COCKPIT_PALETTE.textFaint,
        letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 3,
      }}>{title}</div>
      {children}
    </div>
  );
}

function KVList({ pairs }) {
  return (
    <dl style={{ margin: 0, fontSize: 10 }}>
      {pairs.map(([k, v]) => (
        <div key={k} style={{
          display: "flex", justifyContent: "space-between", gap: 6,
        }}>
          <dt style={{ color: COCKPIT_PALETTE.textFaint }}>{k}</dt>
          <dd style={{
            color: COCKPIT_PALETTE.textDim, margin: 0,
            textAlign: "right",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontFeatureSettings: "'tnum'",
          }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function DimText({ children }) {
  return (
    <div style={{ fontSize: 11, color: COCKPIT_PALETTE.textFaint }}>
      {children}
    </div>
  );
}

// --------------------------------------------------
// ERROR BLOCK — always visible at the top when present
// --------------------------------------------------

function ErrorBlock({ message }) {
  return (
    <div style={{
      marginBottom: 12, padding: "8px 10px", borderRadius: 6,
      border: `1px solid ${COCKPIT_PALETTE.accentRed}`,
      background: "rgba(239, 68, 68, 0.10)",
      color: COCKPIT_PALETTE.accentRed,
      fontSize: 11, lineHeight: 1.35,
    }}>
      {message}
    </div>
  );
}

// --------------------------------------------------
// SECTION SHELL — uniform header for every block
// --------------------------------------------------

function SectionShell({ title, ariaLabel, children }) {
  return (
    <section
      aria-label={ariaLabel || title}
      style={{ position: "relative", marginBottom: 14 }}>
      <div style={{
        fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
        color: COCKPIT_PALETTE.textFaint, marginBottom: 6,
      }}>
        {title}
      </div>
      {children}
    </section>
  );
}
