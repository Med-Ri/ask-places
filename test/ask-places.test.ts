import { describe, expect, it, vi } from "vitest";
import { askPlaces, type AskPlacesDeps } from "../src/ask-places.js";
import { AskPlacesInternalError, AskPlacesUsageError } from "../src/errors.js";
import type { UnderstoodQuestion } from "../src/llm/understand.js";
import type { Place } from "../src/types.js";
import type { PlaceSearch } from "../src/overture/places.js";

const options = { provider: "openai" as const, apiKey: "sk-test" };

const intent: UnderstoodQuestion = {
  what: "cafés",
  where: "Lac 2, Tunis",
  countryCode: "TN",
  categories: ["cafe", "coffee_shop"],
  limit: null,
  radiusMeters: null,
};

const cafe: Place = {
  name: "Big Bang",
  rating: null,
  description: "Cafe",
  phoneNumber: null,
  website: null,
  address: "Tunis",
  location: { lat: 36.84, lng: 10.27 },
  status: { state: "unknown", opensAt: null },
  travelTime: { walking: null, driving: null, cycling: null, transit: null },
};

const located = {
  name: "Lac 2",
  center: { lat: 36.8455, lng: 10.2709 },
  area: { west: 10.26, south: 36.84, east: 10.28, north: 36.85 },
  source: "nominatim" as const,
};

function deps(overrides: AskPlacesDeps = {}): AskPlacesDeps & {
  understand: ReturnType<typeof vi.fn>;
  geocode: ReturnType<typeof vi.fn>;
  searchPlaces: ReturnType<typeof vi.fn<(run: unknown, search: PlaceSearch) => Promise<Place[]>>>;
  addTravelTimes: ReturnType<typeof vi.fn>;
  addTransitEstimates: ReturnType<typeof vi.fn>;
} {
  return {
    createModel: vi.fn(() => ({ kind: "model" }) as never),
    understand: vi.fn(async () => intent),
    geocode: vi.fn(async () => located),
    getRelease: vi.fn(async () => "2026-10-21.0"),
    searchPlaces: vi.fn(async (_run: unknown, _search: PlaceSearch) => [cafe]),
    runQuery: vi.fn(async () => []),
    addTravelTimes: vi.fn(async (places: Place[]) =>
      places.map((p) => ({ ...p, travelTime: { ...p.travelTime, walking: 5, driving: 2, cycling: 2 } })),
    ),
    addTransitEstimates: vi.fn(async (places: Place[]) =>
      places.map((p) => ({ ...p, travelTime: { ...p.travelTime, transit: { minutes: 8, estimated: true as const } } })),
    ),
    ...overrides,
  } as never;
}

describe("askPlaces", () => {
  it("runs validate → understand → geocode → search → travel → transit", async () => {
    const d = deps();
    const places = await askPlaces("  cafés near Lac 2, Tunis ", options, d);

    expect(d.understand).toHaveBeenCalledWith("cafés near Lac 2, Tunis", { kind: "model" }, "openai");
    expect(d.geocode).toHaveBeenCalledWith({ place: "Lac 2, Tunis", countryCode: "TN" });
    expect(d.searchPlaces).toHaveBeenCalledWith(d.runQuery, {
      release: "2026-10-21.0",
      area: located.area,
      categories: ["cafe", "coffee_shop"],
      limit: 20,
    });
    expect(d.addTravelTimes).toHaveBeenCalled();
    expect(d.addTransitEstimates).toHaveBeenCalled();
    expect(places).toHaveLength(1);
    expect(places[0]?.travelTime).toEqual({ walking: 5, driving: 2, cycling: 2, transit: { minutes: 8, estimated: true } });
  });

  it("expands bank categories so Overture bank_or_credit_union matches", async () => {
    const d = deps({
      understand: vi.fn(async () => ({
        ...intent,
        what: "banc",
        where: "",
        countryCode: null,
        categories: ["bank"],
      })),
    });
    await askPlaces("banc near me", { ...options, origin: { lat: 36.84, lng: 10.27 } }, d);
    expect(d.searchPlaces.mock.calls[0]![1].categories).toEqual(
      expect.arrayContaining(["bank", "bank_or_credit_union", "atm"]),
    );
  });

  it("returns [] when the place cannot be geocoded", async () => {
    const d = deps({ geocode: vi.fn(async () => null) });
    expect(await askPlaces("cafés in Nowhereville", options, d)).toEqual([]);
    expect(d.searchPlaces).not.toHaveBeenCalled();
  });

  it("returns [] when the search finds nothing", async () => {
    const d = deps({ searchPlaces: vi.fn(async () => []) });
    expect(await askPlaces("cafés near Lac 2", options, d)).toEqual([]);
    expect(d.addTravelTimes).not.toHaveBeenCalled();
  });

  it("searches around options.origin when the question has no where", async () => {
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, where: "", countryCode: null })),
    });
    const origin = { lat: 36.84, lng: 10.27 };
    await askPlaces("cafés near me", { ...options, origin }, d);

    expect(d.geocode).not.toHaveBeenCalled();
    expect(d.searchPlaces).toHaveBeenCalledOnce();
    const searchArg = d.searchPlaces.mock.calls[0]![1];
    expect(searchArg.area.west).toBeLessThan(origin.lng);
    expect(searchArg.area.east).toBeGreaterThan(origin.lng);
  });

  it("uses the asked radius around origin and drops places outside it", async () => {
    const near: Place = { ...cafe, name: "Near", location: { lat: 36.8405, lng: 10.27 } };
    const far: Place = { ...cafe, name: "Far", location: { lat: 36.85, lng: 10.28 } };
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, where: "", countryCode: null, radiusMeters: 500 })),
      searchPlaces: vi.fn(async () => [near, far]),
    });
    const origin = { lat: 36.84, lng: 10.27 };
    const places = await askPlaces("restaurants within 500m", { ...options, origin }, d);

    const searchArg = d.searchPlaces.mock.calls[0]![1];
    // ~500 m in latitude degrees ≈ 0.0045
    expect(searchArg.area.north - origin.lat).toBeCloseTo(500 / 111_320, 5);
    expect(places.map((p) => p.name)).toEqual(["Near"]);
    expect(d.addTravelTimes).toHaveBeenCalledWith([near], origin);
  });

  it("parses radius from the question when the LLM omits it", async () => {
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, where: "", countryCode: null, radiusMeters: null })),
    });
    const origin = { lat: 36.84, lng: 10.27 };
    await askPlaces("restaurants within 500m", { ...options, origin }, d);
    const searchArg = d.searchPlaces.mock.calls[0]![1];
    expect(searchArg.area.north - origin.lat).toBeCloseTo(500 / 111_320, 5);
  });

  it("lets options.radiusMeters override the question", async () => {
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, where: "", countryCode: null, radiusMeters: 2_000 })),
    });
    const origin = { lat: 36.84, lng: 10.27 };
    await askPlaces("restaurants within 2km", { ...options, origin, radiusMeters: 300 }, d);
    const searchArg = d.searchPlaces.mock.calls[0]![1];
    expect(searchArg.area.north - origin.lat).toBeCloseTo(300 / 111_320, 5);
  });

  it("applies radius around a geocoded place when the question asks for one", async () => {
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, radiusMeters: 500 })),
    });
    await askPlaces("cafés within 500m of Lac 2, Tunis", options, d);
    const searchArg = d.searchPlaces.mock.calls[0]![1];
    expect(searchArg.area.north - located.center.lat).toBeCloseTo(500 / 111_320, 5);
  });

  it("returns [] when there is no where and no origin", async () => {
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, where: "", countryCode: null })),
    });
    expect(await askPlaces("cafés near me", options, d)).toEqual([]);
  });

  it("respects a limit extracted from the question", async () => {
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, limit: 3 })),
    });
    await askPlaces("3 cafés near Lac 2", options, d);
    expect(d.searchPlaces.mock.calls[0]![1].limit).toBe(3);
  });

  it("rethrows usage errors (e.g. invalid API key) without wrapping them", async () => {
    const d = deps({
      understand: vi.fn(async () => {
        throw new AskPlacesUsageError("INVALID_API_KEY", 'askplaces: the API key for "openai" was rejected.');
      }),
    });
    await expect(askPlaces("cafés", options, d)).rejects.toMatchObject({ code: "INVALID_API_KEY" });
  });

  it("wraps unexpected failures in AskPlacesInternalError", async () => {
    const d = deps({
      geocode: vi.fn(async () => {
        throw new Error("DNS failure");
      }),
    });
    await expect(askPlaces("cafés near Lac 2", options, d)).rejects.toBeInstanceOf(AskPlacesInternalError);
  });

  it("rejects invalid input before calling the LLM", async () => {
    const d = deps();
    await expect(askPlaces("", options, d)).rejects.toMatchObject({ code: "INVALID_QUESTION" });
    expect(d.understand).not.toHaveBeenCalled();
  });
});
