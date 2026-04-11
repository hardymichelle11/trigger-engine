# Engineering Decisions

> Architecture and design decisions with rationale. Append-only log.
> Each entry explains what was decided, why, and what alternatives were rejected.

---

## 2026-04-11 — Chart context as bounded secondary layer, not primary logic

**Decision:** Chart context (candle patterns, swing structure, S/R zones, supply/demand, ATR extension) is capped at ±15 total score contribution and can never create a GO signal by itself. It is secondary confluence that improves entry/exit quality without overriding the core setup thesis or regime.

**Reason:** The core engine already produces good signals from regime + leader/power/follower confirmation + IV + timing. Chart context should improve the timing of entries that were already valid, not invent new trades. A cap of ±15 means chart context can shift a borderline WATCH to GO (+5 from demand support, +5 from clear air, +3 from bullish candle), or warn against a setup that looks good on paper but faces heavy resistance (-8 supply, -6 under resistance). It cannot push a 40-score setup into GO territory.

**Feature flag:** `ENABLE_CHART_CONTEXT = true` in chartContextEngine.js. Set to false to disable all chart scoring while still seeing context data.

**v1 scope:** Only scores: nearest support distance, nearest resistance distance, inside demand/supply zone, reversal candle at zone, ATR extension state, room to T1. No exotic patterns.

---

## 2026-04-11 — Discovery scanner as expansion mode, not replacement

**Decision:** Build the historical top-100 scanner as a separate discovery mode within the CreditVolScanner, not as a replacement for the curated scan. Discovery candidates exclude symbols already in the 2026 curated list to avoid double-scoring.

**Reason:** The curated scan (31 symbols) is the production watchlist — these are the names Michelle actively trades. The discovery scanner (up to ~20-25 symbols from the historical top-100) surfaces candidates that might be worth promoting to the curated list. Mixing them in one view would dilute attention on the curated names. Keeping them separate means discovery is opt-in, doesn't slow down the main scan, and doesn't trigger alerts (discovery cards don't flow through the alert engine).

**Filters:** Default discovery uses `spreadQuality in (A+, A)` and `wheelSuit in (High, Medium)` to avoid trap names. Batched fetching (5 at a time) respects API rate limits.

---

## 2026-04-11 — Separate stack reversal backtest from generic put-selling backtest

**Decision:** Build a dedicated `stackReversalBacktest.js` module rather than extending the generic backtest engine. The stack thesis measures directional entry outcomes (T1/T2/T3 targets, stop loss, NBIS vs NEBX comparison) rather than put-selling outcomes (credit, strike expiry, premium decay).

**Reason:** The generic backtest engine (`backtestEngine.js`) is designed around the put-selling model — credit received, strike touch, expired above/below. Stack reversal is a buy-entry thesis that needs different metrics: which targets hit, in what order, what stage produces the best entries, and which follower (2x leveraged NEBX vs direct NBIS) performs better. Trying to force this into the put-selling model would distort both.

**What the stack backtest uniquely measures:**
- Stage-based outcome split (EARLY vs MID vs LATE)
- Follower picker accuracy (did the evaluator's "best follower" recommendation actually outperform?)
- T1/T2/T3 target hit rates per follower
- NBIS vs NEBX risk/reward comparison (NBIS: consistent, NEBX: higher MFE but more stops)

---

## 2026-04-11 — BQ reads via proxy adapter, not direct browser auth

**Decision:** BQ data flows through a proxy endpoint (`VITE_BQ_PROXY_URL`) rather than calling the BigQuery REST API directly from the browser with service account credentials. A unified history provider (`historyProvider.js`) tries BQ first, falls back to Polygon REST, caches both.

**Reason:** Embedding service account JSON in a browser bundle is a security anti-pattern — the key would be visible in the client. A proxy (Cloud Function, Express, or Cloud Run) handles auth server-side and returns JSON. The adapter pattern means the UI doesn't care whether data comes from BQ, Polygon, or cache — it gets the same shape. When no proxy is configured, everything falls back to Polygon REST with zero breakage.

**What BQ provides that Polygon REST doesn't:** gap (overnight open vs prev close), prev_close series, range_pct and momentum pre-computed during ETL, richer daily context (period high/low, avg range, avg volume over N days).

**Alternatives rejected:**
- Direct BQ REST from browser with SA key: Security hole.
- OAuth sign-in for BQ: Requires Google account flow, too heavy for a personal dashboard.
- Skip BQ reads entirely: Wastes the stored history already being collected by the pipeline.

---

## 2026-04-11 — WebSocket as overlay, not replacement for polling

**Decision:** WebSocket feeds live quotes into a unified quote store that merges with poll baseline data. Polling continues as the source of prevClose, name, exchange, and VIX (which uses index aggs, not WS). When WS is connected, poll frequency drops from 60s to 120s. Scanner uses merged quotes.

**Reason:** Polygon developer tier may not support WebSocket — the connection must fail gracefully without breaking the scanner. Polling provides baseline prevClose and metadata that WS aggregates don't carry. The merged model gives the best of both: sub-second prices from WS when available, reliable baseline from polls always. Throttled downstream updates (5s) prevent alert storms from rapid WS messages.

**Alternatives rejected:**
- Replace polling entirely with WS: WS doesn't carry prevClose/name/exchange. VIX requires index aggs endpoint. Full replacement would break baseline.
- Ignore WS, keep polling only: Loses timeliness. With alerts and MC gates, fresher data produces better alert timing.
- No throttle: Would cause 10+ re-renders per second and alert storms.

---

## 2026-04-11 — Backtest as outcome replay, not full market simulation

**Decision:** Build the backtesting harness as a trade outcome evaluator that replays alert gates and measures what actually happened given a forward price series. Not a full market simulator.

**Reason:** A full market simulator (rebuild quotes, run scanner, re-score) would require massive historical data infrastructure. v1 only needs to answer: "when the alert fired, what happened to the trade?" That requires only: the alert snapshot (score, action, MC output, IV) and the forward price path (daily closes from entry through DTE). The outcome evaluator is pure functions — no side effects, no data fetching — making it testable and fast.

**What it measures:** expired above strike, strike touched (+ which day), max favorable excursion, max adverse excursion, P&L, days to profit target. These are the exact metrics that validate whether alert thresholds are too tight or too loose.

**Future:** Connect to real BQ bars_1d data via a data provider interface. The outcome evaluator doesn't care where the price series comes from.

---

## 2026-04-11 — Multi-gate alerts over simple score threshold

**Decision:** Alerts fire only when all quality gates pass simultaneously: score >= threshold, action in alert list, MC prob above strike >= 65%, touch prob <= 40%, avg max drawdown <= 8%, IV percentile >= 50, IV confidence not "none", and no recent dedup. This is much stricter than alerting on score alone.

**Reason:** A score >= 75 by itself can be misleading — it might come from regime + leader turning up + follower lagging, but with 55% touch probability (too risky for put selling). The multi-gate approach means alerts only fire when the full stack of conditions validates the trade quality. This reduces noise dramatically and makes each alert worth acting on.

**Transport is pluggable:** Browser notifications now, webhook-ready for Slack/Discord/email. Adding a new transport means one function call — no alert logic changes.

---

## 2026-04-11 — Full Monte Carlo over erf approximation for options probability

**Decision:** Replace the single-point erf-based probability estimate with a full path-based Monte Carlo simulation (N=1000 by default, geometric Brownian motion). Retain erf as a fallback via `{ useMC: false }` option.

**Reason:** The erf model computed P(above strike at expiry) from a single z-score — no path information. This means touch probability was a heuristic (`1 - probAbove * 0.7`) rather than actually measured. The MC model simulates 1000 price paths day by day, giving true path-dependent results: actual touch probability (did any step reach strike?), average max drawdown, and price distribution percentiles (P10-P90). This directly improves trade quality for the premium selling model where knowing "will it touch my strike during the DTE window" is more important than "will it finish below."

**Performance:** 1000 paths * 7 steps = 7000 iterations per symbol — runs in <5ms on modern hardware. Acceptable for scanner refresh. N=500 available for even faster response.

**Alternatives rejected:**
- Keep erf only: Loses touch probability accuracy, the most actionable number for put sellers.
- Use N=10000: Diminishing returns vs compute time. 1000 gives convergence within 5% (tested).
- Use trigger engine's MC directly: Trigger MC is pair-specific (leader/follower paths). Options MC needs single-asset GBM with IV-derived vol.

---

## 2026-04-11 — OXY/MOS/CF as standalone setups, not a new evaluator type

**Decision:** Add OXY, MOS, CF as standalone type setups through the existing config registry, not as a new "commodity" evaluator type.

**Reason:** These are single-instrument commodity names. The standalone evaluator already does regime + vol + momentum scoring, which is the correct level of analysis. Inventing a commodity-specific evaluator would be premature — there's no demonstrated thesis yet (like "MOS lags CF when nat gas rises") that would justify a new evaluator type. If Michelle wants commodity correlation logic later, that's a separate enhancement built on top of real observed patterns.

**Alternatives rejected:**
- New "commodity" evaluator type: No thesis to encode. Would be standalone logic with extra fields that aren't populated.
- Basket setup (MOS+CF): They're correlated but there's no defined leader/driver relationship yet.
- Skip them entirely: They're in the catalog, pipeline, and manifest as planned items — leaving them undone is a loose end.

---

## 2026-04-11 — Score trace for explainability

**Decision:** Add a `scoreTrace` array to `scoreSetup()` that records each scoring contribution (points + reason). Surface it in the CreditVolScanner's detail panel as a "WHY THIS SCORE" breakdown.

**Reason:** With IV source confidence, watchlist quality bonuses, and timing adjustments all affecting the score, users need to see exactly what contributed. This is especially important for the options engine where score directly determines trade/no-trade decisions. The trace makes the system trustworthy during live use.

---

## 2026-04-11 — IV rank as source-agnostic adapter, not inline logic

**Decision:** Build IV rank as an adapter layer (`ivAdapter.js` + `ivCache.js`) that returns a normalized `IvResult` contract regardless of data source. Scoring reads `ivRank` + `ivConfidence` without knowing where it came from. Cache has TTL-based staleness. Stale entries are still returned but flagged.

**Reason:** IV rank can come from Polygon options, Thinkorswim, TradingView, Fidelity, or manual entry. Hardcoding any single source into scoring would require rewriting when sources change. The adapter pattern lets you plug in a new source by adding one function — no scoring code changes. Confidence-weighted scoring means ATR estimates (low confidence) contribute less than real broker data (high confidence), so the system naturally improves as better data sources are added.

**Alternatives rejected:**
- Hardcode IV rank into optionsWatchlist: Mixes static metadata with live data.
- Fetch IV on every score call: Too many API calls. Cache with TTL is correct.
- Treat all IV sources equally: ATR-based estimates are much noisier than real IV. Confidence weighting is appropriate.

---

## 2026-04-11 — Real slope from bars_1m with intraday-proxy fallback

**Decision:** Create a reusable slope/trend utility (`priceHistory.js`) that computes linear regression slope from recent 1m bars. Evaluators use real slope when available (confidence != low), fall back to the existing intraday range proxy when history is missing or stale.

**Reason:** The intraday proxy `(last - low) / (high - low)` measures position within the day's range, not actual directional trend. A 30-60 bar linear regression gives true slope with R² confidence. Fetching only 10 evaluator-critical symbols (not all 48) keeps API cost low (~10 extra calls per refresh cycle).

**Alternatives rejected:**
- Fetch bars for all symbols: Too many API calls (48 * 2 days of 1m = expensive).
- Use only slope, no fallback: Would break evaluators when Polygon is down or market is closed.
- Store slope in BQ and query: Adds latency and complexity; direct fetch from Polygon is simpler for real-time use.

---

## 2026-04-11 — Storage adapter layer for position/income persistence

**Decision:** Create dedicated storage adapter modules (`positionStorage.js`, `incomeStorage.js`) rather than inline localStorage calls in components. Persist only user workflow data (symbol, strike, credit, entries), not live market-derived values (rollPlan, profitPlan, regime).

**Reason:** Roll plans and profit targets depend on current price — persisting them would show stale data after reload. Recomputing on load from the persisted workflow inputs (credit, strike, currentPrice) is correct. Storage adapters with schema versioning (`_version: 1`) enable future migration if the shape changes. Fail-safe: corrupt or missing data returns clean defaults, never crashes.

**Alternatives rejected:**
- Inline localStorage in components: Scatters persistence logic, harder to test, no version migration path.
- Persist everything including computed fields: Would show stale roll zones and profit targets until next refresh.
- Context provider for storage: Overhead — two simple adapters with load/save/clear are sufficient.

---

## 2026-04-10 — Staging + MERGE over DELETE+INSERT for BQ refresh

**Decision:** Replace partition-pruned DELETE + streaming INSERT with load-to-staging + MERGE for bars_1m and bars_1d rolling refresh. quotes_live remains append-only.

**Reason:** Streaming buffer conflict — BigQuery streaming inserts are not immediately visible to DML (DELETE). Rows written via `insert_rows_json` remain in the streaming buffer for up to 30 minutes. If a DELETE runs within that window, it silently skips buffered rows, causing duplicates on the next INSERT. The staging + MERGE pattern avoids this entirely because:
1. Staging uses `load_table_from_file` (load job), which is not subject to streaming buffer
2. MERGE is atomic — matched rows are updated in place, unmatched rows are inserted
3. No DELETE needed at all — the MERGE handles the upsert
4. Idempotent: re-running the same refresh produces identical results

**Alternatives rejected:**
- Wait 30 min between runs: Operationally fragile, breaks the 15-min refresh cadence.
- Use `_PARTITIONTIME` filter: Streaming buffer rows have NULL partition until committed — same problem.
- Partition swap (drop+recreate): Heavier, loses clustering, requires more complex orchestration.

**Model:**
- `quotes_live`: append-only event log (unchanged)
- `bars_1m`: canonical merged history (staging + MERGE)
- `bars_1d`: canonical merged history (staging + MERGE)

---

## 2026-04-10 — React owns render state, registry is mutation layer

**Decision:** Lift setup state to main.jsx via `useState`, pass down as props. Registry handles validation and format conversion but React owns the render truth. Config file is seed data only — never mutated at runtime.

**Reason:** Letting the mutable registry be the sole state source creates a disconnect: registry mutations don't trigger React re-renders. React state + registry as mutation API ensures UI stays in sync. localStorage persists runtime-added setups across reloads without touching the config file.

**Alternatives rejected:**
- Registry-only with forceUpdate: Fragile, requires manual re-render triggers.
- Context provider wrapping registry: Overhead for a single shared parent that already exists (Root in main.jsx).
- Writing runtime setups back to config file: Would require a build step or file write from browser, inappropriate for a client-side app.

**Pattern:**
```
main.jsx: useState(getAllSetups()) → pass down setups + handlers
Builder: calls onAddSetup(payload) → validates → registry.addSetup() → setSetups(getAll()) → saveToStorage()
App.jsx: receives engineSetups prop → renders from prop, not import
```

---

## 2026-04-10 — Setup registry over inline definitions

**Decision:** Move all setup definitions from App.jsx into src/config/setups.js with a registry layer (setupRegistry.js) and validator (setupValidator.js).

**Reason:** Inline SETUPS object in App.jsx was a maintenance bottleneck — editing setups required touching UI code, no validation existed, and the Setup Builder had no path to push configs at runtime. The registry pattern enables AI-safe edits (validate before write), Setup Builder runtime linkage, and diffing old vs new definitions.

**Alternatives rejected:**
- JSON file (setups.json): No runtime import without bundler config; JS module is simpler with Vite.
- Database-backed (Firestore/BQ): Overhead for a single-user tool; file-based is sufficient now.

**Impact:** App.jsx lost ~70 lines of inline config. New consumers import from registry, not config directly.

---

## 2026-04-10 — Options watchlist as metadata layer, not a second catalog

**Decision:** Keep optionsWatchlist.js as a metadata overlay (spread quality, wheel suitability, tier) rather than merging it into tickerCatalog.js.

**Reason:** The watchlist serves a different purpose — it describes options market microstructure (liquidity, spread width, assignment safety) while the ticker catalog describes fundamental identity (symbol, exchange, category, tags). Merging would bloat the catalog with trading-strategy-specific fields that not all consumers need.

**Alternatives rejected:**
- Merge into tickerCatalog.js: Would couple fundamental identity with strategy metadata.
- Separate database table: Overkill for static heuristic data.

---

## 2026-04-10 — Two separate scanning engines, not one merged engine

**Decision:** Keep the Trigger Engine (App.jsx, VIX+IWM regime) and Credit-Vol Scanner (signalEngine.js, HYG+KRE+VIX regime) as separate systems with separate UI pages.

**Reason:** They serve different trading strategies with different philosophies. The trigger engine is directional (buy entries via pair/basket/stack setups). The credit-vol engine is premium selling (sell puts for income). Merging would force a single scoring model onto incompatible trade types.

**Alternatives rejected:**
- Unified engine with strategy type parameter: Would create an overly complex scoring function with too many conditional paths.
- Single regime model: The two regime models weight different signals (VIX+IWM breadth vs HYG+KRE credit stress).

---

## 2026-04-10 — TickerSetupBuilder imports from tickerCatalog.js (no duplicate)

**Decision:** Remove the hardcoded duplicate TICKER_CATALOG from TickerSetupBuilder.jsx and import from the single source of truth in tickerCatalog.js.

**Reason:** The duplicate was already drifting out of sync (different subcategories for BAM/BEPC, missing new tickers). A single source eliminates this class of bugs permanently.

---

## 2026-04-05 — BigQuery as canonical historical store, Polygon as live source

**Decision:** Keep BigQuery for historical data persistence and Polygon.io REST API for live snapshots. Frontend fetches live from Polygon directly; pipeline writes to BQ for historical analysis.

**Reason:** Lowest friction, already working, cost-effective (~$3.75/month at 48 symbols). BQ handles the heavy lifting for historical queries while Polygon provides real-time data without needing a WebSocket infrastructure.

**Alternatives rejected:**
- All-Polygon (no BQ): No persistence, can't do historical analysis or backtesting.
- All-BQ (stream through BQ): Higher latency for live data, more complex pipeline.
- TimescaleDB/InfluxDB: Additional infrastructure to manage for a single-user tool.

---

## 2026-04-05 — VBS wrapper for silent Windows scheduled tasks

**Decision:** Use wscript.exe with a VBS wrapper (run_refresh.vbs) to execute scheduled refresh tasks silently.

**Reason:** Windows Task Scheduler with cmd /c flashes a console window. PowerShell -windowstyle hidden still flashes briefly. wscript.exe with WshShell.Run ..., 0 runs completely silently.

---

## 2026-04-04 — Partition by date, cluster by symbol for BQ tables

**Decision:** Use DATE partitioning on bar_date/quote_date and cluster by symbol + exchange.

**Reason:** Rolling refresh only touches 3-5 day windows. Partition pruning means DELETEs and queries scan ~21K rows instead of 660K+, saving ~95% of DML cost. Clustering by symbol further reduces bytes scanned when filtering specific tickers.

---

*Append new decisions at the top. Include date, decision, reason, and rejected alternatives.*
