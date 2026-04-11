#!/usr/bin/env node
// =====================================================
// Validates all setup definitions against schema rules.
// Run: npm run lint:setups
// =====================================================

import { SETUPS } from "../src/config/setups.js";
import { validateAll } from "../src/lib/setupValidator.js";

const report = validateAll(SETUPS);

console.log(`\n  Setup Validation Report`);
console.log(`  ──────────────────────`);
console.log(`  Total:  ${report.total}`);
console.log(`  Passed: ${report.passed}`);
console.log(`  Failed: ${report.failed}\n`);

for (const r of report.results) {
  if (r.errors.length === 0) {
    console.log(`  ✓ ${r.id}`);
  } else {
    console.log(`  ✗ ${r.id}`);
    for (const e of r.errors) {
      console.log(`    → ${e}`);
    }
  }
}

console.log("");
process.exit(report.valid ? 0 : 1);
