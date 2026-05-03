// =====================================================
// CAPITAL SETTINGS MODAL (Phase 4.7.2)
// =====================================================
// Modal form for editing the operator's private capital
// context. Settings are persisted via useCapitalContext()
// to localStorage (scoped by per-browser userId).
//
// Hard rules:
//   - Inputs are validated client-side; non-numeric values
//     are coerced to safe defaults by capitalContext.normalize.
//   - Closing the modal without saving discards changes.
//   - Saving triggers an immediate re-render of the cockpit
//     (the page consumes the same hook).
//   - Privacy: the modal never echoes the userId to the UI;
//     it does not log values to the console.
// =====================================================

import React, { useEffect, useState } from "react";
import {
  CAPITAL_MARKET_MODES,
  CAPITAL_PRESSURE_TOLERANCES,
} from "../../../lib/capital/capitalContext.js";

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {import("../../../lib/capital/capitalContext.js").CapitalContext} props.ctx
 * @param {(patch: object) => void} props.onSave
 * @param {() => void} [props.onReset]
 */
export default function CapitalSettingsModal({
  open,
  onClose,
  ctx,
  onSave,
  onReset,
}) {
  const [form, setForm] = useState(() => snapshotForm(ctx));

  // Re-seed the form when the underlying context changes (e.g. cross-tab edit
  // arrived) or when the modal opens fresh.
  useEffect(() => {
    if (open) setForm(snapshotForm(ctx));
  }, [open, ctx]);

  // Esc to close
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = (e) => {
    e?.preventDefault?.();
    onSave({
      startingCapital: numOrZero(form.startingCapital),
      availableCash: numOrZero(form.availableCash),
      deployableCapital: numOrZero(form.deployableCapital),
      reservedCashBufferPct: pctOrDefault(form.reservedCashBufferPct, 0.20),
      maxDeployedPct: pctOrDefault(form.maxDeployedPct, 0.65),
      maxSingleTradePct: pctOrDefault(form.maxSingleTradePct, 0.10),
      marketMode: form.marketMode,
      pressureTolerance: form.pressureTolerance,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Capital settings"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <form
        onSubmit={handleSave}
        className="w-[min(560px,92vw)] max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-100 shadow-2xl"
        style={{ padding: 16 }}>
        <header className="flex items-baseline justify-between mb-4 pb-3 border-b border-zinc-800">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Private to your session</div>
            <h2 className="text-base font-bold text-zinc-100 mt-0.5">Capital settings</h2>
          </div>
          <button type="button" onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-xs px-2 py-1 border border-zinc-800 rounded">
            Close (Esc)
          </button>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Starting capital ($)">
            <NumberInput value={form.startingCapital}
              onChange={(v) => setField("startingCapital", v)} />
          </Field>
          <Field label="Available cash ($)">
            <NumberInput value={form.availableCash}
              onChange={(v) => setField("availableCash", v)} />
          </Field>
          <Field label="Deployable capital ($)">
            <NumberInput value={form.deployableCapital}
              onChange={(v) => setField("deployableCapital", v)} />
          </Field>
          <Field label="Reserved buffer (%)">
            <PercentInput value={form.reservedCashBufferPct}
              onChange={(v) => setField("reservedCashBufferPct", v)} />
          </Field>
          <Field label="Max deployment (%)">
            <PercentInput value={form.maxDeployedPct}
              onChange={(v) => setField("maxDeployedPct", v)} />
          </Field>
          <Field label="Max single trade (%)">
            <PercentInput value={form.maxSingleTradePct}
              onChange={(v) => setField("maxSingleTradePct", v)} />
          </Field>
          <Field label="Market mode">
            <SelectInput
              value={form.marketMode}
              options={CAPITAL_MARKET_MODES}
              onChange={(v) => setField("marketMode", v)} />
          </Field>
          <Field label="Pressure tolerance">
            <SelectInput
              value={form.pressureTolerance}
              options={CAPITAL_PRESSURE_TOLERANCES}
              onChange={(v) => setField("pressureTolerance", v)} />
          </Field>
        </div>

        <p className="mt-4 text-[11px] text-zinc-500 leading-snug">
          These values stay on this device only. They drive capital-fit, ranking, and
          opportunity-cost displays. Use the Hide balances toggle if you want to share
          the screen without revealing dollar amounts.
        </p>

        <footer className="mt-4 flex items-center justify-between gap-2">
          {onReset && (
            <button type="button" onClick={onReset}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 underline-offset-2 hover:underline">
              Reset to defaults
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs font-bold">
              Cancel
            </button>
            <button type="submit"
              className="px-3 py-1.5 rounded border border-emerald-500 bg-emerald-600/10 text-emerald-300 hover:bg-emerald-600/20 text-xs font-bold">
              Save settings
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

// --------------------------------------------------
// FORM HELPERS
// --------------------------------------------------

function snapshotForm(ctx) {
  return {
    startingCapital: ctx?.startingCapital ?? 0,
    availableCash: ctx?.availableCash ?? 0,
    deployableCapital: ctx?.deployableCapital ?? 0,
    reservedCashBufferPct: ctx?.reservedCashBufferPct ?? 0.20,
    maxDeployedPct: ctx?.maxDeployedPct ?? 0.65,
    maxSingleTradePct: ctx?.maxSingleTradePct ?? 0.10,
    marketMode: ctx?.marketMode || "neutral",
    pressureTolerance: ctx?.pressureTolerance || "medium",
  };
}

function numOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function pctOrDefault(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ value, onChange }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500" />
  );
}

function PercentInput({ value, onChange }) {
  // Display as percent integer (0–100) but store as 0–1 fraction.
  const display = Math.round((Number(value) || 0) * 100);
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={1}
        value={display}
        onChange={(e) => {
          const pct = Math.max(0, Math.min(100, Number(e.target.value) || 0));
          onChange(pct / 100);
        }}
        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500" />
      <span className="text-zinc-500 text-xs">%</span>
    </div>
  );
}

function SelectInput({ value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500">
      {options.map(o => (
        <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
      ))}
    </select>
  );
}
