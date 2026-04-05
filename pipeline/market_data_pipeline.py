"""
market_data_pipeline.py

Purpose
-------
Build BigQuery dataset/tables for market data, backfill historical bars from Polygon,
refresh recent bars on a schedule, and append live quote snapshots.

What it creates
---------------
Dataset:   <BQ_DATASET>
Tables:
  - bars_1m      (partitioned by bar_date, clustered by symbol, exchange)
  - bars_1d      (partitioned by bar_date, clustered by symbol, exchange)
  - quotes_live  (partitioned by quote_date, clustered by symbol, exchange)

Recommended schedule
--------------------
1) One-time:
   python market_data_pipeline.py init
   python market_data_pipeline.py backfill --symbols NBIS,NEBX,QQQM,MSFT,NVDA,AAPL,AMZN,GOOGL,IWM,JEPI,JEPQ,CRWV --days_1m 90 --days_1d 1000

2) Recurring (Cloud Scheduler -> Cloud Run or cron):
   - Every 1 minute:
       python market_data_pipeline.py refresh-live --symbols NBIS,NEBX,QQQM,MSFT,NVDA,AAPL,AMZN,GOOGL,IWM,JEPI,JEPQ,CRWV
   - Every 15 minutes or hourly:
       python market_data_pipeline.py refresh-recent --symbols NBIS,NEBX,QQQM,MSFT,NVDA,AAPL,AMZN,GOOGL,IWM,JEPI,JEPQ,CRWV --days 5

Environment
-----------
export POLYGON_API_KEY="..."
export GOOGLE_CLOUD_PROJECT="your-project"
export BQ_DATASET="market_data"

Notes
-----
- This uses Polygon aggregate bars and stock snapshots endpoints.
- For indices such as VIX, pass the provider-native symbol if needed (e.g. I:VIX) and
  add provider-specific endpoint handling if your plan/feed requires it.
- Historical data is mostly static, but recent data can be corrected. This script
  overwrites a rolling recent window to keep the last few days clean.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
from typing import Iterable, List, Dict, Any, Optional

import requests
from google.cloud import bigquery

# ----------------------------
# Config
# ----------------------------

POLYGON_API_KEY = os.environ.get("POLYGON_API_KEY", "")
GCP_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
BQ_DATASET = os.environ.get("BQ_DATASET", "market_data")
POLYGON_BASE = "https://api.polygon.io"

if not POLYGON_API_KEY:
    print("Missing POLYGON_API_KEY", file=sys.stderr)

if not GCP_PROJECT:
    print("Missing GOOGLE_CLOUD_PROJECT", file=sys.stderr)

DEFAULT_SYMBOLS = [
    "NBIS", "NEBX", "QQQM", "MSFT", "NVDA", "AAPL", "AMZN", "GOOGL",
    "IWM", "JEPI", "JEPQ", "CRWV"
]

REQUEST_TIMEOUT = 30
USER_AGENT = "market-data-pipeline/1.0"

# ----------------------------
# HTTP helpers
# ----------------------------

def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})
    return s

def polygon_get(path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    params = dict(params or {})
    params["apiKey"] = POLYGON_API_KEY
    url = f"{POLYGON_BASE}{path}"
    resp = _session().get(url, params=params, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.json()

# ----------------------------
# BigQuery setup
# ----------------------------

def bq_client() -> bigquery.Client:
    return bigquery.Client(project=GCP_PROJECT)

def ensure_dataset(client: bigquery.Client) -> None:
    dataset_id = f"{GCP_PROJECT}.{BQ_DATASET}"
    dataset = bigquery.Dataset(dataset_id)
    dataset.location = "US"
    client.create_dataset(dataset, exists_ok=True)

def ensure_tables(client: bigquery.Client) -> None:
    ddl_statements = [
        f"""
        CREATE TABLE IF NOT EXISTS `{GCP_PROJECT}.{BQ_DATASET}.bars_1m` (
          symbol STRING NOT NULL,
          exchange STRING,
          ts TIMESTAMP NOT NULL,
          bar_date DATE NOT NULL,
          open FLOAT64,
          high FLOAT64,
          low FLOAT64,
          close FLOAT64,
          volume INT64,
          vwap FLOAT64,
          trades INT64,
          range_pct FLOAT64,
          momentum FLOAT64,
          source STRING,
          ingested_at TIMESTAMP NOT NULL
        )
        PARTITION BY bar_date
        CLUSTER BY symbol, exchange
        """,
        f"""
        CREATE TABLE IF NOT EXISTS `{GCP_PROJECT}.{BQ_DATASET}.bars_1d` (
          symbol STRING NOT NULL,
          exchange STRING,
          ts TIMESTAMP NOT NULL,
          bar_date DATE NOT NULL,
          open FLOAT64,
          high FLOAT64,
          low FLOAT64,
          close FLOAT64,
          volume INT64,
          vwap FLOAT64,
          trades INT64,
          range_pct FLOAT64,
          momentum FLOAT64,
          gap FLOAT64,
          prev_close FLOAT64,
          source STRING,
          ingested_at TIMESTAMP NOT NULL
        )
        PARTITION BY bar_date
        CLUSTER BY symbol, exchange
        """,
        f"""
        CREATE TABLE IF NOT EXISTS `{GCP_PROJECT}.{BQ_DATASET}.quotes_live` (
          symbol STRING NOT NULL,
          exchange STRING,
          ts TIMESTAMP NOT NULL,
          quote_date DATE NOT NULL,
          last_price FLOAT64,
          prev_close FLOAT64,
          day_open FLOAT64,
          day_high FLOAT64,
          day_low FLOAT64,
          day_volume INT64,
          bid_price FLOAT64,
          ask_price FLOAT64,
          bid_size INT64,
          ask_size INT64,
          source STRING,
          ingested_at TIMESTAMP NOT NULL,
          raw JSON
        )
        PARTITION BY quote_date
        CLUSTER BY symbol, exchange
        """
    ]
    for ddl in ddl_statements:
        client.query(ddl).result()

# ----------------------------
# Polygon mappers
# ----------------------------

def _ts_ms_to_iso(ts_ms: int) -> str:
    return dt.datetime.fromtimestamp(ts_ms / 1000, tz=dt.timezone.utc).isoformat()

# Exchange lookup cache (fetched once per symbol per session)
_exchange_cache: Dict[str, str] = {}

def get_exchange(symbol: str) -> str:
    """Fetch primary exchange from Polygon ticker details, cached per session."""
    if symbol in _exchange_cache:
        return _exchange_cache[symbol]
    try:
        data = polygon_get(f"/v3/reference/tickers/{symbol}")
        exchange = data.get("results", {}).get("primary_exchange", "")
        _exchange_cache[symbol] = exchange
        return exchange
    except Exception:
        _exchange_cache[symbol] = ""
        return ""

def _safe_div(a, b):
    """Safe division, returns None if b is 0 or None."""
    if not b:
        return None
    return a / b

def fetch_agg_bars(symbol: str, multiplier: int, timespan: str, start_date: dt.date, end_date: dt.date, adjusted: bool = True) -> List[Dict[str, Any]]:
    path = f"/v2/aggs/ticker/{symbol}/range/{multiplier}/{timespan}/{start_date.isoformat()}/{end_date.isoformat()}"
    data = polygon_get(path, params={"adjusted": "true" if adjusted else "false", "sort": "asc", "limit": 50000})
    results = data.get("results", []) or []
    rows = []
    now_iso = dt.datetime.now(dt.timezone.utc).isoformat()
    exchange = get_exchange(symbol)
    prev_close = None

    for r in results:
        ts = _ts_ms_to_iso(r["t"])
        o = r.get("o")
        h = r.get("h")
        l = r.get("l")
        c = r.get("c")

        # Computed columns
        range_pct = _safe_div((h - l), o) if (h is not None and l is not None and o) else None
        momentum = (c / o - 1) if (c is not None and o) else None
        gap = (o / prev_close - 1) if (o is not None and prev_close) else None

        row = {
            "symbol": symbol,
            "exchange": exchange,
            "ts": ts,
            "bar_date": ts[:10],
            "open": o,
            "high": h,
            "low": l,
            "close": c,
            "volume": int(r.get("v", 0)) if r.get("v") is not None else None,
            "vwap": r.get("vw"),
            "trades": int(r.get("n", 0)) if r.get("n") is not None else None,
            "range_pct": range_pct,
            "momentum": momentum,
            "source": "polygon_aggs",
            "ingested_at": now_iso,
        }

        # gap and prev_close only on daily bars
        if timespan == "day":
            row["gap"] = gap
            row["prev_close"] = prev_close

        rows.append(row)
        prev_close = c

    return rows

def fetch_snapshot(symbol: str) -> Dict[str, Any]:
    path = f"/v2/snapshot/locale/us/markets/stocks/tickers/{symbol}"
    data = polygon_get(path)
    ticker = data.get("ticker", {}) or {}

    last_trade = ticker.get("lastTrade", {}) or {}
    last_quote = ticker.get("lastQuote", {}) or {}
    day = ticker.get("day", {}) or {}
    prev_day = ticker.get("prevDay", {}) or {}
    min_bar = ticker.get("min", {}) or {}

    ts_ns = last_trade.get("t") or last_quote.get("t")
    if ts_ns:
        ts = dt.datetime.utcfromtimestamp(ts_ns / 1_000_000_000).replace(tzinfo=dt.timezone.utc)
    else:
        ts = dt.datetime.now(dt.timezone.utc)

    return {
        "symbol": symbol,
        "exchange": get_exchange(symbol),
        "ts": ts.isoformat(),
        "quote_date": ts.date().isoformat(),
        "last_price": last_trade.get("p"),
        "prev_close": prev_day.get("c"),
        "day_open": day.get("o"),
        "day_high": day.get("h"),
        "day_low": day.get("l"),
        "day_volume": int(day.get("v", 0)) if day.get("v") is not None else None,
        "bid_price": last_quote.get("P"),
        "ask_price": last_quote.get("p"),
        "bid_size": int(last_quote.get("S", 0)) if last_quote.get("S") is not None else None,
        "ask_size": int(last_quote.get("s", 0)) if last_quote.get("s") is not None else None,
        "source": "polygon_snapshot",
        "ingested_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "raw": json.dumps({
            "lastTrade": last_trade,
            "lastQuote": last_quote,
            "day": day,
            "prevDay": prev_day,
            "min": min_bar,
        }),
    }

# ----------------------------
# BigQuery writers
# ----------------------------

def load_json_rows(client: bigquery.Client, table_fqn: str, rows: List[Dict[str, Any]], batch_size: int = 5000) -> None:
    if not rows:
        return
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        retries = 3
        for attempt in range(retries):
            try:
                errors = client.insert_rows_json(table_fqn, batch)
                if errors:
                    raise RuntimeError(f"BigQuery insert errors for {table_fqn}: {errors}")
                print(f"  Inserted {len(batch)} rows (batch {i // batch_size + 1})")
                break
            except Exception as e:
                if attempt < retries - 1:
                    wait = 2 ** (attempt + 1)
                    print(f"  Retry {attempt + 1}/{retries} after {wait}s: {e}")
                    time.sleep(wait)
                else:
                    raise

def overwrite_recent_window(client: bigquery.Client, table_name: str, rows: List[Dict[str, Any]], start_date: dt.date) -> None:
    table_fqn = f"{GCP_PROJECT}.{BQ_DATASET}.{table_name}"
    delete_sql = f"""
      DELETE FROM `{table_fqn}`
      WHERE bar_date >= @start_date
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("start_date", "DATE", start_date.isoformat())
        ]
    )
    client.query(delete_sql, job_config=job_config).result()
    load_json_rows(client, table_fqn, rows)

# ----------------------------
# Pipeline tasks
# ----------------------------

def init_db() -> None:
    client = bq_client()
    ensure_dataset(client)
    ensure_tables(client)
    print(f"Initialized {GCP_PROJECT}.{BQ_DATASET}")

def backfill(symbols: Iterable[str], days_1m: int, days_1d: int) -> None:
    client = bq_client()
    ensure_dataset(client)
    ensure_tables(client)

    today = dt.date.today()
    start_1m = today - dt.timedelta(days=days_1m)
    start_1d = today - dt.timedelta(days=days_1d)

    for symbol in symbols:
        print(f"Backfilling {symbol} 1m from {start_1m} to {today}")
        rows_1m = fetch_agg_bars(symbol, 1, "minute", start_1m, today)
        load_json_rows(client, f"{GCP_PROJECT}.{BQ_DATASET}.bars_1m", rows_1m)

        print(f"Backfilling {symbol} 1d from {start_1d} to {today}")
        rows_1d = fetch_agg_bars(symbol, 1, "day", start_1d, today)
        load_json_rows(client, f"{GCP_PROJECT}.{BQ_DATASET}.bars_1d", rows_1d)

def refresh_recent(symbols: Iterable[str], days: int = 5) -> None:
    client = bq_client()
    ensure_dataset(client)
    ensure_tables(client)

    today = dt.date.today()
    start = today - dt.timedelta(days=days)

    for symbol in symbols:
        print(f"Refreshing recent 1m bars for {symbol} from {start} to {today}")
        rows_1m = fetch_agg_bars(symbol, 1, "minute", start, today)
        overwrite_recent_window(client, "bars_1m", rows_1m, start)

        print(f"Refreshing recent 1d bars for {symbol} from {start} to {today}")
        rows_1d = fetch_agg_bars(symbol, 1, "day", start, today)
        overwrite_recent_window(client, "bars_1d", rows_1d, start)

def refresh_live(symbols: Iterable[str]) -> None:
    client = bq_client()
    ensure_dataset(client)
    ensure_tables(client)

    rows = []
    for symbol in symbols:
        try:
            print(f"Fetching live snapshot for {symbol}")
            rows.append(fetch_snapshot(symbol))
        except Exception as e:
            print(f"Snapshot failed for {symbol}: {e}", file=sys.stderr)

    load_json_rows(client, f"{GCP_PROJECT}.{BQ_DATASET}.quotes_live", rows)
    print(f"Appended {len(rows)} quote rows")

# ----------------------------
# Cloud Run HTTP entrypoint (optional)
# ----------------------------

def handle_http(request_json: Dict[str, Any]) -> Dict[str, Any]:
    task = request_json.get("task")
    symbols = request_json.get("symbols", DEFAULT_SYMBOLS)

    if task == "init":
        init_db()
    elif task == "backfill":
        backfill(symbols, int(request_json.get("days_1m", 90)), int(request_json.get("days_1d", 1000)))
    elif task == "refresh_recent":
        refresh_recent(symbols, int(request_json.get("days", 5)))
    elif task == "refresh_live":
        refresh_live(symbols)
    else:
        raise ValueError(f"Unknown task: {task}")

    return {"ok": True, "task": task, "symbols": symbols}

# ----------------------------
# CLI
# ----------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init")

    b = sub.add_parser("backfill")
    b.add_argument("--symbols", default=",".join(DEFAULT_SYMBOLS))
    b.add_argument("--days_1m", type=int, default=90)
    b.add_argument("--days_1d", type=int, default=1000)

    rr = sub.add_parser("refresh-recent")
    rr.add_argument("--symbols", default=",".join(DEFAULT_SYMBOLS))
    rr.add_argument("--days", type=int, default=5)

    rl = sub.add_parser("refresh-live")
    rl.add_argument("--symbols", default=",".join(DEFAULT_SYMBOLS))

    return p.parse_args()

def main() -> None:
    args = parse_args()
    symbols = [s.strip() for s in getattr(args, "symbols", ",".join(DEFAULT_SYMBOLS)).split(",") if s.strip()]

    if args.cmd == "init":
        init_db()
    elif args.cmd == "backfill":
        backfill(symbols, args.days_1m, args.days_1d)
    elif args.cmd == "refresh-recent":
        refresh_recent(symbols, args.days)
    elif args.cmd == "refresh-live":
        refresh_live(symbols)
    else:
        raise ValueError(args.cmd)

if __name__ == "__main__":
    main()
