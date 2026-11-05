import { createThrottle, type Schedule } from "../throttle.js";
import type { LatLng } from "../types.js";
import { USER_AGENT } from "../user-agent.js";

export const VALHALLA_URL = "https://valhalla1.openstreetmap.de/sources_to_targets";

/** FOSSGIS usage policy: at most 1 request per second, for all travel modes together. */
const valhallaThrottle = createThrottle(1_000);

export type TravelMode = "walking" | "driving" | "cycling";

const COSTING: Record<TravelMode, string> = {
  walking: "pedestrian",
  driving: "auto",
  cycling: "bicycle",
};

type MatrixCell = { time?: unknown } | null;

/**
 * Travel time in minutes from `origin` to each destination, in the same order.
 * null for a destination that cannot be reached with this mode.
 * Throws when the service fails, so the caller decides what to do.
 */
export async function travelMinutes(
  origin: LatLng,
  destinations: LatLng[],
  mode: TravelMode,
  fetchFn: typeof fetch = fetch,
  schedule: Schedule = valhallaThrottle,
): Promise<(number | null)[]> {
  if (destinations.length === 0) return [];

  const body = {
    sources: [{ lat: origin.lat, lon: origin.lng }],
    targets: destinations.map((d) => ({ lat: d.lat, lon: d.lng })),
    costing: COSTING[mode],
  };

  const response = await schedule(() =>
    fetchFn(VALHALLA_URL, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    }),
  );
  if (!response.ok) throw new Error(`Valhalla returned HTTP ${response.status}`);

  const json = (await response.json()) as { sources_to_targets?: unknown } | null;
  const row = Array.isArray(json?.sources_to_targets) ? (json.sources_to_targets[0] as unknown) : undefined;
  if (!Array.isArray(row) || row.length !== destinations.length) {
    throw new Error("Valhalla returned an unexpected response");
  }

  return row.map((cell: MatrixCell) => toMinutes(cell?.time));
}

/** Seconds -> whole minutes. A trip that takes any time at all is at least 1 minute. */
export function toMinutes(seconds: unknown): number | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds === 0) return 0;
  return Math.max(1, Math.round(seconds / 60));
}
