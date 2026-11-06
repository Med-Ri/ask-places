import { describe, expect, it, vi } from "vitest";
import { buildQuery, searchOsmPlaces, toPlace } from "../src/osm/overpass.js";
import { toLeg } from "../src/osm/valhalla.js";
import { geocodePlace } from "../src/osm/nominatim.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("nominatim", () => {
  it("returns the first hit", async () => {
    const fetch = vi.fn(async () => jsonResponse([{ lat: "36.8", lon: "10.18" }]));
    await expect(geocodePlace("Tunis", "TN", { fetch })).resolves.toEqual({ lat: 36.8, lng: 10.18 });
  });

  it("returns null when nothing matches", async () => {
    const fetch = vi.fn(async () => jsonResponse([]));
    await expect(geocodePlace("nowhere", undefined, { fetch })).resolves.toBeNull();
  });
});

describe("overpass", () => {
  it("builds a mosque query inside the radius", () => {
    const query = buildQuery(
      { center: { lat: 36.8, lng: 10.14 }, radiusMeters: 1500, includedTypes: ["mosque"], textQuery: "mosque", limit: 20 },
      1500,
    );
    expect(query).toContain('["amenity"="place_of_worship"]["religion"="muslim"]');
    expect(query).toContain("around:1500,36.8,10.14");
  });

  it("maps a named node and leaves rating and hours empty", async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        elements: [
          {
            type: "node",
            lat: 36.8015,
            lon: 10.1405,
            tags: {
              name: "جامع الباي",
              amenity: "place_of_worship",
              religion: "muslim",
              phone: "+21670000000",
              "addr:street": "Rue de France",
              "addr:city": "Tunis",
            },
          },
          { type: "node", lat: 36.8, lon: 10.14, tags: { amenity: "cafe" } },
        ],
      }),
    );
    const places = await searchOsmPlaces(
      { center: { lat: 36.801, lng: 10.14 }, radiusMeters: 500, includedTypes: ["mosque"], textQuery: "", limit: 20 },
      { fetch },
    );
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      name: "جامع الباي",
      description: "Mosque",
      rating: null,
      phoneNumber: "+21670000000",
      status: { state: "unknown", opensAt: null },
    });
  });

  it("tries the next Overpass server when the first times out", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("openstreetmap.fr")) {
        const error = new Error("The operation was aborted due to timeout");
        error.name = "TimeoutError";
        throw error;
      }
      return jsonResponse({
        elements: [
          {
            type: "node",
            lat: 36.8012,
            lon: 10.1402,
            tags: { name: "جامع", amenity: "place_of_worship", religion: "muslim" },
          },
        ],
      });
    });
    const places = await searchOsmPlaces(
      { center: { lat: 36.801, lng: 10.14 }, radiusMeters: 1500, includedTypes: ["mosque"], textQuery: "", limit: 20 },
      { fetch },
    );
    expect(places.map((place) => place.name)).toEqual(["جامع"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("skips a place with no name", () => {
    expect(toPlace({ lat: 1, lon: 2, tags: { amenity: "cafe" } })).toBeNull();
  });
});

describe("valhalla leg", () => {
  it("converts seconds to minutes and kilometers to meters", () => {
    expect(toLeg({ time: 165, distance: 1.2 })).toEqual({ minutes: 3, meters: 1200 });
    expect(toLeg(null)).toEqual({ minutes: null, meters: null });
  });
});
