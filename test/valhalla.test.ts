import { describe, expect, it } from "vitest";
import { toMinutes, travelMinutes, VALHALLA_URL } from "../src/routing/valhalla.js";
import { USER_AGENT } from "../src/user-agent.js";
import { fakeFetch, immediately } from "./helpers.js";

const origin = { lat: 36.8455, lng: 10.2709 };
const destinations = [
  { lat: 36.8432, lng: 10.2712 },
  { lat: 36.841, lng: 10.2645 },
];

const matrix = (times: (number | null)[]) => ({
  sources_to_targets: [times.map((time) => (time === null ? { time: null, distance: null } : { time, distance: 1 }))],
});

describe("travelMinutes", () => {
  it("returns minutes per destination, in order", async () => {
    const result = await travelMinutes(origin, destinations, "walking", fakeFetch(matrix([280, 623])), immediately);
    expect(result).toEqual([5, 10]);
  });

  it("sends one POST with the origin, the destinations and the mode", async () => {
    const fetchFn = fakeFetch(matrix([280, 623]));
    await travelMinutes(origin, destinations, "cycling", fetchFn, immediately);

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(VALHALLA_URL);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
    expect(JSON.parse(String(init?.body))).toEqual({
      sources: [{ lat: 36.8455, lon: 10.2709 }],
      targets: [
        { lat: 36.8432, lon: 10.2712 },
        { lat: 36.841, lon: 10.2645 },
      ],
      costing: "bicycle",
    });
  });

  it.each([
    ["walking", "pedestrian"],
    ["driving", "auto"],
    ["cycling", "bicycle"],
  ] as const)("uses the Valhalla '%s' costing for %s", async (mode, costing) => {
    const fetchFn = fakeFetch(matrix([1, 1]));
    await travelMinutes(origin, destinations, mode, fetchFn, immediately);
    expect(JSON.parse(String(fetchFn.mock.calls[0]![1]?.body)).costing).toBe(costing);
  });

  it("returns null for a destination that cannot be reached", async () => {
    expect(await travelMinutes(origin, destinations, "driving", fakeFetch(matrix([120, null])), immediately)).toEqual([
      2,
      null,
    ]);
  });

  it("does not call the service without destinations", async () => {
    const fetchFn = fakeFetch(matrix([]));
    expect(await travelMinutes(origin, [], "walking", fetchFn, immediately)).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("throws on an HTTP error", async () => {
    await expect(travelMinutes(origin, destinations, "walking", fakeFetch({}, 429), immediately)).rejects.toThrow(
      "HTTP 429",
    );
  });

  it.each([
    ["no matrix", {}],
    ["a matrix of the wrong size", matrix([1])],
  ])("throws on a response with %s", async (_label, body) => {
    await expect(travelMinutes(origin, destinations, "walking", fakeFetch(body), immediately)).rejects.toThrow(
      "unexpected response",
    );
  });
});

describe("toMinutes", () => {
  it.each([
    [0, 0],
    [10, 1],
    [89, 1],
    [90, 2],
    [3600, 60],
  ])("%s seconds -> %s minutes", (seconds, minutes) => {
    expect(toMinutes(seconds)).toBe(minutes);
  });

  it.each([null, undefined, -5, Number.NaN, "60"])("returns null for %s", (value) => {
    expect(toMinutes(value)).toBeNull();
  });
});
