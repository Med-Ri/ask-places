import { describe, expect, it } from "vitest";
import { normalizeQuestion } from "../src/normalize-question.js";

describe("normalizeQuestion", () => {
  it("trims spaces at both ends", () => {
    expect(normalizeQuestion("  cafés in Tunis  ")).toBe("cafés in Tunis");
  });

  it("collapses repeated whitespace, tabs and line breaks", () => {
    expect(normalizeQuestion("cafés\t near \n\n Lac 2")).toBe("cafés near Lac 2");
  });

  it("keeps non-Latin text unchanged", () => {
    expect(normalizeQuestion("مقهى في تونس")).toBe("مقهى في تونس");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeQuestion("   ")).toBe("");
  });
});
