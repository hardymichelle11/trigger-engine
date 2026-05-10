// =====================================================
// UNIVERSE WORKSPACE — operator-first chrome
// =====================================================
// Sidebar + main content + right-side detail drawer. The default
// view is operator-friendly: Dashboard, theme sections, Watchlist.
// All legacy admin / backend panels (Core Catalog, Dynamic Basket
// Manager, CIO Review Dashboard, Basket Agent Panel, Manager
// Assessment Tape memory, Simulation History, Market Intelligence
// Inbox internals, Thesis Health raw panel) live behind
// "Settings / Admin" so a normal user never sees them.
// =====================================================

import React, { useCallback, useMemo, useState } from "react";

// Workspace chrome
import UniverseSidebar, {
  SECTION_ID,
  WorkspaceTopNav,
} from "../workspace/UniverseSidebar.jsx";
import MarketRegimeStrip from "../workspace/MarketRegimeStrip.jsx";
import TopOpportunityCard from "../workspace/TopOpportunityCard.jsx";
import ActiveTickerCard from "../workspace/ActiveTickerCard.jsx";
import TickerDetailDrawer from "../workspace/TickerDetailDrawer.jsx";

// Legacy admin panels — kept fully accessible under Settings / Admin.
import AdHocTickerSearch from "./AdHocTickerSearch.jsx";
import UniverseSelector, { UNIVERSE_OPTIONS } from "../scanner/UniverseSelector.jsx";
import DynamicBasketManager from "../scanner/DynamicBasketManager.jsx";
import AdHocSimulationHistory from "../scanner/AdHocSimulationHistory.jsx";
import BasketAgentPanel from "../portfolioCio/BasketAgentPanel.jsx";
import CioReviewDashboard from "../portfolioCio/CioReviewDashboard.jsx";
import AIHealthDiagnosticsPanel from "../portfolioCio/AIHealthDiagnosticsPanel.jsx";
import MarketIntelligenceInbox from "../portfolioCio/MarketIntelligenceInbox.jsx";
import ThesisHealthPanel from "../portfolioCio/ThesisHealthPanel.jsx";

// Engines / stores used by the operator chrome
import { buildAIHealthDiagnosticsInsight } from "../../lib/portfolioCio/aiHealthDiagnosticsAgent.js";
import { isAIHealthDiagnosticsSymbol, getAIHealthDiagnosticsProfile }
  from "../../lib/portfolioCio/aiHealthDiagnosticsProfiles.js";
import { buildMarketIntelligenceContext }
  from "../../lib/portfolioCio/marketIntelligenceContextBuilder.js";
import { evaluateThesisHealth }
  from "../../lib/portfolioCio/thesisHealthEvaluator.js";
import { buildCioReviewDashboard }
  from "../../lib/portfolioCio/cioReviewDashboardEngine.js";
import { listBasketAgents, getBasketAgent }
  from "../../lib/portfolioCio/basketAgentRegistry.js";
import { getBasketUniverse, listBasketUniverses }
  from "../../lib/portfolioCio/basketUniverseManager.js";
import { getBasketManagerInputs }
  from "../../lib/portfolioCio/basketManagerAssessmentResolver.js";
import {
  getBasketMemory,
  listIntelligenceItems,
  archiveIntelligenceItem,
  promoteToAgentMemory,
  INTELLIGENCE_STATUS,
} from "../../lib/portfolioCio/agentMemoryStore.js";
import {
  runTickerSearch,
  listActiveResearchTickers,
  removeActiveResearchTicker,
  markTickerReviewed,
  getTickerReviewedAt,
} from "../../lib/workspace/tickerSearchWorkflow.js";
import { describeWhatChanged }
  from "../../lib/ui/whatChangedBuilder.js";
import { getDemoIntelligenceFor }
  from "../../lib/workspace/demoIntelligenceLibrary.js";

const PALETTE = {
  bg:        "#06090e",
  panelBg:   "#0d1117",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  accentTeal:"#14b8a6",
  amber:     "#f59e0b",
  green:     "#22c55e",
  red:       "#ef4444",
  cyan:      "#06b6d4",
  purple:    "#a78bfa",
};

// Mapping from sidebar theme sections to basket ids in the registry.
// Sections without a wired engine (Robotics / SaaS / Dividend / Alerts
// / Portfolio) render a "Coming soon" placeholder.
const SECTION_BASKET_MAP = Object.freeze({
  [SECTION_ID.AI_INFRA]:     "brain_compute",
  [SECTION_ID.AI_HEALTH]:    "ai_health_diagnostics",
  [SECTION_ID.ROBOTICS]:     "robotics_automation",
  [SECTION_ID.SAAS_HARVEST]: "workflow_agentic_software",
});

// Sections where AI Health is the only fully-wired data path so far.
const FULLY_WIRED_SECTIONS = new Set([SECTION_ID.AI_HEALTH]);

/**
 * @param {object} props
 * @param {(symbol: string) => void} [props.onSendToTE]
 * @param {(symbol: string) => void} [props.onSendToCV]
 */
export default function UniverseWorkspace({
  onSendToTE,
  onSendToCV,
  // Legacy admin props — preserved so existing scanner flows still work
  // when the operator drops into Settings / Admin.
  selected,
  onSelectionChange,
  manualList,
  onManualListChange,
  selectedCioBasketId = null,
  onCioBasketChange,
  onCataloged,
  includeSelector = true,
  includeManager = true,
  // Test / consumer override for the persisted collapse pref. When
  // omitted the workspace reads the localStorage pref on mount.
  defaultCollapsed,
} = {}) {
  const [section, setSection] = useState(SECTION_ID.DASHBOARD);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [tick, setTick] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof defaultCollapsed === "boolean"
      ? defaultCollapsed
      : readSidebarCollapsedPref(),
  );

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      writeSidebarCollapsedPref(next);
      return next;
    });
  }, []);

  const handleSelectSymbol = useCallback((sym) => {
    if (!sym) return;
    setSelectedSymbol(sym);
  }, []);

  const handleCloseDrawer = useCallback(() => setSelectedSymbol(null), []);

  const handleSearch = useCallback((raw) => {
    const result = runTickerSearch(raw);
    if (!result.ok) return;
    setSelectedSymbol(result.symbol);
    setTick((n) => n + 1);
  }, []);

  const handleRemoveTicker = useCallback((sym) => {
    removeActiveResearchTicker(sym);
    setTick((n) => n + 1);
    if (sym === selectedSymbol) setSelectedSymbol(null);
  }, [selectedSymbol]);

  // Operator action callbacks for the drawer. These are non-destructive
  // — Add intelligence + Open admin details route the operator into
  // Settings / Admin where the Market Intelligence Inbox lives. Mark
  // reviewed stamps a timestamp on the symbol via the workspace store.
  // Set alert is a Phase 2 placeholder (alerts surface not built yet).
  const handleAddIntelligence = useCallback(() => {
    setSection(SECTION_ID.SETTINGS_ADMIN);
  }, []);
  const handleSetAlert = useCallback(() => {
    // Placeholder: future commit will surface an alert configurator.
  }, []);
  const handleMarkReviewed = useCallback((sym) => {
    if (!sym) return;
    markTickerReviewed(sym);
    setTick((n) => n + 1);
  }, []);
  const handleMoveToWatchlist = useCallback(() => {
    setSection(SECTION_ID.WATCHLIST);
  }, []);
  const handleOpenAdminDetails = useCallback(() => {
    setSection(SECTION_ID.SETTINGS_ADMIN);
  }, []);

  // Active research list — drives the cards in Dashboard / Watchlist.
  const activeTickers = useMemo(
    () => listActiveResearchTickers(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  // Selected-symbol drawer payload.
  const drawerPayload = useDrawerPayload(selectedSymbol, tick);

  // Top-3 opportunities + active ticker cards build below.
  const topOpportunities = useMemo(
    () => buildTopOpportunities(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  const activeTickerCards = useMemo(
    () => activeTickers.map((sym) => buildActiveCard(sym)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTickers, tick],
  );

  // Layout reshapes between modes:
  //   - Expanded:  3-col grid (220px sidebar | main | optional drawer)
  //   - Collapsed: top nav strip above a 2-col grid (main | drawer)
  // Splitting into a flex-column outer wrapper lets the dashboard
  // reclaim the full width when the nav is collapsed instead of
  // leaving a vertical rail consuming the left edge.
  return (
    <div style={{
      background: PALETTE.bg,
      borderTop: `1px solid ${PALETTE.borderSoft}`,
      borderBottom: `1px solid ${PALETTE.borderSoft}`,
      display: "flex", flexDirection: "column",
      minHeight: 600,
    }}>
      {sidebarCollapsed && (
        <WorkspaceTopNav selected={section} onSelect={setSection}
          onToggleCollapsed={handleToggleSidebar} />
      )}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: sidebarCollapsed
          ? (drawerPayload ? "minmax(0, 1fr) minmax(320px, 420px)" : "minmax(0, 1fr)")
          : (drawerPayload ? "220px minmax(0, 1fr) minmax(320px, 420px)" : "220px minmax(0, 1fr)"),
      }}>
      {!sidebarCollapsed && (
        <UniverseSidebar selected={section} onSelect={setSection}
          onToggleCollapsed={handleToggleSidebar} />
      )}

      <main aria-label="Workspace main"
        style={{
          padding: 12, display: "flex", flexDirection: "column", gap: 12,
          minWidth: 0,
        }}>
        <SearchBar onSubmit={handleSearch} />

        {/* Each section renders its own content */}
        {section === SECTION_ID.DASHBOARD && (
          <DashboardSection
            topOpportunities={topOpportunities}
            activeCards={activeTickerCards}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={handleSelectSymbol}
            onRemoveTicker={handleRemoveTicker} />
        )}

        {section === SECTION_ID.AI_HEALTH && (
          <AIHealthSection
            onSendToTE={onSendToTE}
            onSendToCV={onSendToCV} />
        )}

        {section === SECTION_ID.WATCHLIST && (
          <WatchlistSection
            activeCards={activeTickerCards}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={handleSelectSymbol}
            onRemoveTicker={handleRemoveTicker} />
        )}

        {(section === SECTION_ID.AI_INFRA ||
          section === SECTION_ID.ROBOTICS ||
          section === SECTION_ID.SAAS_HARVEST) && (
          <ThemePlaceholderSection sectionId={section} />
        )}

        {(section === SECTION_ID.DIVIDEND_INCOME ||
          section === SECTION_ID.ALERTS ||
          section === SECTION_ID.PORTFOLIO) && (
          <ComingSoonSection sectionId={section} />
        )}

        {section === SECTION_ID.SETTINGS_ADMIN && (
          <SettingsAdminSection
            onSendToTE={onSendToTE}
            onSendToCV={onSendToCV}
            selected={selected}
            onSelectionChange={onSelectionChange}
            manualList={manualList}
            onManualListChange={onManualListChange}
            selectedCioBasketId={selectedCioBasketId}
            onCioBasketChange={onCioBasketChange}
            onCataloged={onCataloged}
            includeSelector={includeSelector}
            includeManager={includeManager} />
        )}
      </main>

      {drawerPayload && (
        <TickerDetailDrawer
          {...drawerPayload}
          onClose={handleCloseDrawer}
          onAddIntelligence={handleAddIntelligence}
          onSetAlert={handleSetAlert}
          onMarkReviewed={handleMarkReviewed}
          onMoveToWatchlist={handleMoveToWatchlist}
          onOpenAdminDetails={handleOpenAdminDetails} />
      )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------

function DashboardSection({
  topOpportunities, activeCards,
  selectedSymbol, onSelectSymbol, onRemoveTicker,
}) {
  return (
    <>
      <MarketRegimeStrip regime={composeMarketRegime(topOpportunities)} />

      <section aria-label="Top opportunities" style={{
        background: PALETTE.bg, borderRadius: 10,
      }}>
        <div style={titleRow()}>TOP OPPORTUNITIES</div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 10,
        }}>
          {[0, 1, 2].map((i) => (
            <TopOpportunityCard
              key={i}
              opportunity={topOpportunities[i] || null}
              onSelect={onSelectSymbol}
              placeholderTitle={[
                "Best Opportunity",
                "Second Opportunity",
                "Third Opportunity",
              ][i]} />
          ))}
        </div>
      </section>

      <section aria-label="Active research" style={{ background: PALETTE.bg, borderRadius: 10 }}>
        <div style={titleRow()}>ACTIVE RESEARCH · {activeCards.length}</div>
        {activeCards.length === 0 ? (
          <div style={emptyHelpStyle()}>
            Search a ticker to start research. Example: AMD, TEM, GH, NBIS.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activeCards.map((card) => (
              <ActiveTickerCard key={card.symbol}
                ticker={card}
                isSelected={selectedSymbol === card.symbol}
                onSelect={onSelectSymbol}
                onRemove={onRemoveTicker} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function WatchlistSection({ activeCards, selectedSymbol, onSelectSymbol, onRemoveTicker }) {
  return (
    <section aria-label="Watchlist">
      <div style={titleRow()}>WATCHLIST · {activeCards.length}</div>
      {activeCards.length === 0 ? (
        <div style={emptyHelpStyle()}>
          No tickers on your watchlist yet. Use the search bar above.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {activeCards.map((card) => (
            <ActiveTickerCard key={card.symbol}
              ticker={card}
              isSelected={selectedSymbol === card.symbol}
              onSelect={onSelectSymbol}
              onRemove={onRemoveTicker} />
          ))}
        </div>
      )}
    </section>
  );
}

function AIHealthSection({ onSendToTE, onSendToCV }) {
  return (
    <section aria-label="AI Health workspace">
      <AIHealthDiagnosticsPanel
        onSendToTE={onSendToTE}
        onSendToCV={onSendToCV} />
    </section>
  );
}

function ThemePlaceholderSection({ sectionId }) {
  const basketId = SECTION_BASKET_MAP[sectionId];
  const profile  = basketId ? getBasketAgent(basketId) : null;
  return (
    <section aria-label="Theme placeholder">
      <div style={titleRow()}>{(profile?.basketName || "THEME").toUpperCase()}</div>
      <div style={{
        background: PALETTE.panelBg,
        border: `1px solid ${PALETTE.borderSoft}`,
        borderRadius: 8, padding: "16px 20px",
        fontSize: 11, color: PALETTE.textFaint, lineHeight: 1.6,
      }}>
        Coming soon — engine wiring in progress.
        {profile?.mandate && (
          <div style={{ marginTop: 6, color: PALETTE.textDim }}>
            Mandate: {profile.mandate}
          </div>
        )}
      </div>
    </section>
  );
}

function ComingSoonSection({ sectionId }) {
  const labels = {
    [SECTION_ID.DIVIDEND_INCOME]: "Dividend Income",
    [SECTION_ID.ALERTS]:          "Alerts",
    [SECTION_ID.PORTFOLIO]:       "Portfolio",
  };
  return (
    <section aria-label="Coming soon">
      <div style={titleRow()}>{(labels[sectionId] || "Coming soon").toUpperCase()}</div>
      <div style={{
        background: PALETTE.panelBg,
        border: `1px solid ${PALETTE.borderSoft}`,
        borderRadius: 8, padding: "16px 20px",
        fontSize: 11, color: PALETTE.textFaint, lineHeight: 1.6,
      }}>
        Coming soon — surface in design.
      </div>
    </section>
  );
}

// Settings / Admin: every legacy panel preserved here so no
// functionality is lost. Each panel is collapsible. Default closed.
function SettingsAdminSection(props) {
  return (
    <section aria-label="Settings / Admin">
      <div style={titleRow()}>SETTINGS / ADMIN</div>
      <div style={{
        background: PALETTE.panelBg,
        border: `1px solid ${PALETTE.borderSoft}`,
        borderRadius: 8, padding: "8px 10px",
        fontSize: 10, color: PALETTE.textFaint, lineHeight: 1.5,
        marginBottom: 10,
      }}>
        Advanced controls and backend panels. Most operators will not need to use these — Dashboard and Watchlist cover normal research flow.
      </div>

      <CollapsiblePanel title="Ticker search · catalog · history">
        <AdHocTickerSearch
          onCataloged={props.onCataloged}
          onSendToTE={props.onSendToTE}
          onSendToCV={props.onSendToCV} />
        {props.includeSelector && (
          <UniverseSelector
            selected={props.selected || ["core_catalog"]}
            onChange={props.onSelectionChange}
            manualList={props.manualList || ""}
            onManualListChange={props.onManualListChange}
            selectedCioBasketId={props.selectedCioBasketId}
            onCioBasketChange={props.onCioBasketChange} />
        )}
        {props.includeManager && (
          <DynamicBasketManager
            onSendToTE={props.onSendToTE}
            onSendToCV={props.onSendToCV} />
        )}
        <AdHocSimulationHistory
          onSendToTE={props.onSendToTE}
          onSendToCV={props.onSendToCV} />
      </CollapsiblePanel>

      <CollapsiblePanel title="CIO basket agents (raw)">
        <BasketAgentPanel
          onSendToTE={props.onSendToTE}
          onSendToCV={props.onSendToCV} />
      </CollapsiblePanel>

      <CollapsiblePanel title="CIO review dashboard (raw)">
        <CioReviewDashboard
          onSendToTE={props.onSendToTE}
          onSendToCV={props.onSendToCV} />
      </CollapsiblePanel>

      <CollapsiblePanel title="AI Health / Diagnostics specialty panel (raw)">
        <AIHealthDiagnosticsPanel
          onSendToTE={props.onSendToTE}
          onSendToCV={props.onSendToCV} />
      </CollapsiblePanel>

      <CollapsiblePanel title="Market Intelligence Inbox (raw)">
        <MarketIntelligenceInbox />
      </CollapsiblePanel>

      <CollapsiblePanel title="Thesis Health (raw)">
        <ThesisHealthAdminWrapper />
      </CollapsiblePanel>
    </section>
  );
}

function CollapsiblePanel({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 10 }}>
      <header
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
        style={{
          padding: "8px 0", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 10, letterSpacing: "0.14em", color: PALETTE.textDim,
          borderTop: `1px solid ${PALETTE.borderSoft}`,
        }}>
        <span>
          <span style={{ color: PALETTE.accentTeal, marginRight: 8 }}>{open ? "▾" : "▸"}</span>
          {(title || "").toUpperCase()}
        </span>
        <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
          {open ? "Click to collapse" : "Click to expand"}
        </span>
      </header>
      {open && (
        <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function ThesisHealthAdminWrapper() {
  const BASKET_ID = "ai_health_diagnostics";
  const AGENT_ID  = "aiHealthDiagnosticsAgent";
  const [tick, setTick] = useState(0);
  const approvedMemory = useMemo(
    () => getBasketMemory(BASKET_ID),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const proposedIntelligence = useMemo(
    () => listIntelligenceItems()
      .filter((it) => it.basketId === BASKET_ID && it.status === INTELLIGENCE_STATUS.DRAFT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  const accept = useCallback((p) => { if (p?.id) { promoteToAgentMemory(p.id); setTick((n) => n + 1); } }, []);
  const reject = useCallback((p) => { if (p?.id) { archiveIntelligenceItem(p.id); setTick((n) => n + 1); } }, []);
  const archive = useCallback((id) => { if (id) { archiveIntelligenceItem(id); setTick((n) => n + 1); } }, []);
  return (
    <ThesisHealthPanel
      basketId={BASKET_ID}
      agentId={AGENT_ID}
      approvedMemory={approvedMemory}
      proposedIntelligence={proposedIntelligence}
      onAcceptUpdate={accept}
      onRejectUpdate={reject}
      onArchiveEvidence={archive} />
  );
}

// ---------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------

function SearchBar({ onSubmit }) {
  const [value, setValue] = useState("");
  const submit = () => {
    if (!value.trim()) return;
    onSubmit && onSubmit(value);
    setValue("");
  };
  return (
    <div role="search" aria-label="Ticker search"
      style={{
        display: "flex", gap: 6, alignItems: "center",
        background: PALETTE.panelBg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 8, padding: "6px 8px",
      }}>
      <span style={{ fontSize: 10, color: PALETTE.textFaint, letterSpacing: "0.10em" }}>
        SEARCH
      </span>
      <input type="text" value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        placeholder="Type a ticker (e.g. AMD) and press Enter"
        aria-label="Ticker symbol"
        style={{
          flex: 1,
          background: "transparent", color: PALETTE.text,
          border: "none", outline: "none",
          fontFamily: "inherit", fontSize: 12,
        }} />
      <button type="button" onClick={submit}
        style={{
          background: `${PALETTE.accentTeal}1a`,
          border: `1px solid ${PALETTE.accentTeal}88`,
          color: PALETTE.accentTeal,
          borderRadius: 5, padding: "4px 12px",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          cursor: "pointer", fontFamily: "inherit",
        }}>
        Search
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Drawer payload + active card builders
// ---------------------------------------------------------------------

function useDrawerPayload(symbol, tick) {
  return useMemo(() => {
    if (!symbol) return null;
    return buildDrawerPayload(symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tick]);
}

function buildDrawerPayload(symbol) {
  const inBasket = isAIHealthDiagnosticsSymbol(symbol);
  const profile  = inBasket ? getAIHealthDiagnosticsProfile(symbol) : null;

  const memoryInputs = getBasketManagerInputs([symbol]);
  const ma = memoryInputs.managerAssessmentsBySymbol[symbol] || null;
  const hist = memoryInputs.historyBySymbol[symbol] || null;

  let insight = null;
  if (inBasket) {
    insight = buildAIHealthDiagnosticsInsight({
      symbol,
      managerAssessment: ma,
      history: hist,
    });
  }

  // Approved memory + drafts relevant to the symbol's basket.
  const basketId = inBasket ? "ai_health_diagnostics" : null;
  const approvedMemory = basketId ? getBasketMemory(basketId) : [];
  const proposed = basketId ? listIntelligenceItems().filter(
    (it) => it.basketId === basketId &&
            it.status === INTELLIGENCE_STATUS.DRAFT &&
            isItemRelevantToSymbol(it, symbol),
  ) : [];
  const realIntelligenceFeed = basketId
    ? listIntelligenceItems().filter((it) =>
        it.basketId === basketId &&
        it.status !== INTELLIGENCE_STATUS.ARCHIVED &&
        isItemRelevantToSymbol(it, symbol))
    : [];
  // When no real intelligence is on file, surface the demo library
  // entry (if any) so the operator sees seed context. Demo items are
  // tagged with isDemo = true in the library so the UI renders a
  // "SAMPLE / DEMO" badge — never confused with operator-approved
  // memory.
  const intelligenceFeed = realIntelligenceFeed.length > 0
    ? realIntelligenceFeed
    : (() => {
        const demo = getDemoIntelligenceFor(symbol);
        return demo ? [demo] : [];
      })();

  // Thesis check using the same evaluator + agent insight.
  const thesisCheck = basketId
    ? evaluateThesisHealth({
        basketId,
        agentId: "aiHealthDiagnosticsAgent",
        symbol,
        approvedMemory,
        proposedIntelligence: proposed,
        agentInsight: insight,
      })
    : null;

  // Market Intelligence Context — already on insight when memory matches.
  const marketIntelligenceContext = insight?.marketIntelligenceContext ||
    (basketId ? buildMarketIntelligenceContext({
      symbol,
      basketId,
      agentId: "aiHealthDiagnosticsAgent",
      agentInsight: insight,
      approvedMemory,
    }) : null);

  // Friendly posture label (drawer header) — mapped from the agent
  // insight posture into GO / WATCH / WAIT / AVOID.
  const posture = friendlyPosture(insight);
  const theme   = profile?.role || (inBasket ? "AI Health / Diagnostics" : "Outside specialty baskets");

  // What changed — uses the deterministic builder. Demo intelligence
  // contributes to the calculation as context only (it's deterministic
  // keyword matching against catalysts/risks; demo never changes
  // posture / verdict / allowedActions).
  const change = describeWhatChanged(
    {
      posture: insight?.posture,
      creditViewStance: ma?.credit_view?.stance,
      thesisHealthStatus: thesisCheck?.status,
    },
    null,
    intelligenceFeed,
  );

  // Risks list — engine + memory.
  const risks = buildRiskList(insight, marketIntelligenceContext, thesisCheck);

  return {
    symbol,
    theme,
    posture,
    lastUpdated: insight ? "engine read" : "no engine read on file",
    whatChanged: change.message,
    triggerEngine: insight ? {
      posture: insight.postureLabel,
      summary: insight.creditViewInsight,
    } : null,
    creditView: insight ? {
      posture: ma?.credit_view?.stance || "unavailable",
      summary: insight.assignmentComfort,
    } : null,
    thesisCheck,
    marketIntelligenceContext,
    intelligenceFeed,
    recommendedAction: insight?.suggestedAction || "Monitor for additional manager evidence.",
    risks,
  };
}

function buildRiskList(insight, ctx, thesisCheck) {
  const out = [];
  if (Array.isArray(insight?.risksToVerify)) out.push(...insight.risksToVerify);
  if (ctx?.primaryRisk && !out.includes(ctx.primaryRisk)) out.push(ctx.primaryRisk);
  if (thesisCheck?.status === "weakening") {
    out.push("Thesis weakening — review whether to revise operator memory.");
  }
  if (thesisCheck?.status === "conflicting") {
    out.push("Thesis conflicted — review specific evidence before update.");
  }
  return Array.from(new Set(out)).slice(0, 8);
}

function isItemRelevantToSymbol(item, symbol) {
  if (!item || !item.entities) return true;
  const primaries = Array.isArray(item.entities.primarySymbols) ? item.entities.primarySymbols : [];
  const related   = Array.isArray(item.entities.relatedSymbols) ? item.entities.relatedSymbols : [];
  if (primaries.length === 0 && related.length === 0) return true;
  return primaries.includes(symbol) || related.includes(symbol);
}

function friendlyPosture(insight) {
  if (!insight || !insight.posture) return "WATCH";
  switch (insight.posture) {
    case "premium_candidate":          return "GO";
    case "accumulate_watch":           return "WATCH";
    case "long_hold_anchor":           return "WATCH";
    case "wait_for_confirmation":      return "WAIT";
    case "sector_confirmation_signal": return "WAIT";
    case "avoid_for_now":              return "AVOID";
    case "risk_elevated":              return "AVOID";
    default:                           return "WATCH";
  }
}

function buildActiveCard(symbol) {
  if (!symbol) return null;
  const inBasket = isAIHealthDiagnosticsSymbol(symbol);
  const profile  = inBasket ? getAIHealthDiagnosticsProfile(symbol) : null;

  const memoryInputs = getBasketManagerInputs([symbol]);
  const ma = memoryInputs.managerAssessmentsBySymbol[symbol] || null;

  let insight = null;
  if (inBasket) {
    insight = buildAIHealthDiagnosticsInsight({
      symbol,
      managerAssessment: ma,
      history: memoryInputs.historyBySymbol[symbol] || null,
    });
  }

  const basketId = inBasket ? "ai_health_diagnostics" : null;
  const realIntelligenceItems = basketId
    ? listIntelligenceItems().filter((it) =>
        it.basketId === basketId &&
        it.status !== INTELLIGENCE_STATUS.ARCHIVED &&
        isItemRelevantToSymbol(it, symbol))
    : [];
  // Same demo fallback the drawer uses, so the active card and the
  // drawer agree on what the operator is being shown.
  const intelligenceItems = realIntelligenceItems.length > 0
    ? realIntelligenceItems
    : (() => {
        const demo = getDemoIntelligenceFor(symbol);
        return demo ? [demo] : [];
      })();

  // Thesis check status for the chip.
  const thesis = basketId ? evaluateThesisHealth({
    basketId,
    agentId: "aiHealthDiagnosticsAgent",
    symbol,
    approvedMemory: getBasketMemory(basketId),
    proposedIntelligence: realIntelligenceItems.filter((it) => it.status === INTELLIGENCE_STATUS.DRAFT),
    agentInsight: insight,
  }) : null;

  const change = describeWhatChanged(
    {
      posture: insight?.posture,
      creditViewStance: ma?.credit_view?.stance,
      thesisHealthStatus: thesis?.status,
    },
    null,
    intelligenceItems,
  );

  // Watch-risk line — derived from engine + memory. Demo intelligence
  // contributes as a "Watch:" hint when it lists challenges.
  const watchRisk = pickWatchRisk(insight, intelligenceItems);

  return {
    symbol,
    theme: profile ? profile.thesis : "Outside specialty baskets",
    enginePosture: friendlyPosture(insight),
    creditViewPosture: ma?.credit_view?.stance || "unavailable",
    thesisCheckStatus: thesis?.status || "insufficient_evidence",
    intelligenceHeadline: pickHeadline(intelligenceItems),
    whyHere: composeWhyHere(insight, profile),
    whatChanged: change.message,
    whatChangedTone: change.tone,
    nextStep: insight?.suggestedAction || "Monitor for additional manager evidence.",
    watchRisk,
  };
}

function pickWatchRisk(insight, intelligenceItems) {
  // Engine-driven primary risk wins.
  if (insight?.risksToVerify && insight.risksToVerify.length > 0) {
    return insight.risksToVerify[0];
  }
  // Demo / draft items: surface the first challenge if they have one.
  for (const it of intelligenceItems) {
    if (Array.isArray(it.challenges) && it.challenges.length > 0) {
      return it.challenges[0];
    }
    if (Array.isArray(it.risks) && it.risks.length > 0) {
      return it.risks[0];
    }
  }
  return null;
}

function pickHeadline(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const sorted = items.slice().sort((a, b) =>
    (b?.updatedAt || b?.createdAt || 0) - (a?.updatedAt || a?.createdAt || 0));
  const top = sorted[0];
  if (!top) return null;
  return top.title || (top.thesis && top.thesis.coreClaim) || null;
}

function composeWhyHere(insight, profile) {
  if (insight?.role) return insight.role;
  if (profile?.role) return profile.role;
  return "Operator-tracked ticker.";
}

// ---------------------------------------------------------------------
// Top-3 builder (CIO review dashboard topQueueItems)
// ---------------------------------------------------------------------

function buildTopOpportunities() {
  // Resolve the inputs the CIO review dashboard engine needs.
  const profiles = listBasketAgents();
  const universesById = listBasketUniverses();
  const allSymbols = new Set();
  for (const p of profiles) {
    const u = universesById[p.basketId] || getBasketUniverse(p.basketId);
    universesById[p.basketId] = u;
    for (const r of (u?.activeUniverse || [])) if (r?.symbol) allSymbols.add(r.symbol);
    for (const r of (u?.watchlist || []))      if (r?.symbol) allSymbols.add(r.symbol);
  }
  const memoryInputs = getBasketManagerInputs(Array.from(allSymbols));
  const dashboard = buildCioReviewDashboard({
    basketProfiles: profiles,
    basketUniversesById: universesById,
    managerAssessmentsBySymbol: memoryInputs.managerAssessmentsBySymbol,
    historyBySymbol: memoryInputs.historyBySymbol,
  });

  return (dashboard.topQueueItems || []).slice(0, 3).map(toOpportunityCard);
}

function toOpportunityCard(item) {
  if (!item) return null;
  const posture = (() => {
    if (item.priority === "urgent" || item.priority === "high") return "WATCH";
    if (item.priority === "low") return "WAIT";
    return "WATCH";
  })();
  return {
    symbol: item.symbol,
    title: item.basketName || "Top opportunity",
    theme: item.basketName || "",
    posture,
    reason: item.title || item.rationale || "Review queue item",
    latestNote: item.suggestedNextStep || null,
    whatChanged: null,
    action: item.suggestedNextStep ||
            (item.allowedActions && item.allowedActions[0]
              ? `Allowed: ${item.allowedActions.join(" · ")}`
              : null),
  };
}

function composeMarketRegime(topOpportunities) {
  // We don't have a global market regime engine yet, so derive a
  // light summary from the opportunities. When nothing's in the
  // queue the strip prints its own placeholder.
  if (!topOpportunities || topOpportunities.length === 0) return null;
  const high = topOpportunities.filter((o) => o && o.posture === "WATCH").length;
  return {
    marketPosture: high > 0 ? "WATCH" : null,
    creditViewRegime: null,
    volatilityState: null,
    aiThemeRegime: null,
    whatChangedToday: high > 0
      ? `${high} review-queue item${high === 1 ? "" : "s"} flagged for attention.`
      : "No new review queue activity.",
  };
}

// ---------------------------------------------------------------------
// Misc styles
// ---------------------------------------------------------------------

function titleRow() {
  return {
    fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim,
    marginBottom: 8,
  };
}
function emptyHelpStyle() {
  return {
    background: PALETTE.panelBg,
    border: `1px solid ${PALETTE.borderSoft}`,
    borderRadius: 8, padding: "12px 14px",
    fontSize: 11, color: PALETTE.textFaint, lineHeight: 1.55, fontStyle: "italic",
  };
}

// ---------------------------------------------------------------------
// Sidebar-collapsed pref (localStorage, SSR-safe)
// ---------------------------------------------------------------------

const SIDEBAR_PREF_KEY = "te.workspace.sidebarCollapsed.v1";

function readSidebarCollapsedPref() {
  try {
    if (typeof globalThis.localStorage === "undefined") return false;
    const v = globalThis.localStorage.getItem(SIDEBAR_PREF_KEY);
    return v === "1";
  } catch {
    return false;
  }
}

function writeSidebarCollapsedPref(value) {
  try {
    if (typeof globalThis.localStorage === "undefined") return;
    globalThis.localStorage.setItem(SIDEBAR_PREF_KEY, value ? "1" : "0");
  } catch { /* tolerate quota / disabled storage */ }
}

// Re-export UNIVERSE_OPTIONS so callers that pulled it from the old
// surface still resolve.
export { UNIVERSE_OPTIONS };
