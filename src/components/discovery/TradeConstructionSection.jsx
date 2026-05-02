// =====================================================
// TRADE CONSTRUCTION SECTION (Phase 4.5B)
// =====================================================
// Presentational component for the selected-ticker trade
// construction snapshot. Reads a pre-built tradeContext
// object from buildTradeConstructionContext() and renders.
//
// Hard rules:
//   - Reads tradeContext only — does NOT inspect the raw
//     scanResult, candidates, or chain snapshots directly.
//   - Renders "—" for any missing field. No fake values.
//   - Premium source label is honest — "live" appears only
//     if tradeContext.premiumSource === "live", which Phase
//     4.5B never sets (it's a Phase 4.5C capability via
//     ThetaData).
//   - No engine internals are referenced anywhere in this
//     component (no scoreBreakdown, no probability, no IV
//     percentiles, no MC paths, no debug fields).
// =====================================================

import React from "react";

const PREMIUM_TONE = {
  live: "text-emerald-400",
  estimated: "text-amber-400",
  unavailable: "text-zinc-400",
};

export default function TradeConstructionSection({ tradeContext }) {
  if (!tradeContext) {
    return (
      <div className="rounded border border-dashed border-zinc-700 bg-zinc-900/30 p-3">
        <SectionTitle />
        <div className="text-xs text-zinc-500">
          No trade construction context for the selected ticker.
        </div>
      </div>
    );
  }

  const t = tradeContext;
  const premiumTone = PREMIUM_TONE[t.premiumSource] || PREMIUM_TONE.unavailable;

  return (
    <div className="rounded border border-zinc-700 bg-zinc-900/40 p-3">
      <SectionTitle />

      <div className="grid grid-cols-2 gap-2 text-sm mt-1">
        <Field label="Symbol" value={t.symbol} bold />
        <Field label="Current price" value={dollar(t.currentPrice)} />
        <Field label="Suggested strike" value={dollar(t.suggestedStrike)} />
        <Field label="Expiration" value={t.expirationLabel || "—"} />
        <Field label="Premium source"
               value={t.premiumSource}
               valueClass={premiumTone} />
        <Field label="Estimated premium"
               value={t.estimatedPremium != null ? `$${t.estimatedPremium.toFixed(2)}` : "—"} />
        <Field label="Estimated collateral" value={dollar(t.estimatedCollateral, 0)} />
        <Field label="ATR" value={t.atr != null ? t.atr.toFixed(2) : "—"} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Field label="Support" value={dollar(t.support)} />
        <Field label="R1" value={dollar(t.r1)} />
        <Field label="R2" value={dollar(t.r2)} />
        <Field label="ATR distance from strike"
               value={t.atrDistanceFromStrike != null ? `${t.atrDistanceFromStrike.toFixed(2)}×` : "—"} />
        <Field label="Distance: price → strike"
               value={t.distanceFromPriceToStrikePct != null
                 ? `${dollar(t.distanceFromPriceToStrike)} (${t.distanceFromPriceToStrikePct.toFixed(2)}%)`
                 : "—"} />
        <Field label="Distance: support → strike"
               value={t.distanceFromSupportToStrikePct != null
                 ? `${dollar(t.distanceFromSupportToStrike)} (${t.distanceFromSupportToStrikePct.toFixed(2)}%)`
                 : "—"} />
      </div>

      {/* Live chain block — populated by Phase 4.5C via ThetaData. */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Field label="Bid" value={t.bid != null ? `$${t.bid.toFixed(2)}` : "—"} />
        <Field label="Ask" value={t.ask != null ? `$${t.ask.toFixed(2)}` : "—"} />
        <Field label="Mid" value={t.mid != null ? `$${t.mid.toFixed(2)}` : "—"} />
        <Field label="Last" value={t.last != null ? `$${t.last.toFixed(2)}` : "—"} />
      </div>

      <div className="mt-2 text-[11px] text-zinc-400 flex flex-wrap gap-x-3 gap-y-1">
        <span>liquidity: <span className="text-zinc-200">{t.liquidityGrade}</span></span>
        <span>spread: <span className="text-zinc-200">{t.spreadRisk}</span></span>
        {t.spreadWidthLabel && (
          <span>width: <span className="text-zinc-200">{t.spreadWidthLabel}</span></span>
        )}
      </div>

      {t.liquidityWarning && (
        <div className="mt-2 text-[11px] text-amber-400">
          {t.liquidityWarning}
        </div>
      )}

      <div className="mt-2 text-[11px] text-amber-300">
        ⚠ {t.verifyWarning}
      </div>
    </div>
  );
}

function SectionTitle() {
  return (
    <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
      Trade construction — selected ticker
    </div>
  );
}

function Field({ label, value, bold = false, valueClass = "" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-sm ${bold ? "font-bold" : ""} ${valueClass || "text-zinc-200"}`}>
        {value}
      </div>
    </div>
  );
}

function dollar(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
