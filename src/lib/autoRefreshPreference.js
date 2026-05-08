// =====================================================================
// Auto-refresh preference — localStorage-backed, default ON
// =====================================================================
// The cockpit auto-refreshes by default. The operator can pause via the
// status bar toggle; the choice persists across reloads but stays in the
// browser only.
//
// Hard rules:
//   - Default value is TRUE — first visit auto-refreshes.
//   - Tolerant of broken localStorage (private browsing, sandboxed
//     iframes): falls back to in-memory state.
// =====================================================================

import { useCallback, useEffect, useState } from "react";

const KEY = "lethalBoard.autoRefresh.enabled";

/** Read the preference from localStorage. Defaults to ON. */
export function getAutoRefreshPreference() {
  try {
    if (typeof localStorage === "undefined") return true;
    const v = localStorage.getItem(KEY);
    if (v === null) return true;          // first visit → ON
    return v === "true";
  } catch {
    return true;
  }
}

/** Persist the preference. Silently no-ops when storage is unavailable. */
export function setAutoRefreshPreferencePersist(enabled) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, enabled ? "true" : "false");
    }
  } catch {
    /* ignore — preference will live in-memory for this session */
  }
}

/**
 * React hook around the preference. Returns:
 *   - enabled: the current value (default TRUE on first launch)
 *   - setEnabled(v): set + persist
 *   - toggle(): flip + persist
 *
 * Cross-tab sync: a storage event from another tab updates this one.
 */
export function useAutoRefreshPreference() {
  const [enabled, setEnabledState] = useState(() => getAutoRefreshPreference());

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e) => {
      if (!e || e.key !== KEY) return;
      setEnabledState(e.newValue === null ? true : e.newValue === "true");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setEnabled = useCallback((next) => {
    setEnabledState(!!next);
    setAutoRefreshPreferencePersist(!!next);
  }, []);

  const toggle = useCallback(() => {
    setEnabledState((prev) => {
      const next = !prev;
      setAutoRefreshPreferencePersist(next);
      return next;
    });
  }, []);

  return { enabled, setEnabled, toggle };
}

export const AUTO_REFRESH_KEY = KEY;
