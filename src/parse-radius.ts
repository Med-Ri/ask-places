import { MAX_RADIUS_METERS, MIN_RADIUS_METERS } from "./llm/understand.js";

/**
 * Reads a search radius from the question text when the LLM misses it.
 * Examples: "within 500m", "in a raduis of 1 km", "restaurants 0.5km around me".
 */
export function parseRadiusFromQuestion(question: string): number | null {
  const text = question.toLowerCase();

  const withUnit =
    text.match(/\b(\d+(?:[.,]\d+)?)\s*(km|kilometers?|kilometres?|mi|miles?|m|meters?|metres?)\b/) ??
    text.match(/\b(?:within|radius|raduis|rayon)\s+(?:of\s+)?(\d+(?:[.,]\d+)?)\s*(km|kilometers?|kilometres?|mi|miles?|m|meters?|metres?)?\b/);

  if (!withUnit) return null;

  const amount = Number(withUnit[1]!.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const unit = (withUnit[2] ?? "m").toLowerCase();
  let meters: number;
  if (unit.startsWith("km") || unit.startsWith("kilometr")) {
    meters = amount * 1_000;
  } else if (unit.startsWith("mi")) {
    meters = amount * 1_609.344;
  } else {
    meters = amount;
  }

  const rounded = Math.round(meters);
  if (rounded < MIN_RADIUS_METERS) return MIN_RADIUS_METERS;
  if (rounded > MAX_RADIUS_METERS) return MAX_RADIUS_METERS;
  return rounded;
}
