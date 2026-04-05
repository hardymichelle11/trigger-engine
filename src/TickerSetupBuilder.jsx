import React, { useMemo, useState } from "react";

// ==========================================
// 1) MASTER TICKER CATALOG
// ==========================================

const TICKER_CATALOG = [
  { id: "NBIS", symbol: "NBIS", exchange: "NASDAQ", name: "Nebius Group", category: "AI", subcategory: "AI Infrastructure", tags: ["leader", "high_beta", "datacenter", "gpu", "core"], enabled: true },
  { id: "NEBX", symbol: "NEBX", exchange: "CBOE", name: "Tradr 2X Long NBIS Daily ETF", category: "ETF", subcategory: "Leveraged ETF", tags: ["follower", "leveraged", "excursion"], enabled: true },
  { id: "CRWV", symbol: "CRWV", exchange: "NASDAQ", name: "CoreWeave", category: "AI", subcategory: "AI Infrastructure", tags: ["leader", "high_beta", "datacenter", "power"], enabled: true },
  { id: "BE", symbol: "BE", exchange: "NYSE", name: "Bloom Energy", category: "Infra", subcategory: "Power / Fuel Cell", tags: ["follower", "power", "datacenter", "ai_adjacent"], enabled: true },
  { id: "VRT", symbol: "VRT", exchange: "NYSE", name: "Vertiv Holdings", category: "Infra", subcategory: "Data Center Cooling / Power", tags: ["driver", "datacenter", "power"], enabled: true },
  { id: "ETN", symbol: "ETN", exchange: "NYSE", name: "Eaton Corporation", category: "Infra", subcategory: "Power Management", tags: ["driver", "grid", "power"], enabled: true },
  { id: "POWL", symbol: "POWL", exchange: "NASDAQ", name: "Powell Industries", category: "Infra", subcategory: "Electrical Infrastructure", tags: ["driver", "power", "grid"], enabled: true },
  { id: "QQQM", symbol: "QQQM", exchange: "NASDAQ", name: "Invesco NASDAQ 100 ETF", category: "ETF", subcategory: "Index ETF", tags: ["leader", "index", "core"], enabled: true },
  { id: "MSFT", symbol: "MSFT", exchange: "NASDAQ", name: "Microsoft", category: "AI", subcategory: "Megacap Tech", tags: ["driver", "megacap", "cloud"], enabled: true },
  { id: "NVDA", symbol: "NVDA", exchange: "NASDAQ", name: "NVIDIA", category: "AI", subcategory: "Semiconductor", tags: ["driver", "gpu", "megacap", "ai_core"], enabled: true },
  { id: "AAPL", symbol: "AAPL", exchange: "NASDAQ", name: "Apple", category: "Tech", subcategory: "Megacap Tech", tags: ["driver", "megacap"], enabled: true },
  { id: "AMZN", symbol: "AMZN", exchange: "NASDAQ", name: "Amazon", category: "Tech", subcategory: "Megacap Tech", tags: ["driver", "cloud", "megacap"], enabled: true },
  { id: "GOOGL", symbol: "GOOGL", exchange: "NASDAQ", name: "Alphabet", category: "Tech", subcategory: "Megacap Tech", tags: ["driver", "cloud", "megacap"], enabled: true },
  { id: "IWM", symbol: "IWM", exchange: "ARCA", name: "iShares Russell 2000 ETF", category: "Index", subcategory: "Risk Appetite", tags: ["regime", "breadth"], enabled: true },
  { id: "VIX", symbol: "VIX", exchange: "CBOE", name: "CBOE Volatility Index", category: "Index", subcategory: "Volatility", tags: ["regime", "fear"], enabled: true },
  { id: "JEPI", symbol: "JEPI", exchange: "ARCA", name: "JPMorgan Equity Premium Income ETF", category: "Income", subcategory: "Covered Call ETF", tags: ["income", "standalone"], enabled: true },
  { id: "JEPQ", symbol: "JEPQ", exchange: "NASDAQ", name: "JPMorgan Nasdaq Equity Premium Income ETF", category: "Income", subcategory: "Covered Call ETF", tags: ["income", "standalone", "tech_income"], enabled: true },
  { id: "OXY", symbol: "OXY", exchange: "NYSE", name: "Occidental Petroleum", category: "Energy", subcategory: "Oil & Gas", tags: ["energy", "driver"], enabled: true },
  { id: "MOS", symbol: "MOS", exchange: "NYSE", name: "Mosaic", category: "Fertilizer", subcategory: "Ag Inputs", tags: ["fertilizer", "commodity"], enabled: true },
  { id: "CF", symbol: "CF", exchange: "NYSE", name: "CF Industries", category: "Fertilizer", subcategory: "Nitrogen", tags: ["fertilizer", "commodity", "gas_sensitive"], enabled: true },
  { id: "BAM", symbol: "BAM", exchange: "NYSE", name: "Brookfield Asset Management", category: "Infra", subcategory: "Strategic Partner", tags: ["partner", "renewables"], enabled: true },
  { id: "BEPC", symbol: "BEPC", exchange: "NYSE", name: "Brookfield Renewable", category: "Infra", subcategory: "Strategic Partner", tags: ["partner", "renewables"], enabled: true },
];

const CATEGORIES = [...new Set(TICKER_CATALOG.map((t) => t.category))].sort();
const ALL_TAGS = [...new Set(TICKER_CATALOG.flatMap((t) => t.tags))].sort();

// ==========================================
// 2) HELPERS
// ==========================================

function filterCatalog(catalog, { search, categories, tags, enabledOnly }) {
  const q = search.trim().toLowerCase();
  return catalog.filter((t) => {
    if (enabledOnly && !t.enabled) return false;
    if (categories.length > 0 && !categories.includes(t.category)) return false;
    if (tags.length > 0 && !tags.every((tag) => t.tags.includes(tag))) return false;
    if (!q) return true;
    return (
      t.symbol.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.exchange.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.subcategory.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });
}

function toggleArrayValue(arr, value) {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function findTicker(id) {
  return TICKER_CATALOG.find((t) => t.id === id) || null;
}

function uniqueSorted(ids) {
  return [...new Set(ids)].sort();
}

// ==========================================
// 3) SETUP BUILDERS
// ==========================================

function createPairSetup({ id, leaderId, followerId, targets, stop, leaderThreshold, capital }) {
  return { id, kind: "pair", leaderId, followerId, targets, stop, leaderThreshold, capital };
}

function createBasketSetup({ id, leaderId, driverIds, capital }) {
  return { id, kind: "basket", leaderId, driverIds, capital };
}

function createInfraFollowerSetup({ id, followerId, aiLeaderIds, infraDriverIds, partnerIds, capital, lagThreshold, targetsPct, stopPct }) {
  return { id, kind: "infra_follower", followerId, aiLeaderIds, infraDriverIds, partnerIds, capital, lagThreshold, targetsPct, stopPct };
}

function createStandaloneSetup({ id, leaderId, capital }) {
  return { id, kind: "standalone", leaderId, capital };
}

// ==========================================
// 4) UI COMPONENTS
// ==========================================

function FilterChip({ active, label, onClick }) {
  return (
    <button onClick={onClick} type="button"
      style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid", borderColor: active ? "#2563eb" : "#374151", background: active ? "#1d4ed8" : "#111827", color: "#f9fafb", fontSize: 12, cursor: "pointer" }}>
      {label}
    </button>
  );
}

function TickerRow({ ticker, selected, onToggle }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28px 90px 1fr 110px 120px", gap: 10, alignItems: "center", padding: "10px 8px", borderBottom: "1px solid #1f2937", fontSize: 13 }}>
      <input type="checkbox" checked={selected} onChange={() => onToggle(ticker.id)} />
      <div>
        <div style={{ fontWeight: 700 }}>{ticker.symbol}</div>
        <div style={{ color: "#9ca3af", fontSize: 11 }}>{ticker.exchange}</div>
      </div>
      <div>
        <div>{ticker.name}</div>
        <div style={{ color: "#9ca3af", fontSize: 11 }}>{ticker.category} · {ticker.subcategory}</div>
      </div>
      <div style={{ color: "#d1d5db", fontSize: 11 }}>{ticker.tags.join(", ")}</div>
      <button type="button" onClick={() => onToggle(ticker.id)}
        style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #374151", background: selected ? "#065f46" : "#111827", color: "#f9fafb", cursor: "pointer", fontSize: 12 }}>
        {selected ? "Selected" : "Add"}
      </button>
    </div>
  );
}

function SelectField({ label, value, onChange, options, placeholder = "Select..." }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ marginBottom: 6, fontSize: 12, color: "#9ca3af" }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: 10, background: "#111827", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8 }}>
        <option value="">{placeholder}</option>
        {options.map((opt) => <option key={opt.id} value={opt.id}>{opt.symbol} — {opt.name}</option>)}
      </select>
    </label>
  );
}

function MultiSelectField({ label, values, onToggle, options }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 6, fontSize: 12, color: "#9ca3af" }}>{label}</div>
      <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid #374151", borderRadius: 8, background: "#0f172a", padding: 8 }}>
        {options.map((opt) => (
          <label key={opt.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 4px", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={values.includes(opt.id)} onChange={() => onToggle(opt.id)} />
            <span>{opt.symbol} — {opt.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 5) MAIN BUILDER UI
// ==========================================

export default function TickerSetupBuilder({ onBack }) {
  const [search, setSearch] = useState("");
  const [categoryFilters, setCategoryFilters] = useState([]);
  const [tagFilters, setTagFilters] = useState([]);
  const [enabledOnly, setEnabledOnly] = useState(true);
  const [selectedTickerIds, setSelectedTickerIds] = useState([]);

  const [setupType, setSetupType] = useState("pair");
  const [setupId, setSetupId] = useState("NBIS_NEBX");
  const [capital, setCapital] = useState(1000);

  const [leaderId, setLeaderId] = useState("");
  const [followerId, setFollowerId] = useState("");
  const [driverIds, setDriverIds] = useState([]);
  const [aiLeaderIds, setAiLeaderIds] = useState([]);
  const [infraDriverIds, setInfraDriverIds] = useState([]);
  const [partnerIds, setPartnerIds] = useState([]);

  const [targets, setTargets] = useState("30.5,31.2,32");
  const [stop, setStop] = useState("27.8");
  const [leaderThreshold, setLeaderThreshold] = useState("103");
  const [targetsPct, setTargetsPct] = useState("0.04,0.07,0.1");
  const [stopPct, setStopPct] = useState("0.04");
  const [lagThreshold, setLagThreshold] = useState("0.0075");

  const [savedSetups, setSavedSetups] = useState([]);

  const filteredTickers = useMemo(() => {
    return filterCatalog(TICKER_CATALOG, { search, categories: categoryFilters, tags: tagFilters, enabledOnly });
  }, [search, categoryFilters, tagFilters, enabledOnly]);

  const selectedTickers = useMemo(() => selectedTickerIds.map(findTicker).filter(Boolean), [selectedTickerIds]);

  const leaderOptions = selectedTickers.filter((t) => t.tags.includes("leader") || t.tags.includes("core") || t.tags.includes("income") || t.tags.includes("standalone"));
  const followerOptions = selectedTickers.filter((t) => t.tags.includes("follower"));
  const driverOptions = selectedTickers.filter((t) => t.tags.includes("driver"));
  const partnerOptions = selectedTickers.filter((t) => t.tags.includes("partner"));

  function toggleSelectedTicker(id) {
    setSelectedTickerIds((prev) => uniqueSorted(toggleArrayValue(prev, id)));
  }

  function buildSetupPayload() {
    if (setupType === "pair") {
      return createPairSetup({ id: setupId, leaderId, followerId, targets: targets.split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x)), stop: Number(stop), leaderThreshold: Number(leaderThreshold), capital: Number(capital) });
    }
    if (setupType === "basket") {
      return createBasketSetup({ id: setupId, leaderId, driverIds, capital: Number(capital) });
    }
    if (setupType === "infra_follower") {
      return createInfraFollowerSetup({ id: setupId, followerId, aiLeaderIds, infraDriverIds, partnerIds, capital: Number(capital), lagThreshold: Number(lagThreshold), targetsPct: targetsPct.split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x)), stopPct: Number(stopPct) });
    }
    return createStandaloneSetup({ id: setupId, leaderId, capital: Number(capital) });
  }

  function saveSetup() {
    setSavedSetups((prev) => [...prev, buildSetupPayload()]);
  }

  function sendToBackend() {
    const payload = { tickerCatalogVersion: 1, selectedTickerIds, setups: savedSetups.length ? savedSetups : [buildSetupPayload()] };
    console.log("BACKEND PAYLOAD:", payload);
    alert("Payload logged to console. Replace with your backend endpoint.");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#030712", color: "#f9fafb", padding: 20, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 28, margin: 0 }}>Ticker Dictionary + Setup Builder</h1>
            <div style={{ color: "#9ca3af", marginTop: 4 }}>Search, filter, select tickers, then build backend-ready setups.</div>
          </div>
          {onBack && (
            <button onClick={onBack} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "#f9fafb", cursor: "pointer", fontSize: 13 }}>
              Back to Scanner
            </button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.95fr", gap: 20 }}>
          {/* LEFT: CATALOG */}
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Ticker Catalog</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 16 }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search symbol, name, tag, category..."
                style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #374151", background: "#0f172a", color: "#f9fafb" }} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={enabledOnly} onChange={() => setEnabledOnly((v) => !v)} />
                Enabled only
              </label>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>Category filters</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {CATEGORIES.map((cat) => (
                  <FilterChip key={cat} label={cat} active={categoryFilters.includes(cat)} onClick={() => setCategoryFilters((prev) => toggleArrayValue(prev, cat))} />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>Tag filters</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {ALL_TAGS.map((tag) => (
                  <FilterChip key={tag} label={tag} active={tagFilters.includes(tag)} onClick={() => setTagFilters((prev) => toggleArrayValue(prev, tag))} />
                ))}
              </div>
            </div>

            <div style={{ border: "1px solid #1f2937", borderRadius: 10, overflow: "hidden", background: "#0b1220" }}>
              <div style={{ display: "grid", gridTemplateColumns: "28px 90px 1fr 110px 120px", gap: 10, padding: "10px 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "#9ca3af", borderBottom: "1px solid #1f2937" }}>
                <div /><div>Ticker</div><div>Name</div><div>Tags</div><div>Action</div>
              </div>
              <div style={{ maxHeight: 520, overflow: "auto" }}>
                {filteredTickers.map((ticker) => (
                  <TickerRow key={ticker.id} ticker={ticker} selected={selectedTickerIds.includes(ticker.id)} onToggle={toggleSelectedTicker} />
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: BUILDER */}
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Setup Builder</h2>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>Selected tickers</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {selectedTickers.length === 0 && <div style={{ color: "#9ca3af" }}>No tickers selected yet.</div>}
                {selectedTickers.map((t) => (
                  <div key={t.id} style={{ background: "#0f172a", border: "1px solid #374151", borderRadius: 999, padding: "6px 10px", fontSize: 12 }}>
                    {t.symbol} · {t.category}
                  </div>
                ))}
              </div>
            </div>

            <label style={{ display: "block", marginBottom: 12 }}>
              <div style={{ marginBottom: 6, fontSize: 12, color: "#9ca3af" }}>Setup type</div>
              <select value={setupType} onChange={(e) => setSetupType(e.target.value)}
                style={{ width: "100%", padding: 10, background: "#111827", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8 }}>
                <option value="pair">Pair</option>
                <option value="basket">Basket</option>
                <option value="infra_follower">Infra follower</option>
                <option value="standalone">Standalone</option>
              </select>
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              <div style={{ marginBottom: 6, fontSize: 12, color: "#9ca3af" }}>Setup ID</div>
              <input value={setupId} onChange={(e) => setSetupId(e.target.value)}
                style={{ width: "100%", padding: 10, background: "#111827", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8 }} />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              <div style={{ marginBottom: 6, fontSize: 12, color: "#9ca3af" }}>Capital</div>
              <input type="number" value={capital} onChange={(e) => setCapital(e.target.value)}
                style={{ width: "100%", padding: 10, background: "#111827", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8 }} />
            </label>

            {setupType === "pair" && (
              <>
                <SelectField label="Leader" value={leaderId} onChange={setLeaderId} options={leaderOptions} />
                <SelectField label="Follower" value={followerId} onChange={setFollowerId} options={followerOptions} />
                <label style={{ display: "block", marginBottom: 12 }}>
                  <div style={{ marginBottom: 6, fontSize: 12, color: "#9ca3af" }}>Targets (comma-separated)</div>
                  <input value={targets} onChange={(e) => setTargets(e.target.value)}
                    style={{ width: "100%", padding: 10, background: "#111827", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8 }} />
                </label>
                <label style={{ display: "block", marginBottom: 12 }}>
                  <div style={{ marginBottom: 6, fontSize: 12, color: "#9ca3af" }}>Stop</div>
                  <input value={stop} onChange={(e) => setStop(e.target.value)}
                    style={{ width: "100%", padding: 10, background: "#111827", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8 }} />
                </label>
                <label style={{ display: "block", marginBottom: 16 }}>
                  <div style={{ marginBottom: 6, fontSize: 12, color: "#9ca3af" }}>Leader threshold</div>
                  <input value={leaderThreshold} onChange={(e) => setLeaderThreshold(e.target.value)}
                    style={{ width: "100%", padding: 10, background: "#111827", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8 }} />
                </label>
              </>
            )}

            {setupType === "basket" && (
              <>
                <SelectField label="Leader" value={leaderId} onChange={setLeaderId} options={leaderOptions} />
                <MultiSelectField label="Drivers" values={driverIds} onToggle={(id) => setDriverIds((prev) => uniqueSorted(toggleArrayValue(prev, id)))} options={driverOptions} />
              </>
            )}

            {setupType === "infra_follower" && (
              <>
                <SelectField label="Follower" value={followerId} onChange={setFollowerId} options={followerOptions} />
                <MultiSelectField label="AI Leaders" values={aiLeaderIds} onToggle={(id) => setAiLeaderIds((prev) => uniqueSorted(toggleArrayValue(prev, id)))} options={selectedTickers.filter((t) => t.category === "AI" || t.tags.includes("leader"))} />
                <MultiSelectField label="Infra Drivers" values={infraDriverIds} onToggle={(id) => setInfraDriverIds((prev) => uniqueSorted(toggleArrayValue(prev, id)))} options={selectedTickers.filter((t) => t.category === "Infra" || t.tags.includes("driver"))} />
                <MultiSelectField label="Strategic Partners" values={partnerIds} onToggle={(id) => setPartnerIds((prev) => uniqueSorted(toggleArrayValue(prev, id)))} options={partnerOptions} />
                <label style={{ display: "block", marginBottom: 12 }}>
                  <div style={{ marginBottom: 6, fontSize: 12, color: "#9ca3af" }}>Lag threshold</div>
                  <input value={lagThreshold} onChange={(e) => setLagThreshold(e.target.value)}
                    style={{ width: "100%", padding: 10, background: "#111827", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8 }} />
                </label>
                <label style={{ display: "block", marginBottom: 12 }}>
                  <div style={{ marginBottom: 6, fontSize: 12, color: "#9ca3af" }}>Target % ladder</div>
                  <input value={targetsPct} onChange={(e) => setTargetsPct(e.target.value)}
                    style={{ width: "100%", padding: 10, background: "#111827", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8 }} />
                </label>
                <label style={{ display: "block", marginBottom: 16 }}>
                  <div style={{ marginBottom: 6, fontSize: 12, color: "#9ca3af" }}>Stop %</div>
                  <input value={stopPct} onChange={(e) => setStopPct(e.target.value)}
                    style={{ width: "100%", padding: 10, background: "#111827", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8 }} />
                </label>
              </>
            )}

            {setupType === "standalone" && (
              <SelectField label="Leader" value={leaderId} onChange={setLeaderId} options={leaderOptions} />
            )}

            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <button type="button" onClick={saveSetup}
                style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #374151", background: "#1d4ed8", color: "white", cursor: "pointer" }}>
                Save setup
              </button>
              <button type="button" onClick={sendToBackend}
                style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #374151", background: "#065f46", color: "white", cursor: "pointer" }}>
                Send to backend
              </button>
            </div>

            <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>Current setup payload preview</div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "#d1d5db" }}>
                {JSON.stringify(buildSetupPayload(), null, 2)}
              </pre>
            </div>

            <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>Saved setups ({savedSetups.length})</div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "#d1d5db" }}>
                {JSON.stringify(savedSetups, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
