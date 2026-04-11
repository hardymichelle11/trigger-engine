// =====================================================
// DATA-FIRST TICKER CATALOG + UI FILTER MODEL
// =====================================================

// 1) MASTER TICKER DICTIONARY
export const TICKER_CATALOG = [
  { id: "NBIS",  symbol: "NBIS",  exchange: "NASDAQ", name: "Nebius Group",                          category: "AI",         subcategory: "AI Infrastructure",          tags: ["leader", "high_beta", "datacenter", "gpu", "core"], enabled: true },
  { id: "NEBX",  symbol: "NEBX",  exchange: "CBOE",   name: "Tradr 2X Long NBIS Daily ETF",         category: "ETF",        subcategory: "Leveraged ETF",              tags: ["follower", "leveraged", "excursion"], enabled: true },
  { id: "CRWV",  symbol: "CRWV",  exchange: "NASDAQ", name: "CoreWeave",                             category: "AI",         subcategory: "AI Infrastructure",          tags: ["leader", "high_beta", "datacenter", "power"], enabled: true },
  { id: "BE",    symbol: "BE",    exchange: "NYSE",   name: "Bloom Energy",                          category: "Infra",      subcategory: "Power / Fuel Cell",          tags: ["follower", "power", "datacenter", "ai_adjacent"], enabled: true },
  { id: "VRT",   symbol: "VRT",   exchange: "NYSE",   name: "Vertiv Holdings",                       category: "Infra",      subcategory: "Data Center Cooling / Power", tags: ["driver", "datacenter", "power"], enabled: true },
  { id: "ETN",   symbol: "ETN",   exchange: "NYSE",   name: "Eaton Corporation",                     category: "Infra",      subcategory: "Power Management",           tags: ["driver", "grid", "power"], enabled: true },
  { id: "POWL",  symbol: "POWL",  exchange: "NASDAQ", name: "Powell Industries",                     category: "Infra",      subcategory: "Electrical Infrastructure",   tags: ["driver", "power", "grid"], enabled: true },
  { id: "QQQM",  symbol: "QQQM",  exchange: "NASDAQ", name: "Invesco NASDAQ 100 ETF",               category: "ETF",        subcategory: "Index ETF",                  tags: ["leader", "index", "core"], enabled: true },
  { id: "MSFT",  symbol: "MSFT",  exchange: "NASDAQ", name: "Microsoft",                             category: "AI",         subcategory: "Megacap Tech",               tags: ["driver", "megacap", "cloud"], enabled: true },
  { id: "NVDA",  symbol: "NVDA",  exchange: "NASDAQ", name: "NVIDIA",                                category: "AI",         subcategory: "Semiconductor",              tags: ["driver", "gpu", "megacap", "ai_core"], enabled: true },
  { id: "AAPL",  symbol: "AAPL",  exchange: "NASDAQ", name: "Apple",                                 category: "Tech",       subcategory: "Megacap Tech",               tags: ["driver", "megacap"], enabled: true },
  { id: "AMZN",  symbol: "AMZN",  exchange: "NASDAQ", name: "Amazon",                                category: "Tech",       subcategory: "Megacap Tech",               tags: ["driver", "cloud", "megacap"], enabled: true },
  { id: "GOOGL", symbol: "GOOGL", exchange: "NASDAQ", name: "Alphabet",                              category: "Tech",       subcategory: "Megacap Tech",               tags: ["driver", "cloud", "megacap"], enabled: true },
  { id: "IWM",   symbol: "IWM",   exchange: "ARCA",   name: "iShares Russell 2000 ETF",              category: "Index",      subcategory: "Risk Appetite",              tags: ["regime", "breadth"], enabled: true },
  { id: "VIX",   symbol: "VIX",   exchange: "CBOE",   name: "CBOE Volatility Index",                 category: "Index",      subcategory: "Volatility",                 tags: ["regime", "fear"], enabled: true },
  { id: "JEPI",  symbol: "JEPI",  exchange: "ARCA",   name: "JPMorgan Equity Premium Income ETF",    category: "Income",     subcategory: "Covered Call ETF",            tags: ["income", "standalone"], enabled: true },
  { id: "JEPQ",  symbol: "JEPQ",  exchange: "NASDAQ", name: "JPMorgan Nasdaq Equity Premium Income ETF", category: "Income", subcategory: "Covered Call ETF",            tags: ["income", "standalone", "tech_income"], enabled: true },
  { id: "OXY",   symbol: "OXY",   exchange: "NYSE",   name: "Occidental Petroleum",                  category: "Energy",     subcategory: "Oil & Gas",                  tags: ["energy", "driver"], enabled: true },
  { id: "MOS",   symbol: "MOS",   exchange: "NYSE",   name: "Mosaic",                                category: "Fertilizer", subcategory: "Ag Inputs",                  tags: ["fertilizer", "commodity"], enabled: true },
  { id: "CF",    symbol: "CF",    exchange: "NYSE",   name: "CF Industries",                         category: "Fertilizer", subcategory: "Nitrogen",                   tags: ["fertilizer", "commodity", "gas_sensitive"], enabled: true },
  { id: "BAM",   symbol: "BAM",   exchange: "NYSE",   name: "Brookfield Asset Management",           category: "Infra",      subcategory: "Asset Management",           tags: ["partner", "infrastructure"], enabled: true },
  { id: "BEPC",  symbol: "BEPC",  exchange: "NYSE",   name: "Brookfield Renewable",                  category: "Infra",      subcategory: "Renewable Energy",           tags: ["partner", "renewable", "power"], enabled: true },
  { id: "CORZ",  symbol: "CORZ",  exchange: "NASDAQ", name: "Core Scientific",                       category: "AI",         subcategory: "AI Infrastructure",          tags: ["driver", "datacenter", "hpc", "bitcoin_mining"], enabled: true },
  { id: "IREN",  symbol: "IREN",  exchange: "NASDAQ", name: "IREN (Iris Energy)",                    category: "AI",         subcategory: "AI Infrastructure",          tags: ["driver", "datacenter", "hpc", "bitcoin_mining"], enabled: true },
  { id: "BX",    symbol: "BX",    exchange: "NYSE",   name: "Blackstone",                            category: "Credit",     subcategory: "Private Credit",             tags: ["credit_signal", "premium_seller"], enabled: true },
  { id: "APO",   symbol: "APO",   exchange: "NYSE",   name: "Apollo Global Management",              category: "Credit",     subcategory: "Private Credit",             tags: ["credit_signal", "premium_seller"], enabled: true },
  { id: "ARCC",  symbol: "ARCC",  exchange: "NASDAQ", name: "Ares Capital",                          category: "Credit",     subcategory: "BDC",                        tags: ["credit_signal", "income", "bdc"], enabled: true },
  { id: "OWL",   symbol: "OWL",   exchange: "NYSE",   name: "Blue Owl Capital",                      category: "Credit",     subcategory: "Private Credit",             tags: ["credit_signal", "premium_seller"], enabled: true },
  { id: "OBDC",  symbol: "OBDC",  exchange: "NYSE",   name: "Blue Owl BDC",                          category: "Credit",     subcategory: "BDC",                        tags: ["credit_signal", "income", "bdc"], enabled: true },
  { id: "COIN",  symbol: "COIN",  exchange: "NASDAQ", name: "Coinbase",                              category: "AI",         subcategory: "High IV Vehicle",            tags: ["high_iv", "premium_seller", "crypto"], enabled: true },
  { id: "HYG",   symbol: "HYG",   exchange: "ARCA",   name: "iShares High Yield Bond ETF",           category: "Index",      subcategory: "Credit Indicator",           tags: ["regime", "credit_signal", "macro"], enabled: true },
  { id: "KRE",   symbol: "KRE",   exchange: "ARCA",   name: "SPDR Regional Banking ETF",             category: "Index",      subcategory: "Credit Indicator",           tags: ["regime", "credit_signal", "macro"], enabled: true },
  { id: "LQD",   symbol: "LQD",   exchange: "ARCA",   name: "iShares Investment Grade Bond ETF",     category: "Index",      subcategory: "Credit Indicator",           tags: ["regime", "credit_signal", "macro"], enabled: true },
  { id: "SPY",   symbol: "SPY",   exchange: "ARCA",   name: "SPDR S&P 500 ETF",                     category: "Index",      subcategory: "Broad Market",               tags: ["regime", "tier1", "premium_seller"], enabled: true },
  { id: "QQQ",   symbol: "QQQ",   exchange: "NASDAQ", name: "Invesco QQQ Trust",                     category: "ETF",        subcategory: "Index ETF",                  tags: ["regime", "tier1", "premium_seller"], enabled: true },
  { id: "SPX",   symbol: "SPX",   exchange: "CBOE",   name: "S&P 500 Index",                         category: "Index",      subcategory: "Cash-Settled Index",          tags: ["regime", "tier1"], enabled: true },
  { id: "TLT",   symbol: "TLT",   exchange: "NASDAQ", name: "iShares 20+ Year Treasury Bond ETF",    category: "Index",      subcategory: "Bonds / Rates",              tags: ["regime", "tier1", "macro"], enabled: true },
  { id: "SLV",   symbol: "SLV",   exchange: "ARCA",   name: "iShares Silver Trust",                  category: "ETF",        subcategory: "Commodity ETF",               tags: ["tier1", "commodity", "premium_seller"], enabled: true },
  { id: "GLD",   symbol: "GLD",   exchange: "ARCA",   name: "SPDR Gold Shares",                      category: "ETF",        subcategory: "Commodity ETF",               tags: ["tier1", "commodity", "safe_haven"], enabled: true },
  { id: "XLF",   symbol: "XLF",   exchange: "ARCA",   name: "Financial Select Sector SPDR",          category: "ETF",        subcategory: "Sector ETF",                 tags: ["tier1", "financials", "premium_seller"], enabled: true },
  { id: "XLE",   symbol: "XLE",   exchange: "ARCA",   name: "Energy Select Sector SPDR",             category: "ETF",        subcategory: "Sector ETF",                 tags: ["tier1", "energy", "premium_seller"], enabled: true },
  { id: "TSLA",  symbol: "TSLA",  exchange: "NASDAQ", name: "Tesla",                                 category: "AI",         subcategory: "High IV Vehicle",             tags: ["high_iv", "premium_seller", "megacap"], enabled: true },
  { id: "GOOG",  symbol: "GOOG",  exchange: "NASDAQ", name: "Alphabet (Class C)",                    category: "Tech",       subcategory: "Megacap Tech",               tags: ["driver", "cloud", "megacap"], enabled: true },
  { id: "AMD",   symbol: "AMD",   exchange: "NASDAQ", name: "Advanced Micro Devices",                category: "AI",         subcategory: "Semiconductor",              tags: ["driver", "gpu", "high_iv", "premium_seller"], enabled: true },
  { id: "PLTR",  symbol: "PLTR",  exchange: "NYSE",   name: "Palantir Technologies",                 category: "AI",         subcategory: "AI Software",                tags: ["high_iv", "premium_seller"], enabled: true },
  { id: "MSTR",  symbol: "MSTR",  exchange: "NASDAQ", name: "MicroStrategy",                         category: "AI",         subcategory: "High IV Vehicle",             tags: ["high_iv", "premium_seller", "crypto", "bitcoin_mining"], enabled: true },
  { id: "SMCI",  symbol: "SMCI",  exchange: "NASDAQ", name: "Super Micro Computer",                  category: "AI",         subcategory: "AI Infrastructure",          tags: ["high_iv", "premium_seller", "datacenter"], enabled: true },
  { id: "META",  symbol: "META",  exchange: "NASDAQ", name: "Meta Platforms",                         category: "Tech",       subcategory: "Megacap Tech",               tags: ["driver", "megacap", "premium_seller"], enabled: true },
  { id: "HOOD",  symbol: "HOOD",  exchange: "NASDAQ", name: "Robinhood Markets",                     category: "Tech",       subcategory: "Fintech",                    tags: ["high_iv", "premium_seller"], enabled: true },
  { id: "BTDR",  symbol: "BTDR",  exchange: "NASDAQ", name: "Bitdeer Technologies",                  category: "AI",         subcategory: "High IV Vehicle",             tags: ["high_iv", "crypto", "bitcoin_mining"], enabled: true },
  { id: "FXI",   symbol: "FXI",   exchange: "ARCA",   name: "iShares China Large-Cap ETF",           category: "ETF",        subcategory: "International ETF",           tags: ["premium_seller", "macro"], enabled: true },
];

// 2) FILTER HELPERS FOR UI

export function filterCatalog({ search = "", categories = [], tags = [], exchange = "", enabledOnly = true } = {}) {
  const q = search.trim().toLowerCase();
  return TICKER_CATALOG.filter((t) => {
    if (enabledOnly && !t.enabled) return false;
    if (exchange && t.exchange !== exchange.toUpperCase()) return false;
    if (categories.length && !categories.includes(t.category)) return false;
    if (tags.length && !tags.every((tag) => t.tags.includes(tag))) return false;
    if (!q) return true;
    return (
      t.symbol.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.subcategory.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });
}

// 3) SETUP BLUEPRINTS

export function createPairSetup({ id, leaderId, followerId, targets = [], stop = null, leaderThreshold = null, capital = 1000 }) {
  return { id, kind: "pair", leaderId, followerId, targets, stop, leaderThreshold, capital };
}

export function createBasketSetup({ id, leaderId, driverIds = [], capital = 2000 }) {
  return { id, kind: "basket", leaderId, driverIds, capital };
}

export function createInfraFollowerSetup({ id, followerId, aiLeaderIds = [], infraDriverIds = [], partnerIds = [], capital = 1000, lagThreshold = 0.0075, targetsPct = [0.04, 0.07, 0.1], stopPct = 0.04 }) {
  return { id, kind: "infra_follower", followerId, aiLeaderIds, infraDriverIds, partnerIds, capital, lagThreshold, targetsPct, stopPct };
}

export function createStandaloneSetup({ id, leaderId, capital = 1000 }) {
  return { id, kind: "standalone", leaderId, capital };
}

// 4) LOOKUP HELPERS

export function getTickerById(id) {
  return TICKER_CATALOG.find((t) => t.id === id) || null;
}

export function resolveSetup(setup) {
  if (setup.kind === "pair") {
    return { ...setup, leader: getTickerById(setup.leaderId), follower: getTickerById(setup.followerId) };
  }
  if (setup.kind === "basket") {
    return { ...setup, leader: getTickerById(setup.leaderId), drivers: setup.driverIds.map(getTickerById).filter(Boolean) };
  }
  if (setup.kind === "infra_follower") {
    return { ...setup, follower: getTickerById(setup.followerId), aiLeaders: setup.aiLeaderIds.map(getTickerById).filter(Boolean), infraDrivers: setup.infraDriverIds.map(getTickerById).filter(Boolean), partners: setup.partnerIds.map(getTickerById).filter(Boolean) };
  }
  if (setup.kind === "standalone") {
    return { ...setup, leader: getTickerById(setup.leaderId) };
  }
  return setup;
}

// 5) DEFAULT USER SETUPS

export const USER_SETUPS = [
  createPairSetup({ id: "NBIS_NEBX", leaderId: "NBIS", followerId: "NEBX", targets: [30.5, 31.2, 32.0], stop: 27.8, leaderThreshold: 103, capital: 1000 }),
  createBasketSetup({ id: "QQQM_STACK", leaderId: "QQQM", driverIds: ["MSFT", "NVDA", "AAPL", "AMZN", "GOOGL"], capital: 2000 }),
  createInfraFollowerSetup({ id: "BE_INFRA", followerId: "BE", aiLeaderIds: ["NBIS", "CRWV", "NVDA"], infraDriverIds: ["VRT", "ETN", "POWL"], partnerIds: ["BAM", "BEPC"], capital: 1000 }),
  createStandaloneSetup({ id: "JEPI", leaderId: "JEPI", capital: 2000 }),
  createStandaloneSetup({ id: "JEPQ", leaderId: "JEPQ", capital: 2000 }),
];

// 6) BUILD ENGINE INPUTS DYNAMICALLY

export function getAllSymbolsFromSetups(setups = USER_SETUPS) {
  const symbols = new Set(["VIX", "IWM"]);
  setups.map(resolveSetup).forEach((setup) => {
    if (setup.leader?.symbol) symbols.add(setup.leader.symbol);
    if (setup.follower?.symbol) symbols.add(setup.follower.symbol);
    if (setup.drivers) setup.drivers.forEach((t) => symbols.add(t.symbol));
    if (setup.aiLeaders) setup.aiLeaders.forEach((t) => symbols.add(t.symbol));
    if (setup.infraDrivers) setup.infraDrivers.forEach((t) => symbols.add(t.symbol));
    if (setup.partners) setup.partners.forEach((t) => symbols.add(t.symbol));
  });
  return Array.from(symbols);
}
