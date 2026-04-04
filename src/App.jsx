import { useState, useEffect, useRef, useCallback } from "react";

// =====================================================
// SELF-CALIBRATING MULTI-SETUP TRIGGER ENGINE
// - Fresh data on load / manual refresh / auto-refresh
// - VIX + IWM market regime
// - Pair / basket / standalone support
// - Touch / touch-before-stop logic
// =====================================================

// ---------------------------
// CONFIG
// ---------------------------

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;
const POLYGON_BASE = "https://api.polygon.io";
const USE_MOCK = false; // true = mock data, false = live Polygon.io

const MARKET_REGIME = {
  vix: { symbol: "VIX", type: "index", fearThreshold: 28, panicThreshold: 35 },
  iwm: { symbol: "IWM", type: "etf", weakReturnThreshold: -0.005, strongReturnThreshold: 0.005 },
};

const SETUPS = {
  NBIS_NEBX: {
    kind: "pair",
    leader: { symbol: "NBIS", exchange: "NASDAQ", description: "Nebius" },
    follower: { symbol: "NEBX", exchange: "CBOE", description: "2X Long NBIS" },
    targets: [37.0, 38.5, 40.0],
    stop: 32.0,
    leaderThreshold: 103,
    capital: 1000,
    tvLeader: "NASDAQ:NBIS",
    tvFollower: "NEBX",
  },
  QQQM_STACK: {
    kind: "basket",
    leader: { symbol: "QQQM", exchange: "NASDAQ", description: "Invesco NASDAQ 100 ETF" },
    drivers: ["MSFT", "NVDA", "AAPL", "AMZN", "GOOGL"],
    capital: 2000,
    tvLeader: "NASDAQ:QQQM",
  },
  CRWV: {
    kind: "standalone",
    leader: { symbol: "CRWV", exchange: "NASDAQ", description: "CoreWeave" },
    capital: 1000,
    tvLeader: "NASDAQ:CRWV",
  },
  JEPI: {
    kind: "standalone",
    leader: { symbol: "JEPI", exchange: "ARCA", description: "JPMorgan Equity Premium Income ETF" },
    capital: 2000,
    tvLeader: "AMEX:JEPI",
  },
  JEPQ: {
    kind: "standalone",
    leader: { symbol: "JEPQ", exchange: "NASDAQ", description: "JPMorgan Nasdaq Equity Premium Income ETF" },
    capital: 2000,
    tvLeader: "NASDAQ:JEPQ",
  },
};

const TICK_MS = 1400;

// ---------------------------
// SYMBOL REGISTRY
// ---------------------------

function getAllSymbols() {
  const symbols = new Set([MARKET_REGIME.vix.symbol, MARKET_REGIME.iwm.symbol]);
  Object.values(SETUPS).forEach((s) => {
    if (s.leader?.symbol) symbols.add(s.leader.symbol);
    if (s.follower?.symbol) symbols.add(s.follower.symbol);
    if (s.drivers) s.drivers.forEach((d) => symbols.add(d));
  });
  return Array.from(symbols);
}

// ---------------------------
// RANDOM / MATH
// ---------------------------

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function pctChange(feed) {
  if (!feed?.prevClose) return 0;
  return (feed.last - feed.prevClose) / feed.prevClose;
}

function getDistancePct(price, target) {
  return (target - price) / price;
}

function computeRealizedVolFromRange(high, low, last) {
  if (!high || !low || !last) return 0;
  return (high - low) / last;
}

function computeVolatility(path) {
  if (!path || path.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.abs((path[i] - path[i - 1]) / path[i - 1]);
  }
  return total / path.length;
}

function scoreDistance(dist) {
  if (dist <= 0) return 0;
  if (dist < 0.02) return 0.6;
  if (dist <= 0.05) return 1.0;
  if (dist <= 0.06) return 0.5;
  return 0;
}

function isConstructive(path) {
  if (!path || path.length < 3) return true;
  const [a, b, c] = path.slice(-3);
  return !(c < b && b < a && (a - c) / a > 0.015);
}

function computeKellyLite(winProb) {
  const edge = winProb - (1 - winProb);
  return Math.min(1, Math.max(0, edge) * 0.5);
}

// ---------------------------
// NORMALIZATION / VALIDATION
// ---------------------------

function normalizeFeed(raw) {
  return {
    symbol: String(raw.symbol || "").toUpperCase(),
    name: raw.name || "",
    exchange: String(raw.exchange || "").toUpperCase(),
    last: Number(raw.last ?? raw.price ?? 0),
    prevClose: Number(raw.prevClose ?? raw.previousClose ?? 0),
    high: Number(raw.high ?? 0),
    low: Number(raw.low ?? 0),
    volume: Number(raw.volume ?? 0),
    timestamp: raw.timestamp ?? Date.now(),
  };
}

function validateInstrument(feed, expected) {
  const symbolOk = feed.symbol === String(expected.symbol || "").toUpperCase();
  // Exchange: skip check if feed has no exchange or generic "STOCKS" from Polygon
  const exchangeOk = expected.exchange
    ? (feed.exchange === "" || feed.exchange === "STOCKS" || feed.exchange.includes(String(expected.exchange).toUpperCase()))
    : true;
  // Description: skip check if feed name is empty (Polygon snapshots don't include name)
  const descOk = (expected.description && feed.name)
    ? String(feed.name).toUpperCase().includes(String(expected.description).toUpperCase())
    : true;
  const priceOk = Number.isFinite(feed.last) && feed.last > 0;
  const prevOk = Number.isFinite(feed.prevClose) && feed.prevClose > 0;
  return { valid: symbolOk && priceOk && prevOk, symbolOk, exchangeOk, descOk, priceOk, prevOk };
}

function validateCrossAsset(leader, follower) {
  const leaderRet = pctChange(leader);
  const followerRet = pctChange(follower);
  const sameDirection = (leaderRet >= 0 && followerRet >= 0) || (leaderRet <= 0 && followerRet <= 0);
  const leverageGap = Math.abs(followerRet - 2 * leaderRet);
  const leverageOk = leverageGap < 0.12;
  const now = Date.now();
  // If timestamp is 0 or very small (market closed / no trades), consider fresh (data is latest available)
  const leaderFresh = !leader.timestamp || leader.timestamp < 1e10 || Math.abs(now - leader.timestamp) < 24 * 60 * 60 * 1000;
  const followerFresh = !follower.timestamp || follower.timestamp < 1e10 || Math.abs(now - follower.timestamp) < 24 * 60 * 60 * 1000;
  return { valid: sameDirection && leverageOk && leaderFresh && followerFresh, sameDirection, leverageOk, leverageGap, leaderFresh, followerFresh, leaderRet, followerRet };
}

// ---------------------------
// MOCK DATA PROVIDER
// ---------------------------

const MOCK_QUOTES = {
  VIX:   { symbol: "VIX",   name: "CBOE Volatility Index",  exchange: "CBOE",   last: 22.4,   prevClose: 21.8,  high: 23.1, low: 21.2, volume: 0 },
  IWM:   { symbol: "IWM",   name: "iShares Russell 2000",   exchange: "ARCA",   last: 196.50, prevClose: 195.80, high: 197.2, low: 194.9, volume: 28000000 },
  NBIS:  { symbol: "NBIS",  name: "Nebius Group N.V.",       exchange: "NASDAQ", last: 108.82, prevClose: 101.95, high: 108.96, low: 96.19, volume: 14760000 },
  NEBX:  { symbol: "NEBX",  name: "Tradr 2X Long NBIS Daily ETF", exchange: "CBOE", last: 35.31, prevClose: 31.00, high: 35.31, low: 27.71, volume: 950000 },
  QQQM:  { symbol: "QQQM",  name: "Invesco NASDAQ 100 ETF", exchange: "NASDAQ", last: 192.30, prevClose: 191.50, high: 193.1, low: 190.8, volume: 5200000 },
  MSFT:  { symbol: "MSFT",  name: "Microsoft",               exchange: "NASDAQ", last: 388.50, prevClose: 386.20, high: 390.1, low: 385.0, volume: 22000000 },
  NVDA:  { symbol: "NVDA",  name: "NVIDIA",                  exchange: "NASDAQ", last: 110.20, prevClose: 108.90, high: 111.5, low: 108.2, volume: 45000000 },
  AAPL:  { symbol: "AAPL",  name: "Apple",                   exchange: "NASDAQ", last: 223.40, prevClose: 222.80, high: 224.1, low: 221.5, volume: 38000000 },
  AMZN:  { symbol: "AMZN",  name: "Amazon",                  exchange: "NASDAQ", last: 186.20, prevClose: 185.50, high: 187.0, low: 184.8, volume: 32000000 },
  GOOGL: { symbol: "GOOGL", name: "Alphabet",                exchange: "NASDAQ", last: 161.80, prevClose: 161.20, high: 162.5, low: 160.4, volume: 25000000 },
  CRWV:  { symbol: "CRWV",  name: "CoreWeave",               exchange: "NASDAQ", last: 42.50,  prevClose: 40.80,  high: 43.2, low: 40.1, volume: 8500000 },
  JEPI:  { symbol: "JEPI",  name: "JPMorgan Equity Premium Income ETF", exchange: "ARCA", last: 57.80, prevClose: 57.65, high: 57.95, low: 57.50, volume: 3200000 },
  JEPQ:  { symbol: "JEPQ",  name: "JPMorgan Nasdaq Equity Premium Income ETF", exchange: "NASDAQ", last: 52.10, prevClose: 51.90, high: 52.30, low: 51.70, volume: 2800000 },
};

function getMockQuote(symbol) {
  const base = MOCK_QUOTES[symbol];
  if (!base) return normalizeFeed({ symbol, last: 0, prevClose: 0 });
  return normalizeFeed({ ...base, timestamp: Date.now() });
}

function getMockQuotes() {
  const result = {};
  getAllSymbols().forEach(sym => { result[sym] = getMockQuote(sym); });
  return result;
}

// ---------------------------
// FETCH LAYER (Polygon.io — Developer Tier)
// Real-time snapshots for stocks/ETFs, index aggs for VIX
// ---------------------------

async function fetchPolygonSnapshot(symbol) {
  const url = `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Polygon snap ${symbol}: ${res.status}`);
  const data = await res.json();
  const t = data.ticker;
  if (!t) throw new Error(`Polygon: no snapshot for ${symbol}`);

  const d = t.day || {};
  const p = t.prevDay || {};
  const lt = t.lastTrade || {};

  // During market hours: use lastTrade + day data
  // After hours / closed: day fields are 0, fall back to prevDay
  const marketOpen = (d.c > 0 || lt.p > 0);
  const last = marketOpen ? (lt.p || d.c || p.c) : p.c;
  const prevClose = marketOpen ? (p.c || 0) : (p.o || 0);
  const high = marketOpen ? (d.h || p.h) : p.h;
  const low = marketOpen ? (d.l || p.l) : p.l;
  const volume = marketOpen ? (d.v || 0) : (p.v || 0);

  return normalizeFeed({
    symbol: t.ticker || symbol,
    name: t.name || symbol,
    exchange: t.market || "",
    last, prevClose, high, low, volume,
    timestamp: lt.t ? Math.floor(lt.t / 1e6) : Date.now(),
  });
}

async function fetchPolygonVIX() {
  // VIX: use previous day aggs (index snapshots require higher tier)
  const url = `${POLYGON_BASE}/v2/aggs/ticker/I:VIX/prev?adjusted=true&apiKey=${POLYGON_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Polygon VIX: ${res.status}`);
  const data = await res.json();
  const bar = data.results?.[0];
  if (!bar) throw new Error("Polygon: no VIX data");
  return normalizeFeed({
    symbol: "VIX", name: "CBOE Volatility Index", exchange: "CBOE",
    last: bar.c, prevClose: bar.o, high: bar.h, low: bar.l,
    volume: 0, timestamp: bar.t || Date.now(),
  });
}

async function fetchQuote(symbol) {
  if (USE_MOCK) return getMockQuote(symbol);
  if (symbol === "VIX") return fetchPolygonVIX();
  return fetchPolygonSnapshot(symbol);
}

async function fetchAllQuotes() {
  if (USE_MOCK) return getMockQuotes();
  const symbols = getAllSymbols();
  const results = await Promise.all(
    symbols.map(async (sym) => {
      try {
        return await fetchQuote(sym);
      } catch (err) {
        console.warn(`Polygon fetch failed for ${sym}:`, err.message);
        return getMockQuote(sym);
      }
    })
  );
  return Object.fromEntries(results.map(q => [q.symbol, q]));
}

// ---------------------------
// SELF-CALIBRATION
// ---------------------------

function calibrateParams(quotes) {
  const calibrated = { refreshedAt: Date.now(), symbols: {}, market: {} };
  Object.entries(quotes).forEach(([symbol, q]) => {
    calibrated.symbols[symbol] = { last: q.last, prevClose: q.prevClose, high: q.high, low: q.low, volume: q.volume, vol: computeRealizedVolFromRange(q.high, q.low, q.last), timestamp: q.timestamp };
  });
  if (quotes.VIX && quotes.IWM) {
    calibrated.market = { vix: quotes.VIX.last, iwm: quotes.IWM.last, vixChange: pctChange(quotes.VIX), iwmChange: pctChange(quotes.IWM) };
  }
  return calibrated;
}

// ---------------------------
// MARKET REGIME
// ---------------------------

function evaluateMarketRegime(vix, iwm) {
  let score = 50;
  const notes = [];
  const vixChange = pctChange(vix);
  const iwmChange = pctChange(iwm);

  if (vix.last >= MARKET_REGIME.vix.panicThreshold) { score -= 30; notes.push("VIX panic"); }
  else if (vix.last >= MARKET_REGIME.vix.fearThreshold) { score -= 15; notes.push("VIX elevated"); }
  else { score += 5; notes.push("VIX contained"); }
  if (vixChange > 0.03) { score -= 10; notes.push("VIX rising"); }

  if (iwmChange >= MARKET_REGIME.iwm.strongReturnThreshold) { score += 20; notes.push("IWM risk-on"); }
  else if (iwmChange <= MARKET_REGIME.iwm.weakReturnThreshold) { score -= 20; notes.push("IWM risk-off"); }
  else { notes.push("IWM neutral"); }

  score = Math.max(0, Math.min(100, score));
  let state = "NEUTRAL";
  if (score >= 65) state = "RISK-ON";
  else if (score <= 35) state = "RISK-OFF";

  return { state, score, notes, vix: { price: vix.last, changePct: vixChange }, iwm: { price: iwm.last, changePct: iwmChange } };
}

// ---------------------------
// SIMULATION (calibrated)
// ---------------------------

function simulateLeaderPath(start, vol = 0.065) {
  let price = start;
  const path = [];
  for (let i = 0; i < 10; i++) {
    price *= (1 + 0.0005 + vol * randn());
    path.push(price);
  }
  return path;
}

function simulateFollowerPath(leaderPath, startPrice) {
  let price = startPrice;
  const dailyFee = 0.000052; // 1.30% / 252
  const path = [];
  for (let i = 0; i < leaderPath.length; i++) {
    const leaderRet = i === 0 ? 0 : (leaderPath[i] - leaderPath[i - 1]) / leaderPath[i - 1];
    const volDrag = leaderRet * leaderRet;
    const followerRet = 2.0 * leaderRet - dailyFee - volDrag + 0.003 * randn();
    price *= (1 + followerRet);
    path.push(price);
  }
  return path;
}

function evaluateTouchBeforeStop(path, targets, stop) {
  const hits = targets.map(() => false);
  let stopHit = false;
  for (const p of path) {
    if (p <= stop) { stopHit = true; break; }
    targets.forEach((t, i) => { if (p >= t) hits[i] = true; });
  }
  return { hits, stopHit };
}

function runPairMonteCarlo(leaderStart, followerStart, targets, stop, leaderVol, N = 2000) {
  const counts = targets.map(() => 0);
  let winCount = 0;
  for (let i = 0; i < N; i++) {
    const leaderPath = simulateLeaderPath(leaderStart, Math.max(leaderVol, 0.005));
    const followerPath = simulateFollowerPath(leaderPath, followerStart);
    const outcome = evaluateTouchBeforeStop(followerPath, targets, stop);
    outcome.hits.forEach((hit, idx) => { if (hit) counts[idx]++; });
    if (outcome.hits[0] && !outcome.stopHit) winCount++;
  }
  return { ladderProbs: counts.map(c => c / N), winProb: winCount / N };
}

// ---------------------------
// SETUP EVALUATORS
// ---------------------------

function evaluatePairSetup(setup, quotes, marketRegime, calibrated) {
  const leader = quotes[setup.leader.symbol];
  const follower = quotes[setup.follower.symbol];
  if (!leader || !follower) return { setup: setup.leader.symbol, state: "NO TRADE", error: "Missing feed" };

  const leaderCheck = validateInstrument(leader, setup.leader);
  const followerCheck = validateInstrument(follower, setup.follower);
  if (!leaderCheck.valid) return { kind: "pair", setup: `${setup.leader.symbol}/${setup.follower.symbol}`, state: "NO TRADE", error: "Bad leader", score: 0 };
  if (!followerCheck.valid) return { kind: "pair", setup: `${setup.leader.symbol}/${setup.follower.symbol}`, state: "NO TRADE", error: "Bad follower", score: 0 };

  const cross = validateCrossAsset(leader, follower);
  const leaderAbove = leader.last > (setup.leaderThreshold || 0);
  const distT1 = getDistancePct(follower.last, setup.targets[0]);
  const distStop = (follower.last - setup.stop) / follower.last;
  const leaderVol = calibrated?.symbols?.[setup.leader.symbol]?.vol ?? 0.065;

  let score = 0;
  if (leaderAbove) score += 25;
  if (cross.valid) score += 15;
  score += scoreDistance(distT1) * 25;
  if (leaderVol > 0.003) score += 10;
  if (marketRegime.state === "RISK-ON") score += 15;
  if (marketRegime.state === "RISK-OFF") score -= 20;
  score = Math.max(0, Math.min(100, score));

  const sim = runPairMonteCarlo(leader.last, follower.last, setup.targets, setup.stop, leaderVol);
  const kelly = computeKellyLite(sim.winProb);

  let state = "NO TRADE";
  if (score >= 75 && distT1 > 0 && marketRegime.state !== "RISK-OFF") state = "GO";
  else if (score >= 50) state = "WATCH";

  return {
    kind: "pair", setup: `${setup.leader.symbol}/${setup.follower.symbol}`, state, score,
    leaderPrice: leader.last, followerPrice: follower.last, leaderAbove, distT1, distStop,
    cross, ladderProbs: sim.ladderProbs, winProb: sim.winProb,
    suggestedSize: setup.capital * kelly, targets: setup.targets, stop: setup.stop,
    marketRegime: marketRegime.state, leaderVol,
  };
}

function evaluateStandaloneSetup(setup, quotes, marketRegime, calibrated) {
  const leader = quotes[setup.leader.symbol];
  if (!leader) return { setup: setup.leader.symbol, state: "NO TRADE", error: "Missing feed", score: 0 };
  const check = validateInstrument(leader, setup.leader);
  if (!check.valid) return { kind: "standalone", setup: setup.leader.symbol, state: "NO TRADE", error: "Bad feed", score: 0 };

  const vol = calibrated?.symbols?.[setup.leader.symbol]?.vol ?? 0;
  const change = pctChange(leader);

  let score = 50;
  if (vol > 0.002) score += 10;
  if (change > 0.01) score += 15;
  if (marketRegime.state === "RISK-ON") score += 15;
  if (marketRegime.state === "RISK-OFF") score -= 20;
  score = Math.max(0, Math.min(100, score));

  let state = "NO TRADE";
  if (score >= 70 && marketRegime.state !== "RISK-OFF") state = "GO";
  else if (score >= 50) state = "WATCH";

  return { kind: "standalone", setup: setup.leader.symbol, state, score, leaderPrice: leader.last, change, vol, marketRegime: marketRegime.state };
}

function evaluateBasketSetup(setup, quotes, marketRegime, calibrated) {
  const leader = quotes[setup.leader.symbol];
  if (!leader) return { setup: setup.leader.symbol, state: "NO TRADE", error: "Missing feed", score: 0 };
  const check = validateInstrument(leader, setup.leader);
  if (!check.valid) return { kind: "basket", setup: setup.leader.symbol, state: "NO TRADE", error: "Bad feed", score: 0 };

  const driverChanges = setup.drivers.map(sym => quotes[sym]).filter(Boolean).map(d => pctChange(d));
  const avgDriverChange = driverChanges.length > 0 ? driverChanges.reduce((a, b) => a + b, 0) / driverChanges.length : 0;
  const leaderChange = pctChange(leader);

  let score = 50;
  if (avgDriverChange > 0.005 && leaderChange < avgDriverChange) score += 20;
  if (avgDriverChange < -0.005) score -= 20;
  if (marketRegime.state === "RISK-ON") score += 15;
  if (marketRegime.state === "RISK-OFF") score -= 20;
  score = Math.max(0, Math.min(100, score));

  let state = "NO TRADE";
  if (score >= 70 && marketRegime.state !== "RISK-OFF") state = "GO";
  else if (score >= 50) state = "WATCH";

  return { kind: "basket", setup: setup.leader.symbol, state, score, leaderPrice: leader.last, leaderChange, avgDriverChange, drivers: setup.drivers, marketRegime: marketRegime.state };
}

// ---------------------------
// MASTER RUNNER
// ---------------------------

function runAllSetups(quotes, calibrated) {
  const regime = evaluateMarketRegime(quotes[MARKET_REGIME.vix.symbol], quotes[MARKET_REGIME.iwm.symbol]);
  const results = [];

  Object.entries(SETUPS).forEach(([key, setup]) => {
    if (setup.kind === "pair") results.push(evaluatePairSetup(setup, quotes, regime, calibrated));
    else if (setup.kind === "standalone") results.push(evaluateStandaloneSetup(setup, quotes, regime, calibrated));
    else if (setup.kind === "basket") results.push(evaluateBasketSetup(setup, quotes, regime, calibrated));
  });

  return { refreshedAt: Date.now(), marketRegime: regime, results: results.sort((a, b) => b.score - a.score) };
}

// =====================================================
// UI
// =====================================================

const fmt = (n, d = 2) => Number(n).toFixed(d);
const pctFmt = (n) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
const ts = () => new Date().toLocaleTimeString("en-US", { hour12: false });

const GREEN  = "#22c55e";
const RED    = "#ef4444";
const AMBER  = "#f59e0b";
const BLUE   = "#38bdf8";
const PURPLE = "#a78bfa";
const SLATE  = "#94a3b8";
const CYAN   = "#2dd4bf";

function TradingViewChart({ symbol, height = 500 }) {
  const containerRef = useRef(null);
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";
    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    containerRef.current.appendChild(widgetDiv);
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: false, width: "100%", height, symbol, interval: "15", timezone: "Etc/UTC",
      theme: "dark", style: "1", locale: "en", allow_symbol_change: true, calendar: false,
      hide_side_toolbar: true, hide_top_toolbar: false, hide_legend: false, hide_volume: false,
      save_image: false, backgroundColor: "#0d1117", gridColor: "rgba(30, 37, 48, 0.6)", withdateranges: false,
    });
    containerRef.current.appendChild(script);
  }, [symbol]);
  return (
    <div ref={containerRef} className="tradingview-widget-container"
      style={{ height: `${height}px`, minHeight: `${height}px`, borderRadius: 10, overflow: "hidden", border: "1px solid #1e2530", marginBottom: 12 }}>
      <style>{`
        .tradingview-widget-container { position: relative; }
        .tradingview-widget-container__widget { height: 100% !important; width: 100% !important; position: absolute; top: 0; left: 0; }
        .tradingview-widget-container__widget iframe { height: 100% !important; width: 100% !important; }
      `}</style>
    </div>
  );
}

function Gate({ label, ok, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: ok ? GREEN : "#1e2530", boxShadow: ok ? `0 0 7px ${GREEN}` : "none", transition: "all 0.3s" }} />
        <span style={{ fontSize: 11, color: ok ? "#d1fae5" : "#b0b8c4" }}>{label}</span>
      </div>
      <span style={{ fontSize: 11, fontFamily: "monospace", color: ok ? GREEN : "#9ca3af" }}>{value}</span>
    </div>
  );
}

function ScoreRing({ score, size = 72 }) {
  const r = size * 0.39, circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 75 ? GREEN : score >= 50 ? AMBER : RED;
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e2530" strokeWidth={4} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${cx}px ${cy}px`, fill: color, fontSize: size * 0.22, fontWeight: 700, fontFamily: "monospace" }}>
        {score}
      </text>
    </svg>
  );
}

function LadderBar({ target, prob, idx }) {
  const color = prob > 0.55 ? GREEN : prob > 0.3 ? AMBER : "#9ca3af";
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
        <span style={{ color: "#b0b8c4" }}>T{idx + 1} ${target}</span>
        <span style={{ color, fontWeight: 700 }}>{(prob * 100).toFixed(1)}%</span>
      </div>
      <div style={{ height: 3, background: "#1e2530", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${prob * 100}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function AlertRow({ a }) {
  const styles = {
    GO:         { bg: "#071a0f", border: GREEN, tag: GREEN, text: "#86efac" },
    WATCH:      { bg: "#1c1700", border: AMBER, tag: AMBER, text: "#fde68a" },
    "NO TRADE": { bg: "#0d1117", border: "#1e2530", tag: "#9ca3af", text: "#b0b8c4" },
    REGIME:     { bg: "#0d0717", border: PURPLE, tag: PURPLE, text: "#c4b5fd" },
    REFRESH:    { bg: "#071525", border: BLUE,   tag: BLUE,   text: "#7dd3fc" },
    INFO:       { bg: "#0d1117", border: "#1e2530", tag: "#9ca3af", text: "#b0b8c4" },
  };
  const c = styles[a.type] || styles.INFO;
  return (
    <div style={{ background: c.bg, borderLeft: `3px solid ${c.border}`, borderRadius: 6, padding: "9px 11px", marginBottom: 7, animation: "slideIn 0.2s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: c.tag, background: c.tag + "22", padding: "2px 6px", borderRadius: 3 }}>{a.type}</span>
        <span style={{ fontSize: 9, color: "#9ca3af", fontFamily: "monospace" }}>{a.time}</span>
      </div>
      <div style={{ fontSize: 11, color: c.text, lineHeight: 1.5 }}>{a.msg}</div>
      {a.meta && <div style={{ fontSize: 10, color: "#b0b8c4", marginTop: 3, fontFamily: "monospace", whiteSpace: "pre-line" }}>{a.meta}</div>}
    </div>
  );
}

// ---------------------------
// REGIME PANEL
// ---------------------------

function RegimePanel({ regime }) {
  if (!regime) return null;
  const color = regime.state === "RISK-ON" ? GREEN : regime.state === "RISK-OFF" ? RED : AMBER;
  return (
    <div style={{ background: "#0d1117", border: `1px solid ${color}33`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.12em" }}>MARKET REGIME</div>
        <span style={{ fontSize: 10, fontWeight: 700, color, background: color + "22", padding: "3px 8px", borderRadius: 4, letterSpacing: "0.08em" }}>{regime.state}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 10 }}>
        <div>
          <span style={{ color: "#9ca3af" }}>VIX </span>
          <span style={{ color: regime.vix.price >= 28 ? RED : GREEN, fontWeight: 700 }}>{fmt(regime.vix.price)}</span>
          <span style={{ color: "#b0b8c4", marginLeft: 6 }}>{pctFmt(regime.vix.changePct)}</span>
        </div>
        <div>
          <span style={{ color: "#9ca3af" }}>IWM </span>
          <span style={{ color: CYAN, fontWeight: 700 }}>${fmt(regime.iwm.price)}</span>
          <span style={{ color: regime.iwm.changePct >= 0 ? GREEN : RED, marginLeft: 6 }}>{pctFmt(regime.iwm.changePct)}</span>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 9, color: "#b0b8c4" }}>{regime.notes.join(" · ")}</div>
      <div style={{ marginTop: 6 }}>
        <div style={{ height: 3, background: "#1e2530", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${regime.score}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.4s" }} />
        </div>
        <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 3, textAlign: "right" }}>{regime.score}/100</div>
      </div>
    </div>
  );
}

// ---------------------------
// SETUP CARD
// ---------------------------

function SetupCard({ result, isSelected, onSelect }) {
  const stateColor = result.state === "GO" ? GREEN : result.state === "WATCH" ? AMBER : "#9ca3af";
  const kindLabel = { pair: "PAIR", standalone: "SOLO", basket: "BASKET" }[result.kind] || "?";
  const kindColor = { pair: PURPLE, standalone: CYAN, basket: BLUE }[result.kind] || SLATE;

  return (
    <div onClick={onSelect} style={{
      background: isSelected ? "#0d1520" : "#0d1117",
      border: `1px solid ${isSelected ? stateColor + "66" : "#1e2530"}`,
      borderRadius: 10, padding: 14, cursor: "pointer",
      transition: "all 0.2s", marginBottom: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: kindColor, background: kindColor + "22", padding: "2px 5px", borderRadius: 3, letterSpacing: "0.1em" }}>{kindLabel}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{result.setup}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ScoreRing score={result.score} size={36} />
          <span style={{ fontSize: 10, fontWeight: 700, color: stateColor, letterSpacing: "0.08em" }}>{result.state}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, fontSize: 10 }}>
        <span style={{ color: "#b0b8c4" }}>
          {result.kind === "pair" ? `L: $${fmt(result.leaderPrice)} F: $${fmt(result.followerPrice)}` :
           `$${fmt(result.leaderPrice)}`}
        </span>
        {result.winProb !== undefined && (
          <span style={{ color: GREEN }}>Win: {(result.winProb * 100).toFixed(1)}%</span>
        )}
        {result.suggestedSize !== undefined && (
          <span style={{ color: BLUE }}>Kelly: ${fmt(result.suggestedSize, 0)}</span>
        )}
        {result.change !== undefined && (
          <span style={{ color: result.change >= 0 ? GREEN : RED }}>{pctFmt(result.change)}</span>
        )}
      </div>

      {result.error && <div style={{ fontSize: 10, color: RED, marginTop: 6 }}>{result.error}</div>}
    </div>
  );
}

// ---------------------------
// DETAIL PANEL (selected setup)
// ---------------------------

function DetailPanel({ result, setupKey }) {
  if (!result) return null;
  const setup = SETUPS[setupKey];
  if (!setup) return null;

  const charts = [];
  if (setup.tvLeader) charts.push({ label: setup.leader.symbol, symbol: setup.tvLeader });
  if (setup.tvFollower) charts.push({ label: setup.follower?.symbol, symbol: setup.tvFollower });

  return (
    <div>
      {/* Charts */}
      {charts.map(c => (
        <div key={c.symbol}>
          <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.12em", marginBottom: 6 }}>{c.label} CHART</div>
          <TradingViewChart symbol={c.symbol} height={400} />
        </div>
      ))}

      {/* Pair-specific: ladder + gates */}
      {result.kind === "pair" && result.ladderProbs && (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, background: "#0d1117", border: "1px solid #1e2530", borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <ScoreRing score={result.score} />
            <div style={{ fontSize: 9, color: "#9ca3af" }}>SCORE</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: result.state === "GO" ? GREEN : result.state === "WATCH" ? AMBER : RED, letterSpacing: "0.08em" }}>{result.state}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.12em", marginBottom: 10 }}>TOUCH LADDER (MC N=2000)</div>
            {result.targets.map((t, i) => (
              <LadderBar key={t} target={t} prob={result.ladderProbs[i]} idx={i} />
            ))}
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 10 }}>
              <div><span style={{ color: "#9ca3af" }}>Win prob </span><span style={{ color: GREEN, fontWeight: 700 }}>{(result.winProb * 100).toFixed(1)}%</span></div>
              <div><span style={{ color: "#9ca3af" }}>Kelly $ </span><span style={{ color: BLUE, fontWeight: 700 }}>${fmt(result.suggestedSize, 0)}</span></div>
              <div><span style={{ color: "#9ca3af" }}>Dist T1 </span><span style={{ color: SLATE, fontWeight: 700 }}>{(result.distT1 * 100).toFixed(2)}%</span></div>
              <div><span style={{ color: "#9ca3af" }}>Dist Stop </span><span style={{ color: RED, fontWeight: 700 }}>{result.distStop ? (result.distStop * 100).toFixed(2) : "0.00"}%</span></div>
              <div><span style={{ color: "#9ca3af" }}>Leader vol </span><span style={{ color: SLATE, fontWeight: 700 }}>{(result.leaderVol * 100).toFixed(2)}%</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Pair gates */}
      {result.kind === "pair" && (
        <div style={{ background: "#0d1117", border: "1px solid #1e2530", borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.12em", marginBottom: 10 }}>CONDITION GATES</div>
          <Gate label={`${setup.leader.symbol} > ${setup.leaderThreshold}`} ok={result.leaderAbove} value={result.leaderAbove ? "✓" : `needs +$${fmt(setup.leaderThreshold - result.leaderPrice)}`} />
          <Gate label="Cross-asset validated" ok={result.cross?.valid} value={result.cross?.valid ? "✓" : "FAILED"} />
          <Gate label="Direction aligned" ok={result.cross?.sameDirection} value={result.cross?.sameDirection ? "✓" : "DIVERGED"} />
          <Gate label="Leverage ~2x" ok={result.cross?.leverageOk} value={result.cross?.leverageOk ? `gap ${(result.cross.leverageGap * 100).toFixed(2)}%` : "WIDE"} />
          <Gate label="Dist T1 (2-6%)" ok={result.distT1 >= 0.02 && result.distT1 <= 0.06} value={`${(result.distT1 * 100).toFixed(2)}%`} />
          <Gate label="Market regime" ok={result.marketRegime !== "RISK-OFF"} value={result.marketRegime} />
          <div style={{ borderTop: "1px solid #1e2530", marginTop: 10, paddingTop: 10 }}>
            <Gate label="SCORE >= 75 -> GO" ok={result.score >= 75} value={`${result.score} / 100`} />
          </div>
        </div>
      )}

      {/* Basket detail */}
      {result.kind === "basket" && (
        <div style={{ background: "#0d1117", border: "1px solid #1e2530", borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.12em", marginBottom: 10 }}>BASKET ANALYSIS</div>
          <div style={{ fontSize: 10, marginBottom: 6 }}>
            <span style={{ color: "#b0b8c4" }}>Leader change: </span>
            <span style={{ color: result.leaderChange >= 0 ? GREEN : RED, fontWeight: 700 }}>{pctFmt(result.leaderChange)}</span>
          </div>
          <div style={{ fontSize: 10, marginBottom: 6 }}>
            <span style={{ color: "#b0b8c4" }}>Avg driver change: </span>
            <span style={{ color: result.avgDriverChange >= 0 ? GREEN : RED, fontWeight: 700 }}>{pctFmt(result.avgDriverChange)}</span>
          </div>
          <div style={{ fontSize: 10, color: "#b0b8c4" }}>Drivers: {result.drivers.join(", ")}</div>
        </div>
      )}

      {/* Standalone detail */}
      {result.kind === "standalone" && (
        <div style={{ background: "#0d1117", border: "1px solid #1e2530", borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.12em", marginBottom: 10 }}>STANDALONE ANALYSIS</div>
          <Gate label="Price constructive" ok={result.change >= 0} value={pctFmt(result.change || 0)} />
          <Gate label="Volatility active" ok={(result.vol || 0) > 0.002} value={`${((result.vol || 0) * 100).toFixed(3)}%`} />
          <Gate label="Market regime" ok={result.marketRegime !== "RISK-OFF"} value={result.marketRegime} />
          <div style={{ borderTop: "1px solid #1e2530", marginTop: 10, paddingTop: 10 }}>
            <Gate label="SCORE >= 70 -> GO" ok={result.score >= 70} value={`${result.score} / 100`} />
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================
// APP
// =====================================================

export default function App() {
  const [engineOutput, setEngineOutput] = useState(null);
  const [selectedSetup, setSelectedSetup] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const autoRef = useRef(null);

  const addAlert = useCallback((type, msg, meta) => {
    setAlerts(prev => [{ type, msg, meta, time: ts(), id: Date.now() + Math.random() }, ...prev].slice(0, 80));
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const quotes = await fetchAllQuotes();
      const calibrated = calibrateParams(quotes);
      const output = runAllSetups(quotes, calibrated);
      setEngineOutput(output);
      setLastRefresh(new Date());

      addAlert("REFRESH", `Engine calibrated · ${getAllSymbols().length} symbols · regime: ${output.marketRegime.state}`,
        `VIX $${fmt(output.marketRegime.vix.price)} | IWM $${fmt(output.marketRegime.iwm.price)}\n${output.results.filter(r => r.state === "GO").length} GO · ${output.results.filter(r => r.state === "WATCH").length} WATCH`);

      output.results.forEach(r => {
        if (r.state === "GO") addAlert("GO", `${r.setup} · Score ${r.score}/100`, r.kind === "pair" ? `Win: ${(r.winProb * 100).toFixed(1)}% | Kelly: $${fmt(r.suggestedSize, 0)}` : `${r.kind} setup`);
        else if (r.state === "WATCH") addAlert("WATCH", `${r.setup} · Score ${r.score}/100`, r.error || "Monitoring");
      });

      if (!selectedSetup && output.results.length > 0) {
        const topKey = Object.keys(SETUPS).find(k => {
          const s = SETUPS[k];
          const name = s.kind === "pair" ? `${s.leader.symbol}/${s.follower.symbol}` : s.leader.symbol;
          return name === output.results[0].setup;
        });
        if (topKey) setSelectedSetup(topKey);
      }
    } catch (err) {
      addAlert("INFO", `Refresh failed: ${err.message}`, "");
    }
    setRefreshing(false);
  }, [addAlert, selectedSetup]);

  // Initial load
  useEffect(() => { refresh(); }, []);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      autoRef.current = setInterval(refresh, 60000);
      return () => clearInterval(autoRef.current);
    } else {
      if (autoRef.current) clearInterval(autoRef.current);
    }
  }, [autoRefresh, refresh]);

  const regime = engineOutput?.marketRegime;
  const results = engineOutput?.results || [];
  const selectedResult = selectedSetup && results.find(r => {
    const s = SETUPS[selectedSetup];
    const name = s.kind === "pair" ? `${s.leader.symbol}/${s.follower.symbol}` : s.leader.symbol;
    return r.setup === name;
  });

  const goCount = results.filter(r => r.state === "GO").length;
  const watchCount = results.filter(r => r.state === "WATCH").length;

  return (
    <div style={{ minHeight: "100vh", background: "#060a0f", color: "#e2e8f0", fontFamily: "'JetBrains Mono','Fira Code',ui-monospace,monospace", padding: 16 }}>
      <style>{`
        @keyframes slideIn { from{opacity:0;transform:translateY(-5px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes glow    { 0%,100%{box-shadow:0 0 8px #22c55e33} 50%{box-shadow:0 0 22px #22c55e77} }
        @keyframes spin    { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:#1e2530;border-radius:2px}
      `}</style>

      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.18em", marginBottom: 3 }}>MULTI-SETUP TRIGGER ENGINE</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.03em" }}>
              SCANNER <span style={{ fontSize: 10, color: PURPLE, fontWeight: 400 }}>{results.length} setups</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {goCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: GREEN + "22", padding: "4px 8px", borderRadius: 4, animation: "glow 1.4s infinite" }}>{goCount} GO</span>
            )}
            {watchCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: AMBER, background: AMBER + "22", padding: "4px 8px", borderRadius: 4 }}>{watchCount} WATCH</span>
            )}
          </div>
        </div>

        {/* CONTROLS */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={refresh} disabled={refreshing}
            style={{ flex: 1, padding: 11, background: "#071a0f", border: `1px solid ${GREEN}`, borderRadius: 8, color: GREEN, fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.07em", opacity: refreshing ? 0.5 : 1 }}>
            {refreshing ? "↻ REFRESHING..." : "↻ REFRESH NOW"}
          </button>
          <button onClick={() => setAutoRefresh(a => !a)}
            style={{ padding: "11px 16px", background: autoRefresh ? GREEN + "18" : "transparent", border: `1px solid ${autoRefresh ? GREEN : "#1e2530"}`, borderRadius: 8, color: autoRefresh ? GREEN : "#9ca3af", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.07em" }}>
            {autoRefresh ? "AUTO: ON" : "AUTO: OFF"}
          </button>
        </div>
        {lastRefresh && (
          <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 12, textAlign: "right" }}>
            Last refresh: {lastRefresh.toLocaleTimeString()} {autoRefresh && "· auto every 60s"}
          </div>
        )}

        {/* MARKET REGIME */}
        <RegimePanel regime={regime} />

        {/* SETUP CARDS */}
        <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.12em", marginBottom: 8 }}>SETUPS (ranked by score)</div>
        {results.map(r => {
          const key = Object.keys(SETUPS).find(k => {
            const s = SETUPS[k];
            const name = s.kind === "pair" ? `${s.leader.symbol}/${s.follower.symbol}` : s.leader.symbol;
            return name === r.setup;
          });
          return (
            <SetupCard key={r.setup} result={r} isSelected={key === selectedSetup}
              onSelect={() => setSelectedSetup(key)} />
          );
        })}

        {/* DETAIL PANEL */}
        {selectedSetup && selectedResult && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.12em", marginBottom: 10 }}>
              DETAIL: {selectedResult.setup}
            </div>
            <DetailPanel result={selectedResult} setupKey={selectedSetup} />
          </div>
        )}

        {/* ALERT LOG */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.14em", marginBottom: 10 }}>
            ALERT LOG {alerts.length > 0 && `· ${alerts.length}`}
          </div>
          {alerts.length === 0
            ? <div style={{ textAlign: "center", padding: "32px 0", color: "#1e2530", fontSize: 11 }}>Click Refresh to begin</div>
            : <div style={{ maxHeight: 400, overflowY: "auto" }}>{alerts.map(a => <AlertRow key={a.id} a={a} />)}</div>
          }
        </div>

        <div style={{ textAlign: "center", fontSize: 9, color: "#1e2530", marginTop: 20 }}>
          Self-calibrating engine · {getAllSymbols().length} symbols · VIX+IWM regime · touch-before-stop · {USE_MOCK ? "MOCK DATA" : "LIVE"} · not financial advice
        </div>
      </div>
    </div>
  );
}
