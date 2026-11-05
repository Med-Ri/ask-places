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

const SYSTEM = `You extract a place search from a user's question in ANY language (English, French, Arabic, Darija, Tunisian Arabic in Latin or Arabic script, Spanish, etc.).
Return JSON that matches the schema.

Rules:
- Understand intent and context, not only keywords. Examples:
  - "أنا مسلم و أريد أن أصلي" / "I am Muslim and want to pray" / "مسجد" / "جامع" → muslim_place_of_worship ONLY (never church, never bare place_of_worship).
  - Christian prayer / "église" / "church" → christian_place_of_worship, roman_catholic_place_of_worship (not mosque).
  - "I need coffee" / "un café" / "قهوة" → cafe, coffee_shop.
  - "banc" / "banque" / "bank" (Maghreb French: banc = bank, not a park bench) → bank_or_credit_union, bank.
  - "magasin" / "magsain" / "store" / "shop" → shopping, supermarket, convenience_store as fits.
  - "docteur" / "doctor" / "طبيب" → doctors_office, clinic.
  - "bureau" / "office" → office, professional_service.
- Fix obvious typos and misspellings before mapping (farmasie/farmacie → pharmacy, resturant → restaurant, coffe → cafe, pharmacie → pharmacy, mosquee → mosque).
- "what": short label for the kind of place in the user's language (corrected spelling ok), or "" if none.
- "where": city, neighbourhood, landmark, or address to search. Use "" when the user only means "near me" / their GPS / a radius around themselves, or when no place name appears. Never put radius words, "near me", or the place type into "where".
- "countryCode": ISO 3166-1 alpha-2 uppercase when you can infer it from "where" or clear context, otherwise null. Never invent a country.
- "categories": 1 to 5 Overture Places category ids for "what". Prefer ids from this list when they fit: ${COMMON_CATEGORIES.join(", ")}. You may use other valid Overture snake_case ids if needed. Match specificity (restaurants ≠ cafes). Use [] only when there is truly no place type.
- "limit": positive integer when the user asks for a count of places, otherwise null. Cap at ${MAX_RESULTS}.
- "radiusMeters": meters when the user asks for a radius / "within X" / "dans un rayon de X" / "في نطاق" (accept typos like "raduis"). Convert km → meters, miles → meters (1 mile → 1609). Otherwise null. Cap at ${MAX_RADIUS_METERS}.
- Do not invent place names. Only interpret what to search for.`;

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
