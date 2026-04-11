// =====================================================
// POSITION STORAGE — localStorage adapter for short put positions
// =====================================================
// Schema v2: full position economics
// Persists user-entered trade data. Computed fields (breakeven,
// ROC, P&L, roll plans) are derived at runtime.
// =====================================================

const STORAGE_KEY = "creditVol_positions";
const SCHEMA_VERSION = 2;

// Required fields for validation
const REQUIRED = ["symbol", "strike", "credit"];

/**
 * Load positions from localStorage.
 * Handles v1 → v2 migration automatically.
 */
export function loadPositions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const stored = JSON.parse(raw);
    if (!stored || !Array.isArray(stored.positions)) return [];

    // v1 → v2 migration: add default values for new fields
    return stored.positions
      .filter(p => p && typeof p.symbol === "string" && p.symbol.length > 0)
      .map(p => ({
        id: p.id,
        symbol: (p.symbol || "").toUpperCase(),
        strategy: p.strategy || "short_put",
        strike: Number(p.strike) || 0,
        expiry: p.expiry || "",
        contracts: Number(p.contracts) || 1,
        entryCredit: Number(p.entryCredit ?? p.credit) || 0,
        exitDebit: Number(p.exitDebit) || 0,
        rollCredits: Number(p.rollCredits) || 0,
        rollDebits: Number(p.rollDebits) || 0,
        fees: Number(p.fees) || 0,
        currentPrice: Number(p.currentPrice) || 0,
        currentOptionPrice: Number(p.currentOptionPrice) || 0,
        status: p.status || "open",
        notes: p.notes || "",
        openedAt: p.openedAt || p.id,
      }));
  } catch {
    return [];
  }
}

/**
 * Save positions to localStorage.
 */
export function savePositions(positions) {
  try {
    const toStore = (positions || []).map(p => ({
      id: p.id,
      symbol: p.symbol,
      strategy: p.strategy || "short_put",
      strike: p.strike,
      expiry: p.expiry || "",
      contracts: p.contracts || 1,
      entryCredit: p.entryCredit,
      exitDebit: p.exitDebit || 0,
      rollCredits: p.rollCredits || 0,
      rollDebits: p.rollDebits || 0,
      fees: p.fees || 0,
      currentPrice: p.currentPrice,
      currentOptionPrice: p.currentOptionPrice || 0,
      status: p.status || "open",
      notes: p.notes || "",
      openedAt: p.openedAt || p.id,
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      _version: SCHEMA_VERSION,
      _savedAt: new Date().toISOString(),
      positions: toStore,
    }));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Clear all stored positions.
 */
export function clearPositions() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// --------------------------------------------------
// POSITION ECONOMICS (derived, not stored)
// --------------------------------------------------

/**
 * Compute position economics from stored trade data.
 * @param {object} pos — position record
 * @returns {object} economics
 */
export function computeEconomics(pos) {
  const contracts = pos.contracts || 1;
  const multiplier = 100; // options multiplier

  // Net premium per share
  const netPremiumPerShare = (pos.entryCredit || 0) - (pos.exitDebit || 0)
    + (pos.rollCredits || 0) - (pos.rollDebits || 0)
    - ((pos.fees || 0) / (contracts * multiplier));

  // Net premium total
  const netPremium = netPremiumPerShare * contracts * multiplier;

  // Breakeven
  const breakeven = pos.strike - netPremiumPerShare;

  // Return on capital (max risk = strike - credit, per share)
  const maxRiskPerShare = pos.strike - netPremiumPerShare;
  const roc = maxRiskPerShare > 0 ? netPremiumPerShare / maxRiskPerShare : 0;

  // Current P&L
  const currentOptionPrice = pos.currentOptionPrice || 0;
  const unrealizedPnlPerShare = pos.status === "open"
    ? netPremiumPerShare - currentOptionPrice  // if you BTC now
    : 0;
  const unrealizedPnl = unrealizedPnlPerShare * contracts * multiplier;

  const realizedPnl = pos.status === "closed"
    ? netPremium
    : 0;

  // Profit percentage (of credit received)
  const profitPct = pos.entryCredit > 0 && pos.status === "open"
    ? (pos.entryCredit - currentOptionPrice) / pos.entryCredit
    : pos.status === "closed" ? 1 : 0;

  // Days to expiry
  let dte = null;
  if (pos.expiry) {
    const expiryDate = new Date(pos.expiry + "T16:00:00");
    const now = new Date();
    dte = Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)));
  }

  return {
    netPremiumPerShare: _r2(netPremiumPerShare),
    netPremium: _r2(netPremium),
    breakeven: _r2(breakeven),
    roc: _r4(roc),
    unrealizedPnl: _r2(unrealizedPnl),
    realizedPnl: _r2(realizedPnl),
    profitPct: _r4(profitPct),
    maxRiskPerShare: _r2(maxRiskPerShare),
    maxRiskTotal: _r2(maxRiskPerShare * contracts * multiplier),
    dte,
  };
}

function _r2(n) { return Math.round(n * 100) / 100; }
function _r4(n) { return Math.round(n * 10000) / 10000; }
