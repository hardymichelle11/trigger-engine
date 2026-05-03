// =====================================================
// COCKPIT INSIGHT (Phase 4.7.5.x)
// =====================================================
// Pure helper that turns the candidate's view-model row +
// peer rows + per-symbol trade contexts into a single
// comparative one-line insight for the OpportunityCard.
//
// The point: surface the engine's actual reasoning in
// trader language. Instead of generic "best use of
// capital", the card shows WHY this candidate beats its
// peers on a specific dimension — premium-per-risk,
// capital fit, spread, ATR cushion, etc.
//
// Hard rules:
//   - PURE function. Same input → same output.
//   - NEVER throws on missing data. Returns "" when no
//     comparative insight can be derived.
//   - Reads only safe view-model + trade-context fields.
//     No engine internals (scoreBreakdown, weights,
//     probability internals, MC paths) are referenced.
// =====================================================

const FIT_ORDER = Object.freeze({
  excellent: 4,
  good: 3,
  acceptable: 2,
  poor: 1,
  not_affordable: 0,
});

const SPREAD_ORDER = Object.freeze({
  tight: 3,
  moderate: 2,
  wide: 1,
});

// --------------------------------------------------
// Numeric extractors (defensive)
// --------------------------------------------------

function asNum(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function premiumPerRisk(tc) {
  if (!tc) return null;
  const premium = asNum(tc.mid) ?? asNum(tc.estimatedPremium);
  const collat  = asNum(tc.estimatedCollateral);
  if (premium == null || collat == null || collat <= 0) return null;
  return premium / collat;
}

// --------------------------------------------------
// PUBLIC: buildComparativeInsight
// --------------------------------------------------

/**
 * @param {object} row                          view-model row for THIS candidate
 * @param {Array<object>} peerRows              all view-model rows in the current scan
 * @param {Record<string, object>} tcBySymbol   per-symbol trade contexts
 * @returns {string}                            the comparative insight, or "" if none
 */
export function buildComparativeInsight(row, peerRows, tcBySymbol) {
  if (!row || !row.symbol) return "";
  const peers = Array.isArray(peerRows)
    ? peerRows.filter(p => p && p.symbol && p.symbol !== row.symbol)
    : [];
  const tc = tcBySymbol?.[row.symbol] || {};

  // 1. Best in scan AND best use → strongest endorsement
  if (row.rank === 1 && row.isBestUseOfCapital) {
    return "Top-ranked · best capital fit";
  }

  // 2. Highest premium per unit risk vs peers (where data exists)
  const myPpr = premiumPerRisk(tc);
  if (myPpr != null && peers.length > 0) {
    const peerPprs = peers
      .map(p => premiumPerRisk(tcBySymbol?.[p.symbol] || {}))
      .filter(v => v != null);
    if (peerPprs.length > 0 && myPpr > Math.max(...peerPprs)) {
      return "Highest premium per unit risk";
    }
  }

  // 3. Better capital fit than a higher-ranked / higher-scored peer
  const myFit = FIT_ORDER[row.capitalFitCode] ?? -1;
  if (myFit >= 0) {
    // Sort peers by rank ascending so we report against the strongest
    // alternative first (the one most likely to be displacing this row).
    const higher = peers
      .filter(p => Number(p.rank) < Number(row.rank))
      .sort((a, b) => Number(a.rank) - Number(b.rank));
    for (const hr of higher) {
      const hrFit = FIT_ORDER[hr.capitalFitCode] ?? -1;
      if (myFit > hrFit) {
        return `Better capital fit than ${hr.symbol}`;
      }
    }
  }

  // 4. Live premium when peers are estimated
  if (row.premiumIsLive) {
    const liveCount = peers.filter(p => p.premiumIsLive).length;
    if (liveCount === 0 && peers.length >= 2) {
      return "Only live-chain premium in this scan";
    }
  }

  // 5. Tighter spread than a peer
  const mySpread = SPREAD_ORDER[tc.spreadWidthLabel] ?? 0;
  if (mySpread > 0) {
    for (const p of peers) {
      const pTc = tcBySymbol?.[p.symbol] || {};
      const pSpread = SPREAD_ORDER[pTc.spreadWidthLabel] ?? 0;
      if (pSpread > 0 && mySpread > pSpread) {
        return `Tighter spread than ${p.symbol}`;
      }
    }
  }

  // 6. Greater ATR cushion (distance from price to strike, in ATRs)
  const myAtr = asNum(tc.atrDistanceFromStrike);
  if (myAtr != null) {
    for (const p of peers) {
      const pTc = tcBySymbol?.[p.symbol] || {};
      const pAtr = asNum(pTc.atrDistanceFromStrike);
      if (pAtr != null && myAtr > pAtr * 1.25) {
        return `Greater ATR cushion than ${p.symbol}`;
      }
    }
  }

  // 7. Faster premium decay (lower DTE with comparable premium)
  const myDte     = asNum(tc.resolvedExpirationDte ?? tc.expirationDte);
  const myPremium = asNum(tc.mid) ?? asNum(tc.estimatedPremium);
  if (myDte != null && myPremium != null) {
    for (const p of peers) {
      const pTc = tcBySymbol?.[p.symbol] || {};
      const pDte = asNum(pTc.resolvedExpirationDte ?? pTc.expirationDte);
      const pPrem = asNum(pTc.mid) ?? asNum(pTc.estimatedPremium);
      if (pDte != null && pPrem != null && pDte > myDte * 1.25 && myPremium >= pPrem * 0.9) {
        return `Faster premium decay than ${p.symbol}`;
      }
    }
  }

  // 8. Displacement (existing engine output)
  if (row.displacedBy) {
    return `Displaced by ${row.displacedBy}`;
  }

  // 9. Best use fallback
  if (row.isBestUseOfCapital) {
    return "Best use of remaining capital";
  }

  // 10. Engine reason summary as final fallback
  return row.reasonSummary || "";
}
