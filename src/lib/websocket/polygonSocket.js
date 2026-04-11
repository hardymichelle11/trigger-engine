// =====================================================
// POLYGON WEBSOCKET — connection manager with reconnect
// =====================================================
// Connects to Polygon.io WebSocket for live market data.
// Handles auth, subscribe, reconnect, heartbeat, stale detection.
// Falls back gracefully if WS is unavailable (developer tier).
//
// Protocol:
//   wss://socket.polygon.io/stocks
//   Auth:      { action: "auth", params: API_KEY }
//   Subscribe: { action: "subscribe", params: "A.NVDA,A.AAPL,..." }
//   Messages:  [{ ev: "A", sym: "NVDA", v: 1234, ... }]
//
// "A" = per-second aggregate (low throughput, good for scanner)
// "T" = individual trades (high throughput, not needed here)
// =====================================================

const WS_URL = "wss://socket.polygon.io/stocks";

// Connection states
export const WS_STATE = {
  DISCONNECTED: "DISCONNECTED",
  CONNECTING: "CONNECTING",
  AUTHENTICATING: "AUTHENTICATING",
  CONNECTED: "CONNECTED",
  RECONNECTING: "RECONNECTING",
  UNSUPPORTED: "UNSUPPORTED",   // tier doesn't support WS
  FAILED: "FAILED",
};

/**
 * Create a Polygon WebSocket connection manager.
 *
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string[]} options.symbols — symbols to subscribe
 * @param {function} options.onMessage — called with normalized aggregate messages
 * @param {function} [options.onStateChange] — called with new state string
 * @param {number} [options.maxReconnectAttempts] — default 5
 * @param {number} [options.reconnectBaseMs] — default 2000
 * @returns {object} controller with connect(), disconnect(), getState(), getStats()
 */
export function createPolygonSocket(options) {
  const {
    apiKey,
    symbols = [],
    onMessage,
    onStateChange,
    maxReconnectAttempts = 5,
    reconnectBaseMs = 2000,
  } = options;

  let ws = null;
  let state = WS_STATE.DISCONNECTED;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let lastMessageAt = 0;
  let messageCount = 0;
  let _destroyed = false;

  function setState(newState) {
    state = newState;
    onStateChange?.(state);
  }

  function connect() {
    if (_destroyed) return;
    if (state === WS_STATE.CONNECTED || state === WS_STATE.CONNECTING) return;
    if (!apiKey) {
      setState(WS_STATE.UNSUPPORTED);
      return;
    }

    setState(WS_STATE.CONNECTING);

    try {
      ws = new WebSocket(WS_URL);
    } catch {
      setState(WS_STATE.FAILED);
      return;
    }

    ws.onopen = () => {
      setState(WS_STATE.AUTHENTICATING);
      ws.send(JSON.stringify({ action: "auth", params: apiKey }));
    };

    ws.onmessage = (event) => {
      lastMessageAt = Date.now();

      try {
        const messages = JSON.parse(event.data);
        if (!Array.isArray(messages)) return;

        for (const msg of messages) {
          // Auth response
          if (msg.ev === "status") {
            if (msg.status === "auth_success") {
              // Subscribe to per-second aggregates
              const params = symbols.map(s => `A.${s}`).join(",");
              ws.send(JSON.stringify({ action: "subscribe", params }));
              setState(WS_STATE.CONNECTED);
              reconnectAttempts = 0;
              _startHeartbeat();
            } else if (msg.status === "auth_failed") {
              setState(WS_STATE.UNSUPPORTED);
              ws.close();
            }
            continue;
          }

          // Per-second aggregate
          if (msg.ev === "A" || msg.ev === "AM") {
            messageCount++;
            onMessage?.({
              ev: msg.ev,
              symbol: msg.sym,
              open: msg.o,
              high: msg.h,
              low: msg.l,
              close: msg.c,
              volume: msg.v,
              vwap: msg.vw,
              trades: msg.z,
              startMs: msg.s,
              endMs: msg.e,
              timestamp: msg.e || Date.now(),
            });
          }
        }
      } catch {
        // Malformed message — ignore
      }
    };

    ws.onerror = () => {
      // Error is followed by close, handle there
    };

    ws.onclose = (event) => {
      _stopHeartbeat();

      if (_destroyed) {
        setState(WS_STATE.DISCONNECTED);
        return;
      }

      // Code 4000+ = server rejected (likely tier issue)
      if (event.code >= 4000) {
        setState(WS_STATE.UNSUPPORTED);
        return;
      }

      // Attempt reconnect
      if (reconnectAttempts < maxReconnectAttempts) {
        setState(WS_STATE.RECONNECTING);
        const delay = reconnectBaseMs * Math.pow(2, reconnectAttempts);
        reconnectAttempts++;
        reconnectTimer = setTimeout(() => connect(), delay);
      } else {
        setState(WS_STATE.FAILED);
      }
    };
  }

  function disconnect() {
    _destroyed = true;
    _stopHeartbeat();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) {
      ws.onclose = null; // prevent reconnect on intentional close
      ws.close();
      ws = null;
    }
    setState(WS_STATE.DISCONNECTED);
  }

  function _startHeartbeat() {
    _stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      // If no messages for 30 seconds, connection might be stale
      if (Date.now() - lastMessageAt > 30000 && state === WS_STATE.CONNECTED) {
        // Market might be closed — this is not an error
        // Only reconnect if we were recently getting messages
        if (messageCount > 0 && Date.now() - lastMessageAt > 60000) {
          ws?.close(); // will trigger reconnect
        }
      }
    }, 15000);
  }

  function _stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function getState() { return state; }

  function getStats() {
    return {
      state,
      messageCount,
      lastMessageAt: lastMessageAt ? new Date(lastMessageAt).toISOString() : null,
      reconnectAttempts,
      symbols: symbols.length,
    };
  }

  function updateSymbols(newSymbols) {
    if (state !== WS_STATE.CONNECTED || !ws) return;
    // Unsubscribe old, subscribe new
    const unsub = symbols.map(s => `A.${s}`).join(",");
    const sub = newSymbols.map(s => `A.${s}`).join(",");
    ws.send(JSON.stringify({ action: "unsubscribe", params: unsub }));
    ws.send(JSON.stringify({ action: "subscribe", params: sub }));
    symbols.length = 0;
    symbols.push(...newSymbols);
  }

  return { connect, disconnect, getState, getStats, updateSymbols };
}
