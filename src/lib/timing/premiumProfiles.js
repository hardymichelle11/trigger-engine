// =====================================================
// PREMIUM PROFILES — historical intraday premium data
// =====================================================
// Stores and queries historical premium profiles by
// symbol, setup type, regime, DTE bucket, moneyness bucket.
// localStorage-backed with in-memory fallback.
//
// Seed profiles provide initial best-window estimates.
// Real data replaces seeds as observations accumulate.
// =====================================================

const STORAGE_KEY = "premium_profiles";
const MAX_OBSERVATIONS = 10000;

const _memStore = {};
const _storage = {
  getItem(key) { if (typeof localStorage !== "undefined") return localStorage.getItem(key); return _memStore[key] || null; },
  setItem(key, value) { if (typeof localStorage !== "undefined") { localStorage.setItem(key, value); return; } _memStore[key] = value; },
  removeItem(key) { if (typeof localStorage !== "undefined") { localStorage.removeItem(key); return; } delete _memStore[key]; },
};

// --------------------------------------------------
// SEED PROFILES — initial best-window estimates
// --------------------------------------------------
// Based on general market behavior patterns.
// Will be overridden by real observations over time.

const SEED_BEST_WINDOWS = {
  // Symbol-specific windows (minuteOfDay ranges)
  bySymbol: {
    NBIS:  { start: 605, end: 640, label: "10:05-10:40 AM" },   // early mover
    NEBX:  { start: 605, end: 640, label: "10:05-10:40 AM" },   // follows NBIS
    CRWV:  { start: 832, end: 888, label: "1:52-2:48 PM" },     // volatile pullback premium
    NVDA:  { start: 840, end: 900, label: "2:00-3:00 PM" },     // standard late-day
    TSLA:  { start: 840, end: 900, label: "2:00-3:00 PM" },
    AMD:   { start: 840, end: 900, label: "2:00-3:00 PM" },
    COIN:  { start: 600, end: 660, label: "10:00-11:00 AM" },   // crypto-correlated volatility
    SPY:   { start: 840, end: 930, label: "2:00-3:30 PM" },
    QQQ:   { start: 840, end: 930, label: "2:00-3:30 PM" },
    IWM:   { start: 840, end: 930, label: "2:00-3:30 PM" },
    CF:    { start: 860, end: 910, label: "2:20-3:10 PM" },     // range near support
    OXY:   { start: 840, end: 900, label: "2:00-3:00 PM" },
    MOS:   { start: 840, end: 900, label: "2:00-3:00 PM" },
    JEPI:  { start: 840, end: 900, label: "2:00-3:00 PM" },     // low premium, rarely worth it
    JEPQ:  { start: 840, end: 900, label: "2:00-3:00 PM" },
    BX:    { start: 840, end: 900, label: "2:00-3:00 PM" },
    ARCC:  { start: 840, end: 900, label: "2:00-3:00 PM" },
  },
  // Setup-type windows
  bySetupType: {
    MOMENTUM: { start: 840, end: 900, label: "2:00-3:00 PM" },
    RANGE:    { start: 860, end: 930, label: "2:20-3:30 PM" },
    HYBRID:   { start: 840, end: 900, label: "2:00-3:00 PM" },
    FOLLOWER: { start: 600, end: 660, label: "10:00-11:00 AM" },  // lag behind leader
    INCOME:   { start: 840, end: 900, label: "2:00-3:00 PM" },
  },
  // Regime windows
  byRegime: {
    RISK_ON:                    { start: 840, end: 900, label: "2:00-3:00 PM" },
    VOLATILE_BUT_CONTAINED:     { start: 600, end: 660, label: "10:00-11:00 AM" },
    CREDIT_STRESS_WATCH:        { start: 870, end: 930, label: "2:30-3:30 PM" },
    HIGH_PREMIUM_ENVIRONMENT:   { start: 570, end: 660, label: "9:30-11:00 AM" },
    LOW_EDGE:                   { start: 840, end: 900, label: "2:00-3:00 PM" },
  },
};

// Default percentile profile when no historical data exists
const DEFAULT_PROFILE = {
  avgMid: 0, medianMid: 0, p75Mid: 0, p90Mid: 0,
  avgSpreadPct: 0.05, avgIv: 30, observations: 0,
};

// --------------------------------------------------
// LOAD / SAVE
// --------------------------------------------------

function _loadProfiles() {
  try {
    const raw = _storage.getItem(STORAGE_KEY);
    if (!raw) return { observations: [], version: 1 };
    return JSON.parse(raw);
  } catch {
    return { observations: [], version: 1 };
  }
}

function _saveProfiles(data) {
  try {
    if (data.observations.length > MAX_OBSERVATIONS) {
      data.observations = data.observations.slice(-MAX_OBSERVATIONS);
    }
    _storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage full */ }
}

// --------------------------------------------------
// RECORD OBSERVATION
// --------------------------------------------------

/**
 * Record a premium observation for future profiling.
 * @param {object} obs
 */
export function recordPremiumObservation(obs) {
  const data = _loadProfiles();
  data.observations.push({
    timestamp: Date.now(),
    symbol: obs.symbol,
    setupType: obs.setupType,
    regime: obs.regime,
    dteBucket: obs.dteBucket,
    moneynessBucket: obs.moneynessBucket,
    minuteOfDay: obs.minuteOfDay,
    dayOfWeek: obs.dayOfWeek,
    midpoint: obs.midpoint,
    spreadPct: obs.spreadPct,
    iv: obs.iv,
    premiumPctStrike: obs.premiumPctStrike,
    premiumPctUnderlying: obs.premiumPctUnderlying,
  });
  _saveProfiles(data);
}

// --------------------------------------------------
// FIND HISTORICAL BUCKET
// --------------------------------------------------

/**
 * Find matching historical observations for a bucket.
 * @param {object} query — { symbol, setupType, regime, dteBucket, moneynessBucket, minuteOfDay, dayOfWeek }
 * @returns {object} aggregated profile
 */
export function findHistoricalBucket(query) {
  const data = _loadProfiles();
  const obs = data.observations;

  // Exact match first
  let matches = obs.filter(o =>
    o.symbol === query.symbol &&
    o.setupType === query.setupType &&
    o.dteBucket === query.dteBucket &&
    o.moneynessBucket === query.moneynessBucket
  );

  // If too few exact matches, broaden to symbol + DTE only
  if (matches.length < 10) {
    matches = obs.filter(o =>
      o.symbol === query.symbol &&
      o.dteBucket === query.dteBucket
    );
  }

  // If still too few, broaden to setup type + DTE
  if (matches.length < 5) {
    matches = obs.filter(o =>
      o.setupType === query.setupType &&
      o.dteBucket === query.dteBucket
    );
  }

  if (matches.length === 0) return { ...DEFAULT_PROFILE, source: "default" };

  // Aggregate
  const mids = matches.map(m => m.midpoint).filter(m => m > 0).sort((a, b) => a - b);
  const spreads = matches.map(m => m.spreadPct).filter(s => s >= 0);
  const ivs = matches.map(m => m.iv).filter(v => v > 0);

  const n = mids.length;
  if (n === 0) return { ...DEFAULT_PROFILE, source: "default" };

  return {
    avgMid: mids.reduce((a, b) => a + b, 0) / n,
    medianMid: mids[Math.floor(n / 2)],
    p75Mid: mids[Math.floor(n * 0.75)] || mids[n - 1],
    p90Mid: mids[Math.floor(n * 0.90)] || mids[n - 1],
    avgSpreadPct: spreads.length > 0 ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0.05,
    avgIv: ivs.length > 0 ? ivs.reduce((a, b) => a + b, 0) / ivs.length : 30,
    observations: n,
    source: "historical",
  };
}

// --------------------------------------------------
// BEST WINDOW LOOKUPS
// --------------------------------------------------

/**
 * Get the historically best premium window for a symbol.
 * Uses real data if enough observations exist, else seed data.
 * @param {string} symbol
 * @returns {object} { start, end, label, source }
 */
export function getBestWindowBySymbol(symbol) {
  // TODO: derive from real observation data when enough accumulates
  const seed = SEED_BEST_WINDOWS.bySymbol[symbol];
  if (seed) return { ...seed, source: "seed" };
  return { start: 840, end: 900, label: "2:00-3:00 PM", source: "default" };
}

/**
 * Get the best premium window for a setup type.
 * @param {string} setupType
 * @returns {object}
 */
export function getBestWindowBySetupType(setupType) {
  const seed = SEED_BEST_WINDOWS.bySetupType[setupType];
  if (seed) return { ...seed, source: "seed" };
  return { start: 840, end: 900, label: "2:00-3:00 PM", source: "default" };
}

/**
 * Get the best premium window for a regime.
 * @param {string} regime
 * @returns {object}
 */
export function getBestWindowByRegime(regime) {
  const seed = SEED_BEST_WINDOWS.byRegime[regime];
  if (seed) return { ...seed, source: "seed" };
  return { start: 840, end: 900, label: "2:00-3:00 PM", source: "default" };
}

/**
 * Clear all stored profiles.
 */
export function clearPremiumProfiles() {
  try { _storage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * Get observation count.
 * @returns {number}
 */
export function getObservationCount() {
  return _loadProfiles().observations.length;
}
