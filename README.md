# my-app — Trigger Engine

AI-assisted market intelligence and trade decision-support dashboard. The
app is an operator workspace, not an execution platform: it surfaces
opportunity, context, and capital posture so the user can decide. It does
not place trades.

The dashboard is built on **three core, complementary layers** —
**Trigger Engine**, **CreditView (Credit-Vol Scanner)**, and **Lethal
Board (Discovery Layer)**. All three are active. None replaces another.
Lethal Board is the newest layer and is **additive**, sitting beside the
existing Trigger Engine and CreditView views, not on top of them.

---

## Project Overview

The application is built on **three core, complementary intelligence
layers**. All three are active. None of them replaces another. The newest
layer (Lethal Board) is **additive** — it sits beside the existing layers,
not on top of them.

- **Trigger Engine** — setup, timing, and touch discipline for individual
  instruments. **Core layer, ongoing.**
- **CreditView (Credit-Vol Scanner)** — credit / volatility / regime
  confirmation. Helps decide whether the broader environment supports the
  signal. **Core layer, ongoing.**
- **Lethal Board (Discovery Layer)** — capital-aware opportunity discovery
  and ranking. Identifies and ranks candidates against the operator's
  available capital and existing exposure. **Additive layer, ongoing.**

Each layer answers a different question and is designed to fail gracefully
when its data source is unavailable. The three share data when useful but
are independently deployable: any one of them remains useful when the other
two are quiet. CreditView is **not** deprecated, replaced, or subordinate to
the Lethal Board.

---

## Current Status

The app's architecture is **three-layer** and remains so:

1. **Trigger Engine** — core, ongoing
2. **CreditView / Credit-Vol Scanner** — core, ongoing
3. **Lethal Board / Discovery Layer** — additive, ongoing

Recent work has focused on landing the Lethal Board safely alongside the
existing layers. The Lethal Board now supports session-aware live stock
universe discovery, capital-aware ranking, recorded alert auditing, and
safe fallback handling. Live option-chain pricing is **not yet
implemented**; premium values are `estimated` or `unavailable` until a
dedicated options provider such as ThetaData is integrated.

**The Trigger Engine and CreditView remain unchanged at the operator
surface** through this work — every Lethal Board phase has been additive,
with explicit do-not-touch rules on the existing engine, scoring, ranking,
persistence, and alert files.

---

## Core Layers

### Trigger Engine
Per-instrument setup discipline. Watches for a defined trade thesis to form,
classifies its stage, and surfaces a structured trade recommendation. Owns
the existing Credit-Vol options engine internally for premium-selling
workflows.

### CreditView / Credit-Vol Scanner
Macro-context view tuned for premium selling. Reads credit-spread proxies,
volatility indicators, and the broader regime to tell the operator whether
the environment is favorable for the strategies the Trigger Engine
emits.

### Lethal Board / Discovery Layer
Capital-aware opportunity discovery. Pulls a session-appropriate stock
universe, classifies opportunities, ranks them against the operator's
remaining deployable capital, and presents a card/detail UI with a
recorded-alert audit panel.

The Lethal Board is reachable from the Trigger Engine sidebar via the
**LETHAL BOARD** button (desktop) or **LB** button (mobile).

---

## Trigger Engine — Current Capabilities

- **Setup / timing discipline.** Watches a defined trade thesis form across
  the configured instruments and classifies the stage of that setup before
  endorsing a recommendation.
- **Touch / timing support.** Surfaces touch-style timing signals so the
  operator can wait for confirmation rather than chasing.
- **Watch / entry logic.** Categorizes each candidate as watch, wait, or
  ready-to-act. The operator decides whether to act.
- **Existing signal framework.** Multiple setup types (pair, basket,
  standalone, stack reversal, infra follower) produce structured trade
  recommendations with risk labels, timing windows, and trade-management
  notes.
- **Owns the existing Credit-Vol options engine** internally for
  premium-selling workflows.

---

## CreditView / Credit-Vol Scanner — Current Capabilities

CreditView is the conservative, regime-aware confirmation layer. It is
designed to be useful even without live option-chain pricing.

- **Regime / market context.** Reads credit-spread proxies and volatility
  indicators to label the broader environment as supportive, neutral, or
  stressed for premium selling.
- **Credit-volatility lens.** Combines credit and volatility signals to
  flag moments when premium selling is structurally favorable versus
  moments when it is not.
- **Timing / premium-readiness signals.** Highlights timing windows that
  historically support premium selling, without making promises about any
  individual fill.
- **ETF and equity cards.** Per-instrument cards with score, regime tag,
  timing stage, and a clear watch/wait recommendation.
- **Detail panel.** Drill-down into the selected card surfaces context,
  recommendation, and risk labels — all user-facing fields only.
- **Risk labels.** Each card carries a plain-language risk label (LOW /
  MED / HIGH-style) so the operator can read posture at a glance.
- **Watch / wait recommendations.** CreditView favors a conservative
  "WATCH" or "WAIT" stance when context is ambiguous; it does not push
  aggressive entries.
- **Live / fallback status handling.** When upstream data is unavailable,
  CreditView falls back gracefully and labels the missing inputs rather
  than hiding the gap.
- **Does not require live option-chain premium to provide value.**
  CreditView's signal is built from regime / volatility / credit context,
  not from live bid/ask. Useful even on a delayed-snapshot data plan.

---

## Lethal Board — Current Capabilities

- **Capital-aware opportunity discovery.** Broader stock universe scanning
  ranked against the operator's available capital and current exposure.
- **Session-aware live stock universe sourcing.** Detects market session
  (`premarket`, `regular`, `postmarket`, `closed`) and picks the right
  fetch strategy.
- **Regular-session: gainers + losers union** through valid Polygon
  endpoints.
- **Extended-hours support.** Premarket / postmarket use a curated bulk
  ticker snapshot drawn from the existing watchlist + ticker catalog,
  with AI-infrastructure names surfaced first. Closed session falls back
  to last-known curated data with an explicit `Markets closed` warning.
- **Retired invalid Polygon `MOST_ACTIVE` endpoint.** That path returned
  404 on the live proxy. Universe sourcing now uses only valid Polygon
  endpoints; legacy `MOST_ACTIVE` callers route to a structured fallback
  without making any HTTP request.
- **Capital-aware ranking** with a single best-use-of-capital winner per
  scan and explicit displacement tracking for candidates the winner
  outranked.
- **Recorded Discovery Alerts** — read-only audit list that surfaces only
  the alerts the operator chose to commit (via "Run & record"). Preview
  scans never persist.
- **Rollup chip** beside the audit panel: `24h`, `7d`, `new best`,
  `displaced` counts derived only from the sanitized audit projection.
- **Card / detail UI.** Best-ranked opportunity card, ranked card grid,
  and a per-ticker detail panel with safe-only fields.
- **Session-aware freshness policy.** Quote-age thresholds adapt to
  session: regular session uses ~18-60 minute windows tuned to the
  current Polygon plan tier's snapshot delay; premarket/postmarket
  allow up to 6 hours; closed session disables freshness rejection
  entirely. A 6-hour prior-session safeguard catches yesterday's data
  during regular-session scans regardless of mode.
- **Fallback / circuit-breaker behavior.** Live failures (404, 403,
  network) never freeze the scanner. Failures surface as structured
  metadata (`source: fallback`, `circuit_open`, `proxy_unreachable`,
  `closed`, etc.) so the operator can see *why* the universe is empty.
- **Premium source honesty.** Premium values are labeled as `live`
  (chain-based) only when an actual chain row was used. Otherwise the
  label is `estimated` (IV- or ATR-derived) or `unavailable`. The UI
  never relabels an estimated quote as live.
- **Options-capability indicator.** When Polygon's options snapshot
  endpoint is not available on the current plan, the capability probe
  surfaces this as `optionsCapability: unavailable_plan` and the
  scanner cleanly falls back to estimated premium. The 403 entitlement
  response never gets misinterpreted as a transient failure.

---

## Data Providers

### In use today
- **Polygon.io** — stock universe, single-ticker snapshots, gainers,
  losers, bulk ticker snapshots, historical aggregates. The current
  plan tier provides ~15-minute delayed snapshot data; the freshness
  policy is calibrated accordingly.
- **TradingView** — chart visualization and manual confirmation. Used
  externally to the dashboard's data path.
- **Broker** — final quote verification and execution. The dashboard
  does not place trades.

### Planned (not yet implemented)
- **ThetaData** — selected as the likely future options-chain provider
  for bid / ask / mid / IV / Greeks / chain snapshots. **Integration
  has not started.** Until ThetaData (or another live-chain provider)
  is wired in, the Lethal Board's premium values remain `estimated` or
  `unavailable`.

---

## Current Limitations

- **No auto-trading.** The dashboard is decision-support only. There is
  no order placement, no position adjustment, no broker writes.
- **No live option-chain pricing yet.** Polygon's options snapshot
  endpoint is not entitled on the current plan; the capability probe
  surfaces this as `optionsCapability: unavailable_plan`.
- **ThetaData integration is planned but has not started.** The Lethal
  Board will not show live bid / ask / mid until the ThetaData adapter
  (Phase 4.5C) ships.
- **Premium values may be estimated or unavailable.** Verify against
  your broker's live chain before any entry.
- **Holiday-aware session detection deferred.** US-market holidays
  currently classify as regular weekdays. Address tracked for a future
  phase. Treat trading-holiday scans with caution.
- **Operator-in-the-loop.** The system suggests; the operator decides
  and executes. Always verify against your broker's chain and a chart
  before entry.

---

## Validation Status

As of the latest checkpoint (Phase 1 through Phase 4.5A1):

- **717** discovery-layer assertions across 10 phase test scripts —
  all passing.
- **100** existing engine validation assertions (`npm run validate`) —
  all passing.
- Production build clean.

This checkpoint is documented in `docs/SESSION_NOTES/`.

---

## Developer Commands

```
# Build & lint
npm run validate                       # full existing engine validation suite
npm run build                          # production Vite build

# Discovery-layer phase tests (each is a standalone Node script)
npm run test:discovery-engine          # Phase 1 — backend foundation
npm run test:discovery-phase2          # Phase 2 — orchestrator + adapters
npm run test:discovery-phase3          # Phase 3 — Polygon adapters + UI shell
npm run test:discovery-phase4          # Phase 4 — Polygon glue + visibility
npm run test:discovery-phase4-1        # Phase 4.1 — preview vs commit alerts
npm run test:discovery-phase4-2        # Phase 4.2 — recorded alerts panel
npm run test:discovery-phase4-3        # Phase 4.3 — rollup chip
npm run test:discovery-phase4-4        # Phase 4.4 — card/detail UI
npm run test:discovery-phase4-5a       # Phase 4.5A — session-aware universe
npm run test:discovery-phase4-5a1      # Phase 4.5A1 — session-aware freshness

# Dev server
npm run dev                            # Vite dev server (default :5173)
```

Each phase test runs offline with dependency-injected fetchers — none
of them require network or live market data.

---

## Safety / Operator Notes

- **Preview scans do not persist.** "Run sample scan" and "Run live
  preview" never write to the alert history. Only "Run & record"
  commits the top opportunity to the audit list.
- **Recorded alerts are sanitized.** The audit list and rollup chip
  show only safe, user-facing fields. They never expose internal
  scoring details, probability internals, IV fields, or any other
  engine internals.
- **Do not trade solely from the app.** Treat every Lethal Board signal
  as an idea to verify, not an order to place.
- **Verify live chain and chart before any execution.** Premium values
  shown by the Lethal Board are `estimated` or `unavailable` until the
  options-chain adapter is wired. Confirm against your broker's chain.
- **Watch the live status and capability indicators.** If the live
  status pill shows `fallback`, `circuit_open`, or `unavailable_plan`,
  the data you're looking at is degraded — see the fallback metadata
  for the reason.

---

## Roadmap

The phases below describe **Lethal Board** expansion specifically. The
**Trigger Engine** and **CreditView** continue to evolve in parallel; their
own roadmap items are tracked in `docs/WORK_QUEUE.md`. None of the phases
below replace, deprecate, or subordinate the Trigger Engine or CreditView.

Next Lethal Board phases, in approximate order:

- **Phase 4.5B — Selected Ticker Trade Construction Snapshot.**
  Populate the existing `TRADE CONSTRUCTION — SELECTED TICKER`
  placeholder with execution-context fields (suggested strike,
  expiration, R1/R2/support/ATR levels, ATR distance to strike,
  estimated premium, premium source). Uses already-active data
  paths only. Lethal Board only.
- **Phase 4.5C — ThetaData Options Provider Adapter.**
  Pluggable options-chain provider interface with ThetaData as the
  first implementation. Normalizes bid/ask/mid, IV, and Greeks. UI
  switches premium labeling from `estimated` to `live` only when
  real chain data is present. The adapter is reachable from any
  layer that opts in; existing Trigger Engine and CreditView views
  do not have to change.
- **Phase 4.6 — Chart + Trade Workspace.**
  Expanded selected-ticker workspace: chart, levels, strike zone,
  option snapshot, and operator actions (Watch / Pass / Prepare
  Entry). Still no auto-trading or order placement. Lethal Board
  surface; Trigger Engine and CreditView keep their own surfaces.

Roadmap items for **Trigger Engine** and **CreditView** continue to be
tracked in `docs/WORK_QUEUE.md` independent of the Lethal Board phase
schedule. Cross-layer items beyond Phase 4.6 also live there.

---

## Project Layout (high level)

```
src/
  App.jsx                        Trigger Engine dashboard
  CreditVolScanner.jsx           CreditView page
  TickerSetupBuilder.jsx         Setup builder
  main.jsx                       Top-level router
  components/discovery/          Lethal Board UI
  engines/discovery/             Discovery backend (capital-aware)
  lib/                           Shared engines, alerts, history
  optionsWatchlist.js            Curated options watchlist
  tickerCatalog.js               Master ticker catalog

docs/
  ARCHITECTURE.md                Deep technical reference
  CLAUDE.md                      Operating rules for AI collaboration
  DECISIONS.md                   Append-only decision log
  WORK_QUEUE.md                  Prioritized backlog
  SESSION_NOTES/                 Per-day session logs
  history/SYSTEM_MANIFEST.md     Long-form system reference

scripts/
  test-discovery-*.js            Discovery-layer phase test scripts
  validate-*.js, test-*.js       Existing engine validation suite
```

---

## License

Private project. All rights reserved by the author.
