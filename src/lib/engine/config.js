// =====================================================
// CREDIT-VOL ENGINE CONFIG — all thresholds
// =====================================================

export const CONFIG = {
  macro: {
    hygBreak: 80.0,
    kreBreak: 68.6,
    vixFearLow: 21,
    vixFearHigh: 23,
    atrExpansionHigh: 1.5,
  },
  setup: {
    moveThresholdPct: 5,
    atrExpansionMin: 1.5,
    minProbability: 0.65,
  },
  execution: {
    strikeSaferPct: 0.10,
    strikePremiumPct: 0.05,
    dteMin: 5,
    dteMax: 10,
    premiumTargetMin: 300,
    premiumTargetMax: 500,
    maxConcurrentPositions: 3,
  },
  profit: {
    considerClose: 0.30,
    closePosition: 0.50,
    alwaysClose: 0.70,
  },
  roll: {
    warningBufferPct: 0.015,
    actionBelowStrikePct: 0.0,
    rollDownPctMin: 0.05,
    rollDownPctMax: 0.10,
    extendWeeks: [1, 2],
  },
  timing: {
    noTradeOpenMinutes: 60,
    bestWindowStart: 13.5,
    bestWindowEnd: 15.5,
  },
  income: {
    weeklyTarget: 1000,
    dailyAverage: 200,
  },
  weights: {
    marketRegime: 20,
    leader: 20,
    power: 20,
    followerLag: 15,
    ivRich: 10,
    atrExpansion: 10,
    supportLocation: 5,
  },
  score: {
    go: 75,
    watch: 55,
  },
  timingBands: {
    earlyMin: 3,
    earlyMax: 8,
    midMin: 1,
    midMax: 3,
    lateMax: 1,
    exhaustedMax: -8,
  },
};

// Shared utilities used across all engine modules
export function pctChange(current, previous) {
  if (previous === 0 || previous == null || current == null) return 0;
  return ((current - previous) / previous) * 100;
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function safeNumber(n, fallback = 0) {
  return Number.isFinite(Number(n)) ? Number(n) : fallback;
}

export function midpoint(bid, ask) {
  bid = safeNumber(bid);
  ask = safeNumber(ask);
  if (bid <= 0 && ask <= 0) return 0;
  if (bid <= 0) return ask;
  if (ask <= 0) return bid;
  return round2((bid + ask) / 2);
}
