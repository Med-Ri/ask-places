import { vi } from "vitest";

/** A fetch replacement that returns `body` as JSON with the given status. */
export function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

/** A fetch replacement that fails like a network error. */
export function failingFetch(message = "network down") {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    throw new TypeError(message);
  });
}

/** Runs a task immediately (no throttling), for tests. */
export const immediately = <T>(task: () => Promise<T>): Promise<T> => task();
