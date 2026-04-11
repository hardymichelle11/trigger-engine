// =====================================================
// SECTION 6: DEFENSE / ROLL LOGIC
// =====================================================

import { CONFIG, safeNumber, round2 } from "./config.js";
import { buildProfitPlan } from "./profitManagement.js";

export function buildRollPlan({ creditReceived, strike, currentPrice }) {
  const credit = safeNumber(creditReceived);
  const s = safeNumber(strike);
  const px = safeNumber(currentPrice);

  const warningLevel = round2(s * (1 + CONFIG.roll.warningBufferPct));
  const rollActionLevel = round2(s * (1 + CONFIG.roll.actionBelowStrikePct));
  const rollDownMin = round2(s * (1 - CONFIG.roll.rollDownPctMin));
  const rollDownMax = round2(s * (1 - CONFIG.roll.rollDownPctMax));

  let zone = "SAFE";
  if (px <= rollActionLevel) zone = "ACTION";
  else if (px <= warningLevel && px > rollActionLevel) zone = "WATCH";
  else if (px <= s * 1.05) zone = "DEFENSE";

  return {
    zone,
    levels: {
      warning: warningLevel,
      action: rollActionLevel,
      suggestedNewStrikeRange: [rollDownMax, rollDownMin],
      extendWeeks: CONFIG.roll.extendWeeks,
    },
    profitPlan: buildProfitPlan({ creditReceived: credit }),
    instructions: zone === "ACTION"
      ? `ROLL: Buy to close, sell new put at $${rollDownMax}-$${rollDownMin}, extend 1-2 weeks, collect additional premium`
      : zone === "WATCH"
      ? "MONITOR: Price approaching strike, prepare roll strategy"
      : zone === "DEFENSE"
      ? "PREPARE: Price near strike zone, have roll order ready"
      : "HOLD: Price safely above strike",
  };
}
