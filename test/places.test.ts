import { describe, expect, it, vi } from "vitest";
import type { RunQuery } from "../src/overture/duckdb.js";
import {
  describePlace,
  formatAddress,
  MAX_RESULTS,
  MIN_CONFIDENCE,
  rowToPlace,
  searchPlaces,
} from "../src/overture/places.js";

const area = { west: 10.26, south: 36.84, east: 10.28, north: 36.85 };

const row = {
  name: "The Big Apple Coffee",
  category: "coffee_shop",
  brand: null,
  phone: "+21671193601",
  website: null,
  address: { freeform: "Zahret el Bouhaira. LAC II", locality: "Tunis", postcode: "1053", region: null, country: "TN" },
  operating_status: null,
  lng: 10.27,
  lat: 36.845,
};

function fakeRun(rows = [row]) {
  return vi.fn<RunQuery>(async () => rows);
}

describe("searchPlaces", () => {
  it("returns the rows as Place objects", async () => {
    const places = await searchPlaces(fakeRun(), { release: "2026-10-21.0", area, categories: ["cafe"] });
    expect(places).toEqual([rowToPlace(row)]);
  });

  it("passes the area, confidence, center and categories as query parameters", async () => {
    const run = fakeRun();
    await searchPlaces(run, { release: "2026-10-21.0", area, categories: ["cafe", "coffee_shop"] });

    const [sql, params] = run.mock.calls[0]!;
    expect(params?.slice(0, 7)).toEqual([10.26, 10.28, 36.84, 36.85, MIN_CONFIDENCE, 10.27, 36.845]);
    expect(params).toHaveLength(8);
    expect(sql).toContain("list_has_any(taxonomy.hierarchy, $8)");
    expect(sql).toContain("release/2026-10-21.0/theme=places/type=place/*");
    // Category names are user-derived, so they must never be pasted into the SQL text.
    expect(sql).not.toContain("coffee_shop");
  });

  it("skips the category filter when no category is given", async () => {
    const run = fakeRun();
    await searchPlaces(run, { release: "2026-10-21.0", area, categories: [] });
    const [sql, params] = run.mock.calls[0]!;
    expect(sql).not.toContain("list_has_any");
    expect(params).toHaveLength(7);
  });

  it.each([
    [undefined, MAX_RESULTS],
    [5, 5],
    [500, MAX_RESULTS],
    [0, 1],
    [3.7, 3],
  ])("limit %s becomes LIMIT %s", async (limit, expected) => {
    const run = fakeRun();
    await searchPlaces(run, { release: "2026-10-21.0", area, categories: [], ...(limit === undefined ? {} : { limit }) });
    expect(run.mock.calls[0]![0]).toMatch(new RegExp(`LIMIT ${expected}\\b`));
  });

  it("returns [] when nothing is found", async () => {
    expect(await searchPlaces(fakeRun([]), { release: "2026-10-21.0", area, categories: [] })).toEqual([]);
  });

  it("refuses an invalid release id", async () => {
    await expect(searchPlaces(fakeRun(), { release: "../x", area, categories: [] })).rejects.toThrow(
      "Invalid Overture release id",
    );
  });
});

describe("rowToPlace", () => {
  it("maps every field and leaves unknown data as null", () => {
    expect(rowToPlace(row)).toEqual({
      name: "The Big Apple Coffee",
      rating: null,
      description: "Coffee shop",
      phoneNumber: "+21671193601",
      website: null,
      address: "Zahret el Bouhaira. LAC II, 1053 Tunis, TN",
      location: { lat: 36.845, lng: 10.27 },
      status: { state: "unknown", opensAt: null },
      travelTime: { walking: null, driving: null, cycling: null, transit: null },
    });
  });

  it("reports a temporarily closed place as closed", () => {
    expect(rowToPlace({ ...row, operating_status: "temporarily_closed" }).status.state).toBe("closed");
    expect(rowToPlace({ ...row, operating_status: "open" }).status.state).toBe("unknown");
  });

  it("treats blank strings as missing", () => {
    const place = rowToPlace({ ...row, phone: "  ", website: "" });
    expect(place.phoneNumber).toBeNull();
    expect(place.website).toBeNull();
  });
});

describe("describePlace", () => {
  it.each([
    ["coffee_shop", "Starbucks", "Coffee shop (Starbucks)"],
    ["fast_food_restaurant", null, "Fast food restaurant"],
    [null, "Starbucks", "Starbucks"],
    [null, null, null],
  ])("%s + %s -> %s", (category, brand, expected) => {
    expect(describePlace(category, brand)).toBe(expected);
  });
});

describe("formatAddress", () => {
  it("skips missing parts", () => {
    expect(formatAddress({ freeform: null, locality: "Tunis", postcode: null, country: "TN" })).toBe("Tunis, TN");
  });

  it.each([null, undefined, "Tunis", { freeform: null, locality: " ", country: null }])(
    "returns null for %s",
    (address) => {
      expect(formatAddress(address)).toBeNull();
    },
  );
});
