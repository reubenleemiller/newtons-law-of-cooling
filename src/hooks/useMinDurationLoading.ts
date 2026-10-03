import { useState, useLayoutEffect, useRef } from "react";

/**
 * Returns a derived loading flag that stays `true` for at least `minDurationMs`
 * milliseconds once `isLoading` becomes `true`, even if the underlying async
 * work finishes sooner.  The actual result data is never delayed — only the
 * spinner visibility is held for the minimum duration.
 *
 * @param isLoading     The raw loading flag driven by your async operation.
 * @param minDurationMs Minimum spinner display time in ms (default: 2000).
 */
export function useMinDurationLoading(
  isLoading: boolean,
  minDurationMs = 2000
): boolean {
  // Tracks the minimum-duration "stay visible" window after loading ends.
  const [cooldownActive, setCooldownActive] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // useLayoutEffect fires before the browser paint, so the cooldown is activated
  // in the same paint cycle that isLoading goes false — no visible flicker.
  useLayoutEffect(() => {
    if (isLoading) {
      // Cancel any leftover cooldown timer from a previous cycle and record
      // the start time.  The spinner is already visible (isLoading is true).
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      startTimeRef.current = Date.now();
    } else if (startTimeRef.current !== null) {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = minDurationMs - elapsed;
      startTimeRef.current = null;
      if (remaining > 0) {
        // setCooldownActive(true) is called synchronously so that
        // useLayoutEffect can activate the cooldown before the browser
        // paints, eliminating any visible one-frame spinner flash.
        // This does not cause an infinite loop: the effect depends on
        // [isLoading, minDurationMs] — setting cooldownActive will not
        // re-run the effect, so there are no runaway cascades.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCooldownActive(true);
        timerRef.current = setTimeout(() => {
          setCooldownActive(false);
          timerRef.current = null;
        }, remaining);
      }
    }

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isLoading, minDurationMs]);

  // When isLoading is true we already return true without needing cooldownActive.
  return isLoading || cooldownActive;
}
