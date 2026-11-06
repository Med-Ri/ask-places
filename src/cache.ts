import type { LatLng, Place } from "./types.js";

/** How long a geocode or place search can be reused. OpenStreetMap data does not change minute to minute. */
export const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;

const MAX_ENTRIES = 200;

type Entry<T> = { value: T; expiresAt: number };

export type MemoryCache<T> = {
  /** `undefined` means a miss. A stored `null` is a hit. */
  get(key: string, now?: number): T | undefined;
  set(key: string, value: T, now?: number): void;
  clear(): void;
};

/** In-memory cache. Oldest entries are dropped past `maxEntries`. Expired entries are dropped on read. */
export function createMemoryCache<T>(ttlMs: number, maxEntries = MAX_ENTRIES): MemoryCache<T> {
  const store = new Map<string, Entry<T>>();
  return {
    get(key, now = Date.now()) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= now) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value, now = Date.now()) {
      store.delete(key);
      store.set(key, { value, expiresAt: now + ttlMs });
      while (store.size > maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
      }
    },
    clear() {
      store.clear();
    },
  };
}

export const geocodeCache = createMemoryCache<LatLng | null>(SEARCH_CACHE_TTL_MS);
export const placeSearchCache = createMemoryCache<Place[]>(SEARCH_CACHE_TTL_MS);

export function clearSearchCaches(): void {
  geocodeCache.clear();
  placeSearchCache.clear();
}
