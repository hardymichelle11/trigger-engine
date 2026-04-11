// =====================================================
// SETUP REGISTRY — load, filter, resolve, extract
// =====================================================
// Central access layer for setup definitions. All
// consumers (App.jsx, evaluators, UI) go through here
// instead of importing SETUPS directly.
//
// SEED vs RUNTIME: config/setups.js is seed data (never
// mutated). Runtime additions are session state managed
// by React and optionally persisted to localStorage.
// =====================================================

import { SETUPS, MARKET_REGIME } from "../config/setups.js";
import { validateSetup } from "./setupValidator.js";
import { getTickerById } from "../tickerCatalog.js";

const STORAGE_KEY = "triggerEngine_runtimeSetups";

// -------------------------------------------------
// CORE REGISTRY
// -------------------------------------------------

let _setups = [...SETUPS];

/** Get all registered setups (seed + runtime) */
export function getAllSetups() {
  return [..._setups];
}

/** Get only enabled setups */
export function getEnabledSetups() {
  return _setups.filter((s) => s.enabled);
}

/** Get a setup by id */
export function getSetupById(id) {
  return _setups.find((s) => s.id === id) || null;
}

/** Get setups by type */
export function getSetupsByType(type) {
  return _setups.filter((s) => s.type === type && s.enabled);
}

// -------------------------------------------------
// AS KEYED OBJECT (for engine evaluators)
// -------------------------------------------------

/** Convert enabled setups to { id: engineFormat } object.
 *  Accepts optional array override (for React-owned state). */
export function getSetupsAsObject(setupList) {
  const list = setupList || getEnabledSetups();
  const enabled = setupList ? list.filter(s => s.enabled) : list;
  const obj = {};
  for (const setup of enabled) {
    obj[setup.id] = toEngineFormat(setup);
  }
  return obj;
}

// -------------------------------------------------
// FORMAT CONVERSION
// -------------------------------------------------
// Registry uses a normalized format. The engine evaluators
// in App.jsx expect the legacy shape. This converts.

function toEngineFormat(setup) {
  const base = { kind: setup.type, capital: setup.capital };

  if (setup.type === "pair") {
    return {
      ...base,
      leader: setup.leader,
      follower: setup.follower,
      targets: setup.targets,
      stop: setup.stop,
      leaderThreshold: setup.leaderThreshold,
      tvLeader: setup.tv?.leader,
      tvFollower: setup.tv?.follower,
    };
  }

  if (setup.type === "basket") {
    return {
      ...base,
      leader: setup.leader,
      drivers: setup.drivers,
      tvLeader: setup.tv?.leader,
    };
  }

  if (setup.type === "standalone") {
    return {
      ...base,
      leader: setup.leader,
      tvLeader: setup.tv?.leader,
    };
  }

  if (setup.type === "stack_reversal") {
    const t = setup.thresholds || {};
    return {
      ...base,
      leader: setup.leader,
      sector: setup.powerGroup,
      followers: setup.followerGroup,
      shortMAPeriod: t.shortMAPeriod ?? 5,
      breakoutThresholdPct: t.breakoutThresholdPct ?? 0.03,
      earlyWindowMin: t.earlyWindowMin ?? 30,
      midWindowMin: t.midWindowMin ?? 90,
      tvLeader: setup.tv?.leader,
    };
  }

  if (setup.type === "infra_follower") {
    const t = setup.thresholds || {};
    return {
      ...base,
      follower: setup.follower,
      aiLeaders: setup.aiLeaders,
      infraDrivers: setup.infraDrivers,
      strategicPartners: setup.strategicPartners,
      lagThreshold: t.lagThreshold ?? 0.0075,
      targetsPct: t.targetsPct ?? [0.04, 0.07, 0.10],
      stopPct: t.stopPct ?? 0.04,
      tvFollower: setup.tv?.follower,
    };
  }

  return base;
}

// -------------------------------------------------
// SYMBOL EXTRACTION
// -------------------------------------------------

/** Extract all unique symbols from enabled setups + regime indicators */
export function getAllSymbols() {
  const symbols = new Set([MARKET_REGIME.vix.symbol, MARKET_REGIME.iwm.symbol]);

  for (const setup of getEnabledSetups()) {
    if (setup.leader?.symbol) symbols.add(setup.leader.symbol);
    if (setup.follower?.symbol) symbols.add(setup.follower.symbol);
    if (setup.drivers) setup.drivers.forEach((d) => symbols.add(d));
    if (setup.aiLeaders) setup.aiLeaders.forEach((d) => symbols.add(d));
    if (setup.infraDrivers) setup.infraDrivers.forEach((d) => symbols.add(d));
    if (setup.strategicPartners) setup.strategicPartners.forEach((d) => symbols.add(d));
    if (setup.powerGroup) setup.powerGroup.forEach((d) => symbols.add(d));
    if (setup.followerGroup) setup.followerGroup.forEach((d) => symbols.add(d));
  }

  return Array.from(symbols);
}

// -------------------------------------------------
// RUNTIME MUTATIONS (for Setup Builder integration)
// -------------------------------------------------

/** Add a new setup at runtime. Returns validation errors or null. */
export function addSetup(setup) {
  const errors = validateSetup(setup);
  if (errors.length > 0) return errors;

  if (_setups.some((s) => s.id === setup.id)) {
    return [`Setup with id "${setup.id}" already exists`];
  }

  _setups.push({ ...setup });
  return null;
}

/** Update an existing setup by id. Returns validation errors or null. */
export function updateSetup(id, patch) {
  const idx = _setups.findIndex((s) => s.id === id);
  if (idx === -1) return [`Setup "${id}" not found`];

  const updated = { ..._setups[idx], ...patch, id };
  const errors = validateSetup(updated);
  if (errors.length > 0) return errors;

  _setups[idx] = updated;
  return null;
}

/** Remove a setup by id */
export function removeSetup(id) {
  const idx = _setups.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  _setups.splice(idx, 1);
  return true;
}

/** Toggle a setup's enabled state */
export function toggleSetup(id) {
  const setup = _setups.find((s) => s.id === id);
  if (!setup) return false;
  setup.enabled = !setup.enabled;
  return true;
}

/** Reset to initial config (useful for testing) */
export function resetSetups() {
  _setups = [...SETUPS];
}

// -------------------------------------------------
// BUILDER FORMAT → REGISTRY FORMAT CONVERTER
// -------------------------------------------------
// The TickerSetupBuilder produces objects with leaderId (string),
// kind, etc. The registry expects type, leader: { symbol, exchange }.

function resolveTickerRef(id) {
  const t = getTickerById(id);
  return t ? { symbol: t.symbol, exchange: t.exchange, description: t.name } : { symbol: id, exchange: "", description: "" };
}

/** Convert a builder payload (tickerCatalog shape) to registry format */
export function fromBuilderFormat(payload) {
  const base = {
    id: payload.id,
    type: payload.kind,
    enabled: true,
    capital: payload.capital || 1000,
    _source: "builder",
  };

  if (payload.kind === "pair") {
    return {
      ...base,
      leader: resolveTickerRef(payload.leaderId),
      follower: resolveTickerRef(payload.followerId),
      targets: payload.targets || [],
      stop: payload.stop || 0,
      leaderThreshold: payload.leaderThreshold || 0,
      tv: {},
    };
  }

  if (payload.kind === "basket") {
    return {
      ...base,
      leader: resolveTickerRef(payload.leaderId),
      drivers: payload.driverIds || [],
      tv: {},
    };
  }

  if (payload.kind === "standalone") {
    return {
      ...base,
      leader: resolveTickerRef(payload.leaderId),
      tv: {},
    };
  }

  if (payload.kind === "infra_follower") {
    return {
      ...base,
      follower: resolveTickerRef(payload.followerId),
      aiLeaders: payload.aiLeaderIds || [],
      infraDrivers: payload.infraDriverIds || [],
      strategicPartners: payload.partnerIds || [],
      tv: {},
      thresholds: {
        lagThreshold: payload.lagThreshold || 0.0075,
        targetsPct: payload.targetsPct || [0.04, 0.07, 0.10],
        stopPct: payload.stopPct || 0.04,
      },
    };
  }

  // fallback: standalone
  return { ...base, type: "standalone", leader: resolveTickerRef(payload.leaderId || payload.id), tv: {} };
}

// -------------------------------------------------
// LOCALSTORAGE PERSISTENCE
// -------------------------------------------------

/** Load runtime-added setups from localStorage and merge with seed */
export function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return;

    // Merge: seed setups + stored runtime setups (no duplicates by id)
    const seedIds = new Set(SETUPS.map(s => s.id));
    const runtimeSetups = parsed.filter(s => !seedIds.has(s.id));

    // Also restore enable/disable state for seed setups
    for (const stored of parsed) {
      if (seedIds.has(stored.id)) {
        const idx = _setups.findIndex(s => s.id === stored.id);
        if (idx !== -1) _setups[idx] = { ..._setups[idx], enabled: stored.enabled };
      }
    }

    // Add runtime setups
    for (const rs of runtimeSetups) {
      const errors = validateSetup(rs);
      if (errors.length === 0 && !_setups.some(s => s.id === rs.id)) {
        _setups.push({ ...rs, _source: "runtime" });
      }
    }
  } catch {
    // Corrupt storage — ignore
  }
}

/** Save current state to localStorage */
export function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_setups));
  } catch {
    // Storage full or unavailable — ignore
  }
}

/** Clear runtime setups from localStorage */
export function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// -------------------------------------------------
// INITIALIZE: load from storage on module load
// -------------------------------------------------

loadFromStorage();

// -------------------------------------------------
// RE-EXPORT MARKET_REGIME
// -------------------------------------------------

export { MARKET_REGIME };
