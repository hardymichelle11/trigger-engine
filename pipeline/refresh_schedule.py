"""
refresh_schedule.py

Cost-optimized incremental refresh for BigQuery market data.

Design principles:
- Never reprocess full history
- Rolling upsert via staging table + MERGE (streaming-buffer-safe)
- Append-only for live snapshots (quotes_live)
- Partition-pruned MERGE on (symbol, exchange, ts) for bars tables
- Idempotent: re-running produces identical results, no duplicates
- Minimal Polygon API calls per cycle

Subcommands:
  refresh-1m     Upsert last 3 trading days of 1m bars (run every 15 min during market hours)
  refresh-1d     Upsert last 5 trading days of 1d bars (run once daily after close)
  refresh-live   Append current snapshots to quotes_live (run every 1 min during market hours)

Usage:
  python refresh_schedule.py refresh-1m
  python refresh_schedule.py refresh-1d
  python refresh_schedule.py refresh-live
  python refresh_schedule.py refresh-all   # runs all three

Environment:
  POLYGON_API_KEY
  GOOGLE_CLOUD_PROJECT
  GOOGLE_APPLICATION_CREDENTIALS
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
import time
from typing import List

# Reuse the pipeline module
sys.path.insert(0, os.path.dirname(__file__))
from market_data_pipeline import (
    polygon_get,
    bq_client,
    ensure_dataset,
    ensure_tables,
    fetch_agg_bars,
    fetch_snapshot,
    load_json_rows,
    upsert_bars,
    GCP_PROJECT,
    BQ_DATASET,
    POLYGON_API_KEY,
)

DEFAULT_SYMBOLS = [
    # Trigger engine core
    "NBIS", "NEBX", "QQQM", "MSFT", "NVDA", "AAPL", "AMZN", "GOOGL",
    "IWM", "JEPI", "JEPQ", "CRWV", "BE", "VRT", "ETN", "POWL", "BAM", "BEPC",
    "CORZ", "IREN",
    # Commodity / energy setups
    "OXY", "MOS", "CF",
    # Credit-vol engine
    "BX", "APO", "ARCC", "OWL", "OBDC", "COIN",
    "HYG", "KRE", "LQD",
    # 2026 options watchlist (Tier 1 ETFs + Tier 2 high-IV)
    "SPY", "QQQ", "TLT", "SLV", "GLD", "XLF", "XLE", "FXI",
    "TSLA", "GOOG", "AMD", "PLTR", "MSTR", "SMCI", "META", "HOOD", "BTDR",
]

# ----------------------------
# Market hours check (ET)
# ----------------------------

def is_market_hours() -> bool:
    """Rough check: Mon-Fri 9:30-16:00 ET. Skip refresh outside these hours to save API calls."""
    import zoneinfo
    now = dt.datetime.now(zoneinfo.ZoneInfo("America/New_York"))
    if now.weekday() >= 5:  # Sat/Sun
        return False
    market_open = now.replace(hour=9, minute=25, second=0)
    market_close = now.replace(hour=16, minute=5, second=0)
    return market_open <= now <= market_close


# ----------------------------
# Refresh: 1-minute bars (rolling 3-day upsert via staging + MERGE)
# ----------------------------

def refresh_1m(symbols: List[str], days: int = 3, force: bool = False) -> None:
    """
    Upsert last `days` trading days of 1m bars.
    Cost: ~3 days * 390 bars * N symbols = ~21K rows per symbol per run.
    Polygon API: 1 call per symbol.
    BQ: load job to staging → MERGE into bars_1m (streaming-buffer-safe).
    """
    if not force and not is_market_hours():
        print("Market closed, skipping 1m refresh (use --force to override)")
        return

    client = bq_client()
    today = dt.date.today()
    start = today - dt.timedelta(days=days)

    ok_count = 0
    err_count = 0

    for symbol in symbols:
        print(f"Refreshing 1m bars for {symbol} [{start} → {today}]")
        try:
            rows = fetch_agg_bars(symbol, 1, "minute", start, today)
            if not rows:
                print(f"  No data for {symbol}")
                continue

            upsert_bars(client, "bars_1m", rows, symbol, start)
            print(f"  {symbol}: {len(rows)} rows upserted")
            ok_count += 1
        except Exception as e:
            print(f"  ERROR {symbol}: {e}", file=sys.stderr)
            err_count += 1

    print(f"1m refresh complete: {ok_count} ok, {err_count} errors, {days}-day window")


# ----------------------------
# Refresh: daily bars (rolling 5-day upsert via staging + MERGE)
# ----------------------------

def refresh_1d(symbols: List[str], days: int = 5) -> None:
    """
    Upsert last `days` trading days of daily bars.
    Cost: ~5 rows per symbol per run. Extremely cheap.
    Polygon API: 1 call per symbol.
    BQ: load job to staging → MERGE into bars_1d (streaming-buffer-safe).
    """
    client = bq_client()
    today = dt.date.today()
    start = today - dt.timedelta(days=days)

    ok_count = 0
    err_count = 0

    for symbol in symbols:
        print(f"Refreshing 1d bars for {symbol} [{start} → {today}]")
        try:
            rows = fetch_agg_bars(symbol, 1, "day", start, today)
            if not rows:
                print(f"  No data for {symbol}")
                continue

            upsert_bars(client, "bars_1d", rows, symbol, start)
            print(f"  {symbol}: {len(rows)} rows upserted")
            ok_count += 1
        except Exception as e:
            print(f"  ERROR {symbol}: {e}", file=sys.stderr)
            err_count += 1

    print(f"1d refresh complete: {ok_count} ok, {err_count} errors, {days}-day window")


# ----------------------------
# Refresh: live snapshots (append-only)
# ----------------------------

def refresh_live(symbols: List[str], force: bool = False) -> None:
    """
    Append current snapshot to quotes_live.
    Cost: 1 row per symbol per call. ~18 rows per minute during market hours.
    Polygon API: 1 call per symbol.
    BQ: streaming INSERT only (no deletes).
    """
    if not force and not is_market_hours():
        print("Market closed, skipping live refresh (use --force to override)")
        return

    client = bq_client()
    table_fqn = f"{GCP_PROJECT}.{BQ_DATASET}.quotes_live"
    rows = []

    for symbol in symbols:
        try:
            rows.append(fetch_snapshot(symbol))
        except Exception as e:
            print(f"  Snapshot failed for {symbol}: {e}", file=sys.stderr)

    if rows:
        load_json_rows(client, table_fqn, rows)
    print(f"Live refresh: appended {len(rows)} quote rows")


# ----------------------------
# CLI
# ----------------------------

def main():
    p = argparse.ArgumentParser(description="Cost-optimized BigQuery refresh")
    sub = p.add_subparsers(dest="cmd", required=True)

    r1m = sub.add_parser("refresh-1m", help="Rolling 3-day overwrite of 1m bars")
    r1m.add_argument("--symbols", default=",".join(DEFAULT_SYMBOLS))
    r1m.add_argument("--days", type=int, default=3)
    r1m.add_argument("--force", action="store_true", help="Run even outside market hours")

    r1d = sub.add_parser("refresh-1d", help="Rolling 5-day overwrite of daily bars")
    r1d.add_argument("--symbols", default=",".join(DEFAULT_SYMBOLS))
    r1d.add_argument("--days", type=int, default=5)

    rl = sub.add_parser("refresh-live", help="Append live snapshots")
    rl.add_argument("--symbols", default=",".join(DEFAULT_SYMBOLS))
    rl.add_argument("--force", action="store_true", help="Run even outside market hours")

    ra = sub.add_parser("refresh-all", help="Run all refresh tasks")
    ra.add_argument("--symbols", default=",".join(DEFAULT_SYMBOLS))
    ra.add_argument("--force", action="store_true")

    args = p.parse_args()
    symbols = [s.strip() for s in args.symbols.split(",") if s.strip()]

    if args.cmd == "refresh-1m":
        refresh_1m(symbols, args.days, getattr(args, "force", False))
    elif args.cmd == "refresh-1d":
        refresh_1d(symbols, args.days)
    elif args.cmd == "refresh-live":
        refresh_live(symbols, getattr(args, "force", False))
    elif args.cmd == "refresh-all":
        force = getattr(args, "force", False)
        refresh_live(symbols, force)
        refresh_1m(symbols, 3, force)
        refresh_1d(symbols, 5)


if __name__ == "__main__":
    main()
