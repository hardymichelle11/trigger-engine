// =====================================================
// CIO BASKET SUMMARY CARD
// =====================================================
// One row in the CIO Review Dashboard. Renders a single basket's
// rollup: counts, leadership read, top leaders / emerging / fading
// names, calibration flags, suggested operator focus. Pure
// presentational — clicking a name fires the host callback so the
// dashboard can scroll the basket panel into view (or no-op).
// =====================================================

import React from "react";

const PALETTE = {
  bg:        "#0d1117",
  panelBg:   "#0a0d12",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  accentTeal:"#14b8a6",
  green:     "#22c55e",
  red:       "#ef4444",
  amber:     "#f59e0b",
  cyan:      "#06b6d4",
  purple:    "#a78bfa",
  slate:     "#64748b",
};

const RISK_TONES = {
  elevated:  PALETTE.red,
  moderate:  PALETTE.amber,
  contained: PALETTE.green,
};

/**
 * @param {object} props
 * @param {object} props.summary                              one entry from dashboard.basketSummaries
 * @param {(basketId: string) => void} [props.onOpenBasket]
 */
export default function CioBasketSummaryCard({ summary, onOpenBasket }) {
  if (!summary) return null;
  const riskTone = RISK_TONES[summary.riskRead] || PALETTE.slate;
  const hasHigh = summary.highPriorityActionCount > 0;

  return (
    <article aria-label={`${summary.basketName} dashboard summary`}
      style={{
        background: PALETTE.bg,
        border: `1px solid ${hasHigh ? `${PALETTE.amber}55` : PALETTE.border}`,
        borderLeft: `3px solid ${hasHigh ? PALETTE.amber : PALETTE.accentTeal}`,
        borderRadius: 8, padding: 10,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
      {/* Header */}
      <header style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "baseline", gap: 6, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <button type="button"
            onClick={() => onOpenBasket && onOpenBasket(summary.basketId)}
            style={{
              background: "transparent", border: "none", cursor: onOpenBasket ? "pointer" : "default",
              color: PALETTE.accentTeal, fontWeight: 700, fontSize: 12, letterSpacing: "0.04em",
              padding: 0, fontFamily: "inherit",
            }}>
            {summary.basketName}
          </button>
          <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
            {summary.activeCount} active · {summary.watchlistCount} watch · {summary.excludedCount} excluded
          </span>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <Chip label={`Risk: ${summary.riskRead}`} tone={riskTone} />
          {hasHigh && (
            <Chip
              label={`${summary.highPriorityActionCount} high-priority`}
              tone={PALETTE.amber} />
          )}
          {summary.insufficientEvidenceCount > 0 && (
            <Chip
              label={`${summary.insufficientEvidenceCount} need evidence`}
              tone={PALETTE.cyan} />
          )}
        </div>
      </header>

      {/* Suggested operator focus */}
      {summary.suggestedOperatorFocus && (
        <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
          {summary.suggestedOperatorFocus}
        </div>
      )}

      {/* Reads grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 6,
        background: PALETTE.panelBg,
        border: `1px solid ${PALETTE.borderSoft}`,
        borderRadius: 6, padding: "6px 8px",
      }}>
        <Stat
          label="Leaders"
          value={summary.leadershipRead?.leaderCount ?? 0}
          tone={PALETTE.green} />
        <Stat
          label="Emerging"
          value={summary.leadershipRead?.emergingLeaderCount ?? 0}
          tone={PALETTE.accentTeal} />
        <Stat
          label="Fading"
          value={summary.leadershipRead?.fadingCount ?? 0}
          tone={PALETTE.red} />
        <Stat
          label="Watch only"
          value={summary.leadershipRead?.watchOnlyCount ?? 0}
          tone={PALETTE.amber} />
      </div>

      {/* Sub-reads */}
      {(summary.leadershipRead?.deriskingRead ||
        summary.leadershipRead?.repricingRead ||
        summary.leadershipRead?.institutionalRead) && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 4, marginTop: 2,
        }}>
          {summary.leadershipRead.deriskingRead && (
            <SubRead label="Derisking" value={summary.leadershipRead.deriskingRead} />
          )}
          {summary.leadershipRead.repricingRead && (
            <SubRead label="Repricing" value={summary.leadershipRead.repricingRead} />
          )}
          {summary.leadershipRead.institutionalRead && (
            <SubRead label="Institutional" value={summary.leadershipRead.institutionalRead} />
          )}
        </div>
      )}

      {/* Top names lists */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 6,
      }}>
        <NameList
          title="Top leaders"
          tone={PALETTE.green}
          items={summary.topLeaders} />
        <NameList
          title="Emerging"
          tone={PALETTE.accentTeal}
          items={summary.emergingLeaders} />
        <NameList
          title="Fading"
          tone={PALETTE.red}
          items={summary.fadingNames} />
      </div>

      {/* Calibration flags */}
      {summary.calibrationFlags && summary.calibrationFlags.length > 0 && (
        <div style={{
          fontSize: 10, color: PALETTE.purple, lineHeight: 1.5,
          background: `${PALETTE.purple}10`,
          border: `1px solid ${PALETTE.purple}33`,
          borderRadius: 6, padding: "4px 6px",
        }}>
          <span style={{ fontWeight: 700, letterSpacing: "0.06em", marginRight: 6 }}>
            CALIBRATION:
          </span>
          {summary.calibrationFlags.map((f, i) => (
            <span key={`${f.symbol}-${i}`}>
              {i > 0 ? " · " : ""}{f.symbol} ({f.flag})
            </span>
          ))}
        </div>
      )}

      {/* Action summary */}
      {summary.leadershipRead?.actionSummary && (
        <div style={{ fontSize: 10, color: PALETTE.textDim, lineHeight: 1.5, fontStyle: "italic" }}>
          {summary.leadershipRead.actionSummary}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

function Chip({ label, tone }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
      color: tone, background: `${tone}1a`,
      border: `1px solid ${tone}55`, borderRadius: 4, padding: "2px 6px",
    }}>
      {label}
    </span>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 8, letterSpacing: "0.10em", color: PALETTE.textFaint }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 14, color: tone, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

function SubRead({ label, value }) {
  return (
    <div style={{ fontSize: 10, color: PALETTE.textDim, lineHeight: 1.45 }}>
      <span style={{
        fontSize: 8, letterSpacing: "0.10em", color: PALETTE.textFaint, marginRight: 4,
      }}>
        {label.toUpperCase()}
      </span>
      <span style={{ color: PALETTE.text }}>{value}</span>
    </div>
  );
}

function NameList({ title, tone, items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <div style={{
        fontSize: 8, letterSpacing: "0.10em", color: tone, fontWeight: 700, marginBottom: 2,
      }}>
        {title.toUpperCase()}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {items.map((it, i) => (
          <li key={`${it.symbol}-${i}`} style={{
            fontSize: 10, color: PALETTE.text, lineHeight: 1.5,
            display: "flex", gap: 4, alignItems: "baseline",
          }}>
            <span style={{ color: tone, fontWeight: 700 }}>{it.symbol}</span>
            {it.read && (
              <span style={{ color: PALETTE.textFaint, fontStyle: "italic" }}>
                — {truncate(it.read, 50)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function truncate(str, len) {
  if (typeof str !== "string") return "";
  if (str.length <= len) return str;
  return str.slice(0, Math.max(0, len - 1)) + "…";
}
