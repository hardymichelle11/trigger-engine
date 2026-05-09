// =====================================================
// BASKET LEADERSHIP TABLE
// =====================================================
// Renders the output of buildBasketLeadershipRead. Columns include
// per-symbol leadership classification + manager reads (TE / CV / MI /
// Risk) + CIO action + per-row action buttons. When manager
// assessments aren't supplied yet, every row shows trader-facing
// "Insufficient evidence" copy — no fabrication.
// =====================================================

import React from "react";
import { LEADERSHIP_STATUS } from "../../lib/portfolioCio/basketAgentTypes.js";
import { STANCE } from "../../lib/portfolioCio/managerAssessmentTypes.js";

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

const STATUS_TONES = {
  [LEADERSHIP_STATUS.LEADER]:          PALETTE.green,
  [LEADERSHIP_STATUS.EMERGING_LEADER]: PALETTE.accentTeal,
  [LEADERSHIP_STATUS.CHALLENGER]:      PALETTE.cyan,
  [LEADERSHIP_STATUS.LAGGARD]:         PALETTE.amber,
  [LEADERSHIP_STATUS.FADING_LEADER]:   PALETTE.red,
  [LEADERSHIP_STATUS.OVEREXTENDED]:    PALETTE.amber,
  [LEADERSHIP_STATUS.WATCH_ONLY]:      PALETTE.amber,
  [LEADERSHIP_STATUS.REMOVED]:         PALETTE.textFaint,
  [LEADERSHIP_STATUS.UNCLASSIFIED]:    PALETTE.textFaint,
};

const STATUS_LABELS = {
  [LEADERSHIP_STATUS.LEADER]:          "Leader",
  [LEADERSHIP_STATUS.EMERGING_LEADER]: "Emerging",
  [LEADERSHIP_STATUS.CHALLENGER]:      "Challenger",
  [LEADERSHIP_STATUS.LAGGARD]:         "Laggard",
  [LEADERSHIP_STATUS.FADING_LEADER]:   "Fading",
  [LEADERSHIP_STATUS.OVEREXTENDED]:    "Overextended",
  [LEADERSHIP_STATUS.WATCH_ONLY]:      "Watch only",
  [LEADERSHIP_STATUS.REMOVED]:         "Removed",
  [LEADERSHIP_STATUS.UNCLASSIFIED]:    "Insufficient evidence",
};

const STANCE_TONES = {
  [STANCE.BULLISH]:      PALETTE.green,
  [STANCE.CONSTRUCTIVE]: PALETTE.green,
  [STANCE.NEUTRAL]:      PALETTE.slate,
  [STANCE.CAUTIOUS]:     PALETTE.amber,
  [STANCE.BEARISH]:      PALETTE.red,
  [STANCE.UNAVAILABLE]:  PALETTE.textFaint,
};

/**
 * @param {object} props
 * @param {object} props.read                                output of buildBasketLeadershipRead
 * @param {object|null} props.universe                       universe record
 * @param {object} [props.managerAssessmentsBySymbol]
 * @param {(sym: string) => void} [props.onSendToTE]
 * @param {(sym: string) => void} [props.onSendToCV]
 * @param {(sym: string) => void} [props.onPromoteToScanner]
 * @param {(sym: string, reason?: string) => void} [props.onMoveToWatchlist]
 * @param {(sym: string, reason?: string) => void} [props.onMoveToExcluded]
 * @param {(sym: string) => void} [props.onRestoreToActive]
 * @param {(sym: string) => void} [props.onRemove]
 */
export default function BasketLeadershipTable({
  read,
  universe,
  managerAssessmentsBySymbol = {},
  onSendToTE,
  onSendToCV,
  onPromoteToScanner,
  onMoveToWatchlist,
  onMoveToExcluded,
  onRestoreToActive,
  onRemove,
}) {
  const u = universe || { activeUniverse: [], watchlist: [], excludedSymbols: [] };

  // Build a per-symbol membership lookup so we can render the column.
  const membership = new Map();
  for (const r of u.activeUniverse || [])    membership.set(r.symbol, "Active");
  for (const r of u.watchlist || [])         membership.set(r.symbol, "Watchlist");
  for (const r of u.excludedSymbols || [])   membership.set(r.symbol, "Excluded");

  // Build a per-symbol classification lookup from the leadership read.
  const classBySymbol = new Map();
  if (read) {
    for (const cls of (read.leaders || []))         classBySymbol.set(cls.symbol, cls);
    for (const cls of (read.emergingLeaders || [])) classBySymbol.set(cls.symbol, cls);
    for (const cls of (read.fadingNames || []))     classBySymbol.set(cls.symbol, cls);
    for (const cls of (read.watchOnly || []))       classBySymbol.set(cls.symbol, cls);
  }

  // Render order: active first, then watchlist, then excluded.
  const rows = [
    ...(u.activeUniverse || []).map((r) => ({ ...r, _list: "active" })),
    ...(u.watchlist || []).map((r) => ({ ...r, _list: "watchlist" })),
    ...(u.excludedSymbols || []).map((r) => ({ ...r, _list: "excluded" })),
  ];

  const noManagers = !managerAssessmentsBySymbol ||
    Object.keys(managerAssessmentsBySymbol).length === 0;

  return (
    <section aria-label="Basket leadership table"
      style={{
        background: PALETTE.bg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 8,
        padding: 12,
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.accentTeal, letterSpacing: "0.04em" }}>
          Leadership read
        </span>
        <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
          {rows.length} symbol{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Basket-level reads */}
      {read && (
        <div style={{
          marginBottom: 10, padding: "8px 10px",
          background: PALETTE.panelBg,
          border: `1px solid ${PALETTE.borderSoft}`,
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.55, marginBottom: 4 }}>
            {read.actionSummary}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6, marginTop: 6 }}>
            {read.deriskingRead && <KV label="Derisking"     value={read.deriskingRead} />}
            {read.repricingRead && <KV label="Repricing"     value={read.repricingRead} />}
            {read.institutionalRead && <KV label="Institutional" value={read.institutionalRead} />}
            <KV label="Risk level" value={read.basketRiskLevel || "—"} tone={read.basketRiskLevel === "elevated" ? PALETTE.red : PALETTE.slate} />
            <KV label="Confidence" value={read.basketConfidence || "—"} />
          </div>
        </div>
      )}

      {/* Suggested actions */}
      {(read?.suggestedAdditions?.length > 0 || read?.suggestedRemovals?.length > 0) && (
        <div style={{
          marginBottom: 10, padding: "8px 10px",
          background: PALETTE.panelBg,
          border: `1px solid ${PALETTE.borderSoft}`,
          borderRadius: 8,
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8,
        }}>
          {read.suggestedAdditions?.length > 0 && (
            <Suggestions title="Promote from watchlist" items={read.suggestedAdditions} tone={PALETTE.green} />
          )}
          {read.suggestedRemovals?.length > 0 && (
            <Suggestions title="Review for removal"     items={read.suggestedRemovals} tone={PALETTE.red} />
          )}
        </div>
      )}

      {/* No-data fallback for the table itself */}
      {rows.length === 0 ? (
        <div style={{ padding: "10px 4px", fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic" }}>
          No active, watchlist, or excluded names yet — seed baseline leaders or add manually.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${PALETTE.borderSoft}` }}>
                <Th>Symbol</Th>
                <Th>Membership</Th>
                <Th>Leadership</Th>
                <Th>Thesis</Th>
                <Th>Structure</Th>
                <Th>Premium</Th>
                <Th>Risk</Th>
                <Th>CIO action</Th>
                <Th>Notes / actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rec) => (
                <Row key={`${rec._list}-${rec.symbol}`}
                  rec={rec}
                  membership={membership.get(rec.symbol) || "—"}
                  classification={classBySymbol.get(rec.symbol) || null}
                  ma={managerAssessmentsBySymbol[rec.symbol] || null}
                  noManagers={noManagers}
                  onSendToTE={onSendToTE}
                  onSendToCV={onSendToCV}
                  onPromoteToScanner={onPromoteToScanner}
                  onMoveToWatchlist={onMoveToWatchlist}
                  onMoveToExcluded={onMoveToExcluded}
                  onRestoreToActive={onRestoreToActive}
                  onRemove={onRemove} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {noManagers && rows.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 10, color: PALETTE.textFaint, fontStyle: "italic", lineHeight: 1.5 }}>
          Insufficient manager evidence — leadership requires TE / CV / MI assessment. Use Ad Hoc Simulation to generate manager reads.
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

function Row({
  rec, membership, classification, ma, noManagers,
  onSendToTE, onSendToCV, onPromoteToScanner,
  onMoveToWatchlist, onMoveToExcluded, onRestoreToActive, onRemove,
}) {
  const status = classification?.status || LEADERSHIP_STATUS.UNCLASSIFIED;
  const tone = STATUS_TONES[status] || PALETTE.textFaint;
  const teStance = ma?.trigger_engine?.stance;
  const cvStance = ma?.credit_view?.stance;
  const miStance = ma?.market_intel?.stance;
  const riskStance = ma?.risk_manager?.stance;

  const onWatchlist = rec._list === "watchlist";
  const onExcluded  = rec._list === "excluded";

  return (
    <tr style={{ borderBottom: `1px solid ${PALETTE.borderSoft}` }}>
      <Td bold>{rec.symbol}</Td>
      <Td>
        <span style={{ fontSize: 10, color: PALETTE.textDim }}>{membership}</span>
      </Td>
      <Td>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
          color: tone, background: `${tone}1a`,
          border: `1px solid ${tone}55`, borderRadius: 4, padding: "2px 6px",
        }}>
          {STATUS_LABELS[status] || status}
        </span>
      </Td>
      <Td>
        <StanceCell stance={miStance} noManagers={noManagers} />
      </Td>
      <Td>
        <StanceCell stance={teStance} noManagers={noManagers} />
      </Td>
      <Td>
        <StanceCell stance={cvStance} noManagers={noManagers} />
      </Td>
      <Td>
        <StanceCell stance={riskStance} noManagers={noManagers} />
      </Td>
      <Td>
        <span style={{ fontSize: 10, color: PALETTE.text, lineHeight: 1.4 }}>
          {classification?.read || (noManagers ? "Insufficient manager evidence." : "—")}
        </span>
      </Td>
      <Td>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {rec.notes && <span style={{ fontSize: 9, color: PALETTE.textDim, fontStyle: "italic" }}>{rec.notes}</span>}
          {onSendToTE && (
            <button type="button" onClick={() => onSendToTE(rec.symbol)} style={btn(PALETTE.cyan)}>TE</button>
          )}
          {onSendToCV && (
            <button type="button" onClick={() => onSendToCV(rec.symbol)} style={btn(PALETTE.cyan)}>CV</button>
          )}
          {onPromoteToScanner && (
            <button type="button" onClick={() => onPromoteToScanner(rec.symbol)} style={btn(PALETTE.accentTeal)}>Scan</button>
          )}
          {!onWatchlist && !onExcluded && onMoveToWatchlist && (
            <button type="button" onClick={() => onMoveToWatchlist(rec.symbol, "needs_confirmation")} style={btn(PALETTE.amber)}>Watch</button>
          )}
          {!onExcluded && onMoveToExcluded && (
            <button type="button" onClick={() => onMoveToExcluded(rec.symbol, "operator_excluded")} style={btn(PALETTE.red)}>Exclude</button>
          )}
          {(onWatchlist || onExcluded) && onRestoreToActive && (
            <button type="button" onClick={() => onRestoreToActive(rec.symbol)} style={btn(PALETTE.green)}>Restore</button>
          )}
          {onRemove && (
            <button type="button" onClick={() => onRemove(rec.symbol)} style={btn(PALETTE.textFaint)}>✕</button>
          )}
        </div>
      </Td>
    </tr>
  );
}

function StanceCell({ stance, noManagers }) {
  if (noManagers || !stance || stance === STANCE.UNAVAILABLE) {
    return (
      <span style={{ fontSize: 9, color: PALETTE.textFaint, fontStyle: "italic" }}>
        unavailable
      </span>
    );
  }
  const tone = STANCE_TONES[stance] || PALETTE.textFaint;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
      color: tone, background: `${tone}1a`,
      border: `1px solid ${tone}55`,
      borderRadius: 4, padding: "1px 5px",
    }}>
      {humanizeStance(stance)}
    </span>
  );
}

function humanizeStance(s) {
  switch (s) {
    case STANCE.BULLISH:      return "Bullish";
    case STANCE.CONSTRUCTIVE: return "Constructive";
    case STANCE.NEUTRAL:      return "Neutral";
    case STANCE.CAUTIOUS:     return "Cautious";
    case STANCE.BEARISH:      return "Bearish";
    default:                  return "—";
  }
}

function KV({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 8, letterSpacing: "0.10em", color: PALETTE.textFaint }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 11, color: tone || PALETTE.text, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

function Suggestions({ title, items, tone }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: "0.10em", color: tone, fontWeight: 700, marginBottom: 4 }}>
        {title.toUpperCase()}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {items.map((it, i) => (
          <li key={i} style={{
            fontSize: 11, color: PALETTE.text, lineHeight: 1.5, padding: "1px 0",
            display: "flex", gap: 6, alignItems: "baseline",
          }}>
            <span style={{ color: tone, fontWeight: 700 }}>{it.symbol}</span>
            <span style={{ color: PALETTE.textDim }}>— {it.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Th({ children }) {
  return (
    <th style={{
      textAlign: "left", padding: "6px 8px",
      fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint,
      fontWeight: 600,
    }}>{children}</th>
  );
}
function Td({ children, bold = false }) {
  return (
    <td style={{
      padding: "6px 8px", fontSize: 11,
      color: PALETTE.text,
      fontWeight: bold ? 700 : 400,
      verticalAlign: "top",
    }}>{children}</td>
  );
}
function btn(color) {
  return {
    background: `${color}1a`, border: `1px solid ${color}88`, color,
    borderRadius: 4, padding: "2px 6px",
    fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
    cursor: "pointer", fontFamily: "inherit",
  };
}
