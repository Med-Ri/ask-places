/** Runs async tasks one after another, at most one start per `intervalMs`. */
export function createThrottle(intervalMs: number): <T>(task: () => Promise<T>) => Promise<T> {
  let nextStart = 0;
  let chain: Promise<void> = Promise.resolve();

  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(async () => {
      const wait = Math.max(0, nextStart - Date.now());
      nextStart = Date.now() + wait + intervalMs;
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      return task();
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}
