import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";
import type { Provider } from "../types.js";

/**
 * Cheap, fast defaults that handle structured JSON well.
 * The developer can override with `options.model`.
 */
export const DEFAULT_MODELS = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-haiku-4-5",
  google: "gemini-3.8-flash",
  xai: "grok-4.20-non-reasoning",
  deepseek: "deepseek-flash",
} as const satisfies Record<Provider, string>;

/** Builds a Vercel AI SDK model from the developer's provider + API key (+ optional model id). */
export function createModel(provider: Provider, apiKey: string, model?: string): LanguageModel {
  const modelId = model ?? DEFAULT_MODELS[provider];
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "google":
      return createGoogle({ apiKey })(modelId);
    case "xai":
      return createXai({ apiKey })(modelId);
    case "deepseek":
      return createDeepSeek({ apiKey })(modelId);
  }
}
