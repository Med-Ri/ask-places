import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThrottle } from "../src/throttle.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createThrottle", () => {
  it("starts tasks at least the interval apart, in order", async () => {
    const schedule = createThrottle(1_000);
    const starts: number[] = [];
    const task = async () => {
      starts.push(Date.now());
    };

    const all = Promise.all([schedule(task), schedule(task), schedule(task)]);
    await vi.runAllTimersAsync();
    await all;

    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(1_000);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(1_000);
  });

  it("returns each task's result", async () => {
    const schedule = createThrottle(1_000);
    const results = Promise.all([schedule(async () => "a"), schedule(async () => "b")]);
    await vi.runAllTimersAsync();
    expect(await results).toEqual(["a", "b"]);
  });

  it("keeps going after a task fails", async () => {
    const schedule = createThrottle(1_000);
    const failed = schedule(async () => {
      throw new Error("boom");
    });
    const next = schedule(async () => "ok");
    await vi.runAllTimersAsync();

    await expect(failed).rejects.toThrow("boom");
    expect(await next).toBe("ok");
  });
});
