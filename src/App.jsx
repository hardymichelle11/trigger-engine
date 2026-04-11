import { useState, useEffect, useRef, useCallback } from "react";
import { getAllSymbols, MARKET_REGIME } from "./lib/setupRegistry.js";
import { getTrendBatch, getProviderStatus } from "./lib/historyProvider.js";
import { createPolygonSocket, WS_STATE } from "./lib/websocket/polygonSocket.js";
import { updateFromWebSocket, updateFromPoll, getQuotes, getFeedHealth } from "./lib/websocket/quoteFeed.js";
import {
  evaluatePairSetup,
  evaluateStandaloneSetup,
  evaluateBasketSetup,
  evaluateInfraFollowerSetup,
  evaluateStackReversalSetup,
  pctChange,
  normalizeFeed,
  computeRealizedVolFromRange,
} from "./lib/evaluators/index.js";

// =====================================================
// SELF-CALIBRATING MULTI-SETUP TRIGGER ENGINE
// =====================================================

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;
const POLYGON_BASE = "https://api.polygon.io";
const USE_MOCK = false;

const TICK_MS = 1400;

// Helpers imported from lib/evaluators/shared.js via index.js:
// pctChange, normalizeFeed, computeRealizedVolFromRange

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
  BE:    { symbol: "BE",    name: "Bloom Energy",              exchange: "NYSE",   last: 20.50,  prevClose: 19.80,  high: 21.0, low: 19.5, volume: 6200000 },
  VRT:   { symbol: "VRT",   name: "Vertiv Holdings",           exchange: "NYSE",   last: 82.30,  prevClose: 80.90,  high: 83.1, low: 80.2, volume: 4500000 },
  ETN:   { symbol: "ETN",   name: "Eaton Corporation",         exchange: "NYSE",   last: 285.40, prevClose: 283.10, high: 286.5, low: 282.0, volume: 2100000 },
  POWL:  { symbol: "POWL",  name: "Powell Industries",         exchange: "NASDAQ", last: 195.60, prevClose: 191.20, high: 197.0, low: 190.0, volume: 320000 },
  BAM:   { symbol: "BAM",   name: "Brookfield Asset Management", exchange: "NYSE", last: 48.70,  prevClose: 48.30,  high: 49.1, low: 48.0, volume: 1100000 },
  BEPC:  { symbol: "BEPC",  name: "Brookfield Renewable",     exchange: "NYSE",   last: 31.80,  prevClose: 31.50,  high: 32.0, low: 31.2, volume: 450000 },
  CEG:   { symbol: "CEG",   name: "Constellation Energy",     exchange: "NASDAQ", last: 248.30, prevClose: 244.10, high: 250.5, low: 243.0, volume: 3800000 },
  GEV:   { symbol: "GEV",   name: "GE Vernova",               exchange: "NYSE",   last: 342.70, prevClose: 338.50, high: 345.0, low: 337.0, volume: 2100000 },
  OXY:   { symbol: "OXY",   name: "Occidental Petroleum",    exchange: "NYSE",   last: 47.20,  prevClose: 46.80,  high: 47.8, low: 46.3, volume: 9800000 },
  MOS:   { symbol: "MOS",   name: "Mosaic",                  exchange: "NYSE",   last: 28.40,  prevClose: 27.90,  high: 28.9, low: 27.6, volume: 4200000 },
  CF:    { symbol: "CF",    name: "CF Industries",            exchange: "NYSE",   last: 75.30,  prevClose: 74.60,  high: 76.1, low: 74.2, volume: 2100000 },
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

// Evaluators imported from lib/evaluators/
// Simulation, validation, Monte Carlo all live in evaluator modules now.

// ---------------------------
// MASTER RUNNER
// ---------------------------

function runAllSetups(quotes, calibrated, SETUPS) {
  const regime = evaluateMarketRegime(quotes[MARKET_REGIME.vix.symbol], quotes[MARKET_REGIME.iwm.symbol]);
  const results = [];

  Object.entries(SETUPS).forEach(([, setup]) => {
    if (setup.kind === "pair") results.push(evaluatePairSetup(setup, quotes, regime, calibrated));
    else if (setup.kind === "standalone") results.push(evaluateStandaloneSetup(setup, quotes, regime, calibrated));
    else if (setup.kind === "basket") results.push(evaluateBasketSetup(setup, quotes, regime, calibrated));
    else if (setup.kind === "infra_follower") results.push(evaluateInfraFollowerSetup(setup, quotes, regime, calibrated));
    else if (setup.kind === "stack_reversal") results.push(evaluateStackReversalSetup(setup, quotes, regime, calibrated, SETUPS));
  });

  return { refreshedAt: Date.now(), marketRegime: regime, results: results.sort((a, b) => b.score - a.score) };
}

// Simulation, evaluators, and helpers removed — now in src/lib/evaluators/
// Old functions removed: simulateLeaderPath, simulateFollowerPath, evaluateTouchBeforeStop,
// runPairMonteCarlo, evaluatePairSetup, evaluateStandaloneSetup, evaluateBasketSetup,
// runBEInfraMonteCarlo, evaluateInfraFollowerSetup, isTurningUp, groupStrength, getStage,
// evaluateStackReversalSetup, _stackState, and the second runAllSetups.


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
  const tagColors = { GO: GREEN, WATCH: AMBER, REFRESH: BLUE, REGIME: PURPLE, INFO: SLATE, "NO TRADE": SLATE };
  const color = tagColors[a.type] || SLATE;
  return (
    <div style={{ borderLeft: `2px solid ${color}`, padding: "5px 8px", marginBottom: 4, fontSize: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color, fontWeight: 700, fontSize: 8 }}>{a.type}</span>
        <span style={{ fontSize: 8, color: SLATE, fontFamily: "monospace" }}>{a.time}</span>
      </div>
      <div style={{ color: "#d1d5db", lineHeight: 1.4 }}>{a.msg}</div>
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
    <div style={{ background: "#0d1117", border: `1px solid ${color}33`, borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 8, color: "#9ca3af", letterSpacing: "0.1em" }}>REGIME</div>
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
  const kindLabel = { pair: "PAIR", standalone: "SOLO", basket: "BASKET", infra_follower: "INFRA", stack_reversal: "STACK" }[result.kind] || "?";
  const kindColor = { pair: PURPLE, standalone: CYAN, basket: BLUE, infra_follower: AMBER, stack_reversal: "#f472b6" }[result.kind] || SLATE;

  return (
    <div onClick={onSelect} style={{
      background: isSelected ? "#0d1520" : "#0d1117",
      border: `1px solid ${isSelected ? stateColor + "66" : "#1e2530"}`,
      borderRadius: 10, padding: 14, cursor: "pointer",
      transition: "all 0.15s",
    }}>
      {/* Row 1: type badge + symbol + score ring */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: kindColor, background: kindColor + "22", padding: "2px 6px", borderRadius: 3, letterSpacing: "0.08em" }}>{kindLabel}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{result.setup}</span>
        </div>
        <ScoreRing score={result.score} size={40} />
      </div>

      {/* Row 2: state badge + price */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: stateColor, letterSpacing: "0.06em" }}>{result.state}</span>
        <span style={{ fontSize: 11, color: "#b0b8c4" }}>
          ${fmt(result.leaderPrice)}
          {result.change !== undefined && (
            <span style={{ color: result.change >= 0 ? GREEN : RED, marginLeft: 6 }}>{pctFmt(result.change)}</span>
          )}
        </span>
      </div>

      {/* Row 3: metrics */}
      <div style={{ display: "flex", gap: 10, fontSize: 10, color: SLATE }}>
        {result.winProb !== undefined && <span style={{ color: GREEN }}>Win: {(result.winProb * 100).toFixed(0)}%</span>}
        {result.suggestedSize !== undefined && <span style={{ color: BLUE }}>Kelly: ${fmt(result.suggestedSize, 0)}</span>}
        {result.kind === "stack_reversal" && result.stage && result.stage !== "NO SIGNAL" && (
          <span style={{ color: result.stage === "EARLY" ? GREEN : result.stage === "MID" ? AMBER : RED }}>{result.stage}</span>
        )}
        {result.kind === "infra_follower" && result.lagging && <span style={{ color: GREEN }}>LAGGING</span>}
        {result.kind === "pair" && <span>F: ${fmt(result.followerPrice)}</span>}
      </div>

      {result.error && <div style={{ fontSize: 9, color: RED, marginTop: 4 }}>{result.error}</div>}
    </div>
  );
}

// ---------------------------
// DETAIL PANEL (selected setup)
// ---------------------------

/** Charts for the selected setup — rendered in the center column (needs width). */
function DetailCharts({ result, setupKey, setups }) {
  if (!result || !setups[setupKey]) return null;
  const setup = setups[setupKey];
  const charts = [];
  if (setup.tvLeader) charts.push({ label: setup.leader.symbol, symbol: setup.tvLeader });
  if (setup.tvFollower) charts.push({ label: setup.follower?.symbol, symbol: setup.tvFollower });
  if (!charts.length) return null;

  return (
    <div style={{ marginTop: 10 }}>
      {charts.map(c => (
        <div key={c.symbol}>
          <div style={{ fontSize: 8, color: SLATE, letterSpacing: "0.1em", marginBottom: 4 }}>{c.label}</div>
          <TradingViewChart symbol={c.symbol} height={350} />
        </div>
      ))}
    </div>
  );
}

/** Findings panel — rendered in the right side panel. */
function DetailPanel({ result, setupKey, setups }) {
  if (!result) return null;
  const setup = setups[setupKey];
  if (!setup) return null;

  return (
    <div>

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

      {/* Infra follower detail (BE) */}
      {result.kind === "infra_follower" && (
        <>
          {result.ladderProbs && (
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, background: "#0d1117", border: "1px solid #1e2530", borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <ScoreRing score={result.score} />
                <div style={{ fontSize: 9, color: "#9ca3af" }}>SCORE</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: result.state === "GO" ? GREEN : result.state === "WATCH" ? AMBER : RED, letterSpacing: "0.08em" }}>{result.state}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.12em", marginBottom: 10 }}>BE TOUCH LADDER (MC N=2000)</div>
                {(result.targets || []).map((t, i) => (
                  <LadderBar key={i} target={Number(t).toFixed(2)} prob={result.ladderProbs[i]} idx={i} />
                ))}
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 10 }}>
                  <div><span style={{ color: "#9ca3af" }}>Win prob </span><span style={{ color: GREEN, fontWeight: 700 }}>{(result.winProb * 100).toFixed(1)}%</span></div>
                  <div><span style={{ color: "#9ca3af" }}>Kelly $ </span><span style={{ color: BLUE, fontWeight: 700 }}>${fmt(result.suggestedSize, 0)}</span></div>
                  <div><span style={{ color: "#9ca3af" }}>Stop </span><span style={{ color: RED, fontWeight: 700 }}>${fmt(result.stop)}</span></div>
                </div>
              </div>
            </div>
          )}

          <div style={{ background: "#0d1117", border: "1px solid #1e2530", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.12em", marginBottom: 10 }}>INFRA FOLLOWER ANALYSIS</div>
            <Gate label="AI cluster strength > 1%" ok={result.aiStrength > 0.01} value={pctFmt(result.aiStrength)} />
            <Gate label="Infra drivers strength > 1%" ok={result.infraStrength > 0.01} value={pctFmt(result.infraStrength)} />
            <Gate label={`BE lagging cluster (>= ${((setup?.lagThreshold || 0.0075) * 100).toFixed(2)}%)`} ok={result.lagging} value={result.lagging ? `lag ${pctFmt(result.lagAmount)}` : pctFmt(result.lagAmount || 0)} />
            {result.partnerStrength !== undefined && (
              <Gate label="Strategic partners (BAM/BEPC)" ok={result.partnerStrength > 0} value={pctFmt(result.partnerStrength)} />
            )}
            <div style={{ borderTop: "1px solid #1e2530", marginTop: 8, paddingTop: 8 }}>
              <Gate label="BE move" ok={result.change > 0} value={pctFmt(result.change)} />
              <Gate label="Cluster strength" ok={result.clusterStrength > 0.005} value={pctFmt(result.clusterStrength)} />
            </div>
            <div style={{ borderTop: "1px solid #1e2530", marginTop: 8, paddingTop: 8 }}>
              <Gate label="Market regime" ok={result.marketRegime !== "RISK-OFF"} value={result.marketRegime} />
              <Gate label="SCORE >= 70 -> GO" ok={result.score >= 70} value={`${result.score} / 100`} />
            </div>
            <div style={{ marginTop: 10, fontSize: 9, color: "#b0b8c4" }}>
              AI leaders: {(result.aiLeaders || []).join(", ")} | Infra: {(result.infraDrivers || []).join(", ")}
            </div>
          </div>
        </>
      )}

      {/* Stack reversal detail (NVDA_POWER_STACK) */}
      {result.kind === "stack_reversal" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, background: "#0d1117", border: "1px solid #1e2530", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <ScoreRing score={result.score} />
              <div style={{ fontSize: 9, color: "#9ca3af" }}>SCORE</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: result.state === "GO" ? GREEN : result.state === "WATCH" ? AMBER : RED, letterSpacing: "0.08em" }}>{result.state}</div>
              {result.stage && result.stage !== "NO SIGNAL" && (
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                  color: result.stage === "EARLY" ? GREEN : result.stage === "MID" ? AMBER : RED,
                  background: (result.stage === "EARLY" ? GREEN : result.stage === "MID" ? AMBER : RED) + "22",
                  padding: "3px 8px", borderRadius: 4 }}>
                  {result.score >= 90 ? "EARLY ENTRY" : result.stage}
                </div>
              )}
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.12em" }}>STACK REVERSAL SIGNALS</div>
                {result.action && result.action !== "WAIT" && (
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "3px 8px", borderRadius: 4,
                    color: result.action === "ENTER_AGGRESSIVE" ? GREEN : result.action === "ENTER_NORMAL" ? AMBER : RED,
                    background: (result.action === "ENTER_AGGRESSIVE" ? GREEN : result.action === "ENTER_NORMAL" ? AMBER : RED) + "22" }}>
                    {result.action.replace(/_/g, " ")}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 10, marginBottom: 12 }}>
                <div style={{ background: result.leaderSignal ? GREEN + "18" : "#1e2530", border: `1px solid ${result.leaderSignal ? GREEN : "#1e2530"}`, borderRadius: 8, padding: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4 }}>LEADER (40pt)</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: result.leaderSignal ? GREEN : "#9ca3af" }}>{result.leaderSignal ? "TURNING UP" : "---"}</div>
                  <div style={{ fontSize: 9, color: "#b0b8c4", marginTop: 2 }}>NVDA {pctFmt(result.leaderMomentum)}</div>
                </div>
                <div style={{ background: result.sectorSignal ? GREEN + "18" : "#1e2530", border: `1px solid ${result.sectorSignal ? GREEN : "#1e2530"}`, borderRadius: 8, padding: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4 }}>POWER ({fmt(result.powerStrength * 100, 0)}%) (30pt)</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: result.sectorSignal ? GREEN : "#9ca3af" }}>{result.sectorSignal ? "CONFIRM" : "---"}</div>
                  <div style={{ fontSize: 9, color: "#b0b8c4", marginTop: 2 }}>{pctFmt(result.sectorStrength)}</div>
                </div>
                <div style={{ background: result.lagSignal ? GREEN + "18" : "#1e2530", border: `1px solid ${result.lagSignal ? GREEN : "#1e2530"}`, borderRadius: 8, padding: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4 }}>LAG (30pt)</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: result.lagSignal ? GREEN : "#9ca3af" }}>{result.lagSignal ? "LAGGING" : "---"}</div>
                  <div style={{ fontSize: 9, color: "#b0b8c4", marginTop: 2 }}>Followers {pctFmt(result.followerAvg)}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, fontSize: 10, marginBottom: 12 }}>
                <div><span style={{ color: "#9ca3af" }}>Dist T1 </span><span style={{ color: result.distToT1 > 3 ? GREEN : result.distToT1 > 1 ? AMBER : RED, fontWeight: 700 }}>{fmt(result.distToT1, 1)}%</span></div>
                <div><span style={{ color: "#9ca3af" }}>Stage </span><span style={{ fontWeight: 700, color: result.stage === "EARLY" ? GREEN : result.stage === "MID" ? AMBER : result.stage === "LATE" ? RED : "#9ca3af" }}>{result.stage}</span></div>
                <div><span style={{ color: "#9ca3af" }}>T weights </span><span style={{ color: "#b0b8c4" }}>{result.targetWeights.t1}/{result.targetWeights.t2}/{result.targetWeights.t3}</span></div>
                {result.minutesSinceFlip !== null && (
                  <div><span style={{ color: "#9ca3af" }}>Flip </span><span style={{ color: "#b0b8c4", fontWeight: 700 }}>{result.minutesSinceFlip}min ago</span></div>
                )}
              </div>

              {result.label && result.label !== "NO_STACK_SIGNAL" && (
                <div style={{ fontSize: 9, color: "#f472b6", fontFamily: "monospace", marginBottom: 8 }}>{result.label}</div>
              )}

              {result.bestFollower && (
                <div style={{ background: GREEN + "12", border: `1px solid ${GREEN}44`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 9, color: GREEN, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>BEST TRADE</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{result.bestFollower}</div>
                  <div style={{ fontSize: 10, color: "#b0b8c4" }}>{result.bestFollowerReason}</div>
                </div>
              )}
            </div>
          </div>

          <div style={{ background: "#0d1117", border: "1px solid #1e2530", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.12em", marginBottom: 10 }}>CONDITION GATES</div>
            <Gate label="A: NVDA turning up (price > prev, slope > 0)" ok={result.leaderSignal} value={result.leaderSignal ? "TURNING UP" : pctFmt(result.leaderMomentum)} />
            <Gate label={`B: Power >= 50% turning (${(result.sectorSymbols || []).join("/")})`} ok={result.sectorSignal} value={`${fmt((result.powerStrength || 0) * 100, 0)}% turning`} />
            <Gate label="C: Followers lagging leader" ok={result.lagSignal} value={`${pctFmt(result.followerAvg)} vs ${pctFmt(result.leaderMomentum)}`} />
            <Gate label="Stack reversal active" ok={result.stackReversal} value={result.stackReversal ? "ALL 3 CONFIRMED" : "INCOMPLETE"} />
            <Gate label="Market regime" ok={result.marketRegime !== "RISK-OFF"} value={result.marketRegime} />
            <div style={{ borderTop: "1px solid #1e2530", marginTop: 8, paddingTop: 8 }}>
              <Gate label="Dist T1: 3-8% = EARLY" ok={result.stage === "EARLY"} value={result.stage === "EARLY" ? `${fmt(result.distToT1, 1)}% -> ENTER AGGRESSIVE` : ""} />
              <Gate label="Dist T1: 1-3% = MID" ok={result.stage === "MID"} value={result.stage === "MID" ? `${fmt(result.distToT1, 1)}% -> ENTER NORMAL` : ""} />
              <Gate label="Dist T1: <= 1% = LATE" ok={result.stage === "LATE"} value={result.stage === "LATE" ? `${fmt(result.distToT1, 1)}% -> PROFIT/SKIP` : ""} />
            </div>
            <div style={{ borderTop: "1px solid #1e2530", marginTop: 8, paddingTop: 8 }}>
              <Gate label="Score boost" ok={result.scoreBoost > 0} value={`${result.scoreBoost > 0 ? "+" : ""}${result.scoreBoost}`} />
              <Gate label="FINAL SCORE" ok={result.score >= 75} value={`${result.score} / 100`} />
            </div>
            <div style={{ marginTop: 10, fontSize: 9, color: "#b0b8c4" }}>
              Sector: {(result.sectorSymbols || []).join(", ")} | Followers: {(result.followers || []).join(", ")}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// =====================================================
// APP
// =====================================================

export default function App({ onOpenBuilder, onOpenCreditVol, engineSetups, setupCount }) {
  // SETUPS comes from React state in main.jsx via engineSetups prop
  const SETUPS = engineSetups || {};

  const [engineOutput, setEngineOutput] = useState(null);
  const [selectedSetup, setSelectedSetup] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [wsState, setWsState] = useState(WS_STATE.DISCONNECTED);
  const [feedHealth, setFeedHealth] = useState(null);
  const autoRef = useRef(null);
  const wsRef = useRef(null);

  const addAlert = useCallback((type, msg, meta) => {
    setAlerts(prev => [{ type, msg, meta, time: ts(), id: Date.now() + Math.random() }, ...prev].slice(0, 80));
  }, []);

  // Symbols that need real slope data (evaluator-critical)
  const trendSymbols = ["NVDA", "CEG", "GEV", "BE", "NBIS", "NEBX", "CRWV", "VRT", "ETN", "POWL"];

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const polledQuotes = await fetchAllQuotes();

      // Feed poll data into the unified quote store
      updateFromPoll(polledQuotes);

      // Use merged quotes (WS + poll) when WS is connected, poll-only otherwise
      const quotes = wsState === WS_STATE.CONNECTED ? getQuotes() : polledQuotes;
      setFeedHealth(getFeedHealth());

      const calibrated = calibrateParams(quotes);

      // Fetch real slope from bars history (BQ > Polygon > cache)
      if (!USE_MOCK) {
        try {
          calibrated.trendData = await getTrendBatch(trendSymbols, POLYGON_KEY, 60);
        } catch {
          calibrated.trendData = {};
        }
      } else {
        calibrated.trendData = {};
      }

      const output = runAllSetups(quotes, calibrated, SETUPS);
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
          const name = s.kind === "pair" ? `${s.leader.symbol}/${s.follower.symbol}` : s.kind === "infra_follower" ? "BE_INFRA" : s.kind === "stack_reversal" ? "NVDA_POWER_STACK" : s.leader.symbol;
          return name === output.results[0].setup;
        });
        if (topKey) setSelectedSetup(topKey);
      }
    } catch (err) {
      addAlert("INFO", `Refresh failed: ${err.message}`, "");
    }
    setRefreshing(false);
  }, [addAlert, selectedSetup, SETUPS]);

  // WebSocket lifecycle
  useEffect(() => {
    if (USE_MOCK || !POLYGON_KEY) return;

    const symbols = getAllSymbols().filter(s => s !== "VIX"); // VIX uses index aggs, not WS
    const socket = createPolygonSocket({
      apiKey: POLYGON_KEY,
      symbols,
      onMessage: (msg) => {
        updateFromWebSocket(msg);
        setFeedHealth(getFeedHealth());
      },
      onStateChange: (newState) => {
        setWsState(newState);
        if (newState === WS_STATE.CONNECTED) {
          addAlert("REFRESH", "WebSocket connected — live feed active", `${symbols.length} symbols streaming`);
        } else if (newState === WS_STATE.UNSUPPORTED) {
          addAlert("INFO", "WebSocket not supported on current Polygon tier — using polling", "");
        }
      },
    });

    wsRef.current = socket;
    socket.connect();

    return () => {
      socket.disconnect();
      wsRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load
  useEffect(() => { refresh(); }, []);

  // Auto-refresh (polling baseline — runs regardless of WS)
  useEffect(() => {
    // When WS is connected, poll less frequently (every 2 min for baseline)
    // When WS is disconnected, poll at normal rate (every 60s)
    const interval = wsState === WS_STATE.CONNECTED ? 120000 : 60000;

    if (autoRefresh) {
      autoRef.current = setInterval(refresh, interval);
      return () => clearInterval(autoRef.current);
    } else {
      if (autoRef.current) clearInterval(autoRef.current);
    }
  }, [autoRefresh, refresh, wsState]);

  const regime = engineOutput?.marketRegime;
  const results = engineOutput?.results || [];
  const selectedResult = selectedSetup && results.find(r => {
    const s = SETUPS[selectedSetup];
    const name = s.kind === "pair" ? `${s.leader.symbol}/${s.follower.symbol}` : s.kind === "infra_follower" ? "BE_INFRA" : s.kind === "stack_reversal" ? "NVDA_POWER_STACK" : s.leader.symbol;
    return r.setup === name;
  });

  const goCount = results.filter(r => r.state === "GO").length;
  const watchCount = results.filter(r => r.state === "WATCH").length;

  return (
    <div style={{ minHeight: "100vh", background: "#060a0f", color: "#e2e8f0", fontFamily: "'JetBrains Mono','Fira Code',ui-monospace,monospace" }}>
      <style>{`
        @keyframes slideIn { from{opacity:0;transform:translateY(-5px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes glow    { 0%,100%{box-shadow:0 0 8px #22c55e33} 50%{box-shadow:0 0 22px #22c55e77} }
        @keyframes spin    { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:#1e2530;border-radius:2px}
        @media (max-width: 1024px) { .dashboard-grid { grid-template-columns: 1fr !important; } .left-panel, .right-panel { display: none !important; } .left-panel-mobile { display: flex !important; } }
        @media (min-width: 1025px) { .left-panel-mobile { display: none !important; } }
      `}</style>

      {/* HEADER BAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #1e2530" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
            TRIGGER ENGINE
          </div>
          <span style={{ fontSize: 9, color: PURPLE }}>{results.length} setups</span>
          {goCount > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: GREEN, background: GREEN + "22", padding: "2px 6px", borderRadius: 3, animation: "glow 1.4s infinite" }}>{goCount} GO</span>}
          {watchCount > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: AMBER, background: AMBER + "22", padding: "2px 6px", borderRadius: 3 }}>{watchCount} WATCH</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 9, color: SLATE }}>
          {wsState === WS_STATE.CONNECTED && <span style={{ color: GREEN, fontWeight: 700 }}>● LIVE</span>}
          {wsState === WS_STATE.UNSUPPORTED && <span>○ WS N/A</span>}
          {(() => { const ps = getProviderStatus(); return ps.bqAvailable ? <span style={{ color: CYAN, fontWeight: 700 }}>BQ</span> : null; })()}
          {lastRefresh && <span>{lastRefresh.toLocaleTimeString()}</span>}
        </div>
      </div>

      {/* 3-COLUMN DASHBOARD */}
      <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "180px 1fr 320px", height: "calc(100vh - 44px)" }}>

        {/* LEFT: Controls + Regime */}
        <div className="left-panel" style={{ borderRight: "1px solid #1e2530", padding: 12, overflowY: "auto", background: "#0a0e14" }}>
          <button onClick={refresh} disabled={refreshing}
            style={{ width: "100%", padding: 10, background: "#071a0f", border: `1px solid ${GREEN}`, borderRadius: 6, color: GREEN, fontSize: 11, fontWeight: 700, cursor: "pointer", marginBottom: 8, opacity: refreshing ? 0.5 : 1 }}>
            {refreshing ? "↻ ..." : "↻ REFRESH"}
          </button>
          <button onClick={() => setAutoRefresh(a => !a)}
            style={{ width: "100%", padding: 8, background: autoRefresh ? GREEN + "18" : "transparent", border: `1px solid ${autoRefresh ? GREEN : "#1e2530"}`, borderRadius: 6, color: autoRefresh ? GREEN : SLATE, fontSize: 9, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>
            {autoRefresh ? "AUTO: ON" : "AUTO: OFF"}
          </button>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {onOpenCreditVol && (
              <button onClick={onOpenCreditVol}
                style={{ padding: 8, background: CYAN + "12", border: `1px solid ${CYAN}44`, borderRadius: 6, color: CYAN, fontSize: 9, fontWeight: 700, cursor: "pointer" }}>
                CREDIT-VOL
              </button>
            )}
            {onOpenBuilder && (
              <button onClick={onOpenBuilder}
                style={{ padding: 8, background: PURPLE + "12", border: `1px solid ${PURPLE}44`, borderRadius: 6, color: PURPLE, fontSize: 9, fontWeight: 700, cursor: "pointer" }}>
                SETUP BUILDER
              </button>
            )}
          </div>

          {/* Compact regime */}
          {regime && (
            <div style={{ background: "#0d1117", border: "1px solid #1e2530", borderRadius: 8, padding: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 8, color: SLATE, letterSpacing: "0.1em", marginBottom: 6 }}>REGIME</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: regime.state === "RISK-ON" ? GREEN : regime.state === "RISK-OFF" ? RED : AMBER, marginBottom: 4 }}>{regime.state}</div>
              <div style={{ fontSize: 9, color: SLATE }}>VIX {fmt(regime.vix.price)} · IWM ${fmt(regime.iwm.price)}</div>
              <div style={{ height: 2, background: "#1e2530", borderRadius: 1, marginTop: 6 }}>
                <div style={{ width: `${regime.score}%`, height: "100%", background: regime.state === "RISK-ON" ? GREEN : regime.state === "RISK-OFF" ? RED : AMBER, borderRadius: 1 }} />
              </div>
            </div>
          )}

          <div style={{ fontSize: 8, color: "#1e2530", marginTop: 8 }}>
            {getAllSymbols().length} symbols · {USE_MOCK ? "MOCK" : "LIVE"}
          </div>
        </div>

        {/* MOBILE CONTROLS (hidden on desktop) */}
        <div className="left-panel-mobile" style={{ display: "none", flexWrap: "wrap", gap: 6, padding: "8px 12px", borderBottom: "1px solid #1e2530" }}>
          <button onClick={refresh} disabled={refreshing} style={{ padding: "6px 12px", background: "#071a0f", border: `1px solid ${GREEN}`, borderRadius: 6, color: GREEN, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
            {refreshing ? "↻" : "↻ REFRESH"}
          </button>
          <button onClick={() => setAutoRefresh(a => !a)} style={{ padding: "6px 10px", background: autoRefresh ? GREEN + "18" : "transparent", border: `1px solid ${autoRefresh ? GREEN : "#1e2530"}`, borderRadius: 6, color: autoRefresh ? GREEN : SLATE, fontSize: 9, fontWeight: 700, cursor: "pointer" }}>
            {autoRefresh ? "AUTO" : "OFF"}
          </button>
          {onOpenCreditVol && <button onClick={onOpenCreditVol} style={{ padding: "6px 10px", border: `1px solid ${CYAN}44`, borderRadius: 6, color: CYAN, fontSize: 9, cursor: "pointer", background: "transparent" }}>CV</button>}
          {onOpenBuilder && <button onClick={onOpenBuilder} style={{ padding: "6px 10px", border: `1px solid ${PURPLE}44`, borderRadius: 6, color: PURPLE, fontSize: 9, cursor: "pointer", background: "transparent" }}>BUILD</button>}
        </div>

        {/* CENTER: Setup Tile Grid */}
        <div style={{ padding: 12, overflowY: "auto" }}>
          {/* Compact regime for mobile */}
          <RegimePanel regime={regime} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
            {results.map(r => {
              const key = Object.keys(SETUPS).find(k => {
                const s = SETUPS[k];
                const name = s.kind === "pair" ? `${s.leader.symbol}/${s.follower.symbol}` : s.kind === "infra_follower" ? "BE_INFRA" : s.kind === "stack_reversal" ? "NVDA_POWER_STACK" : s.leader.symbol;
                return name === r.setup;
              });
              return (
                <SetupCard key={r.setup} result={r} isSelected={key === selectedSetup}
                  onSelect={() => setSelectedSetup(key)} />
              );
            })}
          </div>

          {/* Chart below grid (needs width) */}
          {selectedSetup && selectedResult && (
            <DetailCharts result={selectedResult} setupKey={selectedSetup} setups={SETUPS} />
          )}
        </div>

        {/* RIGHT: Detail + Alerts (sticky side panel) */}
        <div className="right-panel" style={{ borderLeft: "1px solid #1e2530", overflowY: "auto", background: "#0a0e14" }}>

          {/* Selected detail */}
          {selectedSetup && selectedResult ? (
            <div style={{ padding: 12 }}>
              <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.1em", marginBottom: 8 }}>
                DETAIL: {selectedResult.setup}
              </div>
              <DetailPanel result={selectedResult} setupKey={selectedSetup} setups={SETUPS} />
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: "center", color: "#1e2530", fontSize: 10 }}>
              Select a setup tile to view details
            </div>
          )}

          {/* Alerts */}
          <div style={{ padding: 12, borderTop: "1px solid #1e2530" }}>
            <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.1em", marginBottom: 8 }}>
              ALERTS {alerts.length > 0 && `· ${alerts.length}`}
            </div>
            {alerts.length === 0
              ? <div style={{ textAlign: "center", padding: "16px 0", color: "#1e2530", fontSize: 10 }}>No alerts yet</div>
              : <div style={{ maxHeight: 300, overflowY: "auto" }}>{alerts.slice(0, 30).map(a => <AlertRow key={a.id} a={a} />)}</div>
            }
          </div>
        </div>

      </div>
    </div>
  );
}
