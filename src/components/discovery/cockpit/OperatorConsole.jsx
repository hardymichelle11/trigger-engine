// =====================================================
// OPERATOR CONSOLE (Phase 4.7.6)
// =====================================================
// Left-rail console organized into three trader-facing
// sections + a collapsed Debug section for diagnostics:
//
//   1. CAPITAL    — start / deployable / sliders
//   2. MODE       — scanner mode toggle + pressure tolerance
//   3. ACTIONS    — Run Scan (primary) / Live Preview / Run & Record
//   ▸ Debug       — provider/version/status + last-scan + recorded
//                   alerts (collapsed by default)
//
// Hard rules:
//   - PURE presentational; no fetch, no engine call.
//   - Capital values masked when ctx.hideBalances === true.
//   - Sliders and Mode toggles call out via props (page hooks
//     useCapitalContext.saveContext to persist).
//   - Debug section starts collapsed — operators don't see
//     raw labels like "provider", "version", "status" until
//     they expand it.
// =====================================================

import React, { useState } from "react";
import {
  maskMoney,
  isCapitalContextUnconfigured,
  CAPITAL_MARKET_MODES,
  CAPITAL_PRESSURE_TOLERANCES,
} from "../../../lib/capital/capitalContext.js";
import HideBalancesToggle from "./HideBalancesToggle.jsx";
import { COCKPIT_PALETTE, COCKPIT_SCROLL_CLASS } from "./cockpitTheme.js";

/**
 * @param {object} props
 * @param {() => void} props.onRunSamplePreview
 * @param {() => void} props.onRunLivePreview
 * @param {() => void} props.onRunLiveCommit
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
 * @param {(patch: object) => void} props.onCapitalPatch     inline-edit handler
 * @param {() => void} props.onEditCapital
 * @param {() => void} props.onToggleHideBalances
 */
export default function OperatorConsole(props) {
  const [collapsed, setCollapsed] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

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

      <Header onBack={props.onBack} onCollapse={() => setCollapsed(true)} />

      {props.errorMsg && <ErrorBanner message={props.errorMsg} />}

      {/* 1. CAPITAL */}
      <ConsoleSection title="Capital">
        <CapitalSection
          ctx={props.capitalCtx}
          onPatch={props.onCapitalPatch}
          onEditCapital={props.onEditCapital}
          onToggleHideBalances={props.onToggleHideBalances} />
      </ConsoleSection>

      {/* 2. MODE */}
      <ConsoleSection title="Mode">
        <ModeSection
          ctx={props.capitalCtx}
          onPatch={props.onCapitalPatch} />
      </ConsoleSection>

      {/* 3. ACTIONS */}
      <ConsoleSection title="Actions">
        <ActionsSection
          loading={!!props.loading}
          onRunSamplePreview={props.onRunSamplePreview}
          onRunLivePreview={props.onRunLivePreview}
          onRunLiveCommit={props.onRunLiveCommit} />
      </ConsoleSection>

      {/* DEBUG — collapsed by default; raw provider/version/status fields */}
      <DebugSection
        open={debugOpen}
        onToggle={() => setDebugOpen((v) => !v)}
        liveMeta={props.liveMeta}
        providerHealth={props.providerHealth}
        scanStatus={props.scanStatus}
        recordedAlerts={props.recordedAlerts}
        recordedAlertsRollup={props.recordedAlertsRollup}
        labels={props.labels} />
    </aside>
  );
}

// --------------------------------------------------
// HEADER
// --------------------------------------------------

function Header({ onBack, onCollapse }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginBottom: 16, paddingBottom: 12,
      borderBottom: `1px solid ${COCKPIT_PALETTE.border}`,
    }}>
      <div>
        <div style={{
          fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
          color: COCKPIT_PALETTE.textFaint,
        }}>Operator console</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: COCKPIT_PALETTE.text, marginTop: 2 }}>
          Lethal Board
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {onBack && (
          <button onClick={onBack} title="Back to Trigger Engine"
            style={{
              fontSize: 10, color: COCKPIT_PALETTE.textDim,
              padding: "4px 8px",
              border: `1px solid ${COCKPIT_PALETTE.border}`,
              background: "transparent", borderRadius: 4, cursor: "pointer",
            }}>
            ← Back
          </button>
        )}
        <button onClick={onCollapse} title="Collapse console"
          style={{
            color: COCKPIT_PALETTE.textFaint, padding: "0 4px",
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 12,
          }}>
          ‹
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------
// 1. CAPITAL section
// --------------------------------------------------

function CapitalSection({ ctx, onPatch, onEditCapital, onToggleHideBalances }) {
  const safe = ctx || {};
  const hide = !!safe.hideBalances;
  const unconfigured = isCapitalContextUnconfigured(safe);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button
          onClick={onEditCapital}
          style={{
            flex: 1, textAlign: "left",
            border: `1px solid ${COCKPIT_PALETTE.border}`,
            background: COCKPIT_PALETTE.nestedBg,
            color: COCKPIT_PALETTE.text,
            padding: "6px 10px", borderRadius: 6,
            fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
            cursor: "pointer",
          }}>
          Edit capital
        </button>
        <HideBalancesToggle hidden={hide} onToggle={onToggleHideBalances} size="sm" />
      </div>

      {unconfigured ? (
        <div style={{
          fontSize: 11, color: COCKPIT_PALETTE.accentAmber, lineHeight: 1.5,
        }}>
          Not configured. Set starting + deployable capital to enable rankings.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <CapitalLine label="Start" value={maskMoney(safe.startingCapital, hide)} />
          <CapitalLine label="Deployable" value={maskMoney(safe.deployableCapital, hide)}
                       tone="green" />
          <SliderRow
            label="Max deploy"
            value={Math.round((safe.maxDeployedPct || 0) * 100)}
            onChange={(v) => onPatch && onPatch({ maxDeployedPct: v / 100 })}
            unit="%" min={10} max={100} step={5} />
          <SliderRow
            label="Max single"
            value={Math.round((safe.maxSingleTradePct || 0) * 100)}
            onChange={(v) => onPatch && onPatch({ maxSingleTradePct: v / 100 })}
            unit="%" min={1} max={50} step={1} />
        </div>
      )}
    </>
  );
}

function CapitalLine({ label, value, tone = "default" }) {
  const fg = tone === "green" ? COCKPIT_PALETTE.accentGreen : COCKPIT_PALETTE.text;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ fontSize: 11, color: COCKPIT_PALETTE.textDim }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: fg, fontFeatureSettings: "'tnum'" }}>
        {value}
      </span>
    </div>
  );
}

function SliderRow({ label, value, onChange, unit = "", min, max, step }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 10, color: COCKPIT_PALETTE.textDim, letterSpacing: "0.04em" }}>
          {label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: COCKPIT_PALETTE.text,
                        fontFeatureSettings: "'tnum'" }}>
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%", height: 4,
          background: COCKPIT_PALETTE.nestedBg,
          appearance: "none",
          accentColor: COCKPIT_PALETTE.accentTeal,
          cursor: "pointer",
        }} />
    </div>
  );
}

// --------------------------------------------------
// 2. MODE section
// --------------------------------------------------

function ModeSection({ ctx, onPatch }) {
  const safe = ctx || {};
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SegmentedControl
        label="Market mode"
        options={CAPITAL_MARKET_MODES}
        value={safe.marketMode || "neutral"}
        onChange={(v) => onPatch && onPatch({ marketMode: v })} />
      <SegmentedControl
        label="Pressure tolerance"
        options={CAPITAL_PRESSURE_TOLERANCES}
        value={safe.pressureTolerance || "medium"}
        onChange={(v) => onPatch && onPatch({ pressureTolerance: v })} />
    </div>
  );
}

function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, color: COCKPIT_PALETTE.textDim, letterSpacing: "0.04em" }}>
        {label}
      </span>
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        gap: 2,
        background: COCKPIT_PALETTE.nestedBg,
        border: `1px solid ${COCKPIT_PALETTE.border}`,
        borderRadius: 6,
        padding: 2,
      }}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button key={opt}
              onClick={() => onChange(opt)}
              style={{
                fontSize: 10, fontWeight: active ? 700 : 600,
                letterSpacing: "0.04em", textTransform: "uppercase",
                background: active ? COCKPIT_PALETTE.panelBg : "transparent",
                color: active ? COCKPIT_PALETTE.accentTeal : COCKPIT_PALETTE.textDim,
                border: "none", borderRadius: 4,
                padding: "4px 6px", cursor: "pointer",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
              title={opt}>
              {opt.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --------------------------------------------------
// 3. ACTIONS section
// --------------------------------------------------

function ActionsSection({ loading, onRunSamplePreview, onRunLivePreview, onRunLiveCommit }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <ActionButton
        primary
        label={loading ? "Scanning…" : "Run Scan"}
        hint="Real data, nothing saved"
        disabled={loading}
        onClick={onRunLivePreview} />
      <ActionButton
        label="Live preview (sample)"
        hint="Mock data, offline demo"
        disabled={loading}
        onClick={onRunSamplePreview} />
      <ActionButton
        accent
        label="Run & Record"
        hint="Live + saves top opportunity"
        disabled={loading}
        onClick={onRunLiveCommit} />
    </div>
  );
}

function ActionButton({ label, hint, primary, accent, disabled, onClick }) {
  let bg, fg, br;
  if (accent) {
    bg = "rgba(34, 197, 94, 0.08)";
    fg = COCKPIT_PALETTE.accentGreen;
    br = COCKPIT_PALETTE.accentGreen;
  } else if (primary) {
    bg = COCKPIT_PALETTE.nestedBg;
    fg = COCKPIT_PALETTE.text;
    br = COCKPIT_PALETTE.accentTeal;
  } else {
    bg = "transparent";
    fg = COCKPIT_PALETTE.textDim;
    br = COCKPIT_PALETTE.border;
  }
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        textAlign: "left",
        background: bg,
        color: fg,
        border: `1px solid ${br}`,
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}>
      <div>{label}</div>
      {hint && <div style={{
        fontSize: 9, fontWeight: 500, marginTop: 2,
        color: COCKPIT_PALETTE.textFaint, letterSpacing: "0.06em",
      }}>{hint}</div>}
    </button>
  );
}

// --------------------------------------------------
// DEBUG section — collapsed; raw provider/version/status
// --------------------------------------------------

function DebugSection({
  open, onToggle, liveMeta, providerHealth, scanStatus,
  recordedAlerts, recordedAlertsRollup, labels,
}) {
  const safeAlerts = Array.isArray(recordedAlerts) ? recordedAlerts : [];
  const r = recordedAlertsRollup || { today: 0, thisWeek: 0, newBest: 0, displaced: 0 };
  const chipLabel = labels?.rollupChipLabel || {
    today: "24h", thisWeek: "7d", newBest: "new best", displaced: "displaced",
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COCKPIT_PALETTE.border}` }}>
      <button onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%", textAlign: "left",
          background: "transparent", border: "none",
          color: COCKPIT_PALETTE.textFaint, cursor: "pointer",
          fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
          padding: 0,
        }}>
        {open ? "▾" : "▸"} Advanced diagnostics
      </button>

      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
          {liveMeta && <DebugBlock title="Polygon universe">
            <DebugKV pairs={debugLiveMetaPairs(liveMeta)} />
          </DebugBlock>}

          {providerHealth && <DebugBlock title="ThetaData options">
            <DebugKV pairs={[
              ["provider", providerHealth.provider || "thetadata"],
              ["version",  providerHealth.version  || "—"],
              ["status",   providerHealth.status   || "—"],
              ...(providerHealth.reason ? [["reason", providerHealth.reason]] : []),
            ]} />
          </DebugBlock>}

          {scanStatus && <DebugBlock title="Last scan">
            <DebugKV pairs={[
              ["mode",     labels?.scanModeLabel?.[scanStatus.mode] || scanStatus.mode],
              ["event",    scanStatus.event || "—"],
              ["recorded", scanStatus.recorded ? "true" : "false"],
              ...(scanStatus.suppressedReason
                ? [["reason", labels?.suppressedReasonLabel?.[scanStatus.suppressedReason]
                              || scanStatus.suppressedReason]]
                : []),
            ]} />
          </DebugBlock>}

          <DebugBlock title="Recorded alerts">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
              <RollupChip label={chipLabel.today}    value={r.today}    tone="text-blue" />
              <RollupChip label={chipLabel.thisWeek} value={r.thisWeek} tone="text-blue" />
              <RollupChip label={chipLabel.newBest}  value={r.newBest}  tone="text-green" />
              <RollupChip label={chipLabel.displaced} value={r.displaced} tone="text-amber" />
            </div>
            {safeAlerts.length === 0 ? (
              <div style={{ fontSize: 10, color: COCKPIT_PALETTE.textFaint }}>
                No recorded alerts. Run &amp; record to commit one.
              </div>
            ) : (
              <ul style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10,
                            color: COCKPIT_PALETTE.textDim }}>
                {safeAlerts.slice(0, 5).map((a, i) => (
                  <li key={`${a.symbol}-${a.timestamp || i}`} style={truncate}>
                    <span style={{ color: COCKPIT_PALETTE.textFaint }}>{a.timestampLabel || "—"}</span>
                    {" · "}
                    <span style={{ color: COCKPIT_PALETTE.text, fontWeight: 700 }}>{a.symbol}</span>
                    {a.bestUseOfCapital && <span style={{ color: COCKPIT_PALETTE.accentTeal }}> ★</span>}
                    {" · "}
                    <span>{labels?.alertEventLabel?.(a.event) || a.event}</span>
                  </li>
                ))}
              </ul>
            )}
          </DebugBlock>
        </div>
      )}
    </div>
  );
}

function debugLiveMetaPairs(meta) {
  if (!meta) return [];
  if (meta.source === "sample") return [["mode", "sample"], ["reason", meta.reason || "—"]];
  const pairs = [];
  if (meta.universe) pairs.push(["universe", meta.universe.source || "—"]);
  if (meta.universe?.session) pairs.push(["session", meta.universe.session]);
  if (meta.options)  pairs.push(["options", meta.options.source || "—"]);
  if (meta.options?.capability)
    pairs.push(["capability", meta.options.capability.optionsCapability || "—"]);
  if (meta.circuit)  pairs.push(["circuit", meta.circuit.state || "—"]);
  return pairs;
}

function DebugBlock({ title, children }) {
  return (
    <div>
      <div style={{
        fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
        color: COCKPIT_PALETTE.textFaint, marginBottom: 4,
      }}>{title}</div>
      {children}
    </div>
  );
}

function DebugKV({ pairs }) {
  return (
    <dl style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {pairs.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 10 }}>
          <dt style={{ color: COCKPIT_PALETTE.textFaint, ...truncate }}>{k}</dt>
          <dd style={{ color: COCKPIT_PALETTE.text, fontFeatureSettings: "'tnum'", textAlign: "right",
                        ...truncate }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function RollupChip({ label, value, tone }) {
  const fg = tone === "text-green" ? COCKPIT_PALETTE.accentGreen
           : tone === "text-amber" ? COCKPIT_PALETTE.accentAmber
           : tone === "text-blue"  ? COCKPIT_PALETTE.accentBlue
           :                         COCKPIT_PALETTE.text;
  return (
    <span style={{
      display: "inline-flex", gap: 4, alignItems: "baseline",
      padding: "2px 6px", borderRadius: 999,
      border: `1px solid ${COCKPIT_PALETTE.border}`,
      background: COCKPIT_PALETTE.nestedBg,
      fontSize: 9,
    }}>
      <span style={{ color: COCKPIT_PALETTE.textFaint }}>{label}</span>
      <span style={{ color: fg, fontWeight: 700, fontFeatureSettings: "'tnum'" }}>{value}</span>
    </span>
  );
}

// --------------------------------------------------
// shared
// --------------------------------------------------

function ConsoleSection({ title, children }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
        color: COCKPIT_PALETTE.textFaint, marginBottom: 8,
      }}>{title}</div>
      {children}
    </section>
  );
}

function ErrorBanner({ message }) {
  return (
    <div style={{
      marginBottom: 12, padding: 8, borderRadius: 6,
      background: "rgba(239, 68, 68, 0.10)",
      border: `1px solid ${COCKPIT_PALETTE.accentRed}`,
      color: COCKPIT_PALETTE.accentRed,
      fontSize: 11, lineHeight: 1.4,
    }}>
      {message}
    </div>
  );
}

const truncate = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
