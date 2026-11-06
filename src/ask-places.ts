import { AskPlacesInternalError } from "./errors.js";
import { distanceMeters } from "./geo.js";
import { expandCategories } from "./llm/expand-categories.js";
import { filterPlacesToIntent } from "./llm/match-intent.js";
import { createModel } from "./llm/models.js";
import { MAX_RADIUS_METERS, understandQuestion, type UnderstoodQuestion } from "./llm/understand.js";
import { MAX_RESULTS } from "./limits.js";
import { geocodePlace } from "./osm/nominatim.js";
import { searchOsmPlaces, type OsmPlaceSearch } from "./osm/overpass.js";
import { addOsmTravelTimes } from "./osm/valhalla.js";
import { parseRadiusFromQuestion } from "./parse-radius.js";
import type { AskPlacesOptions, LatLng, Place } from "./types.js";
import { validateInput } from "./validate.js";

/** Default search radius when neither the question nor options set one (1.5 km). */
export const DEFAULT_SEARCH_RADIUS_METERS = 1_500;

export type AskPlacesDeps = {
  understand?: (question: string, model: ReturnType<typeof createModel>, provider: string) => Promise<UnderstoodQuestion>;
  createModel?: typeof createModel;
  geocode?: (place: string, countryCode: string | undefined) => Promise<LatLng | null>;
  searchPlaces?: (search: OsmPlaceSearch) => Promise<Place[]>;
  addTravelTimes?: (places: Place[], origin: LatLng) => Promise<Place[]>;
};

/**
 * Ask a question about places in plain language and get a JSON array of places back.
 * The LLM understands the question. OpenStreetMap supplies the places, the straight-line
 * radius, and the street distance and travel time. Returns [] when nothing is found.
 */
export async function askPlaces(question: string, options: AskPlacesOptions, deps: AskPlacesDeps = {}): Promise<Place[]> {
  const { question: q, options: opts } = validateInput(question, options);

  try {
    return await run(q, opts, deps);
  } catch (error) {
    if (error instanceof Error && error.name === "AskPlacesUsageError") throw error;
    throw new AskPlacesInternalError(error);
  }
}

async function run(question: string, options: AskPlacesOptions, deps: AskPlacesDeps): Promise<Place[]> {
  const understand = deps.understand ?? understandQuestion;
  const makeModel = deps.createModel ?? createModel;
  const doGeocode = deps.geocode ?? geocodePlace;
  const doSearch = deps.searchPlaces ?? searchOsmPlaces;
  const doTravel = deps.addTravelTimes ?? addOsmTravelTimes;

  const model = makeModel(options.provider, options.apiKey, options.model);
  const intent = await understand(question, model, options.provider);
  const includedTypes = expandCategories(intent.includedTypes, question);
  const limit = intent.limit ?? MAX_RESULTS;
  const explicitRadius = hasExplicitRadius(question, options, intent);
  let radiusMeters = resolveRadiusMeters(question, options, intent);

  const center = await resolveCenter(intent, options.origin, doGeocode);
  if (!center) return [];
  const searchCenter = center;

  const origin = options.origin ?? searchCenter;
  let nearby = await searchNearby(radiusMeters);
  // No radius in the question: start at 1.5 km and widen until there are 20 places, or 25 km.
  if (!explicitRadius) {
    while (nearby.length < limit && radiusMeters < MAX_RADIUS_METERS) {
      const next = Math.min(radiusMeters * 2, MAX_RADIUS_METERS);
      if (next === radiusMeters) break;
      radiusMeters = next;
      nearby = await searchNearby(radiusMeters);
    }
  }
  if (nearby.length === 0) return [];

  return doTravel(nearby, origin);

  async function searchNearby(radius: number): Promise<Place[]> {
    const found = await doSearch({
      center: searchCenter,
      radiusMeters: radius,
      includedTypes,
      textQuery: intent.what || question,
      limit,
    });
    return filterPlacesToIntent(found, includedTypes)
      .map((place) => ({ ...place, distanceMeters: Math.round(distanceMeters(origin, place.location)) }))
      .filter((place) => distanceMeters(searchCenter, place.location) <= radius)
      .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
      .slice(0, limit);
  }
}

/** options.radiusMeters > LLM > text parse (e.g. "within 500m") > 1.5 km default. */
export function resolveRadiusMeters(
  question: string,
  options: Pick<AskPlacesOptions, "radiusMeters">,
  intent: Pick<UnderstoodQuestion, "radiusMeters">,
): number {
  return options.radiusMeters ?? intent.radiusMeters ?? parseRadiusFromQuestion(question) ?? DEFAULT_SEARCH_RADIUS_METERS;
}

function hasExplicitRadius(
  question: string,
  options: Pick<AskPlacesOptions, "radiusMeters">,
  intent: Pick<UnderstoodQuestion, "radiusMeters">,
): boolean {
  return options.radiusMeters != null || intent.radiusMeters != null || parseRadiusFromQuestion(question) != null;
}

async function resolveCenter(
  intent: UnderstoodQuestion,
  origin: LatLng | undefined,
  doGeocode: (place: string, countryCode: string | undefined) => Promise<LatLng | null>,
): Promise<LatLng | null> {
  if (intent.where !== "") return doGeocode(intent.where, intent.countryCode ?? undefined);
  return origin ?? null;
}
