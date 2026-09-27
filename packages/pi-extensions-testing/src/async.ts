/**
 * Helpers for controlling asynchronous work from a test.
 */

/** A promise together with the functions that settle it. */
export interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly reject: (reason: unknown) => void;
  readonly resolve: (value: T) => void;
}

/** Create a promise that the test settles explicitly. */
export function createDeferred<T = void>(): Deferred<T> {
  let reject: (reason: unknown) => void = () => {};
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });

  return { promise, reject, resolve };
}

/**
 * Let pending promise continuations run.
 *
 * Waits two macrotask turns, so a continuation that itself awaits an
 * already-settled promise also completes before the test resumes.
 */
export async function flushPromises(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}
