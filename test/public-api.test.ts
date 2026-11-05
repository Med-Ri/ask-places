import { describe, expect, it } from "vitest";
import * as askplaces from "../src/index.js";

describe("public API", () => {
  it("exports exactly the intended runtime values", () => {
    expect(Object.keys(askplaces).sort()).toEqual([
      "AskPlacesError",
      "AskPlacesInternalError",
      "AskPlacesUsageError",
      "DEFAULT_MODELS",
      "MAX_RESULTS",
      "SUPPORTED_PROVIDERS",
      "askPlaces",
    ]);
  });

  it("supports the configured LLM providers", () => {
    expect(askplaces.SUPPORTED_PROVIDERS).toEqual(["openai", "anthropic", "google", "xai", "deepseek", "groq"]);
  });

  it("exposes a default model for each provider and a 20-result cap", () => {
    expect(askplaces.MAX_RESULTS).toBe(20);
    expect(Object.keys(askplaces.DEFAULT_MODELS).sort()).toEqual([...askplaces.SUPPORTED_PROVIDERS].sort());
  });
});
