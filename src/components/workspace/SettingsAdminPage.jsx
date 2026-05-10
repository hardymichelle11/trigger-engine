// =====================================================
// SETTINGS / ADMIN PAGE
// =====================================================
// Standalone admin workspace. Replaces the dashboard chrome (search
// bar, market regime strip, top opportunities, active research,
// detail drawer) with a flat scrollable list of advanced controls
// arranged as collapsible accordion panels. Default closed.
//
// Each panel is one of the legacy raw surfaces preserved from the
// pre-redesign workspace — nothing is deleted, just relocated. A
// "Research Automation" accordion sits at the top as a placeholder
// for the upcoming AgentResearchSettings configurator.
//
// Hard rules:
//   - Trader-facing copy at the top; raw labels OK inside accordions.
//   - No dashboard-style components rendered here. The page is
//     vertically content-driven (no fixed minHeight, no flex:1
//     stretch) so it never leaves a dead gap below.
// =====================================================

import React, { useCallback, useMemo, useState } from "react";

import AdHocTickerSearch from "../common/AdHocTickerSearch.jsx";
import UniverseSelector from "../scanner/UniverseSelector.jsx";
import DynamicBasketManager from "../scanner/DynamicBasketManager.jsx";
import AdHocSimulationHistory from "../scanner/AdHocSimulationHistory.jsx";
import BasketAgentPanel from "../portfolioCio/BasketAgentPanel.jsx";
import CioReviewDashboard from "../portfolioCio/CioReviewDashboard.jsx";
import AIHealthDiagnosticsPanel from "../portfolioCio/AIHealthDiagnosticsPanel.jsx";
import MarketIntelligenceInbox from "../portfolioCio/MarketIntelligenceInbox.jsx";
import ThesisHealthPanel from "../portfolioCio/ThesisHealthPanel.jsx";
import AgentResearchSettings from "../portfolioCio/AgentResearchSettings.jsx";
import ProposedIntelligenceQueue from "../portfolioCio/ProposedIntelligenceQueue.jsx";

import {
  getBasketMemory,
  listIntelligenceItems,
  archiveIntelligenceItem,
  promoteToAgentMemory,
  INTELLIGENCE_STATUS,
} from "../../lib/portfolioCio/agentMemoryStore.js";

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
  cyan:      "#06b6d4",
};

/**
 * @param {object} props
 * @param {(symbol: string) => void} [props.onSendToTE]
 * @param {(symbol: string) => void} [props.onSendToCV]
 * @param {(rec: object) => void} [props.onCataloged]
 * @param {string[]} [props.selected]
 * @param {(codes: string[]) => void} [props.onSelectionChange]
 * @param {string} [props.manualList]
 * @param {(value: string) => void} [props.onManualListChange]
 * @param {string|null} [props.selectedCioBasketId]
 * @param {(id: string|null) => void} [props.onCioBasketChange]
 * @param {boolean} [props.includeSelector]
 * @param {boolean} [props.includeManager]
 */
export default function SettingsAdminPage(props = {}) {
  return (
    <section aria-label="Settings / Admin"
      style={{
        background: PALETTE.bg,
        padding: 12,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
      <header>
        <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim, marginBottom: 4 }}>
          SETTINGS / ADMIN
        </div>
        <div style={{ fontSize: 10, color: PALETTE.textFaint, lineHeight: 1.5 }}>
          Advanced controls and backend panels. Most operators will not need to use these — Dashboard and Watchlist cover the normal research flow.
        </div>
      </header>

      <ResearchAutomationBlock />

      <CollapsiblePanel title="Ticker search · catalog · history"
        hint="Ad-hoc ticker tooling and dynamic basket admin">
        <AdHocTickerSearch
          onCataloged={props.onCataloged}
          onSendToTE={props.onSendToTE}
          onSendToCV={props.onSendToCV} />
        {props.includeSelector !== false && (
          <UniverseSelector
            selected={props.selected || ["core_catalog"]}
            onChange={props.onSelectionChange}
            manualList={props.manualList || ""}
            onManualListChange={props.onManualListChange}
            selectedCioBasketId={props.selectedCioBasketId}
            onCioBasketChange={props.onCioBasketChange} />
        )}
        {props.includeManager !== false && (
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

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

// Research Automation + Proposed Intelligence Queue. Both surfaces
// share a refresh tick so a manual research run from the configurator
// re-renders the queue immediately.
function ResearchAutomationBlock() {
  const [refreshTick, setRefreshTick] = useState(0);
  const handleResearchRun = useCallback(() => {
    setRefreshTick((n) => n + 1);
  }, []);
  return (
    <>
      <CollapsiblePanel title="Research Automation"
        hint="Configure what each agent monitors and where findings go">
        <AgentResearchSettings onResearchRun={handleResearchRun} />
      </CollapsiblePanel>
      <CollapsiblePanel title="Proposed Intelligence Queue"
        hint="Review draft intelligence from the latest research check">
        <ProposedIntelligenceQueue refreshTick={refreshTick} />
      </CollapsiblePanel>
    </>
  );
}

function CollapsiblePanel({ title, hint, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
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
          {open ? "Click to collapse" : (hint || "Click to expand")}
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
