import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSearchCaches, createMemoryCache, geocodeCache, SEARCH_CACHE_TTL_MS } from "../src/cache.js";
import { geocodePlace } from "../src/osm/nominatim.js";
import { searchOsmPlaces } from "../src/osm/overpass.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const mosqueSearch = {
  center: { lat: 36.801, lng: 10.14 },
  radiusMeters: 1500,
  includedTypes: ["mosque"],
  textQuery: "mosque",
  limit: 20,
};

beforeEach(() => {
  clearSearchCaches();
});

describe("memory cache", () => {
  it("drops an entry after the ttl and forgets the oldest past the cap", () => {
    const cache = createMemoryCache<string>(1_000, 2);
    cache.set("a", "one", 0);
    cache.set("b", "two", 0);
    cache.set("c", "three", 0);
    expect(cache.get("a", 0)).toBeUndefined();
    expect(cache.get("b", 500)).toBe("two");
    expect(cache.get("b", 1_000)).toBeUndefined();
  });
});

describe("geocode cache", () => {
  it("reuses a place and does not call Nominatim again", async () => {
    const fetch = vi.fn(async () => jsonResponse([{ lat: "36.8", lon: "10.18" }]));
    const first = await geocodePlace("Lac 2, Tunis", "TN", { fetch });
    const second = await geocodePlace("  lac 2, tunis ", "tn", { fetch });
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a miss for a different country", async () => {
    const fetch = vi.fn(async () => jsonResponse([]));
    await geocodePlace("Paris", "FR", { fetch });
    await geocodePlace("Paris", "TN", { fetch });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed request", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(jsonResponse([{ lat: "1", lon: "2" }]));
    await expect(geocodePlace("Tunis", "TN", { fetch })).rejects.toThrow("offline");
    await expect(geocodePlace("Tunis", "TN", { fetch })).resolves.toEqual({ lat: 1, lng: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("asks Nominatim again after the cache expires", async () => {
    const fetch = vi.fn(async () => jsonResponse([{ lat: "36.8", lon: "10.18" }]));
    await geocodePlace("Sfax", "TN", { fetch });
    geocodeCache.set("tn|sfax", { lat: 36.8, lng: 10.18 }, Date.now() - SEARCH_CACHE_TTL_MS - 1);
    await geocodePlace("Sfax", "TN", { fetch });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("place search cache", () => {
  it("reuses places for the same center, radius, and type", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        elements: [{ type: "node", lat: 36.8012, lon: 10.1402, tags: { name: "Cafe", amenity: "cafe" } }],
      }),
    );
    const first = await searchOsmPlaces({ ...mosqueSearch, includedTypes: ["cafe"], textQuery: "Cafe" }, { fetch });
    const second = await searchOsmPlaces({ ...mosqueSearch, includedTypes: ["cafe"], textQuery: " cafe " }, { fetch });
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    second[0]!.name = "changed";
    const third = await searchOsmPlaces({ ...mosqueSearch, includedTypes: ["cafe"], textQuery: "CAFE" }, { fetch });
    expect(third[0]?.name).toBe("Cafe");
  });

  it("searches again for a different radius", async () => {
    const fetch = vi.fn(async () => jsonResponse({ elements: [] }));
    await searchOsmPlaces(mosqueSearch, { fetch });
    await searchOsmPlaces({ ...mosqueSearch, radiusMeters: 3000 }, { fetch });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
