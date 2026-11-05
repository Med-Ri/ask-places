import { describe, expect, it, vi } from "vitest";
import { addTravelTimes, travelOrigin } from "../src/routing/travel-times.js";
import type { Place } from "../src/types.js";
import { immediately } from "./helpers.js";

const origin = { lat: 36.8455, lng: 10.2709 };

function place(name: string, lat: number, lng: number): Place {
  return {
    name,
    rating: null,
    description: null,
    phoneNumber: null,
    website: null,
    address: null,
    location: { lat, lng },
    status: { state: "unknown", opensAt: null },
    travelTime: { walking: null, driving: null, cycling: null, transit: null },
  };
}

const places = [place("A", 36.8432, 10.2712), place("B", 36.841, 10.2645)];

/** Fake Valhalla: answers each mode with its own seconds, or fails for the modes in `failing`. */
function fakeValhalla(seconds: Record<string, number[]>, failing: string[] = []) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const costing = JSON.parse(String(init?.body)).costing as string;
    if (failing.includes(costing)) return new Response("busy", { status: 503 });
    const row = (seconds[costing] ?? []).map((time) => ({ time }));
    return new Response(JSON.stringify({ sources_to_targets: [row] }), { status: 200 });
  });
}

const allModes = { pedestrian: [300, 600], auto: [120, 180], bicycle: [120, 240] };

describe("addTravelTimes", () => {
  it("fills walking, driving and cycling for each place", async () => {
    const result = await addTravelTimes(places, origin, { fetch: fakeValhalla(allModes), schedule: immediately });
    expect(result.map((p) => p.travelTime)).toEqual([
      { walking: 5, driving: 2, cycling: 2, transit: null },
      { walking: 10, driving: 3, cycling: 4, transit: null },
    ]);
  });

  it("makes exactly one request per mode, whatever the number of places", async () => {
    const fetchFn = fakeValhalla(allModes);
    await addTravelTimes(places, origin, { fetch: fetchFn, schedule: immediately });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("leaves only the failing mode as null", async () => {
    const result = await addTravelTimes(places, origin, {
      fetch: fakeValhalla(allModes, ["bicycle"]),
      schedule: immediately,
    });
    expect(result[0]?.travelTime).toEqual({ walking: 5, driving: 2, cycling: null, transit: null });
  });

  it("keeps all modes null when the service is down, without throwing", async () => {
    const down = vi.fn(async (): Promise<Response> => {
      throw new TypeError("network down");
    });
    const result = await addTravelTimes(places, origin, { fetch: down, schedule: immediately });
    expect(result.map((p) => p.travelTime)).toEqual([places[0]!.travelTime, places[1]!.travelTime]);
  });

  it("keeps the transit estimate and the other fields untouched", async () => {
    const withTransit = { ...places[0]!, travelTime: { ...places[0]!.travelTime, transit: { minutes: 12, estimated: true as const } } };
    const [result] = await addTravelTimes([withTransit], origin, {
      fetch: fakeValhalla({ pedestrian: [300], auto: [120], bicycle: [120] }),
      schedule: immediately,
    });
    expect(result?.travelTime.transit).toEqual({ minutes: 12, estimated: true });
    expect(result?.name).toBe("A");
  });

  it("does not modify the places it receives", async () => {
    await addTravelTimes(places, origin, { fetch: fakeValhalla(allModes), schedule: immediately });
    expect(places[0]?.travelTime.walking).toBeNull();
  });

  it("returns [] without calling the service when there are no places", async () => {
    const fetchFn = fakeValhalla(allModes);
    expect(await addTravelTimes([], origin, { fetch: fetchFn, schedule: immediately })).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("travelOrigin", () => {
  it("prefers the developer's origin", () => {
    expect(travelOrigin({ lat: 1, lng: 2 }, origin)).toEqual({ lat: 1, lng: 2 });
  });

  it("falls back to the location named in the question", () => {
    expect(travelOrigin(undefined, origin)).toEqual(origin);
  });
});
