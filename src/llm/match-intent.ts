import type { Place } from "../types.js";

const MUSLIM = /muslim|mosque|mosqu[eé]|جامع|مسجد|islamic|islam/i;
const CHRISTIAN = /christian|catholic|église|eglise|church|paroisse/i;

/**
 * When the search is for mosques, drop churches / unrelated religious_organization rows
 * that Overture's broad tags would otherwise include.
 */
export function filterPlacesToIntent(places: Place[], categories: string[]): Place[] {
  const muslim = categories.includes("muslim_place_of_worship");
  const christian =
    categories.includes("christian_place_of_worship") || categories.includes("roman_catholic_place_of_worship");

  if (muslim && !christian) {
    return places.filter((place) => MUSLIM.test(placeText(place)) && !CHRISTIAN.test(placeText(place)));
  }
  if (christian && !muslim) {
    return places.filter((place) => CHRISTIAN.test(placeText(place)));
  }
  return places;
}

function placeText(place: Place): string {
  return `${place.name} ${place.description ?? ""}`;
}
