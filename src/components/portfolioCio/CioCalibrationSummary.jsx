// =====================================================
// CIO CALIBRATION SUMMARY
// =====================================================
// Two roll-ups inside the CIO Review Dashboard:
//   - Calibration flags across all baskets (missed_winner etc.)
//   - Insufficient evidence (active/watchlist symbols with no
//     manager memory)
//   - Derisking watch (fading / overextended classifications)
// All trader-facing copy. No raw scores or weights.
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
};

/**
 * @param {object} props
 * @param {Array<object>} [props.calibrationFlags]
 * @param {Array<object>} [props.insufficientEvidence]
 * @param {Array<object>} [props.deriskingWatch]
 * @param {(symbol: string) => void} [props.onRunAdHocSimulation]
 * @param {(basketId: string) => void} [props.onOpenBasket]
 */
export default function CioCalibrationSummary({
  calibrationFlags = [],
  insufficientEvidence = [],
  deriskingWatch = [],
  onRunAdHocSimulation,
  onOpenBasket,
}) {
  return (
    <section aria-label="CIO calibration and evidence summary"
      style={{
        background: PALETTE.bg,
        border: `1px solid ${PALETTE.border}`,
        borderRadius: 10, padding: 12,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
      <header>
        <div style={{ fontSize: 9, letterSpacing: "0.14em", color: PALETTE.textDim }}>
          CALIBRATION · EVIDENCE · DERISKING
        </div>
        <div style={{ fontSize: 10, color: PALETTE.textFaint, marginTop: 2 }}>
          Where manager evidence is missing or where the CIO may need a second look.
        </div>
      </header>

      {/* Calibration flags */}
      <Section title={`Calibration flags · ${calibrationFlags.length}`} tone={PALETTE.purple}>
        {calibrationFlags.length === 0 ? (
          <Empty>No calibration flags. Manager reads do not suggest the CIO is misaligned.</Empty>
        ) : (
          <ul style={listReset()}>
            {calibrationFlags.map((f, i) => (
              <li key={`${f.symbol}-${i}`} style={{
                fontSize: 11, color: PALETTE.text, lineHeight: 1.5, padding: "2px 0",
              }}>
                <span style={{ color: PALETTE.purple, fontWeight: 700, marginRight: 6 }}>
                  {f.symbol}
                </span>
                <button type="button"
                  onClick={() => onOpenBasket && onOpenBasket(f.basketId)}
                  style={{
                    background: "transparent", border: "none", padding: 0,
                    cursor: onOpenBasket ? "pointer" : "default",
                    fontSize: 9, color: PALETTE.textFaint, marginRight: 6, fontFamily: "inherit",
                  }}>
                  {f.basketName}
                </button>
                <span style={{ color: PALETTE.textDim }}>{f.flag}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Insufficient evidence */}
      <Section
        title={`Insufficient manager evidence · ${insufficientEvidence.length}`}
        tone={PALETTE.cyan}>
        {insufficientEvidence.length === 0 ? (
          <Empty>All active and watchlist symbols have at least one manager read on file.</Empty>
        ) : (
          <ul style={listReset()}>
            {insufficientEvidence.map((it, i) => (
              <li key={`${it.symbol}-${i}`} style={{
                display: "flex", alignItems: "baseline", gap: 6,
                fontSize: 11, color: PALETTE.text, lineHeight: 1.5, padding: "2px 0",
                flexWrap: "wrap",
              }}>
                <span style={{ color: PALETTE.cyan, fontWeight: 700 }}>{it.symbol}</span>
                <button type="button"
                  onClick={() => onOpenBasket && onOpenBasket(it.basketId)}
                  style={{
                    background: "transparent", border: "none", padding: 0,
                    cursor: onOpenBasket ? "pointer" : "default",
                    fontSize: 9, color: PALETTE.textFaint, fontFamily: "inherit",
                  }}>
                  {it.basketName}
                </button>
                {onRunAdHocSimulation && (
                  <button type="button"
                    onClick={() => onRunAdHocSimulation(it.symbol)}
                    style={btn(PALETTE.cyan)}>
                    Run Sim
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Derisking watch */}
      <Section
        title={`Derisking watch · ${deriskingWatch.length}`}
        tone={PALETTE.amber}>
        {deriskingWatch.length === 0 ? (
          <Empty>No fading or overextended names across baskets.</Empty>
        ) : (
          <ul style={listReset()}>
            {deriskingWatch.map((d, i) => (
              <li key={`${d.symbol}-${i}`} style={{
                fontSize: 11, color: PALETTE.text, lineHeight: 1.5, padding: "2px 0",
              }}>
                <span style={{ color: PALETTE.amber, fontWeight: 700, marginRight: 6 }}>
                  {d.symbol}
                </span>
                <button type="button"
                  onClick={() => onOpenBasket && onOpenBasket(d.basketId)}
                  style={{
                    background: "transparent", border: "none", padding: 0,
                    cursor: onOpenBasket ? "pointer" : "default",
                    fontSize: 9, color: PALETTE.textFaint, marginRight: 6, fontFamily: "inherit",
                  }}>
                  {d.basketName}
                </button>
                {d.read && (
                  <span style={{ color: PALETTE.textDim }}>{d.read}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
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

function Empty({ children }) {
  return (
    <div style={{
      fontSize: 10, color: PALETTE.textFaint, fontStyle: "italic",
      padding: "2px 0",
    }}>
      {children}
    </div>
  );
}

function listReset() {
  return { margin: 0, padding: 0, listStyle: "none" };
}

function btn(color) {
  return {
    background: `${color}1a`, border: `1px solid ${color}88`, color,
    borderRadius: 5, padding: "2px 6px",
    fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
    cursor: "pointer", fontFamily: "inherit",
  };
}
