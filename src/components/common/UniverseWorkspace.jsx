// =====================================================
// UNIVERSE WORKSPACE
// =====================================================
// Thin wrapper that bundles AdHocTickerSearch + UniverseSelector +
// DynamicBasketManager into a single collapsible bar so any TE / CV
// page can drop in the universe layer with a single import.
// =====================================================

import React, { useCallback, useState } from "react";
import AdHocTickerSearch from "./AdHocTickerSearch.jsx";
import UniverseSelector, {
  UNIVERSE_OPTIONS,
} from "../scanner/UniverseSelector.jsx";
import DynamicBasketManager from "../scanner/DynamicBasketManager.jsx";
import AdHocSimulationHistory from "../scanner/AdHocSimulationHistory.jsx";
import BasketAgentPanel from "../portfolioCio/BasketAgentPanel.jsx";
import CioReviewDashboard from "../portfolioCio/CioReviewDashboard.jsx";

const PALETTE = {
  bg: "#06090e", border: "#1e2530", borderSoft: "#21252a",
  text: "#e2e8f0", textDim: "#9ca3af", textFaint: "#6b7280",
  accentTeal: "#14b8a6",
};

/**
 * @param {object} props
 * @param {string} [props.title="Universe Workspace"]
 * @param {boolean} [props.defaultOpen=false]
 * @param {string[]} [props.selected]
 * @param {(codes: string[]) => void} [props.onSelectionChange]
 * @param {string} [props.manualList]
 * @param {(value: string) => void} [props.onManualListChange]
 * @param {(symbol: string) => void} [props.onSendToTE]
 * @param {(symbol: string) => void} [props.onSendToCV]
 * @param {(rec: object) => void} [props.onCataloged]
 * @param {boolean} [props.includeSelector=true]
 * @param {boolean} [props.includeManager=true]
 */
export default function UniverseWorkspace({
  title = "Universe Workspace",
  defaultOpen = false,
  selected,
  onSelectionChange,
  manualList,
  onManualListChange,
  selectedCioBasketId = null,
  onCioBasketChange,
  onSendToTE,
  onSendToCV,
  onCataloged,
  includeSelector = true,
  includeManager = true,
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [refreshTick, setRefreshTick] = useState(0);
  const [historyTick, setHistoryTick] = useState(0);

  const bumpRefresh = useCallback(() => setRefreshTick((n) => n + 1), []);
  const bumpHistory = useCallback(() => setHistoryTick((n) => n + 1), []);

  const handleAddToBasket = useCallback(() => { bumpRefresh(); bumpHistory(); }, [bumpRefresh, bumpHistory]);
  const handlePromote     = useCallback(() => { bumpRefresh(); bumpHistory(); }, [bumpRefresh, bumpHistory]);

  return (
    <section style={{
      background: PALETTE.bg,
      borderTop: `1px solid ${PALETTE.borderSoft}`,
      borderBottom: `1px solid ${PALETTE.borderSoft}`,
    }}>
      <header
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 16px", cursor: "pointer",
          fontSize: 10, letterSpacing: "0.14em", color: PALETTE.textDim,
        }}>
        <span>
          <span style={{ color: PALETTE.accentTeal, marginRight: 8 }}>
            {open ? "▾" : "▸"}
          </span>
          {title.toUpperCase()}
        </span>
        <span style={{ fontSize: 9, color: PALETTE.textFaint }}>
          {open ? "Click to collapse" : "Click to expand · search · basket · selector"}
        </span>
      </header>

      {open && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)",
          gap: 12, padding: 12,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <AdHocTickerSearch
              onCataloged={onCataloged}
              onAddToBasket={handleAddToBasket}
              onPromote={handlePromote}
              onHistoryChange={bumpHistory}
              onSendToTE={onSendToTE}
              onSendToCV={onSendToCV}
            />
            {includeSelector && (
              <UniverseSelector
                selected={selected || ["core_catalog"]}
                onChange={onSelectionChange}
                manualList={manualList || ""}
                onManualListChange={onManualListChange}
                selectedCioBasketId={selectedCioBasketId}
                onCioBasketChange={onCioBasketChange}
              />
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            {includeManager && (
              <DynamicBasketManager
                onSendToTE={onSendToTE}
                onSendToCV={onSendToCV}
                refreshTick={refreshTick}
              />
            )}
          </div>
        </div>
      )}

      {open && (
        <div style={{ padding: "0 12px 12px 12px" }}>
          <AdHocSimulationHistory
            refreshTick={historyTick}
            onSendToTE={onSendToTE}
            onSendToCV={onSendToCV} />
        </div>
      )}

      {open && (
        <BasketAgentSection
          onSendToTE={onSendToTE}
          onSendToCV={onSendToCV} />
      )}

      {open && (
        <CioReviewDashboardSection
          onSendToTE={onSendToTE}
          onSendToCV={onSendToCV} />
      )}
    </section>
  );
}

// CIO basket agents — collapsible-within-the-workspace section. Default
// closed; rendered only when the workspace itself is open.
function BasketAgentSection({ onSendToTE, onSendToCV }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderTop: "1px solid #21252a",
      padding: "0 12px 12px 12px",
    }}>
      <header
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
        style={{
          padding: "8px 0", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 10, letterSpacing: "0.14em", color: "#9ca3af",
        }}>
        <span>
          <span style={{ color: "#14b8a6", marginRight: 8 }}>{open ? "▾" : "▸"}</span>
          CIO BASKET AGENTS
        </span>
        <span style={{ fontSize: 9, color: "#6b7280" }}>
          {open ? "Click to collapse" : "Manage living basket mandates"}
        </span>
      </header>
      {open && (
        <BasketAgentPanel
          onSendToTE={onSendToTE}
          onSendToCV={onSendToCV} />
      )}
    </div>
  );
}

// CIO review dashboard — collapsible-within-the-workspace section. Default
// closed; rendered only when the workspace itself is open.
function CioReviewDashboardSection({ onSendToTE, onSendToCV }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderTop: "1px solid #21252a",
      padding: "0 12px 12px 12px",
    }}>
      <header
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
        style={{
          padding: "8px 0", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 10, letterSpacing: "0.14em", color: "#9ca3af",
        }}>
        <span>
          <span style={{ color: "#14b8a6", marginRight: 8 }}>{open ? "▾" : "▸"}</span>
          CIO REVIEW DASHBOARD
        </span>
        <span style={{ fontSize: 9, color: "#6b7280" }}>
          {open ? "Click to collapse" : "Portfolio-wide review across all CIO baskets"}
        </span>
      </header>
      {open && (
        <CioReviewDashboard
          onSendToTE={onSendToTE}
          onSendToCV={onSendToCV} />
      )}
    </div>
  );
}

export { UNIVERSE_OPTIONS };
