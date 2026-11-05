import { AskPlacesInternalError } from "./errors.js";
import { bboxAround } from "./geo.js";
import { geocode } from "./geocode/geocode.js";
import { addTransitEstimates } from "./llm/transit.js";
import { createModel } from "./llm/models.js";
import { understandQuestion, type UnderstoodQuestion } from "./llm/understand.js";
import { runQuery } from "./overture/duckdb.js";
import { MAX_RESULTS, searchPlaces } from "./overture/places.js";
import { getLatestRelease } from "./overture/release.js";
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

  const searchCenter = await resolveSearchArea(intent, options.origin, doGeocode);
  if (!searchCenter) return [];

  const release = await getRelease();
  const limit = intent.limit ?? MAX_RESULTS;
  const found = await doSearch(runSql, {
    release,
    area: searchCenter.area,
    categories: intent.categories,
    limit,
  });
  if (found.length === 0) return [];

  const origin = travelOrigin(options.origin, searchCenter.center);
  const withTravel = await doTravel(found, origin);
  return doTransit(withTravel, model, options.provider);
}

async function resolveSearchArea(
  intent: UnderstoodQuestion,
  origin: LatLng | undefined,
  doGeocode: typeof geocode,
): Promise<{ center: LatLng; area: ReturnType<typeof bboxAround> } | null> {
  if (intent.where !== "") {
    const located = await doGeocode({ place: intent.where, countryCode: intent.countryCode ?? undefined });
    if (!located) return null;
    return { center: located.center, area: located.area };
  }
  // "cafés near me" with GPS: search around the developer's origin.
  if (origin) {
    return { center: origin, area: bboxAround(origin, ORIGIN_SEARCH_RADIUS_METERS) };
  }
  return null;
}
