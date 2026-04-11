// =====================================================
// SHARED HELPERS — used by all setup evaluators
// =====================================================

export function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function pctChange(feed) {
  if (!feed?.prevClose) return 0;
  return (feed.last - feed.prevClose) / feed.prevClose;
}

export function avg(nums) {
  if (!nums || !nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function getDistancePct(price, target) {
  return (target - price) / price;
}

export function computeRealizedVolFromRange(high, low, last) {
  if (!high || !low || !last) return 0;
  return (high - low) / last;
}

export function scoreDistance(dist) {
  if (dist <= 0) return 0;
  if (dist < 0.02) return 0.6;
  if (dist <= 0.05) return 1.0;
  if (dist <= 0.06) return 0.5;
  return 0;
}

export function computeKellyLite(winProb) {
  const edge = winProb - (1 - winProb);
  return Math.min(1, Math.max(0, edge) * 0.5);
}

export function normalizeFeed(raw) {
  return {
    symbol: String(raw.symbol || "").toUpperCase(),
    name: raw.name || "",
    exchange: String(raw.exchange || "").toUpperCase(),
    last: Number(raw.last ?? raw.price ?? 0),
    prevClose: Number(raw.prevClose ?? raw.previousClose ?? 0),
    high: Number(raw.high ?? 0),
    low: Number(raw.low ?? 0),
    volume: Number(raw.volume ?? 0),
    timestamp: raw.timestamp ?? Date.now(),
  };
}

export function validateInstrument(feed, expected) {
  const symbolOk = feed.symbol === String(expected.symbol || "").toUpperCase();
  const exchangeOk = expected.exchange
    ? (feed.exchange === "" || feed.exchange === "STOCKS" || feed.exchange.includes(String(expected.exchange).toUpperCase()))
    : true;
  const descOk = (expected.description && feed.name)
    ? String(feed.name).toUpperCase().includes(String(expected.description).toUpperCase())
    : true;
  const priceOk = Number.isFinite(feed.last) && feed.last > 0;
  const prevOk = Number.isFinite(feed.prevClose) && feed.prevClose > 0;
  return { valid: symbolOk && priceOk && prevOk, symbolOk, exchangeOk, descOk, priceOk, prevOk };
}

export function validateCrossAsset(leader, follower) {
  const leaderRet = pctChange(leader);
  const followerRet = pctChange(follower);
  const sameDirection = (leaderRet >= 0 && followerRet >= 0) || (leaderRet <= 0 && followerRet <= 0);
  const leverageGap = Math.abs(followerRet - 2 * leaderRet);
  const leverageOk = leverageGap < 0.12;
  const now = Date.now();
  const leaderFresh = !leader.timestamp || leader.timestamp < 1e10 || Math.abs(now - leader.timestamp) < 24 * 60 * 60 * 1000;
  const followerFresh = !follower.timestamp || follower.timestamp < 1e10 || Math.abs(now - follower.timestamp) < 24 * 60 * 60 * 1000;
  return { valid: sameDirection && leverageOk && leaderFresh && followerFresh, sameDirection, leverageOk, leverageGap, leaderFresh, followerFresh, leaderRet, followerRet };
}

// Stack reversal helpers

/**
 * Detect if a symbol is turning up.
 * Uses real slope from bars_1m trend data when available,
 * falls back to intraday range proxy when history is missing.
 * @param {object} feed — quote feed with last, prevClose, high, low
 * @param {object} [trend] — optional trend data from analyzeTrend()
 */
export function isTurningUp(feed, trend) {
  if (!feed || !feed.last || !feed.prevClose) return false;
  const priceUp = feed.last > feed.prevClose;

  // Use real slope when available and confident
  if (trend && trend.available && trend.confidence !== "low") {
    return priceUp && trend.turningUp;
  }

  // Fallback: intraday range position proxy
  const slopeProxy = feed.high && feed.low ? (feed.last - feed.low) / (feed.high - feed.low || 1) : 0.5;
  return priceUp && slopeProxy > 0.4;
}

/**
 * Fraction of group that is turning up (0 to 1).
 * Accepts optional trendData map for real slope lookups.
 * @param {object[]} feeds
 * @param {Record<string, object>} [trendData] — { symbol: trend }
 */
export function groupStrength(feeds, trendData) {
  if (!feeds.length) return 0;
  const count = feeds.filter(f => {
    const trend = trendData?.[f.symbol];
    return isTurningUp(f, trend);
  }).length;
  return count / feeds.length;
}

export function getStage(distToT1) {
  if (distToT1 > 3 && distToT1 <= 8) return "EARLY";
  if (distToT1 > 1 && distToT1 <= 3) return "MID";
  if (distToT1 <= 1 && distToT1 > 0) return "LATE";
  return "NO SIGNAL";
}

// Simulation helpers
export function simulateLeaderPath(start, vol = 0.065) {
  let price = start;
  const path = [];
  for (let i = 0; i < 10; i++) {
    price *= (1 + 0.0005 + vol * randn());
    path.push(price);
  }
  return path;
}

export function simulateFollowerPath(leaderPath, startPrice) {
  let price = startPrice;
  const dailyFee = 0.000052;
  const path = [];
  for (let i = 0; i < leaderPath.length; i++) {
    const leaderRet = i === 0 ? 0 : (leaderPath[i] - leaderPath[i - 1]) / leaderPath[i - 1];
    const volDrag = leaderRet * leaderRet;
    const followerRet = 2.0 * leaderRet - dailyFee - volDrag + 0.003 * randn();
    price *= (1 + followerRet);
    path.push(price);
  }
  return path;
}

export function evaluateTouchBeforeStop(path, targets, stop) {
  const hits = targets.map(() => false);
  let stopHit = false;
  for (const p of path) {
    if (p <= stop) { stopHit = true; break; }
    targets.forEach((t, i) => { if (p >= t) hits[i] = true; });
  }
  return { hits, stopHit };
}

export function runPairMonteCarlo(leaderStart, followerStart, targets, stop, leaderVol, N = 2000) {
  const counts = targets.map(() => 0);
  let winCount = 0;
  for (let i = 0; i < N; i++) {
    const leaderPath = simulateLeaderPath(leaderStart, Math.max(leaderVol, 0.005));
    const followerPath = simulateFollowerPath(leaderPath, followerStart);
    const outcome = evaluateTouchBeforeStop(followerPath, targets, stop);
    outcome.hits.forEach((hit, idx) => { if (hit) counts[idx]++; });
    if (outcome.hits[0] && !outcome.stopHit) winCount++;
  }
  return { ladderProbs: counts.map(c => c / N), winProb: winCount / N };
}

export function runBEInfraMonteCarlo(bePrice, aiStrength, infraStrength, targetsPct, stopPct, N = 2000) {
  const counts = targetsPct.map(() => 0);
  let winCount = 0;

  for (let i = 0; i < N; i++) {
    let price = bePrice;
    let stopHit = false;
    const hits = targetsPct.map(() => false);

    for (let step = 0; step < 12; step++) {
      const clusterImpulse = 0.35 * aiStrength + 0.35 * infraStrength;
      const drift = clusterImpulse / 12;
      const noise = 0.015 * randn();
      price *= 1 + drift + noise;

      if (price <= bePrice * (1 - stopPct)) { stopHit = true; break; }
      targetsPct.forEach((pct, idx) => {
        if (price >= bePrice * (1 + pct)) hits[idx] = true;
      });
    }

    hits.forEach((hit, idx) => { if (hit) counts[idx]++; });
    if (hits[0] && !stopHit) winCount++;
  }

  return { ladderProbs: counts.map(c => c / N), winProb: winCount / N };
}
