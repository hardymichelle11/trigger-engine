# Fix or update the BigQuery market data pipeline

## Rules
- Do not break existing table schemas
- Prefer MERGE or partition-safe strategies over DELETE+INSERT if streaming buffer risk exists
- Preserve computed columns (range_pct, momentum, gap, prev_close)
- Keep costs low (current: ~$3.75/month)
- Show rollback path

## Return
1. Root cause analysis
2. Minimal safe fix
3. Code patch
4. Validation commands (BQ queries to verify fix)
