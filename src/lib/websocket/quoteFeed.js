// =====================================================
// QUOTE FEED — merges WebSocket + polling into unified quote map
// =====================================================
// Maintains a live quote map that gets updated from:
//   1. WebSocket per-second aggregates (when connected)
//   2. REST polling snapshots (baseline + fallback)
//
// Throttles downstream callbacks to prevent re-render storms.
// Exposes source metadata (ws vs poll) per symbol.
// =====================================================

// --------------------------------------------------
// LIVE QUOTE STORE
// --------------------------------------------------

const _quotes = new Map();          // symbol -> { quote, source, updatedAt }
const _listeners = new Set();       // onChange callbacks
let _throttleTimer = null;
let _pendingNotify = false;

const DEFAULT_THROTTLE_MS = 5000;   // max one downstream update per 5s
const STALE_THRESHOLD_MS = 60000;   // 60s without update = stale

/**
 * Update a quote from WebSocket data.
 * Merges into existing quote (preserves prevClose from poll baseline).
 * @param {object} wsMsg — normalized WS aggregate message from polygonSocket
 */
export function updateFromWebSocket(wsMsg) {
  if (!wsMsg?.symbol) return;

  const existing = _quotes.get(wsMsg.symbol);
  const prevClose = existing?.quote?.prevClose || 0;

  _quotes.set(wsMsg.symbol, {
    quote: {
      symbol: wsMsg.symbol,
      name: existing?.quote?.name || wsMsg.symbol,
      exchange: existing?.quote?.exchange || "",
      last: wsMsg.close,
      prevClose,
      high: wsMsg.high > (existing?.quote?.high || 0) ? wsMsg.high : (existing?.quote?.high || wsMsg.high),
      low: existing?.quote?.low ? Math.min(wsMsg.low, existing.quote.low) : wsMsg.low,
      volume: wsMsg.volume + (existing?.quote?.volume || 0),
      timestamp: wsMsg.timestamp,
    },
    source: "websocket",
    updatedAt: Date.now(),
  });

  _scheduleNotify();
}

/**
 * Set quotes from REST polling (baseline data).
 * Only overwrites if WS data is stale or missing.
 * @param {Record<string, object>} pollQuotes — { symbol: normalizedQuote }
 */
export function updateFromPoll(pollQuotes) {
  const now = Date.now();

  for (const [symbol, quote] of Object.entries(pollQuotes)) {
    const existing = _quotes.get(symbol);
    const wsIsFresh = existing?.source === "websocket" && (now - existing.updatedAt) < STALE_THRESHOLD_MS;

    if (wsIsFresh) {
      // WS is fresh — only update prevClose and name from poll (WS doesn't send these)
      existing.quote.prevClose = quote.prevClose || existing.quote.prevClose;
      existing.quote.name = quote.name || existing.quote.name;
      existing.quote.exchange = quote.exchange || existing.quote.exchange;
    } else {
      // WS is stale or missing — use poll data
      _quotes.set(symbol, {
        quote: { ...quote },
        source: "poll",
        updatedAt: now,
      });
    }
  }

  _notifyListeners(); // polls are infrequent, notify immediately
}

/**
 * Get all current quotes as a plain object (same shape as fetchAllQuotes output).
 * @returns {Record<string, object>}
 */
export function getQuotes() {
  const result = {};
  for (const [symbol, entry] of _quotes) {
    result[symbol] = entry.quote;
  }
  return result;
}

/**
 * Get source metadata for all symbols.
 * @returns {Record<string, { source: string, updatedAt: number, stale: boolean }>}
 */
export function getSourceMap() {
  const now = Date.now();
  const result = {};
  for (const [symbol, entry] of _quotes) {
    result[symbol] = {
      source: entry.source,
      updatedAt: entry.updatedAt,
      stale: (now - entry.updatedAt) > STALE_THRESHOLD_MS,
    };
  }
  return result;
}

/**
 * Get feed health summary.
 * @returns {object}
 */
export function getFeedHealth() {
  const now = Date.now();
  let wsCount = 0, pollCount = 0, staleCount = 0;

  for (const entry of _quotes.values()) {
    if (entry.source === "websocket") wsCount++;
    else pollCount++;
    if ((now - entry.updatedAt) > STALE_THRESHOLD_MS) staleCount++;
  }

  return {
    total: _quotes.size,
    websocket: wsCount,
    poll: pollCount,
    stale: staleCount,
    primarySource: wsCount > pollCount ? "websocket" : "poll",
  };
}

// --------------------------------------------------
// LISTENER MANAGEMENT (throttled)
// --------------------------------------------------

/**
 * Register a callback for quote updates. Throttled to DEFAULT_THROTTLE_MS.
 * @param {function} callback — called with getQuotes() result
 * @returns {function} unsubscribe function
 */
export function onQuoteUpdate(callback) {
  _listeners.add(callback);
  return () => _listeners.delete(callback);
}

function _scheduleNotify() {
  if (_throttleTimer) {
    _pendingNotify = true;
    return;
  }

  _notifyListeners();

  _throttleTimer = setTimeout(() => {
    _throttleTimer = null;
    if (_pendingNotify) {
      _pendingNotify = false;
      _notifyListeners();
    }
  }, DEFAULT_THROTTLE_MS);
}

function _notifyListeners() {
  const quotes = getQuotes();
  for (const cb of _listeners) {
    try { cb(quotes); } catch { /* listener error is non-fatal */ }
  }
}

/**
 * Clear all stored quotes and listeners.
 */
export function resetFeed() {
  _quotes.clear();
  _listeners.clear();
  if (_throttleTimer) clearTimeout(_throttleTimer);
  _throttleTimer = null;
  _pendingNotify = false;
}
