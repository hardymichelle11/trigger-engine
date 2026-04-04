# Setup Guide

## Prerequisites

- Node.js 18+
- Python 3.10+
- Google Cloud SDK (`gcloud`)
- Polygon.io developer tier API key

## Frontend (React Dashboard)

```bash
cd my-app
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # production build to dist/
```

## BigQuery Pipeline

### 1. Install Python dependencies
```bash
pip install requests google-cloud-bigquery
```

### 2. Authenticate with GCP
```bash
# Option A: Service account (recommended for production)
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/sa-key.json"

# Option B: User credentials (quick dev setup)
gcloud auth application-default login
```

### 3. Initialize BigQuery tables
```bash
python pipeline/market_data_pipeline.py init
```

### 4. Backfill historical data
```bash
python pipeline/market_data_pipeline.py backfill \
  --symbols NBIS,NEBX,QQQM,MSFT,NVDA,AAPL,AMZN,GOOGL,IWM,JEPI,JEPQ,CRWV \
  --days_1m 90 \
  --days_1d 1000
```

### 5. Schedule recurring refreshes

| Task | Frequency | Command |
|------|-----------|---------|
| Live snapshots | Every 1 min | `python pipeline/market_data_pipeline.py refresh-live` |
| Recent bars | Every 15 min | `python pipeline/market_data_pipeline.py refresh-recent --days 5` |

## Configuration

### Polygon.io
- API key set in `src/App.jsx` (frontend) and `pipeline/market_data_pipeline.py` (backend)
- Developer tier required for real-time snapshots

### GCP
- Project: `supple-synapse-470605-c5`
- Service account: `cr-daily-assess@supple-synapse-470605-c5.iam.gserviceaccount.com`
- Dataset: `market_data`

## Adding New Instruments

1. Add to `SETUPS` config in `src/App.jsx`
2. Add to `DEFAULT_SYMBOLS` in `pipeline/market_data_pipeline.py`
3. Add TradingView symbol mapping (`tvLeader`/`tvFollower`)
