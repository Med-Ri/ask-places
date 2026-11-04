import { expandToAtLeast, shrinkToAtMost } from "../geo.js";
import { runQuery, type RunQuery } from "../overture/duckdb.js";
import { getLatestRelease } from "../overture/release.js";
import type { Schedule } from "../throttle.js";
import { geocodeWithNominatim } from "./nominatim.js";
import { geocodeWithOverture } from "./overture-divisions.js";
import type { GeocodeQuery, GeocodeResult } from "./types.js";

/** Search at least this far around a geocoded point, so "cafés near the Eiffel Tower" finds cafés. */
export const MIN_SEARCH_RADIUS_METERS = 1_000;

/** Never search further than this from the center: bigger areas are slow and rarely what was asked. */
export const MAX_SEARCH_RADIUS_METERS = 25_000;

export type GeocodeDeps = {
  fetch?: typeof fetch;
  run?: RunQuery;
  getRelease?: () => Promise<string>;
  /** Replaces the 1 request/second Nominatim throttle (tests only). */
  schedule?: Schedule;
};

/**
 * Turns a place name into a search area.
 * Nominatim first (fast, understands streets and landmarks). Overture divisions only if Nominatim
 * fails, not if it simply finds nothing: then Overture would very likely find nothing either.
 */
export async function geocode(query: GeocodeQuery, deps: GeocodeDeps = {}): Promise<GeocodeResult | null> {
  const fetchFn = deps.fetch ?? fetch;
  let result: GeocodeResult | null;

  try {
    result = await geocodeWithNominatim(query, fetchFn, deps.schedule);
  } catch (nominatimError) {
    try {
      const release = await (deps.getRelease ?? (() => getLatestRelease(fetchFn)))();
      result = await geocodeWithOverture(deps.run ?? runQuery, release, query);
    } catch (overtureError) {
      throw new AggregateError([nominatimError, overtureError], "Geocoding failed with Nominatim and Overture");
    }
  }

  if (!result) return null;
  const { area, center } = result;
  const sized = shrinkToAtMost(expandToAtLeast(area, center, MIN_SEARCH_RADIUS_METERS), center, MAX_SEARCH_RADIUS_METERS);
  return { ...result, area: sized };
}
