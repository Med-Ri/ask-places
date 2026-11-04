export type Schedule = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Runs tasks one at a time, with at least `intervalMs` between the start of two tasks.
 * Used for public services with a strict request rate (Nominatim: 1 request per second).
 */
export function createThrottle(intervalMs: number): Schedule {
  let queue: Promise<unknown> = Promise.resolve();
  let lastStart = Number.NEGATIVE_INFINITY;

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(async () => {
      const wait = lastStart + intervalMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastStart = Date.now();
      return task();
    });
    queue = result.catch(() => undefined);
    return result;
  };
}
