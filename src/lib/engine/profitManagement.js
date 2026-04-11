// =====================================================
// SECTION 5: PROFIT MANAGEMENT (BTC targets)
// =====================================================

import { CONFIG, safeNumber, round2 } from "./config.js";

export function buildProfitPlan({ creditReceived }) {
  const credit = safeNumber(creditReceived);

  return {
    considerClose: {
      pct: CONFIG.profit.considerClose * 100,
      btcPrice: round2(credit * (1 - CONFIG.profit.considerClose)),
    },
    closePosition: {
      pct: CONFIG.profit.closePosition * 100,
      btcPrice: round2(credit * (1 - CONFIG.profit.closePosition)),
    },
    alwaysClose: {
      pct: CONFIG.profit.alwaysClose * 100,
      btcPrice: round2(credit * (1 - CONFIG.profit.alwaysClose)),
    },
    rule: "Never let a winner turn into a loser",
  };
}
