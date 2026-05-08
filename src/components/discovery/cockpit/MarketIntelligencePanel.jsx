// =====================================================
// MARKET INTELLIGENCE PANEL (Phase 4.7.7)
// =====================================================
// News panel — renders enriched articles from newsFeed.js
// (catalystType, newsConfidence, newsScoreAdjustment).
//
// Optional prop:
//   newsThesis: { text, tone, reliable } — short narrative
//   built by buildNewsThesis(); rendered as a header band so
//   the operator gets the "why this matters" before scanning
//   individual rows.
//
// Hard rules:
//   - PURE presentational. No fetch.
//   - Never displays a hard-coded headline as if it were
//     real news. When `items` is null / empty / has only
//     placeholder rows, shows the explicit fallback badge:
//     "News feed unavailable — placeholder only".
//   - Never exposes raw newsScoreAdjustment integers in the UI.
//     The operator sees direction + catalyst + confidence, not
//     internal weights.
// =====================================================

import React from "react";
import { COCKPIT_PALETTE, COCKPIT_SCROLL_CLASS } from "./cockpitTheme.js";

const PLACEHOLDER_ITEMS = [
  {
    headline: "News headline area",
    source: "—",
    timestamp: "—",
    why: "Wire in Investing.com / CNBC / Bloomberg / MarketWatch feed (Phase 4.9)",
    relevance: "placeholder",
    isPlaceholder: true,
  },
  {
    headline: "Sector rotation context will appear here",
    source: "—",
    timestamp: "—",
    why: "Macro / sector news will inform the operator before entry",
    relevance: "placeholder",
    isPlaceholder: true,
  },
  {
    headline: "Earnings / catalyst event reminders",
    source: "—",
    timestamp: "—",
    why: "Avoid entering trades into known catalysts unless that is the thesis",
    relevance: "placeholder",
    isPlaceholder: true,
  },
];

/**
 * @param {object} props
 * @param {Array<object>|null} [props.items]
 * @param {string} [props.title]
 * @param {{ text: string, tone: string, reliable: boolean }|null} [props.newsThesis]
 */
export default function MarketIntelligencePanel({
  items = null,
  title = "Market intelligence",
  newsThesis = null,
}) {
  const hasReal = Array.isArray(items) && items.some((i) => i && !i.isPlaceholder);
  const rows = hasReal ? items.filter((i) => i && !i.isPlaceholder) : PLACEHOLDER_ITEMS;
  const isPlaceholder = !hasReal;

  return (
    <section
      style={{
        background: COCKPIT_PALETTE.panelBg,
        border: `1px solid ${COCKPIT_PALETTE.border}`,
        borderRadius: 12,
        display: "flex", flexDirection: "column",
        minWidth: 0, minHeight: 0, overflow: "hidden",
      }}
      aria-label={title}>
      <header style={{
        flex: "none",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
        minWidth: 0,
      }}>
        <h3 style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
                      color: COCKPIT_PALETTE.textDim }}>{title}</h3>
        {isPlaceholder && (
          <span style={{ fontSize: 10, color: COCKPIT_PALETTE.accentAmber }}>
            News feed unavailable — placeholder only
          </span>
        )}
      </header>

      {newsThesis?.text && newsThesis?.reliable && (
        <NewsThesisBanner thesis={newsThesis} />
      )}
      {newsThesis?.text && !newsThesis?.reliable && isPlaceholder && (
        <div style={{
          padding: "8px 16px",
          borderBottom: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
          fontSize: 11, color: COCKPIT_PALETTE.accentAmber, lineHeight: 1.4,
        }}>
          {newsThesis.text}
        </div>
      )}

      <div className={COCKPIT_SCROLL_CLASS}
           style={{ flex: "1 1 auto", minHeight: 0,
                    overflowY: "auto", overflowX: "hidden",
                    padding: 16 }}>
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.url || `${r.headline}|${i}`}
                className="border-t border-zinc-800/60 pt-3 first:border-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-zinc-300 truncate">{r.headline}</span>
                <RelevanceBadge value={r.relevance} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500">
                {r.catalystLabel && <CatalystBadge label={r.catalystLabel} />}
                {!r.isPlaceholder && r.confidenceLabel && (
                  <ConfidenceBadge level={r.confidenceLabel} />
                )}
                {r.catalystLabel || (!r.isPlaceholder && r.confidenceLabel) ? (
                  <span className="text-zinc-700">·</span>
                ) : null}
                <span>{r.source || "—"}</span>
                <span>·</span>
                <span>{r.timestamp || "—"}</span>
              </div>
              {r.why && (
                <div className="mt-1 text-[11px] text-zinc-400 leading-snug">{r.why}</div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function NewsThesisBanner({ thesis }) {
  const toneColor =
    thesis.tone === "good" || thesis.tone === "mild_good"
      ? COCKPIT_PALETTE.accentGreen
      : thesis.tone === "bad" || thesis.tone === "mild_bad"
        ? COCKPIT_PALETTE.accentRed
        : thesis.tone === "mixed"
          ? COCKPIT_PALETTE.accentAmber
          : COCKPIT_PALETTE.textDim;
  const bg =
    thesis.tone === "good" || thesis.tone === "mild_good"
      ? "rgba(34,197,94,0.06)"
      : thesis.tone === "bad" || thesis.tone === "mild_bad"
        ? "rgba(239,68,68,0.06)"
        : thesis.tone === "mixed"
          ? "rgba(245,158,11,0.06)"
          : "transparent";
  return (
    <div style={{
      padding: "8px 16px",
      borderBottom: `1px solid ${COCKPIT_PALETTE.borderSoft}`,
      background: bg,
      fontSize: 11, color: COCKPIT_PALETTE.text, lineHeight: 1.45,
      display: "flex", gap: 8, alignItems: "flex-start",
    }}>
      <span style={{
        flex: "none", marginTop: 4,
        width: 6, height: 6, borderRadius: 999,
        background: toneColor,
      }} aria-hidden="true" />
      <span>{thesis.text}</span>
    </div>
  );
}

function RelevanceBadge({ value }) {
  if (!value) return null;
  const tone = value === "high"        ? "bg-emerald-500/15 text-emerald-400"
             : value === "medium"      ? "bg-cyan-500/15 text-cyan-400"
             : value === "low"         ? "bg-zinc-700/40 text-zinc-300"
             : value === "placeholder" ? "bg-zinc-800/60 text-zinc-500"
             :                           "bg-zinc-800/60 text-zinc-400";
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${tone}`}>
      {value}
    </span>
  );
}

function CatalystBadge({ label }) {
  return (
    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded
                     bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
      {label}
    </span>
  );
}

function ConfidenceBadge({ level }) {
  const tone =
    level === "high"     ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
    : level === "moderate" ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
    :                        "bg-zinc-700/40 text-zinc-400 border-zinc-700";
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${tone}`}>
      {level} conf
    </span>
  );
}
