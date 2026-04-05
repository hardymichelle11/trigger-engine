# SYSTEM MANIFEST — Trigger Engine + Market Data Pipeline

**Last updated:** 2026-04-04
**Project:** `my-app` (trigger-engine)
**Repository:** https://github.com/hardymichelle11/trigger-engine
**Author:** Michelle Hardy (hardymichelle11)
**AI Collaborator:** Claude Opus 4.6 (1M context)

---

## 1. System Summary

The **Trigger Engine** is a self-calibrating, multi-setup market signal scanner that combines real-time market data ingestion, quantitative analysis, and a React dashboard for monitoring trade setups across multiple instruments and strategies.

### Core capabilities:
- **Multi-setup scanning** across 4 setup types: Pair, Basket, Infra Follower, Standalone
- **Market regime awareness** via VIX + IWM scoring (RISK-ON / NEUTRAL / RISK-OFF)
- **Monte Carlo simulation** for touch-before-stop probability estimation
- **Kelly-lite position sizing** based on simulated win probabilities
- **Instrument validation pipeline** (symbol, exchange, cross-asset, freshness)
- **Live data from Polygon.io** (developer tier) with after-hours fallback
- **BigQuery persistence** for historical bars and live snapshots
- **Cost-optimized refresh** (~$1.60/month BQ cost)
- **TradingView chart integration** for visual confirmation
- **Ticker catalog + Setup Builder UI** for configuring setups without editing code

### Instruments tracked (18 symbols):
NBIS, NEBX, CRWV, BE, VRT, ETN, POWL, QQQM, MSFT, NVDA, AAPL, AMZN, GOOGL, IWM, VIX, JEPI, JEPQ, BAM, BEPC

---

## 2. Architecture Map

```
                         DATA INGESTION
                         ==============

  Polygon.io REST API ──────────────────────────────────────┐
  (snapshots, aggs)                                         │
       │                                                    │
       ▼                                                    ▼
  ┌─────────────────┐     ┌──────────────────┐    ┌──────────────────┐
  │ refresh_schedule │     │ market_data_     │    │ React Dashboard  │
  │ .py              │     │ pipeline.py      │    │ (Vite + React)   │
  │                  │     │                  │    │                  │
  │ - refresh-live   │     │ - init           │    │ Polygon snapshot │
  │ - refresh-1m     │     │ - backfill       │    │ on page load /   │
  │ - refresh-1d     │     │ - refresh-recent │    │ manual refresh   │
  └────────┬─────────┘     └────────┬─────────┘    └────────┬─────────┘
           │                        │                       │
           ▼                        ▼                       ▼
  ┌─────────────────────────────────────┐    ┌──────────────────────────┐
  │         Google BigQuery             │    │     Browser (Client)     │
  │  supple-synapse-470605-c5           │    │                          │
  │  Dataset: market_data               │    │  - Engine scoring        │
  │                                     │    │  - Monte Carlo sim       │
  │  bars_1m  (partitioned by bar_date) │    │  - Market regime eval    │
  │  bars_1d  (partitioned by bar_date) │    │  - Validation pipeline   │
  │  quotes_live (partitioned by date)  │    │  - TradingView charts    │
  └─────────────────────────────────────┘    │  - Setup Builder UI      │
                                             └──────────────────────────┘

                         SCHEDULING
                         ==========

  Windows Task Scheduler (via wscript.exe + VBS wrapper for silent execution)
  ├── MarketData-LiveSnapshot  → every 1 min  → refresh-live
  ├── MarketData-Bars1m        → every 15 min → refresh-1m
  └── MarketData-Bars1d        → daily 5 PM   → refresh-1d

  All tasks auto-skip outside market hours (Mon-Fri 9:25-16:05 ET)
```

---

## 3. Logical Rationale

### Why BigQuery with partitioned tables?
- **Cost**: Partition pruning means DELETEs and queries only scan the 3-5 day rolling window, not the full history. At ~660K rows of 1m data, a full scan would cost ~$0.005 per query. With partitioning, the rolling refresh touches only ~21K rows. Over a month, this saves ~95% of DML cost.
- **Clustering by symbol + exchange**: Allows BQ to skip irrelevant row groups when filtering by specific tickers.
- **Streaming inserts**: No load job overhead, sub-second latency, pay only for rows written.

### Why Polygon.io?
- Developer tier provides real-time snapshots and unlimited historical aggs.
- Single API for both live quotes and historical backfill (no vendor mixing).
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

### Why computed columns at ingestion time?
- `range_pct`, `momentum`, `gap` are computed once during ETL and stored.
- Avoids recomputing on every downstream query.
- Makes BQ queries simpler and cheaper (no runtime math).

---

## 4. Code & Configurations

### 4.1 Pipeline Scripts

#### `pipeline/market_data_pipeline.py`
- **Purpose**: Core data pipeline -- BQ table creation, Polygon data fetching, backfill, refresh
- **Key functions**:
  - `ensure_tables()` -- DDL for bars_1m, bars_1d, quotes_live with partitioning/clustering
  - `get_exchange(symbol)` -- Cached Polygon ticker details lookup for primary exchange
  - `fetch_agg_bars(symbol, multiplier, timespan, start, end)` -- Fetches aggregate bars, computes `range_pct`, `momentum`, `gap`, `prev_close`
  - `fetch_snapshot(symbol)` -- Fetches real-time snapshot for quotes_live
  - `load_json_rows(client, table, rows, batch_size=5000)` -- Batched streaming insert with retry
  - `overwrite_recent_window()` -- Partition-pruned DELETE + INSERT for rolling refresh
  - `backfill(symbols, days_1m, days_1d)` -- One-time historical data load
- **CLI**: `init`, `backfill`, `refresh-recent`, `refresh-live`

#### `pipeline/refresh_schedule.py`
- **Purpose**: Cost-optimized incremental refresh with market hours gating
- **Key functions**:
  - `is_market_hours()` -- Checks Mon-Fri 9:25-16:05 ET
  - `refresh_1m(symbols, days=3)` -- Rolling 3-day overwrite of 1m bars
  - `refresh_1d(symbols, days=5)` -- Rolling 5-day overwrite of daily bars
  - `refresh_live(symbols)` -- Append-only snapshots to quotes_live
- **CLI**: `refresh-1m`, `refresh-1d`, `refresh-live`, `refresh-all`

#### `pipeline/run_refresh.bat`
- **Purpose**: Wrapper that sets env vars and calls refresh_schedule.py
- **Usage**: `run_refresh.bat refresh-live`, `run_refresh.bat refresh-1m`, etc.

#### `pipeline/run_refresh.vbs`
- **Purpose**: Silent execution wrapper -- runs run_refresh.bat with window style 0 (hidden)
- **Used by**: Windows Task Scheduler to avoid console window flashing

### 4.2 Frontend

#### `src/App.jsx` — Main Scanner Dashboard
- **SETUPS config**: Defines all 6 setups (NBIS_NEBX pair, QQQM basket, BE_INFRA infra_follower, CRWV/JEPI/JEPQ standalone)
- **Engine evaluators**: `evaluatePairSetup()`, `evaluateStandaloneSetup()`, `evaluateBasketSetup()`, `evaluateInfraFollowerSetup()`
- **Market regime**: `evaluateMarketRegime(vix, iwm)` -- VIX/IWM scoring
- **Monte Carlo**: `runPairMonteCarlo()`, `runBEInfraMonteCarlo()` -- 2000-path touch-before-stop simulation
- **Polygon fetch**: `fetchPolygonSnapshot()`, `fetchPolygonVIX()` -- Real-time data with after-hours fallback to prevDay
- **Validation**: `validateInstrument()`, `validateCrossAsset()` -- Feed integrity checks
- **UI components**: `RegimePanel`, `SetupCard`, `DetailPanel`, `TradingViewChart`, `ScoreRing`, `LadderBar`, `Gate`, `AlertRow`, `ValidationPanel`

#### `src/TickerSetupBuilder.jsx` — Setup Builder UI
- **Purpose**: Visual ticker catalog browser + setup configuration form
- **Features**: Search, category/tag filtering, multi-select for drivers/leaders, JSON payload preview
- **Setup types**: Pair, Basket, Infra Follower, Standalone
- **Output**: JSON payload ready to send to backend

#### `src/tickerCatalog.js` — Ticker Catalog Module
- **22 tickers** with id, symbol, exchange, name, category, subcategory, tags, enabled
- **Categories**: AI, ETF, Infra, Tech, Index, Income, Energy, Fertilizer
- **Filter function**: `filterCatalog({ search, categories, tags, exchange, enabledOnly })`
- **Setup factories**: `createPairSetup()`, `createBasketSetup()`, `createInfraFollowerSetup()`, `createStandaloneSetup()`
- **Lookup helpers**: `getTickerById()`, `resolveSetup()`, `getAllSymbolsFromSetups()`

#### `src/main.jsx` — App Router
- Simple state-based routing between Scanner (`App`) and Setup Builder (`TickerSetupBuilder`)

### 4.3 System Prompts for Data Analysis

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
Given: BE price, AI cluster changes (NBIS/CRWV/NVDA), infra driver changes (VRT/ETN/POWL), partner changes (BAM/BEPC)
clusterStrength = avg(aiStrength, infraStrength, partnerStrength)
lagAmount = clusterStrength - beMove
lagging = lagAmount >= 0.75%

Score = sum of:
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

### 4.4 Environment Variables

```bash
# pipeline/.env.example (placeholder values)
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
  exchange      STRING,          -- e.g., "XNAS", "XNYS", "BATS"
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
**Current size**: ~661,862 rows (90 days, 18 symbols)

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
  gap           FLOAT64,         -- open / prev_close - 1
  prev_close    FLOAT64,         -- previous day's close
  source        STRING,
  ingested_at   TIMESTAMP NOT NULL
)
PARTITION BY bar_date
CLUSTER BY symbol, exchange
```
**Current size**: ~11,066 rows (1000 days, 18 symbols)

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
- [ ] **BQ streaming buffer cooldown**: Rolling overwrite DELETEs fail if rows are still in the streaming buffer (<30 min after insert). Need to either wait or use MERGE instead of DELETE+INSERT.
- [ ] **Connect Setup Builder output to engine**: Currently the builder generates JSON payloads but doesn't dynamically update the scanner's SETUPS config at runtime.

### Planned
- [ ] **Real-time WebSocket feed**: Replace polling with Polygon WebSocket for sub-second price updates
- [ ] **OXY, MOS, CF setups**: Tickers are in the catalog but no setup evaluators built yet (Energy, Fertilizer sectors)
- [ ] **Cloud Run deployment**: Move scheduled tasks from local Windows Task Scheduler to Cloud Scheduler + Cloud Run for reliability
- [ ] **Backfill computed columns**: Existing 660K+ rows in bars_1m/bars_1d don't have range_pct/momentum/gap populated (only new data does)
- [ ] **Dashboard reads from BQ**: Frontend currently fetches live from Polygon directly; could optionally read historical context from BQ for richer analysis

### Experimental Ideas
- [ ] **Alert notifications**: Push alerts (Slack, email, SMS) when a setup transitions to GO
- [ ] **Backtesting module**: Use bars_1d history to simulate past performance of the scoring engine
- [ ] **Multi-user support**: Store setups per user in Firestore, allow multiple dashboard instances
- [ ] **NEBX vol drag visualization**: Show the compounding cost of holding the 2x leveraged ETF over time

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

# 8. Backfill historical data (takes ~5-10 min)
python pipeline/market_data_pipeline.py backfill \
  --symbols NBIS,NEBX,QQQM,MSFT,NVDA,AAPL,AMZN,GOOGL,IWM,JEPI,JEPQ,CRWV,BE,VRT,ETN,POWL,BAM,BEPC \
  --days_1m 90 --days_1d 1000

# 9. Start the dev server
npm run dev

# 10. Set up scheduled refresh (Windows)
# Edit pipeline/run_refresh.bat with your actual keys
# Then run as Administrator:
pipeline/setup_tasks.bat

# Or manually create silent tasks:
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

# Open dashboard
# Navigate to http://localhost:5173
```

---

## 8. File Tree

```
trigger-engine/
├── .env                          # Local secrets (gitignored)
├── .env.example                  # Template for required env vars
├── .gitignore                    # Blocks .env, service-account*.json, node_modules, dist
├── index.html                    # Vite entry point
├── package.json                  # Node dependencies
├── vite.config.js                # Vite config (HMR overlay disabled)
│
├── src/
│   ├── main.jsx                  # App router (Scanner <-> Setup Builder)
│   ├── App.jsx                   # Scanner dashboard + engine logic (~1100 lines)
│   ├── TickerSetupBuilder.jsx    # Ticker catalog UI + setup builder
│   ├── tickerCatalog.js          # 22-ticker catalog + filter/factory helpers
│   ├── App.css                   # Minimal (all styles inline)
│   └── index.css                 # CSS reset
│
├── pipeline/
│   ├── market_data_pipeline.py   # Core pipeline: BQ schema, Polygon fetch, backfill
│   ├── refresh_schedule.py       # Cost-optimized incremental refresh
│   ├── run_refresh.bat           # Env var wrapper for refresh_schedule.py
│   ├── run_refresh.vbs           # Silent execution wrapper (no console flash)
│   ├── setup_tasks.bat           # Windows Task Scheduler setup
│   └── service-account.json      # GCP credentials (gitignored)
│
├── docs/
│   ├── ARCHITECTURE.md           # System design overview
│   ├── SETUP.md                  # Installation guide
│   ├── REFRESH_SCHEDULE.md       # Refresh cadence, cost estimates, deployment
│   └── history/
│       └── SYSTEM_MANIFEST.md    # THIS FILE
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

### Monthly estimates (18 symbols, market hours only):

| Component | Monthly Cost |
|-----------|-------------|
| BQ streaming inserts | ~$1.00 |
| BQ active storage | ~$0.50 |
| BQ DML (rolling deletes) | ~$0.10 |
| Polygon API calls | $0 (developer tier) |
| **Total** | **~$1.60/month** |

### Daily API usage:
| Task | Calls/Run | Runs/Day | Total/Day |
|------|-----------|----------|-----------|
| Live snapshots | 18 | 390 | 7,020 |
| 1-minute bars | 18 | 26 | 468 |
| Daily bars | 18 | 1 | 18 |
| **Total** | | | **~7,500** |

---

*This manifest should be updated after each major coding session. Use a shorter version of the generation prompt to refresh sections 6 (Inflight Tasks) and any sections where code or architecture changed.*
