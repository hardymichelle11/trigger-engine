// =====================================================
// COCKPIT PRIMITIVES (Phase 4.7)
// =====================================================
// Shared visual primitives for the Lethal Board cockpit.
// Pure presentational components; no engine internals.
//
// Hard rules:
//   - No scoreBreakdown, weights, probability internals,
//     Monte Carlo paths, IV percentiles, or debug fields.
//   - No fetch / no persistence / no engine call.
// =====================================================

import React from "react";

// --------------------------------------------------
// SCORE RING
// --------------------------------------------------

export function ScoreRing({ score, size = 44, stroke = 4, tone }) {
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
// ACTION PILL
// --------------------------------------------------

export function ActionPill({ action, actionCode }) {
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
// BUNDLE PILLS
// --------------------------------------------------

export function BundlePills({ bundles, max = 3 }) {
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

// --------------------------------------------------
// REASON LIST
// --------------------------------------------------

export function ReasonList({ title, items, tone = "good" }) {
  if (!items || items.length === 0) return null;
  const toneClass = tone === "good" ? "text-emerald-400"
                  : tone === "warn" ? "text-amber-400"
                  : tone === "bad"  ? "text-rose-400"
                  : "text-zinc-200";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">{title}</div>
      <ul className="space-y-1">
        {items.map((s, i) => (
          <li key={i} className={`text-sm ${toneClass}`}>· {s}</li>
        ))}
      </ul>
    </div>
  );
}

// --------------------------------------------------
// FIT TONE HELPER
// --------------------------------------------------

export function fitToneClass(fit) {
  if (fit === "excellent" || fit === "good") return "text-emerald-400";
  if (fit === "acceptable") return "text-zinc-200";
  if (fit === "poor") return "text-amber-400";
  if (fit === "not_affordable") return "text-rose-400";
  return "text-zinc-300";
}

// --------------------------------------------------
// SECTION LABEL
// --------------------------------------------------

export function SectionLabel({ children, className = "" }) {
  return (
    <div className={`text-[10px] uppercase tracking-wider text-zinc-500 mb-2 ${className}`}>
      {children}
    </div>
  );
}
