import { createThrottle } from "../throttle.js";
import type { LatLng } from "../types.js";
import { USER_AGENT } from "../user-agent.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const throttle = createThrottle(1_000);

export type GeocodeDeps = {
  fetch?: typeof fetch;
};

/**
 * Turns a place name into a point with Nominatim (OpenStreetMap).
 * Returns null when nothing matches. At most one request per second.
 */
export async function geocodePlace(
  place: string,
  countryCode: string | undefined,
  deps: GeocodeDeps = {},
): Promise<LatLng | null> {
  const fetchFn = deps.fetch ?? fetch;
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", place);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  if (countryCode) url.searchParams.set("countrycodes", countryCode.toLowerCase());

  const response = await throttle(() =>
    fetchFn(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    }),
  );
  if (!response.ok) throw new Error(`Nominatim returned HTTP ${response.status}`);
  const hits = (await response.json()) as { lat?: string; lon?: string }[];
  const hit = Array.isArray(hits) ? hits[0] : undefined;
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
