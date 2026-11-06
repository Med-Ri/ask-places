import type { Place } from "../types.js";

const MUSLIM = /mosque|masjid|جامع|مسجد/i;
const CHRISTIAN = /church|cathedral|église|eglise|paroisse/i;

/**
 * Drops places that do not match a religion-specific search.
 * Nearby Search already filters by type; this is a backup for text search.
 */
export function filterPlacesToIntent(places: Place[], types: string[]): Place[] {
  const mosque = types.includes("mosque");
  const church = types.includes("church");
  if (mosque && !church) {
    return places.filter((place) => !CHRISTIAN.test(placeText(place)));
  }
  if (church && !mosque) {
    return places.filter((place) => !MUSLIM.test(placeText(place)));
  }
  return places;
}

function placeText(place: Place): string {
  return `${place.name} ${place.description ?? ""}`;
}
