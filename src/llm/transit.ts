import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import type { EstimatedDuration, Place } from "../types.js";
import { usageErrorFromLlm } from "./errors.js";
import { llmAbortSignal } from "./timeout.js";

const schema = z.object({
  minutes: z.array(z.number().int().nonnegative()),
});

const SYSTEM = `You estimate public-transit travel time in minutes from an origin to each place.
Return JSON { "minutes": number[] } with exactly one integer per place, in the same order.
Use walking and driving minutes when given; otherwise use the approximate distance in metres.
Typical city transit is slower than driving and faster than walking for the same trip.
If a place looks unreachable by transit, still give a best-effort estimate.
Do not invent place names. Only estimate times.`;

/**
 * Asks the LLM for a transit-time estimate for each place.
 * On failure (including a bad API key on this second call), returns the places unchanged
 * with transit still null: travel times are extra information, not required for the answer.
 */
export async function addTransitEstimates(
  places: Place[],
  model: LanguageModel,
  provider: string,
): Promise<Place[]> {
  if (places.length === 0) return [];

  const prompt = places
    .map((place, i) => {
      const t = place.travelTime;
      const parts = [
        `${i + 1}. ${place.name}`,
        t.walking !== null ? `walk ${t.walking} min` : null,
        t.driving !== null ? `drive ${t.driving} min` : null,
        t.cycling !== null ? `bike ${t.cycling} min` : null,
      ].filter(Boolean);
      return parts.join(" | ");
    })
    .join("\n");

  try {
    const { output } = await generateText({
      model,
      temperature: 0,
      maxRetries: 1,
      abortSignal: llmAbortSignal(),
      system: SYSTEM,
      prompt: `Estimate public-transit minutes for each place:\n${prompt}`,
      output: Output.object({ schema, name: "transit_times", description: "Transit minutes per place, same order" }),
    });
    if (!output || output.minutes.length !== places.length) return places;

    return places.map((place, i) => {
      const value = output.minutes[i];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return place;
      const transit: EstimatedDuration = { minutes: Math.max(0, Math.round(value)), estimated: true };
      return { ...place, travelTime: { ...place.travelTime, transit } };
    });
  } catch (error) {
    // A bad key on the second call is still a developer mistake; surface it.
    const usage = usageErrorFromLlm(error, provider);
    if (usage) throw usage;
    return places;
  }
}
