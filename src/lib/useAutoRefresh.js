// =====================================================================
// useAutoRefresh — owns the cadence
// =====================================================================
// One hook that drives the cockpit's auto-refresh. Pauses when:
//   - the operator has it disabled
//   - intervalMs is null (replay-only / closed session)
//   - the document is hidden (visibilitychange) — saves API budget
//   - a refresh is already in flight (no overlapping fetches)
//
// The host component owns `onTick` (which fires runLivePreview or
// equivalent) and `intervalMs` (resolved via refreshPolicyForSession).
// =====================================================================

import { useEffect, useRef } from "react";

/**
 * @param {object} args
 * @param {boolean} args.enabled         master on/off (operator preference)
 * @param {number|null} args.intervalMs  cadence in ms, or null to pause
 * @param {() => (Promise|void)} args.onTick   refresh action
 * @param {boolean} [args.runOnMount=true]     fire once immediately when armed
 * @param {boolean} [args.pauseWhenHidden=true]
 */
export function useAutoRefresh({
  enabled,
  intervalMs,
  onTick,
  runOnMount = true,
  pauseWhenHidden = true,
}) {
  // Keep the latest onTick in a ref so changing the function doesn't
  // tear down the interval mid-flight.
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !intervalMs) return undefined;

    let cancelled = false;
    let timerId = null;

    const safeFire = async () => {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await onTickRef.current();
      } finally {
        inFlightRef.current = false;
      }
    };

    const start = () => {
      if (timerId != null) return;
      timerId = setInterval(safeFire, intervalMs);
    };
    const stop = () => {
      if (timerId == null) return;
      clearInterval(timerId);
      timerId = null;
    };

    // Optional: pause when tab hidden. Saves API spend and avoids racing
    // a backgrounded tab against the active one.
    const onVisChange = () => {
      if (!pauseWhenHidden) return;
      if (typeof document === "undefined") return;
      if (document.hidden) {
        stop();
      } else {
        start();
        // Fire immediately on tab return so the operator doesn't see
        // stale data when they come back.
        safeFire();
      }
    };

    if (runOnMount) {
      // Defer so React's commit completes first.
      Promise.resolve().then(safeFire);
    }
    if (typeof document === "undefined" || !document.hidden) {
      start();
    }
    if (typeof document !== "undefined" && pauseWhenHidden) {
      document.addEventListener("visibilitychange", onVisChange);
    }

    return () => {
      cancelled = true;
      stop();
      if (typeof document !== "undefined" && pauseWhenHidden) {
        document.removeEventListener("visibilitychange", onVisChange);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, runOnMount, pauseWhenHidden]);
}

/**
 * Periodic clock tick — used to keep "5s ago / 2m ago" labels live
 * without re-fetching anything.
 */
import { useState } from "react";
export function useClockTick(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
