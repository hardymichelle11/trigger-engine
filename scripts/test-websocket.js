#!/usr/bin/env node
// =====================================================
// Tests for WebSocket quote feed + normalization.
// Run: npm run test:ws
// (Does NOT test actual WS connections — tests the feed logic)
// =====================================================

import { updateFromWebSocket, updateFromPoll, getQuotes, getSourceMap, getFeedHealth, resetFeed, onQuoteUpdate } from "../src/lib/websocket/quoteFeed.js";
import { WS_STATE } from "../src/lib/websocket/polygonSocket.js";

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    failed++;
  }
}

console.log("\n  WebSocket Quote Feed Tests");
console.log("  ──────────────────────────\n");

// Clean state
resetFeed();

// 1. Empty feed
const empty = getQuotes();
assert("Empty feed returns empty object", Object.keys(empty).length === 0);

const emptyHealth = getFeedHealth();
assert("Empty feed health: total = 0", emptyHealth.total === 0);

// 2. Poll data population
updateFromPoll({
  NVDA: { symbol: "NVDA", name: "NVIDIA", exchange: "NASDAQ", last: 110, prevClose: 108, high: 112, low: 107, volume: 45000000, timestamp: Date.now() },
  AAPL: { symbol: "AAPL", name: "Apple", exchange: "NASDAQ", last: 223, prevClose: 222, high: 224, low: 221, volume: 38000000, timestamp: Date.now() },
});

const afterPoll = getQuotes();
assert("Poll: NVDA present", afterPoll.NVDA?.last === 110);
assert("Poll: AAPL present", afterPoll.AAPL?.last === 223);
assert("Poll: 2 quotes total", Object.keys(afterPoll).length === 2);

const pollSource = getSourceMap();
assert("Poll source: NVDA is 'poll'", pollSource.NVDA?.source === "poll");
assert("Poll source: NVDA is not stale", pollSource.NVDA?.stale === false);

// 3. WS update overwrites price
updateFromWebSocket({
  symbol: "NVDA",
  open: 109.5, high: 113, low: 109, close: 112.5,
  volume: 50000, vwap: 111.2, trades: 100,
  timestamp: Date.now(),
});

const afterWs = getQuotes();
assert("WS: NVDA price updated to 112.5", afterWs.NVDA?.last === 112.5);
assert("WS: NVDA preserves prevClose from poll", afterWs.NVDA?.prevClose === 108);
assert("WS: NVDA high updated", afterWs.NVDA?.high === 113);
assert("WS: AAPL unchanged", afterWs.AAPL?.last === 223);

const wsSource = getSourceMap();
assert("WS source: NVDA is 'websocket'", wsSource.NVDA?.source === "websocket");
assert("WS source: AAPL still 'poll'", wsSource.AAPL?.source === "poll");

// 4. Feed health
const health = getFeedHealth();
assert("Health: total = 2", health.total === 2);
assert("Health: websocket = 1", health.websocket === 1);
assert("Health: poll = 1", health.poll === 1);
assert("Health: stale = 0", health.stale === 0);
assert("Health: primarySource is poll or websocket", ["poll", "websocket"].includes(health.primarySource));

// 5. Poll does NOT overwrite fresh WS data
updateFromPoll({
  NVDA: { symbol: "NVDA", name: "NVIDIA", exchange: "NASDAQ", last: 110, prevClose: 108, high: 112, low: 107, volume: 45000000, timestamp: Date.now() },
});

const afterRepoll = getQuotes();
assert("Re-poll: WS data preserved (still 112.5)", afterRepoll.NVDA?.last === 112.5);

// 6. Poll updates prevClose on WS-fresh symbol
updateFromPoll({
  NVDA: { symbol: "NVDA", name: "NVIDIA Corp", exchange: "NASDAQ", last: 110, prevClose: 109, high: 112, low: 107, volume: 45000000, timestamp: Date.now() },
});

const afterPrevUpdate = getQuotes();
assert("Re-poll: prevClose updated on WS symbol", afterPrevUpdate.NVDA?.prevClose === 109);
assert("Re-poll: name updated on WS symbol", afterPrevUpdate.NVDA?.name === "NVIDIA Corp");

// 7. Listener callback
let listenerCalled = false;
const unsub = onQuoteUpdate(() => { listenerCalled = true; });
updateFromPoll({ TEST: { symbol: "TEST", last: 50, prevClose: 49 } });
assert("Listener called on poll update", listenerCalled === true);
unsub();

// 8. Listener unsubscribe
listenerCalled = false;
updateFromPoll({ TEST2: { symbol: "TEST2", last: 60, prevClose: 59 } });
assert("Listener NOT called after unsubscribe", listenerCalled === false);

// 9. Reset clears everything
resetFeed();
assert("Reset: quotes empty", Object.keys(getQuotes()).length === 0);
assert("Reset: health total = 0", getFeedHealth().total === 0);

// 10. WS_STATE enum
assert("WS_STATE has DISCONNECTED", WS_STATE.DISCONNECTED === "DISCONNECTED");
assert("WS_STATE has CONNECTED", WS_STATE.CONNECTED === "CONNECTED");
assert("WS_STATE has RECONNECTING", WS_STATE.RECONNECTING === "RECONNECTING");
assert("WS_STATE has UNSUPPORTED", WS_STATE.UNSUPPORTED === "UNSUPPORTED");
assert("WS_STATE has FAILED", WS_STATE.FAILED === "FAILED");

// 11. WS update for unknown symbol creates entry
resetFeed();
updateFromWebSocket({
  symbol: "NEW_SYM", open: 100, high: 101, low: 99, close: 100.5,
  volume: 1000, timestamp: Date.now(),
});
const newSym = getQuotes();
assert("WS: new symbol created", newSym.NEW_SYM?.last === 100.5);
assert("WS: new symbol prevClose defaults to 0", newSym.NEW_SYM?.prevClose === 0);

resetFeed();

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
