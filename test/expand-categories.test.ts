import { describe, expect, it } from "vitest";
import { expandCategories } from "../src/llm/expand-categories.js";

describe("expandCategories", () => {
  it("expands bank to bank and atm", () => {
    expect(expandCategories(["bank"], "banks near me")).toEqual(expect.arrayContaining(["bank", "atm"]));
  });

  it("adds bank types when the question says banc", () => {
    expect(expandCategories([], "banc near me")).toEqual(expect.arrayContaining(["bank", "atm"]));
  });

  it("maps farmasie and magasin", () => {
    expect(expandCategories([], "farmasie near me")).toContain("pharmacy");
    expect(expandCategories([], "magsain")).toEqual(expect.arrayContaining(["store", "supermarket"]));
  });

  it("maps Muslim prayer intent to mosque only", () => {
    const types = expandCategories(["church", "mosque"], "أنا مسلم و أريد أن أصلي أين يمكنني الذهاب");
    expect(types).toContain("mosque");
    expect(types).not.toContain("church");
  });

  it("keeps pharmacy unchanged", () => {
    expect(expandCategories(["pharmacy"], "looking for something")).toEqual(["pharmacy"]);
  });
});
