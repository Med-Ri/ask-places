import { describe, expect, it, vi } from "vitest";
import { bboxAround } from "../src/geo.js";
import { geocode, MAX_SEARCH_RADIUS_METERS, MIN_SEARCH_RADIUS_METERS } from "../src/geocode/geocode.js";
import type { RunQuery } from "../src/overture/duckdb.js";
import { failingFetch, fakeFetch, immediately } from "./helpers.js";

const eiffel = {
  lat: "48.8582602",
  lon: "2.2945006",
  name: "Tour Eiffel",
  boundingbox: ["48.8574753", "48.8590453", "2.2933119", "2.2956897"],
};
const eiffelCenter = { lat: 48.8582602, lng: 2.2945006 };

function overtureRun(rows: Record<string, unknown>[] = [{ name: "Paris", subtype: "locality", lng: 2.35, lat: 48.85 }]) {
  return vi.fn<RunQuery>(async () => rows as never);
}

const getRelease = async () => "2026-10-21.0";

describe("geocode", () => {
  it("uses Nominatim when it answers, without touching Overture", async () => {
    const run = overtureRun();
    const result = await geocode({ place: "Eiffel Tower" }, { fetch: fakeFetch([eiffel]), run, getRelease, schedule: immediately });
    expect(result?.source).toBe("nominatim");
    expect(run).not.toHaveBeenCalled();
  });

  it("grows a landmark's tiny area to the minimum search radius", async () => {
    const result = await geocode({ place: "Eiffel Tower" }, { fetch: fakeFetch([eiffel]), schedule: immediately });
    expect(result?.area).toEqual(bboxAround(eiffelCenter, MIN_SEARCH_RADIUS_METERS));
  });

  it("cuts a huge area down to the maximum search radius", async () => {
    const france = { lat: "46.6", lon: "1.88", name: "France", boundingbox: ["41.3", "51.1", "-5.2", "9.6"] };
    const result = await geocode({ place: "France" }, { fetch: fakeFetch([france]), schedule: immediately });
    expect(result?.area).toEqual(bboxAround({ lat: 46.6, lng: 1.88 }, MAX_SEARCH_RADIUS_METERS));
  });

  it("falls back to Overture divisions when Nominatim fails", async () => {
    const run = overtureRun();
    const result = await geocode({ place: "Paris" }, { fetch: failingFetch(), run, getRelease, schedule: immediately });
    expect(result?.source).toBe("overture");
    expect(result?.name).toBe("Paris");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not fall back when Nominatim simply finds nothing", async () => {
    const run = overtureRun();
    const result = await geocode({ place: "Nowhereville" }, { fetch: fakeFetch([]), run, getRelease, schedule: immediately });
    expect(result).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("returns null when only the fallback was used and it found nothing", async () => {
    const result = await geocode(
      { place: "Nowhereville" },
      { fetch: failingFetch(), run: overtureRun([]), getRelease, schedule: immediately },
    );
    expect(result).toBeNull();
  });

  it("reports both errors when Nominatim and Overture both fail", async () => {
    const run = vi.fn<RunQuery>(async () => {
      throw new Error("S3 unreachable");
    });
    const error = await geocode({ place: "Paris" }, { fetch: failingFetch("DNS failure"), run, getRelease, schedule: immediately }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map((e: Error) => e.message)).toEqual(["DNS failure", "S3 unreachable"]);
  });
});
