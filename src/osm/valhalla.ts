import { createThrottle } from "../throttle.js";
import type { LatLng, Place, StreetDistance, TravelTime } from "../types.js";
import { USER_AGENT } from "../user-agent.js";

const VALHALLA_URL = "https://valhalla1.openstreetmap.de/sources_to_targets";
const throttle = createThrottle(1_000);

type Mode = "walking" | "driving" | "cycling";

const COSTING: Record<Mode, string> = {
  walking: "pedestrian",
  driving: "auto",
  cycling: "bicycle",
};

type Cell = { time?: number; distance?: number } | null;

export type ValhallaDeps = {
  fetch?: typeof fetch;
};

/**
 * Fills street distance (meters) and travel time (minutes) from the public Valhalla server,
 * which routes on OpenStreetMap roads. One request per mode. A failed mode stays null.
 * Transit is left null.
 */
export async function addOsmTravelTimes(places: Place[], origin: LatLng, deps: ValhallaDeps = {}): Promise<Place[]> {
  if (places.length === 0) return [];
  const destinations = places.map((place) => place.location);
  const modes: Mode[] = ["walking", "driving", "cycling"];
  const results = await Promise.all(modes.map((mode) => routeMode(origin, destinations, mode, deps.fetch ?? fetch)));

  return places.map((place, index) => {
    const travelTime: TravelTime = { walking: null, driving: null, cycling: null, transit: null };
    const streetDistance: StreetDistance = { walking: null, driving: null, cycling: null };
    modes.forEach((mode, modeIndex) => {
      const leg = results[modeIndex]?.[index];
      travelTime[mode] = leg?.minutes ?? null;
      streetDistance[mode] = leg?.meters ?? null;
    });
    return { ...place, travelTime, streetDistance };
  });
}

async function routeMode(
  origin: LatLng,
  destinations: LatLng[],
  mode: Mode,
  fetchFn: typeof fetch,
): Promise<{ minutes: number | null; meters: number | null }[]> {
  try {
    const response = await throttle(() =>
      fetchFn(VALHALLA_URL, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sources: [{ lat: origin.lat, lon: origin.lng }],
          targets: destinations.map((d) => ({ lat: d.lat, lon: d.lng })),
          costing: COSTING[mode],
          units: "kilometers",
        }),
        signal: AbortSignal.timeout(15_000),
      }),
    );
    if (!response.ok) throw new Error(`Valhalla HTTP ${response.status}`);
    const json = (await response.json()) as { sources_to_targets?: Cell[][] };
    const row = json.sources_to_targets?.[0];
    if (!Array.isArray(row)) throw new Error("Valhalla returned an unexpected response");
    return destinations.map((_, index) => toLeg(row[index]));
  } catch {
    return destinations.map(() => ({ minutes: null, meters: null }));
  }
}

/** Valhalla time is seconds. Distance is kilometers when units=kilometers. */
export function toLeg(cell: Cell | undefined): { minutes: number | null; meters: number | null } {
  const seconds = cell?.time;
  const kilometers = cell?.distance;
  const minutes =
    typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0
      ? seconds === 0
        ? 0
        : Math.max(1, Math.round(seconds / 60))
      : null;
  const meters =
    typeof kilometers === "number" && Number.isFinite(kilometers) && kilometers >= 0
      ? Math.round(kilometers * 1_000)
      : null;
  return { minutes, meters };
}
