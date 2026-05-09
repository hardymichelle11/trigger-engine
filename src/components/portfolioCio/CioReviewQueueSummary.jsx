// =====================================================
// CIO REVIEW QUEUE SUMMARY
// =====================================================
// Top-of-funnel review surfaces inside the CIO Review Dashboard.
// Renders three lists side-by-side: top action queue items across
// all baskets, scanner-promotion candidates, and routed reviews
// (TE / CV needed). Pure presentational — buttons call back into
// the host so the operator stays in control.
// =====================================================

import React from "react";
import {
  PRIORITY,
  ACTION_TYPE,
} from "../../lib/portfolioCio/basketActionQueue.js";

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

const PRIORITY_TONES = {
  [PRIORITY.URGENT]: PALETTE.red,
  [PRIORITY.HIGH]:   PALETTE.amber,
  [PRIORITY.MEDIUM]: PALETTE.cyan,
  [PRIORITY.LOW]:    PALETTE.slate,
};

const PRIORITY_LABELS = {
  [PRIORITY.URGENT]: "Urgent",
  [PRIORITY.HIGH]:   "High",
  [PRIORITY.MEDIUM]: "Medium",
  [PRIORITY.LOW]:    "Low",
};

/**
 * @param {object} props
 * @param {Array<object>} [props.topQueueItems]
 * @param {Array<object>} [props.scannerPromotionCandidates]
 * @param {Array<object>} [props.teReviewNeeded]
 * @param {Array<object>} [props.cvReviewNeeded]
 * @param {(symbol: string) => void} [props.onSendToTE]
 * @param {(symbol: string) => void} [props.onSendToCV]
 * @param {(symbol: string) => void} [props.onPromoteToScanner]
 * @param {(basketId: string) => void} [props.onOpenBasket]
 */
export default function CioReviewQueueSummary({
  topQueueItems = [],
  scannerPromotionCandidates = [],
  teReviewNeeded = [],
  cvReviewNeeded = [],
  onSendToTE,
  onSendToCV,
  onPromoteToScanner,
  onOpenBasket,
}) {
  return (
    <section aria-label="CIO review queue summary"
      style={{
        background: PALETTE.bg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 10, padding: 12,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
      <header style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "baseline", gap: 8, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim }}>
            REVIEW QUEUE — TOP-OF-FUNNEL
          </div>
          <div style={{ fontSize: 10, color: PALETTE.textFaint, marginTop: 2 }}>
            Highest-priority items across all CIO baskets · operator action only
          </div>
        </div>
      </header>

      {/* Top queue */}
      <Section
        title={`Top action queue · ${topQueueItems.length}`}
        tone={PALETTE.accentTeal}>
        {topQueueItems.length === 0 ? (
          <Empty>No high-priority items in the queue.</Empty>
        ) : (
          <ul style={listReset()}>
            {topQueueItems.map((it) => (
              <li key={it.id} style={liStyle()}>
                <TopQueueRow item={it} onOpenBasket={onOpenBasket}
                  onSendToTE={onSendToTE}
                  onSendToCV={onSendToCV}
                  onPromoteToScanner={onPromoteToScanner} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Scanner promotion */}
      <Section
        title={`Scanner promotion candidates · ${scannerPromotionCandidates.length}`}
        tone={PALETTE.green}>
        {scannerPromotionCandidates.length === 0 ? (
          <Empty>No symbols are ready for scanner promotion review.</Empty>
        ) : (
          <ul style={listReset()}>
            {scannerPromotionCandidates.map((it) => (
              <li key={it.id} style={liStyle()}>
                <RouteRow item={it} buttonLabel="Promote"
                  buttonTone={PALETTE.green}
                  onClick={onPromoteToScanner ? () => onPromoteToScanner(it.symbol) : null}
                  onOpenBasket={onOpenBasket} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* TE / CV routed sub-lists */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: 10,
      }}>
        <Section title={`TE review needed · ${teReviewNeeded.length}`} tone={PALETTE.cyan}>
          {teReviewNeeded.length === 0 ? (
            <Empty>No TE reviews queued.</Empty>
          ) : (
            <ul style={listReset()}>
              {teReviewNeeded.map((it) => (
                <li key={it.id} style={liStyle()}>
                  <RouteRow item={it} buttonLabel="Send to TE"
                    buttonTone={PALETTE.cyan}
                    onClick={onSendToTE ? () => onSendToTE(it.symbol) : null}
                    onOpenBasket={onOpenBasket} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={`CV review needed · ${cvReviewNeeded.length}`} tone={PALETTE.cyan}>
          {cvReviewNeeded.length === 0 ? (
            <Empty>No CV reviews queued.</Empty>
          ) : (
            <ul style={listReset()}>
              {cvReviewNeeded.map((it) => (
                <li key={it.id} style={liStyle()}>
                  <RouteRow item={it} buttonLabel="Send to CV"
                    buttonTone={PALETTE.cyan}
                    onClick={onSendToCV ? () => onSendToCV(it.symbol) : null}
                    onOpenBasket={onOpenBasket} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------

function Section({ title, tone, children }) {
  return (
    <section>
      <div style={{
        fontSize: 9, letterSpacing: "0.10em", color: tone, fontWeight: 700,
        marginBottom: 4,
      }}>
        {title.toUpperCase()}
      </div>
      {children}
    </section>
  );
}

function TopQueueRow({ item, onOpenBasket, onSendToTE, onSendToCV, onPromoteToScanner }) {
  const tone = PRIORITY_TONES[item.priority] || PALETTE.textFaint;
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 3,
      borderLeft: `2px solid ${tone}`, paddingLeft: 8,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: PALETTE.accentTeal, letterSpacing: "0.04em",
        }}>
          {item.symbol}
        </span>
        <button type="button"
          onClick={() => onOpenBasket && onOpenBasket(item.basketId)}
          style={{
            background: "transparent", border: "none", padding: 0,
            cursor: onOpenBasket ? "pointer" : "default",
            fontSize: 9, color: PALETTE.textFaint, fontFamily: "inherit",
          }}>
          {item.basketName}
        </button>
        <PriorityChip priority={item.priority} />
      </div>
      <div style={{ fontSize: 10, color: PALETTE.text, lineHeight: 1.5 }}>
        {item.title}
      </div>
      {item.suggestedNextStep && (
        <div style={{ fontSize: 9, color: PALETTE.cyan, fontStyle: "italic" }}>
          → {item.suggestedNextStep}
        </div>
      )}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
        {(item.allowedActions || []).includes(ACTION_TYPE.SEND_TO_TE) && onSendToTE && (
          <button type="button" onClick={() => onSendToTE(item.symbol)} style={btn(PALETTE.cyan)}>TE</button>
        )}
        {(item.allowedActions || []).includes(ACTION_TYPE.SEND_TO_CV) && onSendToCV && (
          <button type="button" onClick={() => onSendToCV(item.symbol)} style={btn(PALETTE.cyan)}>CV</button>
        )}
        {(item.allowedActions || []).includes(ACTION_TYPE.PROMOTE_TO_SCANNER_REVIEW) && onPromoteToScanner && (
          <button type="button" onClick={() => onPromoteToScanner(item.symbol)} style={btn(PALETTE.green)}>Scanner</button>
        )}
      </div>
    </div>
  );
}

function RouteRow({ item, buttonLabel, buttonTone, onClick, onOpenBasket }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: PALETTE.accentTeal, letterSpacing: "0.04em",
        }}>
          {item.symbol}
        </span>
        <button type="button"
          onClick={() => onOpenBasket && onOpenBasket(item.basketId)}
          style={{
            background: "transparent", border: "none", padding: 0,
            cursor: onOpenBasket ? "pointer" : "default",
            fontSize: 9, color: PALETTE.textFaint, fontFamily: "inherit",
          }}>
          {item.basketName}
        </button>
      </div>
      <div style={{ fontSize: 10, color: PALETTE.textDim, lineHeight: 1.5 }}>
        {item.title}
      </div>
      {onClick && (
        <div style={{ marginTop: 2 }}>
          <button type="button" onClick={onClick} style={btn(buttonTone)}>{buttonLabel}</button>
        </div>
      )}
    </div>
  );
}

function PriorityChip({ priority }) {
  const tone = PRIORITY_TONES[priority] || PALETTE.textFaint;
  const label = PRIORITY_LABELS[priority] || priority;
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: "0.08em",
      color: tone, background: `${tone}1a`,
      border: `1px solid ${tone}55`, borderRadius: 4, padding: "1px 5px",
    }}>
      {label.toUpperCase()}
    </span>
  );
}

function Empty({ children }) {
  return (
    <div style={{
      fontSize: 10, color: PALETTE.textFaint, fontStyle: "italic",
      padding: "4px 0",
    }}>
      {children}
    </div>
  );
}

function listReset() {
  return { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 };
}
function liStyle() {
  return { padding: 0 };
}
function btn(color) {
  return {
    background: `${color}1a`, border: `1px solid ${color}88`, color,
    borderRadius: 5, padding: "3px 8px",
    fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
    cursor: "pointer", fontFamily: "inherit",
  };
}
