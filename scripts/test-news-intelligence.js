#!/usr/bin/env node
// =====================================================
// News Intelligence Layer — Phase 4.7.7 tests
// Run: npm run test:news-intelligence
// =====================================================
//
// Verifies the decision-grade news layer:
//   - catalystType classifier maps the 12 buckets
//   - newsConfidence vector produces the 5 expected dimensions
//   - newsScoreAdjustment is bounded -8..+8
//   - aggregateNewsAdjustment ignores placeholders + clamps
//   - buildNewsThesis returns sensible tone for each scenario
//   - the spec scoring rules from the prompt fire as expected
// =====================================================

import {
  classifyCatalystType,
  buildNewsConfidence,
  scoreNewsImpact,
  enrichArticle,
  aggregateNewsAdjustment,
  buildNewsThesis,
  catalystLabel,
  summarizeConfidence,
  _internals,
} from "../src/lib/newsIntelligence.js";

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
// 1. catalystType classifier
// --------------------------------------------------
group("[1] catalystType classifier");

const cases = [
  ["IREN wins $3.4B AI cloud contract with NVIDIA", "product_ai_infrastructure"],
  ["GitLab signs multi-year contract worth $1 billion", "contract_win"],
  ["Company announces $500M secondary offering", "financing_balance_sheet"],
  ["GTLB beats Q3 earnings estimates", "earnings"],
  ["Microsoft raises guidance after strong cloud quarter", "guidance"],
  ["Morgan Stanley upgrades GTLB, raises price target", "analyst_action"],
  ["Tech sector rotation lifts software stocks", "sector_rotation"],
  ["Fed signals rate cut in December", "macro"],
  ["SEC investigation widens, lawsuit filed", "legal_regulatory"],
  ["Hedge fund discloses 5% stake", "insider_institutional"],
  ["Trading halted after fraud allegations surface", "risk_warning"],
  ["GitLab announces new developer dashboard", "unknown"],
];

for (const [title, expected] of cases) {
  const got = classifyCatalystType({ title });
  assert(
    `"${title.slice(0, 60)}…" → ${expected}`,
    got === expected,
    `got "${got}"`,
  );
}

// --------------------------------------------------
// 2. newsConfidence vector
// --------------------------------------------------
group("[2] newsConfidence vector");

const directHigh = {
  title: "GTLB wins $3B AI cloud contract with NVIDIA, analysts see strong tailwind into 2027",
  description: "GTLB shares jumped after announcing a multi-year cloud agreement that meaningfully expands the AI infrastructure footprint and is expected to drive durable margin expansion through 2027.",
  publisherName: "Reuters",
  publishedIso: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
  tickers: ["GTLB"],
  sentiment: "positive",
  sentiment_reasoning: "Multi-year $3B AI cloud contract with NVIDIA is a direct revenue tailwind and validates the AI integration thesis through 2027.",
  insights: [{ ticker: "GTLB", sentiment: "positive" }],
};

const conf1 = buildNewsConfidence(directHigh, "GTLB");
assert("freshness=high for <2h-old article", conf1.freshness === "high");
assert("sourceQuality=high for Reuters", conf1.sourceQuality === "high");
assert("tickerSpecificity=direct when ticker in title + tickers[]",
  conf1.tickerSpecificity === "direct");
assert("sentimentStrength=strong with rich reasoning", conf1.sentimentStrength === "strong");
assert("contradictionRisk=low for clean positive", conf1.contradictionRisk === "low");

const stalePoorSource = {
  title: "Some random update on a stock",
  description: "",
  publisherName: "BlogCorp Daily",
  publishedIso: new Date(Date.now() - 48 * 3600 * 1000).toISOString(), // 2 days ago
  tickers: [],
  sentiment: "neutral",
};
const conf2 = buildNewsConfidence(stalePoorSource, "GTLB");
assert("freshness=low for 2d-old", conf2.freshness === "low");
assert("sourceQuality=low for unknown publisher", conf2.sourceQuality === "low");
assert("tickerSpecificity=weak when ticker absent", conf2.tickerSpecificity === "weak");
assert("sentimentStrength=weak for neutral", conf2.sentimentStrength === "weak");

const dilution = {
  title: "Company announces $500M secondary offering",
  description: "Plans to use proceeds for general corporate purposes",
  publisherName: "Bloomberg",
  publishedIso: new Date().toISOString(),
  tickers: ["XYZ"],
  sentiment: "neutral",
};
const conf3 = buildNewsConfidence(
  { ...dilution, catalystType: "financing_balance_sheet" },
  "XYZ",
);
assert("contradictionRisk=high for financing_balance_sheet",
  conf3.contradictionRisk === "high");

// --------------------------------------------------
// 3. scoreNewsImpact — bounded scoring rules
// --------------------------------------------------
group("[3] scoreNewsImpact rules");

// Strong direct positive catalyst → +6
const strongPos = enrichArticle(directHigh, "GTLB");
assert(`strong direct positive catalyst → +6 (got ${strongPos.newsScoreAdjustment})`,
  strongPos.newsScoreAdjustment === 6);

// Moderate positive catalyst (no rich reasoning, no Reuters)
const moderatePos = enrichArticle({
  title: "GTLB awarded contract worth $1 billion",
  description: "Modest details",
  publisherName: "Seeking Alpha",
  publishedIso: new Date().toISOString(),
  tickers: ["GTLB"],
  sentiment: "positive",
  sentiment_reasoning: "Decent contract win.",
}, "GTLB");
assert(`moderate positive catalyst → +3 (got ${moderatePos.newsScoreAdjustment})`,
  moderatePos.newsScoreAdjustment === 3);

// Neutral / unknown → 0
const neutral = enrichArticle({
  title: "GitLab releases minor UI refresh",
  description: "Small update",
  publisherName: "Unknown Blog",
  publishedIso: new Date().toISOString(),
  tickers: ["GTLB"],
  sentiment: "neutral",
}, "GTLB");
assert(`neutral / background → 0 (got ${neutral.newsScoreAdjustment})`,
  neutral.newsScoreAdjustment === 0);

// Direct negative operational risk (positive bucket + negative sentiment) → -4
const opsRisk = enrichArticle({
  title: "GTLB earnings miss expectations significantly",
  description: "Q3 revenue came in below consensus",
  publisherName: "Reuters",
  publishedIso: new Date().toISOString(),
  tickers: ["GTLB"],
  sentiment: "negative",
  sentiment_reasoning: "EPS missed by 20%, guidance unchanged for now.",
}, "GTLB");
assert(`earnings miss + negative → -4 (got ${opsRisk.newsScoreAdjustment})`,
  opsRisk.newsScoreAdjustment === -4);

// Financing / dilution → -7
const fin = enrichArticle({
  title: "Company announces $500M secondary offering, dilution risk rises",
  description: "Will issue new shares to fund expansion",
  publisherName: "Bloomberg",
  publishedIso: new Date().toISOString(),
  tickers: ["XYZ"],
  sentiment: "neutral",
}, "XYZ");
assert(`financing/dilution → -7 (got ${fin.newsScoreAdjustment})`,
  fin.newsScoreAdjustment === -7);

// Risk warning (fraud / halt / restated) → -7
const risk = enrichArticle({
  title: "Trading halted after fraud allegations surface at company",
  description: "Audit committee opens internal review",
  publisherName: "WSJ",
  publishedIso: new Date().toISOString(),
  tickers: ["XYZ"],
  sentiment: "negative",
}, "XYZ");
assert(`risk_warning → -7 (got ${risk.newsScoreAdjustment})`,
  risk.newsScoreAdjustment === -7);

// Guidance cut → -7
const guidanceCut = enrichArticle({
  title: "Company cuts guidance for fiscal year",
  description: "Citing weaker enterprise demand",
  publisherName: "CNBC",
  publishedIso: new Date().toISOString(),
  tickers: ["XYZ"],
  sentiment: "negative",
  sentiment_reasoning: "Lowered FY revenue and EPS guidance materially.",
}, "XYZ");
assert(`guidance cut → -7 (got ${guidanceCut.newsScoreAdjustment})`,
  guidanceCut.newsScoreAdjustment === -7);

// Sector rotation / macro → 0
const sector = enrichArticle({
  title: "Stocks rise with broader market rally",
  description: "Broad-based gains across tech",
  publisherName: "MarketWatch",
  publishedIso: new Date().toISOString(),
  tickers: ["GTLB"],
  sentiment: "positive",
}, "GTLB");
assert(`sector rotation → 0 (got ${sector.newsScoreAdjustment})`,
  sector.newsScoreAdjustment === 0);

// Per-article cap at ±8
assert("scoreNewsImpact never exceeds +8",
  [strongPos, moderatePos, sector].every((a) => a.newsScoreAdjustment <= 8));
assert("scoreNewsImpact never below -8",
  [fin, risk, guidanceCut, opsRisk].every((a) => a.newsScoreAdjustment >= -8));

// --------------------------------------------------
// 4. aggregateNewsAdjustment — bounded + placeholder-safe
// --------------------------------------------------
group("[4] aggregateNewsAdjustment");

// Three +6 articles would sum to +18 — must clamp to +8.
const threeStrongPos = [strongPos, strongPos, strongPos];
assert(`3 × +6 clamps to +8 (got ${aggregateNewsAdjustment(threeStrongPos)})`,
  aggregateNewsAdjustment(threeStrongPos) === 8);

// Three -7 articles would sum to -21 — must clamp to -8.
const threeFin = [fin, fin, fin];
assert(`3 × -7 clamps to -8 (got ${aggregateNewsAdjustment(threeFin)})`,
  aggregateNewsAdjustment(threeFin) === -8);

// Mixed +6 + -7 = -1 (no clamp).
assert("mixed +6 + -7 = -1",
  aggregateNewsAdjustment([strongPos, fin]) === -1);

// Placeholders are excluded.
const placeholders = [
  { isPlaceholder: true, headline: "placeholder" },
  { isPlaceholder: true, headline: "placeholder" },
];
assert("placeholders excluded → 0",
  aggregateNewsAdjustment(placeholders) === 0);

// Empty array → 0.
assert("empty array → 0", aggregateNewsAdjustment([]) === 0);

// Mixed real + placeholders → only real contribute.
assert("real + placeholders → real-only sum",
  aggregateNewsAdjustment([strongPos, ...placeholders]) === 6);

// --------------------------------------------------
// 5. buildNewsThesis — narrative summary
// --------------------------------------------------
group("[5] buildNewsThesis");

const thesisPos = buildNewsThesis("GTLB", [strongPos]);
assert(`positive thesis tone is good (got "${thesisPos.tone}")`,
  thesisPos.tone === "good");
assert("positive thesis text mentions GTLB",
  thesisPos.text.includes("GTLB"));
assert("positive thesis is reliable", thesisPos.reliable === true);

const thesisNeg = buildNewsThesis("XYZ", [fin]);
assert(`negative (financing) thesis tone is bad (got "${thesisNeg.tone}")`,
  thesisNeg.tone === "bad");
assert("negative thesis closer is hedge/skip",
  thesisNeg.text.toLowerCase().includes("hedge") ||
    thesisNeg.text.toLowerCase().includes("skip"));

const thesisMixed = buildNewsThesis("GTLB", [strongPos, fin]);
assert(`mixed tone (got "${thesisMixed.tone}")`,
  thesisMixed.tone === "mild_bad" || thesisMixed.tone === "mixed");

const thesisEmpty = buildNewsThesis("GTLB", []);
assert("empty news thesis is unreliable",
  thesisEmpty.reliable === false);
assert("empty thesis text mentions 'no fresh news'",
  thesisEmpty.text.toLowerCase().includes("no fresh news"));

const thesisPlaceholder = buildNewsThesis("GTLB", placeholders);
assert("placeholder-only thesis is unreliable",
  thesisPlaceholder.reliable === false);
assert("placeholder thesis names 'placeholder only'",
  thesisPlaceholder.text.toLowerCase().includes("placeholder only"));
assert("placeholder thesis warns against scoring",
  thesisPlaceholder.text.toLowerCase().includes("do not use"));

// --------------------------------------------------
// 6. enrichArticle is idempotent
// --------------------------------------------------
group("[6] enrichArticle idempotency");

const once = enrichArticle(directHigh, "GTLB");
const twice = enrichArticle(once, "GTLB");
assert("re-enriching produces same catalystType",
  once.catalystType === twice.catalystType);
assert("re-enriching produces same newsScoreAdjustment",
  once.newsScoreAdjustment === twice.newsScoreAdjustment);
assert("re-enriching produces same confidenceLabel",
  once.confidenceLabel === twice.confidenceLabel);

// --------------------------------------------------
// 7. UI helpers
// --------------------------------------------------
group("[7] UI helpers");

assert("catalystLabel('contract_win') = 'Contract win'",
  catalystLabel("contract_win") === "Contract win");
assert("catalystLabel('unknown') = null (so panel can omit badge)",
  catalystLabel("unknown") === null);

const highVec = {
  freshness: "high", sourceQuality: "high",
  tickerSpecificity: "direct", sentimentStrength: "strong",
  contradictionRisk: "low",
};
assert("summarizeConfidence(highVec) = 'high'",
  summarizeConfidence(highVec) === "high");

const lowVec = {
  freshness: "low", sourceQuality: "low",
  tickerSpecificity: "weak", sentimentStrength: "weak",
  contradictionRisk: "low",
};
assert("summarizeConfidence(lowVec) = 'low'",
  summarizeConfidence(lowVec) === "low");

// --------------------------------------------------
// Summary
// --------------------------------------------------
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\n  Failures:\n  ${failures.map((f) => "  • " + f).join("\n")}`);
  process.exit(1);
}
