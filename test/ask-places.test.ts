import { describe, expect, it, vi } from "vitest";
import { genericAnswerFor } from "../src/context.js";
import { askPlaces, DEFAULT_SEARCH_RADIUS_METERS, type AskPlacesDeps } from "../src/ask-places.js";
import { AskPlacesInternalError, AskPlacesUsageError } from "../src/errors.js";
import type { OsmPlaceSearch } from "../src/osm/overpass.js";
import type { UnderstoodQuestion } from "../src/llm/understand.js";
import type { Place } from "../src/types.js";

const options = { provider: "openai" as const, apiKey: "sk-test" };

const intent: UnderstoodQuestion = {
  what: "cafés",
  where: "Lac 2, Tunis",
  countryCode: "TN",
  includedTypes: ["cafe"],
  limit: null,
  radiusMeters: null,
  inContext: true,
};

const cafe: Place = {
  name: "Big Bang",
  rating: 4.2,
  description: "Cafe",
  phoneNumber: null,
  website: null,
  address: "Tunis",
  location: { lat: 36.8455, lng: 10.2709 },
  distanceMeters: null,
  streetDistance: { walking: null, driving: null, cycling: null },
  status: { state: "open", opensAt: null },
  travelTime: { walking: null, driving: null, cycling: null, transit: null },
};

const center = { lat: 36.8455, lng: 10.2709 };

function deps(overrides: AskPlacesDeps = {}): AskPlacesDeps & {
  understand: ReturnType<typeof vi.fn>;
  geocode: ReturnType<typeof vi.fn>;
  searchPlaces: ReturnType<typeof vi.fn<(search: OsmPlaceSearch) => Promise<Place[]>>>;
  addTravelTimes: ReturnType<typeof vi.fn>;
} {
  return {
    createModel: vi.fn(() => ({ kind: "model" }) as never),
    understand: vi.fn(async () => intent),
    geocode: vi.fn(async () => center),
    searchPlaces: vi.fn(async () => [cafe]),
    addTravelTimes: vi.fn(async (places: Place[]) =>
      places.map((p) => ({ ...p, travelTime: { ...p.travelTime, walking: 5, driving: 2, cycling: 2, transit: null } })),
    ),
    ...overrides,
  } as never;
}

describe("askPlaces", () => {
  it("understands, geocodes, searches OpenStreetMap, then adds route times", async () => {
    const d = deps();
    const { places } = await askPlaces("  cafés near Lac 2, Tunis ", options, d);

    expect(d.understand).toHaveBeenCalledWith("cafés near Lac 2, Tunis", { kind: "model" }, "openai");
    expect(d.geocode).toHaveBeenCalledWith("Lac 2, Tunis", "TN");
    const search = d.searchPlaces.mock.calls[0]![0];
    expect(search.center).toEqual(center);
    expect(search.radiusMeters).toBe(DEFAULT_SEARCH_RADIUS_METERS);
    expect(search.includedTypes).toEqual(expect.arrayContaining(["cafe", "coffee_shop"]));
    expect(d.addTravelTimes).toHaveBeenCalled();
    expect(places[0]?.travelTime.walking).toBe(5);
    expect(places[0]?.travelTime.transit).toBeNull();
  });

  it("searches around origin when the question has no place name", async () => {
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, where: "", countryCode: null })),
    });
    const origin = { lat: 36.84, lng: 10.27 };
    await askPlaces("cafés near me", { ...options, origin }, d);
    expect(d.geocode).not.toHaveBeenCalled();
    expect(d.searchPlaces.mock.calls[0]![0].center).toEqual(origin);
    expect(d.searchPlaces.mock.calls[0]![0].radiusMeters).toBe(1_500);
  });

  it("uses a radius from the question", async () => {
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, where: "", countryCode: null, radiusMeters: null })),
    });
    const origin = { lat: 36.84, lng: 10.27 };
    await askPlaces("cafés within 500m", { ...options, origin }, d);
    expect(d.searchPlaces.mock.calls[0]![0].radiusMeters).toBe(500);
    expect(d.searchPlaces).toHaveBeenCalledTimes(1);
  });

  it("widens the default radius until it can return 20 places", async () => {
    const origin = { lat: 36.84, lng: 10.27 };
    const searchPlaces = vi.fn(async (search: OsmPlaceSearch) => {
      const count = search.radiusMeters >= 3_000 ? 20 : 3;
      return Array.from({ length: count }, (_, index) => ({
        ...cafe,
        name: `Place ${index + 1}`,
        location: { lat: origin.lat + index * 0.0001, lng: origin.lng },
      }));
    });
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, where: "", countryCode: null })),
      searchPlaces,
    });
    const { places } = await askPlaces("cafés", { ...options, origin }, d);
    expect(searchPlaces.mock.calls.map((call) => call[0].radiusMeters)).toEqual([1_500, 3_000]);
    expect(places).toHaveLength(20);
    expect(places[0]?.name).toBe("Place 1");
  });

  it("drops places outside the radius and sorts nearest first", async () => {
    const near: Place = { ...cafe, name: "Near", location: { lat: 36.8404, lng: 10.27 } };
    const far: Place = { ...cafe, name: "Far", location: { lat: 36.86, lng: 10.27 } };
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, where: "", countryCode: null, radiusMeters: 500 })),
      searchPlaces: vi.fn(async () => [far, near]),
    });
    const origin = { lat: 36.84, lng: 10.27 };
    const { places } = await askPlaces("cafés", { ...options, origin }, d);
    expect(places.map((p) => p.name)).toEqual(["Near"]);
    expect(places[0]?.distanceMeters).toBeGreaterThan(0);
  });

  it("searches mosques for an Arabic prayer question", async () => {
    const d = deps({
      understand: vi.fn(async () => ({
        ...intent,
        what: "مسجد",
        where: "",
        countryCode: null,
        includedTypes: ["church"],
      })),
    });
    await askPlaces("أنا مسلم و أريد أن أصلي", { ...options, origin: { lat: 36.8, lng: 10.14 } }, d);
    expect(d.searchPlaces.mock.calls[0]![0].includedTypes).toEqual(["mosque"]);
  });

  it("returns [] when the place cannot be geocoded", async () => {
    const d = deps({ geocode: vi.fn(async () => null) });
    expect(await askPlaces("cafés in Nowhereville", options, d)).toEqual({ places: [], answer: null });
    expect(d.searchPlaces).not.toHaveBeenCalled();
  });

  it("returns [] when there is no place name and no origin", async () => {
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, where: "", countryCode: null })),
    });
    expect(await askPlaces("cafés near me", options, d)).toEqual({ places: [], answer: null });
  });

  it("returns a generic answer and does not search when the question is off topic", async () => {
    const d = deps({
      understand: vi.fn(async () => ({
        ...intent,
        what: "",
        where: "",
        countryCode: null,
        includedTypes: [],
        inContext: false,
      })),
    });
    const result = await askPlaces("what is the weather today", { ...options, origin: { lat: 36.8, lng: 10.14 } }, d);
    expect(result).toEqual({ places: [], answer: genericAnswerFor("what is the weather today") });
    expect(d.geocode).not.toHaveBeenCalled();
    expect(d.searchPlaces).not.toHaveBeenCalled();
    expect(d.addTravelTimes).not.toHaveBeenCalled();
  });

  it("answers in French when a French question is off topic", async () => {
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, what: "", where: "", includedTypes: [], inContext: false })),
    });
    const result = await askPlaces("bonjour, raconte-moi une blague", options, d);
    expect(result.answer).toMatch(/lieu/);
  });

  it("answers in Arabic when an Arabic question is off topic", async () => {
    const d = deps({
      understand: vi.fn(async () => ({ ...intent, what: "", where: "", includedTypes: [], inContext: false })),
    });
    const result = await askPlaces("ما هو الطقس اليوم", options, d);
    expect(result.answer).toMatch(/مكان/);
    expect(result.places).toEqual([]);
  });

  it("rethrows a usage error from the LLM", async () => {
    const d = deps({
      understand: vi.fn(async () => {
        throw new AskPlacesUsageError("INVALID_API_KEY", "bad");
      }),
    });
    await expect(askPlaces("cafés", options, d)).rejects.toMatchObject({ code: "INVALID_API_KEY" });
  });

  it("wraps unexpected failures", async () => {
    const d = deps({ geocode: vi.fn(async () => { throw new Error("DNS"); }) });
    await expect(askPlaces("cafés near Lac 2", options, d)).rejects.toBeInstanceOf(AskPlacesInternalError);
  });

  it("rejects an empty question before calling the LLM", async () => {
    const d = deps();
    await expect(askPlaces("", options, d)).rejects.toMatchObject({ code: "INVALID_QUESTION" });
    expect(d.understand).not.toHaveBeenCalled();
  });
});
