/**
 * LLM providers askplaces can talk to:
 * OpenAI (GPT), Anthropic (Claude), Google (Gemini), xAI (Grok), DeepSeek, Groq.
 */
export const SUPPORTED_PROVIDERS = ["openai", "anthropic", "google", "xai", "deepseek", "groq"] as const;

export type Provider = (typeof SUPPORTED_PROVIDERS)[number];

export type LatLng = {
  lat: number;
  lng: number;
};

export type AskPlacesOptions = {
  /** Which LLM provider to use, e.g. "openai". */
  provider: Provider;
  /** The developer's own API key for that provider. Keep it on the server. */
  apiKey: string;
  /** Model id for that provider. When omitted, a default is used (see DEFAULT_MODELS). */
  model?: string;
  /** Where travel times are measured from (e.g. the user's GPS position). Defaults to the location named in the question. */
  origin?: LatLng;
  /**
   * Max straight-line distance in meters from the search center (origin, or the place named in the question).
   * Overrides any radius mentioned in the question. Example: 500 for "within 500m".
   */
  radiusMeters?: number;
};

export type PlaceStatus = {
  state: "open" | "closed" | "unknown";
  /** Next opening time (ISO 8601, local time) when the place is closed, otherwise null. */
  opensAt: string | null;
};

/** An estimate made by the LLM, not a route calculation. */
export type EstimatedDuration = {
  minutes: number;
  estimated: true;
};

/** Travel times in minutes. null when they could not be calculated. */
export type TravelTime = {
  walking: number | null;
  driving: number | null;
  cycling: number | null;
  transit: EstimatedDuration | null;
};

export type Place = {
  name: string;
  rating: number | null;
  description: string | null;
  phoneNumber: string | null;
  website: string | null;
  address: string | null;
  location: LatLng;
  status: PlaceStatus;
  travelTime: TravelTime;
};
