import { BadRequestException, Body, Controller, InternalServerErrorException, Post } from "@nestjs/common";
import { AskPlacesError, SUPPORTED_PROVIDERS, askPlaces, type Provider } from "askplaces";

type AskBody = {
  question?: unknown;
  origin?: { lat?: unknown; lng?: unknown };
  radiusMeters?: unknown;
};

@Controller()
export class PlacesController {
  @Post("places")
  async ask(@Body() body: AskBody) {
    try {
      const model = process.env.LLM_MODEL?.trim();
      const origin = readOrigin(body.origin);
      const result = await askPlaces(body.question as string, {
        provider: readProvider(),
        apiKey: readApiKey(),
        ...(model ? { model } : {}),
        ...(origin ? { origin } : {}),
        ...(typeof body.radiusMeters === "number" ? { radiusMeters: body.radiusMeters } : {}),
      });
      return { ...result, attribution: "© OpenStreetMap contributors" };
    } catch (error) {
      if (error instanceof AskPlacesError && error.name === "AskPlacesUsageError") {
        throw new BadRequestException({ code: error.code, message: error.message });
      }
      if (error instanceof AskPlacesError) {
        console.error(error.cause);
        throw new InternalServerErrorException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }
}

function readProvider(): Provider {
  const provider = process.env.LLM_PROVIDER ?? "groq";
  if ((SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) return provider as Provider;
  throw new InternalServerErrorException(`LLM_PROVIDER must be one of: ${SUPPORTED_PROVIDERS.join(", ")}.`);
}

function readApiKey(): string {
  const provider = process.env.LLM_PROVIDER ?? "groq";
  const specific: Record<string, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY,
    xai: process.env.XAI_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    groq: process.env.GROQ_API_KEY,
  };
  const apiKey = process.env.LLM_API_KEY || specific[provider];
  if (!apiKey) throw new InternalServerErrorException("Set GROQ_API_KEY or LLM_API_KEY in .env. Do not send the key from the app.");
  return apiKey;
}

/** The page sends only the question. A caller may still pass origin; otherwise ORIGIN in .env is used. */
function readOrigin(value: AskBody["origin"]): { lat: number; lng: number } | undefined {
  if (value && typeof value.lat === "number" && typeof value.lng === "number") {
    return { lat: value.lat, lng: value.lng };
  }
  const parts = (process.env.ORIGIN ?? "").split(",");
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}
