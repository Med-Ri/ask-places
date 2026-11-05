import { AskPlacesInternalError } from "./errors.js";
import { bboxAround, distanceMeters } from "./geo.js";
import { geocode } from "./geocode/geocode.js";
import { expandCategories } from "./llm/expand-categories.js";
import { filterPlacesToIntent } from "./llm/match-intent.js";
import { addTransitEstimates } from "./llm/transit.js";
import { createModel } from "./llm/models.js";
import { understandQuestion, type UnderstoodQuestion } from "./llm/understand.js";
import { runQuery } from "./overture/duckdb.js";
import { MAX_RESULTS, searchPlaces } from "./overture/places.js";
import { getLatestRelease } from "./overture/release.js";
import { parseRadiusFromQuestion } from "./parse-radius.js";
import { addTravelTimes, travelOrigin } from "./routing/travel-times.js";
import type { AskPlacesOptions, LatLng, Place } from "./types.js";
import { validateInput } from "./validate.js";

/** Default search radius when neither the question nor options set one (1.5 km). */
export const DEFAULT_SEARCH_RADIUS_METERS = 1_500;

/** @deprecated Use DEFAULT_SEARCH_RADIUS_METERS. */
export const ORIGIN_SEARCH_RADIUS_METERS = DEFAULT_SEARCH_RADIUS_METERS;

export type AskPlacesDeps = {
  understand?: (question: string, model: ReturnType<typeof createModel>, provider: string) => Promise<UnderstoodQuestion>;
  createModel?: typeof createModel;
  geocode?: typeof geocode;
  getRelease?: () => Promise<string>;
  searchPlaces?: typeof searchPlaces;
  runQuery?: typeof runQuery;
  addTravelTimes?: typeof addTravelTimes;
  addTransitEstimates?: typeof addTransitEstimates;
};

/**
 * Ask a question about places in plain language and get a JSON array of places back.
 * Uses the developer's own LLM key. Returns [] when nothing is found.
 */
export async function askPlaces(question: string, options: AskPlacesOptions, deps: AskPlacesDeps = {}): Promise<Place[]> {
  const { question: q, options: opts } = validateInput(question, options);

  try {
    return await run(q, opts, deps);
  } catch (error) {
    // Usage errors (bad key, bad input) must stay visible; everything else is wrapped.
    if (error instanceof Error && error.name === "AskPlacesUsageError") throw error;
    throw new AskPlacesInternalError(error);
  }
}

async function run(question: string, options: AskPlacesOptions, deps: AskPlacesDeps): Promise<Place[]> {
  const understand = deps.understand ?? understandQuestion;
  const makeModel = deps.createModel ?? createModel;
  const doGeocode = deps.geocode ?? geocode;
  const getRelease = deps.getRelease ?? getLatestRelease;
  const doSearch = deps.searchPlaces ?? searchPlaces;
  const runSql = deps.runQuery ?? runQuery;
  const doTravel = deps.addTravelTimes ?? addTravelTimes;
  const doTransit = deps.addTransitEstimates ?? addTransitEstimates;

  const model = makeModel(options.provider, options.apiKey, options.model);
  const intent = await understand(question, model, options.provider);
  const radiusMeters = resolveRadiusMeters(question, options, intent);

  const searchCenter = await resolveSearchArea(intent, options.origin, radiusMeters, doGeocode);
  if (!searchCenter) return [];

  const release = await getRelease();
  const limit = intent.limit ?? MAX_RESULTS;
  const categories = expandCategories(intent.categories, question);
  const found = await doSearch(runSql, {
    release,
    area: searchCenter.area,
    categories,
    limit,
  });

  const origin = travelOrigin(options.origin, searchCenter.center);
  const nearby = filterPlacesToIntent(found, categories)
    .filter((place) => distanceMeters(searchCenter.center, place.location) <= searchCenter.radiusMeters)
    .sort((a, b) => distanceMeters(origin, a.location) - distanceMeters(origin, b.location));
  if (nearby.length === 0) return [];

  const withTravel = await doTravel(nearby, origin);
  return doTransit(withTravel, model, options.provider);
}

/**
 * options.radiusMeters > LLM > text parse (e.g. "within 500m") > 1.5 km default.
 * Always returns a concrete radius so results stay local and comparable.
 */
export function resolveRadiusMeters(
  question: string,
  options: Pick<AskPlacesOptions, "radiusMeters">,
  intent: Pick<UnderstoodQuestion, "radiusMeters">,
): number {
  return options.radiusMeters ?? intent.radiusMeters ?? parseRadiusFromQuestion(question) ?? DEFAULT_SEARCH_RADIUS_METERS;
}

async function resolveSearchArea(
  intent: UnderstoodQuestion,
  origin: LatLng | undefined,
  radiusMeters: number,
  doGeocode: typeof geocode,
): Promise<{ center: LatLng; area: ReturnType<typeof bboxAround>; radiusMeters: number } | null> {
  // Named place in the question (no GPS needed): geocode it, then search within the radius.
  if (intent.where !== "") {
    const located = await doGeocode({ place: intent.where, countryCode: intent.countryCode ?? undefined });
    if (!located) return null;
    return { center: located.center, area: bboxAround(located.center, radiusMeters), radiusMeters };
  }

  // "near me" / no place name: need the developer's GPS origin.
  if (origin) {
    return { center: origin, area: bboxAround(origin, radiusMeters), radiusMeters };
  }
  return null;
}
