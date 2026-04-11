# Add a new trading setup to the trigger engine

## Requirements
- Reuse existing helper functions from `src/lib/evaluators/shared.js`
- Add config entry to `src/config/setups.js` setup registry
- Validate with `src/lib/setupValidator.js` before committing
- Add evaluator in `src/lib/evaluators/` if new type, or reuse existing type
- Preserve existing setup scoring behavior
- Add ticker(s) to `src/tickerCatalog.js` if not already present
- Add ticker(s) to pipeline files if BQ data needed
- Update `docs/history/SYSTEM_MANIFEST.md` changelog and inflight tasks

## Return
1. Files changed (list all)
2. Reasoning (why this setup type, which evaluator, threshold rationale)
3. Patch (complete code changes)
4. Test plan (`npm run lint:setups` must pass, verify build)
