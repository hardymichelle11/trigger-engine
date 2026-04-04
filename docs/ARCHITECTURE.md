# Trigger Engine Architecture

## Overview

Self-calibrating multi-setup trigger engine that scans market conditions across multiple instruments, evaluates trade setups using Monte Carlo simulation, and surfaces actionable signals through a real-time dashboard.

## System Components

```
+-------------------+     +------------------+     +-------------------+
|   Polygon.io API  |---->|  React Dashboard |---->|   Alert Engine    |
|   (live quotes)   |     |  (Vite + React)  |     |   (scoring/MC)    |
+-------------------+     +------------------+     +-------------------+
         |                                                    |
         v                                                    v
+-------------------+     +------------------+     +-------------------+
|  BigQuery Pipeline|---->|  bars_1m / 1d    |     |  Position Sizing  |
|  (Python/Cloud)   |     |  quotes_live     |     |  (Kelly Lite)     |
+-------------------+     +------------------+     +-------------------+
```

## Data Flow

1. **Polygon.io** provides real-time snapshots (developer tier) and historical aggregates
2. **React Dashboard** fetches quotes on demand or auto-refresh (60s cycle)
3. **Engine** normalizes feeds, validates instruments, evaluates market regime
4. **Setup Evaluators** score each setup (pair/basket/standalone) and run Monte Carlo
5. **BigQuery Pipeline** persists historical bars and live snapshots for backtesting

## Setup Types

### Pair (e.g., NBIS/NEBX)
- Leader/follower relationship (NEBX = 2x leveraged daily ETF of NBIS)
- Cross-asset validation: direction alignment, leverage ratio check
- Touch-before-stop Monte Carlo: probability of hitting targets before stop
- Kelly position sizing based on win probability

### Basket (e.g., QQQM + MSFT/NVDA/AAPL/AMZN/GOOGL)
- Leader ETF vs component driver stocks
- Scores based on driver momentum vs leader lag (catch-up thesis)

### Standalone (e.g., CRWV, JEPI, JEPQ)
- Single instrument with volatility and momentum checks
- Market regime overlay

## Market Regime

VIX + IWM scoring system:
- **RISK-ON** (score >= 65): VIX contained, IWM strong
- **NEUTRAL** (35-65): Mixed signals
- **RISK-OFF** (score <= 35): VIX elevated/panic, IWM weak

Regime gates all setups -- no GO signals fire during RISK-OFF.

## Validation Pipeline

Every feed passes through before the engine can act:
1. **Symbol match** -- ticker matches expected
2. **Exchange check** -- correct listing venue
3. **Identity check** -- description/name verification
4. **Price validity** -- finite, positive numbers
5. **Cross-asset** -- direction alignment, ~2x leverage ratio (pairs)
6. **Freshness** -- data within acceptable staleness window

## Scoring (Pair Setup)

| Gate | Points | Condition |
|------|--------|-----------|
| Leader threshold | 25 | NBIS > $103 |
| Cross-asset valid | 15 | Direction + leverage aligned |
| Distance to T1 | 25 | 2-6% from first target |
| Volatility active | 10 | Leader vol > 0.3% |
| Market regime | +15/-20 | RISK-ON bonus / RISK-OFF penalty |

- **GO**: Score >= 75 + valid setup + not RISK-OFF
- **WATCH**: Score >= 50
- **NO TRADE**: Below 50 or validation failed

## Monte Carlo Simulation

- N = 2000 paths per evaluation
- NBIS simulated with calibrated daily vol (~6.5%)
- NEBX modeled as 2x daily leveraged ETF with vol drag and expense ratio
- Touch-before-stop: does price reach target before hitting stop?
- Ladder probabilities for T1, T2, T3

## Position Sizing (Kelly Lite)

```
edge = winProb - (1 - winProb)
kelly = max(0, edge) * 0.5   // half-Kelly for safety
size = capital * kelly
```

## BigQuery Tables

| Table | Partition | Cluster | Source |
|-------|-----------|---------|--------|
| bars_1m | bar_date | symbol, exchange | Polygon aggs |
| bars_1d | bar_date | symbol, exchange | Polygon aggs |
| quotes_live | quote_date | symbol, exchange | Polygon snapshots |

## Tech Stack

- **Frontend**: React 18, Vite, TradingView widget embeds
- **Data**: Polygon.io (developer tier), BigQuery
- **Pipeline**: Python, google-cloud-bigquery, requests
- **Hosting**: Local dev (npm run dev), deployable to Vercel/Netlify
- **GCP Project**: supple-synapse-470605-c5

## Instruments

| Symbol | Type | Exchange | Description |
|--------|------|----------|-------------|
| NBIS | Stock | NASDAQ | Nebius Group N.V. |
| NEBX | ETF | CBOE | Tradr 2X Long NBIS Daily ETF |
| QQQM | ETF | NASDAQ | Invesco NASDAQ 100 ETF |
| CRWV | Stock | NASDAQ | CoreWeave |
| JEPI | ETF | ARCA | JPMorgan Equity Premium Income ETF |
| JEPQ | ETF | NASDAQ | JPMorgan Nasdaq Equity Premium Income ETF |
| VIX | Index | CBOE | CBOE Volatility Index |
| IWM | ETF | ARCA | iShares Russell 2000 |
