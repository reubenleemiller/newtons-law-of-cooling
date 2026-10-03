/**
 * Returns a promise that resolves (or rejects) with the same outcome as
 * `promise`, but waits at least `minMs` milliseconds before settling.
 *
 * Use this to gate UI updates so that loading spinners are always visible for
 * a minimum duration and results are never applied before that window closes.
 * Both successful results and errors are held until the minimum time elapses.
 *
 * @param promise The async operation to run.
 * @param minMs   Minimum wait time in milliseconds (default: 2000).
 *
 * Note: the internal timer runs for the full `minMs` regardless of whether the
 * returned promise is consumed. In practice this is harmless, but callers
 * should handle (or discard) the returned promise to avoid unhandled rejections.
 */
export function runWithMinDelay<T>(promise: Promise<T>, minMs = 2000): Promise<T> {
  const minDelay = new Promise<void>((resolve) => setTimeout(resolve, minMs));

  return new Promise<T>((resolve, reject) => {
    type Result = { ok: true; value: T } | { ok: false; error: unknown };
    let promiseResult: Result | null = null;
    let timerDone = false;

    function trySettle() {
      if (promiseResult !== null && timerDone) {
        if (promiseResult.ok) {
          resolve(promiseResult.value);
        } else {
          reject(promiseResult.error);
        }
      }
    }

    promise.then(
      (value) => {
        promiseResult = { ok: true, value };
        trySettle();
      },
      (error: unknown) => {
        promiseResult = { ok: false, error };
        trySettle();
      }
    );

    minDelay.then(() => {
      timerDone = true;
      trySettle();
    });
  });
}
