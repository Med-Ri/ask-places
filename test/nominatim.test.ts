import { describe, expect, it } from "vitest";
import { geocodeWithNominatim, USER_AGENT } from "../src/geocode/nominatim.js";
import { fakeFetch, immediately } from "./helpers.js";

const lac2 = {
  lat: "36.8455252",
  lon: "10.2708553",
  name: "ضفاف البحيرة 2",
  display_name: "ضفاف البحيرة 2, تونس, Tunisia",
  boundingbox: ["36.8255252", "36.8655252", "10.2508553", "10.2908553"],
};

describe("geocodeWithNominatim", () => {
  it("returns the center and area of the first hit", async () => {
    const result = await geocodeWithNominatim({ place: "Lac 2, Tunis" }, fakeFetch([lac2]), immediately);
    expect(result).toEqual({
      name: "ضفاف البحيرة 2",
      center: { lat: 36.8455252, lng: 10.2708553 },
      area: { south: 36.8255252, north: 36.8655252, west: 10.2508553, east: 10.2908553 },
      source: "nominatim",
    });
  });

  it("sends the query, the country and an identifying User-Agent", async () => {
    const fetchFn = fakeFetch([lac2]);
    await geocodeWithNominatim({ place: "Lac 2, Tunis", countryCode: "TN" }, fetchFn, immediately);

    const [url, init] = fetchFn.mock.calls[0]!;
    const params = new URL(String(url)).searchParams;
    expect(params.get("q")).toBe("Lac 2, Tunis");
    expect(params.get("countrycodes")).toBe("tn");
    expect(params.get("limit")).toBe("1");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
  });

  it("returns null when nothing matches", async () => {
    expect(await geocodeWithNominatim({ place: "Nowhereville" }, fakeFetch([]), immediately)).toBeNull();
  });

  it("uses the point itself when there is no bounding box", async () => {
    const result = await geocodeWithNominatim(
      { place: "x" },
      fakeFetch([{ ...lac2, boundingbox: undefined }]),
      immediately,
    );
    expect(result?.area).toEqual({ south: 36.8455252, north: 36.8455252, west: 10.2708553, east: 10.2708553 });
  });

  it.each([429, 503])("throws on HTTP %s so the caller can fall back", async (status) => {
    await expect(geocodeWithNominatim({ place: "x" }, fakeFetch([], status), immediately)).rejects.toThrow(
      `HTTP ${status}`,
    );
  });

  it("throws on a response that is not a list", async () => {
    await expect(geocodeWithNominatim({ place: "x" }, fakeFetch({ error: "?" }), immediately)).rejects.toThrow(
      "unexpected response",
    );
  });

  it("throws on a hit without coordinates", async () => {
    await expect(
      geocodeWithNominatim({ place: "x" }, fakeFetch([{ name: "x" }]), immediately),
    ).rejects.toThrow("without coordinates");
  });
});
