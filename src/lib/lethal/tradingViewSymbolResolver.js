// =====================================================
// TRADINGVIEW SYMBOL RESOLVER (Phase 4.7.5)
// =====================================================
// Provider-aware resolution from a candidate object to a
// TradingView-style "EXCHANGE:SYMBOL" string. The cockpit
// does NOT assume TradingView coverage of the entire
// universe — when the resolver can't verify the exchange,
// it returns a best-effort default and flags the result
// as `verified: false` so the chart component can render
// a small "unverified" badge.
//
// Resolution order:
//   1. candidate.tradingViewSymbol  (operator override, fully trusted)
//   2. candidate.exchange + symbol  (engine-supplied exchange)
//   3. SYMBOL_META[symbol]          (small fallback table for the
//                                    operator's curated universe)
//   4. default NASDAQ:SYMBOL        (last-resort guess; unverified)
//
// Hard rules:
//   - PURE function. No fetch, no engine call.
//   - NEVER throws on malformed input. Returns a structured
//     result with verified=false when uncertain.
//   - SYMBOL_META is intentionally small — it's a fallback,
//     not the source of truth. Add candidate.exchange in the
//     pipeline if you want broader coverage.
// =====================================================

// --------------------------------------------------
// SYMBOL_META — small fallback table
// --------------------------------------------------
//
// Only includes symbols the operator's discovery layer
// has historically surfaced. Anything outside this list
// is still rendered (with the "unverified" badge) — the
// component degrades gracefully.

export const SYMBOL_META = Object.freeze({
  NVDA: { exchange: "NASDAQ", type: "equity" },
  SMCI: { exchange: "NASDAQ", type: "equity" },
  CRWV: { exchange: "NASDAQ", type: "equity" },
  NBIS: { exchange: "NASDAQ", type: "equity" },
  IREN: { exchange: "NASDAQ", type: "equity" },
  INTC: { exchange: "NASDAQ", type: "equity" },
  AAPL: { exchange: "NASDAQ", type: "equity" },
  AMD:  { exchange: "NASDAQ", type: "equity" },
  PLTR: { exchange: "NASDAQ", type: "equity" },
  GOOG: { exchange: "NASDAQ", type: "equity" },
  META: { exchange: "NASDAQ", type: "equity" },
  HOOD: { exchange: "NASDAQ", type: "equity" },
  COIN: { exchange: "NASDAQ", type: "equity" },
  MSTR: { exchange: "NASDAQ", type: "equity" },
  BTDR: { exchange: "NASDAQ", type: "equity" },

  BE:   { exchange: "NYSE", type: "equity" },
  BEPC: { exchange: "NYSE", type: "equity" },
  TSLA: { exchange: "NASDAQ", type: "equity" },
  CF:   { exchange: "NYSE", type: "equity" },
  MOS:  { exchange: "NYSE", type: "equity" },
  OXY:  { exchange: "NYSE", type: "equity" },

  // ETFs — AMEX is the TradingView convention for NYSE Arca
  XLF:  { exchange: "AMEX", type: "etf" },
  XLE:  { exchange: "AMEX", type: "etf" },
  JEPI: { exchange: "AMEX", type: "etf" },
  JEPQ: { exchange: "NASDAQ", type: "etf" },
  SPY:  { exchange: "AMEX", type: "etf" },
  QQQ:  { exchange: "NASDAQ", type: "etf" },
  QQQM: { exchange: "NASDAQ", type: "etf" },
  IWM:  { exchange: "AMEX", type: "etf" },
  TLT:  { exchange: "NASDAQ", type: "etf" },
  HYG:  { exchange: "AMEX", type: "etf" },
  LQD:  { exchange: "AMEX", type: "etf" },
  KRE:  { exchange: "AMEX", type: "etf" },
  GLD:  { exchange: "AMEX", type: "etf" },
  SLV:  { exchange: "AMEX", type: "etf" },
  FXI:  { exchange: "AMEX", type: "etf" },

  // Cboe-listed ETFs (Tradr leveraged products etc.). TradingView's
  // "CBOE:" namespace covers Cboe BZX-listed funds.
  NEBX: { exchange: "CBOE", type: "etf" },   // Tradr 2X Long NBIS Daily ETF
});

const DEFAULT_EXCHANGE = "NASDAQ";

// --------------------------------------------------
// PUBLIC: resolveTradingViewSymbol
// --------------------------------------------------

/**
 * @typedef {object} ResolvedTradingViewSymbol
 * @property {string} symbol           "EXCHANGE:SYMBOL" formatted for TradingView
 * @property {string} exchange         resolved exchange (e.g. "NASDAQ")
 * @property {string} ticker           bare ticker (e.g. "NVDA")
 * @property {boolean} verified        true if exchange came from candidate / SYMBOL_META;
 *                                     false if we fell back to the default
 * @property {"override"|"candidate"|"meta"|"default"} source  resolution path
 */

/**
 * Resolve a candidate object into a TradingView symbol.
 *
 * @param {object|string} candidate    full candidate object OR a bare symbol string
 * @returns {ResolvedTradingViewSymbol|null}
 */
export function resolveTradingViewSymbol(candidate) {
  // Accept a bare symbol string for convenience.
  const cand = typeof candidate === "string"
    ? { symbol: candidate }
    : (candidate && typeof candidate === "object" ? candidate : null);
  if (!cand) return null;

  const ticker = String(cand.symbol || "").trim().toUpperCase();
  if (!ticker) return null;

  // 1. Operator override
  if (typeof cand.tradingViewSymbol === "string" && cand.tradingViewSymbol.trim()) {
    const direct = cand.tradingViewSymbol.trim().toUpperCase();
    const [exch, sym] = direct.includes(":") ? direct.split(":", 2) : [DEFAULT_EXCHANGE, direct];
    return Object.freeze({
      symbol: `${exch}:${sym}`,
      exchange: exch,
      ticker: sym,
      verified: true,
      source: "override",
    });
  }

  // 2. Candidate-supplied exchange
  if (typeof cand.exchange === "string" && cand.exchange.trim()) {
    const exch = cand.exchange.trim().toUpperCase();
    return Object.freeze({
      symbol: `${exch}:${ticker}`,
      exchange: exch,
      ticker,
      verified: true,
      source: "candidate",
    });
  }

  // 3. Local fallback table
  const meta = SYMBOL_META[ticker];
  if (meta && meta.exchange) {
    return Object.freeze({
      symbol: `${meta.exchange}:${ticker}`,
      exchange: meta.exchange,
      ticker,
      verified: true,
      source: "meta",
    });
  }

  // 4. Last-resort default — unverified
  return Object.freeze({
    symbol: `${DEFAULT_EXCHANGE}:${ticker}`,
    exchange: DEFAULT_EXCHANGE,
    ticker,
    verified: false,
    source: "default",
  });
}
