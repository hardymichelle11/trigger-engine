#!/usr/bin/env node
// =====================================================
// Candidate Intelligence Summary — tests
// Run: npm run test:candidate-intelligence
// =====================================================
//
// Verifies the engine + news combiner:
//   - posture derives correctly from engine row state
//   - news alignment maps to supports/conflicts/neutral/mixed/unavailable
//   - empty / placeholder news → unavailable
//   - WAIT engine action is NOT upgraded by positive news
//   - AVOID engine action is NOT upgraded by positive news
//   - raw newsScoreAdjustment integers never appear in rendered text
// =====================================================

import {
  buildCandidateIntelligenceSummary,
  POSTURE_LABELS,
  NEWS_ALIGNMENT_LABELS,
} from "../src/lib/candidateIntelligence.js";
import { enrichArticle } from "../src/lib/newsIntelligence.js";

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, cond, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? "  →  " + detail : ""}`);
    failures.push(name);
    failed++;
  }
}

function group(label) {
  console.log(`\n  ${label}\n  ${"─".repeat(Math.max(20, label.length))}`);
}

// --------------------------------------------------
// Fixtures
// --------------------------------------------------

const aiInfraPositive = enrichArticle({
  // Title intentionally excludes "analyst" so the classifier cleanly
  // matches the more-specific product_ai_infrastructure bucket.
  title: "GTLB wins $3B AI cloud contract with NVIDIA",
  description: "Multi-year hyperscaler agreement expands AI infrastructure footprint",
  publisherName: "Reuters",
  publishedIso: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  tickers: ["GTLB"],
  sentiment: "positive",
  sentiment_reasoning: "The $3B NVIDIA-linked AI infrastructure contract is a direct revenue tailwind that materially expands the company's compute footprint and supports the AI thesis through 2027.",
  insights: [{ ticker: "GTLB", sentiment: "positive" }],
  isPlaceholder: false,
}, "GTLB");

const financingNegative = enrichArticle({
  title: "Company announces $500M secondary offering, dilution risk rises",
  description: "Will issue new shares",
  publisherName: "Bloomberg",
  publishedIso: new Date().toISOString(),
  tickers: ["XYZ"],
  sentiment: "neutral",
  isPlaceholder: false,
}, "XYZ");

const legalNegative = enrichArticle({
  title: "SEC investigation widens, lawsuit filed against company",
  description: "Probe expands",
  publisherName: "WSJ",
  publishedIso: new Date().toISOString(),
  tickers: ["XYZ"],
  sentiment: "negative",
  sentiment_reasoning: "SEC probe expands materially.",
  isPlaceholder: false,
}, "XYZ");

const placeholders = [
  { isPlaceholder: true, headline: "placeholder a" },
  { isPlaceholder: true, headline: "placeholder b" },
];

const incomeCandidateRow = {
  symbol: "GTLB",
  actionCode: "option_candidate",
  capitalFitCode: "excellent",
  regimeAlignment: "aligned",
  signalState: "verified",
};

const watchRow = {
  symbol: "GTLB",
  actionCode: "watch",
  capitalFitCode: "good",
  regimeAlignment: "aligned",
  signalState: "verified",
};

const skipRow = {
  symbol: "GTLB",
  actionCode: "skip_low_signal",
  capitalFitCode: "good",
  regimeAlignment: "aligned",
};

const notAffordableRow = {
  symbol: "GTLB",
  actionCode: "option_candidate",
  capitalFitCode: "not_affordable",
  regimeAlignment: "aligned",
};

// --------------------------------------------------
// 1. posture derivation
// --------------------------------------------------
group("[1] posture derivation");

const incomeSum = buildCandidateIntelligenceSummary(incomeCandidateRow, [aiInfraPositive]);
assert("option_candidate + good capital → posture=income_candidate",
  incomeSum.posture === "income_candidate");

const watchSum = buildCandidateIntelligenceSummary(watchRow, [aiInfraPositive]);
assert("watch action → posture=wait_for_entry",
  watchSum.posture === "wait_for_entry");

const skipSum = buildCandidateIntelligenceSummary(skipRow, [aiInfraPositive]);
assert("skip_* action → posture=avoid",
  skipSum.posture === "avoid");

const naSum = buildCandidateIntelligenceSummary(notAffordableRow, []);
assert("not_affordable capital → posture=risk_elevated",
  naSum.posture === "risk_elevated");

const regimeMismatchRow = { ...incomeCandidateRow, regimeAlignment: "mismatch" };
const regSum = buildCandidateIntelligenceSummary(regimeMismatchRow, []);
assert("regime mismatch → posture=risk_elevated",
  regSum.posture === "risk_elevated");

// --------------------------------------------------
// 2. newsAlignment mapping
// --------------------------------------------------
group("[2] newsAlignment mapping");

assert("AI infra positive news → newsAlignment=supports",
  incomeSum.newsAlignment === "supports");

const conflictSum = buildCandidateIntelligenceSummary(incomeCandidateRow, [financingNegative]);
assert("financing/dilution news → newsAlignment=conflicts",
  conflictSum.newsAlignment === "conflicts");

const legalSum = buildCandidateIntelligenceSummary(incomeCandidateRow, [legalNegative]);
assert("legal_regulatory negative news → newsAlignment=conflicts",
  legalSum.newsAlignment === "conflicts");

const emptySum = buildCandidateIntelligenceSummary(incomeCandidateRow, []);
assert("empty news → newsAlignment=unavailable",
  emptySum.newsAlignment === "unavailable");

const placeholderSum = buildCandidateIntelligenceSummary(incomeCandidateRow, placeholders);
assert("placeholder-only news → newsAlignment=unavailable",
  placeholderSum.newsAlignment === "unavailable");

// Mixed: one strong positive (+6) + one strong negative (-7) = net -1, both directions present.
const mixedSum = buildCandidateIntelligenceSummary(
  incomeCandidateRow,
  [aiInfraPositive, financingNegative],
);
assert(`mixed pos + neg with net |1| → newsAlignment=mixed (got "${mixedSum.newsAlignment}")`,
  mixedSum.newsAlignment === "mixed");

// --------------------------------------------------
// 3. catalystLabel + confidenceLabel
// --------------------------------------------------
group("[3] catalystLabel + confidenceLabel");

assert("dominant AI infra catalyst → catalystLabel='AI infra'",
  incomeSum.catalystLabel === "AI infra");

assert("dominant financing catalyst → catalystLabel='Financing'",
  conflictSum.catalystLabel === "Financing");

assert("Reuters + strong reasoning + direct → confidenceLabel='high'",
  incomeSum.confidenceLabel === "high");

assert("empty news → confidenceLabel='unavailable'",
  emptySum.confidenceLabel === "unavailable");

// --------------------------------------------------
// 4. WAIT is not upgraded by positive news
// --------------------------------------------------
group("[4] WAIT engine action stays a wait under positive news");

assert("watch + supports keeps posture=wait_for_entry",
  watchSum.posture === "wait_for_entry");
assert("watch + supports summaryText contains 'wait'",
  watchSum.summaryText.toLowerCase().includes("wait"));
assert("watch + supports summaryText acknowledges support",
  watchSum.summaryText.toLowerCase().includes("supportive"));
assert("watch + supports actionReminder still says wait",
  watchSum.actionReminder.toLowerCase().includes("wait"));

// --------------------------------------------------
// 5. AVOID is not upgraded by positive news
// --------------------------------------------------
group("[5] AVOID engine action stays avoid under positive news");

const skipPositiveSum = buildCandidateIntelligenceSummary(skipRow, [aiInfraPositive]);
assert("skip + supports keeps posture=avoid",
  skipPositiveSum.posture === "avoid");
assert("skip + supports actionReminder still says skip",
  skipPositiveSum.actionReminder.toLowerCase().includes("skip"));
assert("skip + supports summaryText says 'does not raise this above'",
  skipPositiveSum.summaryText.toLowerCase().includes("does not raise"));

// --------------------------------------------------
// 6. summaryText shape
// --------------------------------------------------
group("[6] summaryText shape");

assert("supports summaryText contains 'engine score'",
  incomeSum.summaryText.toLowerCase().includes("engine score"));
assert("supports summaryText doesn't claim news changes engine",
  !/news change/i.test(incomeSum.summaryText));
assert("conflicts summaryText says 'risk' or 'hedge' or 'skip'",
  /risk|hedge|skip/i.test(conflictSum.summaryText));
assert("unavailable summaryText says 'feed unavailable'",
  emptySum.summaryText.toLowerCase().includes("feed unavailable"));
assert("unavailable summaryText says 'do not use'",
  emptySum.summaryText.toLowerCase().includes("do not use"));

// --------------------------------------------------
// 7. raw scoreAdjustment integers never leak into rendered text
// --------------------------------------------------
group("[7] raw scoreAdjustment integers never leak");

const allRendered = [
  incomeSum, watchSum, skipSum, naSum, conflictSum, legalSum,
  emptySum, placeholderSum, mixedSum, skipPositiveSum,
].flatMap((s) => [s.summaryText, s.actionReminder]);

// No raw "+6", "-7", "+8" etc., and no fields named "scoreAdjustment".
for (const text of allRendered) {
  assert(`text does not contain "scoreAdjustment": ${text.slice(0, 60)}…`,
    !/scoreAdjustment/i.test(text));
  assert(`text does not contain raw signed integers like +6 / -7 / +8: ${text.slice(0, 60)}…`,
    !/[+\-]\d+\b/.test(text));
}

// And the badge labels are all categorical (no integers).
for (const lbl of [...Object.values(POSTURE_LABELS), ...Object.values(NEWS_ALIGNMENT_LABELS)]) {
  assert(`badge label "${lbl}" is categorical (no digits)`,
    !/\d/.test(lbl));
}

// --------------------------------------------------
// 8. defensive: null candidate, null news
// --------------------------------------------------
group("[8] defensive defaults");

const nullCand = buildCandidateIntelligenceSummary(null, null);
assert("null candidate yields a posture (default wait_for_entry)",
  nullCand.posture === "wait_for_entry");
assert("null news yields newsAlignment=unavailable",
  nullCand.newsAlignment === "unavailable");
assert("null inputs still produce non-empty summaryText",
  typeof nullCand.summaryText === "string" && nullCand.summaryText.length > 20);

// --------------------------------------------------
// Summary
// --------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  Failures:\n  ${failures.map((f) => "  • " + f).join("\n")}`);
  process.exit(1);
}
