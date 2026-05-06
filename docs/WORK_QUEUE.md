# Trigger Engine Work Queue

> Prioritized task list for Claude and Michelle. Update after each session.
> P1 = blocking or high-value. P2 = important but not urgent. P3 = nice-to-have.

---

## P1 — Must Do

- [x] **Connect Setup Builder output to runtime scanner config** (completed 2026-04-10)
  Builder validates → addSetup → React state update → scanner re-renders. localStorage persistence. Toggle/remove in builder UI.

- [x] **Replace DELETE+INSERT with MERGE for BQ rolling refresh** (completed 2026-04-10)
  Staging table + MERGE pattern. Load jobs to staging (no streaming buffer), MERGE into canonical tables on (symbol, exchange, ts). Idempotent, no duplicates.

- [x] **Add position persistence to localStorage** (completed 2026-04-11)
  Storage adapter layer: positionStorage.js + incomeStorage.js. Schema versioned. Persists user workflow data only, not live market values. Recomputes rollPlan/profitPlan on load.

- [ ] **Backfill new symbols to BigQuery**
  30 symbols added to pipeline but have no historical data yet: CORZ, IREN, BX, APO, ARCC, OWL, OBDC, COIN, HYG, KRE, LQD, SPY, QQQ, TLT, SLV, GLD, XLF, XLE, TSLA, GOOG, AMD, PLTR, MSTR, SMCI, META, HOOD, BTDR, FXI. Run: `python pipeline/market_data_pipeline.py backfill --symbols <list> --days_1m 90 --days_1d 1000`

## P2 — Important

- [x] **Add real slope calculation from bars_1m** (completed 2026-04-11)
  priceHistory.js with linear regression slope, MA, MA-slope, acceleration, confidence. Fetches 60 recent 1m bars from Polygon. Integrated into stackReversalEvaluator and infraFollowerEvaluator with intraday-proxy fallback.

- [ ] **Backfill computed columns on existing rows**
  660K+ existing rows in bars_1m/bars_1d lack range_pct, momentum, gap. Needs a one-time BQ UPDATE query or a Python backfill script.

- [x] **Add IV rank ingestion adapter** (completed 2026-04-11)
  Source-agnostic adapter (ivAdapter.js) + TTL cache (ivCache.js). Sources: Polygon options, snapshot extraction, ATR estimate fallback, manual entry. Scoring degrades gracefully on missing/stale data.

- [ ] **Live options data feed for put/call ratio**
  CreditVolScanner put/call ratio uses placeholder random values. Needs real options snapshot data from Polygon options endpoint or broker API.

- [x] **OXY, MOS, CF setup evaluators** (completed 2026-04-11)
  Added as standalone setups through config registry. Mock quotes, pipeline symbols, ticker catalog already present. Standalone evaluator handles regime + vol + momentum scoring.

## P3 — Nice to Have

- [x] **Real-time WebSocket feed** (completed 2026-04-11)
  Replace Polygon REST polling with WebSocket for sub-second price updates. Lower latency, fewer API calls.

- [x] **Backtesting harness** (completed 2026-04-11)
  Alert-driven backtest: replay gate conditions, measure trade outcomes (expired above, touch, MFE, MAE, time to profit). CLI with synthetic scenarios. Reporter with per-symbol breakdown + threshold comparison. 47 assertions.

- [x] **Alert notifications** (completed 2026-04-11)
  Multi-gate alert engine (score + MC prob + touch + drawdown + IV + dedup). Browser notifications + console + webhook-ready. localStorage history with dedup. 34 test assertions.

- [x] **Monte Carlo upgrade for options engine** (completed 2026-04-11)
  Full path-based MC (N=1000, GBM) with touch probability, max drawdown, price distribution percentiles. erf retained as fallback. 31 test assertions.

- [x] **Dashboard reads from BQ** (completed 2026-04-11)
  Unified history provider (BQ > Polygon > cache). BQ reader via proxy endpoint. App.jsx slope computation now uses history provider chain. Daily context API for gap/range/period high-low. 21 assertions.

- [x] **Historical top-100 scanner** (completed 2026-04-11)
  Build setups dynamically from full Macroption historical watchlist for broader screening beyond the focused 2026 list.

- [ ] **Cloud Run deployment**
  Move scheduled tasks from local Windows Task Scheduler to Cloud Scheduler + Cloud Run for reliability and remote access.

---

## Tech Debt — Hosting / Deploy

Notes from the 2026-05-05 Firebase Hosting experiment (rolled back). None are blocking; capture so they're not forgotten when remote-access is revisited.

- [ ] **Decide canonical production host** — currently three competing paths:
  1. GitHub Pages workflow at `.github/workflows/deploy.yml` (still active, deploys on push to `main`)
  2. Custom domain `aipicks.shop` declared in `public/CNAME` (GitHub-Pages-specific artifact)
  3. Firebase project `aipicks-stock` (hosting disabled but project exists on Spark plan)
  Pick one, kill the other two. Live data caveats apply to all (see below).

- [ ] **Production runtime services missing for any remote deploy**
  - **KnowledgeBot** — `KnowledgeBotPanel.jsx` calls `/api/knowledgebot/chat`; the Express server (`server/knowledgeBotServer.js`) has no production host. Pick Cloud Run / Render / Fly when needed.
  - **ThetaData** — `vite.config.js` proxies `/theta` → `127.0.0.1:25503`. Terminal v3 is local-only by design; any remote viewer needs to run their own Terminal. Document this reality on whatever landing page is built.
  - **BigQuery read path** — `bqReader.js` requires `VITE_BQ_PROXY_URL` at build time. No proxy exists yet. Until then, BQ-backed views return null in production builds. (Phase 4.7.6 BQ tier-1 stub is also waiting on this proxy — see `replayLastCloseLoader.js` `// TODO(phase 4.8?)`.)

- [ ] **Cloudflare Worker `worker/polygon-proxy.js` deployment status unknown**
  Local file + `wrangler.toml` exist, but no record of which Cloudflare account owns the deployed Worker URL. Verify it's still alive and that `src/lib/polygonProxy.js` points at the right URL before relying on it for production.

- [ ] **Empty GCP project `my-project-trigger-engine-lb`**
  Created during the Firebase experiment, never used. Safe to delete from GCP console (IAM & Admin → Manage Resources). Not urgent — empty projects don't bill.

- [ ] **`firebase-tools` global npm install**
  `npm install -g firebase-tools` was run during the experiment. ~150MB on disk, zero ongoing cost. Remove with `npm uninstall -g firebase-tools` if reclaiming disk space matters.

---

## Tech Debt — Open Bugs (Discovered 2026-05-05)

- [ ] **LB button on mobile not working** — reported during 2026-05-05 session, root cause not identified. Wiring inspected and looks correct (`main.jsx:195` → `App.jsx:705,930`; CSS at `App.jsx:846-847`). User did not specify whether the symptom is missing button, dead click, or broken target page. Re-investigate with a specific repro on the next mobile-test pass.

- [ ] **"Engine not generating output correctly"** — reported during 2026-05-05 session, no specifics captured. Which engine (Trigger / Lethal Board / CreditVol), what's wrong (empty results / wrong values / stale / errors), mock-vs-live, and console state all unknown. Capture symptom + screenshot + console next time it reproduces.

---

*Last updated: 2026-05-05*
