import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { MAX_RESULTS } from "../overture/places.js";
import { COMMON_CATEGORIES } from "./categories.js";
import { usageErrorFromLlm } from "./errors.js";
import { llmAbortSignal } from "./timeout.js";

/** Smallest / largest search radius we accept from the question (meters). */
export const MIN_RADIUS_METERS = 50;
export const MAX_RADIUS_METERS = 25_000;

export type UnderstoodQuestion = {
  /** What to look for, e.g. "cafés". Empty when the question has no place type. */
  what: string;
  /** Where to look, e.g. "Lac 2, Tunis". Empty when only "near me" / GPS is implied. */
  where: string;
  /** ISO 3166-1 alpha-2 when known, e.g. "TN". Null when unknown. */
  countryCode: string | null;
  /** Overture category ids. Empty = any category. */
  categories: string[];
  /** Max places to return when the user asked for a number, otherwise null. */
  limit: number | null;
  /** Search radius in meters when the user asked for one (e.g. "within 500m"), otherwise null. */
  radiusMeters: number | null;
};

const schema = z.object({
  what: z.string(),
  where: z.string(),
  countryCode: z.string().nullable(),
  categories: z.array(z.string()),
  limit: z.number().int().nullable(),
  radiusMeters: z.number().nullable(),
});

const SYSTEM = `You extract a place search from a user's question.
Return JSON that matches the schema.

Rules:
- "what": the kind of place in the user's language, or "" if none is named.
- "where": the location to search (city, neighbourhood, landmark, address). Use "" when the user only means "near me" / their current position / a radius around themselves. Do not put "radius", distance words, or "near me" into "where".
- "countryCode": ISO 3166-1 alpha-2 uppercase when you can infer it from "where", otherwise null. Never invent a country.
- "categories": 1 to 5 Overture Places category ids that match "what". Match the user's specificity: "restaurant(s)" -> restaurant / *_restaurant (not cafe, coffee_shop, tea_room, bakery); "café(s)" -> cafe, coffee_shop; "bank"/"banque"/"banc" -> bank_or_credit_union and bank (not a park bench). Add a broader parent only when useful. Use [] when the question has no place type.
- Prefer ids from this list when they fit: ${COMMON_CATEGORIES.join(", ")}.
- "limit": a positive integer when the user asks for a number of places (e.g. "3 pharmacies" -> 3), otherwise null. Cap at ${MAX_RESULTS}.
- "radiusMeters": distance in meters when the user asks for a radius / "within X" / "in a radius of X" (accept misspellings like "raduis"). Convert km to meters (0.5 km -> 500). Convert miles to meters (1 mile -> 1609). Otherwise null. Cap at ${MAX_RADIUS_METERS}.
- Do not invent places. Only interpret the question.`;

/**
 * Asks the developer's LLM to turn a free-text question into a structured place search.
 * Throws AskPlacesUsageError for a bad API key / unknown model; other failures bubble up.
 */
export async function understandQuestion(question: string, model: LanguageModel, provider: string): Promise<UnderstoodQuestion> {
  try {
    const { output } = await generateText({
      model,
      temperature: 0,
      maxRetries: 3,
      abortSignal: llmAbortSignal(),
      system: SYSTEM,
      prompt: question,
      output: Output.object({ schema, name: "place_search", description: "Structured place search extracted from the question" }),
    });
    if (!output) throw new Error("LLM returned no structured output for the question");
    return normalize(output);
  } catch (error) {
    throw usageErrorFromLlm(error, provider) ?? error;
  }
}

function normalize(raw: z.infer<typeof schema>): UnderstoodQuestion {
  const country = raw.countryCode?.trim().toUpperCase() ?? null;
  return {
    what: raw.what.trim(),
    where: raw.where.trim(),
    countryCode: country && /^[A-Z]{2}$/.test(country) ? country : null,
    categories: uniqueSnakeCase(raw.categories).slice(0, 5),
    limit: raw.limit === null ? null : Math.min(Math.max(Math.trunc(raw.limit), 1), MAX_RESULTS),
    radiusMeters: normalizeRadius(raw.radiusMeters),
  };
}

function normalizeRadius(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const meters = Math.round(value);
  if (meters < MIN_RADIUS_METERS) return MIN_RADIUS_METERS;
  if (meters > MAX_RADIUS_METERS) return MAX_RADIUS_METERS;
  return meters;
}

/** Keeps only plausible Overture ids (letters, digits, underscores) and drops duplicates. */
function uniqueSnakeCase(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const id = value.trim().toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z][a-z0-9_]{1,60}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}
