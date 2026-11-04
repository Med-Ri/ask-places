import { describe, expect, it } from "vitest";
import * as askplaces from "../src/index.js";

describe("public API", () => {
  it("exports exactly the intended runtime values", () => {
    expect(Object.keys(askplaces).sort()).toEqual([
      "AskPlacesError",
      "AskPlacesInternalError",
      "AskPlacesUsageError",
      "SUPPORTED_PROVIDERS",
    ]);
  });

  it("starts with OpenAI as the only provider", () => {
    expect(askplaces.SUPPORTED_PROVIDERS).toEqual(["openai"]);
  });
});
