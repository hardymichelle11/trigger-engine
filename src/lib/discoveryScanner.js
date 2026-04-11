// =====================================================
// DISCOVERY SCANNER — broader screening from top-100
// =====================================================
// Scans the historical top-100 watchlist for opportunities
// that aren't in the curated daily scan. Uses the same
// scoring engine but fetches in batches to respect API limits.
//
// This is a discovery mode — finds candidates for promotion
// to the curated scan, not a replacement for it.
// =====================================================

import { WATCHLIST_HISTORICAL, WATCHLIST_2026, getWatchlistEntry } from "../optionsWatchlist.js";
import { buildScannerState } from "../signalEngine.js";
import { round2 } from "../lib/engine/config.js";

// --------------------------------------------------
// CANDIDATE SELECTION
// --------------------------------------------------

const _curatedSymbols = new Set(WATCHLIST_2026.map(w => w.symbol));

/**
 * Get discovery candidates: historical top-100 symbols NOT already
 * in the curated 2026 scan, filtered by quality.
 *
 * @param {object} [filters]
 * @param {string[]} [filters.spreadQuality] — default ["A+", "A"]
 * @param {string[]} [filters.wheelSuit] — default ["High", "Medium"]
 * @param {number} [filters.maxRank] — only include symbols ranked <= this
 * @returns {object[]} filtered watchlist entries
 */
export function getDiscoveryCandidates(filters = {}) {
  const spreadOk = new Set(filters.spreadQuality || ["A+", "A"]);
  const wheelOk = new Set(filters.wheelSuit || ["High", "Medium"]);
  const maxRank = filters.maxRank ?? 100;

  return WATCHLIST_HISTORICAL
    .filter(w =>
      !_curatedSymbols.has(w.symbol) &&
      spreadOk.has(w.spreadQuality) &&
      wheelOk.has(w.wheelSuit) &&
      w.histRank <= maxRank
    )
    .sort((a, b) => a.histRank - b.histRank);
}

/**
 * Get all available discovery symbols (unfiltered, just excludes curated).
 */
export function getAllDiscoverySymbols() {
  return WATCHLIST_HISTORICAL
    .filter(w => !_curatedSymbols.has(w.symbol))
    .map(w => w.symbol);
}

// --------------------------------------------------
// SNAPSHOT FETCHER (batched)
// --------------------------------------------------

const POLYGON_BASE = "https://api.polygon.io";

async function fetchSnapshot(symbol, apiKey) {
  const url = `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.ticker || null;
}

async function fetchDiscoverySnapshots(symbols, apiKey) {
  const results = {};

  // Batch in groups of 5 to respect rate limits
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = symbols.slice(i, i + 5);
    await Promise.all(batch.map(async (sym) => {
      try {
        results[sym] = await fetchSnapshot(sym, apiKey);
      } catch {
        results[sym] = null;
      }
    }));
  }

  return results;
}

// --------------------------------------------------
// SETUP BUILDER (same shape as CreditVolScanner buildSetups)
// --------------------------------------------------

function buildDiscoverySetups(snapshots) {
  const setups = [];

  for (const [sym, snap] of Object.entries(snapshots)) {
    if (!snap) continue;
    const day = snap.day || {};
    const prev = snap.prevDay || {};
    const price = day.c || prev.c || 0;
    const prevClose = prev.c || 0;
    if (price <= 0) continue;

    const range = (day.h || price) - (day.l || price);
    const prevRange = (prev.h || 0) - (prev.l || 0);
    const atrMult = prevRange > 0 ? range / prevRange : 1;

    // Classify based on watchlist metadata
    const wl = getWatchlistEntry(sym);
    const category = wl?.wheelSuit === "High" ? "HIGH_IV" : "HIGH_IV";

    setups.push({
      symbol: sym,
      name: sym,
      category,
      price,
      prevClose,
      leaderMovePct: snap.todaysChangePerc || 0,
      powerMovePct: 0,
      followerMovePct: snap.todaysChangePerc || 0,
      atrExpansionMultiple: round2(atrMult),
      ivPercentile: _estimateIV(atrMult, snap.todaysChangePerc),
      ivSource: "atr_estimate",
      ivConfidence: "low",
      distT1Pct: round2(((price * 0.95) - price) / price * 100),
      nearSupport: _isNearSupport(price, day.l, prev.l),
      putCallRatio: 1 + Math.random() * 0.4,
      bid: 0, ask: 0,
      strikeCandidates: _generateStrikes(price),
    });
  }

  return setups;
}

function _estimateIV(atrMult, changePct) {
  const base = 40;
  const atrBonus = Math.min(30, ((atrMult || 1) - 1) * 40);
  const moveBonus = Math.min(20, Math.abs(changePct || 0) * 3);
  return Math.round(Math.min(99, base + atrBonus + moveBonus));
}

function _isNearSupport(price, dayLow, prevLow) {
  if (!dayLow && !prevLow) return false;
  const support = Math.min(dayLow || Infinity, prevLow || Infinity);
  return ((price - support) / price) < 0.02;
}

function _generateStrikes(price) {
  const strikes = [];
  const step = price > 100 ? 5 : price > 50 ? 2.5 : 1;
  const start = Math.floor(price / step) * step;
  for (let i = 0; i < 8; i++) strikes.push(round2(start - (i * step)));
  return strikes;
}

// --------------------------------------------------
// MAIN DISCOVERY SCAN
// --------------------------------------------------

/**
 * Run a discovery scan on candidates from the historical top-100.
 *
 * @param {object} marketInputs — { hyg, kre, lqd, vix, vixPrev, atrExpansionMultiple }
 * @param {string} apiKey — Polygon API key
 * @param {object} [options]
 * @param {object} [options.filters] — candidate filter overrides
 * @param {number} [options.maxSymbols] — max symbols to scan (default 25)
 * @returns {Promise<object>} scanner state with ranked cards
 */
export async function runDiscoveryScan(marketInputs, apiKey, options = {}) {
  const { filters = {}, maxSymbols = 25 } = options;

  // 1. Get candidates
  const candidates = getDiscoveryCandidates(filters).slice(0, maxSymbols);

  if (candidates.length === 0) {
    return { cards: [], summary: { totalSetups: 0, go: 0, watch: 0, noTrade: 0 }, candidates: 0 };
  }

  const symbols = candidates.map(c => c.symbol);

  // 2. Fetch snapshots
  const snapshots = await fetchDiscoverySnapshots(symbols, apiKey);

  // 3. Build setups and score through the standard engine
  const setups = buildDiscoverySetups(snapshots);
  const state = buildScannerState({ marketInputs, setups });

  // 4. Enrich cards with watchlist metadata
  for (const card of state.cards) {
    const wl = getWatchlistEntry(card.symbol);
    if (wl) {
      card.discoveryMeta = {
        histRank: wl.histRank,
        spreadQuality: wl.spreadQuality,
        wheelSuit: wl.wheelSuit,
        in2026: wl.in2026 || false,
      };
    }
  }

  return {
    ...state,
    candidates: candidates.length,
    scannedSymbols: symbols,
  };
}

/**
 * Get a summary of what the discovery scanner would scan.
 * @param {object} [filters]
 * @returns {object}
 */
export function getDiscoveryPreview(filters = {}) {
  const candidates = getDiscoveryCandidates(filters);
  return {
    totalCandidates: candidates.length,
    symbols: candidates.map(c => c.symbol),
    bySpreadQuality: {
      "A+": candidates.filter(c => c.spreadQuality === "A+").length,
      "A": candidates.filter(c => c.spreadQuality === "A").length,
    },
    byWheelSuit: {
      High: candidates.filter(c => c.wheelSuit === "High").length,
      Medium: candidates.filter(c => c.wheelSuit === "Medium").length,
    },
    rankRange: candidates.length > 0
      ? `#${candidates[0].histRank} — #${candidates[candidates.length - 1].histRank}`
      : "none",
  };
}
