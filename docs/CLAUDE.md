# Claude Operating Rules for Trigger Engine

## Mission
Maintain and extend the trigger-engine without breaking:
- Trigger Engine dashboard
- Credit-Vol Scanner
- Setup Builder
- BigQuery market data pipeline

## Priorities
1. Preserve live scanner stability
2. Prefer additive changes over rewrites
3. Keep setup logic modular and testable
4. Update docs/history/SYSTEM_MANIFEST.md after major changes

## Architecture truths
- Frontend: Vite + React
- UI pages: App.jsx (trigger engine), CreditVolScanner.jsx, TickerSetupBuilder.jsx
- Signal engine modules: src/lib/engine/ (config, macroRegime, setupScoring, strikeSelection, profitManagement, defenseLogic, probabilityLayer) — barrel: signalEngine.js
- Evaluator modules: src/lib/evaluators/ (pairEvaluator, basketEvaluator, standaloneEvaluator, infraFollowerEvaluator, stackReversalEvaluator, shared)
- Setup system: src/config/setups.js (definitions) -> src/lib/setupRegistry.js (load/filter/resolve) -> src/lib/setupValidator.js (schema checks)
- Contracts: contracts/ (setup.schema.json, signal-output.schema.json, watchlist.schema.json)
- Pipeline: market_data_pipeline.py, refresh_schedule.py
- Storage: BigQuery dataset market_data
- Vendor: Polygon.io
- Local scheduler: Windows Task Scheduler + VBS wrapper

## Setup registry rules
- All setup definitions live in src/config/setups.js — never inline in UI files
- App.jsx imports setups via setupRegistry.getSetupsAsObject() which converts to engine format
- New setups: add to src/config/setups.js, registry handles conversion and symbol extraction
- Validate before adding: setupValidator.validateSetup(setup) returns error array (empty = valid)
- Runtime mutations (add/update/remove/toggle) go through setupRegistry.js, not direct array edits
- Types: pair, basket, standalone, stack_reversal, infra_follower
- Each type has required fields and threshold schemas defined in setupValidator.js

## Coding rules
- Do not hardcode duplicate ticker catalogs
- Do not hardcode duplicate setup definitions — use the registry
- Reuse helper functions before adding new ones
- Prefer config-driven setup definitions
- Keep all secrets in env vars only
- For any feature touching scoring or trade logic, add a test or validation harness
- When updating setup logic, also update manifest sections: Inflight Tasks, Changelog, Architecture if needed

## High-value areas
- Setup Builder runtime config linkage
- BQ MERGE-based refresh logic
- IV rank integration
- optionsWatchlist metadata consistency
- position persistence
- better slope/trend calculation from bars_1m

## Task lane
- **docs/WORK_QUEUE.md** — Prioritized backlog (P1/P2/P3). Check before starting work. Update after completing tasks.
- **docs/DECISIONS.md** — Append-only architecture decision log. Add an entry when making non-obvious design choices.
- **docs/SESSION_NOTES/YYYY-MM-DD.md** — Per-session summary. Create at end of each major session with: goals, what got built, decisions made, open items.
- **docs/history/SYSTEM_MANIFEST.md** — Full system reference. Update sections 6 (Inflight), 8 (File Tree), 11 (Changelog) after major changes.

## Validation scripts
Run after every code change:
- `npm run lint:setups` — validates setup definitions against schema
- `npm run test:engine` — smoke tests signal engine (22 assertions)
- `npm run test:watchlist` — smoke tests watchlist data integrity (21 assertions)
- `npm run manifest:check` — verifies manifest/code sync (27 assertions)
- `npm run validate` — runs all three above in sequence
- `npm run build` — Vite production build

## Prompt pack
Reusable prompts for recurring tasks in `prompts/`:
- `add_setup.md` — adding a new trading setup
- `pipeline_fix.md` — fixing/updating BQ pipeline
- `manifest_refresh.md` — updating SYSTEM_MANIFEST.md

## Session workflow
1. Read: CLAUDE.md, SYSTEM_MANIFEST.md, WORK_QUEUE.md, DECISIONS.md
2. Summarize current system state
3. Identify affected files for this task
4. Propose minimal safe patch
5. Implement
6. Run `npm run validate && npm run build`
7. Update manifest if architecture or features changed

## Output style
When proposing changes:
1. State files impacted
2. Explain risk
3. Show patch plan
4. Suggest rollback path
