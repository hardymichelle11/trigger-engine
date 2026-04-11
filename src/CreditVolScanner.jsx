import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  CONFIG,
  buildScannerState,
  buildRollPlan,
  buildProfitPlan,
  round2,
  safeNumber,
} from "./signalEngine.js";
import { loadPositions, savePositions } from "./lib/storage/positionStorage.js";
import { loadIncomeTracker, saveIncomeTracker, clearIncomeTracker } from "./lib/storage/incomeStorage.js";
import { getIvRankBatch } from "./lib/iv/ivAdapter.js";
import { evaluateAlerts } from "./lib/alerts/alertEngine.js";
import { sendAlerts, requestNotificationPermission } from "./lib/alerts/alertNotifier.js";
import { recordAlert, getRecentAlerts, loadAlertHistory, clearAlertHistory } from "./lib/alerts/alertHistory.js";
import { createPolygonSocket, WS_STATE } from "./lib/websocket/polygonSocket.js";
import { updateFromWebSocket, updateFromPoll, getQuotes as getFeedQuotes, getFeedHealth } from "./lib/websocket/quoteFeed.js";
import {
  filterPremiumEngine,
  filterWheelCandidates,
  filterTrapNames,
} from "./optionsWatchlist.js";
import { runDiscoveryScan, getDiscoveryPreview } from "./lib/discoveryScanner.js";
import { recordCalibrationSnapshot, markAlertsFired, getCalibrationStats } from "./lib/calibration/calibrationTracker.js";

// --------------------------------------------------
// COLORS (matching App.jsx theme)
// --------------------------------------------------

const GREEN  = "#22c55e";
const RED    = "#ef4444";
const AMBER  = "#f59e0b";
const BLUE   = "#38bdf8";
const PURPLE = "#a78bfa";
const SLATE  = "#94a3b8";
const CYAN   = "#2dd4bf";

// --------------------------------------------------
// POLYGON.IO FETCHER
// --------------------------------------------------

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;
const POLYGON_BASE = "https://api.polygon.io";

async function fetchSnapshot(symbol) {
  const url = `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.ticker || null;
}

async function fetchAllSnapshots(symbols) {
  const results = {};
  const batches = [];
  for (let i = 0; i < symbols.length; i += 5) {
    batches.push(symbols.slice(i, i + 5));
  }
  for (const batch of batches) {
    const promises = batch.map(async (sym) => {
      try {
        results[sym] = await fetchSnapshot(sym);
      } catch {
        results[sym] = null;
      }
    });
    await Promise.all(promises);
  }
  return results;
}

// --------------------------------------------------
// SYMBOL UNIVERSE (from optionsWatchlist.js)
// --------------------------------------------------

const MACRO_SYMBOLS = ["HYG", "KRE", "LQD", "VIX"];

// Credit signal tickers (sentiment, not trade vehicles)
const CREDIT_SIGNALS = ["BX", "APO", "ARCC", "OWL", "OBDC"];

// High IV trade vehicles (premium generators)
const HIGH_IV_VEHICLES = ["NBIS", "CRWV", "COIN", "NVDA", "TSLA", "MSTR", "SMCI", "AMD", "PLTR", "HOOD", "BTDR"];

// 2026 Tier 1 ETFs (premium selling + regime)
const TIER1_ETFS = ["SPY", "QQQ", "IWM", "TLT", "SLV", "GLD", "XLF", "XLE", "FXI"];

// Megacap (wheel candidates)
const MEGACAP_VEHICLES = ["AAPL", "MSFT", "AMZN", "GOOGL", "GOOG", "META"];

const ALL_SCAN_SYMBOLS = [...new Set([
  ...MACRO_SYMBOLS, ...CREDIT_SIGNALS, ...HIGH_IV_VEHICLES,
  ...TIER1_ETFS, ...MEGACAP_VEHICLES,
])];

// Name lookup for display
const SYMBOL_NAMES = {
  NBIS: "Nebius Group", CRWV: "CoreWeave", COIN: "Coinbase", NVDA: "NVIDIA",
  TSLA: "Tesla", MSTR: "MicroStrategy", SMCI: "Super Micro", AMD: "AMD",
  PLTR: "Palantir", HOOD: "Robinhood", BTDR: "Bitdeer",
  BX: "Blackstone", APO: "Apollo", ARCC: "Ares Capital", OWL: "Blue Owl", OBDC: "Blue Owl BDC",
  SPY: "S&P 500 ETF", QQQ: "QQQ Trust", IWM: "Russell 2000 ETF",
  TLT: "20Y Treasury ETF", SLV: "Silver ETF", GLD: "Gold ETF",
  XLF: "Financials ETF", XLE: "Energy ETF", FXI: "China Large-Cap ETF",
  AAPL: "Apple", MSFT: "Microsoft", AMZN: "Amazon",
  GOOGL: "Alphabet", GOOG: "Alphabet C", META: "Meta",
};

function buildMarketInputs(snapshots) {
  const get = (sym) => snapshots[sym]?.day?.c || snapshots[sym]?.prevDay?.c || 0;
  const getPrev = (sym) => snapshots[sym]?.prevDay?.c || 0;
  const getATR = (sym) => {
    const day = snapshots[sym]?.day;
    if (!day) return 1;
    const range = (day.h || 0) - (day.l || 0);
    const prevRange = (snapshots[sym]?.prevDay?.h || 0) - (snapshots[sym]?.prevDay?.l || 0);
    return prevRange > 0 ? range / prevRange : 1;
  };

  return {
    hyg: get("HYG"),
    kre: get("KRE"),
    lqd: get("LQD"),
    vix: get("VIX"),
    vixPrev: getPrev("VIX"),
    atrExpansionMultiple: getATR("VIX"),
  };
}

function classifySymbol(sym) {
  if (CREDIT_SIGNALS.includes(sym)) return "CREDIT";
  if (TIER1_ETFS.includes(sym)) return "ETF";
  if (MEGACAP_VEHICLES.includes(sym)) return "HIGH_IV";
  if (HIGH_IV_VEHICLES.includes(sym)) return "HIGH_IV";
  return "HIGH_IV";
}

function buildSetups(snapshots, ivData) {
  const setups = [];
  const nvdaChange = snapshots["NVDA"]?.todaysChangePerc || 0;
  const msftChange = snapshots["MSFT"]?.todaysChangePerc || 0;
  const bxChange = snapshots["BX"]?.todaysChangePerc || 0;
  const spyChange = snapshots["SPY"]?.todaysChangePerc || 0;

  const tradeableSymbols = [...HIGH_IV_VEHICLES, ...CREDIT_SIGNALS, ...TIER1_ETFS, ...MEGACAP_VEHICLES];
  const seen = new Set();

  for (const sym of tradeableSymbols) {
    if (seen.has(sym)) continue;
    seen.add(sym);

    const snap = snapshots[sym];
    if (!snap) continue;
    const day = snap.day || {};
    const prev = snap.prevDay || {};
    const price = day.c || prev.c || 0;
    const prevClose = prev.c || 0;
    if (price <= 0) continue;

    const range = (day.h || price) - (day.l || price);
    const prevRange = (prev.h || 0) - (prev.l || 0);
    const atrMult = prevRange > 0 ? range / prevRange : 1;
    const category = classifySymbol(sym);

    const leaderRef = category === "CREDIT" ? bxChange
      : category === "ETF" ? spyChange
      : nvdaChange;

    // IV rank: use adapter data when available, fall back to ATR estimate
    const iv = ivData?.[sym];
    const ivPercentile = (iv && iv.ivRank != null) ? iv.ivRank : estimateIVPercentile(atrMult, snap.todaysChangePerc);

    setups.push({
      symbol: sym,
      name: SYMBOL_NAMES[sym] || sym,
      category,
      price,
      prevClose,
      leaderMovePct: leaderRef,
      powerMovePct: category === "CREDIT" ? spyChange : msftChange,
      followerMovePct: snap.todaysChangePerc || 0,
      atrExpansionMultiple: round2(atrMult),
      ivPercentile,
      ivSource: iv?.source || "atr_estimate",
      ivConfidence: iv?.confidence || "low",
      distT1Pct: round2(((price * (category === "CREDIT" ? 0.97 : 0.95)) - price) / price * 100),
      nearSupport: isNearSupport(price, day.l, prev.l),
      putCallRatio: 1 + Math.random() * 0.4,  // placeholder until options data feed
      bid: 0, ask: 0,
      strikeCandidates: generateStrikes(price),
    });
  }

  return setups;
}

function estimateIVPercentile(atrMult, changePct) {
  const base = 40;
  const atrBonus = Math.min(30, (atrMult - 1) * 40);
  const moveBonus = Math.min(20, Math.abs(changePct || 0) * 3);
  return Math.round(Math.min(99, base + atrBonus + moveBonus));
}

function isNearSupport(price, dayLow, prevLow) {
  if (!dayLow && !prevLow) return false;
  const support = Math.min(dayLow || Infinity, prevLow || Infinity);
  return ((price - support) / price) < 0.02;
}

function generateStrikes(price) {
  const strikes = [];
  const step = price > 100 ? 5 : price > 50 ? 2.5 : 1;
  const start = Math.floor(price / step) * step;
  for (let i = 0; i < 8; i++) {
    strikes.push(round2(start - (i * step)));
  }
  return strikes;
}

// --------------------------------------------------
// SMALL UI COMPONENTS
// --------------------------------------------------

function SignalBadge({ signal }) {
  const colors = { GO: GREEN, WATCH: AMBER, NO_TRADE: RED };
  const color = colors[signal] || SLATE;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color, background: color + "22",
      padding: "3px 8px", borderRadius: 4, letterSpacing: "0.08em",
    }}>
      {signal}
    </span>
  );
}

function ActionBadge({ action }) {
  const colorMap = {
    SELL_PUTS: GREEN, BUY_SHARES: BLUE, MANAGE_ONLY: AMBER,
    WAIT: SLATE, WATCH: AMBER, NO_TRADE: RED,
    WAIT_FOR_STABILIZATION: RED, STOP_NEW_TRADES: RED,
    SELL_PUTS_CONSERVATIVE: AMBER,
  };
  const color = colorMap[action] || SLATE;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color, background: color + "18",
      padding: "3px 7px", borderRadius: 4, letterSpacing: "0.06em",
    }}>
      {action.replace(/_/g, " ")}
    </span>
  );
}

function StageBadge({ stage }) {
  const colors = { EARLY: GREEN, MID: CYAN, LATE: AMBER, EXHAUSTED: RED, PRE_BREAKOUT: BLUE };
  const color = colors[stage] || SLATE;
  return (
    <span style={{
      fontSize: 9, color, background: color + "18",
      padding: "3px 7px", borderRadius: 999, letterSpacing: "0.05em",
    }}>
      {stage}
    </span>
  );
}

function RiskBadge({ level }) {
  const color = level === "HIGH" ? RED : level === "MED" ? AMBER : GREEN;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color, background: color + "18",
      padding: "2px 6px", borderRadius: 4,
    }}>
      RISK: {level}
    </span>
  );
}

function ScoreRing({ score, size = 60 }) {
  const r = size * 0.39, circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 75 ? GREEN : score >= 55 ? AMBER : RED;
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e2530" strokeWidth={3} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${cx}px ${cy}px`, fill: color, fontSize: size * 0.24, fontWeight: 700, fontFamily: "monospace" }}>
        {score}
      </text>
    </svg>
  );
}

function Metric({ label, value, color }) {
  return (
    <div style={{ fontSize: 11 }}>
      <span style={{ color: SLATE }}>{label}: </span>
      <span style={{ color: color || "#d1d5db", fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}

// --------------------------------------------------
// REGIME PANEL
// --------------------------------------------------

function CreditRegimePanel({ market, tradingWindow }) {
  if (!market) return null;
  const modeColor = market.mode === "HIGH_PREMIUM_ENVIRONMENT" ? GREEN
    : market.mode === "RISK_ON" ? CYAN
    : market.mode.includes("STRESS") ? RED
    : AMBER;

  return (
    <div style={{ background: "#0d1117", border: `1px solid ${modeColor}33`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.12em" }}>CREDIT-VOL REGIME</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {tradingWindow && (
            <span style={{
              fontSize: 9, color: tradingWindow.inBestWindow ? GREEN : SLATE,
              background: tradingWindow.inBestWindow ? GREEN + "18" : "transparent",
              padding: "2px 6px", borderRadius: 4,
            }}>
              {tradingWindow.window.replace(/_/g, " ")}
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 700, color: modeColor, background: modeColor + "22", padding: "3px 8px", borderRadius: 4, letterSpacing: "0.08em" }}>
            {market.mode.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 10, color: "#d1d5db", marginBottom: 8 }}>
        Bias: <span style={{ color: modeColor, fontWeight: 700 }}>{market.bias.replace(/_/g, " ")}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, fontSize: 10, marginBottom: 8 }}>
        <div>
          <span style={{ color: SLATE }}>HYG </span>
          <span style={{ color: market.flags.hygWeak ? RED : GREEN, fontWeight: 700 }}>{market.indicators.hyg?.toFixed(2) || "—"}</span>
          {market.flags.hygWeak && <span style={{ color: RED, fontSize: 8 }}> WEAK</span>}
        </div>
        <div>
          <span style={{ color: SLATE }}>KRE </span>
          <span style={{ color: market.flags.kreWeak ? RED : GREEN, fontWeight: 700 }}>{market.indicators.kre?.toFixed(2) || "—"}</span>
          {market.flags.kreWeak && <span style={{ color: RED, fontSize: 8 }}> WEAK</span>}
        </div>
        <div>
          <span style={{ color: SLATE }}>LQD </span>
          <span style={{ color: CYAN, fontWeight: 700 }}>{market.indicators.lqd?.toFixed(2) || "—"}</span>
        </div>
        <div>
          <span style={{ color: SLATE }}>VIX </span>
          <span style={{ color: market.fearSpike ? RED : market.fearBand ? AMBER : GREEN, fontWeight: 700 }}>
            {market.indicators.vix?.toFixed(2) || "—"}
          </span>
          {market.vixRising && <span style={{ color: RED, fontSize: 8 }}> {"\u2191"}</span>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, fontSize: 9 }}>
        <span style={{ color: market.creditStress ? RED : GREEN }}>
          Credit: {market.creditStress ? "STRESS" : "OK"}
        </span>
        <span style={{ color: market.volatilityActive ? AMBER : GREEN }}>
          Vol: {market.volatilityActive ? "ACTIVE" : "CONTAINED"}
        </span>
        <span style={{ color: market.fearSpike ? RED : market.fearBand ? AMBER : GREEN }}>
          Fear: {market.fearSpike ? "SPIKE" : market.fearBand ? "ELEVATED" : "LOW"}
        </span>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ height: 3, background: "#1e2530", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${market.score}%`, height: "100%", background: modeColor, borderRadius: 2, transition: "width 0.4s" }} />
        </div>
        <div style={{ fontSize: 9, color: SLATE, marginTop: 3, textAlign: "right" }}>{market.score}/100</div>
      </div>
    </div>
  );
}

// --------------------------------------------------
// SETUP CARD
// --------------------------------------------------

function SetupCard({ card, isSelected, onSelect }) {
  const signalColor = card.signal === "GO" ? GREEN : card.signal === "WATCH" ? AMBER : RED;
  const catColor = card.category === "HIGH_IV" ? PURPLE : card.category === "CREDIT" ? CYAN : BLUE;

  return (
    <div onClick={onSelect} style={{
      background: isSelected ? "#0d1520" : "#0d1117",
      border: `1px solid ${isSelected ? signalColor + "66" : "#1e2530"}`,
      borderRadius: 10, padding: 14, cursor: "pointer",
      transition: "all 0.2s", marginBottom: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: catColor, background: catColor + "22", padding: "2px 5px", borderRadius: 3, letterSpacing: "0.1em" }}>
            {card.category}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{card.symbol}</span>
          <span style={{ fontSize: 11, color: SLATE }}>{card.name}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ScoreRing score={card.score} size={36} />
          <SignalBadge signal={card.signal} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <StageBadge stage={card.stage} />
        <ActionBadge action={card.action} />
        <RiskBadge level={card.recommendation.riskLevel} />
        {card.watchlist && (
          <>
            <span style={{ fontSize: 8, color: card.watchlist.spreadQuality?.startsWith("A") ? GREEN : SLATE, background: "#1e253044", padding: "2px 6px", borderRadius: 4 }}>
              Spread: {card.watchlist.spreadQuality}
            </span>
            <span style={{ fontSize: 8, color: card.watchlist.wheelSuit === "High" ? GREEN : card.watchlist.wheelSuit === "Low" ? RED : SLATE, background: "#1e253044", padding: "2px 6px", borderRadius: 4 }}>
              Wheel: {card.watchlist.wheelSuit}
            </span>
            {card.watchlist.tier && (
              <span style={{ fontSize: 8, color: CYAN, background: CYAN + "12", padding: "2px 6px", borderRadius: 4 }}>
                T{card.watchlist.tier}
              </span>
            )}
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11 }}>
        <Metric label="Price" value={`$${card.price}`} />
        <Metric label="IV %ile" value={`${card.metrics.ivPercentile}${card.metrics.ivSource !== "atr_estimate" ? " \u2713" : ""}`} color={card.metrics.ivPercentile >= 60 ? GREEN : SLATE} />
        <Metric label="ATR x" value={card.metrics.atrExpansionMultiple} color={card.diagnostics.atrExpanded ? GREEN : SLATE} />
        <Metric label="Put/Call" value={card.metrics.putCallRatio.toFixed(2)} />
        <Metric label="Prob" value={card.recommendation.probability} color={GREEN} />
        <Metric label="Strikes" value={card.ladder.primary && card.ladder.secondary ? `${card.ladder.secondary}/${card.ladder.primary}` : "—"} />
      </div>
    </div>
  );
}

// --------------------------------------------------
// DETAIL PANEL
// --------------------------------------------------

function DetailPanel({ card }) {
  if (!card) return null;

  const rec = card.recommendation;
  const prob = card.probability;

  return (
    <div style={{ background: "#0d1117", border: "1px solid #1e2530", borderRadius: 10, padding: 16 }}>
      {/* SECTION 12: Trade Recommendation */}
      <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.12em", marginBottom: 10 }}>
        TRADE RECOMMENDATION — {card.symbol}
      </div>

      <div style={{
        background: rec.trade === "YES" ? GREEN + "12" : RED + "12",
        border: `1px solid ${rec.trade === "YES" ? GREEN + "44" : RED + "44"}`,
        borderRadius: 8, padding: 12, marginBottom: 12,
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
          <div>
            <span style={{ color: SLATE, fontSize: 10 }}>TRADE: </span>
            <span style={{ color: rec.trade === "YES" ? GREEN : RED, fontWeight: 700 }}>{rec.trade}</span>
          </div>
          <div>
            <span style={{ color: SLATE, fontSize: 10 }}>ACTION: </span>
            <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{rec.action.replace(/_/g, " ")}</span>
          </div>
          <div>
            <span style={{ color: SLATE, fontSize: 10 }}>STRIKE: </span>
            <span style={{ color: CYAN, fontWeight: 700 }}>${rec.strike || "—"}</span>
            {rec.strikeAlt && rec.strikeAlt !== rec.strike && (
              <span style={{ color: SLATE }}> / ${rec.strikeAlt}</span>
            )}
          </div>
          <div>
            <span style={{ color: SLATE, fontSize: 10 }}>EXPIRATION: </span>
            <span style={{ color: "#e2e8f0" }}>{rec.expiration}</span>
          </div>
          <div>
            <span style={{ color: SLATE, fontSize: 10 }}>PROBABILITY: </span>
            <span style={{ color: GREEN, fontWeight: 700 }}>{rec.probability}</span>
          </div>
          <div>
            <span style={{ color: SLATE, fontSize: 10 }}>RISK: </span>
            <span style={{ color: rec.riskLevel === "HIGH" ? RED : rec.riskLevel === "MED" ? AMBER : GREEN, fontWeight: 700 }}>
              {rec.riskLevel}
            </span>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "#d1d5db" }}>{rec.reason}</div>
      </div>

      {/* Probability detail */}
      {prob && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.1em", marginBottom: 6 }}>
            PROBABILITY LAYER
            <span style={{ marginLeft: 8, color: prob.method === "monte_carlo" ? GREEN : AMBER, fontSize: 8 }}>
              {prob.method === "monte_carlo" ? `MC ${prob.paths} paths` : "erf approx"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11 }}>
            <Metric label="Above strike" value={`${(prob.probAboveStrike * 100).toFixed(1)}%`} color={prob.passesFilter ? GREEN : RED} />
            <Metric label="Touch prob" value={`${(prob.probTouch * 100).toFixed(1)}%`} color={AMBER} />
            <Metric label="Expected move" value={`$${prob.expectedMove}`} />
          </div>
          {prob.avgMaxDrawdown != null && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11, marginTop: 4 }}>
              <Metric label="Avg max DD" value={`${(prob.avgMaxDrawdown * 100).toFixed(1)}%`} color={prob.avgMaxDrawdown > 0.08 ? RED : SLATE} />
              {prob.assumptions?.annualizedIV && <Metric label="Ann. IV" value={`${(prob.assumptions.annualizedIV * 100).toFixed(0)}%`} />}
              {prob.assumptions?.dailyVol && <Metric label="Daily vol" value={`${(prob.assumptions.dailyVol * 100).toFixed(2)}%`} />}
            </div>
          )}
          {prob.distribution && (
            <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 10, color: SLATE }}>
              <span>P10: ${prob.distribution.p10}</span>
              <span>P25: ${prob.distribution.p25}</span>
              <span style={{ color: "#e2e8f0" }}>P50: ${prob.distribution.p50}</span>
              <span>P75: ${prob.distribution.p75}</span>
              <span>P90: ${prob.distribution.p90}</span>
            </div>
          )}
          {!prob.passesFilter && (
            <div style={{ fontSize: 10, color: RED, marginTop: 4 }}>
              Below {CONFIG.setup.minProbability * 100}% probability threshold — trade blocked
            </div>
          )}
        </div>
      )}

      {/* Strike ladder detail */}
      {card.ladder.primary && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.1em", marginBottom: 6 }}>PUT LADDER</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
            <div>
              <span style={{ color: SLATE }}>Safer (further OTM): </span>
              <span style={{ color: CYAN, fontWeight: 700 }}>${card.ladder.primary}</span>
              <span style={{ color: SLATE }}> ({card.ladder.pctBelowSpot?.primary}% below)</span>
            </div>
            <div>
              <span style={{ color: SLATE }}>Premium (closer): </span>
              <span style={{ color: AMBER, fontWeight: 700 }}>${card.ladder.secondary}</span>
              <span style={{ color: SLATE }}> ({card.ladder.pctBelowSpot?.secondary}% below)</span>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostics */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.1em", marginBottom: 6 }}>DIAGNOSTICS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11 }}>
          {Object.entries(card.diagnostics).map(([key, val]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: val ? GREEN : "#1e2530", boxShadow: val ? `0 0 5px ${GREEN}` : "none" }} />
              <span style={{ color: val ? "#d1fae5" : SLATE }}>{key.replace(/([A-Z])/g, " $1").trim()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Score trace — why this score */}
      {card.scoreTrace && card.scoreTrace.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.1em", marginBottom: 6 }}>SCORE TRACE — WHY THIS SCORE</div>
          <div style={{ background: "#111827", borderRadius: 6, border: "1px solid #1e2530", padding: 8 }}>
            {card.scoreTrace.map((t, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "2px 0", borderBottom: i < card.scoreTrace.length - 1 ? "1px solid #1e253066" : "none" }}>
                <span style={{ color: "#b0b8c4" }}>{t.reason}</span>
                <span style={{ color: t.pts > 0 ? GREEN : t.pts < 0 ? RED : SLATE, fontWeight: 700, fontFamily: "monospace" }}>
                  {t.pts > 0 ? "+" : ""}{t.pts}
                </span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4, paddingTop: 4, borderTop: "1px solid #1e2530" }}>
              <span style={{ color: "#e2e8f0", fontWeight: 700 }}>Total (clamped 0-100)</span>
              <span style={{ color: card.score >= 75 ? GREEN : card.score >= 55 ? AMBER : RED, fontWeight: 700, fontFamily: "monospace" }}>{card.score}</span>
            </div>
          </div>
        </div>
      )}

      {/* Chart context — entry/exit quality */}
      {card.chartContext && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.1em", marginBottom: 6 }}>
            CHART CONTEXT — ENTRY / EXIT QUALITY
            <span style={{ marginLeft: 8, color: card.chartContext.adjustments > 0 ? GREEN : card.chartContext.adjustments < 0 ? RED : SLATE, fontSize: 8 }}>
              {card.chartContext.adjustments > 0 ? "+" : ""}{card.chartContext.adjustments}pts
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11 }}>
            <Metric label="Support" value={card.chartContext.nearestSupportPct != null ? `${(card.chartContext.nearestSupportPct * 100).toFixed(1)}% below` : "—"} color={card.chartContext.nearestSupportPct != null && card.chartContext.nearestSupportPct < 0.02 ? GREEN : SLATE} />
            <Metric label="Resistance" value={card.chartContext.nearestResistancePct != null ? `${(card.chartContext.nearestResistancePct * 100).toFixed(1)}% above` : "—"} color={card.chartContext.nearestResistancePct != null && card.chartContext.nearestResistancePct < 0.02 ? RED : SLATE} />
            <Metric label="ATR" value={card.chartContext.atrExtension?.replace(/_/g, " ") || "—"} color={card.chartContext.atrExtension?.includes("OVER") ? RED : SLATE} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11, marginTop: 4 }}>
            <Metric label="Trend" value={card.chartContext.trendBias || "—"} color={card.chartContext.trendBias === "BULLISH" ? GREEN : card.chartContext.trendBias === "BEARISH" ? RED : SLATE} />
            <Metric label="Demand zone" value={card.chartContext.insideDemandZone ? "INSIDE" : "no"} color={card.chartContext.insideDemandZone ? GREEN : SLATE} />
            <Metric label="Supply zone" value={card.chartContext.insideSupplyZone ? "INSIDE" : "no"} color={card.chartContext.insideSupplyZone ? RED : SLATE} />
          </div>
          {card.chartContext.roomToTarget && (
            <div style={{ fontSize: 10, color: card.chartContext.roomToTarget.clearPath ? GREEN : AMBER, marginTop: 4 }}>
              Room to T1: {(card.chartContext.roomToTarget.distPct * 100).toFixed(1)}% — {card.chartContext.roomToTarget.clearPath ? "clear path" : `${card.chartContext.roomToTarget.resistanceLevels} resistance level(s)`}
            </div>
          )}
        </div>
      )}

      {/* Sentiment */}
      <div style={{ fontSize: 10, color: "#b0b8c4", fontStyle: "italic" }}>
        {rec.sentiment}
      </div>

      {/* Narrative */}
      <div style={{ marginTop: 8, fontSize: 11, color: "#d1d5db", lineHeight: 1.5, background: "#111827", padding: 10, borderRadius: 6, border: "1px solid #1e2530" }}>
        {card.narrative}
      </div>
    </div>
  );
}

// --------------------------------------------------
// POSITION MANAGER (for existing short puts)
// --------------------------------------------------

function PositionManager() {
  // Initialize from localStorage, recompute roll/profit plans from persisted workflow data
  const [positions, setPositions] = useState(() => {
    const stored = loadPositions();
    return stored.map(p => ({
      ...p,
      rollPlan: buildRollPlan({ creditReceived: p.credit, strike: p.strike, currentPrice: p.currentPrice }),
      profitPlan: buildProfitPlan({ creditReceived: p.credit }),
    }));
  });
  const [form, setForm] = useState({ symbol: "", strike: "", credit: "", currentPrice: "" });

  // Persist whenever positions change
  useEffect(() => { savePositions(positions); }, [positions]);

  function addPosition() {
    const strike = safeNumber(form.strike);
    const credit = safeNumber(form.credit);
    const currentPrice = safeNumber(form.currentPrice);
    if (!form.symbol || strike <= 0 || credit <= 0 || currentPrice <= 0) return;

    const rollPlan = buildRollPlan({ creditReceived: credit, strike, currentPrice });
    const profitPlan = buildProfitPlan({ creditReceived: credit });

    setPositions(prev => [...prev, {
      id: Date.now(),
      symbol: form.symbol.toUpperCase(),
      strike, credit, currentPrice,
      rollPlan, profitPlan,
    }]);
    setForm({ symbol: "", strike: "", credit: "", currentPrice: "" });
  }

  return (
    <div style={{ background: "#0d1117", border: "1px solid #1e2530", borderRadius: 10, padding: 14, marginTop: 12 }}>
      <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.12em", marginBottom: 10 }}>POSITION MANAGER — ACTIVE SHORT PUTS</div>

      {/* Add position form */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 12 }}>
        {["symbol", "strike", "credit", "currentPrice"].map(field => (
          <input key={field} placeholder={field.replace(/([A-Z])/g, " $1")}
            value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
            style={{ padding: 8, background: "#111827", color: "#f9fafb", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }} />
        ))}
        <button onClick={addPosition}
          style={{ padding: "8px 12px", background: GREEN + "18", border: `1px solid ${GREEN}`, borderRadius: 6, color: GREEN, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          ADD
        </button>
      </div>

      {/* Active positions */}
      {positions.map(pos => {
        const zoneColor = pos.rollPlan.zone === "ACTION" ? RED : pos.rollPlan.zone === "WATCH" ? AMBER : pos.rollPlan.zone === "DEFENSE" ? AMBER : GREEN;
        return (
          <div key={pos.id} style={{ background: "#111827", border: `1px solid ${zoneColor}33`, borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{pos.symbol}</span>
                <span style={{ fontSize: 11, color: SLATE }}>Short ${pos.strike} Put</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: zoneColor, background: zoneColor + "22", padding: "3px 8px", borderRadius: 4 }}>
                {pos.rollPlan.zone}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 11, marginBottom: 8 }}>
              <Metric label="Credit" value={`$${pos.credit}`} color={GREEN} />
              <Metric label="Current" value={`$${pos.currentPrice}`} />
              <Metric label="Warning" value={`$${pos.rollPlan.levels.warning}`} color={AMBER} />
            </div>

            {/* BTC targets */}
            <div style={{ fontSize: 9, color: SLATE, marginBottom: 4 }}>BUY TO CLOSE TARGETS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 11, marginBottom: 8 }}>
              <Metric label="30% profit" value={`$${pos.profitPlan.considerClose.btcPrice}`} />
              <Metric label="50% profit" value={`$${pos.profitPlan.closePosition.btcPrice}`} color={AMBER} />
              <Metric label="70% profit" value={`$${pos.profitPlan.alwaysClose.btcPrice}`} color={GREEN} />
            </div>

            <div style={{ fontSize: 10, color: "#b0b8c4" }}>{pos.rollPlan.instructions}</div>

            <button onClick={() => setPositions(prev => prev.filter(p => p.id !== pos.id))}
              style={{ marginTop: 8, padding: "4px 10px", background: "transparent", border: `1px solid ${RED}44`, borderRadius: 4, color: RED, fontSize: 10, cursor: "pointer" }}>
              Remove
            </button>
          </div>
        );
      })}

      {positions.length === 0 && (
        <div style={{ textAlign: "center", padding: "16px 0", color: "#1e2530", fontSize: 11 }}>
          No active positions — add a short put to track
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------
// INCOME TRACKER
// --------------------------------------------------

function IncomeTracker() {
  const weeklyTarget = CONFIG.income.weeklyTarget;

  // Initialize from localStorage
  const [incomeState, setIncomeState] = useState(() => loadIncomeTracker());
  const weeklyTotal = incomeState.weeklyTotal;
  const entries = incomeState.entries;
  const [amount, setAmount] = useState("");

  // Persist whenever income state changes
  useEffect(() => { saveIncomeTracker(incomeState); }, [incomeState]);

  function addEntry() {
    const val = safeNumber(amount);
    if (val <= 0) return;
    setIncomeState(prev => ({
      weeklyTotal: prev.weeklyTotal + val,
      entries: [...prev.entries, { id: Date.now(), amount: val, date: new Date().toLocaleDateString() }],
    }));
    setAmount("");
  }

  const pct = Math.min(100, (weeklyTotal / weeklyTarget) * 100);
  const barColor = pct >= 100 ? GREEN : pct >= 60 ? AMBER : RED;

  return (
    <div style={{ background: "#0d1117", border: "1px solid #1e2530", borderRadius: 10, padding: 14, marginTop: 12 }}>
      <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.12em", marginBottom: 10 }}>WEEKLY INCOME TRACKER</div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: barColor }}>${weeklyTotal.toFixed(0)}</span>
        <span style={{ fontSize: 11, color: SLATE }}>/ ${weeklyTarget} target</span>
      </div>

      <div style={{ height: 6, background: "#1e2530", borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.4s" }} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input placeholder="Premium received ($)" value={amount} onChange={e => setAmount(e.target.value)}
          style={{ flex: 1, padding: 8, background: "#111827", color: "#f9fafb", border: "1px solid #374151", borderRadius: 6, fontSize: 11 }} />
        <button onClick={addEntry}
          style={{ padding: "8px 12px", background: GREEN + "18", border: `1px solid ${GREEN}`, borderRadius: 6, color: GREEN, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          LOG
        </button>
        <button onClick={() => { setIncomeState({ weeklyTotal: 0, entries: [] }); clearIncomeTracker(); }}
          style={{ padding: "8px 12px", background: "transparent", border: `1px solid ${RED}44`, borderRadius: 6, color: RED, fontSize: 11, cursor: "pointer" }}>
          RESET
        </button>
      </div>

      {entries.map(e => (
        <div key={e.id} style={{ fontSize: 10, color: "#b0b8c4", padding: "3px 0" }}>
          {e.date}: <span style={{ color: GREEN }}>+${e.amount}</span>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------
// MAIN COMPONENT
// --------------------------------------------------

export default function CreditVolScanner({ onBack }) {
  const [scannerState, setScannerState] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [error, setError] = useState(null);
  const [scanFilter, setScanFilter] = useState("ALL");
  const [alertLog, setAlertLog] = useState(() => loadAlertHistory());
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [discoveryMode, setDiscoveryMode] = useState(false);
  const [discoveryState, setDiscoveryState] = useState(null);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [wsState, setWsState] = useState(WS_STATE.DISCONNECTED);
  const [feedHealth, setFeedHealth] = useState(null);
  const autoRef = useRef(null);
  const wsRef = useRef(null);

  // Request notification permission when alerts are enabled
  useEffect(() => {
    if (alertsEnabled) requestNotificationPermission();
  }, [alertsEnabled]);

  // WebSocket lifecycle for credit-vol scanner symbols
  useEffect(() => {
    if (!POLYGON_KEY) return;

    const symbols = [...new Set([...HIGH_IV_VEHICLES, ...CREDIT_SIGNALS, ...TIER1_ETFS, ...MEGACAP_VEHICLES])];
    const socket = createPolygonSocket({
      apiKey: POLYGON_KEY,
      symbols,
      onMessage: (msg) => {
        updateFromWebSocket(msg);
        setFeedHealth(getFeedHealth());
      },
      onStateChange: setWsState,
    });

    wsRef.current = socket;
    socket.connect();
    return () => { socket.disconnect(); wsRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const snapshots = await fetchAllSnapshots(ALL_SCAN_SYMBOLS);

      // Feed poll data into the unified quote store for WS merging
      updateFromPoll(snapshots);
      setFeedHealth(getFeedHealth());

      const marketInputs = buildMarketInputs(snapshots);

      // Fetch IV rank data through adapter (cache-aware, graceful fallback)
      let ivData = {};
      try {
        const tradeableSymbols = [...new Set([...HIGH_IV_VEHICLES, ...CREDIT_SIGNALS, ...TIER1_ETFS, ...MEGACAP_VEHICLES])];
        ivData = await getIvRankBatch(tradeableSymbols, {
          apiKey: POLYGON_KEY,
          atrExpansionMultiple: 1, // fallback params filled per-symbol in buildSetups
        });
      } catch {
        // IV adapter failure is non-fatal — scoring degrades gracefully
      }

      const setups = buildSetups(snapshots, ivData);
      const state = buildScannerState({ marketInputs, setups });
      setScannerState(state);
      setLastRefresh(new Date());

      // Evaluate alerts on scanner results
      let alertedSymbols = [];
      if (alertsEnabled && state.cards.length > 0) {
        const newAlerts = evaluateAlerts(state.cards, {}, getRecentAlerts());
        if (newAlerts.length > 0) {
          sendAlerts(newAlerts, { browser: true, console: true });
          newAlerts.forEach(a => recordAlert(a));
          setAlertLog(loadAlertHistory());
          alertedSymbols = newAlerts.map(a => a.card.symbol);
        }
      }

      // Record calibration observations (lightweight, deduped)
      if (state.cards.length > 0) {
        recordCalibrationSnapshot(state.cards);
        if (alertedSymbols.length > 0) markAlertsFired(alertedSymbols);
      }

      if (!selectedCard && state.cards.length > 0) {
        setSelectedCard(state.cards[0].symbol);
      }
    } catch (err) {
      setError(err.message);
    }
    setRefreshing(false);
  }, [selectedCard, alertsEnabled]);

  // Discovery scan — runs broader watchlist through same engine
  const runDiscovery = useCallback(async () => {
    if (!POLYGON_KEY) return;
    setDiscoveryLoading(true);
    try {
      const marketInputs = scannerState?.market?.indicators || { hyg: 80, kre: 70, lqd: 105, vix: 20, vixPrev: 20, atrExpansionMultiple: 1 };
      const result = await runDiscoveryScan(marketInputs, POLYGON_KEY, { maxSymbols: 20 });
      setDiscoveryState(result);
    } catch (err) {
      console.warn("Discovery scan failed:", err.message);
    }
    setDiscoveryLoading(false);
  }, [scannerState]);

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (autoRefresh) {
      autoRef.current = setInterval(refresh, 60000);
      return () => clearInterval(autoRef.current);
    } else {
      if (autoRef.current) clearInterval(autoRef.current);
    }
  }, [autoRefresh, refresh]);

  const allCards = scannerState?.cards || [];
  const market = scannerState?.market;
  const tradingWindow = scannerState?.tradingWindow;
  const summary = scannerState?.summary;

  // Watchlist-aware scan filters
  const premiumSymbols = useMemo(() => new Set(filterPremiumEngine().map(w => w.symbol)), []);
  const wheelSymbols = useMemo(() => new Set(filterWheelCandidates().map(w => w.symbol)), []);
  const trapSymbols = useMemo(() => new Set(filterTrapNames().map(w => w.symbol)), []);

  const cards = useMemo(() => {
    if (scanFilter === "ALL") return allCards;
    if (scanFilter === "PREMIUM") return allCards.filter(c => premiumSymbols.has(c.symbol));
    if (scanFilter === "WHEEL") return allCards.filter(c => wheelSymbols.has(c.symbol));
    if (scanFilter === "HIGH_IV") return allCards.filter(c => c.category === "HIGH_IV");
    if (scanFilter === "CREDIT") return allCards.filter(c => c.category === "CREDIT");
    if (scanFilter === "ETF") return allCards.filter(c => c.category === "ETF");
    if (scanFilter === "TRAPS") return allCards.filter(c => trapSymbols.has(c.symbol));
    return allCards;
  }, [allCards, scanFilter, premiumSymbols, wheelSymbols, trapSymbols]);

  const detail = selectedCard ? allCards.find(c => c.symbol === selectedCard) : null;

  return (
    <div style={{ minHeight: "100vh", background: "#060a0f", color: "#e2e8f0", fontFamily: "'JetBrains Mono','Fira Code',ui-monospace,monospace", padding: 16 }}>
      <style>{`
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes glow    { 0%,100%{box-shadow:0 0 8px #22c55e33} 50%{box-shadow:0 0 22px #22c55e77} }
        @keyframes spin    { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        ::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:#1e2530;border-radius:2px}
      `}</style>

      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.18em", marginBottom: 3 }}>CREDIT-VOLATILITY OPTIONS ENGINE</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.03em" }}>
              PREMIUM SCANNER <span style={{ fontSize: 10, color: PURPLE, fontWeight: 400 }}>{cards.length} setups</span>
            </div>
            <div style={{ fontSize: 9, color: SLATE, marginTop: 2 }}>
              Sell fear, not follow it — ${CONFIG.income.weeklyTarget}/week target
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {summary?.go > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: GREEN + "22", padding: "4px 8px", borderRadius: 4, animation: "glow 1.4s infinite" }}>
                {summary.go} GO
              </span>
            )}
            {summary?.watch > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: AMBER, background: AMBER + "22", padding: "4px 8px", borderRadius: 4 }}>
                {summary.watch} WATCH
              </span>
            )}
          </div>
        </div>

        {/* CONTROLS */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={refresh} disabled={refreshing}
            style={{ flex: 1, padding: 11, background: "#071a0f", border: `1px solid ${GREEN}`, borderRadius: 8, color: GREEN, fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: "0.07em", opacity: refreshing ? 0.5 : 1 }}>
            {refreshing ? "\u21BB SCANNING..." : "\u21BB SCAN NOW"}
          </button>
          <button onClick={() => setAutoRefresh(a => !a)}
            style={{ padding: "11px 16px", background: autoRefresh ? GREEN + "18" : "transparent", border: `1px solid ${autoRefresh ? GREEN : "#1e2530"}`, borderRadius: 8, color: autoRefresh ? GREEN : SLATE, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.07em" }}>
            {autoRefresh ? "AUTO: ON" : "AUTO: OFF"}
          </button>
          <button onClick={() => setAlertsEnabled(a => !a)}
            style={{ padding: "11px 16px", background: alertsEnabled ? AMBER + "18" : "transparent", border: `1px solid ${alertsEnabled ? AMBER : "#1e2530"}`, borderRadius: 8, color: alertsEnabled ? AMBER : SLATE, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.07em" }}>
            {alertsEnabled ? `ALERTS: ON (${alertLog.length})` : "ALERTS: OFF"}
          </button>
          {onBack && (
            <button onClick={onBack}
              style={{ padding: "11px 16px", background: PURPLE + "18", border: `1px solid ${PURPLE}`, borderRadius: 8, color: PURPLE, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.07em" }}>
              TRIGGER ENGINE
            </button>
          )}
        </div>
        {lastRefresh && (
          <div style={{ fontSize: 9, color: SLATE, marginBottom: 12, textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 10 }}>
            {wsState !== WS_STATE.DISCONNECTED && (
              <span style={{
                color: wsState === WS_STATE.CONNECTED ? GREEN : wsState === WS_STATE.RECONNECTING ? AMBER : SLATE,
                fontWeight: 700,
              }}>
                {wsState === WS_STATE.CONNECTED ? "\u25CF LIVE" : wsState === WS_STATE.UNSUPPORTED ? "\u25CB WS N/A" : `\u25CB ${wsState}`}
                {feedHealth && wsState === WS_STATE.CONNECTED && ` (${feedHealth.websocket}ws/${feedHealth.poll}poll)`}
              </span>
            )}
            <span>
              Last scan: {lastRefresh.toLocaleTimeString()} {autoRefresh && "\u00B7 auto every 60s"}
            </span>
          </div>
        )}
        {error && (
          <div style={{ fontSize: 11, color: RED, marginBottom: 12, padding: 10, background: RED + "12", borderRadius: 6, border: `1px solid ${RED}33` }}>
            {error}
          </div>
        )}

        {/* REGIME */}
        <CreditRegimePanel market={market} tradingWindow={tradingWindow} />

        {/* SCAN FILTERS */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {[
            { key: "ALL",     label: "ALL",           color: SLATE },
            { key: "PREMIUM", label: "PREMIUM ENGINE", color: GREEN },
            { key: "WHEEL",   label: "WHEEL",          color: CYAN },
            { key: "HIGH_IV", label: "HIGH IV",        color: PURPLE },
            { key: "CREDIT",  label: "CREDIT",         color: BLUE },
            { key: "ETF",     label: "ETF",            color: AMBER },
            { key: "TRAPS",   label: "TRAPS",          color: RED },
          ].map(f => (
            <button key={f.key} onClick={() => setScanFilter(f.key)}
              style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 9, fontWeight: 700,
                letterSpacing: "0.06em", cursor: "pointer",
                background: scanFilter === f.key ? f.color + "22" : "transparent",
                border: `1px solid ${scanFilter === f.key ? f.color : "#1e2530"}`,
                color: scanFilter === f.key ? f.color : SLATE,
              }}>
              {f.label}
            </button>
          ))}
          <button onClick={() => { setDiscoveryMode(m => !m); if (!discoveryState) runDiscovery(); }}
            disabled={discoveryLoading}
            style={{
              padding: "5px 10px", borderRadius: 6, fontSize: 9, fontWeight: 700,
              letterSpacing: "0.06em", cursor: "pointer", marginLeft: 8,
              background: discoveryMode ? "#f59e0b22" : "transparent",
              border: `1px solid ${discoveryMode ? AMBER : "#1e2530"}`,
              color: discoveryMode ? AMBER : SLATE,
              opacity: discoveryLoading ? 0.5 : 1,
            }}>
            {discoveryLoading ? "SCANNING..." : discoveryMode ? `DISCOVERY (${discoveryState?.cards?.length || 0})` : "DISCOVERY"}
          </button>
        </div>

        {/* SETUP CARDS */}
        <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.12em", marginBottom: 8 }}>
          {scanFilter === "ALL"
            ? `SETUPS (${allCards.length} total) — ${allCards.filter(c => c.category === "HIGH_IV").length} high IV + ${allCards.filter(c => c.category === "CREDIT").length} credit + ${allCards.filter(c => c.category === "ETF").length} ETF`
            : `${scanFilter} FILTER — ${cards.length} of ${allCards.length} setups`
          }
        </div>
        {cards.map(card => (
          <SetupCard key={card.symbol} card={card} isSelected={selectedCard === card.symbol}
            onSelect={() => setSelectedCard(card.symbol)} />
        ))}

        {cards.length === 0 && !refreshing && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#1e2530", fontSize: 11 }}>
            Click Scan Now to begin
          </div>
        )}

        {/* DISCOVERY RESULTS */}
        {discoveryMode && discoveryState && discoveryState.cards.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: AMBER, letterSpacing: "0.12em" }}>
                DISCOVERY — {discoveryState.cards.length} of {discoveryState.candidates} candidates scored
              </div>
              <button onClick={runDiscovery} disabled={discoveryLoading}
                style={{ padding: "3px 8px", borderRadius: 4, border: `1px solid ${AMBER}44`, background: "transparent", color: AMBER, fontSize: 9, cursor: "pointer" }}>
                {discoveryLoading ? "..." : "RESCAN"}
              </button>
            </div>
            {discoveryState.cards.slice(0, 10).map(card => (
              <div key={card.symbol} style={{
                background: "#0d1117", border: "1px solid #1e2530", borderRadius: 8, padding: 10, marginBottom: 6,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{card.symbol}</span>
                  <span style={{ fontSize: 10, color: SLATE }}>${card.price}</span>
                  {card.discoveryMeta && (
                    <>
                      <span style={{ fontSize: 8, color: SLATE, background: "#1e253044", padding: "1px 5px", borderRadius: 3 }}>
                        #{card.discoveryMeta.histRank}
                      </span>
                      <span style={{ fontSize: 8, color: card.discoveryMeta.spreadQuality?.startsWith("A") ? GREEN : SLATE, background: "#1e253044", padding: "1px 5px", borderRadius: 3 }}>
                        {card.discoveryMeta.spreadQuality}
                      </span>
                      <span style={{ fontSize: 8, color: card.discoveryMeta.wheelSuit === "High" ? GREEN : SLATE, background: "#1e253044", padding: "1px 5px", borderRadius: 3 }}>
                        {card.discoveryMeta.wheelSuit}
                      </span>
                    </>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: card.score >= 75 ? GREEN : card.score >= 55 ? AMBER : SLATE }}>{card.score}</span>
                  <span style={{ fontSize: 9, color: card.signal === "GO" ? GREEN : card.signal === "WATCH" ? AMBER : RED, fontWeight: 700 }}>{card.signal}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {discoveryMode && (!discoveryState || discoveryState.cards.length === 0) && !discoveryLoading && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#1e2530", fontSize: 11 }}>
            No discovery candidates scored yet — click RESCAN
          </div>
        )}

        {/* DETAIL */}
        {detail && (
          <div style={{ marginTop: 16 }}>
            <DetailPanel card={detail} />
          </div>
        )}

        {/* POSITION MANAGER */}
        <PositionManager />

        {/* INCOME TRACKER */}
        <IncomeTracker />

        {/* ALERT LOG */}
        {alertLog.length > 0 && (
          <div style={{ background: "#0d1117", border: "1px solid #1e2530", borderRadius: 10, padding: 14, marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: SLATE, letterSpacing: "0.12em" }}>
                ALERT HISTORY ({alertLog.length})
              </div>
              <button onClick={() => { clearAlertHistory(); setAlertLog([]); }}
                style={{ padding: "3px 8px", background: "transparent", border: `1px solid ${RED}44`, borderRadius: 4, color: RED, fontSize: 9, cursor: "pointer" }}>
                CLEAR
              </button>
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {alertLog.slice(0, 20).map((a, i) => {
                const pColor = a.priority === "high" ? GREEN : a.priority === "medium" ? AMBER : SLATE;
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #1e253044", fontSize: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: pColor, boxShadow: `0 0 4px ${pColor}` }} />
                      <span style={{ fontWeight: 700, color: "#e2e8f0" }}>{a.symbol}</span>
                      <span style={{ color: SLATE }}>{a.action}</span>
                      <span style={{ color: pColor, fontSize: 9 }}>score {a.score}</span>
                      {a.probability && <span style={{ color: GREEN, fontSize: 9 }}>prob {(a.probability * 100).toFixed(0)}%</span>}
                    </div>
                    <span style={{ color: SLATE, fontSize: 9 }}>{a.dateStr}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CALIBRATION STATUS */}
        {(() => {
          const calStats = getCalibrationStats();
          if (calStats.total === 0) return null;
          return (
            <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 12, fontSize: 9, color: SLATE }}>
              <span>CAL: {calStats.total} obs</span>
              <span>ATR Penalty: <span style={{ color: calStats.pctAtrPenalty > 0.7 ? RED : calStats.pctAtrPenalty > 0.5 ? AMBER : GREEN }}>{(calStats.pctAtrPenalty * 100).toFixed(0)}%</span></span>
              <span>Bonus: <span style={{ color: calStats.pctPositiveBonus < 0.1 ? RED : calStats.pctPositiveBonus < 0.2 ? AMBER : GREEN }}>{(calStats.pctPositiveBonus * 100).toFixed(0)}%</span></span>
              <span>Avg {"\u0394"}: <span style={{ color: calStats.avgDelta > 0 ? GREEN : calStats.avgDelta < -5 ? RED : SLATE }}>{calStats.avgDelta > 0 ? "+" : ""}{calStats.avgDelta}</span></span>
              {calStats.reviewed > 0 && <span>Reviewed: {calStats.reviewed}</span>}
            </div>
          );
        })()}

        <div style={{ textAlign: "center", fontSize: 9, color: "#1e2530", marginTop: 8 }}>
          Credit-vol engine · {ALL_SCAN_SYMBOLS.length} symbols · HYG+KRE+VIX regime · sell premium · not financial advice
        </div>
      </div>
    </div>
  );
}
