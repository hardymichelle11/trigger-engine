# SYSTEM MANIFEST — Trigger Engine + Market Data Pipeline

**Last updated:** 2026-05-01
**Project:** `my-app` (trigger-engine)
**Repository:** https://github.com/hardymichelle11/trigger-engine
**Author:** Michelle Hardy (hardymichelle11)
**AI Collaborator:** Claude Opus 4.7 (1M context)

---

## 1. System Summary

The **Trigger Engine** is a multi-layer, AI-assisted market intelligence and trade decision-support dashboard. As of 2026-05-01 the app runs on **three core, complementary layers** — Trigger Engine, CreditView (Credit-Vol Scanner), and Lethal Board (Discovery Layer). All three are active; none replaces another. The newest layer (Lethal Board) is **additive**, not a successor to CreditView.

### Three-layer architecture
- **Trigger Engine** — per-instrument setup, timing, and touch discipline. Multi-setup scanning across 5 setup types: Pair, Basket, Infra Follower, Stack Reversal, Standalone. Credit-Vol options engine owned internally for premium-selling workflows.
- **CreditView (Credit-Vol Scanner)** — credit / volatility / regime confirmation. Conservative option-readiness lens. Useful even without live option-chain pricing.
- **Lethal Board (Discovery Layer)** — capital-aware opportunity discovery and ranking. Session-aware live universe sourcing, recorded-alert audit trail, sanitized rollup chip, card/detail UI.

### Core capabilities (cross-layer)
- **Multi-setup scanning** across 5 setup types: Pair, Basket, Infra Follower, Stack Reversal, Standalone
- **Credit-Volatility Options Engine** — premium selling scanner with macro credit regime (HYG/KRE/LQD/VIX), setup scoring, timing classification, strike selection, probability layer, profit management, defense/roll logic, position tracking, and weekly income tracker
- **Options Watchlist System** — 2026 top-27 active options universe + historical top-100 Cboe rankings with spread quality, wheel suitability, and tier metadata; scan filters (Premium Engine, Wheel, High IV, Credit, ETF, Traps)
- **Market regime awareness** via VIX + IWM scoring (RISK-ON / NEUTRAL / RISK-OFF) for trigger engine, and HYG + KRE + VIX credit-vol regime for options engine
- **Monte Carlo simulation** for touch-before-stop probability estimation (trigger engine) and simplified probability layer for put strike success estimation (options engine)
- **Kelly-lite position sizing** based on simulated win probabilities
- **Stack reversal detection** with distance-based staging (EARLY/MID/LATE) and action engine
- **Capital-aware discovery (Lethal Board)** — session-aware valid-universe sourcing (regular: gainers + losers union; extended hours: curated bulk-tickers; closed: last-known curated). Capital-aware ranking with single best-use-of-capital winner + displacement tracking. Recorded-alert audit list (commit-only, never preview). Sanitized rollup chip (24h / 7d / new best / displaced).
- **Polygon glue** with circuit breaker, per-call timeout, options-capability probe (distinguishes 403 entitlement → `unavailable_plan` from generic failure). Retired invalid `/most_active` endpoint with structured fallback.
- **Session-aware freshness policy** calibrated to current Polygon delayed-snapshot tier. Regular: 1080–3600s by mode. Extended hours: 6 h. Closed: rejection disabled. 6-hour prior-session safeguard catches yesterday's quotes during regular session.
- **Premium source honesty** — labeled `live` only for chain-based; `estimated` for IV/ATR-derived; `unavailable` otherwise. UI never relabels estimated as live.
- **Instrument validation pipeline** (symbol, exchange, cross-asset, freshness)
- **Live data from Polygon.io** (developer tier; ~15-min delayed snapshots; options chain endpoint not entitled — surfaces as `unavailable_plan`) with after-hours fallback
- **BigQuery persistence** for historical bars and live snapshots with computed columns
- **Cost-optimized refresh** via silent Windows scheduled tasks
- **TradingView chart integration** for visual confirmation (external to dashboard data path)
- **Ticker catalog + Setup Builder UI** for configuring setups without editing code

### Instruments tracked (48 symbols):

**Trigger Engine core (20):** NBIS, NEBX, CRWV, BE, VRT, ETN, POWL, QQQM, MSFT, NVDA, AAPL, AMZN, GOOGL, IWM, VIX, JEPI, JEPQ, BAM, BEPC, CEG, GEV

**Credit-Vol Engine (9):** BX, APO, ARCC, OWL, OBDC, COIN, HYG, KRE, LQD

**AI/HPC Infrastructure (2):** CORZ, IREN

**2026 Options Watchlist additions (17):** SPY, QQQ, SPX, TLT, SLV, GLD, XLF, XLE, TSLA, GOOG, AMD, PLTR, MSTR, SMCI, META, HOOD, BTDR, FXI

---

## 2. Architecture Map

```
                         DATA INGESTION
                         ==============

  Polygon.io REST API ──────────────────────────────────────┐
  (snapshots, aggs, ticker details)                         │
       │                                                    │
       ▼                                                    ▼
  ┌─────────────────┐     ┌──────────────────┐    ┌──────────────────────────┐
  │ refresh_schedule │     │ market_data_     │    │ React Dashboard          │
  │ .py              │     │ pipeline.py      │    │ (Vite + React)           │
  │                  │     │                  │    │                          │
  │ - refresh-live   │     │ - init           │    │ Polygon snapshot on page │
  │ - refresh-1m     │     │ - backfill       │    │ load / manual refresh    │
  │ - refresh-1d     │     │ - refresh-recent │    │                          │
  └────────┬─────────┘     └────────┬─────────┘    └────────┬─────────────────┘
           │                        │                       │
           ▼                        ▼                       ▼
  ┌─────────────────────────────────────┐    ┌──────────────────────────────────┐
  │         Google BigQuery             │    │     Browser (Client)             │
  │  supple-synapse-470605-c5           │    │                                  │
  │  Dataset: market_data               │    │  PAGE 1: TRIGGER ENGINE          │
  │                                     │    │  - 5 setup evaluators            │
  │  bars_1m  (+ range_pct, momentum)   │    │  - Monte Carlo sim              │
  │  bars_1d  (+ range_pct, momentum,   │    │  - VIX+IWM market regime        │
  │            gap, prev_close)         │    │  - Stack reversal engine         │
  │  quotes_live                        │    │  - TradingView charts            │
  └─────────────────────────────────────┘    │                                  │
                                             │  PAGE 2: CREDIT-VOL SCANNER      │
                                             │  - signalEngine.js (12 sections) │
                                             │  - HYG+KRE+LQD+VIX regime       │
                                             │  - Setup scoring + timing        │
                                             │  - Strike selection + prob layer │
                                             │  - Profit mgmt (30/50/70% BTC)  │
                                             │  - Defense/roll logic            │
                                             │  - Position manager              │
                                             │  - Weekly income tracker         │
                                             │  - optionsWatchlist.js filters   │
                                             │                                  │
                                             │  PAGE 3: SETUP BUILDER           │
                                             │  - Ticker catalog browser        │
                                             │  - Setup form (pair/basket/etc)  │
                                             └──────────────────────────────────┘

                         SCHEDULING
                         ==========

  Windows Task Scheduler (via wscript.exe + VBS wrapper for silent execution)
  ├── MarketData-LiveSnapshot  → every 1 min  → refresh-live
  ├── MarketData-Bars1m        → every 15 min → refresh-1m
  └── MarketData-Bars1d        → daily 5 PM   → refresh-1d

  All tasks auto-skip outside market hours (Mon-Fri 9:25-16:05 ET)
  VBS wrapper ensures zero console window flashing.
```

---

## 3. Logical Rationale

### Why BigQuery with partitioned tables?
- **Cost**: Partition pruning means DELETEs and queries only scan the 3-5 day rolling window, not the full history. At ~660K rows of 1m data, a full scan would cost ~$0.005 per query. With partitioning, the rolling refresh touches only ~21K rows. Over a month, this saves ~95% of DML cost.
- **Clustering by symbol + exchange**: Allows BQ to skip irrelevant row groups when filtering by specific tickers.
- **Streaming inserts**: No load job overhead, sub-second latency, pay only for rows written.
- **Computed columns at ingestion**: `range_pct`, `momentum`, `gap`, `prev_close` computed once during ETL, avoiding runtime math in downstream queries.

### Why Polygon.io?
- Developer tier provides real-time snapshots and unlimited historical aggs.
- Single API for both live quotes and historical backfill (no vendor mixing).
- Ticker details endpoint provides exchange metadata, cached per session.
- Clean REST interface, well-documented response shapes.
- ~7,500 API calls/day fits comfortably within developer tier limits.

### Why Vite + React (no framework)?
- Zero-config fast dev server with HMR.
- Single-file architecture keeps the engine logic co-located with the UI.
- No SSR needed -- this is a local/personal dashboard tool.
- TradingView widget embeds work cleanly in client-side React.

### Why environment variables + .env?
- **Key concealment**: Polygon API key and GCP credentials never committed to git.
- Vite's `import.meta.env.VITE_*` pattern exposes only prefixed vars to the client bundle.
- Pipeline reads from OS-level env vars or `.env` file.
- `.gitignore` blocks `.env`, `service-account*.json`, and all credential files.

### Why VBS wrapper for scheduled tasks?
- Windows Task Scheduler + `cmd /c` flashes a console window on every run.
- `powershell -windowstyle hidden` still flashes briefly.
- `wscript.exe` with a VBS file using `WshShell.Run ..., 0` runs completely silently.

### Why distance-based staging for stack reversal?
- Time-based staging (minutes since flip) drifts and is less meaningful.
- Distance to T1 directly measures opportunity: 3-8% = best entry, 1-3% = momentum started, <=1% = exhaustion risk.
- Maps cleanly to actions: ENTER_AGGRESSIVE, ENTER_NORMAL, TAKE_PROFIT_OR_SKIP.

---

## 4. Code & Configurations

### 4.1 Setup Types (5 evaluators)

#### Pair: `evaluatePairSetup()` (NBIS/NEBX)
- Leader/follower with 2x leveraged ETF relationship
- Cross-asset validation, touch-before-stop Monte Carlo (N=2000)
- Kelly position sizing, ladder probabilities for T1/T2/T3

#### Basket: `evaluateBasketSetup()` (QQQM + drivers)
- Leader ETF vs MSFT/NVDA/AAPL/AMZN/GOOGL driver components
- Catch-up thesis: scores when drivers lead and ETF lags

#### Infra Follower: `evaluateInfraFollowerSetup()` (BE_INFRA)
- BE follows AI cluster (NBIS/CRWV/NVDA) + infra drivers (VRT/ETN/POWL)
- Strategic partners (BAM/BEPC) tracked
- Lag detection with configurable threshold (default 0.75%)
- Dynamic targets (4%/7%/10%), Monte Carlo with cluster impulse model
- Kelly sizing from MC win probability

#### Stack Reversal: `evaluateStackReversalSetup()` (NVDA_POWER_STACK) **[NEW]**
- **Leader**: NVDA reversal detection via `isTurningUp()` (price > prev && slope > 0)
- **Power sector**: CEG, GEV, BE -- `groupStrength()` fraction turning up >= 50%
- **Infra/followers**: NBIS, NEBX -- lag detection
- **Stack reversal** = all three layers confirming simultaneously
- **Distance-based staging** via `getStage(distToT1)`:

  | Distance to T1 | Stage | Action | Score Boost |
  |----------------|-------|--------|-------------|
  | 3-8% | EARLY | ENTER_AGGRESSIVE | +35 (stack +20, early +15) |
  | 1-3% | MID | ENTER_NORMAL | +25 (stack +20, mid +5) |
  | <=1% | LATE | TAKE_PROFIT_OR_SKIP | +10 (stack +20, late -10) |

- **Target weights by stage**: EARLY 1/1/1, MID 1/.85/.65, LATE .8/.5/.2
- **Best follower recommendation**: NEBX or NBIS based on which lags more
- **Signal label**: `STACK_REVERSAL_EARLY`, `STACK_REVERSAL_MID`, etc.

#### Standalone: `evaluateStandaloneSetup()` (CRWV, JEPI, JEPQ)
- Single instrument with volatility and momentum checks
- Market regime overlay

### 4.2 Shared Engine Functions

```
getStage(distToT1)        -- Distance-based stage classification (reusable)
isTurningUp(feed)         -- Price > prev && slope > 0 (intraday position proxy)
groupStrength(feeds)      -- Fraction of group turning up (0 to 1)
pctChange(feed)           -- (last - prevClose) / prevClose
avg(nums)                 -- Safe average with empty array handling
computeKellyLite(winProb) -- Half-Kelly position sizing
randn()                   -- Box-Muller normal distribution
normalizeFeed(raw)        -- Standardize any data source to internal model
validateInstrument()      -- Symbol, exchange, price validity checks
validateCrossAsset()      -- Direction alignment, leverage ratio, freshness
evaluateMarketRegime()    -- VIX + IWM scoring
```

### 4.3 Credit-Volatility Options Engine (`src/signalEngine.js`)

A 12-section retail hedge fund model for consistent weekly income (~$1,000/week) via premium selling. Philosophy: sell fear, don't follow it. Act as the insurance seller, not the buyer.

#### Section 1: Macro Signal Engine (GO / NO-GO)
- Inputs: HYG, KRE, LQD, VIX
- Credit stress: HYG < 80 OR KRE < 68.60
- Volatility active: VIX rising AND ATR expansion > 150%
- Modes: HIGH_PREMIUM_ENVIRONMENT, CREDIT_STRESS_HIGH_PREMIUM, CREDIT_STRESS_WATCH, VOLATILE_BUT_CONTAINED, RISK_ON, LOW_EDGE

#### Section 3: Setup Scoring
- Weights: marketRegime (20), leader (20), power (20), followerLag (15), ivRich (10), atrExpansion (10), supportLocation (5)
- Watchlist quality: spreadA (+3), tier1 (+2), wheelLow (-5)
- Timing boost: EARLY +15, MID +5, LATE -15, EXHAUSTED -25
- Signals: GO (>=75), WATCH (>=55), NO_TRADE

#### Section 4: Strike Selection
- Primary (safer): 10% below spot
- Secondary (premium): 5% below spot
- Expiration: 5-10 DTE preferred

#### Section 5: Profit Management
- 30% profit: CONSIDER CLOSE
- 50% profit: CLOSE POSITION
- 70% profit: ALWAYS CLOSE
- Rule: "Never let a winner turn into a loser"

#### Section 6: Defense / Roll Logic
- Zones: SAFE → WATCH → DEFENSE → ACTION
- Roll: buy to close, sell new put 5-10% lower strike, extend 1-2 weeks

#### Section 7: Trading Window
- No trades first 60 min of market open
- Best window: 1:30 PM - 3:30 PM ET

#### Section 9: Sentiment Interpretation
- Elevated put premiums + bearish put/call ratio = institutions buying protection
- Action: SELL puts (not buy), move strikes lower for safety

#### Section 10: Probability Layer
- Simplified Monte Carlo with error function approximation
- Minimum 65% probability threshold to execute
- Calculates prob above strike, touch probability, expected move

#### Section 11: Risk Management
- Max 2-3 concurrent positions
- Stop new trades if HYG + KRE both collapsing
- Trap name warnings for Low wheel suitability names

#### Section 12: Trade Recommendation Output
```
TRADE: YES / NO
STRIKE: recommended
EXPIRATION: 5-10 DTE
PREMIUM: expected midpoint
PROBABILITY: %
ACTION: SELL_PUTS / WAIT / CLOSE / ROLL / MANAGE_ONLY
RISK LEVEL: LOW / MED / HIGH
```

### 4.4 Options Watchlist System (`src/optionsWatchlist.js`)

#### 2026 Top Active (27 symbols)
- **Tier 1 ETFs**: SPY, QQQ, SPX, VIX, IWM, TLT, SLV, GLD, XLF, HYG, KRE, XLE
- **Tier 2 Stocks**: TSLA, NVDA, AAPL, GOOG, MSFT, AMD, PLTR, COIN, MSTR, SMCI, AMZN, META, HOOD, BTDR, FXI

#### Historical Top 100 (Cboe-based Macroption ranking)
TSLA (#1) through ADBE (#100) with spread quality and wheel suitability ratings

#### Metadata Fields
- `spreadQuality`: A+ (tightest), A (good), B (wider) — practical heuristic
- `wheelSuit`: High (safe assignment), Medium (acceptable), Low (trap), No (cash-settled)
- `tier`: 1 (structurally liquid) or 2 (active)

#### Built-in Scan Filters
- **Premium Engine**: spreadQuality in (A+, A) AND wheelSuit != No
- **Wheel Candidates**: wheelSuit in (High, Medium) AND spreadQuality in (A+, A)
- **Trap Names**: wheelSuit = Low — pure premium plays, never assignment candidates

### 4.5 Ticker Catalog (`src/tickerCatalog.js`)

Master dictionary of 48 tickers with id, symbol, exchange, name, category, subcategory, tags, and enabled flag. Categories: AI, Tech, Infra, ETF, Index, Income, Energy, Fertilizer, Credit. Setup Builder imports from this single source of truth (duplicate catalog removed from TickerSetupBuilder.jsx).

### 4.6 Pipeline Scripts

#### `pipeline/market_data_pipeline.py`
- BQ table creation with computed columns (range_pct, momentum, gap, prev_close)
- Exchange lookup from Polygon ticker details (cached per session via `get_exchange()`)
- `fetch_agg_bars()` computes `range_pct = (high-low)/open`, `momentum = close/open - 1`, `gap = open/prev_close - 1`
- Batched streaming inserts for append-only tables (5000 rows, 3 retries with exponential backoff)
- Staging + MERGE for bars tables: `_ensure_staging_table()`, `_load_to_staging()` (load job, not streaming), `merge_from_staging()` (MERGE on symbol+exchange+ts), `upsert_bars()` (orchestrator)
- CLI: `init`, `backfill`, `refresh-recent`, `refresh-live`

#### `pipeline/refresh_schedule.py`
- Cost-optimized incremental refresh with market hours gating
- `refresh_1m`: rolling 3-day upsert via staging + MERGE (streaming-buffer-safe)
- `refresh_1d`: rolling 5-day upsert via staging + MERGE
- `refresh_live`: append-only snapshots (unchanged)
- Per-symbol ok/error counters in output
- CLI: `refresh-1m`, `refresh-1d`, `refresh-live`, `refresh-all`

#### `pipeline/validate_bq.py`
- Post-refresh validation: duplicate detection on (symbol, exchange, ts), row counts per date, staging table health
- CLI: `python pipeline/validate_bq.py --days 5 --table both`

#### `pipeline/run_refresh.bat` + `pipeline/run_refresh.vbs`
- `.bat`: sets env vars and calls refresh_schedule.py
- `.vbs`: wraps .bat with `WshShell.Run ..., 0` for completely silent execution
- Used by Windows Task Scheduler

### 4.7 System Prompts for Data Analysis

#### Stack Reversal Detection
```
Given: NVDA feed, power sector feeds (CEG/GEV/BE), follower feeds (NBIS/NEBX)

isTurningUp(asset) = asset.price > asset.prev && asset.slope > 0
groupStrength(group) = count(turning up) / total

stackReversal = leaderUp && powerStrength >= 0.5 && infraStrength >= 0.5

stage = getStage(follower.distToT1):
  3-8%  -> EARLY  (ENTER_AGGRESSIVE)
  1-3%  -> MID    (ENTER_NORMAL)
  <=1%  -> LATE   (TAKE_PROFIT_OR_SKIP)

scoreBoost: stack +20, EARLY +15, MID +5, LATE -10
label: STACK_REVERSAL_{stage}
```

#### Engine Scoring (Pair Setup)
```
Given: NBIS price, NEBX price, market regime, leader volatility
Score = sum of:
  +25 if NBIS > $103 threshold
  +15 if cross-asset validation passes (direction + leverage)
  +25 * scoreDistance(dist_to_T1)  [0.6 if <2%, 1.0 if 2-5%, 0.5 if 5-6%]
  +10 if leader volatility > 0.3%
  +15 if RISK-ON / -20 if RISK-OFF
GO if score >= 75 AND dist_T1 > 0 AND not RISK-OFF
WATCH if score >= 50
NO TRADE otherwise
```

#### Engine Scoring (BE Infra Follower)
```
Given: BE price, AI cluster changes (NBIS/CRWV/NVDA), infra drivers (VRT/ETN/POWL), partners (BAM/BEPC)
clusterStrength = avg(aiStrength, infraStrength, partnerStrength)
lagAmount = clusterStrength - beMove
lagging = lagAmount >= 0.75%

Score:
  +25 if aiStrength > 1% (or +10 if > 0.3%)
  +25 if infraStrength > 1% (or +10 if > 0.3%)
  +25 if lagging (or +10 if lagAmount > 0)
  +15 if RISK-ON / -20 if RISK-OFF

Monte Carlo: 2000 paths, 12 steps, cluster impulse drives drift
Targets: BE price * (1.04, 1.07, 1.10)
Stop: BE price * 0.96
```

#### Market Regime Evaluation
```
Base score = 50
VIX >= 35 (panic):    -30
VIX >= 28 (fear):     -15
VIX < 28 (contained): +5
VIX rising > 3%:      -10
IWM change >= +0.5%:  +20 (risk-on)
IWM change <= -0.5%:  -20 (risk-off)

RISK-ON if score >= 65
RISK-OFF if score <= 35
NEUTRAL otherwise
```

### 4.8 Environment Variables

```bash
# .env.example (placeholder values)
VITE_POLYGON_API_KEY=YOUR_POLYGON_API_KEY
VITE_GCP_PROJECT=YOUR_GCP_PROJECT_ID
GOOGLE_APPLICATION_CREDENTIALS=./pipeline/service-account.json
POLYGON_API_KEY=YOUR_POLYGON_API_KEY
GOOGLE_CLOUD_PROJECT=YOUR_GCP_PROJECT_ID
BQ_DATASET=market_data
```

---

## 5. Database Schema

### `bars_1m` — 1-Minute Aggregate Bars
```sql
CREATE TABLE market_data.bars_1m (
  symbol        STRING NOT NULL,
  exchange      STRING,          -- e.g., "XNAS", "XNYS", "BATS" (from Polygon ticker details)
  ts            TIMESTAMP NOT NULL,
  bar_date      DATE NOT NULL,
  open          FLOAT64,
  high          FLOAT64,
  low           FLOAT64,
  close         FLOAT64,
  volume        INT64,
  vwap          FLOAT64,
  trades        INT64,
  range_pct     FLOAT64,         -- (high - low) / open
  momentum      FLOAT64,         -- close / open - 1
  source        STRING,          -- "polygon_aggs"
  ingested_at   TIMESTAMP NOT NULL
)
PARTITION BY bar_date
CLUSTER BY symbol, exchange
```
**Current size**: ~661,862 rows (90 days, original 18 symbols; pending backfill for 30 new symbols)

### `bars_1d` — Daily Aggregate Bars
```sql
CREATE TABLE market_data.bars_1d (
  symbol        STRING NOT NULL,
  exchange      STRING,
  ts            TIMESTAMP NOT NULL,
  bar_date      DATE NOT NULL,
  open          FLOAT64,
  high          FLOAT64,
  low           FLOAT64,
  close         FLOAT64,
  volume        INT64,
  vwap          FLOAT64,
  trades        INT64,
  range_pct     FLOAT64,         -- (high - low) / open
  momentum      FLOAT64,         -- close / open - 1
  gap           FLOAT64,         -- open / prev_close - 1 (overnight gap)
  prev_close    FLOAT64,         -- previous day's close
  source        STRING,
  ingested_at   TIMESTAMP NOT NULL
)
PARTITION BY bar_date
CLUSTER BY symbol, exchange
```
**Current size**: ~11,066 rows (1000 days, original 18 symbols; pending backfill for 30 new symbols)

### `quotes_live` — Real-Time Snapshots
```sql
CREATE TABLE market_data.quotes_live (
  symbol        STRING NOT NULL,
  exchange      STRING,
  ts            TIMESTAMP NOT NULL,
  quote_date    DATE NOT NULL,
  last_price    FLOAT64,
  prev_close    FLOAT64,
  day_open      FLOAT64,
  day_high      FLOAT64,
  day_low       FLOAT64,
  day_volume    INT64,
  bid_price     FLOAT64,
  ask_price     FLOAT64,
  bid_size      INT64,
  ask_size      INT64,
  source        STRING,
  ingested_at   TIMESTAMP NOT NULL,
  raw           JSON
)
PARTITION BY quote_date
CLUSTER BY symbol, exchange
```
**Current size**: Growing ~7,000 rows/day during market hours

---

## 6. Inflight Tasks

### Active / In Progress
- [x] **BQ streaming buffer cooldown** (fixed 2026-04-10): Replaced DELETE+INSERT with staging table + MERGE. Load jobs to `bars_1m_staging`/`bars_1d_staging` via `load_table_from_file` (no streaming buffer), then MERGE into canonical tables on `(symbol, exchange, ts)`. Idempotent, no duplicates, no buffer conflicts. Added `pipeline/validate_bq.py` for post-refresh duplicate detection and row count verification.
- [x] **Connect Setup Builder output to engine** (completed 2026-04-10): Builder validates payloads via setupValidator, calls setupRegistry.addSetup(), updates React state in main.jsx, scanner re-renders immediately. localStorage persistence for runtime-added setups. Toggle/remove controls in builder UI. Seed config (config/setups.js) is never mutated at runtime.
- [ ] **Backfill computed columns**: Existing 660K+ rows in bars_1m/bars_1d don't have range_pct/momentum/gap populated (only new data does).
- [ ] **Backfill new symbols**: CORZ, IREN, BX, APO, ARCC, OWL, OBDC, COIN, HYG, KRE, LQD, SPY, QQQ, TLT, SLV, GLD, XLF, XLE, TSLA, GOOG, AMD, PLTR, MSTR, SMCI, META, HOOD, BTDR, FXI need initial historical data load via `market_data_pipeline.py backfill`
- [~] **Live options data feed**: Polygon options snapshot endpoint is **NOT** entitled on the current plan (returns 403 NOT_AUTHORIZED). Lethal Board's polygonGlue capability probe surfaces this as `optionsCapability: unavailable_plan`. Premium values remain `estimated` or `unavailable`. ThetaData selected as the future provider (see Planned). Until then, premium honesty is enforced — UI never relabels estimated as live.
- [x] **IV rank integration** (completed 2026-04-11): Source-agnostic adapter with cache, Polygon options source, ATR fallback, manual entry API. Confidence-weighted scoring.

### Discovery Layer (Lethal Board) — Phases 1–4.5A1 complete (2026-05-01)
- [x] **Phase 1 — Backend foundation** (2026-05-01): types.js + capitalPolicyEngine + bundleClassifier + opportunityClassifier + capitalAwareRanker + scannerStateStore. 69 assertions.
- [x] **Phase 2 — Orchestrator + adapters** (2026-05-01): marketDiscoveryScanner + discoveryScoreAdapter + estimatedPremiumEngine. 65 assertions.
- [x] **Phase 3 — Polygon adapters + UI shell** (2026-05-01): polygonUniverseAdapter + polygonOptionsAdapter + discoveryAlertBridge + LethalBoard.jsx + lethalBoardViewModel. 72 assertions.
- [x] **Phase 4 — Polygon glue + visibility** (2026-05-01): polygonGlue (circuit breaker, capability probe), discoveryAlertWireup, LethalBoardPage, nav button in App.jsx + main.jsx. 57 assertions.
- [x] **Phase 4.1 — Controlled alert persistence** (2026-05-01): lethalBoardScanController; preview vs commit modes. 46 assertions.
- [x] **Phase 4.2 — Recorded alerts panel** (2026-05-01): recordedAlertsView (read-only sanitized projection). 54 assertions.
- [x] **Phase 4.3 — Rollup chip** (2026-05-01): recordedAlertsRollup (24h / 7d / new best / displaced). 70 assertions.
- [x] **Phase 4.4 — Card/detail UI refactor** (2026-05-01): RankedGrid, DetailPanel, ScoreRing, lifted selection, TC placeholder, view-model row enrichment. 108 assertions.
- [x] **Phase 4.5A — Session-aware universe + retire MOST_ACTIVE** (2026-05-01): marketSession, extendedHoursWatchlist, sessionAwareUniverse. 403 → UNAVAILABLE_PLAN distinction. 104 assertions.
- [x] **Phase 4.5A1 — Session-aware freshness policy** (2026-05-01): freshnessPolicy with regular 1080/1500/3600s, extended-hours 21600s, closed disabled, 6-hour prior-session safeguard. 72 assertions.
- [x] **Two clean commits pushed to origin/main** (2026-05-01): `511f14a` (phases 4.4–4.5A1) + `e7b6a9f` (README refresh).

### Planned
- [x] **Real-time WebSocket feed** (completed 2026-04-11): WS connection manager with reconnect, unified quote feed merging WS + poll, throttled updates, graceful fallback. 32 assertions.
- [x] **OXY, MOS, CF setups** (completed 2026-04-11): Added as standalone type through config registry. 10 total setups.
- [x] **Phase 4.5B — Selected Ticker Trade Construction Snapshot** (2026-05-01): Populated the existing `TRADE CONSTRUCTION — SELECTED TICKER` placeholder with execution-context fields. `tradeConstructionContext.js` whitelists 26 fields; `TradeConstructionSection.jsx` renders honest premium tone. 141 assertions.
- [x] **Phase 4.5C — ThetaData Options Provider Adapter (v2 implementation)** (2026-05-01): Built pluggable options-chain provider interface (`optionsProviderTypes.js`, `normalizeOptionChain.js`, `thetaDataProvider.js`, `optionsChainProvider.js`) targeting **legacy local Theta Terminal v2** (`http://127.0.0.1:25510/v2`). Strict security lock: no real secrets in `VITE_*`; only `VITE_THETADATA_ENABLED` / `VITE_THETADATA_BASE_URL` / `VITE_THETADATA_TIMEOUT_MS` are read. 297 assertions.
- [x] **Phase 4.5C+1 — Real Expiration Resolver** (2026-05-01): `expirationResolver.js` picks nearest valid expiration ≥ today + targetDte, fallback to nearest future. `fetchExpirations()` added to provider interface. Trade-construction context surfaces resolved expiration + reason. 80 assertions.
- [x] **Phase 4.5C+2 — Refactor adapter to ThetaData v3** (2026-05-02): Migrated `thetaDataProvider.js` + `.env.example` from `25510/v2` to `25503/v3`. Strike scaling (`* 1000`) removed; param names changed (`root`→`symbol`, `exp`→`expiration`); `right` is `call`/`put`; `format=json` added; HTTP 410 → `incompatible_version`; provider stamps `version: "v3"` on every HealthResult. 90 assertions (87 v3-specific + 3 wrapper-unwrap regression after live verification).
- [x] **Phase 4.5C+2.1 — Vite `/theta` proxy + v3 snapshot wrapper-unwrap parser** (2026-05-02): Added `vite.config.js` proxy entry routing browser→Terminal traffic same-origin (Terminal v3 emits no CORS headers). Patched `parseThetaDataV3SnapshotPayload` to unwrap the live v3 response shape `{response: [{contract, data: [{bid, ask, ...}]}]}` (verified verbatim against the running Terminal). End-to-end live data confirmed flowing.
- [~] **Phase 4.5C+3 — Market-hours quote validation**: After-hours baseline captured 2026-05-02 ~01:55 ET against 8 tickers (NVDA, BE, CRWV, NBIS, NEBX, IREN, SMCI, QQQ) — 8/8 returned normalized live snapshot rows; resolver fallback verified live on NEBX (thin chain → 2026-06-18). **Pending**: live-eyeball visual confirmation during regular session (Monday 2026-05-04 09:30–16:00 ET). See Session 33 (2026-05-01) for the per-ticker baseline table.
- [ ] **Phase 4.6 — Chart + Trade Workspace**: Expanded selected-ticker workspace (chart, levels, strike zone, option snapshot, operator actions Watch / Pass / Prepare Entry). Still no auto-trading.
- [ ] **Phase 4.5C-prereq — Holiday-aware session detection**: Embed NYSE holiday calendar into marketSession.js. Currently treats holidays as regular weekdays.
- [ ] **Cloud Run deployment**: Move scheduled tasks from local Windows Task Scheduler to Cloud Scheduler + Cloud Run for reliability

### Planned
- [x] **Real-time WebSocket feed** (completed 2026-04-11): WS connection manager with reconnect, unified quote feed merging WS + poll, throttled updates, graceful fallback. 32 assertions.
- [x] **OXY, MOS, CF setups** (completed 2026-04-11): Added as standalone type through config registry. 10 total setups.
- [ ] **Cloud Run deployment**: Move scheduled tasks from local Windows Task Scheduler to Cloud Scheduler + Cloud Run for reliability
- [x] **Dashboard reads from BQ** (completed 2026-04-11): Unified history provider (BQ > Polygon > cache) with proxy adapter. Daily context API. 21 assertions.
- [x] **True slope calculation** (completed 2026-04-11): priceHistory.js with linear regression slope from Polygon 1m bars. Integrated into stackReversalEvaluator and infraFollowerEvaluator with intraday-proxy fallback. 33 test assertions.
- [x] **Position persistence** (completed 2026-04-11): localStorage adapters with schema versioning. Persists workflow data, recomputes live values on load.
- [x] **Monte Carlo upgrade for options engine** (completed 2026-04-11): Full GBM path simulation (N=1000), true touch probability, max drawdown, price distribution percentiles. erf fallback retained.

### Experimental Ideas
- [x] **Alert notifications** (completed 2026-04-11): Multi-gate alert engine with browser notifications, console, webhook-ready. localStorage history + dedup. 34 assertions.
- [x] **Backtesting module** (completed 2026-04-11): Alert-driven backtest with outcome replay, gate replay, per-symbol stats, threshold comparison. 47 assertions.
- [ ] **Multi-user support**: Store setups per user in Firestore, allow multiple dashboard instances
- [ ] **NEBX vol drag visualization**: Show the compounding cost of holding the 2x leveraged ETF over time
- [x] **Stack reversal backtesting** (completed 2026-04-11): NVDA thesis replay with stage outcomes, NBIS vs NEBX comparison, target rates, MFE/MAE, follower picker accuracy. 37 assertions.
- [x] **Historical top-100 scanner** (completed 2026-04-11): Discovery mode in CreditVolScanner, filtered by quality, excludes curated symbols. 26 assertions.

---

## 7. Step-by-Step Reconstruction (Day 1 Setup)

### Prerequisites
- Node.js 18+
- Python 3.10+
- Google Cloud SDK (`gcloud`) with BigQuery API enabled
- Polygon.io developer tier API key
- GCP service account with BigQuery Data Editor role

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/hardymichelle11/trigger-engine.git
cd trigger-engine

# 2. Install frontend dependencies
npm install

# 3. Install Python dependencies
pip install requests google-cloud-bigquery

# 4. Create .env from template
cp .env.example .env
# Edit .env with your actual keys:
#   VITE_POLYGON_API_KEY=your_key
#   VITE_GCP_PROJECT=your_project_id

# 5. Place service account JSON
# Download from GCP Console > IAM > Service Accounts > Keys
# Save to: pipeline/service-account.json

# 6. Set pipeline env vars
export POLYGON_API_KEY="your_key"
export GOOGLE_CLOUD_PROJECT="your_project_id"
export GOOGLE_APPLICATION_CREDENTIALS="./pipeline/service-account.json"

# 7. Initialize BigQuery tables
python pipeline/market_data_pipeline.py init

# 8. Backfill historical data (takes ~15-20 min with 48 symbols)
python pipeline/market_data_pipeline.py backfill \
  --symbols NBIS,NEBX,QQQM,MSFT,NVDA,AAPL,AMZN,GOOGL,IWM,JEPI,JEPQ,CRWV,BE,VRT,ETN,POWL,BAM,BEPC,CORZ,IREN,BX,APO,ARCC,OWL,OBDC,COIN,HYG,KRE,LQD,SPY,QQQ,TLT,SLV,GLD,XLF,XLE,TSLA,GOOG,AMD,PLTR,MSTR,SMCI,META,HOOD,BTDR,FXI \
  --days_1m 90 --days_1d 1000

# 9. Start the dev server
npm run dev

# 10. Set up silent scheduled refresh (Windows)
# Edit pipeline/run_refresh.bat with your actual keys, then:
schtasks /create /tn "MarketData-LiveSnapshot" /tr "wscript.exe \"C:\path\to\pipeline\run_refresh.vbs\" refresh-live" /sc minute /mo 1 /f
schtasks /create /tn "MarketData-Bars1m" /tr "wscript.exe \"C:\path\to\pipeline\run_refresh.vbs\" refresh-1m" /sc minute /mo 15 /f
schtasks /create /tn "MarketData-Bars1d" /tr "wscript.exe \"C:\path\to\pipeline\run_refresh.vbs\" refresh-1d" /sc daily /st 17:00 /f
```

### Verify everything works
```bash
# Test manual refresh
python pipeline/refresh_schedule.py refresh-all --force

# Check BQ row counts
python -c "
from google.cloud import bigquery
c = bigquery.Client(project='YOUR_PROJECT_ID')
for t in ['bars_1m','bars_1d','quotes_live']:
    q = c.query(f'SELECT COUNT(*) as n FROM market_data.{t}')
    print(f'{t}: {list(q.result())[0].n:,} rows')
"

# Open dashboard at http://localhost:5173
```

---

## 8. File Tree

```
trigger-engine/
├── .env                          # Local secrets (gitignored)
├── .env.example                  # Template for required env vars
├── .gitignore                    # Blocks .env, service-account*.json, node_modules, dist, __pycache__
├── index.html                    # Vite entry point
├── package.json                  # Node dependencies
├── vite.config.js                # Vite config (HMR overlay disabled)
│
├── src/
│   ├── main.jsx                  # App router (Scanner <-> Setup Builder <-> Credit-Vol)
│   ├── App.jsx                   # Trigger engine dashboard + 5 setup evaluators (imports from registry)
│   ├── CreditVolScanner.jsx      # Credit-vol options engine UI (regime, cards, position mgr, income tracker)
│   ├── TickerSetupBuilder.jsx    # Ticker catalog UI + setup builder (imports from tickerCatalog.js)
│   ├── signalEngine.js           # Credit-vol engine: 12-section scoring/regime/timing/roll/probability
│   ├── optionsWatchlist.js       # 2026 top-27 + historical top-100 watchlist + scan filters
│   ├── tickerCatalog.js          # 48-ticker master catalog + filter/factory helpers
│   ├── App.css                   # Minimal (all styles inline)
│   ├── index.css                 # CSS reset
│   │
│   ├── config/
│   │   └── setups.js             # Setup definitions (single source of truth for all trigger engine setups)
│   │
│   └── lib/
│       ├── setupRegistry.js      # Setup registry: load, filter, resolve, symbol extraction, runtime mutations
│       ├── setupValidator.js     # Schema validation for setup objects (type-specific rules)
│       ├── priceHistory.js       # Slope/trend from bars_1m: linear regression, MA, acceleration, Polygon fetcher
│       ├── alerts/
│       │   ├── alertEngine.js    # Multi-gate condition evaluator (score, MC, IV, dedup)
│       │   ├── alertNotifier.js  # Pluggable delivery (browser, console, webhook)
│       │   └── alertHistory.js   # localStorage persistence + dedup tracking
│       ├── backtest/
│       │   ├── backtestEngine.js  # Trade outcome evaluator + alert gate replay
│       │   ├── backtestReporter.js # Summary stats, comparison, formatted reports
│       │   └── stackReversalBacktest.js # NVDA thesis replay: stage/follower/target analysis
│       ├── websocket/
│       │   ├── polygonSocket.js   # Polygon WS connection manager (auth, subscribe, reconnect)
│       │   └── quoteFeed.js       # Unified quote store merging WS + poll data
│       ├── bqReader.js            # Browser-side BQ query adapter via proxy endpoint
│       ├── historyProvider.js     # Unified history source: BQ > Polygon > cache
│       ├── discoveryScanner.js   # Historical top-100 scanner with quality filters
│       ├── calibration/
│       │   ├── calibrationTracker.js  # Observation recording, stats, quarterly reports
│       │   └── calibrationStorage.js  # localStorage persistence + export
│       └── structure/
│           ├── candlePatterns.js    # 8 candle pattern detectors (engulfing, hammer, doji, etc.)
│           ├── swingStructure.js    # Swing highs/lows, trend bias, BOS/MSS detection
│           ├── zoneDetection.js     # S/R band clustering from swings + ATR tolerance
│           ├── supplyDemand.js      # Base + displacement supply/demand zones
│           └── chartContextEngine.js # Orchestrator: unified context + bounded score adjustments
│       ├── iv/
│       │   ├── ivAdapter.js      # Source-agnostic IV rank provider (Polygon, manual, ATR fallback)
│       │   └── ivCache.js        # TTL-based in-memory cache with staleness tracking
│       └── storage/
│           ├── positionStorage.js  # localStorage adapter for short put positions (schema v1)
│           └── incomeStorage.js    # localStorage adapter for weekly income tracker (schema v1)
│
│   ├── components/
│   │   └── discovery/                         # Lethal Board UI (Phase 1–4.5A1)
│   │       ├── LethalBoard.jsx                 # Card/detail layout, ScoreRing, RankedGrid, DetailPanel
│   │       ├── LethalBoardPage.jsx             # Host page: scan modes, status panel, audit, rollup chip
│   │       ├── lethalBoardViewModel.js         # Pure projection (rows + best, with keyReasons + risks)
│   │       ├── lethalBoardScanController.js    # Preview/commit dispatcher (P4.1)
│   │       ├── recordedAlertsView.js           # Sanitized alertHistory projection (P4.2, frozen)
│   │       └── recordedAlertsRollup.js         # 24h / 7d / new best / displaced chip (P4.3, frozen)
│   │
│   └── engines/
│       └── discovery/                         # Capital-aware discovery backend (Phase 1–4.5A1)
│           ├── types.js                        # Frozen enums + JSDoc typedefs (P1)
│           ├── capitalPolicyEngine.js          # availableCash math, pressure, sizing bias (P1)
│           ├── bundleClassifier.js             # Symbol → thematic bundles (P1)
│           ├── opportunityClassifier.js        # 15 opportunity types, deterministic (P1)
│           ├── capitalAwareRanker.js           # lethalScore + bestUseOfCapital + displaced (P1)
│           ├── scannerStateStore.js            # Top-1 displacement tracker (P1)
│           ├── marketDiscoveryScanner.js       # Orchestrator (P2 + session-aware freshness P4.5A1)
│           ├── discoveryScoreAdapter.js        # Read-only normalizer for existing engine output (P2)
│           ├── estimatedPremiumEngine.js       # chain → iv → atr → insufficient_data (P2)
│           ├── polygonUniverseAdapter.js       # Polygon snapshot → marketDataBySymbol (P3 + retire MOST_ACTIVE P4.5A)
│           ├── polygonOptionsAdapter.js        # /v3 chain → optionsDataBySymbol (P3)
│           ├── polygonGlue.js                  # Circuit breaker + capability probe + UNAVAILABLE_PLAN (P4 + P4.5A)
│           ├── discoveryAlertBridge.js         # State events → alert objects (P3)
│           ├── discoveryAlertWireup.js         # Routes commit-mode events to alertHistory (P4)
│           ├── marketSession.js                # ET session detector (P4.5A)
│           ├── extendedHoursWatchlist.js       # Curated hybrid universe builder (P4.5A)
│           ├── sessionAwareUniverse.js         # Session × strategy orchestrator (P4.5A)
│           └── freshnessPolicy.js              # Session × mode freshness lookup + safeguard (P4.5A1)
│
├── pipeline/
│   ├── market_data_pipeline.py   # Core pipeline: BQ schema, Polygon fetch, backfill, staging+MERGE
│   ├── refresh_schedule.py       # Cost-optimized incremental refresh (staging+MERGE for bars, append for quotes)
│   ├── validate_bq.py            # Post-refresh validation: duplicates, row counts, staging health
│   ├── run_refresh.bat           # Env var wrapper for refresh_schedule.py
│   ├── run_refresh.vbs           # Silent execution wrapper (no console flash)
│   ├── setup_tasks.bat           # Windows Task Scheduler setup (legacy, use VBS instead)
│   └── service-account.json      # GCP credentials (gitignored)
│
├── docs/
│   ├── CLAUDE.md                 # Claude operating rules for this project
│   ├── WORK_QUEUE.md             # Prioritized task backlog (P1/P2/P3)
│   ├── DECISIONS.md              # Architecture decision log (append-only)
│   ├── ARCHITECTURE.md           # System design overview
│   ├── SETUP.md                  # Installation guide
│   ├── REFRESH_SCHEDULE.md       # Refresh cadence, cost estimates, deployment
│   ├── SESSION_NOTES/
│   │   ├── 2026-04-10.md         # Per-session summary (goals, built, decisions, open items)
│   │   ├── 2026-04-11.md
│   │   ├── 2026-04-12.md
│   │   ├── 2026-04-15.md
│   │   └── 2026-05-01.md         # Phase 1–4.5A1 + README refresh (current)
│   └── history/
│       └── SYSTEM_MANIFEST.md    # THIS FILE — update after each major session
│
├── scripts/
│   ├── test-discovery-engine.js          # Phase 1 — backend foundation tests (69)
│   ├── test-discovery-phase2.js          # Phase 2 — orchestrator + adapters (65)
│   ├── test-discovery-phase3.js          # Phase 3 — Polygon adapters + UI shell (72)
│   ├── test-discovery-phase4.js          # Phase 4 — Polygon glue + visibility (57)
│   ├── test-discovery-phase4-1.js        # Phase 4.1 — preview vs commit (46)
│   ├── test-discovery-phase4-2.js        # Phase 4.2 — recorded alerts panel (54)
│   ├── test-discovery-phase4-3.js        # Phase 4.3 — rollup chip (70)
│   ├── test-discovery-phase4-4.js        # Phase 4.4 — card/detail UI (108)
│   ├── test-discovery-phase4-5a.js       # Phase 4.5A — session-aware universe (104)
│   ├── test-discovery-phase4-5a1.js      # Phase 4.5A1 — session-aware freshness (72)
│   └── ... (existing engine validation scripts)
│
├── prompts/                      # Prompt templates (empty, ready for use)
├── assets/                       # Static assets (empty, ready for use)
└── dist/                         # Production build (gitignored)
```

---

## 9. GCP Configuration

| Setting | Value |
|---------|-------|
| Project ID | `supple-synapse-470605-c5` |
| Project Name | My Project 64591 |
| Dataset | `market_data` |
| Location | US |
| Service Account | `cr-daily-assess@supple-synapse-470605-c5.iam.gserviceaccount.com` |
| Required Role | BigQuery Data Editor |

---

## 10. Cost Summary

### Monthly estimates (~48 symbols, market hours only):

| Component | Monthly Cost |
|-----------|-------------|
| BQ streaming inserts | ~$2.50 |
| BQ active storage | ~$1.00 |
| BQ DML (rolling deletes) | ~$0.25 |
| Polygon API calls | $0 (developer tier) |
| **Total** | **~$3.75/month** |

### Daily API usage:
| Task | Calls/Run | Runs/Day | Total/Day |
|------|-----------|----------|-----------|
| Live snapshots | 48 | 390 | 18,720 |
| 1-minute bars | 48 | 26 | 1,248 |
| Daily bars | 48 | 1 | 48 |
| Ticker details | 48 | ~1 (cached) | 48 |
| **Total** | | | **~20,064** |

Note: Developer tier allows unlimited API calls. Watch for rate limiting at higher symbol counts.

---

## 11. Changelog

### 2026-05-02 (session 33 — ThetaData v3 end-to-end integration: refactor + proxy + parser fix + 8-ticker live baseline)

Phase 4.5C+2 / 4.5C+2.1 / 4.5C+3 (after-hours portion) shipped in a single late-night push following the Session 32 architectural decision. Six commits on `origin/main`: `9f579b7` (v3 adapter refactor + bundled 4.5B/4.5C/4.5C+1 source), `887e958` (Session 32 docs), `78a1951` (gitignore: jar/creds.txt/*.jar), `093cb13` (Vite `/theta` proxy + `.env.example`), `0285576` (v3 wrapper-unwrap parser fix + 3 regression assertions), `87077c0` (gitignore: config.toml).

**Integration trail and lessons** (full detail in Session 33 notes):
- Java upgraded from 17 → 26 (v3 jar requires class file 65 / Java 21+).
- `creds.txt` fix: literal "line 1:" / "line 2:" prefixes from instructions were copy-pasted into the file → auth failure → no port bind. Documentation lesson saved as feedback memory: never write inline line-number labels in config-file examples.
- Terminal-generated `config.toml` added to `.gitignore` (machine-specific).
- **CORS gap**: Terminal v3 ships no `Access-Control-Allow-Origin` header. Direct cross-origin browser fetch from `localhost:5173` to `127.0.0.1:25503` is blocked by the browser despite the Terminal serving 200 OK. Fixed via Vite dev-server proxy at `/theta` (Vite injects the CORS header on the proxied response).
- **v3 response shape mismatch**: real `/v3/option/snapshot/quote` response is `{response: [{contract: {...}, data: [{bid, ask, ...}]}]}` — bid/ask live one level deeper than Phase 4.5C+2 assumed. Parser patched to detect and unwrap the `{contract, data: [...]}` envelope.

**Phase 4.5C+3 after-hours validation baseline** (2026-05-02 ~01:55 ET): all 8 selected tickers returned a parsed snapshot row with `status: live` through the live adapter pipeline. NEBX (thin chain, only 12 expirations) verified the Phase 4.5C+1 resolver fallback path live in production data. No adapter changes required from the probe. Per-ticker bid/ask/mid baseline preserved in Session 33 notes for comparison against Monday's market-hours values.

**Pipeline state at session end**: ThetaData v3 local Terminal fully integrated; browser → Vite proxy → Terminal v3 → adapter → normalized row verified end-to-end across 8 tickers; no outstanding adapter or proxy issues. Frozen surfaces (Phase 1–4.4) untouched; Trigger Engine and CreditView unchanged.

### 2026-05-01 (session 32 — ThetaData v3 architectural decision; docs only, no code changes)

A docs-only investigation determined that Phase 4.5C / 4.5C+1 were built against the **legacy local Theta Terminal v2** model (`http://127.0.0.1:25510/v2`) but ThetaData has migrated the local Terminal to **v3** (`http://127.0.0.1:25503/v3`). v2 endpoints return HTTP 410 GONE on a v3 Terminal — they are not available side-by-side. Decision: **stay with the local Terminal architecture, refactor to v3** (Phase 4.5C+2, awaiting approval). The cloud-direct REST / Python library model is deferred — it would put email/password on the wire and require a backend proxy the dashboard does not have. Constraint reaffirmed: **no real ThetaData credentials in `VITE_*` env**; email/password live in `creds.txt` consumed by the local Terminal, never by the app bundle. Real-time options snapshot quotes require **VALUE tier or higher**; FREE is EOD-only. v2→v3 deltas captured in `docs/SESSION_NOTES/2026-05-01.md` (Session 32). No production code modified.

### 2026-05-01 (sessions 28–37 — Capital-Aware Discovery Layer: Phases 1–4.5A1, additive on Trigger Engine + CreditView)

The app gained a third core, complementary intelligence layer — **Lethal Board / Discovery Layer** — without modifying the existing Trigger Engine, Credit-Vol Scanner, signalEngine, setupScoring, chartContextEngine, liveStateEngine, calibrationTracker, alertEngine, alertHistory, or tickerCatalog. Architecture is now three-layer: **Trigger Engine + CreditView + Lethal Board**. CreditView remains a core, ongoing layer; it was not replaced or deprecated. Two clean commits pushed to origin/main: `511f14a` (phases 4.4–4.5A1 code) and `e7b6a9f` (README refresh).

**Phase 1 — Backend foundation** (`src/engines/discovery/`):
- `types.js`: frozen enums (MARKET_MODE, CAPITAL_PRESSURE, SIZING_BIAS, CAPITAL_FIT, OPPORTUNITY_TYPE, ACTION, BUNDLE, SCANNER_STATE_EVENT) + JSDoc typedefs.
- `capitalPolicyEngine.js`: `evaluateCapitalPolicy({ totalAccountValue, availableCash, maxDeployedPct, reservedCashBufferPct, currentOpenPositions, marketMode })` — `availableCash` (not `totalAccountValue`) drives deployable + reserved math.
- `bundleClassifier.js`: 47-symbol explicit map + tickerCatalog tag enrichment + sector hints. Uncataloged → `unknown_sector` / `unknown_category`.
- `opportunityClassifier.js`: 15 opportunity types, multi-type per candidate, deterministic.
- `capitalAwareRanker.js`: `lethalScore`, single `bestUseOfCapital`, `displacedBy`, action selection. Hard rule: unaffordable trades cannot win bestUseOfCapital.
- `scannerStateStore.js`: pluggable storage; emits `new_best_opportunity` / `trade_displaced_by_better_opportunity` / `no_change`.
- 69 assertions.

**Phase 2 — Orchestrator + adapters**:
- `discoveryScoreAdapter.js`: pure, non-mutating normalizer for existing engine outputs.
- `estimatedPremiumEngine.js`: 4-method estimation (chain_based → iv_estimated → atr_estimated → insufficient_data), per-mode floors.
- `marketDiscoveryScanner.js`: `runMarketDiscoveryScan({...})` — full pipeline with universeStats, explicit rejection codes (missing_market_data / stale_data / insufficient_liquidity / etc), displaced[], bestUseOfCapital, warnings[]. Injectable `now` for tests.
- 65 assertions.

**Phase 3 — Polygon adapters + Lethal Board UI shell** (`src/components/discovery/`):
- `polygonUniverseAdapter.js` + `polygonOptionsAdapter.js`: snapshot normalization with DI fetcher; structured-absence on missing chain.
- `discoveryAlertBridge.js`: state events → alertEngine-compatible alert objects with built-in dedup (15 min default).
- `lethalBoardViewModel.js` + `LethalBoard.jsx`: 6-section layout (Header summary, Best Opportunity, ranked rows, Displaced, Rejected, Warnings). Honest premium labeling (live / estimated / unavailable). Internals stripped.
- 72 assertions.

**Phase 4 — Polygon glue + visibility**:
- `polygonGlue.js`: wires `polygonProxy.js` into adapters with per-call timeout (8 s), circuit breaker (3 failures → 30 s cooldown → half-open), `/v3/snapshot/options/{underlying}` capability probe with 1-hour TTL cache. Live failures **never throw** — resolve to `source: live | circuit_open | fallback | empty | proxy_unreachable`.
- `discoveryAlertWireup.js`: single-call `route(scanResult)` pumping top candidate through scannerStateStore → discoveryAlertBridge → injected `recordAlertFn`. Suppresses no_change. Tracks `stats()`.
- `LethalBoardPage.jsx` + small additive edits to `App.jsx` (+9 lines: nav button) and `main.jsx` (+5 lines: route + callback). **LB visible from the Trigger Engine sidebar.**
- 57 assertions.

**Phase 4.1 — Controlled alert persistence**:
- `lethalBoardScanController.js`: pure factory dispatching by mode. PREVIEW_SAMPLE / PREVIEW_LIVE never call `recordAlert`; only COMMIT_LIVE routes through the wireup.
- `LethalBoardPage`: three buttons (sample preview, live preview, **Run & record**). New `<ScanStatusPanel>` with `mode · event · recorded · reason`. Imports `recordAlert` from existing `alertHistory.js` (read-only consumer).
- 46 assertions.

**Phase 4.2 — Read-only Recorded Alerts panel**:
- `recordedAlertsView.js` (frozen after acceptance): pure projection with derived `event` (from summary prefix) and `displacedFrom` (from "X displaced Y" pattern). Hard-clamps limit to [1, 50] (default 8). Strips internals.
- `<RecordedAlertsPanel>` in LethalBoardPage with `useEffect` initial load + refresh after COMMIT_LIVE. Empty state copy: "No recorded discovery alerts yet. Run & record to commit one."
- 54 assertions including hostile-fields safety group.

**Phase 4.3 — Sanitized rollup chip**:
- `recordedAlertsRollup.js` (frozen after acceptance): `computeAlertsRollup(projectedRows, { now })` returning exactly `{ today, thisWeek, newBest, displaced }`. Rolling 24 h / 7 d windows from injected `now`. Strict null check (Number(null)=0 cannot sneak through).
- Chip rendered in existing RecordedAlertsPanel header strip; computed from in-scope `alerts` prop. **No new fetch, no new state, no new effect.**
- 70 assertions including source-code audit (helper does not import `alertHistory` or `loadAlertHistory`).

**Phase 4.4 — Card/detail UI refactor**:
- `LethalBoard.jsx` rewritten: `<RankedGrid>` (clickable cards) + `<DetailPanel>` (right column). Discovery-local `<ScoreRing>` SVG component. `<BundlePills>`, `<ActionPill>`. Best Opportunity card promoted with same ScoreRing for visual continuity.
- `<TradeConstructionPlaceholder>` reserved space inside DetailPanel for Phase 4.5B.
- `lethalBoardViewModel.js` enriched: each row now carries `keyReasons` and `risks` arrays (using existing private helpers). Phase 3 safety regression preserved — internals still stripped.
- `LethalBoardPage.jsx` lifts `selectedSymbol` state with `useEffect` to seed default selection on scanResult change. **Lifted now so Phase 4.5B can observe selection without a second refactor.**
- 108 assertions.

**Phase 4.5A — Session-aware universe + retire MOST_ACTIVE**:
- Diagnostic phase: confirmed `/v2/snapshot/locale/us/markets/stocks/most_active` returns 404 on Polygon (endpoint does not exist). Confirmed `/v3/snapshot/options/{ticker}` returns 403 NOT_AUTHORIZED on current Polygon plan.
- `marketSession.js`: pure session detector (premarket / regular / postmarket / closed) via `Intl.DateTimeFormat("en-US", { timeZone: "America/New_York" })`. Holiday detection deferred (Phase 4.5C-prereq).
- `extendedHoursWatchlist.js`: curated hybrid (tickerCatalog enabled non-cash-settled + optionsWatchlist 2026 active list, deduped, capped 50, AI-infra first).
- `sessionAwareUniverse.js`: orchestrator. Regular = gainers + losers union; premarket/postmarket = bulk-tickers with curated symbols; closed = last-known curated with `Markets closed` warning.
- `polygonUniverseAdapter.js`: added `SESSION_AWARE`, `REGULAR_GAINERS`, `REGULAR_LOSERS`, `REGULAR_SNAPSHOT`, `EXTENDED_HOURS_DERIVED` enum values. **MOST_ACTIVE retired** — pathForSource returns `DEPRECATED_SOURCE_MARKER`; no HTTP call to `/most_active` is ever produced.
- `polygonGlue.js`: capability probe distinguishes `err.status === 403` → `OPTIONS_CAPABILITY.UNAVAILABLE_PLAN`. fetchOptionsLive gate short-circuits on either `UNAVAILABLE` or `UNAVAILABLE_PLAN`. fetchScannerInputBundle dispatches SESSION_AWARE.
- `LethalBoardPage.jsx`: one-line value swap `MOST_ACTIVE` → `SESSION_AWARE`.
- 104 assertions.

**Phase 4.5A1 — Session-aware freshness policy**:
- Diagnostic phase: confirmed Polygon's snapshot endpoints are ~15 min delayed on the current plan tier — `updated` and `lastTrade.t` for NVDA/AAPL/QQQ all read at age 900–903 s, just past the 900 s neutral threshold. Mode-only freshness was rejecting nearly all regular-session data.
- `freshnessPolicy.js`: `resolveFreshnessPolicy({ session, scannerMode })` returning `{ maxStaleSec, disabled, source, justification }` or `{ disabled: true }` for closed. Lookup table: regular conservative 1080 s / neutral 1500 s / aggressive 3600 s; extended hours 21600 s for all modes; closed disabled. `PRIOR_SESSION_SAFEGUARD_SEC = 21600 s` catches yesterday's quotes during regular session regardless of mode.
- `marketDiscoveryScanner.js`: accepts `args.session` or `args.regimeContext.session`. Stale-check uses policy-resolved threshold; closed session skips the check entirely. Prior-session safeguard added.
- `LethalBoardPage.jsx`: forwards `bundle.metadata.universe.session` to scanner. Metadata forwarding, not UI hardcoding. Verified by grep that no UI file hardcodes any threshold value.
- 72 assertions.

**README + manifest refresh**:
- `README.md` replaced (was default Vite template). Three-layer architecture explicitly documented; Lethal Board described as **additive**, not a successor; CreditView described as core, ongoing; no claims about live options chain, ThetaData implementation, auto-trading, or proprietary internals.
- This manifest entry.

**Tests added (phase × assertions):** 69 + 65 + 72 + 57 + 46 + 54 + 70 + 108 + 104 + 72 = **717 new assertions across 10 phase test scripts**, all passing. Existing engine validation (`npm run validate`) remains 100/100 green. Production build clean (542 kB JS / 24 kB CSS / 317 ms).

**Frozen surfaces (do not modify):** `recordedAlertsRollup.js`, `recordedAlertsView.js`, `alertHistory.js`, `LethalBoard.jsx` (P4.4-locked), `lethalBoardViewModel.js` (P4.4-locked), and all existing scoring / ranking / capital policy / persistence / alert files.

**Roadmap (Lethal Board only, additive):** Phase 4.5B Trade Construction Snapshot · Phase 4.5C ThetaData Options Provider Adapter · Phase 4.6 Chart + Trade Workspace.

---

### 2026-04-15 (session 27 — Credit-Vol regime pipeline + validation fix)
- **creditVolRegimeV2.js**: Fixed `_invalidDataResult` crash (undefined function). Added `_dataUnavailableResult` with null scores, `allowNewTrades: false`. Added LQD to composite scoring, feature extraction, indicators, percentiles (was excluded despite 0.15 weight). Fixed `|| 0` → `?? 0` coercion. Added `strictParseNumeric`, `validateRegimeValue`, `validateRegimeData` with per-symbol diagnostics, freshness/staleness tracking. Engine output now includes `dataAvailable` flag and `diagnostics` object.
- **CreditVolScanner.jsx**: Fixed VIX/TNX symbol mapping — routed through worker `/index/` endpoint (Yahoo Finance) since Polygon plan lacks index access. Fixed `day.c || prevClose` coercion and history deduplication that dropped flat days below 2-bar minimum. Added `SymbolStatusBadge` (LIVE/STALE/MISSING/FALLBACK). Added DATA_UNAVAILABLE UI state with "MISSING INPUTS" badge, null score bar. Source tracking metadata through pipeline.
- **polygon-proxy.js** (worker): Added `/index/:symbol` endpoint fetching VIX/TNX from Yahoo Finance via `query2.finance.yahoo.com`. Polygon-compatible response shape. 60s cache. Worker deployed.
- **test-regime-v2.js**: Added Cases 6-9: null payloads, zero rejection, negative rejection, mixed valid/invalid, NaN handling, fallback_close detection, LQD scoring, no-confident-bias-with-invalid-data. 86 total assertions.

### 2026-04-12 (session 26 — CV Scanner registry target wiring)
- **CreditVolScanner.jsx**: `buildSetups` now reads real T1/T2/T3 targets and stop levels from setup registry via `_buildTargetLookup()`. `distT1Pct` computed from actual target prices. `leaderPrice`, `isLeveraged`, `targets`, `stop` passed to liveState engine.

### 2026-04-12 (session 25 — Landing page user-tested redesign)
- **LandingPage.jsx**: Rebuilt through 6 iterations based on user feedback. About Us + 10 product capabilities (feature+benefit). Trading chart SVG visualization. Tagline strip with divider lines. Mobile responsive. No proprietary engine details. Single Launch Dashboard button.

### 2026-04-12 (sessions 22-24 — Live-state recalibration + observability + BQ ops)
- **liveStateEngine.js**: Universal recalibration framework. 3-layer architecture (setupDefinition → liveMarketState → derivedState). Recalc triggers: price drift, regime change, IV/ATR shift, leverage gap, TTL. `shouldRecalculate`, `buildLiveState`, `renderSafeCardState`, `isAlertSafe`, `getFreshnessStatus`. Reason codes, telemetry log, debug mode.
- **recalcMonitor.js**: `computeFreshnessMetrics`, `computeRecalcAnalytics`, `computeInvalidationAnalytics`, `getHealthSnapshot`.
- **opsEventCollector.js**: localStorage-backed event buffer for recalc/invalidation/alert events. 4 event types, rolling 5000 max, drain/clear APIs.
- **alertEngine.js**: Gate 0 freshness safety blocks stale cards. `blockedByFreshness` + `freshnessReason`.
- **CreditVolScanner.jsx**: `HealthPanel`, `FreshnessBadge`, per-card STALE/BLOCKED badges.
- **flush-ops-metrics.js**: Drains events to JSON + BQ (3 tables: `ops_recalc_events`, `ops_invalidation_events`, `ops_alert_events`). Windows Task Scheduler: `MarketData-OpsFlush` daily 4:10 PM.

### 2026-04-12 (sessions 19-21 — Regime calibration + knowledge bot + landing page)
- **Regime context in calibration**: `regimeContext` wired into `buildUiCard` and calibration snapshots. Regime-grouped stats. Quarterly regime-conditioned recommendations. CSV export with 6 regime columns.
- **Knowledge bot**: 4 modes (OFF/FAQ_ONLY/SEARCH_ONLY/FULL_CHAT), budget guardrails, usage tracker, 14 FAQs + glossary, Vertex AI backend (Gemini 2.5 Flash), `KnowledgeBotPanel` in scanner sidebar.
- **Landing page**: Initial build with Tailwind CSS v4, framer-motion, lucide-react. Later redesigned through multiple iterations.
- **npm run validate**: 17 test suites, 746 total assertions.

### 2026-04-11 (session 18 — Self-calibration tracking system)
- **Calibration tracker** (`src/lib/calibration/calibrationTracker.js`):
  - `recordCalibrationSnapshot(cards)`: Inspects scored cards after each scan, records per-symbol observations with baseline vs enhanced scores, ATR penalty flag, positive bonus flag, chart adjustments. 5-minute dedup window.
  - `markAlertsFired(symbols)`: Updates observations with alert status after alert engine runs.
  - `recordOutcomeUpdate(id, { sessionsOut, outcome, justified })`: Manual outcome entry for quarterly review.
  - `getCalibrationStats({ from, to })`: Rolling stats — ATR penalty rate, positive bonus rate, avg delta, alert rates, outcome/justified breakdowns, top penalties/bonuses.
  - `getQuarterlyCalibrationReport()`: Full report with recommendation (keep weights / reduce ATR / increase bonus / no action).
  - `formatCalibrationReport()`: Human-readable text output.
- **Calibration storage** (`src/lib/calibration/calibrationStorage.js`): localStorage with in-memory fallback for Node.js tests. Schema v1, max 2000 observations rolling. CRUD operations + export.
- **signalEngine.js**: `buildUiCard` now exposes `baselineScore` (pre-chart-context) alongside `score` (post-chart-context) for calibration comparison.
- **CreditVolScanner.jsx**: Refresh cycle records calibration snapshot after each scan + marks alerted symbols.
- **CLI tools:**
  - `npm run calibration:export`: Exports to JSON, CSV, and quarterly report text in `logs/calibration/`.
  - `npm run calibration:update -- --list`: Shows unreviewed observations.
  - `npm run calibration:update -- --id X --outcome HIT_T1 --justified YES --sessions 3`: Updates outcome.
  - `npm run calibration:update -- --symbol NVDA`: Shows observations for a symbol.
- **test-calibration.js**: 46 assertions — empty state, observation recording, shape validation, ATR/bonus detection, dedup, outcome update, stats with outcome, quarterly report, export shape, clear.
- **npm run validate**: 14 test suites, 454 total assertions.

### 2026-04-11 (session 17 — Calibration pass)
- **Calibration harness** (`scripts/run-calibration.js`): Compares baseline scoring vs chart-context-enhanced scoring across 4 synthetic scenarios (clean uptrend + demand, trap under resistance, neutral sideways, reversal at support). Measures per-adjustment impact, signal changes, alert eligibility changes.
- **Calibration findings:**
  - Avg score delta: -3.8 (appropriately cautious — penalties fire more than bonuses)
  - ATR extension penalty (-5) is the most impactful single adjustment (fires on 4/4 scenarios)
  - Clear air to T1 (+5) fires correctly for the clean scenario
  - Zero signal changes, zero alert eligibility changes — chart context acts as refinement, not override
  - Demand zone detection fires less often on synthetic data (expected — real market data will show more hits)
  - **Recommendation: current v1 weights are well-balanced. Monitor with real market data before adjusting.**
- **CLI**: `npm run calibrate` runs the full calibration pass with detailed per-scenario trace output.

### 2026-04-11 (session 16 — Sprint M: Chart context engine)
- **Chart structure modules** (`src/lib/structure/`):
  - `candlePatterns.js`: Detects 8 patterns (bullish/bearish engulfing, hammer, shooting star, doji, inside bar, outside bar, three-bar reversal) from OHLCV with confidence scoring. Pure numeric detection, no visual parsing.
  - `swingStructure.js`: Pivot-point swing high/low detection, higher high/low counting, trend bias (BULLISH/BEARISH/NEUTRAL), break of structure (BOS_UP/BOS_DOWN) and market structure shift (MSS_UP/MSS_DOWN) events.
  - `zoneDetection.js`: ATR-based clustering of swing levels into support/resistance bands with touches, confidence, freshness. Nearest support/resistance with % distance.
  - `supplyDemand.js`: Base + displacement zone detection. Demand = consolidation then upward impulse > 1.5 ATR. Supply = reverse. Tracks tested vs fresh zones.
  - `chartContextEngine.js`: Orchestrator that combines all layers. `getChartContext()` returns unified analysis with bounded score adjustments (±15 max). Feature flag `ENABLE_CHART_CONTEXT`.
- **Score adjustments (capped at ±15):**
  - Fresh demand/support confluence near entry: +5
  - Clean air to T1 before resistance: +5
  - Higher low held at demand zone: +3
  - Bullish reversal candle at support/demand: +3
  - Fresh supply zone near target: -8
  - Entry directly under resistance: -6
  - ATR overextended: -5
- **signalEngine.js**: `buildUiCard` integrates chart context — merges score adjustments, appends chart-context trace entries to combined score trace, re-evaluates signal if score shifted.
- **CreditVolScanner detail panel**: New "CHART CONTEXT — ENTRY / EXIT QUALITY" section showing nearest support/resistance (% distance), ATR extension state, trend bias, demand/supply zone status, room to T1 with clear path indicator.
- **test-structure.js**: 54 assertions covering all 5 modules — candle patterns (engulfing, hammer, doji, inside bar, empty input, shape), swing structure (uptrend/downtrend bias, higherHighs, lowerLows, events), zones (ATR, S/R bands, zone shape), supply/demand (demand zones, empty input), chart context engine (full output shape, score cap, empty/null safety, room to target, feature flag).
- **npm run validate**: 13 test suites, 408 total assertions.

### 2026-04-11 (session 15 — Sprint L: Historical top-100 scanner)
- **Discovery scanner** (`src/lib/discoveryScanner.js`): Scans historical top-100 watchlist symbols NOT already in the curated 2026 scan. Filters by spread quality (A+/A) and wheel suitability (High/Medium). Fetches Polygon snapshots in batches of 5, runs through the same scoring engine (`buildScannerState`), enriches cards with discovery metadata (histRank, spreadQuality, wheelSuit).
- `getDiscoveryCandidates()`: Returns filtered candidates excluding curated symbols, sorted by histRank.
- `runDiscoveryScan()`: Full pipeline — candidates → snapshots → setups → scoring → ranked cards.
- `getDiscoveryPreview()`: Stats summary without fetching (candidate count, rank range, quality breakdown).
- **CreditVolScanner UI**: DISCOVERY toggle button in scan filter bar (amber). When active, shows top 10 discovery candidates ranked by score with rank badge, spread quality, wheel suitability indicators. RESCAN button for manual refresh.
- **test-discovery.js**: 26 assertions — candidate exclusion, quality filters, sort order, custom filters, preview shape, no duplicates, curated exclusion, edge cases.
- **npm run validate**: 12 test suites, 354 total assertions.
- **All original work queue items now complete.** Remaining: Cloud Run deployment (deferred for cost).

### 2026-04-11 (session 14 — Sprint K: Stack reversal backtesting)
- **Stack reversal backtest** (`src/lib/backtest/stackReversalBacktest.js`):
  - `evaluateStackEvent()`: Takes an NVDA reversal event (stage, power strength, follower lag, forward prices for NVDA/NBIS/NEBX) and measures: T1/T2/T3 target hit rates, stop hit, MFE/MAE, time to target, leader forward move, follower picker accuracy.
  - `runStackBacktest()`: Batch evaluation.
  - `summarizeStackBacktest()`: Aggregates by stage (EARLY/MID/LATE), by follower (NBIS vs NEBX), follower picker accuracy, avg leader forward move.
  - `formatStackReport()`: CLI report showing stage breakdown, follower comparison, per-event detail with picker correctness.
- **CLI**: `npm run backtest:stack` runs 8 synthetic NVDA reversal scenarios covering EARLY (4), MID (3), LATE (1) stages. Shows win rate by stage, NBIS vs NEBX T1/T2/T3 rates, MFE/MAE, and follower picker accuracy.
- **test-stack-backtest.js**: 37 assertions — clean win, loss, stall, MFE/MAE capture, follower picker, leader move, insufficient data, batch, summary stats, stage breakdown, follower group stats, report format, stage-based outcome comparison.
- **npm run validate**: 11 test suites, 328 total assertions.

### 2026-04-11 (session 13 — Sprint J: Dashboard reads from BQ)
- **BQ reader** (`src/lib/bqReader.js`): Browser-side adapter that queries BigQuery via a configurable proxy endpoint (`VITE_BQ_PROXY_URL`). Queries for 1m bars (closes for slope), 1d bars (daily context), and parameterized SQL. Returns null when proxy is not configured (graceful fallback).
- **History provider** (`src/lib/historyProvider.js`): Unified source chain: cache (3 min TTL) → BQ proxy → Polygon REST → stale cache → empty. Returns same `{ closes, source }` shape regardless of origin. `getTrendBatch()` replaces direct `fetchTrendData()` calls. Also provides `getDailyContext()` for richer BQ-only data (gap, prev_close series, period high/low, avg range/volume).
- **App.jsx**: Slope computation now uses `getTrendBatch()` from history provider instead of direct Polygon call. Status bar shows "BQ" badge when proxy is configured. Provider status accessible via `getProviderStatus()`.
- **test-history.js**: 21 assertions — provider status shape, BQ unavailable without proxy, empty results without API key, cache clear, source chain priority, trend metadata, status fields.
- **npm run validate**: 10 test suites, 291 total assertions.

### 2026-04-11 (session 12 — Sprint I: WebSocket live feed)
- **Polygon WebSocket connection manager** (`src/lib/websocket/polygonSocket.js`):
  - Connects to `wss://socket.polygon.io/stocks`, authenticates, subscribes to per-second aggregates (`A.*`).
  - Exponential backoff reconnect (max 5 attempts). Heartbeat stale detection (30s). Graceful UNSUPPORTED state for developer tier.
  - `createPolygonSocket()` returns controller with connect/disconnect/getState/getStats/updateSymbols.
- **Unified quote feed** (`src/lib/websocket/quoteFeed.js`):
  - Merges WS per-second aggregates with REST poll baseline into one quote map. WS updates price/high/low/volume. Poll provides prevClose/name/exchange (WS doesn't carry these).
  - Fresh WS data (< 60s) is preserved during re-polls — poll only updates metadata fields on WS-fresh symbols.
  - Throttled downstream notifications (5s max) to prevent re-render storms.
  - Source map: tracks per-symbol source (websocket vs poll), updatedAt, stale flag. Feed health summary.
- **App.jsx**: Connects WS on mount for evaluator-critical symbols. Merged quotes used when WS connected (falls back to poll-only otherwise). Auto-refresh adjusts: 120s when WS live, 60s when polling. Status bar shows `● LIVE (Xws/Ypoll)` or `○ WS N/A`.
- **CreditVolScanner.jsx**: Separate WS connection for scanner symbols. Same merge/fallback pattern. Feed health shown in scan timestamp row.
- **test-websocket.js**: 32 assertions — empty feed, poll population, WS overwrite, prevClose preservation, source tracking, feed health, re-poll doesn't overwrite fresh WS, listener subscribe/unsubscribe, reset, WS_STATE enum, new symbol creation.
- **npm run validate**: 9 test suites, 270 total assertions.

### 2026-04-11 (session 11 — Sprint H: backtesting harness)
- **Backtest engine** (`src/lib/backtest/backtestEngine.js`):
  - `evaluateTradeOutcome()`: Takes a trade setup + forward price series, measures: expired above strike, strike touched (+ day), max favorable excursion, max adverse excursion, P&L (credit vs intrinsic loss), days to profit target. Result categories: WIN, LOSS, SCRATCH, OPEN.
  - `runBacktest()`: Batch evaluation of multiple trades.
  - `replayAlertGates()`: Re-evaluates alert gate conditions on historical card data without needing the full scanner pipeline. Same 7-gate logic as production alerts.
- **Backtest reporter** (`src/lib/backtest/backtestReporter.js`):
  - `summarizeBacktest()`: Aggregates outcomes into win rate, avg P&L, touch rate, avg MFE/MAE, days to profit, per-symbol breakdown.
  - `compareBacktests()`: Delta comparison between two threshold configurations (trade count change, win rate change).
  - `formatReport()`: Human-readable CLI output.
- **CLI**: `npm run backtest` runs 10 synthetic trade scenarios (NVDA, NBIS, CRWV, COIN, TSLA, ARCC, AMD, BX, SPY, MSTR) with realistic price paths. `npm run backtest -- --strict` compares tighter thresholds.
- **test-backtest.js**: 47 assertions — clean win, clean loss, touch+recover, scratch, MFE, MAE, insufficient data, profit target detection, batch, summary stats, empty summary, comparison, report format, gate replay (pass, score fail, touch fail, strict thresholds).
- **npm run validate**: 8 test suites, 238 total assertions.

### 2026-04-11 (session 10 — Sprint G: alert notifications)
- **Alert engine** (`src/lib/alerts/alertEngine.js`): Multi-gate condition evaluator with configurable thresholds. Gates: score (GO/WATCH), action filter, MC probability above strike (>= 65%), touch probability (<= 40%), avg max drawdown (<= 8%), IV percentile (>= 50), IV confidence (excludes "none"), dedup window (15 min). Returns structured `AlertResult` with `shouldAlert`, `priority` (high/medium/low), `passedGates`, `failedGates`, `summary`.
- **Alert notifier** (`src/lib/alerts/alertNotifier.js`): Pluggable delivery — browser Notification API (with permission request), console logging, webhook-ready `notifyWebhook()` for Slack/Discord/email. `sendAlerts()` dispatches through all enabled channels.
- **Alert history** (`src/lib/alerts/alertHistory.js`): localStorage persistence (schema v1, max 100 entries), dedup via in-memory recent-alerts set, stats API (total, last 24h, high priority count).
- **CreditVolScanner**: ALERTS toggle button in controls bar. Refresh cycle evaluates alerts when enabled, sends via notifier, records in history, updates log state. Alert history panel at bottom shows last 20 alerts with priority indicators, symbol, action, score, probability, timestamp. CLEAR button wipes history.
- **test-alerts.js**: 34 assertions — all gates pass, each gate blocks individually (score, action, prob, touch, drawdown, IV confidence, IV percentile), dedup blocking + expiry, different symbol not blocked, erf fallback, custom thresholds, batch evaluation, threshold shape.
- **npm run validate**: 7 test suites, 191 total assertions.

### 2026-04-11 (session 9 — Sprint F: Monte Carlo upgrade)
- **Monte Carlo probability layer**: Replaced simplified erf approximation with full path-based Monte Carlo simulation in `probabilityLayer.js`
  - `monteCarloEstimate()`: Simulates N price paths (default 1000) using geometric Brownian motion over DTE steps. IV percentile → annualized IV → daily vol. Checks path-dependent touch probability (did any step reach strike), final price distribution, average max drawdown.
  - `estimateProbability()`: Public API that uses MC by default, falls back to erf via `{ useMC: false }`.
  - Output enriched: `method` (monte_carlo vs erf_approximation), `paths`, `steps`, `avgMaxDrawdown`, `distribution` (P10/P25/P50/P75/P90), `assumptions` (annualizedIV, dailyVol, atrMultiple).
  - erf retained as fallback for malformed inputs or explicit opt-out.
- **CreditVolScanner detail panel**: Shows MC method badge, distribution percentiles, avg max drawdown, annualized IV and daily vol assumptions.
- **test-mc.js**: 31 assertions — deep OTM, ATM, ITM, IV sensitivity, DTE sensitivity, ATR expansion, distribution ordering, drawdown bounds, null inputs, API shape, erf fallback, convergence check (two 5K-path runs within 5%).
- **npm run validate**: 6 test suites, 157 total assertions.

### 2026-04-11 (session 8 — P2 complete: OXY/MOS/CF + score explainability)
- **OXY, MOS, CF setups**: Added as standalone type through config registry. 10 total setups now (was 7). Mock quotes in App.jsx, pipeline DEFAULT_SYMBOLS updated in both files. Uses existing standalone evaluator — no new evaluator type needed (standalone does regime + vol + momentum which is correct for commodity singles).
- **Score explainability trace**: `scoreSetup()` now builds a `scoreTrace` array recording every scoring contribution with points and human-readable reason. Surfaced in CreditVolScanner detail panel as "SCORE TRACE — WHY THIS SCORE" with per-line breakdown (green for positive, red for negative) and clamped total. Covers: regime, leader/power/follower signals, IV contribution with source + confidence note, ATR expansion, support, timing, combos, watchlist quality, trap penalties.
- **P2 complete**: All 5 P2 items now done (slope, backfill columns, IV rank, options data, OXY/MOS/CF).
- **npm run validate**: 5 suites, 126 assertions (10 setups + 22 engine + 21 watchlist + 33 slope + 40 IV).

### 2026-04-11 (session 7 — Sprint E: IV rank adapter)
- **IV adapter layer**: Source-agnostic IV rank provider (`src/lib/iv/ivAdapter.js`)
  - Core contract: `getIvRank(symbol, options)` returns `{ symbol, ivRank, source, asOf, stale, confidence, ivCurrent, iv52High, iv52Low }`
  - Sources (priority order): cache → Polygon options snapshot → stock snapshot extraction → ATR-based estimate → stale cache → null
  - `getIvRankBatch()` for multi-symbol with rate-limit batching
  - `setIvRankManual()` for manual entry or broker data paste (Thinkorswim, Fidelity)
  - Input clamping (0-100), source tagging, confidence levels
- **IV cache** (`src/lib/iv/ivCache.js`): TTL-based in-memory cache (default 5 min). Stale entries still returned but flagged. Stats API for debug.
- **CreditVolScanner**: Refresh cycle now calls `getIvRankBatch()` before `buildSetups()`. Real IV data flows through to setup objects as `ivPercentile`, `ivSource`, `ivConfidence`. UI shows checkmark on non-estimate IV values.
- **setupScoring.js**: IV contribution is confidence-weighted — full 10pts for high/medium confidence, 60% (6pts) for low-confidence ATR estimates. Diagnostics include `ivConfident` and `ivFromRealSource` flags.
- **signalEngine.js**: `buildUiCard` metrics now include `ivSource` and `ivConfidence` for UI display.
- **test-iv.js**: 40 assertions covering null/empty, ATR fallback, cache set/get, staleness, manual entry, clamping, contract shape.
- **npm run validate**: 5 test suites, 123 total assertions.

### 2026-04-11 (session 6 — Sprint D: true slope calculation)
- **priceHistory.js**: New reusable slope/trend utility (`src/lib/priceHistory.js`) with:
  - `computeSlope()`: Linear regression on close prices, returns normalized slope + R² confidence
  - `computeMA()`: Short moving average
  - `computeMASlope()`: Slope of the MA itself (trend acceleration/deceleration)
  - `computeAcceleration()`: Delta between recent slope and older slope
  - `analyzeTrend()`: Full analysis returning slope, R², confidence (high/medium/low), turningUp, strongTrend, priceAboveMA
  - `fetchRecentBars()`: Fetches 60 recent 1m bars from Polygon
  - `fetchTrendData()`: Batch fetcher for multiple symbols with rate-limit batching
- **isTurningUp() upgraded** (`shared.js`): Accepts optional trend data from `analyzeTrend()`. Uses real slope when available and confident, falls back to intraday range proxy when history missing.
- **groupStrength() upgraded** (`shared.js`): Accepts optional `trendData` map, passes per-symbol trends to `isTurningUp()`.
- **stackReversalEvaluator**: Leader reversal detection and power/infra groupStrength now use real slope. Output includes `slopeSource` ("bars_1m" vs "intraday_proxy"), `leaderSlope`, `leaderSlopeR2`, `leaderSlopeConfidence`.
- **infraFollowerEvaluator**: AI cluster trend confirmation bonus (+5 score when AI leaders have confirmed uptrend from bars_1m). Output includes `aiTrendConfirmed`, `slopeSource`, `followerSlope`.
- **App.jsx refresh cycle**: Fetches trend data for 10 evaluator-critical symbols (NVDA, CEG, GEV, BE, NBIS, NEBX, CRWV, VRT, ETN, POWL) between calibration and runAllSetups. Attached as `calibrated.trendData`. Gracefully skips if mock mode or fetch fails.
- **test-slope.js**: 33 assertions covering positive/negative/flat/noisy/insufficient slopes, MA, MA-slope, acceleration, full analyzeTrend, confidence levels.
- **npm run validate**: Now runs 4 test suites (83 total assertions).

### 2026-04-11 (session 5 — Sprint C: position persistence)
- **Position persistence**: Positions and income tracker now survive page reload via localStorage
  - `src/lib/storage/positionStorage.js`: load/save/clear with schema version 1. Persists user workflow data only (symbol, strike, credit, currentPrice, id). Roll plans and profit targets recomputed on load from persisted inputs.
  - `src/lib/storage/incomeStorage.js`: load/save/clear with schema version 1. Persists weekly total and entries array. RESET button clears both state and storage.
  - `CreditVolScanner.jsx`: PositionManager initializes from `loadPositions()`, saves on every state change via `useEffect`. IncomeTracker initializes from `loadIncomeTracker()`, saves on state change, RESET calls `clearIncomeTracker()`.
  - Fail-safe: corrupt/missing/version-mismatched storage returns clean defaults, never crashes.
  - Design: storage adapters separated from UI components for testability and future upgrade path (BQ/Firestore).

### 2026-04-10 (session 4 — Sprint B complete)
- **BQ rolling refresh rewrite**: Replaced fragile DELETE+INSERT with staging table + MERGE pattern
  - `market_data_pipeline.py`: Added `_ensure_staging_table()`, `_load_to_staging()` (uses `load_table_from_file` — not streaming), `merge_from_staging()` (MERGE on symbol+exchange+ts with partition pruning), `upsert_bars()` (orchestrator), updated `overwrite_recent_window()` as legacy wrapper
  - `refresh_schedule.py`: `refresh_1m` and `refresh_1d` now call `upsert_bars()` instead of DELETE+INSERT. Added per-symbol ok/error counters. quotes_live remains append-only (unchanged).
  - `pipeline/validate_bq.py`: Post-refresh validation — duplicate detection on (symbol, exchange, ts), row counts per date, staging table health check
  - `init_db()` now creates staging tables on init
  - Rollback: revert to previous `refresh_schedule.py` which uses direct DELETE+INSERT (still works if no streaming buffer conflict)

### 2026-04-10 (session 3 — Sprint A complete)
- **Setup Builder → live scanner connection**: The top P1 inflight task is done. Full flow:
  - Builder creates setup payload → `fromBuilderFormat()` converts to registry shape → `validateSetup()` checks schema → `addSetup()` writes to registry → React state updates in main.jsx → App.jsx re-renders with new setup included in engine evaluator loop
  - Validation errors display inline in builder (red panel)
  - Success confirmation shows setup ID added (green panel)
  - Active setups panel in builder shows all setups with toggle ON/OFF and remove (runtime only)
  - Seed setups from config/setups.js are toggle-able but not removable
  - Runtime-added setups tagged with `_source: "runtime"` and purple RUNTIME badge
  - localStorage persistence: runtime setups survive page reload via `saveToStorage()`/`loadFromStorage()`
- **React state ownership**: Lifted setup state to main.jsx `useState()`. App.jsx receives `engineSetups` prop (keyed object format) instead of calling `getSetupsAsObject()` at module level. Registry is mutation layer, React owns render truth.
- **setupRegistry.js enhancements**: Added `fromBuilderFormat()` (builder payload → registry shape converter), `loadFromStorage()`/`saveToStorage()`/`clearStorage()`, `getSetupsAsObject(setupList)` now accepts optional array override for React-owned state
- **App.jsx**: `runAllSetups()` now takes SETUPS as parameter. `DetailPanel` receives setups as prop. `refresh` callback depends on SETUPS for re-evaluation when setups change.
- **TickerSetupBuilder.jsx**: Replaced `saveSetup`/`sendToBackend` with `addToScanner()` connected to registry. Added validation error display, success messages, active setups panel with toggle/remove.

### 2026-04-10 (session 2)
- **Setup Registry System**: Externalized all setup definitions from App.jsx into config-driven architecture
  - `src/config/setups.js`: Single source of truth for all 7 trigger engine setups (NBIS_NEBX, QQQM_STACK, CRWV, JEPI, JEPQ, NVDA_POWER_STACK, BE_INFRA) with normalized format, typed thresholds, and TradingView chart config
  - `src/lib/setupRegistry.js`: Registry layer with getSetupsAsObject() for backward-compat, getAllSymbols(), getSetupsByType(), runtime mutations (add/update/remove/toggle), format conversion from normalized to engine format
  - `src/lib/setupValidator.js`: Schema validation per setup type — required fields, threshold range checks, cross-field validation (targets > stop, earlyMinDist < earlyMaxDist, etc.)
  - App.jsx now imports via `getSetupsAsObject()` — zero inline setup definitions remain
- **CLAUDE.md**: Added setup registry rules section (config location, validation flow, mutation rules)

### 2026-04-10 (session 1)
- **Credit-Volatility Options Engine**: New `signalEngine.js` (12-section retail hedge fund model) with macro credit regime (HYG/KRE/LQD/VIX), setup scoring with watchlist quality weighting, timing classification (EARLY/MID/LATE/EXHAUSTED), strike selection (5-10% below spot), simplified Monte Carlo probability layer (65% floor), profit management (30/50/70% BTC targets), defense/roll logic (SAFE/WATCH/DEFENSE/ACTION zones), trading window enforcement (no trades first 60 min, best window 1:30-3:30 ET), and sentiment interpretation engine
- **CreditVolScanner.jsx**: Full React UI matching existing dark theme — credit-vol regime panel, ranked setup cards with watchlist badges, detail panel with Section 12 trade recommendation output, position manager for active short puts (BTC targets, roll alerts), weekly income tracker ($1,000/week target), 7 scan filter buttons (ALL/PREMIUM ENGINE/WHEEL/HIGH IV/CREDIT/ETF/TRAPS)
- **Options Watchlist System**: `optionsWatchlist.js` with 2026 top-27 active options universe (OptionCharts + Cboe + Macroption sources), historical top-100 Cboe rankings, unified lookup map, spread quality (A+/A/B) and wheel suitability (High/Medium/Low/No) metadata, scan filter functions (Premium Engine, Wheel Candidates, Trap Names)
- **Ticker catalog expanded**: 22 → 48 tickers. Added CORZ, IREN (AI/HPC), BX, APO, ARCC, OWL, OBDC (Credit), COIN (High IV), HYG, KRE, LQD (macro indicators), SPY, QQQ, SPX, TLT, SLV, GLD, XLF, XLE (Tier 1 ETFs), TSLA, GOOG, AMD, PLTR, MSTR, SMCI, META, HOOD, BTDR, FXI (Tier 2)
- **TickerSetupBuilder.jsx deduplication**: Removed hardcoded duplicate catalog; now imports from `tickerCatalog.js` single source of truth
- **Pipeline symbol expansion**: Both `market_data_pipeline.py` and `refresh_schedule.py` updated with all 48 symbols organized by engine (trigger core, credit-vol, 2026 watchlist)
- **Navigation**: 3-page app (Trigger Engine ↔ Credit-Vol Scanner ↔ Setup Builder) via `main.jsx` router with CREDIT-VOL button (teal) added to trigger engine controls
- **Watchlist-aware scoring**: Signal engine integrates spread quality (+3 for A+/A), tier (+2 for Tier 1), and trap name penalty (-5 for Low wheel) into setup scores; action engine warns on Low wheel suitability names

### 2026-04-06
- **NVDA_POWER_STACK**: New `stack_reversal` setup type with 3-layer detection (leader/power/infra)
- **Distance-based staging**: Replaced time-based staging with distToT1 (3-8% EARLY, 1-3% MID, <=1% LATE)
- **Action engine**: ENTER_AGGRESSIVE, ENTER_NORMAL, TAKE_PROFIT_OR_SKIP mapped from stage
- **`getStage(distToT1)`**: Extracted as reusable function
- **`isTurningUp(feed)`**: Asset direction detection (price > prev && slope > 0)
- **`groupStrength(feeds)`**: Fraction of group turning up
- **CEG, GEV**: Added to symbol registry and mock quotes (Constellation Energy, GE Vernova)
- **Score boost model**: stack +20, EARLY +15, MID +5, LATE -10 layered on top of gate scoring
- **Best follower recommendation**: NEBX or NBIS selected by maximum lag from leader

### 2026-04-05
- **Computed BQ columns**: range_pct, momentum (bars_1m + bars_1d), gap, prev_close (bars_1d only)
- **Exchange lookup**: `get_exchange()` fetches from Polygon ticker details, cached per session
- **Silent task runner**: VBS wrapper (`run_refresh.vbs`) for zero console window flashing
- **System manifest created**: docs/history/SYSTEM_MANIFEST.md

### 2026-04-04
- **BE_INFRA setup**: Infra follower with MC simulation, cluster strength scoring, strategic partners
- **Ticker catalog**: 22 tickers with categories/tags, filter functions, setup factories
- **Setup Builder UI**: TickerSetupBuilder.jsx with catalog browser + setup form
- **Polygon.io integration**: Live snapshot fetch with after-hours prevDay fallback
- **BigQuery pipeline**: Backfill complete (661K 1m rows, 11K 1d rows), refresh schedule deployed
- **Scheduled tasks**: Windows Task Scheduler with market hours gating

### 2026-04-03
- **Initial commit**: React/Vite dashboard, NBIS/NEBX pair engine, TradingView charts
- **Repository created**: github.com/hardymichelle11/trigger-engine

---

*This manifest should be updated after each major coding session. Use a shorter version of the generation prompt to refresh sections 6 (Inflight Tasks), 11 (Changelog), and any sections where code or architecture changed.*
