// =====================================================
// BASKET ACTION QUEUE
// =====================================================
// Operator-facing review queue. Renders BasketActionCard items grouped
// by priority and exposes basket / priority / action-type filters.
// Local state only — Mark Reviewed dismisses the item from the
// rendered set for this session.
// =====================================================

import React, { useCallback, useMemo, useState } from "react";
import BasketActionCard from "./BasketActionCard.jsx";
import {
  PRIORITY,
  ACTION_TYPE,
  groupByPriority,
} from "../../lib/portfolioCio/basketActionQueue.js";

const PALETTE = {
  bg:        "#06090e",
  panelBg:   "#0d1117",
  border:    "#1e2530",
  borderSoft:"#21252a",
  text:      "#e2e8f0",
  textDim:   "#9ca3af",
  textFaint: "#6b7280",
  accentTeal:"#14b8a6",
  red:       "#ef4444",
  amber:     "#f59e0b",
  cyan:      "#06b6d4",
  slate:     "#64748b",
};

const PRIORITY_HEADERS = {
  [PRIORITY.URGENT]: { label: "URGENT",  tone: PALETTE.red },
  [PRIORITY.HIGH]:   { label: "HIGH",    tone: PALETTE.amber },
  [PRIORITY.MEDIUM]: { label: "MEDIUM",  tone: PALETTE.cyan },
  [PRIORITY.LOW]:    { label: "LOW",     tone: PALETTE.slate },
};

const ACTION_TYPE_LABELS = {
  "":                                       "All actions",
  [ACTION_TYPE.RUN_AD_HOC_SIMULATION]:      "Run Ad Hoc Simulation",
  [ACTION_TYPE.SEND_TO_TE]:                 "Send to TE",
  [ACTION_TYPE.SEND_TO_CV]:                 "Send to CV",
  [ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW]:  "Promote to Scanner",
  [ACTION_TYPE.MOVE_TO_WATCHLIST_REVIEW]:   "Move to Watchlist",
  [ACTION_TYPE.EXCLUDE_REVIEW]:             "Exclude",
  [ACTION_TYPE.RESTORE_TO_ACTIVE_REVIEW]:   "Restore to Active",
  [ACTION_TYPE.REVIEW_CONFLICT]:            "Review Conflict",
  [ACTION_TYPE.REVIEW_CALIBRATION]:         "Review Calibration",
  [ACTION_TYPE.MONITOR_ONLY]:               "Monitor",
};

/**
 * @param {object} props
 * @param {Array<object>} props.items
 * @param {(symbol) => void} [props.onRunAdHocSimulation]
 * @param {(symbol) => void} [props.onSendToTE]
 * @param {(symbol) => void} [props.onSendToCV]
 * @param {(symbol) => void} [props.onPromoteToScanner]
 * @param {(symbol) => void} [props.onMoveToWatchlist]
 * @param {(symbol) => void} [props.onMoveToExcluded]
 * @param {(symbol) => void} [props.onRestoreToActive]
 * @param {string|null} [props.basketFilter]                 controlled
 * @param {(basketId: string|null) => void} [props.onBasketFilterChange]
 * @param {string} [props.title="Basket action queue"]
 */
export default function BasketActionQueue({
  items = [],
  onRunAdHocSimulation,
  onSendToTE,
  onSendToCV,
  onPromoteToScanner,
  onMoveToWatchlist,
  onMoveToExcluded,
  onRestoreToActive,
  basketFilter = null,
  onBasketFilterChange,
  title = "Basket action queue",
}) {
  const [internalBasketFilter, setInternalBasketFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [actionTypeFilter, setActionTypeFilter] = useState("");
  const [reviewed, setReviewed] = useState(() => new Set());

  const handleMarkReviewed = useCallback((item) => {
    setReviewed((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
  }, []);

  // Derive available baskets + action types from the items themselves —
  // means the dropdowns only ever surface filters that would change
  // the rendered set.
  const baskets = useMemo(() => {
    const m = new Map();
    for (const it of items || []) {
      if (it && it.basketId && !m.has(it.basketId)) m.set(it.basketId, it.basketName || it.basketId);
    }
    return Array.from(m.entries()).map(([basketId, basketName]) => ({ basketId, basketName }));
  }, [items]);

  const actionTypes = useMemo(() => {
    const set = new Set();
    for (const it of items || []) if (it && it.actionType) set.add(it.actionType);
    return Array.from(set);
  }, [items]);

  // Resolve the active basket filter (controlled prop wins over internal).
  const effectiveBasketFilter =
    typeof basketFilter === "string" ? basketFilter : internalBasketFilter;

  const filtered = useMemo(() => {
    return (items || []).filter((it) => {
      if (!it || reviewed.has(it.id)) return false;
      if (effectiveBasketFilter && it.basketId !== effectiveBasketFilter) return false;
      if (priorityFilter && it.priority !== priorityFilter) return false;
      if (actionTypeFilter && it.actionType !== actionTypeFilter) return false;
      return true;
    });
  }, [items, effectiveBasketFilter, priorityFilter, actionTypeFilter, reviewed]);

  const grouped = useMemo(() => groupByPriority(filtered), [filtered]);

  const setBasket = (val) => {
    if (typeof onBasketFilterChange === "function") {
      onBasketFilterChange(val || null);
    } else {
      setInternalBasketFilter(val);
    }
  };

  const handlers = {
    onMarkReviewed: handleMarkReviewed,
    onRunAdHocSimulation, onSendToTE, onSendToCV,
    onPromoteToScanner, onMoveToWatchlist, onMoveToExcluded, onRestoreToActive,
  };

  return (
    <section aria-label="Basket action queue" style={{
      background: PALETTE.bg,
      border: `1px solid ${PALETTE.border}`,
      borderRadius: 10, padding: 12,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <Header title={title} total={filtered.length} reviewed={reviewed.size} />

      <Filters
        baskets={baskets}
        actionTypes={actionTypes}
        basketFilter={effectiveBasketFilter}
        priorityFilter={priorityFilter}
        actionTypeFilter={actionTypeFilter}
        onBasketChange={setBasket}
        onPriorityChange={setPriorityFilter}
        onActionTypeChange={setActionTypeFilter} />

      {filtered.length === 0 ? (
        <div style={{
          padding: "10px 4px", fontSize: 11, color: PALETTE.textFaint, fontStyle: "italic",
        }}>
          No actions in the queue. Run Ad Hoc Simulations on basket symbols to populate it.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[PRIORITY.URGENT, PRIORITY.HIGH, PRIORITY.MEDIUM, PRIORITY.LOW].map((p) => {
            const bucket = grouped[p] || [];
            if (bucket.length === 0) return null;
            const head = PRIORITY_HEADERS[p];
            return (
              <section key={p}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "baseline",
                  marginBottom: 4,
                }}>
                  <span style={{
                    fontSize: 9, letterSpacing: "0.14em", color: head.tone, fontWeight: 700,
                  }}>
                    {head.label} · {bucket.length}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {bucket.map((item) => (
                    <BasketActionCard key={item.id} item={item} {...handlers} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Header + filters
// ---------------------------------------------------------------------

function Header({ title, total, reviewed }) {
  return (
    <header style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      gap: 8, flexWrap: "wrap",
    }}>
      <div>
        <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim }}>
          BASKET ACTION QUEUE
        </div>
        <div style={{ fontSize: 11, color: PALETTE.text, marginTop: 2 }}>
          {title} · {total} pending{reviewed > 0 ? ` · ${reviewed} reviewed this session` : ""}
        </div>
      </div>
    </header>
  );
}

function Filters({
  baskets, actionTypes,
  basketFilter, priorityFilter, actionTypeFilter,
  onBasketChange, onPriorityChange, onActionTypeChange,
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "stretch" }}>
      <select
        aria-label="Basket filter"
        value={basketFilter || ""}
        onChange={(e) => onBasketChange(e.target.value)}
        style={selectStyle()}>
        <option value="">All baskets</option>
        {baskets.map((b) => (
          <option key={b.basketId} value={b.basketId}>{b.basketName}</option>
        ))}
      </select>
      <select
        aria-label="Priority filter"
        value={priorityFilter}
        onChange={(e) => onPriorityChange(e.target.value)}
        style={selectStyle()}>
        <option value="">All priorities</option>
        <option value={PRIORITY.URGENT}>Urgent</option>
        <option value={PRIORITY.HIGH}>High</option>
        <option value={PRIORITY.MEDIUM}>Medium</option>
        <option value={PRIORITY.LOW}>Low</option>
      </select>
      <select
        aria-label="Action type filter"
        value={actionTypeFilter}
        onChange={(e) => onActionTypeChange(e.target.value)}
        style={selectStyle()}>
        <option value="">All actions</option>
        {actionTypes.map((a) => (
          <option key={a} value={a}>{ACTION_TYPE_LABELS[a] || a}</option>
        ))}
      </select>
    </div>
  );
}

function selectStyle() {
  return {
    background: PALETTE.panelBg, color: PALETTE.text,
    border: `1px solid ${PALETTE.border}`, borderRadius: 6,
    padding: "4px 8px", fontSize: 11, fontFamily: "inherit",
  };
}
