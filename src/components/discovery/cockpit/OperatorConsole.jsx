// =====================================================
// OPERATOR CONSOLE (Phase 4.7.2)
// =====================================================
// Left-rail console that consolidates scan controls,
// capital settings access, provider/health diagnostics,
// recorded discovery alerts, and mode notes — clearing
// the main canvas for trading content.
//
// Renamed from AdminSidebar (Phase 4.7). Adds:
//   - Capital section with Edit + Hide Balances
//   - Masked dollar values when ctx.hideBalances === true
//
// Receives state and callbacks from the page; owns no
// state itself except a small collapse toggle.
//
// Hard rules:
//   - PURE presentational; no fetch, no engine call.
//   - Reads sanitized recorded-alert projections only.
//   - Never exposes scoreBreakdown / weights / probability
//     internals / debug fields.
//   - Capital values are NEVER logged or transmitted.
//     Mask is applied at the render layer only.
// =====================================================

import React, { useState } from "react";
import { maskMoney, maskPercent, isCapitalContextUnconfigured } from "../../../lib/capital/capitalContext.js";
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
 * @param {boolean} [props.loading]
 * @param {() => void} [props.onBack]
 * @param {object|null} [props.providerHealth]            { provider, version, status, reason }
 * @param {object|null} [props.liveMeta]                  { universe?, options?, circuit?, source?, reason? }
 * @param {object|null} [props.scanStatus]                { mode, event, recorded, suppressedReason }
 * @param {Array<object>} [props.recordedAlerts]          sanitized projection rows
 * @param {object} [props.recordedAlertsRollup]           { today, thisWeek, newBest, displaced }
 * @param {string} [props.errorMsg]
 * @param {object} [props.labels]                         { scanModeLabel, suppressedReasonLabel, alertEventLabel, rollupChipLabel }
 * @param {object} props.capitalCtx                       CapitalContext (private)
 * @param {() => void} props.onEditCapital
 * @param {() => void} props.onToggleHideBalances
 */
export default function OperatorConsole(props) {
  const [collapsed, setCollapsed] = useState(false);

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
      <CapitalBlock
        ctx={props.capitalCtx}
        onEditCapital={props.onEditCapital}
        onToggleHideBalances={props.onToggleHideBalances} />
      <ScanControls
        onRunSamplePreview={props.onRunSamplePreview}
        onRunLivePreview={props.onRunLivePreview}
        onRunLiveCommit={props.onRunLiveCommit}
        loading={!!props.loading} />
      {props.errorMsg && <ErrorBlock message={props.errorMsg} />}
      <PolygonStatusBlock liveMeta={props.liveMeta} />
      <OptionsProviderBlock providerHealth={props.providerHealth} />
      <ScanStatusBlock status={props.scanStatus} labels={props.labels} />
      <RecordedAlertsBlock
        alerts={props.recordedAlerts}
        rollup={props.recordedAlertsRollup}
        labels={props.labels} />
      <ModeNotes />
    </aside>
  );
}

// --------------------------------------------------
// HEADER
// --------------------------------------------------

function SidebarHeader({ onBack, onCollapse }) {
  return (
    <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800">
      <div>
        <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Operator console</div>
        <div className="text-sm font-bold text-zinc-100">Lethal Board</div>
      </div>
      <div className="flex items-center gap-1">
        {onBack && (
          <button onClick={onBack}
            title="Back to Trigger Engine"
            className="text-[10px] text-zinc-400 hover:text-zinc-100 px-2 py-1 border border-zinc-800 rounded">
            ← Back
          </button>
        )}
        <button onClick={onCollapse}
          title="Collapse console"
          className="text-zinc-500 hover:text-zinc-200 text-xs px-1">
          ‹
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------
// CAPITAL BLOCK — masked when hideBalances === true
// --------------------------------------------------

function CapitalBlock({ ctx, onEditCapital, onToggleHideBalances }) {
  const safe = ctx || {};
  const hide = !!safe.hideBalances;
  const unconfigured = isCapitalContextUnconfigured(safe);

  return (
    <SidebarSection title="Capital settings">
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={onEditCapital}
          className="flex-1 text-left rounded border border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/10 transition-colors px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider">
          Edit capital
        </button>
        <HideBalancesToggle hidden={hide} onToggle={onToggleHideBalances} size="sm" />
      </div>
      {unconfigured ? (
        <div className="text-[11px] text-amber-400 leading-snug">
          Not configured. Set starting + deployable capital to enable accurate rankings.
        </div>
      ) : (
        <SidebarKV pairs={[
          ["start",      maskMoney(safe.startingCapital, hide)],
          ["available",  maskMoney(safe.availableCash, hide)],
          ["deployable", maskMoney(safe.deployableCapital, hide)],
          ["buffer",     maskPercent(safe.reservedCashBufferPct, hide)],
          ["max deploy", maskPercent(safe.maxDeployedPct, hide)],
          ["max single", maskPercent(safe.maxSingleTradePct, hide)],
          ["mode",       (safe.marketMode || "—").replace(/_/g, " ")],
          ["pressure",   safe.pressureTolerance || "—"],
        ]} />
      )}
    </SidebarSection>
  );
}

// --------------------------------------------------
// SCAN CONTROLS
// --------------------------------------------------

function ScanControls({ onRunSamplePreview, onRunLivePreview, onRunLiveCommit, loading }) {
  return (
    <SidebarSection title="Scan controls">
      <div className="flex flex-col gap-1.5">
        <SidebarButton
          tone="indigo"
          onClick={onRunSamplePreview}
          disabled={loading}
          label="Run sample scan"
          hint="Mock data, preview only" />
        <SidebarButton
          tone="sky"
          onClick={onRunLivePreview}
          disabled={loading}
          label={loading ? "Scanning…" : "Run live preview"}
          hint="Real data, nothing saved" />
        <SidebarButton
          tone="emerald"
          onClick={onRunLiveCommit}
          disabled={loading}
          label="Run & record"
          hint="Live + saves top opportunity" />
      </div>
    </SidebarSection>
  );
}

function SidebarButton({ tone, onClick, disabled, label, hint }) {
  const tones = {
    indigo:  "border-indigo-500/60 text-indigo-300 hover:bg-indigo-500/10",
    sky:     "border-sky-500/60 text-sky-300 hover:bg-sky-500/10",
    emerald: "border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/10",
  };
  const base = `w-full text-left rounded border px-2 py-1.5 text-xs font-bold transition-colors ${tones[tone] || tones.indigo}`;
  return (
    <button onClick={onClick} disabled={disabled}
      className={base}
      style={{ opacity: disabled ? 0.55 : 1 }}>
      <div>{label}</div>
      {hint && <div className="text-[9px] uppercase tracking-wider text-zinc-500 mt-0.5">{hint}</div>}
    </button>
  );
}

// --------------------------------------------------
// POLYGON UNIVERSE / LIVE STATUS
// --------------------------------------------------

function PolygonStatusBlock({ liveMeta }) {
  return (
    <SidebarSection title="Polygon universe">
      {liveMeta ? <LiveMetaBody meta={liveMeta} /> : <SidebarMuted>No scan run yet.</SidebarMuted>}
    </SidebarSection>
  );
}

function LiveMetaBody({ meta }) {
  if (meta.source === "sample") {
    return <SidebarKV pairs={[["mode", "sample"], ["reason", meta.reason || "—"]]} />;
  }
  const pairs = [];
  if (meta.universe) pairs.push(["universe", meta.universe.source || "—"]);
  if (meta.universe?.session) pairs.push(["session", meta.universe.session]);
  if (meta.options)  pairs.push(["options", meta.options.source || "—"]);
  if (meta.options?.capability)
    pairs.push(["capability", meta.options.capability.optionsCapability || "—"]);
  if (meta.circuit)  pairs.push(["circuit", meta.circuit.state || "—"]);
  return <SidebarKV pairs={pairs} />;
}

// --------------------------------------------------
// THETADATA PROVIDER STATUS
// --------------------------------------------------

function OptionsProviderBlock({ providerHealth }) {
  return (
    <SidebarSection title="ThetaData options">
      {providerHealth ? (
        <SidebarKV pairs={[
          ["provider", providerHealth.provider || "thetadata"],
          ["version",  providerHealth.version  || "—"],
          ["status",   providerHealth.status   || "—"],
          ...(providerHealth.reason ? [["reason", providerHealth.reason]] : []),
        ]} />
      ) : (
        <SidebarMuted>Probe pending…</SidebarMuted>
      )}
    </SidebarSection>
  );
}

// --------------------------------------------------
// SCAN STATUS
// --------------------------------------------------

function ScanStatusBlock({ status, labels }) {
  if (!status) return null;
  const modeLabel = labels?.scanModeLabel?.[status.mode] || status.mode;
  const reasonLabel = status.suppressedReason
    ? (labels?.suppressedReasonLabel?.[status.suppressedReason] || status.suppressedReason)
    : null;
  return (
    <SidebarSection title="Last scan">
      <SidebarKV pairs={[
        ["mode", modeLabel],
        ["event", status.event || "—"],
        ["recorded", status.recorded ? "true" : "false"],
        ...(reasonLabel ? [["reason", reasonLabel]] : []),
      ]} />
    </SidebarSection>
  );
}

// --------------------------------------------------
// RECORDED ALERTS
// --------------------------------------------------

function RecordedAlertsBlock({ alerts, rollup, labels }) {
  const safe = Array.isArray(alerts) ? alerts : [];
  const r = rollup || { today: 0, thisWeek: 0, newBest: 0, displaced: 0 };
  const chipLabel = labels?.rollupChipLabel || {
    today: "24h", thisWeek: "7d", newBest: "new best", displaced: "displaced",
  };
  return (
    <SidebarSection title="Recorded alerts">
      <div className="flex flex-wrap gap-1 mb-2">
        <RollupChip label={chipLabel.today}    value={r.today}    tone="text-indigo-300" />
        <RollupChip label={chipLabel.thisWeek} value={r.thisWeek} tone="text-indigo-300" />
        <RollupChip label={chipLabel.newBest}  value={r.newBest}  tone="text-emerald-400" />
        <RollupChip label={chipLabel.displaced} value={r.displaced} tone="text-amber-400" />
      </div>
      {safe.length === 0 ? (
        <SidebarMuted>No recorded alerts. Run &amp; record to commit one.</SidebarMuted>
      ) : (
        <ul className="space-y-1">
          {safe.slice(0, 5).map((a, i) => (
            <li key={`${a.symbol}-${a.timestamp || i}`}
                className="text-[11px] text-zinc-400 truncate">
              <span className="text-zinc-500">{a.timestampLabel || "—"}</span>
              {" · "}
              <span className="font-bold text-zinc-200">{a.symbol}</span>
              {a.bestUseOfCapital && <span className="text-emerald-400"> ★</span>}
              {" · "}
              <span className="text-zinc-300">{labels?.alertEventLabel?.(a.event) || a.event}</span>
            </li>
          ))}
        </ul>
      )}
    </SidebarSection>
  );
}

function RollupChip({ label, value, tone }) {
  return (
    <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-full border border-zinc-800 bg-zinc-900/60 text-[10px]">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-bold ${tone}`} style={{ fontFeatureSettings: "'tnum'" }}>{value}</span>
    </span>
  );
}

// --------------------------------------------------
// MODE NOTES
// --------------------------------------------------

function ModeNotes() {
  return (
    <SidebarSection title="Mode notes">
      <ul className="text-[10px] text-zinc-500 space-y-0.5 leading-snug">
        <li>· <span className="text-indigo-300 font-bold">Sample</span> — offline mock data</li>
        <li>· <span className="text-sky-300 font-bold">Live preview</span> — real data, no save</li>
        <li>· <span className="text-emerald-300 font-bold">Run &amp; record</span> — saves top pick</li>
        <li>· Trigger Engine + CreditView remain active in parallel</li>
      </ul>
    </SidebarSection>
  );
}

// --------------------------------------------------
// SHARED LITTLE PRIMITIVES
// --------------------------------------------------

function SidebarSection({ title, children }) {
  return (
    <section className="mb-4 pb-3 border-b border-zinc-800/60 last:border-0 last:mb-0 last:pb-0">
      <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500 mb-1.5">{title}</div>
      {children}
    </section>
  );
}

function SidebarKV({ pairs }) {
  return (
    <dl className="space-y-0.5 text-[11px]">
      {pairs.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2">
          <dt className="text-zinc-500 truncate">{k}</dt>
          <dd className="text-zinc-200 truncate text-right" style={{ fontFeatureSettings: "'tnum'" }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function SidebarMuted({ children }) {
  return <div className="text-[11px] text-zinc-500 leading-snug">{children}</div>;
}

function ErrorBlock({ message }) {
  return (
    <div className="mb-3 p-2 rounded border border-rose-700/50 bg-rose-900/20 text-[11px] text-rose-300 leading-snug">
      {message}
    </div>
  );
}
