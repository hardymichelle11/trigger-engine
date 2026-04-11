// =====================================================
// POSITION SYNC — cross-device sync via Cloudflare KV
// =====================================================
// Pushes positions to the proxy on save.
// Pulls from the proxy on load (merges with local).
// Uses a simple user ID from localStorage.
// =====================================================

const PROXY_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_POLYGON_PROXY_URL)
  || "https://polygon-proxy.hardymichelle11.workers.dev";

const USER_ID_KEY = "triggerEngine_userId";

/**
 * Get or create a persistent user ID for sync.
 */
export function getUserId() {
  try {
    let id = localStorage.getItem(USER_ID_KEY);
    if (!id) {
      id = "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      localStorage.setItem(USER_ID_KEY, id);
    }
    return id;
  } catch {
    return "default";
  }
}

/**
 * Push positions to cloud sync.
 * @param {object[]} positions
 * @returns {Promise<boolean>}
 */
export async function pushPositions(positions) {
  try {
    const userId = getUserId();
    const res = await fetch(`${PROXY_URL}/positions/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positions }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Pull positions from cloud sync.
 * @returns {Promise<{ positions: object[], updatedAt: string|null } | null>}
 */
export async function pullPositions() {
  try {
    const userId = getUserId();
    const res = await fetch(`${PROXY_URL}/positions/${userId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Sync: pull remote, merge with local, push merged result.
 * Remote wins for positions with same ID (more recent updatedAt).
 * @param {object[]} localPositions
 * @returns {Promise<object[]>} merged positions
 */
export async function syncPositions(localPositions) {
  const remote = await pullPositions();
  if (!remote || !remote.positions) {
    // No remote data — push local up
    await pushPositions(localPositions);
    return localPositions;
  }

  // Merge: build map by ID, remote wins on conflict
  const merged = new Map();
  for (const p of localPositions) merged.set(p.id, p);
  for (const p of remote.positions) merged.set(p.id, p);

  const result = Array.from(merged.values());
  await pushPositions(result);
  return result;
}
