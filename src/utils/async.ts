/**
 * Resolves with `fallback` if `promise` has not settled after `ms`.
 * The original promise keeps running; only the wait is bounded, so callers
 * (startup, confirmations) never hang on a stalled network.
 */
export function withTimeout<T, F>(
  promise: Promise<T>,
  ms: number,
  fallback: F
): Promise<T | F> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise,
    new Promise<F>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
