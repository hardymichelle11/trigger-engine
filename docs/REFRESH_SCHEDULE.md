# Refresh Schedule

## What Was Set Up

| Task | Script | Cadence | Window | Rows/Run |
|------|--------|---------|--------|----------|
| Live snapshots | `refresh-live` | Every 1 min (market hours) | Append-only | ~18 rows |
| 1-minute bars | `refresh-1m` | Every 15 min (market hours) | Rolling 3-day overwrite | ~21K rows |
| Daily bars | `refresh-1d` | Daily at 5:00 PM | Rolling 5-day overwrite | ~90 rows |

All tasks only run Mon-Fri during market hours (9:25 AM - 4:05 PM ET) to avoid wasting API calls.

## Why This Schedule Is Cost-Optimized

### BigQuery costs avoided:
- **No full-table scans**: DELETEs use `WHERE symbol = @sym AND bar_date >= @date` which prunes to recent partitions only
- **No SELECT ***: Pipeline writes directly, no read queries during refresh
- **Partition pruning**: All tables partitioned by date, clustered by symbol -- BQ only touches the 3-5 day window
- **Streaming inserts only**: No load jobs, no slot reservations
- **Market hours gating**: Scripts auto-skip outside 9:25-16:05 ET Mon-Fri

### Polygon API calls per day (market hours only, ~6.5 hrs):
| Task | Calls/Run | Runs/Day | Total Calls/Day |
|------|-----------|----------|-----------------|
| Live snapshots | 18 | 390 | 7,020 |
| 1-minute bars | 18 | 26 | 468 |
| Daily bars | 18 | 1 | 18 |
| **Total** | | | **~7,500** |

Developer tier allows unlimited calls (5 calls/min on free, unlimited on paid).

### BQ data processed per day:
| Task | Rows Written/Day | Est. BQ Cost/Day |
|------|------------------|------------------|
| Live snapshots | ~7,000 | ~$0.002 |
| 1-minute bars | ~550K (overlapping overwrites) | ~$0.05 |
| Daily bars | ~90 | ~$0.0001 |
| **Total** | | **~$0.05/day** |

### Monthly cost estimate:
| Component | Monthly Cost |
|-----------|-------------|
| BQ streaming inserts | ~$1.00 |
| BQ storage (active) | ~$0.50 (growing ~20M rows/mo for 1m bars) |
| BQ DML deletes | ~$0.10 |
| Polygon API | $0 (included in developer tier) |
| **Total** | **~$1.60/month** |

## How to Set Up

### Windows (Task Scheduler):
```batch
cd pipeline
setup_tasks.bat
```
Run as Administrator. Creates 3 scheduled tasks.

### Linux/Mac (cron):
```bash
# Edit crontab
crontab -e

# Add these lines:
# Live snapshots: every 1 min, Mon-Fri 9:25-16:05 ET
* 9-16 * * 1-5 cd /path/to/my-app && python pipeline/refresh_schedule.py refresh-live

# 1-minute bars: every 15 min, Mon-Fri
*/15 9-16 * * 1-5 cd /path/to/my-app && python pipeline/refresh_schedule.py refresh-1m

# Daily bars: 5 PM Mon-Fri
0 17 * * 1-5 cd /path/to/my-app && python pipeline/refresh_schedule.py refresh-1d
```

### Cloud Scheduler + Cloud Run (production):
Deploy `refresh_schedule.py` as a Cloud Run service, then create Cloud Scheduler jobs pointing to it. This eliminates the need for a local machine to be running.

## How to Manually Trigger Refresh

```bash
# Set env vars
export POLYGON_API_KEY="your-key"
export GOOGLE_CLOUD_PROJECT="supple-synapse-470605-c5"
export GOOGLE_APPLICATION_CREDENTIALS="./pipeline/service-account.json"

# Individual tasks
python pipeline/refresh_schedule.py refresh-live --force
python pipeline/refresh_schedule.py refresh-1m --force
python pipeline/refresh_schedule.py refresh-1d

# All at once
python pipeline/refresh_schedule.py refresh-all --force
```

Use `--force` to run outside market hours.

## How to Change Cadence

### Change refresh window:
```bash
# 1m bars: use 5-day window instead of 3
python pipeline/refresh_schedule.py refresh-1m --days 5

# 1d bars: use 10-day window
python pipeline/refresh_schedule.py refresh-1d --days 10
```

### Change symbols:
```bash
python pipeline/refresh_schedule.py refresh-1m --symbols NBIS,NEBX,BE
```

### Change Task Scheduler cadence (Windows):
```batch
# Change 1m bars to every 5 min
schtasks /change /tn "MarketData-Bars1m" /mo 5
```

## Data Retention

Current design keeps all data indefinitely. To manage storage costs at scale:

```sql
-- Delete 1m bars older than 1 year
DELETE FROM `supple-synapse-470605-c5.market_data.bars_1m`
WHERE bar_date < DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY);

-- Delete live quotes older than 30 days
DELETE FROM `supple-synapse-470605-c5.market_data.quotes_live`
WHERE quote_date < DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY);
```
