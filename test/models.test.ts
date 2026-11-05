import { describe, expect, it } from "vitest";
import { createModel, DEFAULT_MODELS } from "../src/llm/models.js";
import { SUPPORTED_PROVIDERS } from "../src/types.js";

describe("DEFAULT_MODELS", () => {
  it("defines a default for every supported provider", () => {
    expect(Object.keys(DEFAULT_MODELS).sort()).toEqual([...SUPPORTED_PROVIDERS].sort());
    for (const provider of SUPPORTED_PROVIDERS) {
      expect(DEFAULT_MODELS[provider].length).toBeGreaterThan(0);
    }
  });
});

describe("createModel", () => {
  it.each(SUPPORTED_PROVIDERS)("builds a model for %s without calling the network", (provider) => {
    const model = createModel(provider, "test-key");
    expect(model).toBeTruthy();
    expect(typeof model).toBe("object");
  });

  it("uses the developer-provided model id when given", () => {
    // createOpenAI returns a LanguageModel whose modelId is readable on some providers.
    const model = createModel("openai", "test-key", "gpt-4o-mini") as { modelId?: string };
    expect(model.modelId).toBe("gpt-4o-mini");
  });
});
