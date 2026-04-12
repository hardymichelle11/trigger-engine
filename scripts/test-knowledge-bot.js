#!/usr/bin/env node
// =====================================================
// Tests for knowledge bot: config, usage, mode resolver, FAQ.
// Run: npm run test:knowledgebot
// =====================================================

import { DEFAULT_CONFIG, BOT_MODES, MODE_CAPABILITIES, isValidMode, getCapabilities } from "../src/lib/knowledgeBot/knowledgeBotConfig.js";
import { loadUsageLog, recordUsage, getMonthlyUsage, getDailyUsage, isDailyLimitExceeded, isMonthlyLimitExceeded, clearUsageData } from "../src/lib/knowledgeBot/usageTracker.js";
import { resolveKnowledgeBotMode, isActionAllowed, getBotStatus } from "../src/lib/knowledgeBot/modeResolver.js";
import { FAQ_ENTRIES, GLOSSARY, searchFaq, searchGlossary, getFaqCategories, getFaqByCategory } from "../src/lib/knowledgeBot/faqContent.js";

let passed = 0;
let failed = 0;

function assert(name, condition) {
  if (condition) {
    console.log(`  \u2713 ${name}`);
    passed++;
  } else {
    console.log(`  \u2717 ${name}`);
    failed++;
  }
}

// Clean state
clearUsageData();

console.log("\n  Knowledge Bot Tests");
console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n");

// ── CONFIG ──────────────────────────────────────────

console.log("  -- Config --");
assert("DEFAULT_CONFIG has enabled", DEFAULT_CONFIG.enabled === true);
assert("DEFAULT_CONFIG mode = FULL_CHAT", DEFAULT_CONFIG.mode === "FULL_CHAT");
assert("DEFAULT_CONFIG monthlyBudgetUsd = 200", DEFAULT_CONFIG.monthlyBudgetUsd === 200);
assert("DEFAULT_CONFIG warningThresholdPct = 0.8", DEFAULT_CONFIG.warningThresholdPct === 0.8);
assert("DEFAULT_CONFIG hardLimitThresholdPct = 0.95", DEFAULT_CONFIG.hardLimitThresholdPct === 0.95);
assert("DEFAULT_CONFIG maxRequestsPerDay = 500", DEFAULT_CONFIG.maxRequestsPerDay === 500);
assert("DEFAULT_CONFIG maxRequestsPerMonth = 10000", DEFAULT_CONFIG.maxRequestsPerMonth === 10000);
assert("BOT_MODES has 4 entries", BOT_MODES.length === 4);
assert("BOT_MODES includes OFF", BOT_MODES.includes("OFF"));
assert("BOT_MODES includes FULL_CHAT", BOT_MODES.includes("FULL_CHAT"));
assert("isValidMode: FULL_CHAT = true", isValidMode("FULL_CHAT") === true);
assert("isValidMode: INVALID = false", isValidMode("INVALID") === false);
assert("MODE_CAPABILITIES OFF has faq=false", MODE_CAPABILITIES.OFF.faq === false);
assert("MODE_CAPABILITIES FAQ_ONLY has faq=true, chat=false", MODE_CAPABILITIES.FAQ_ONLY.faq === true && MODE_CAPABILITIES.FAQ_ONLY.chat === false);
assert("MODE_CAPABILITIES SEARCH_ONLY has search=true, chat=false", MODE_CAPABILITIES.SEARCH_ONLY.search === true && MODE_CAPABILITIES.SEARCH_ONLY.chat === false);
assert("MODE_CAPABILITIES FULL_CHAT has all true", MODE_CAPABILITIES.FULL_CHAT.faq && MODE_CAPABILITIES.FULL_CHAT.search && MODE_CAPABILITIES.FULL_CHAT.chat);
assert("getCapabilities FULL_CHAT has label", getCapabilities("FULL_CHAT").label === "Full Chat");
assert("getCapabilities invalid returns OFF", getCapabilities("NOPE").faq === false);

// ── USAGE TRACKER ───────────────────────────────────

console.log("\n  -- Usage Tracker --");
assert("Empty log: loadUsageLog = []", loadUsageLog().length === 0);

recordUsage({ mode: "FULL_CHAT", estimatedCostUsd: 0.05 });
recordUsage({ mode: "FULL_CHAT", estimatedCostUsd: 0.03 });
recordUsage({ mode: "SEARCH_ONLY", estimatedCostUsd: 0.01 });

assert("After 3 records: log length = 3", loadUsageLog().length === 3);

const daily = getDailyUsage();
assert("Daily: requestCount = 3", daily.requestCount === 3);
assert("Daily: totalCostUsd = 0.09", daily.totalCostUsd === 0.09);
assert("Daily: has date", typeof daily.date === "string");

const monthly = getMonthlyUsage(DEFAULT_CONFIG);
assert("Monthly: requestCount = 3", monthly.requestCount === 3);
assert("Monthly: totalCostUsd = 0.09", monthly.totalCostUsd === 0.09);
assert("Monthly: budgetUsd = 200", monthly.budgetUsd === 200);
assert("Monthly: remainingUsd > 0", monthly.remainingUsd > 0);
assert("Monthly: monthPct near 0", monthly.monthPct < 0.01);

assert("isDailyLimitExceeded: false (3 < 500)", isDailyLimitExceeded(DEFAULT_CONFIG) === false);
assert("isMonthlyLimitExceeded: false (3 < 10000)", isMonthlyLimitExceeded(DEFAULT_CONFIG) === false);

// Test daily limit
const tightConfig = { ...DEFAULT_CONFIG, maxRequestsPerDay: 3 };
assert("isDailyLimitExceeded: true when limit=3", isDailyLimitExceeded(tightConfig) === true);

// Test monthly limit
const tightMonthly = { ...DEFAULT_CONFIG, maxRequestsPerMonth: 2 };
assert("isMonthlyLimitExceeded: true when limit=2", isMonthlyLimitExceeded(tightMonthly) === true);

clearUsageData();
assert("After clear: log empty", loadUsageLog().length === 0);

// ── MODE RESOLVER ───────────────────────────────────

console.log("\n  -- Mode Resolver --");

// Normal operation
const normal = resolveKnowledgeBotMode(DEFAULT_CONFIG);
assert("Normal: mode = FULL_CHAT", normal.mode === "FULL_CHAT");
assert("Normal: reason includes Normal", normal.reason.includes("Normal"));
assert("Normal: downgraded = false", normal.downgraded === false);
assert("Normal: capabilities.chat = true", normal.capabilities.chat === true);

// Disabled
const disabled = resolveKnowledgeBotMode({ ...DEFAULT_CONFIG, enabled: false });
assert("Disabled: mode = OFF", disabled.mode === "OFF");
assert("Disabled: downgraded = false", disabled.downgraded === false);
assert("Disabled: capabilities.faq = false", disabled.capabilities.faq === false);

// Budget warning (simulate 80%+ spend)
// Record enough usage to cross warning threshold
for (let i = 0; i < 16; i++) {
  recordUsage({ mode: "FULL_CHAT", estimatedCostUsd: 10 }); // $10 each = $160 total = 80% of $200
}
const warningResolved = resolveKnowledgeBotMode(DEFAULT_CONFIG);
assert("Warning: mode = SEARCH_ONLY", warningResolved.mode === "SEARCH_ONLY");
assert("Warning: downgraded = true", warningResolved.downgraded === true);
assert("Warning: capabilities.search = true", warningResolved.capabilities.search === true);
assert("Warning: capabilities.chat = false", warningResolved.capabilities.chat === false);
assert("Warning: reason includes budget", warningResolved.reason.toLowerCase().includes("budget"));

// Hard limit (add more to cross 95%)
for (let i = 0; i < 4; i++) {
  recordUsage({ mode: "SEARCH_ONLY", estimatedCostUsd: 10 }); // +$40 = $200 total = 100%
}
const hardResolved = resolveKnowledgeBotMode(DEFAULT_CONFIG);
assert("Hard limit: mode = FAQ_ONLY", hardResolved.mode === "FAQ_ONLY");
assert("Hard limit: downgraded = true", hardResolved.downgraded === true);
assert("Hard limit: capabilities.faq = true", hardResolved.capabilities.faq === true);
assert("Hard limit: capabilities.search = false", hardResolved.capabilities.search === false);
assert("Hard limit: capabilities.chat = false", hardResolved.capabilities.chat === false);

// isActionAllowed
assert("isActionAllowed: faq in hard limit = true", isActionAllowed("faq", DEFAULT_CONFIG) === true);
assert("isActionAllowed: chat in hard limit = false", isActionAllowed("chat", DEFAULT_CONFIG) === false);

// getBotStatus
const botStatus = getBotStatus(DEFAULT_CONFIG);
assert("getBotStatus: has mode", typeof botStatus.mode === "string");
assert("getBotStatus: has usage", typeof botStatus.usage === "object");
assert("getBotStatus: has budgetBarPct", typeof botStatus.budgetBarPct === "number");
assert("getBotStatus: has budgetColor", typeof botStatus.budgetColor === "string");
assert("getBotStatus: budgetBarPct = 100 (at cap)", botStatus.budgetBarPct === 100);

clearUsageData();

// Daily limit downgrade
for (let i = 0; i < 500; i++) {
  recordUsage({ mode: "FULL_CHAT", estimatedCostUsd: 0 });
}
const dailyLimitResolved = resolveKnowledgeBotMode(DEFAULT_CONFIG);
assert("Daily limit: mode = SEARCH_ONLY", dailyLimitResolved.mode === "SEARCH_ONLY");
assert("Daily limit: reason includes daily", dailyLimitResolved.reason.toLowerCase().includes("daily"));

clearUsageData();

// ── FAQ CONTENT ─────────────────────────────────────

console.log("\n  -- FAQ Content --");
assert("FAQ_ENTRIES has entries", FAQ_ENTRIES.length > 10);
assert("GLOSSARY has entries", GLOSSARY.length > 8);
assert("FAQ entries have required fields", FAQ_ENTRIES.every(e => e.id && e.category && e.q && e.a && e.tags));
assert("GLOSSARY entries have term + definition", GLOSSARY.every(g => g.term && g.definition));

const categories = getFaqCategories();
assert("getFaqCategories returns array", Array.isArray(categories));
assert("Has Scoring category", categories.includes("Scoring"));
assert("Has Regime category", categories.includes("Regime"));
assert("Has Alerts category", categories.includes("Alerts"));

const scoringFaqs = getFaqByCategory("Scoring");
assert("Scoring FAQs exist", scoringFaqs.length > 0);
assert("Scoring FAQ has id", typeof scoringFaqs[0].id === "string");

// Search
const vixResults = searchFaq("vix");
assert("Search 'vix': returns results", vixResults.length > 0);
assert("Search 'vix': top result has relevance > 0", vixResults[0].relevance > 0);

const scoreResults = searchFaq("score baseline enhanced");
assert("Search 'score baseline': returns results", scoreResults.length > 0);

const noResults = searchFaq("xyznonexistent");
assert("Search garbage: returns empty", noResults.length === 0);

const emptySearch = searchFaq("");
assert("Search empty: returns empty", emptySearch.length === 0);

// Glossary search
const atrGlossary = searchGlossary("ATR");
assert("Glossary 'ATR': returns match", atrGlossary.length > 0 && atrGlossary[0].term === "ATR");

const allGlossary = searchGlossary("");
assert("Glossary empty query: returns all", allGlossary.length === GLOSSARY.length);

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
