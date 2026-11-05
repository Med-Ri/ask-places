import { describe, expect, it } from "vitest";
import { parseRadiusFromQuestion } from "../src/parse-radius.js";

describe("parseRadiusFromQuestion", () => {
  it.each([
    ["restaurants within 500m", 500],
    ["restaurants within 500 m", 500],
    ["in a radius of 500m", 500],
    ["in a raduis of 500m", 500],
    ["cafés 1 km around me", 1_000],
    ["shops within 0.5km", 500],
    ["within 1 mile", 1_609],
  ])("parses %j → %d m", (question, meters) => {
    expect(parseRadiusFromQuestion(question)).toBe(meters);
  });

  it("returns null when no radius is mentioned", () => {
    expect(parseRadiusFromQuestion("cafés near Lac 2, Tunis")).toBeNull();
  });
});
