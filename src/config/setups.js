// =====================================================
// SETUP DEFINITIONS — single source of truth
// =====================================================
// All trigger engine setups live here. App.jsx imports
// via setupRegistry.js. To add a new setup, add an entry
// below — no UI file edits needed.
//
// Each setup must have: id, type, enabled, capital.
// Type-specific fields are documented per section.
// =====================================================

export const MARKET_REGIME = {
  vix: { symbol: "VIX", type: "index", fearThreshold: 28, panicThreshold: 35 },
  iwm: { symbol: "IWM", type: "etf", weakReturnThreshold: -0.005, strongReturnThreshold: 0.005 },
};

export const SETUPS = [
  // -------------------------------------------------
  // PAIR: leader/follower with leverage relationship
  // -------------------------------------------------
  {
    id: "NBIS_NEBX",
    type: "pair",
    enabled: true,
    leader: { symbol: "NBIS", exchange: "NASDAQ", description: "Nebius" },
    follower: { symbol: "NEBX", exchange: "CBOE", description: "2X Long NBIS" },
    targets: [37.0, 38.5, 40.0],
    stop: 32.0,
    leaderThreshold: 103,
    capital: 1000,
    tv: { leader: "NASDAQ:NBIS", follower: "NEBX" },
  },

  // -------------------------------------------------
  // BASKET: leader ETF vs driver components
  // -------------------------------------------------
  {
    id: "QQQM_STACK",
    type: "basket",
    enabled: true,
    leader: { symbol: "QQQM", exchange: "NASDAQ", description: "Invesco NASDAQ 100 ETF" },
    drivers: ["MSFT", "NVDA", "AAPL", "AMZN", "GOOGL"],
    capital: 2000,
    tv: { leader: "NASDAQ:QQQM" },
  },

  // -------------------------------------------------
  // STANDALONE: single instrument + regime overlay
  // -------------------------------------------------
  {
    id: "CRWV",
    type: "standalone",
    enabled: true,
    leader: { symbol: "CRWV", exchange: "NASDAQ", description: "CoreWeave" },
    capital: 1000,
    tv: { leader: "NASDAQ:CRWV" },
  },
  {
    id: "JEPI",
    type: "standalone",
    enabled: true,
    leader: { symbol: "JEPI", exchange: "ARCA", description: "JPMorgan Equity Premium Income ETF" },
    capital: 2000,
    tv: { leader: "AMEX:JEPI" },
  },
  {
    id: "JEPQ",
    type: "standalone",
    enabled: true,
    leader: { symbol: "JEPQ", exchange: "NASDAQ", description: "JPMorgan Nasdaq Equity Premium Income ETF" },
    capital: 2000,
    tv: { leader: "NASDAQ:JEPQ" },
  },

  // -------------------------------------------------
  // COMMODITY / ENERGY: standalone + regime overlay
  // -------------------------------------------------
  {
    id: "OXY",
    type: "standalone",
    enabled: true,
    leader: { symbol: "OXY", exchange: "NYSE", description: "Occidental Petroleum" },
    capital: 1000,
    tv: { leader: "NYSE:OXY" },
  },
  {
    id: "MOS",
    type: "standalone",
    enabled: true,
    leader: { symbol: "MOS", exchange: "NYSE", description: "Mosaic" },
    capital: 1000,
    tv: { leader: "NYSE:MOS" },
  },
  {
    id: "CF",
    type: "standalone",
    enabled: true,
    leader: { symbol: "CF", exchange: "NYSE", description: "CF Industries" },
    capital: 1000,
    tv: { leader: "NYSE:CF" },
  },

  // -------------------------------------------------
  // STACK REVERSAL: multi-layer reversal detection
  // leader → power sector → followers
  // -------------------------------------------------
  {
    id: "NVDA_POWER_STACK",
    type: "stack_reversal",
    enabled: true,
    leader: { symbol: "NVDA", exchange: "NASDAQ", description: "NVIDIA" },
    powerGroup: ["CEG", "GEV", "BE"],
    followerGroup: ["NBIS", "NEBX"],
    capital: 2000,
    tv: { leader: "NASDAQ:NVDA" },
    thresholds: {
      shortMAPeriod: 5,
      breakoutThresholdPct: 0.03,
      minPowerStrength: 0.5,
      earlyMinDist: 0.03,
      earlyMaxDist: 0.08,
      midMinDist: 0.01,
      midMaxDist: 0.03,
      earlyWindowMin: 30,
      midWindowMin: 90,
    },
  },

  // -------------------------------------------------
  // INFRA FOLLOWER: follower lags AI + infra cluster
  // -------------------------------------------------
  {
    id: "BE_INFRA",
    type: "infra_follower",
    enabled: true,
    follower: { symbol: "BE", exchange: "NYSE", description: "Bloom Energy" },
    aiLeaders: ["NBIS", "CRWV", "NVDA"],
    infraDrivers: ["VRT", "ETN", "POWL"],
    strategicPartners: ["BAM", "BEPC"],
    capital: 1000,
    tv: { follower: "NYSE:BE" },
    thresholds: {
      lagThreshold: 0.0075,
      targetsPct: [0.04, 0.07, 0.10],
      stopPct: 0.04,
    },
  },
];
