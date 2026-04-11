"""
validate_bq.py

Post-refresh validation for BigQuery market data tables.
Detects duplicates, verifies row counts, and confirms key uniqueness.

Usage:
  python pipeline/validate_bq.py                    # check last 5 days
  python pipeline/validate_bq.py --days 10           # check last 10 days
  python pipeline/validate_bq.py --table bars_1m     # check specific table

Environment:
  GOOGLE_CLOUD_PROJECT
  GOOGLE_APPLICATION_CREDENTIALS
"""

from __future__ import annotations

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from market_data_pipeline import bq_client, GCP_PROJECT, BQ_DATASET


def check_duplicates(client, table: str, days: int) -> int:
    """Check for duplicate (symbol, exchange, ts) rows in recent window."""
    fqn = f"{GCP_PROJECT}.{BQ_DATASET}.{table}"
    sql = f"""
        SELECT symbol, exchange, ts, COUNT(*) AS n
        FROM `{fqn}`
        WHERE bar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
        GROUP BY 1, 2, 3
        HAVING COUNT(*) > 1
        LIMIT 20
    """
    result = list(client.query(sql).result())
    if result:
        print(f"\n  DUPLICATES FOUND in {table} ({len(result)} groups):")
        for row in result[:10]:
            print(f"    {row.symbol} | {row.ts} | count={row.n}")
    else:
        print(f"  {table}: No duplicates in last {days} days")
    return len(result)


def check_row_counts(client, table: str, days: int) -> None:
    """Show row counts per date in recent window."""
    fqn = f"{GCP_PROJECT}.{BQ_DATASET}.{table}"
    sql = f"""
        SELECT bar_date, COUNT(*) AS rows, COUNT(DISTINCT symbol) AS symbols
        FROM `{fqn}`
        WHERE bar_date >= DATE_SUB(CURRENT_DATE(), INTERVAL {days} DAY)
        GROUP BY 1
        ORDER BY 1 DESC
    """
    result = list(client.query(sql).result())
    print(f"\n  {table} — row counts (last {days} days):")
    print(f"  {'DATE':<14} {'ROWS':>8} {'SYMBOLS':>8}")
    print(f"  {'─'*14} {'─'*8} {'─'*8}")
    for row in result:
        print(f"  {str(row.bar_date):<14} {row.rows:>8,} {row.symbols:>8}")
    if not result:
        print(f"  (no data in last {days} days)")


def check_staging_empty(client, table: str) -> None:
    """Verify staging table is not accumulating stale data."""
    staging_fqn = f"{GCP_PROJECT}.{BQ_DATASET}.{table}_staging"
    try:
        sql = f"SELECT COUNT(*) AS n FROM `{staging_fqn}`"
        result = list(client.query(sql).result())
        count = result[0].n if result else 0
        status = "OK (empty or single-batch)" if count < 50000 else f"WARNING: {count:,} rows"
        print(f"  {table}_staging: {status}")
    except Exception:
        print(f"  {table}_staging: not found (will be created on first refresh)")


def main():
    p = argparse.ArgumentParser(description="Validate BigQuery market data")
    p.add_argument("--days", type=int, default=5, help="Days to check")
    p.add_argument("--table", choices=["bars_1m", "bars_1d", "both"], default="both")
    args = p.parse_args()

    client = bq_client()
    tables = ["bars_1m", "bars_1d"] if args.table == "both" else [args.table]

    print(f"\n  BigQuery Validation Report")
    print(f"  ─────────────────────────")
    print(f"  Project: {GCP_PROJECT}")
    print(f"  Dataset: {BQ_DATASET}")
    print(f"  Window:  last {args.days} days")

    total_dupes = 0
    for table in tables:
        total_dupes += check_duplicates(client, table, args.days)
        check_row_counts(client, table, args.days)
        check_staging_empty(client, table)

    print(f"\n  {'PASS' if total_dupes == 0 else 'FAIL'}: {total_dupes} duplicate groups found\n")
    sys.exit(0 if total_dupes == 0 else 1)


if __name__ == "__main__":
    main()
