import React, { useMemo, useState } from "react";
import { TICKER_CATALOG, filterCatalog, getTickerById, createPairSetup, createBasketSetup, createInfraFollowerSetup, createStandaloneSetup } from "./tickerCatalog";

const CATEGORIES = [...new Set(TICKER_CATALOG.map((t) => t.category))].sort();
const ALL_TAGS = [...new Set(TICKER_CATALOG.flatMap((t) => t.tags))].sort();

function toggleArrayValue(arr, value) {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function uniqueSorted(ids) {
  return [...new Set(ids)].sort();
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

export default function TickerSetupBuilder({ onBack, onAddSetup, onToggleSetup, onRemoveSetup, runtimeSetups }) {
  const [search, setSearch] = useState("");
  const [categoryFilters, setCategoryFilters] = useState([]);
  const [tagFilters, setTagFilters] = useState([]);
  const [enabledOnly, setEnabledOnly] = useState(true);
  const [selectedTickerIds, setSelectedTickerIds] = useState([]);

  const [setupType, setSetupType] = useState("pair");
  const [setupId, setSetupId] = useState("");
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

  const [validationErrors, setValidationErrors] = useState([]);
  const [successMsg, setSuccessMsg] = useState("");

  const filteredTickers = useMemo(() => {
    return filterCatalog({ search, categories: categoryFilters, tags: tagFilters, enabledOnly });
  }, [search, categoryFilters, tagFilters, enabledOnly]);

  const selectedTickers = useMemo(() => selectedTickerIds.map(getTickerById).filter(Boolean), [selectedTickerIds]);

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

  function addToScanner() {
    setValidationErrors([]);
    setSuccessMsg("");
    const payload = buildSetupPayload();

    if (!payload.id) {
      setValidationErrors(["Setup ID is required"]);
      return;
    }

    if (onAddSetup) {
      const result = onAddSetup(payload);
      if (result.ok) {
        setSuccessMsg(`Setup "${payload.id}" added to scanner`);
        setSetupId("");
      } else {
        setValidationErrors(result.errors || ["Unknown error"]);
      }
    }
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

            {/* VALIDATION FEEDBACK */}
            {validationErrors.length > 0 && (
              <div style={{ background: "#1c0000", border: "1px solid #ef4444", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, marginBottom: 4 }}>Validation errors</div>
                {validationErrors.map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#fca5a5" }}>{e}</div>
                ))}
              </div>
            )}
            {successMsg && (
              <div style={{ background: "#001c0f", border: "1px solid #22c55e", borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, color: "#86efac" }}>
                {successMsg}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <button type="button" onClick={addToScanner}
                style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #22c55e", background: "#065f46", color: "white", cursor: "pointer", fontWeight: 700 }}>
                Add to Scanner
              </button>
            </div>

            <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 12, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>Current setup payload preview</div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, color: "#d1d5db" }}>
                {JSON.stringify(buildSetupPayload(), null, 2)}
              </pre>
            </div>

            {/* ACTIVE SETUPS (from registry) */}
            {runtimeSetups && runtimeSetups.length > 0 && (
              <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>Active setups ({runtimeSetups.filter(s => s.enabled).length} enabled / {runtimeSetups.length} total)</div>
                {runtimeSetups.map(s => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 4px", borderBottom: "1px solid #1f2937", fontSize: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: s.enabled ? "#22c55e" : "#6b7280", fontWeight: 700 }}>{s.id}</span>
                      <span style={{ color: "#9ca3af", fontSize: 10 }}>{s.type}</span>
                      {s._source === "runtime" && <span style={{ color: "#a78bfa", fontSize: 9, background: "#a78bfa22", padding: "1px 5px", borderRadius: 3 }}>RUNTIME</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {onToggleSetup && (
                        <button type="button" onClick={() => onToggleSetup(s.id)}
                          style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #374151", background: s.enabled ? "#065f46" : "#111827", color: s.enabled ? "#86efac" : "#9ca3af", fontSize: 10, cursor: "pointer" }}>
                          {s.enabled ? "ON" : "OFF"}
                        </button>
                      )}
                      {onRemoveSetup && s._source === "runtime" && (
                        <button type="button" onClick={() => onRemoveSetup(s.id)}
                          style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #ef444444", background: "transparent", color: "#ef4444", fontSize: 10, cursor: "pointer" }}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
