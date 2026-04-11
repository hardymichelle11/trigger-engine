// =====================================================
// SECTION 4: STRIKE SELECTOR
// =====================================================

import { CONFIG, safeNumber, round2 } from "./config.js";

export function selectPutLadder(setup) {
  const price = safeNumber(setup.price);
  const strikes = (setup.strikeCandidates || [])
    .map(Number).filter(Number.isFinite).sort((a, b) => b - a);

  if (!strikes.length) {
    return { primary: null, secondary: null, note: "No strike candidates supplied" };
  }

  const targetSafe = price * (1 - CONFIG.execution.strikeSaferPct);
  const targetPremium = price * (1 - CONFIG.execution.strikePremiumPct);

  let primary = null;
  let secondary = null;

  for (const s of strikes) {
    if (!secondary && s <= targetPremium) secondary = s;
    if (!primary && s <= targetSafe) primary = s;
  }

  primary = primary ?? strikes[strikes.length - 1];
  secondary = secondary ?? primary;

  if (secondary < primary) {
    [primary, secondary] = [secondary, primary];
  }

  return {
    primary,
    secondary,
    pctBelowSpot: {
      primary: round2(((price - primary) / price) * 100),
      secondary: round2(((price - secondary) / price) * 100),
    },
    note: "primary=safer (further OTM), secondary=premium (closer)",
  };
}
