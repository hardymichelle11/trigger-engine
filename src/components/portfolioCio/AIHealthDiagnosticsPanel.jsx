// =====================================================
// AI HEALTH / DIAGNOSTICS PANEL
// =====================================================
// Specialty operator surface for the AI Health / Diagnostics basket.
// Reads from the existing basket-universe store + leadership engine
// (no parallel data layer) and decorates with per-symbol AI Health
// profiles + scanner verdicts. Renders:
//   - Sector thesis bar
//   - Compact heat-map row of basket members
//   - Top 3 cards (Best Premium / Best Accumulation / Best Sector
//     Confirmation) driven by aiHealthDiagnosticsScanner
//   - Detail side panel showing the full Credit-View-style insight
//     for the selected ticker
//
// Hard rules: no raw scores, no buy/sell wording, no capital
// allocation. Only operator-driven action callbacks.
// =====================================================

import React, { useCallback, useMemo, useState } from "react";
import {
  AI_HEALTH_DIAGNOSTICS_BASKET_ID,
  TIER,
  CATEGORY_LABELS,
  getAIHealthDiagnosticsProfile,
} from "../../lib/portfolioCio/aiHealthDiagnosticsProfiles.js";
import {
  rankAIHealthDiagnosticsBasket,
  VERDICT,
  VERDICT_LABELS,
} from "../../lib/portfolioCio/aiHealthDiagnosticsScanner.js";
import { buildAIHealthDiagnosticsInsight }
  from "../../lib/portfolioCio/aiHealthDiagnosticsAgent.js";
import { getBasketUniverse, seedBasketTiers }
  from "../../lib/portfolioCio/basketUniverseManager.js";
import { getBasketAgent }
  from "../../lib/portfolioCio/basketAgentRegistry.js";
import { buildBasketLeadershipRead }
  from "../../lib/portfolioCio/basketLeadershipEngine.js";
import { getBasketManagerInputs }
  from "../../lib/portfolioCio/basketManagerAssessmentResolver.js";
import { ACTION_TYPE } from "../../lib/portfolioCio/basketActionQueue.js";
import {
  getBasketMemory,
  listIntelligenceItems,
  archiveIntelligenceItem,
  promoteToAgentMemory,
  INTELLIGENCE_STATUS,
} from "../../lib/portfolioCio/agentMemoryStore.js";
import ThesisHealthPanel from "./ThesisHealthPanel.jsx";

const PALETTE = {
  bg:        "#06090e",
  panelBg:   "#0d1117",
  cardBg:    "#0a0d12",
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

const VERDICT_TONES = {
  [VERDICT.PREMIUM_CANDIDATE]:      PALETTE.green,
  [VERDICT.ACCUMULATION_CANDIDATE]: PALETTE.cyan,
  [VERDICT.STRONG_WATCH]:           PALETTE.amber,
  [VERDICT.DEFENSIVE_ANCHOR]:       PALETTE.slate,
  [VERDICT.AVOID_OR_WAIT]:          PALETTE.red,
};

const TIER_LABELS = {
  [TIER.TIER_1_PURE_PLAY]:          "Tier 1 · Pure Play",
  [TIER.TIER_2_INCUMBENT_FORTRESS]: "Tier 2 · Fortress",
  [TIER.TIER_3_ADJACENCY]:          "Tier 3 · Adjacency",
};

const ACTION_LABELS = {
  [ACTION_TYPE.RUN_AD_HOC_SIMULATION]:     "Run Ad Hoc Simulation",
  [ACTION_TYPE.SEND_TO_TE]:                "Send to TE",
  [ACTION_TYPE.SEND_TO_CV]:                "Send to CV",
  [ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW]: "Promote to Scanner",
  [ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW]:  "Move to Watchlist",
  [ACTION_TYPE.EXCLUDE_REVIEW]:            "Exclude",
  [ACTION_TYPE.MONITOR_ONLY]:              "Monitor",
};

/**
 * @param {object} props
 * @param {Record<string, object>} [props.managerAssessmentsBySymbol]   override / additions
 * @param {Record<string, object>} [props.historyBySymbol]              override / additions
 * @param {Record<string, string>} [props.newsAlignmentBySymbol]        per-symbol news alignment hint
 * @param {(symbol: string) => void} [props.onSendToTE]
 * @param {(symbol: string) => void} [props.onSendToCV]
 * @param {(symbol: string) => void} [props.onPromoteToScanner]
 * @param {(symbol: string) => void} [props.onRunAdHocSimulation]
 */
export default function AIHealthDiagnosticsPanel({
  managerAssessmentsBySymbol = {},
  historyBySymbol = {},
  newsAlignmentBySymbol = {},
  onSendToTE,
  onSendToCV,
  onPromoteToScanner,
  onRunAdHocSimulation,
}) {
  const profile = useMemo(() => getBasketAgent(AI_HEALTH_DIAGNOSTICS_BASKET_ID), []);
  const [tick, setTick] = useState(0);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [thesisHealthOpen, setThesisHealthOpen] = useState(false);

  const universe = useMemo(
    () => getBasketUniverse(AI_HEALTH_DIAGNOSTICS_BASKET_ID),
    [tick],
  );

  const handleSeedTiers = useCallback(() => {
    seedBasketTiers(AI_HEALTH_DIAGNOSTICS_BASKET_ID);
    setTick((n) => n + 1);
  }, []);

  // Manager memory — the resolver covers active + watchlist symbols.
  // Host overrides take precedence so the parent can replay a fresh
  // Ad Hoc result without waiting for memory write-back.
  const memoryInputs = useMemo(() => {
    const symbols = [
      ...((universe?.activeUniverse || []).map((r) => r.symbol)),
      ...((universe?.watchlist || []).map((r) => r.symbol)),
    ].filter(Boolean);
    return getBasketManagerInputs(symbols);
  }, [universe, tick]);

  const mergedManagerAssessments = useMemo(
    () => ({ ...memoryInputs.managerAssessmentsBySymbol, ...(managerAssessmentsBySymbol || {}) }),
    [memoryInputs, managerAssessmentsBySymbol],
  );
  const mergedHistory = useMemo(
    () => ({ ...memoryInputs.historyBySymbol, ...(historyBySymbol || {}) }),
    [memoryInputs, historyBySymbol],
  );

  const leadershipRead = useMemo(() => {
    if (!profile) return null;
    return buildBasketLeadershipRead({
      basketProfile: profile,
      basketUniverse: universe,
      managerAssessmentsBySymbol: mergedManagerAssessments,
      historyBySymbol: mergedHistory,
    });
  }, [profile, universe, mergedManagerAssessments, mergedHistory]);

  const leadershipClassBySymbol = useMemo(() => {
    const m = {};
    const r = leadershipRead;
    if (!r) return m;
    for (const c of (r.leaders || []))         m[c.symbol] = c;
    for (const c of (r.emergingLeaders || [])) m[c.symbol] = c;
    for (const c of (r.fadingNames || []))     m[c.symbol] = c;
    for (const c of (r.watchOnly || []))       m[c.symbol] = c;
    return m;
  }, [leadershipRead]);

  // Run the scanner across the basket. Seed candidates from the
  // operator's universe (active + watchlist) so excluded names are
  // intentionally omitted — they belong to other baskets.
  const ranked = useMemo(() => {
    const candidates = [
      ...((universe?.activeUniverse || []).map((r) => r.symbol)),
      ...((universe?.watchlist || []).map((r) => r.symbol)),
    ].filter(Boolean);
    return rankAIHealthDiagnosticsBasket(candidates, {
      managerAssessmentsBySymbol: mergedManagerAssessments,
      historyBySymbol: mergedHistory,
      leadershipClassBySymbol,
      newsAlignmentBySymbol,
    });
  }, [universe, mergedManagerAssessments, mergedHistory, leadershipClassBySymbol, newsAlignmentBySymbol]);

  // Build the side-panel insight when a symbol is selected.
  const selectedInsight = useMemo(() => {
    if (!selectedSymbol) return null;
    return buildAIHealthDiagnosticsInsight({
      symbol: selectedSymbol,
      managerAssessment: mergedManagerAssessments[selectedSymbol],
      history: mergedHistory[selectedSymbol],
      leadershipClass: leadershipClassBySymbol[selectedSymbol],
      newsAlignment: newsAlignmentBySymbol[selectedSymbol],
    });
  }, [selectedSymbol, mergedManagerAssessments, mergedHistory, leadershipClassBySymbol, newsAlignmentBySymbol]);

  const heatMap = buildHeatMap(universe, ranked.evaluated);

  if (!profile) {
    return (
      <section style={emptyStyle()}>No AI Health basket profile registered.</section>
    );
  }

  const isEmpty = heatMap.length === 0;

  return (
    <section aria-label="AI Health / Diagnostics panel"
      style={{
        background: PALETTE.bg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 10, padding: 12,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
      {/* Sector thesis bar */}
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim, marginBottom: 4 }}>
            AI HEALTH / DIAGNOSTICS
          </div>
          <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.55 }}>
            Who owns the intelligence layer of medicine?
          </div>
          <div style={{ fontSize: 10, color: PALETTE.textFaint, marginTop: 4, lineHeight: 1.5 }}>
            {profile.mandate}
          </div>
        </div>
        <button type="button"
          onClick={() => setThesisHealthOpen((v) => !v)}
          aria-pressed={thesisHealthOpen}
          style={{
            background: thesisHealthOpen ? `${PALETTE.purple}1a` : "transparent",
            border: `1px solid ${thesisHealthOpen ? PALETTE.purple : PALETTE.border}`,
            color: thesisHealthOpen ? PALETTE.purple : PALETTE.textDim,
            borderRadius: 5, padding: "4px 10px",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
            cursor: "pointer", fontFamily: "inherit",
          }}>
          {thesisHealthOpen ? "▾ Thesis Health" : "▸ Thesis Health"}
        </button>
      </header>

      {/* Inline thesis health */}
      {thesisHealthOpen && (
        <ThesisHealthInline tick={tick} onTick={() => setTick((n) => n + 1)} />
      )}

      {/* Empty-state seeder */}
      {isEmpty && (
        <div style={{
          background: PALETTE.panelBg,
          border: `1px solid ${PALETTE.borderSoft}`,
          borderRadius: 8, padding: 10,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5 }}>
            Basket is empty. Seed Tier 1 pure plays, Tier 2 fortresses, and Tier 3 adjacencies into the universe.
          </span>
          <button type="button" onClick={handleSeedTiers} style={primaryBtn()}>
            Seed AI Health basket
          </button>
        </div>
      )}

      {/* Top 3 cards */}
      {!isEmpty && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 10,
        }}>
          <TopCard
            title="Best Premium Candidate"
            tone={PALETTE.green}
            evalRow={ranked.bestPremium}
            onSelect={setSelectedSymbol}
            onSendToTE={onSendToTE}
            onSendToCV={onSendToCV}
            onPromoteToScanner={onPromoteToScanner}
            onRunAdHocSimulation={onRunAdHocSimulation} />
          <TopCard
            title="Best Long-Term Accumulation Candidate"
            tone={PALETTE.cyan}
            evalRow={ranked.bestAccumulation}
            onSelect={setSelectedSymbol}
            onSendToTE={onSendToTE}
            onSendToCV={onSendToCV}
            onPromoteToScanner={onPromoteToScanner}
            onRunAdHocSimulation={onRunAdHocSimulation} />
          <TopCard
            title="Best Sector Confirmation Signal"
            tone={PALETTE.purple}
            evalRow={ranked.bestSectorConfirmation}
            onSelect={setSelectedSymbol}
            onSendToTE={onSendToTE}
            onSendToCV={onSendToCV}
            onPromoteToScanner={onPromoteToScanner}
            onRunAdHocSimulation={onRunAdHocSimulation} />
        </div>
      )}

      {/* Heat map */}
      {!isEmpty && (
        <section aria-label="AI Health heat map" style={{
          background: PALETTE.panelBg,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: 10, padding: 10,
        }}>
          <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim, marginBottom: 6 }}>
            BASKET HEAT MAP · {heatMap.length}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {heatMap.map((cell) => (
              <HeatCell key={cell.symbol} cell={cell}
                isActive={selectedSymbol === cell.symbol}
                onSelect={() => setSelectedSymbol(cell.symbol)} />
            ))}
          </div>
        </section>
      )}

      {/* Detail side panel */}
      {selectedInsight && (
        <DetailPanel insight={selectedInsight}
          onClose={() => setSelectedSymbol(null)}
          onSendToTE={onSendToTE}
          onSendToCV={onSendToCV}
          onPromoteToScanner={onPromoteToScanner}
          onRunAdHocSimulation={onRunAdHocSimulation} />
      )}

      {/* Tier strips for orientation */}
      {!isEmpty && (
        <section aria-label="AI Health tier breakdown" style={{
          background: PALETTE.panelBg,
          border: `1px solid ${PALETTE.border}`,
          borderRadius: 10, padding: 10,
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10,
        }}>
          <TierStrip tier={TIER.TIER_1_PURE_PLAY} heatMap={heatMap} onSelect={setSelectedSymbol} />
          <TierStrip tier={TIER.TIER_2_INCUMBENT_FORTRESS} heatMap={heatMap} onSelect={setSelectedSymbol} />
          <TierStrip tier={TIER.TIER_3_ADJACENCY} heatMap={heatMap} onSelect={setSelectedSymbol} />
        </section>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

function ThesisHealthInline({ tick, onTick }) {
  const approvedMemory = React.useMemo(
    () => getBasketMemory(AI_HEALTH_DIAGNOSTICS_BASKET_ID),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const proposedIntelligence = React.useMemo(
    () => listIntelligenceItems()
      .filter((it) => it.basketId === AI_HEALTH_DIAGNOSTICS_BASKET_ID && it.status === INTELLIGENCE_STATUS.DRAFT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  const handleAccept = (proposed) => {
    if (!proposed || !proposed.id) return;
    promoteToAgentMemory(proposed.id);
    onTick && onTick();
  };
  const handleReject = (proposed) => {
    if (!proposed || !proposed.id) return;
    archiveIntelligenceItem(proposed.id);
    onTick && onTick();
  };
  const handleArchive = (id) => {
    if (!id) return;
    archiveIntelligenceItem(id);
    onTick && onTick();
  };
  const handleEdit = () => { onTick && onTick(); };

  return (
    <ThesisHealthPanel
      basketId={AI_HEALTH_DIAGNOSTICS_BASKET_ID}
      agentId="aiHealthDiagnosticsAgent"
      approvedMemory={approvedMemory}
      proposedIntelligence={proposedIntelligence}
      onAcceptUpdate={handleAccept}
      onEditThesis={handleEdit}
      onRejectUpdate={handleReject}
      onArchiveEvidence={handleArchive} />
  );
}

function TopCard({
  title, tone, evalRow, onSelect,
  onSendToTE, onSendToCV, onPromoteToScanner, onRunAdHocSimulation,
}) {
  if (!evalRow) {
    return (
      <article style={topCardStyle(PALETTE.borderSoft)}>
        <div style={cardTitleStyle(tone)}>{title}</div>
        <div style={{ fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic" }}>
          No candidate available — seed the basket or wait for manager evidence.
        </div>
      </article>
    );
  }
  const verdictTone = VERDICT_TONES[evalRow.verdict] || PALETTE.textFaint;
  return (
    <article style={topCardStyle(tone)}>
      <div style={cardTitleStyle(tone)}>{title}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
        <button type="button" onClick={() => onSelect(evalRow.symbol)} style={symbolBtn()}>
          {evalRow.symbol}
        </button>
        <span style={{ fontSize: 9, color: PALETTE.textFaint }}>{evalRow.name}</span>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
        <Chip label={CATEGORY_LABELS[evalRow.category] || "AI Health"} tone={tone} />
        <Chip label={evalRow.verdictLabel} tone={verdictTone} />
      </div>
      <div style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5, marginBottom: 4 }}>
        {evalRow.thesis}
      </div>
      <div style={{ fontSize: 10, color: PALETTE.textDim, lineHeight: 1.5 }}>
        {evalRow.posture}
      </div>
      <footer style={{
        display: "flex", gap: 4, flexWrap: "wrap",
        marginTop: 6, paddingTop: 6,
        borderTop: `1px solid ${PALETTE.borderSoft}`,
      }}>
        {onSendToTE && (
          <button type="button" onClick={() => onSendToTE(evalRow.symbol)} style={btn(PALETTE.cyan)}>TE</button>
        )}
        {onSendToCV && (
          <button type="button" onClick={() => onSendToCV(evalRow.symbol)} style={btn(PALETTE.cyan)}>CV</button>
        )}
        {evalRow.verdict === VERDICT.PREMIUM_CANDIDATE && onPromoteToScanner && (
          <button type="button" onClick={() => onPromoteToScanner(evalRow.symbol)} style={btn(PALETTE.green)}>
            Scanner
          </button>
        )}
        {onRunAdHocSimulation && (
          <button type="button" onClick={() => onRunAdHocSimulation(evalRow.symbol)} style={btn(PALETTE.purple)}>
            Run Sim
          </button>
        )}
      </footer>
    </article>
  );
}

function HeatCell({ cell, isActive, onSelect }) {
  const tone = VERDICT_TONES[cell.verdict] || PALETTE.textFaint;
  return (
    <button type="button" onClick={onSelect}
      aria-pressed={isActive}
      title={`${cell.symbol} · ${cell.verdictLabel}`}
      style={{
        background: `${tone}1a`, border: `1px solid ${isActive ? tone : `${tone}66`}`,
        color: tone, borderRadius: 6, padding: "4px 8px",
        fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
        cursor: "pointer", fontFamily: "inherit",
        display: "flex", flexDirection: "column", gap: 2,
        minWidth: 64, textAlign: "left",
      }}>
      <span>{cell.symbol}</span>
      <span style={{ fontSize: 8, color: PALETTE.textFaint, fontWeight: 500, letterSpacing: "0.06em" }}>
        {cell.verdictLabel}
      </span>
    </button>
  );
}

function TierStrip({ tier, heatMap, onSelect }) {
  const cells = heatMap.filter((c) => c.tier === tier);
  return (
    <div>
      <div style={{
        fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint, fontWeight: 700, marginBottom: 4,
      }}>
        {(TIER_LABELS[tier] || "Tier").toUpperCase()} · {cells.length}
      </div>
      {cells.length === 0 ? (
        <div style={{ fontSize: 10, color: PALETTE.textFaint, fontStyle: "italic" }}>
          No symbols in this tier yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {cells.map((c) => (
            <button key={c.symbol} type="button" onClick={() => onSelect(c.symbol)}
              style={{
                background: "transparent", border: `1px solid ${PALETTE.borderSoft}`,
                color: PALETTE.text, borderRadius: 4, padding: "2px 6px",
                fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {c.symbol}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailPanel({
  insight, onClose,
  onSendToTE, onSendToCV, onPromoteToScanner, onRunAdHocSimulation,
}) {
  const tone = VERDICT_TONES[insight.verdict] || PALETTE.textFaint;
  const handlers = {
    [ACTION_TYPE.RUN_AD_HOC_SIMULATION]:     onRunAdHocSimulation,
    [ACTION_TYPE.SEND_TO_TE]:                onSendToTE,
    [ACTION_TYPE.SEND_TO_CV]:                onSendToCV,
    [ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW]: onPromoteToScanner,
  };
  return (
    <article aria-label={`${insight.symbol} detail`}
      style={{
        background: PALETTE.panelBg,
        border: `1px solid ${tone}55`,
        borderLeft: `3px solid ${tone}`,
        borderRadius: 10, padding: 12,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        flexWrap: "wrap", gap: 6,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: PALETTE.accentTeal, letterSpacing: "0.04em" }}>
            {insight.symbol}
          </span>
          <span style={{ fontSize: 10, color: PALETTE.textFaint }}>
            {insight.name} · {insight.categoryLabel}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <Chip label={insight.postureLabel} tone={tone} />
          <Chip label={insight.verdictLabel} tone={tone} />
          <button type="button" onClick={onClose} style={btn(PALETTE.textFaint)}>Close</button>
        </div>
      </header>

      <Field label="Role"             value={insight.role} />
      <Field label="Thesis"           value={insight.thesisSummary} />
      <Field label="Credit View"      value={insight.creditViewInsight} />
      <Field label="Suggested action" value={insight.suggestedAction} tone={PALETTE.cyan} />
      <Field label="Key levels"       value={insight.keyLevels} />
      <Field label="Assignment comfort" value={insight.assignmentComfort} />
      <Field label="News alignment"   value={insight.newsLine} />

      {/* Risks to verify */}
      {Array.isArray(insight.risksToVerify) && insight.risksToVerify.length > 0 && (
        <section>
          <div style={{ fontSize: 9, letterSpacing: "0.10em", color: PALETTE.textFaint, fontWeight: 700, marginBottom: 4 }}>
            RISKS TO VERIFY
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {insight.risksToVerify.map((r, i) => (
              <li key={i} style={{ fontSize: 11, color: PALETTE.text, lineHeight: 1.5, padding: "1px 0" }}>
                • {r}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Action buttons */}
      <footer style={{
        display: "flex", gap: 4, flexWrap: "wrap",
        marginTop: 4, paddingTop: 6,
        borderTop: `1px solid ${PALETTE.borderSoft}`,
      }}>
        {(insight.allowedActions || []).map((a) => {
          const handler = handlers[a];
          if (!handler) return null;
          const t = VERDICT_TONES[insight.verdict] || PALETTE.cyan;
          return (
            <button key={a} type="button" onClick={() => handler(insight.symbol)} style={btn(t)}>
              {ACTION_LABELS[a] || a}
            </button>
          );
        })}
      </footer>
    </article>
  );
}

function Field({ label, value, tone }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 8, letterSpacing: "0.10em", color: PALETTE.textFaint, marginBottom: 2 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 11, color: tone || PALETTE.text, lineHeight: 1.55 }}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function buildHeatMap(universe, evaluated) {
  const evalBySymbol = new Map();
  for (const e of evaluated || []) evalBySymbol.set(e.symbol, e);

  const out = [];
  // Walk the operator's universe order so the heat map mirrors basket
  // membership (active first, watchlist next).
  for (const r of (universe?.activeUniverse || [])) {
    out.push(makeCell(r.symbol, evalBySymbol.get(r.symbol)));
  }
  for (const r of (universe?.watchlist || [])) {
    out.push(makeCell(r.symbol, evalBySymbol.get(r.symbol)));
  }
  return out.filter(Boolean);
}

function makeCell(symbol, evalRow) {
  const profile = getAIHealthDiagnosticsProfile(symbol);
  if (!profile) return null;
  const verdict = evalRow?.verdict || VERDICT.STRONG_WATCH;
  return {
    symbol,
    tier: profile.tier,
    verdict,
    verdictLabel: VERDICT_LABELS[verdict] || "Strong Watch",
    name: profile.name,
  };
}

function topCardStyle(tone) {
  return {
    background: PALETTE.cardBg,
    border: `1px solid ${tone}55`,
    borderLeft: `3px solid ${tone}`,
    borderRadius: 8, padding: 10,
    display: "flex", flexDirection: "column", gap: 4,
  };
}
function cardTitleStyle(tone) {
  return {
    fontSize: 9, letterSpacing: "0.10em", color: tone, fontWeight: 700, marginBottom: 4,
  };
}
function symbolBtn() {
  return {
    background: "transparent", border: "none", padding: 0, cursor: "pointer",
    color: PALETTE.accentTeal, fontWeight: 700, fontSize: 12, letterSpacing: "0.04em",
    fontFamily: "inherit",
  };
}
function emptyStyle() {
  return {
    background: PALETTE.bg, border: `1px solid ${PALETTE.border}`,
    borderRadius: 10, padding: 12,
    fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic",
  };
}
function btn(color) {
  return {
    background: `${color}1a`, border: `1px solid ${color}88`, color,
    borderRadius: 5, padding: "3px 8px",
    fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
    cursor: "pointer", fontFamily: "inherit",
  };
}
function primaryBtn() {
  return {
    background: `${PALETTE.accentTeal}1a`,
    border: `1px solid ${PALETTE.accentTeal}88`,
    color: PALETTE.accentTeal,
    borderRadius: 6, padding: "5px 10px",
    fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
    cursor: "pointer", fontFamily: "inherit",
  };
}
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
