import type { Schedule } from "../throttle.js";
import type { LatLng, Place } from "../types.js";
import { travelMinutes, type TravelMode } from "./valhalla.js";

const MODES: TravelMode[] = ["walking", "driving", "cycling"];

export type TravelTimeDeps = {
  fetch?: typeof fetch;
  /** Replaces the 1 request/second Valhalla throttle (tests only). */
  schedule?: Schedule;
};

/**
 * Where travel times are measured from: the developer's `origin` (e.g. the user's GPS position)
 * when given, otherwise the location named in the question.
 */
export function travelOrigin(origin: LatLng | undefined, searchedLocation: LatLng): LatLng {
  return origin ?? searchedLocation;
}

/**
 * Returns copies of `places` with walking, driving and cycling times filled in.
 * Travel times are extra information: if a mode fails (service down, origin too far away),
 * that mode stays null instead of failing the whole answer. Transit is left as is (LLM, step 5).
 */
export async function addTravelTimes(places: Place[], origin: LatLng, deps: TravelTimeDeps = {}): Promise<Place[]> {
  if (places.length === 0) return [];
  const destinations = places.map((place) => place.location);

  const results = await Promise.allSettled(
    MODES.map((mode) => travelMinutes(origin, destinations, mode, deps.fetch, deps.schedule)),
  );
  const minutes = (mode: TravelMode, index: number): number | null => {
    const result = results[MODES.indexOf(mode)];
    return result?.status === "fulfilled" ? (result.value[index] ?? null) : null;
  };

  return places.map((place, i) => ({
    ...place,
    travelTime: {
      ...place.travelTime,
      walking: minutes("walking", i),
      driving: minutes("driving", i),
      cycling: minutes("cycling", i),
    },
  }));
}
