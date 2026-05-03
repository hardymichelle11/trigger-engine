// =====================================================
// useCapitalContext — React hook (Phase 4.7.2)
// =====================================================
// Wraps the pure capitalContext helpers with React state +
// cross-tab synchronization (storage events). Components
// read the context via this hook and never touch localStorage
// directly.
//
// Hard rules:
//   - Loads + persists only the current browser user's
//     capital settings. Different sessions / browsers see
//     different settings.
//   - Never logs or transmits capital values.
//   - Returns stable mutator functions (saveContext,
//     toggleHideBalances, resetContext) so consumers can
//     pass them down without effect-loops.
// =====================================================

import { useCallback, useEffect, useState } from "react";
import {
  defaultCapitalContext,
  loadCapitalContext,
  saveCapitalContext,
  resolveUserId,
  CAPITAL_STORAGE_KEY_PREFIX,
} from "./capitalContext.js";

/**
 * @returns {{
 *   ctx: import("./capitalContext.js").CapitalContext,
 *   userId: string,
 *   saveContext: (patch: Partial<import("./capitalContext.js").CapitalContext>) => void,
 *   toggleHideBalances: () => void,
 *   resetContext: () => void,
 *   reload: () => void,
 * }}
 */
export function useCapitalContext() {
  const [userId] = useState(() => resolveUserId());
  const [ctx, setCtx] = useState(() => loadCapitalContext(userId));

  // Cross-tab + cross-window sync: when another tab edits this user's
  // capital context, propagate the change here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const expectedKey = CAPITAL_STORAGE_KEY_PREFIX + userId;
    const handler = (e) => {
      if (!e || e.key !== expectedKey) return;
      setCtx(loadCapitalContext(userId));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [userId]);

  const saveContext = useCallback((patch) => {
    const next = saveCapitalContext(patch, userId);
    setCtx(next);
  }, [userId]);

  const toggleHideBalances = useCallback(() => {
    setCtx((prev) => {
      const next = saveCapitalContext({ hideBalances: !prev.hideBalances }, userId);
      return next;
    });
  }, [userId]);

  const resetContext = useCallback(() => {
    const next = saveCapitalContext(defaultCapitalContext(userId), userId);
    setCtx(next);
  }, [userId]);

  const reload = useCallback(() => {
    setCtx(loadCapitalContext(userId));
  }, [userId]);

  return { ctx, userId, saveContext, toggleHideBalances, resetContext, reload };
}
