// =====================================================
// LETHAL BOARD — capital-aware discovery view
// =====================================================
// Renders the result of runMarketDiscoveryScan(). All data
// shaping happens in lethalBoardViewModel.js so the
// component stays presentational.
//
// Phase 4.4: card/detail layout
//   - Best Ranked Opportunity card (prominent, full width)
//   - Ranked card grid on the left
//   - Selected-ticker detail panel on the right
//   - Trade Construction placeholder (Phase 4.5)
//
// Selection state lives in the parent (LethalBoardPage) so
// Phase 4.5 can observe selectedSymbol without refactor.
//
// Hard rules:
//   - Safe fields only. Never render scoreBreakdown, weights,
//     probability, IV internals, MC paths, debug, etc.
//   - No persistence. No fetch. No engine call.
// =====================================================

import React from "react";
import { buildLethalBoardViewModel } from "./lethalBoardViewModel.js";

// --------------------------------------------------
// PUBLIC COMPONENT
// --------------------------------------------------

/**
 * @param {object} props
 * @param {object} props.scanResult                runMarketDiscoveryScan() output
 * @param {string|null} [props.selectedSymbol]      controlled by LethalBoardPage
 * @param {(sym: string) => void} [props.onSelectSymbol]
 * @param {string} [props.title]
 * @param {boolean} [props.showRejected]
 */
export default function LethalBoard({
  scanResult,
  selectedSymbol = null,
  onSelectSymbol,
  title = "Lethal Board",
  showRejected = true,
}) {
  const vm = buildLethalBoardViewModel(scanResult);

  if (!vm.summary) {
    return (
      <div className="p-6 bg-zinc-900 text-zinc-200 rounded-lg">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-zinc-400">No scan available. Run runMarketDiscoveryScan() first.</p>
      </div>
    );
  }

  // Resolve the row currently shown in the detail panel.
  // Falls back to best/first when the selected symbol is not in the current scan.
  const selectedRow = vm.rows.find(r => r.symbol === selectedSymbol)
    || (vm.best ? vm.rows.find(r => r.symbol === vm.best.symbol) : null)
    || vm.rows[0]
    || null;

  return (
    <div className="p-6 bg-zinc-900 text-zinc-100 rounded-lg space-y-6">
      <Header title={title} summary={vm.summary} />
      <BestOpportunityCard best={vm.best} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <SectionLabel>Ranked candidates</SectionLabel>
          <RankedGrid
            rows={vm.rows}
            selectedSymbol={selectedRow?.symbol || null}
            onSelectSymbol={onSelectSymbol}
          />
        </div>
        <div className="lg:col-span-1">
          <SectionLabel>Detail</SectionLabel>
          <DetailPanel row={selectedRow} />
        </div>
      </div>

      <DisplacedPanel displaced={vm.displaced} />
      {showRejected && <RejectedPanel rejected={vm.rejected} />}
      <WarningPanel warnings={vm.warnings} />
    </div>
  );
}

// --------------------------------------------------
// HEADER
// --------------------------------------------------

function Header({ title, summary }) {
  return (
    <div className="border-b border-zinc-800 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <span className="text-xs uppercase tracking-wider text-zinc-400">
          mode: {summary.scannerMode} · regime: {summary.regime}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
        <Stat label="Available cash" value={summary.availableCash} />
        <Stat label="Deployable" value={summary.deployableCash} />
        <Stat label="Reserved" value={summary.reservedCash} />
        <Stat label="Currently deployed" value={summary.currentlyDeployedCash} />
        <Stat label="Pressure" value={summary.capitalPressureLevel}
              tone={pressureTone(summary.capitalPressureLevel)} />
        <Stat label="Best use" value={summary.bestUseOfCapitalSymbol || "—"}
              tone={summary.bestUseOfCapitalSymbol ? "good" : "muted"} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "muted" }) {
  return (
    <div className="bg-zinc-800/50 rounded p-2">
      <div className="text-[11px] uppercase text-zinc-500 tracking-wider">{label}</div>
      <div className={`text-base font-medium ${toneClass(tone)}`}>{value}</div>
    </div>
  );
}

function pressureTone(level) {
  if (level === "MAXED") return "bad";
  if (level === "HIGH") return "warn";
  if (level === "MODERATE") return "muted";
  return "good";
}

function toneClass(tone) {
  switch (tone) {
    case "good": return "text-emerald-400";
    case "warn": return "text-amber-400";
    case "bad": return "text-rose-400";
    default: return "text-zinc-200";
  }
}

// --------------------------------------------------
// SCORE RING — discovery-local SVG component
// --------------------------------------------------

function ScoreRing({ score, size = 44, stroke = 4, tone }) {
  const safe = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Number(score))) : 0;
  const ringTone = tone || (safe >= 75 ? "good" : safe >= 55 ? "warn" : "muted");
  const color = ringTone === "good" ? "#22c55e"
              : ringTone === "warn" ? "#f59e0b"
              : ringTone === "bad" ? "#f43f5e"
              : "#71717a";
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - safe / 100);
  const center = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`score ${safe}`}>
      <circle cx={center} cy={center} r={r} fill="none" stroke="#27272a" strokeWidth={stroke} />
      <circle cx={center} cy={center} r={r} fill="none" stroke={color} strokeWidth={stroke}
              strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
              transform={`rotate(-90 ${center} ${center})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
            fontSize={size * 0.36} fontWeight="700" fill="#e4e4e7"
            style={{ fontFeatureSettings: "'tnum'" }}>
        {safe}
      </text>
    </svg>
  );
}

// --------------------------------------------------
// BUNDLE + ACTION PILLS
// --------------------------------------------------

function BundlePills({ bundles, max = 3 }) {
  if (!Array.isArray(bundles) || bundles.length === 0) return null;
  const shown = bundles.slice(0, max);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((b) => (
        <span key={b}
          className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
          {b}
        </span>
      ))}
    </div>
  );
}

function ActionPill({ action, actionCode }) {
  const tone = actionPillTone(actionCode);
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${tone.bg} ${tone.fg}`}>
      {action}
    </span>
  );
}

function actionPillTone(code) {
  switch (code) {
    case "option_candidate":
    case "stock_candidate":
      return { bg: "bg-emerald-500/15", fg: "text-emerald-400" };
    case "deep_scan":
      return { bg: "bg-cyan-500/15", fg: "text-cyan-400" };
    case "watch":
      return { bg: "bg-amber-500/15", fg: "text-amber-400" };
    case "paper_track":
      return { bg: "bg-zinc-700/40", fg: "text-zinc-300" };
    case "skip_capital_inefficient":
    case "skip_liquidity":
    case "skip_no_edge":
      return { bg: "bg-rose-500/15", fg: "text-rose-400" };
    default:
      return { bg: "bg-zinc-700/40", fg: "text-zinc-300" };
  }
}

// --------------------------------------------------
// BEST OPPORTUNITY CARD (full-width, prominent)
// --------------------------------------------------

function BestOpportunityCard({ best }) {
  if (!best) {
    return (
      <div className="rounded-lg border border-zinc-800 p-4 bg-zinc-900/40">
        <div className="text-sm text-zinc-400">
          No best use of capital surfaced this cycle. Capital may be MAXED, or no candidates met
          the deployment threshold.
        </div>
      </div>
    );
  }

  const premiumTone = best.premiumIsLive ? "good" : "warn";

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex items-start gap-4">
        <ScoreRing score={best.score} size={56} stroke={5} tone="good" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold tracking-tight">{best.symbol}</span>
            <span className="text-emerald-400 text-sm">★ best use of capital</span>
            <span className="text-xs text-zinc-500">primary: {best.primaryType}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <ActionPill action={best.action} actionCode={best.actionCode} />
            <span className="text-zinc-300">fit {best.capitalFit}</span>
            <span className={`${toneClass(premiumTone)}`}>premium · {best.premiumMethod}</span>
            <span className="text-zinc-300">collateral {best.estimatedCollateral}</span>
          </div>
          {best.bundles?.length > 0 && (
            <div className="mt-2"><BundlePills bundles={best.bundles} /></div>
          )}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReasonList title="Why this ranks high" items={best.keyReasons} tone="good" />
        <ReasonList title="Risks to verify before entry" items={best.risks} tone="warn" />
      </div>
    </div>
  );
}

function ReasonList({ title, items, tone }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">{title}</div>
      <ul className="space-y-1">
        {items.map((s, i) => (
          <li key={i} className={`text-sm ${toneClass(tone)}`}>· {s}</li>
        ))}
      </ul>
    </div>
  );
}

// --------------------------------------------------
// RANKED GRID — clickable card per row
// --------------------------------------------------

function RankedGrid({ rows, selectedSymbol, onSelectSymbol }) {
  if (!rows || rows.length === 0) {
    return <div className="text-sm text-zinc-400">No candidates surfaced.</div>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {rows.map((r) => (
        <RankedCard
          key={`${r.rank}-${r.symbol}`}
          row={r}
          selected={r.symbol === selectedSymbol}
          onClick={onSelectSymbol ? () => onSelectSymbol(r.symbol) : undefined}
        />
      ))}
    </div>
  );
}

function RankedCard({ row, selected, onClick }) {
  const fitTone = fitToneClass(row.capitalFitCode);
  const premiumTone = row.premiumIsLive ? "text-emerald-400" : "text-amber-400";
  const borderClass = selected
    ? "border-emerald-400/60 bg-emerald-500/5"
    : row.isBestUseOfCapital
      ? "border-emerald-500/30 bg-zinc-900/60"
      : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600";

  const interactive = typeof onClick === "function";
  const handleKey = interactive
    ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }
    : undefined;

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : -1}
      onClick={onClick}
      onKeyDown={handleKey}
      className={`rounded-lg border ${borderClass} p-3 cursor-pointer transition-colors`}>
      <div className="flex items-start gap-3">
        <ScoreRing score={row.score} size={42} stroke={4} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[10px] text-zinc-500">#{row.rank}</span>
            <span className="text-base font-bold tracking-tight">{row.symbol}</span>
            {row.isBestUseOfCapital && <span className="text-emerald-400 text-xs">★</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <ActionPill action={row.action} actionCode={row.actionCode} />
            <span className={`text-[11px] ${fitTone}`}>fit {row.capitalFit}</span>
            <span className={`text-[11px] ${premiumTone}`}>premium {row.premiumMethod}</span>
            <span className="text-[11px] text-zinc-400">{row.estimatedCollateral}</span>
          </div>
          {row.bundles?.length > 0 && (
            <div className="mt-2"><BundlePills bundles={row.bundles} max={2} /></div>
          )}
          <div className="mt-2 text-[11px] text-zinc-400">{row.reasonSummary}</div>
          {row.displacedBy && (
            <div className="mt-1 text-[11px] text-amber-400">displaced by {row.displacedBy}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function fitToneClass(fit) {
  if (fit === "excellent" || fit === "good") return "text-emerald-400";
  if (fit === "acceptable") return "text-zinc-200";
  if (fit === "poor") return "text-amber-400";
  if (fit === "not_affordable") return "text-rose-400";
  return "text-zinc-300";
}

// --------------------------------------------------
// DETAIL PANEL — selected ticker, right column
// --------------------------------------------------

function DetailPanel({ row }) {
  if (!row) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="text-sm text-zinc-400">Select a card to see details.</div>
      </div>
    );
  }
  const premiumTone = row.premiumIsLive ? "text-emerald-400" : "text-amber-400";
  const fitTone = fitToneClass(row.capitalFitCode);
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-4">
      <div className="flex items-start gap-3 pb-3 border-b border-zinc-800">
        <ScoreRing score={row.score} size={48} stroke={4} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">DETAIL</span>
            <span className="text-lg font-bold">{row.symbol}</span>
            {row.isBestUseOfCapital && <span className="text-emerald-400 text-xs">★ best use</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2">
            <ActionPill action={row.action} actionCode={row.actionCode} />
            <span className="text-[11px] text-zinc-400">rank #{row.rank}</span>
          </div>
        </div>
      </div>

      <DetailFieldsBlock row={row} fitTone={fitTone} premiumTone={premiumTone} />

      <ReasonList title="Why this ranks high" items={row.keyReasons} tone="good" />
      <ReasonList title="Risks to verify before entry" items={row.risks} tone="warn" />

      {row.displacedBy && (
        <div className="text-[12px] text-amber-300">
          <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Displacement · </span>
          this row is displaced by <span className="font-bold">{row.displacedBy}</span>
        </div>
      )}
      {row.concentrationWarning && (
        <div className="text-[12px] text-amber-300">
          <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Concentration · </span>
          {row.concentrationWarning}
        </div>
      )}

      <TradeConstructionPlaceholder />
    </div>
  );
}

function DetailFieldsBlock({ row, fitTone, premiumTone }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <DetailField label="Action" value={row.action} />
      <DetailField label="Score" value={row.score} />
      <DetailField label="Capital fit" value={row.capitalFit} valueClass={fitTone} />
      <DetailField label="Premium" value={row.premiumMethod} valueClass={premiumTone} />
      <DetailField label="Collateral" value={row.estimatedCollateral} />
      <DetailField label="Signal" value={row.signalQuality} />
      <DetailField label="Regime" value={row.regimeAlignment || "—"} />
      <DetailField label="Primary" value={row.primaryType} />
      <div className="col-span-2">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Bundle exposure</div>
        {row.bundles?.length > 0
          ? <BundlePills bundles={row.bundles} max={4} />
          : <span className="text-xs text-zinc-500">—</span>}
      </div>
    </div>
  );
}

function DetailField({ label, value, valueClass = "text-zinc-200" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-sm font-medium ${valueClass}`}>{value}</div>
    </div>
  );
}

// --------------------------------------------------
// TRADE CONSTRUCTION — placeholder for Phase 4.5
// --------------------------------------------------

function TradeConstructionPlaceholder() {
  return (
    <div className="rounded border border-dashed border-zinc-700 bg-zinc-900/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
        Trade construction — selected ticker
      </div>
      <div className="text-xs text-zinc-500">
        available in Phase 4.5
      </div>
    </div>
  );
}

// --------------------------------------------------
// DISPLACED / REJECTED / WARNINGS
// --------------------------------------------------

function DisplacedPanel({ displaced }) {
  if (!displaced || displaced.length === 0) return null;
  return (
    <Section title="Displaced trades">
      <ul className="space-y-1 text-sm">
        {displaced.map((d, i) => (
          <li key={`${d.symbol}-${i}`} className="text-zinc-300">
            <span className="font-medium">{d.symbol}</span>
            <span className="text-zinc-500"> displaced by </span>
            <span className="font-medium text-emerald-400">{d.displacedBy}</span>
            <span className="text-zinc-500"> · {d.reason}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function RejectedPanel({ rejected }) {
  if (!rejected || rejected.length === 0) return null;
  return (
    <Section title="Rejected symbols">
      <ul className="space-y-1 text-sm">
        {rejected.map((r, i) => (
          <li key={`${r.symbol}-${i}`}>
            <span className="font-medium">{r.symbol}</span>
            <span className="text-amber-400"> · {r.reasonLabel}</span>
            {r.detail && <span className="text-zinc-500"> · {r.detail}</span>}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function WarningPanel({ warnings }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <Section title="Warnings">
      <ul className="space-y-1 text-sm text-amber-300">
        {warnings.map((w, i) => <li key={i}>· {w}</li>)}
      </ul>
    </Section>
  );
}

function Section({ title, children }) {
  return (
    <div className="border-t border-zinc-800 pt-4">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">{title}</div>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">{children}</div>
  );
}
