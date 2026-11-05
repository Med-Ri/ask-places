import { AskPlacesInternalError } from "./errors.js";
import { bboxAround, distanceMeters } from "./geo.js";
import { geocode } from "./geocode/geocode.js";
import { expandCategories } from "./llm/expand-categories.js";
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

/** Default search radius when the developer only passes GPS (e.g. "cafés near me"). */
export const ORIGIN_SEARCH_RADIUS_METERS = 2_000;

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
  // BBox search is a square; when a radius applies, keep only places inside the circle.
  const inRadius =
    searchCenter.radiusMeters === null
      ? found
      : found.filter((place) => distanceMeters(searchCenter.center, place.location) <= searchCenter.radiusMeters!);
  if (inRadius.length === 0) return [];

  const origin = travelOrigin(options.origin, searchCenter.center);
  const withTravel = await doTravel(inRadius, origin);
  return doTransit(withTravel, model, options.provider);
}

/** options.radiusMeters > LLM > text parse (e.g. "within 500m"). */
export function resolveRadiusMeters(
  question: string,
  options: Pick<AskPlacesOptions, "radiusMeters">,
  intent: Pick<UnderstoodQuestion, "radiusMeters">,
): number | null {
  return options.radiusMeters ?? intent.radiusMeters ?? parseRadiusFromQuestion(question);
}

async function resolveSearchArea(
  intent: UnderstoodQuestion,
  origin: LatLng | undefined,
  radiusMeters: number | null,
  doGeocode: typeof geocode,
): Promise<{ center: LatLng; area: ReturnType<typeof bboxAround>; radiusMeters: number | null } | null> {
  if (intent.where !== "") {
    const located = await doGeocode({ place: intent.where, countryCode: intent.countryCode ?? undefined });
    if (!located) return null;
    if (radiusMeters !== null) {
      return { center: located.center, area: bboxAround(located.center, radiusMeters), radiusMeters };
    }
    return { center: located.center, area: located.area, radiusMeters: null };
  }

  // "cafés near me" / "within 500m" with GPS: search around the developer's origin.
  if (origin) {
    const meters = radiusMeters ?? ORIGIN_SEARCH_RADIUS_METERS;
    return { center: origin, area: bboxAround(origin, meters), radiusMeters: meters };
  }
  return null;
}
