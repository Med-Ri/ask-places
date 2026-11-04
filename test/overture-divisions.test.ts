import { describe, expect, it, vi } from "vitest";
import { bboxAround } from "../src/geo.js";
import { geocodeWithOverture } from "../src/geocode/overture-divisions.js";
import type { RunQuery } from "../src/overture/duckdb.js";

const montmartre = { name: "Montmartre", subtype: "neighborhood", lng: 2.3431, lat: 48.8867 };

function fakeRun(rows: Record<string, unknown>[] = [montmartre]) {
  return vi.fn<RunQuery>(async () => rows as never);
}

describe("geocodeWithOverture", () => {
  it("returns the most populated match with an area sized by its kind", async () => {
    const result = await geocodeWithOverture(fakeRun(), "2026-10-21.0", { place: "Montmartre" });
    expect(result).toEqual({
      name: "Montmartre",
      center: { lat: 48.8867, lng: 2.3431 },
      area: bboxAround({ lat: 48.8867, lng: 2.3431 }, 2_000),
      source: "overture",
    });
  });

  it("looks up 'Montmartre' and prefers matches inside 'Paris', both as query parameters", async () => {
    const run = fakeRun();
    await geocodeWithOverture(run, "2026-10-21.0", { place: "Montmartre, Paris" });
    const [sql, params] = run.mock.calls[0]!;
    expect(params).toEqual(["Montmartre", "Paris"]);
    expect(sql).not.toContain("Montmartre");
    expect(sql).not.toContain("Paris");
    expect(sql).toContain("lower(h.name)), lower($2)) DESC");
    expect(sql).toContain("theme=divisions/type=division/*");
    expect(sql).not.toContain("country =");
  });

  it("filters by country when it is known", async () => {
    const run = fakeRun();
    await geocodeWithOverture(run, "2026-10-21.0", { place: "Tunis", countryCode: "tn" });
    const [sql, params] = run.mock.calls[0]!;
    expect(params).toEqual(["Tunis", "TN"]);
    expect(sql).toContain("country = $2");
    expect(sql).not.toContain("hierarchies");
  });

  it("numbers parameters correctly with both a country and a parent area", async () => {
    const run = fakeRun();
    await geocodeWithOverture(run, "2026-10-21.0", { place: "Brooklyn, New York", countryCode: "US" });
    const [sql, params] = run.mock.calls[0]!;
    expect(params).toEqual(["Brooklyn", "US", "New York"]);
    expect(sql).toContain("country = $2");
    expect(sql).toContain("lower($3)) DESC");
  });

  it("uses a default area for unknown kinds of division", async () => {
    const result = await geocodeWithOverture(fakeRun([{ ...montmartre, subtype: "something_new" }]), "2026-10-21.0", {
      place: "x",
    });
    expect(result?.area).toEqual(bboxAround({ lat: 48.8867, lng: 2.3431 }, 5_000));
  });

  it("returns null when nothing matches", async () => {
    expect(await geocodeWithOverture(fakeRun([]), "2026-10-21.0", { place: "Nowhereville" })).toBeNull();
  });

  it("returns null without querying for an empty name", async () => {
    const run = fakeRun();
    expect(await geocodeWithOverture(run, "2026-10-21.0", { place: " , Paris" })).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});
