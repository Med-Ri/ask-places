import { createThrottle, type Schedule } from "../throttle.js";
import { USER_AGENT } from "../user-agent.js";
import type { GeocodeQuery, GeocodeResult } from "./types.js";

export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/** Nominatim's usage policy: at most 1 request per second for the whole application. */
const nominatimThrottle = createThrottle(1_000);

type NominatimHit = {
  lat?: unknown;
  lon?: unknown;
  name?: unknown;
  display_name?: unknown;
  /** [south, north, west, east] as strings. */
  boundingbox?: unknown;
};

/**
 * Looks up a place name with Nominatim (OpenStreetMap).
 * Returns null when nothing matches. Throws when the service fails (down, rate-limited, timeout),
 * so the caller can fall back to another source.
 */
export async function geocodeWithNominatim(
  query: GeocodeQuery,
  fetchFn: typeof fetch = fetch,
  schedule: Schedule = nominatimThrottle,
): Promise<GeocodeResult | null> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query.place);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  if (query.countryCode) url.searchParams.set("countrycodes", query.countryCode.toLowerCase());

  const response = await schedule(() =>
    fetchFn(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    }),
  );
  if (!response.ok) throw new Error(`Nominatim returned HTTP ${response.status}`);

  const hits: unknown = await response.json();
  if (!Array.isArray(hits)) throw new Error("Nominatim returned an unexpected response");
  const hit = hits[0] as NominatimHit | undefined;
  return hit ? toResult(hit) : null;
}

function toResult(hit: NominatimHit): GeocodeResult {
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  const box = Array.isArray(hit.boundingbox) ? hit.boundingbox.map(Number) : [];
  const [south, north, west, east] = box;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Nominatim returned a result without coordinates");
  }

  const hasBox = [south, north, west, east].every((n) => Number.isFinite(n));
  return {
    name: typeof hit.name === "string" && hit.name !== "" ? hit.name : String(hit.display_name ?? ""),
    center: { lat, lng },
    area: hasBox
      ? { south: south!, north: north!, west: west!, east: east! }
      : { south: lat, north: lat, west: lng, east: lng },
    source: "nominatim",
  };
}
