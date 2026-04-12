// =====================================================
// MODE RESOLVER — budget guardrail + automatic downgrade
// =====================================================
// Determines the effective bot mode based on config,
// usage, and rate limits. Vendor-agnostic.
//
// Downgrade cascade:
//   FULL_CHAT → SEARCH_ONLY → FAQ_ONLY → (never OFF)
//
// OFF is only set by explicit admin toggle.
// =====================================================

import { getMonthlyUsage, isDailyLimitExceeded, isMonthlyLimitExceeded } from "./usageTracker.js";
import { getCapabilities } from "./knowledgeBotConfig.js";

/**
 * Resolve the effective bot mode after applying all guardrails.
 *
 * @param {object} config — knowledgeBotConfig
 * @returns {object} — { mode, reason, capabilities, usage, downgraded }
 */
export function resolveKnowledgeBotMode(config) {
  // Kill switch: explicit disable
  if (!config.enabled) {
    return _result("OFF", "Bot disabled by admin", config, false);
  }

  const usage = getMonthlyUsage(config);

  // Hard budget cap → FAQ only (zero cost)
  if (usage.monthPct >= config.hardLimitThresholdPct) {
    return _result("FAQ_ONLY", `Monthly budget ${(usage.monthPct * 100).toFixed(0)}% used (hard limit ${(config.hardLimitThresholdPct * 100).toFixed(0)}%)`, config, true);
  }

  // Warning threshold → search only (minimal cost)
  if (usage.monthPct >= config.warningThresholdPct) {
    return _result("SEARCH_ONLY", `Monthly budget ${(usage.monthPct * 100).toFixed(0)}% used (warning at ${(config.warningThresholdPct * 100).toFixed(0)}%)`, config, true);
  }

  // Daily request limit
  if (isDailyLimitExceeded(config)) {
    return _result("SEARCH_ONLY", `Daily request limit (${config.maxRequestsPerDay}) reached`, config, true);
  }

  // Monthly request limit
  if (isMonthlyLimitExceeded(config)) {
    return _result("FAQ_ONLY", `Monthly request limit (${config.maxRequestsPerMonth}) reached`, config, true);
  }

  // No guardrail hit → use configured mode
  return _result(config.mode, "Normal operation", config, false);
}

/**
 * Check if a specific action is allowed in the current resolved mode.
 * @param {string} action — "faq" | "search" | "chat"
 * @param {object} config
 * @returns {boolean}
 */
export function isActionAllowed(action, config) {
  const resolved = resolveKnowledgeBotMode(config);
  return resolved.capabilities[action] === true;
}

/**
 * Get a human-readable status summary for the UI.
 * @param {object} config
 * @returns {object}
 */
export function getBotStatus(config) {
  const resolved = resolveKnowledgeBotMode(config);
  const usage = getMonthlyUsage(config);

  return {
    ...resolved,
    usage,
    budgetBarPct: Math.min(usage.monthPct * 100, 100),
    budgetColor: usage.monthPct >= config.hardLimitThresholdPct ? "#ef4444"
      : usage.monthPct >= config.warningThresholdPct ? "#f59e0b"
      : "#22c55e",
  };
}

function _result(mode, reason, config, downgraded) {
  return {
    mode,
    reason,
    capabilities: getCapabilities(mode),
    downgraded,
  };
}
