// =====================================================
// LETHAL BOARD — capital-aware discovery view
// =====================================================
// Renders the result of runMarketDiscoveryScan(). All data
// shaping happens in lethalBoardViewModel.js so the
// component stays presentational.
//
// The component is intentionally NOT wired into App.jsx —
// import it from any host page when ready. This keeps the
// existing dashboard views untouched (additive rule).
// =====================================================

import React from "react";
import { buildLethalBoardViewModel } from "./lethalBoardViewModel.js";

// --------------------------------------------------
// PUBLIC COMPONENT
// --------------------------------------------------

/**
 * @param {object} props
 * @param {object} props.scanResult                runMarketDiscoveryScan() output
 * @param {string} [props.title]
 * @param {boolean} [props.showRejected]
 */
export default function LethalBoard({ scanResult, title = "Lethal Board", showRejected = true }) {
  const vm = buildLethalBoardViewModel(scanResult);

  if (!vm.summary) {
    return (
      <div className="p-6 bg-zinc-900 text-zinc-200 rounded-lg">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-zinc-400">No scan available. Run runMarketDiscoveryScan() first.</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-zinc-900 text-zinc-100 rounded-lg space-y-6">
      <Header title={title} summary={vm.summary} />
      <BestOpportunityCard best={vm.best} />
      <RankedTable rows={vm.rows} />
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
// BEST OPPORTUNITY CARD
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

  const premiumLabel = best.premiumIsLive ? "live" : best.premiumMethod;
  const premiumTone = best.premiumIsLive ? "good" : "warn";

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-bold tracking-tight">{best.symbol}</span>
        <span className="text-sm text-zinc-300">{best.action}</span>
        <span className="text-sm text-zinc-300">score {best.score}</span>
        <span className="text-sm text-zinc-300">fit {best.capitalFit}</span>
        <span className={`text-sm ${toneClass(premiumTone)}`}>premium · {premiumLabel}</span>
        <span className="text-sm text-zinc-300">collateral {best.estimatedCollateral}</span>
      </div>
      {best.bundles?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {best.bundles.map((b) => (
            <span key={b} className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
              {b}
            </span>
          ))}
        </div>
      )}
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
// RANKED TABLE
// --------------------------------------------------

function RankedTable({ rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="text-sm text-zinc-400">No candidates surfaced.</div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-zinc-800 rounded">
        <thead className="bg-zinc-800/60 text-zinc-300">
          <tr>
            <Th>#</Th>
            <Th>Symbol</Th>
            <Th>Action</Th>
            <Th>Score</Th>
            <Th>Fit</Th>
            <Th>Premium</Th>
            <Th>Signal</Th>
            <Th>Collateral</Th>
            <Th>Reason</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.rank}-${r.symbol}`} className={r.isBestUseOfCapital ? "bg-emerald-500/5" : "bg-zinc-900/40"}>
              <Td>{r.rank}</Td>
              <Td>
                <span className="font-medium">{r.symbol}</span>
                {r.isBestUseOfCapital && <span className="ml-1 text-emerald-400">★</span>}
              </Td>
              <Td>{r.action}</Td>
              <Td>{r.score}</Td>
              <Td className={fitToneClass(r.capitalFitCode)}>{r.capitalFit}</Td>
              <Td className={r.premiumIsLive ? "text-emerald-400" : "text-amber-400"}>
                {r.premiumMethod}
              </Td>
              <Td>{r.signalQuality}</Td>
              <Td>{r.estimatedCollateral}</Td>
              <Td className="text-zinc-400">{r.reasonSummary}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }) {
  return <th className="text-left px-3 py-2 font-medium text-[12px] uppercase tracking-wider">{children}</th>;
}

function Td({ children, className = "" }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

function fitToneClass(fit) {
  if (fit === "excellent" || fit === "good") return "text-emerald-400";
  if (fit === "acceptable") return "text-zinc-200";
  if (fit === "poor") return "text-amber-400";
  if (fit === "not_affordable") return "text-rose-400";
  return "text-zinc-300";
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
