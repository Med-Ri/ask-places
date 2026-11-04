import { describe, expect, it } from "vitest";
import { bboxAround, bboxCenter, expandToAtLeast, shrinkToAtMost } from "../src/geo.js";

const tunis = { lat: 36.8, lng: 10.18 };

describe("bboxAround", () => {
  it("is about 1 km on each side of the center for 1000 m", () => {
    const box = bboxAround(tunis, 1_000);
    expect(box.north - tunis.lat).toBeCloseTo(0.00898, 4);
    // Longitude degrees are shorter away from the equator, so the box is wider in degrees.
    expect(box.east - tunis.lng).toBeGreaterThan(box.north - tunis.lat);
    expect(bboxCenter(box).lat).toBeCloseTo(tunis.lat, 10);
    expect(bboxCenter(box).lng).toBeCloseTo(tunis.lng, 10);
  });

  it("stays within valid coordinates", () => {
    const box = bboxAround({ lat: 89.99, lng: 179.99 }, 50_000);
    expect(box.north).toBeLessThanOrEqual(90);
    expect(box.east).toBeLessThanOrEqual(180);
  });
});

describe("expandToAtLeast / shrinkToAtMost", () => {
  it("grows a tiny landmark box to the minimum radius", () => {
    const tiny = { west: tunis.lng, south: tunis.lat, east: tunis.lng, north: tunis.lat };
    expect(expandToAtLeast(tiny, tunis, 1_000)).toEqual(bboxAround(tunis, 1_000));
  });

  it("keeps a box that is already big enough", () => {
    const big = bboxAround(tunis, 5_000);
    expect(expandToAtLeast(big, tunis, 1_000)).toEqual(big);
  });

  it("cuts a country-sized box down to the maximum radius", () => {
    const country = { west: 7.5, south: 30.2, east: 11.6, north: 37.5 };
    expect(shrinkToAtMost(country, tunis, 25_000)).toEqual(bboxAround(tunis, 25_000));
  });
});
