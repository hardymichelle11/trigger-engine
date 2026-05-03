// =====================================================
// useCockpitActions — React hook (Phase 4.7.4)
// =====================================================
// Wraps cockpitActions.js with React state + cross-tab
// localStorage sync. Components consume the hook and never
// touch storage directly.
//
// Hard rules:
//   - Per-user persistence; different browsers see different data.
//   - Returns stable handler functions (toggleWatch, etc.) so
//     consumers can pass them down without effect-loops.
// =====================================================

import { useCallback, useEffect, useState } from "react";
import { resolveUserId } from "../capital/capitalContext.js";
import {
  loadWatchList, toggleWatch as toggleWatchStore,
  loadCandidates, toggleCandidate as toggleCandidateStore,
  loadPriceAlerts, setPriceAlert as setPriceAlertStore,
  clearPriceAlert as clearPriceAlertStore,
  COCKPIT_ACTION_KEYS,
} from "./cockpitActions.js";

export function useCockpitActions() {
  const [userId] = useState(() => resolveUserId());
  const [watchList, setWatchList] = useState(() => loadWatchList(userId));
  const [candidates, setCandidates] = useState(() => loadCandidates(userId));
  const [priceAlerts, setPriceAlerts] = useState(() => loadPriceAlerts(userId));

  // Cross-tab sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e) => {
      if (!e || !e.key) return;
      if (e.key === COCKPIT_ACTION_KEYS.WATCH + userId) setWatchList(loadWatchList(userId));
      else if (e.key === COCKPIT_ACTION_KEYS.CANDIDATE + userId) setCandidates(loadCandidates(userId));
      else if (e.key === COCKPIT_ACTION_KEYS.ALERT + userId) setPriceAlerts(loadPriceAlerts(userId));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [userId]);

  const toggleWatch = useCallback((symbol) => {
    setWatchList(toggleWatchStore(symbol, userId));
  }, [userId]);

  const toggleCandidate = useCallback((symbol, snapshot) => {
    setCandidates(toggleCandidateStore(symbol, userId, snapshot));
  }, [userId]);

  const setAlert = useCallback((symbol, target, direction) => {
    setPriceAlerts(setPriceAlertStore(symbol, { target, direction }, userId));
  }, [userId]);

  const clearAlert = useCallback((symbol) => {
    setPriceAlerts(clearPriceAlertStore(symbol, userId));
  }, [userId]);

  // Per-symbol convenience
  const isWatching = useCallback((sym) => {
    if (!sym) return false;
    return watchList.includes(String(sym).toUpperCase());
  }, [watchList]);
  const isCandidate = useCallback((sym) => {
    if (!sym) return false;
    return candidates.some(c => c.symbol === String(sym).toUpperCase());
  }, [candidates]);
  const getAlert = useCallback((sym) => {
    if (!sym) return null;
    return priceAlerts[String(sym).toUpperCase()] || null;
  }, [priceAlerts]);

  return {
    userId,
    watchList,
    candidates,
    priceAlerts,
    isWatching,
    isCandidate,
    getAlert,
    toggleWatch,
    toggleCandidate,
    setAlert,
    clearAlert,
  };
}
