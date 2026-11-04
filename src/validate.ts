import { AskPlacesUsageError } from "./errors.js";
import { normalizeQuestion } from "./normalize-question.js";
import { SUPPORTED_PROVIDERS, type AskPlacesOptions, type LatLng, type Provider } from "./types.js";

/** Long questions cost the developer LLM tokens and are almost always a mistake or abuse. */
export const MAX_QUESTION_LENGTH = 500;

export type ValidatedInput = {
  question: string;
  options: AskPlacesOptions;
};

/**
 * Checks everything the developer passes to askplaces and returns a cleaned copy.
 * Throws AskPlacesUsageError with a readable message on the first problem found.
 * The API key is never included in any error message.
 */
export function validateInput(question: unknown, options: unknown): ValidatedInput {
  return {
    question: validateQuestion(question),
    options: validateOptions(options),
  };
}

function validateQuestion(question: unknown): string {
  if (typeof question !== "string") {
    throw new AskPlacesUsageError(
      "INVALID_QUESTION",
      `askplaces: the question must be a string, received ${describe(question)}.`,
    );
  }
  const normalized = normalizeQuestion(question);
  if (normalized === "") {
    throw new AskPlacesUsageError("INVALID_QUESTION", "askplaces: the question is empty.");
  }
  if (normalized.length > MAX_QUESTION_LENGTH) {
    throw new AskPlacesUsageError(
      "INVALID_QUESTION",
      `askplaces: the question is too long (${normalized.length} characters, maximum ${MAX_QUESTION_LENGTH}).`,
    );
  }
  return normalized;
}

function validateOptions(options: unknown): AskPlacesOptions {
  if (!isPlainObject(options)) {
    throw new AskPlacesUsageError(
      "INVALID_OPTIONS",
      'askplaces: options are required, e.g. { provider: "openai", apiKey: process.env.OPENAI_API_KEY }.',
    );
  }

  const provider = validateProvider(options["provider"]);
  const apiKey = validateApiKey(options["apiKey"], provider);
  const origin = options["origin"] === undefined ? undefined : validateOrigin(options["origin"]);

  return origin === undefined ? { provider, apiKey } : { provider, apiKey, origin };
}

function validateProvider(provider: unknown): Provider {
  if (typeof provider === "string" && (SUPPORTED_PROVIDERS as readonly string[]).includes(provider)) {
    return provider as Provider;
  }
  const supported = SUPPORTED_PROVIDERS.map((p) => `"${p}"`).join(", ");
  const received = provider === undefined ? "nothing" : describe(provider);
  throw new AskPlacesUsageError(
    "UNSUPPORTED_PROVIDER",
    `askplaces: unsupported provider, received ${received}. Supported providers: ${supported}.`,
  );
}

function validateApiKey(apiKey: unknown, provider: Provider): string {
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new AskPlacesUsageError(
      "MISSING_API_KEY",
      `askplaces: an API key for "${provider}" is required. Pass it as options.apiKey (for example from an environment variable).`,
    );
  }
  return apiKey.trim();
}

function validateOrigin(origin: unknown): LatLng {
  if (!isPlainObject(origin)) {
    throw new AskPlacesUsageError(
      "INVALID_ORIGIN",
      `askplaces: origin must be an object like { lat: 36.84, lng: 10.27 }, received ${describe(origin)}.`,
    );
  }
  const { lat, lng } = origin;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new AskPlacesUsageError(
      "INVALID_ORIGIN",
      `askplaces: origin.lat must be a number between -90 and 90, received ${describe(lat)}.`,
    );
  }
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new AskPlacesUsageError(
      "INVALID_ORIGIN",
      `askplaces: origin.lng must be a number between -180 and 180, received ${describe(lng)}.`,
    );
  }
  return { lat, lng };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Short, safe description of a value for error messages. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "string") {
    const shown = value.length > 30 ? `${value.slice(0, 30)}…` : value;
    return `"${shown}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `a value of type ${typeof value}`;
}
