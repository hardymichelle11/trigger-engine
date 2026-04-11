// =====================================================
// OPTIONS WATCHLIST — 2026 ACTIVE + HISTORICAL TOP 100
// =====================================================
// Source: OptionCharts most-active, Cboe symbol activity,
// Macroption historical Cboe options volume rankings.
// iv_rank and avg_options_volume are LIVE/DYNAMIC — populated
// at runtime from broker feed or Polygon snapshot.
// spread_quality_baseline and wheel_suitability_baseline are
// practical trading heuristics, not exchange-published stats.
// =====================================================

// --------------------------------------------------
// 2026 TOP WATCHLIST (current session most-active)
// --------------------------------------------------

export const WATCHLIST_2026 = [
  { symbol: "SPY",  tier: 1, assetType: "ETF",   spreadQuality: "A+", wheelSuit: "Medium", source: "Live" },
  { symbol: "QQQ",  tier: 1, assetType: "ETF",   spreadQuality: "A+", wheelSuit: "Medium", source: "Live" },
  { symbol: "SPX",  tier: 1, assetType: "Index", spreadQuality: "A+", wheelSuit: "No",     source: "Live" },
  { symbol: "VIX",  tier: 1, assetType: "Index", spreadQuality: "A+", wheelSuit: "No",     source: "Live" },
  { symbol: "IWM",  tier: 1, assetType: "ETF",   spreadQuality: "A+", wheelSuit: "Medium", source: "Live" },
  { symbol: "TLT",  tier: 1, assetType: "ETF",   spreadQuality: "A+", wheelSuit: "Medium", source: "Hist+LiveComplex" },
  { symbol: "SLV",  tier: 1, assetType: "ETF",   spreadQuality: "A+", wheelSuit: "Medium", source: "Live" },
  { symbol: "GLD",  tier: 1, assetType: "ETF",   spreadQuality: "A+", wheelSuit: "Medium", source: "HistComplex" },
  { symbol: "XLF",  tier: 1, assetType: "ETF",   spreadQuality: "A+", wheelSuit: "Medium", source: "Hist+LiveComplex" },
  { symbol: "HYG",  tier: 1, assetType: "ETF",   spreadQuality: "A",  wheelSuit: "Medium", source: "Hist" },
  { symbol: "KRE",  tier: 1, assetType: "ETF",   spreadQuality: "A",  wheelSuit: "Medium", source: "Hist" },
  { symbol: "XLE",  tier: 1, assetType: "ETF",   spreadQuality: "A",  wheelSuit: "Medium", source: "Hist" },
  { symbol: "TSLA", tier: 2, assetType: "Stock", spreadQuality: "A+", wheelSuit: "Medium", source: "Live" },
  { symbol: "NVDA", tier: 2, assetType: "Stock", spreadQuality: "A+", wheelSuit: "Medium", source: "Live" },
  { symbol: "AAPL", tier: 2, assetType: "Stock", spreadQuality: "A+", wheelSuit: "High",   source: "Live" },
  { symbol: "GOOG", tier: 2, assetType: "Stock", spreadQuality: "A+", wheelSuit: "Medium", source: "Live" },
  { symbol: "MSFT", tier: 2, assetType: "Stock", spreadQuality: "A+", wheelSuit: "High",   source: "Live" },
  { symbol: "AMD",  tier: 2, assetType: "Stock", spreadQuality: "A+", wheelSuit: "Medium", source: "LiveComplex" },
  { symbol: "PLTR", tier: 2, assetType: "Stock", spreadQuality: "A",  wheelSuit: "Medium", source: "LiveComplex" },
  { symbol: "COIN", tier: 2, assetType: "Stock", spreadQuality: "A",  wheelSuit: "Medium", source: "HistFocus" },
  { symbol: "MSTR", tier: 2, assetType: "Stock", spreadQuality: "A",  wheelSuit: "Medium", source: "HistFocus" },
  { symbol: "SMCI", tier: 2, assetType: "Stock", spreadQuality: "A",  wheelSuit: "Medium", source: "HistFocus" },
  { symbol: "AMZN", tier: 2, assetType: "Stock", spreadQuality: "A",  wheelSuit: "High",   source: "HistTop100" },
  { symbol: "META", tier: 2, assetType: "Stock", spreadQuality: "A",  wheelSuit: "Medium", source: "HistTop100" },
  { symbol: "HOOD", tier: 2, assetType: "Stock", spreadQuality: "A",  wheelSuit: "Medium", source: "HistTop100" },
  { symbol: "BTDR", tier: 2, assetType: "Stock", spreadQuality: "B",  wheelSuit: "Medium", source: "LiveComplex" },
  { symbol: "FXI",  tier: 2, assetType: "ETF",   spreadQuality: "A",  wheelSuit: "Medium", source: "LiveComplex" },
];

// --------------------------------------------------
// HISTORICAL TOP 100 (Cboe-based Macroption ranking)
// --------------------------------------------------

export const WATCHLIST_HISTORICAL = [
  { symbol: "TSLA", histRank: 1,  spreadQuality: "A+", wheelSuit: "Medium" },
  { symbol: "AAPL", histRank: 2,  spreadQuality: "A+", wheelSuit: "High" },
  { symbol: "NVDA", histRank: 3,  spreadQuality: "A+", wheelSuit: "Medium" },
  { symbol: "AMZN", histRank: 4,  spreadQuality: "A+", wheelSuit: "Medium" },
  { symbol: "AMD",  histRank: 5,  spreadQuality: "A+", wheelSuit: "Medium" },
  { symbol: "META", histRank: 6,  spreadQuality: "A+", wheelSuit: "Medium" },
  { symbol: "MSFT", histRank: 7,  spreadQuality: "A+", wheelSuit: "Medium" },
  { symbol: "AMC",  histRank: 8,  spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "GOOGL",histRank: 9,  spreadQuality: "A+", wheelSuit: "Medium" },
  { symbol: "PLTR", histRank: 10, spreadQuality: "A+", wheelSuit: "Medium" },
  { symbol: "BAC",  histRank: 11, spreadQuality: "A+", wheelSuit: "High" },
  { symbol: "BABA", histRank: 12, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "GOOG", histRank: 13, spreadQuality: "A+", wheelSuit: "Medium" },
  { symbol: "MARA", histRank: 14, spreadQuality: "A",  wheelSuit: "Medium" },
  { symbol: "INTC", histRank: 15, spreadQuality: "A+", wheelSuit: "High" },
  { symbol: "SOFI", histRank: 16, spreadQuality: "A",  wheelSuit: "Medium" },
  { symbol: "NIO",  histRank: 17, spreadQuality: "A",  wheelSuit: "Medium" },
  { symbol: "COIN", histRank: 18, spreadQuality: "A+", wheelSuit: "Medium" },
  { symbol: "NFLX", histRank: 19, spreadQuality: "A+", wheelSuit: "Medium" },
  { symbol: "F",    histRank: 20, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "RIVN", histRank: 21, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "DIS",  histRank: 22, spreadQuality: "A",  wheelSuit: "Medium" },
  { symbol: "PYPL", histRank: 23, spreadQuality: "A",  wheelSuit: "Medium" },
  { symbol: "SNAP", histRank: 24, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "C",    histRank: 25, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "PFE",  histRank: 26, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "UBER", histRank: 27, spreadQuality: "A",  wheelSuit: "Medium" },
  { symbol: "CVNA", histRank: 28, spreadQuality: "A",  wheelSuit: "Medium" },
  { symbol: "RIOT", histRank: 29, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "CCL",  histRank: 30, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "SHOP", histRank: 31, spreadQuality: "A",  wheelSuit: "Medium" },
  { symbol: "BBBY", histRank: 32, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "SQ",   histRank: 33, spreadQuality: "A",  wheelSuit: "Medium" },
  { symbol: "XOM",  histRank: 34, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "T",    histRank: 35, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "AAL",  histRank: 36, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "GME",  histRank: 37, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "NKLA", histRank: 38, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "MU",   histRank: 39, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "AFRM", histRank: 40, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "LCID", histRank: 41, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "JPM",  histRank: 42, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "WFC",  histRank: 43, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "AI",   histRank: 44, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "BA",   histRank: 45, spreadQuality: "A",  wheelSuit: "Medium" },
  { symbol: "UPST", histRank: 46, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "GM",   histRank: 47, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "OXY",  histRank: 48, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "PLUG", histRank: 49, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "DKNG", histRank: 50, spreadQuality: "A",  wheelSuit: "Medium" },
  { symbol: "ROKU", histRank: 51, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "SCHW", histRank: 52, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "VZ",   histRank: 53, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "CSCO", histRank: 54, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "JD",   histRank: 55, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "TSM",  histRank: 56, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "RBLX", histRank: 57, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "HOOD", histRank: 58, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "ORCL", histRank: 59, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "XPEV", histRank: 60, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "WMT",  histRank: 61, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "WBD",  histRank: 62, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "JNJ",  histRank: 63, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "LYFT", histRank: 64, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "NKE",  histRank: 65, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "KO",   histRank: 66, spreadQuality: "B",  wheelSuit: "High" },
  { symbol: "ENPH", histRank: 67, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "TGT",  histRank: 68, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "FCX",  histRank: 69, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "PINS", histRank: 70, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "SBUX", histRank: 71, spreadQuality: "B",  wheelSuit: "High" },
  { symbol: "CRM",  histRank: 72, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "KVUE", histRank: 73, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "QCOM", histRank: 74, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "DAL",  histRank: 75, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "ABNB", histRank: 76, spreadQuality: "A",  wheelSuit: "Medium" },
  { symbol: "MPW",  histRank: 77, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "ZM",   histRank: 78, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "PARA", histRank: 79, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "CLF",  histRank: 80, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "U",    histRank: 81, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "ATVI", histRank: 82, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "CVX",  histRank: 83, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "CHPT", histRank: 84, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "DVN",  histRank: 85, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "TLRY", histRank: 86, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "PDD",  histRank: 87, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "MRVL", histRank: 88, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "UAL",  histRank: 89, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "ET",   histRank: 90, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "RIG",  histRank: 91, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "PBR",  histRank: 92, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "FRC",  histRank: 93, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "CRWD", histRank: 94, spreadQuality: "A",  wheelSuit: "Medium" },
  { symbol: "CVS",  histRank: 95, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "MULN", histRank: 96, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "M",    histRank: 97, spreadQuality: "B",  wheelSuit: "Medium" },
  { symbol: "MS",   histRank: 98, spreadQuality: "A",  wheelSuit: "High" },
  { symbol: "SPCE", histRank: 99, spreadQuality: "B",  wheelSuit: "Low" },
  { symbol: "ADBE", histRank: 100,spreadQuality: "A",  wheelSuit: "High" },
];

// --------------------------------------------------
// UNIFIED LOOKUP MAP
// Merges 2026 + historical into one map keyed by symbol.
// 2026 data takes priority where both exist.
// --------------------------------------------------

const _merged = new Map();

// Seed with historical
WATCHLIST_HISTORICAL.forEach(h => {
  _merged.set(h.symbol, {
    symbol: h.symbol,
    tier: null,
    assetType: "Stock",
    spreadQuality: h.spreadQuality,
    wheelSuit: h.wheelSuit,
    histRank: h.histRank,
    source: "Historical",
    in2026: false,
  });
});

// Overlay 2026
WATCHLIST_2026.forEach(w => {
  const existing = _merged.get(w.symbol) || {};
  _merged.set(w.symbol, {
    ...existing,
    symbol: w.symbol,
    tier: w.tier,
    assetType: w.assetType,
    spreadQuality: w.spreadQuality,
    wheelSuit: w.wheelSuit,
    source: w.source,
    in2026: true,
  });
});

export const WATCHLIST_MAP = Object.freeze(Object.fromEntries(_merged));

// --------------------------------------------------
// SCAN FILTERS (your quick rules)
// --------------------------------------------------

/**
 * Tier 1 premium engine scan:
 * spread_quality in (A+, A) AND wheel_suitability != "No"
 */
export function filterPremiumEngine(list = WATCHLIST_2026) {
  return list.filter(w =>
    (w.spreadQuality === "A+" || w.spreadQuality === "A") &&
    w.wheelSuit !== "No"
  );
}

/**
 * Wheel-focused scan:
 * wheel_suitability in (High, Medium)
 * Live filters (IV rank >= 25, option volume >= 10k, tight bid/ask)
 * are applied at runtime against broker data.
 */
export function filterWheelCandidates(list = WATCHLIST_2026) {
  return list.filter(w =>
    (w.wheelSuit === "High" || w.wheelSuit === "Medium") &&
    (w.spreadQuality === "A+" || w.spreadQuality === "A")
  );
}

/**
 * High-wheel names only (safest assignment candidates)
 */
export function filterHighWheel(list = WATCHLIST_2026) {
  return list.filter(w => w.wheelSuit === "High");
}

/**
 * Avoid trap names: wheelSuit === "Low"
 * These are pure premium plays, NOT assignment candidates.
 */
export function filterTrapNames(list = WATCHLIST_HISTORICAL) {
  return list.filter(w => w.wheelSuit === "Low");
}

/**
 * Get watchlist entry for a symbol (checks 2026 first, then historical)
 */
export function getWatchlistEntry(symbol) {
  return WATCHLIST_MAP[symbol] || null;
}

/**
 * Check if a symbol is suitable for the scanner
 */
export function isInScanUniverse(symbol) {
  const entry = WATCHLIST_MAP[symbol];
  if (!entry) return false;
  return entry.spreadQuality === "A+" || entry.spreadQuality === "A";
}

/**
 * Get all 2026 symbols as a flat array (for TradingView comma-separated)
 */
export function get2026Symbols() {
  return WATCHLIST_2026.map(w => w.symbol);
}

/**
 * Get symbols by tier
 */
export function getByTier(tier) {
  return WATCHLIST_2026.filter(w => w.tier === tier);
}

/**
 * TradingView comma-separated string
 */
export const TV_2026_LIST = "SPY,QQQ,SPX,VIX,IWM,TLT,SLV,GLD,XLF,HYG,KRE,XLE,TSLA,NVDA,AAPL,GOOG,MSFT,AMD,PLTR,COIN,MSTR,SMCI,AMZN,META,HOOD,BTDR,FXI";
export const TV_HIST_LIST = "TSLA,AAPL,NVDA,AMZN,AMD,META,MSFT,AMC,GOOGL,PLTR,BAC,BABA,GOOG,MARA,INTC,SOFI,NIO,COIN,NFLX,F,RIVN,DIS,PYPL,SNAP,C,PFE,UBER,CVNA,RIOT,CCL,SHOP,BBBY,SQ,XOM,T,AAL,GME,NKLA,MU,AFRM,LCID,JPM,WFC,AI,BA,UPST,GM,OXY,PLUG,DKNG,ROKU,SCHW,VZ,CSCO,JD,TSM,RBLX,HOOD,ORCL,XPEV,WMT,WBD,JNJ,LYFT,NKE,KO,ENPH,TGT,FCX,PINS,SBUX,CRM,KVUE,QCOM,DAL,ABNB,MPW,ZM,PARA,CLF,U,ATVI,CVX,CHPT,DVN,TLRY,PDD,MRVL,UAL,ET,RIG,PBR,FRC,CRWD,CVS,MULN,M,MS,SPCE,ADBE";
